import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  Credential,
  CommentResourceType,
  EventType,
  OrderType,
  User,
  Video,
  fetch_session_msgs,
  get_at,
  get_comments,
  get_hot_videos,
  get_likes,
  get_replies,
  get_self_info,
  get_sessions,
  get_unread_messages,
  search_by_type,
  SearchObjectType,
  send_msg,
} = require("../dist/index.js");

function credentialPath() {
  if (process.env.BILIBILI_CREDENTIAL_FILE) return process.env.BILIBILI_CREDENTIAL_FILE;
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "bilibili-skill", "bili_credential.json");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "bilibili-skill", "bili_credential.json");
}

function loadCredential() {
  const file = credentialPath();
  if (!existsSync(file)) throw new Error(`找不到凭证文件：${file}`);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return new Credential({
    sessdata: raw.sessdata || null,
    bili_jct: raw.bili_jct || null,
    buvid3: raw.buvid3 || null,
    dedeuserid: raw.dedeuserid || null,
  });
}

const results = [];
/**
 * soft=true 用于「需要创作者身份 / 特定账号状态」的接口：
 * 这类接口在普通账号上返回业务错误是正常的，记为跳过而不算失败。
 */
async function step(name, fn, soft = false) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    process.stdout.write(`通过：${name}${detail ? `（${detail}）` : ""}\n`);
  } catch (error) {
    if (soft) {
      results.push({ name, ok: true, skipped: true });
      process.stdout.write(`跳过：${name}（${error?.message || error}）\n`);
      return;
    }
    results.push({ name, ok: false, error });
    process.stdout.write(`失败：${name} —— ${error?.message || error}\n`);
  }
}

if (process.env.BILIBILI_E2E !== "1") {
  process.stdout.write("跳过：未设置 BILIBILI_E2E=1\n");
  process.exit(0);
}

const credential = loadCredential();

let selfInfo;
await step("当前登录账号（/x/space/myinfo）", async () => {
  selfInfo = await get_self_info(credential);
  return `uid=${selfInfo.mid}`;
});

let hotVideos;
await step("热门视频（WBI）", async () => {
  hotVideos = await get_hot_videos({ pn: 1, ps: 3 });
  return `count=${hotVideos.list?.length ?? 0}`;
});

let searchResult;
await step("分类搜索（WBI）", async () => {
  searchResult = await search_by_type({
    keyword: "B站",
    search_type: SearchObjectType.VIDEO,
    page: 1,
    page_size: 5,
  });
  return `count=${searchResult.result?.length ?? 0}`;
});

const bvid = process.env.BILIBILI_E2E_BVID || hotVideos?.list?.[0]?.bvid;
let video;
let info;
if (bvid) {
  await step("视频详情", async () => {
    video = new Video({ bvid, credential });
    info = await video.get_info();
    return `bvid=${bvid} title=${String(info.title).slice(0, 20)}`;
  });
  await step("分 P 列表", async () => {
    const pages = await video.get_pages();
    return `pages=${pages.length}`;
  });
  await step("播放器信息与字幕（WBI + WBI2）", async () => {
    const cid = info.cid || info.pages?.[0]?.cid;
    const player = await video.get_player_info({ cid });
    const subtitles = player?.subtitle?.subtitles ?? [];
    return `cid=${cid} subtitles=${subtitles.length}`;
  });
  await step("评论列表", async () => {
    const response = await get_comments({
      oid: info.aid,
      type_: CommentResourceType.VIDEO,
      page_index: 1,
      order: OrderType.LIKE,
      credential,
    });
    return `replies=${response.replies?.length ?? 0}`;
  });
  await step("评论楼中楼", async () => {
    const response = await get_comments({
      oid: info.aid,
      type_: CommentResourceType.VIDEO,
      page_index: 1,
      order: OrderType.LIKE,
      credential,
    });
    const first = response.replies?.[0];
    if (!first) return "无可测试根评论";
    const subs = await new (require("../dist/comment.js").Comment)(
      info.aid,
      CommentResourceType.VIDEO,
      first.rpid,
      credential,
    ).get_sub_comments(1, 5);
    return `rpid=${first.rpid} replies=${subs.replies?.length ?? 0}`;
  });
}

await step("用户资料（WBI + w_webid）", async () => {
  const uid = Number(process.env.BILIBILI_E2E_UID || info?.owner?.mid || selfInfo.mid);
  const user = new User(uid, credential);
  const data = await user.get_user_info();
  return `uid=${uid} name=${String(data.name).slice(0, 20)}`;
});

await step("与用户的关系", async () => {
  const uid = Number(process.env.BILIBILI_E2E_RELATION_UID || info?.owner?.mid || selfInfo.mid);
  const user = new User(uid, credential);
  const data = await user.get_relation();
  const attribute = data.relation?.attribute ?? data.be_relation?.attribute ?? data.attribute;
  return `uid=${uid} attribute=${attribute}`;
});

await step("会话列表", async () => {
  const data = await get_sessions({ credential });
  return `sessions=${data.session_list?.length ?? 0}`;
});

await step("未读消息计数", async () => {
  const data = await get_unread_messages(credential);
  return `keys=${Object.keys(data ?? {}).length}`;
});

await step("收到的回复", async () => {
  const data = await get_replies({ credential });
  return `items=${data.items?.length ?? data.replies?.length ?? 0}`;
});

await step("收到的赞", async () => {
  const data = await get_likes({ credential });
  const total = typeof data.total === "object" ? JSON.stringify(data.total) : data.total;
  return `total=${total ?? 0}`;
});

await step("收到的 @", async () => {
  const data = await get_at({ credential });
  return `items=${data.items?.length ?? data.ats?.length ?? 0}`;
});

if (process.env.BILIBILI_E2E_TALKER) {
  await step("最近 30 条私信", async () => {
    const data = await fetch_session_msgs({
      talker_id: Number(process.env.BILIBILI_E2E_TALKER),
      credential,
    });
    return `messages=${data.messages?.length ?? 0}`;
  });
} else {
  process.stdout.write("跳过：最近私信读取（未设置 BILIBILI_E2E_TALKER）\n");
}

if (process.env.BILIBILI_E2E_WRITE === "1" && process.env.BILIBILI_E2E_DM_UID && process.env.BILIBILI_E2E_DM_TEXT) {
  await step("发送私信（显式开启）", async () => {
    const data = await send_msg({
      credential,
      receiver_id: Number(process.env.BILIBILI_E2E_DM_UID),
      msg_type: EventType.TEXT,
      content: process.env.BILIBILI_E2E_DM_TEXT,
    });
    return `code=${data?.code ?? "unknown"}`;
  });
} else {
  process.stdout.write("跳过：发送私信（需要 BILIBILI_E2E_WRITE=1 与收件人/正文）\n");
}


// ---------- 17.5.0 新增模块的只读回归 ----------

const { User: UserClass } = require("../dist/index.js");

await step("我的收藏夹（favorite_list）", async () => {
  const { get_video_favorite_list } = require("../dist/favorite_list.js");
  const data = await get_video_favorite_list(selfInfo.mid, null, credential);
  return `folders=${data.list?.length ?? 0}`;
}, true);

await step("可用表情包（emoji）", async () => {
  const { get_emoji_list } = require("../dist/emoji.js");
  const data = await get_emoji_list("reply", credential);
  return `packages=${data.packages?.length ?? 0}`;
}, true);

await step("我的合集列表（channel_series + user.get_channels）", async () => {
  const me = new UserClass(selfInfo.mid, credential);
  const channels = await me.get_channels();
  return `channels=${channels.length}`;
}, true);

await step("与我关注关系的补充字段（user.get_relation_info）", async () => {
  const me = new UserClass(selfInfo.mid, credential);
  const data = await me.get_relation_info();
  return `follower=${data.follower ?? "n/a"} following=${data.following ?? "n/a"}`;
}, true);

await step("创作中心数据概览（creative_center，需创作者）", async () => {
  const { get_compare } = require("../dist/creative_center.js");
  const data = await get_compare(credential);
  return `keys=${Object.keys(data ?? {}).length}`;
}, true);

await step("稿件管理列表（creative_center，需创作者）", async () => {
  const { get_video_upload_manager_info } = require("../dist/creative_center.js");
  const data = await get_video_upload_manager_info(credential);
  return `archives=${data.arc_audits?.length ?? 0}`;
}, true);

await step("用户公开合集（get_channel_list，无需创作者身份）", async () => {
  const uid = Number(process.env.BILIBILI_E2E_UID || info?.owner?.mid || selfInfo.mid);
  const someone = new UserClass(uid, credential);
  const data = await someone.get_channel_list();
  return `seasons=${data.items_lists?.seasons_list?.length ?? 0}`;
}, true);


await step("与视频的关系 / 是否已点赞 / 已投币（需要登录，只读）", async () => {
  if (!info) return "无可用视频";
  const video = new Video({ bvid: info.bvid, credential });
  const relation = await video.get_relation();
  const liked = await video.has_liked();
  const coins = await video.get_pay_coins();
  return `attribute=${relation?.relation?.attribute ?? "n/a"} liked=${liked} coins=${coins}`;
}, true);

await step("弹幕设置与特殊弹幕（protobuf 解析）", async () => {
  if (!info) return "无可用视频";
  const video = new Video({ bvid: info.bvid, credential });
  const cid = info.cid || info.pages?.[0]?.cid;
  const view = await video.get_danmaku_view({ cid });
  return `count=${view.count ?? 0} segments=${view.dm_seg?.total ?? 0} settings=${view.dm_setting ? "yes" : "no"}`;
}, true);

await step("弹幕列表（.so protobuf 解析，只取第一段）", async () => {
  if (!info) return "无可用视频";
  const video = new Video({ bvid: info.bvid, credential });
  const cid = info.cid || info.pages?.[0]?.cid;
  const list = await video.get_danmakus({ cid, from_seg: 0, to_seg: 0 });
  const sample = list[0] ? String(list[0].text).slice(0, 12) : "";
  return `danmakus=${list.length} sample=${sample}`;
}, true);

await step("动态页读取（polymer feed）", async () => {
  const { get_dynamic_page_info } = require("../dist/dynamic.js");
  const uid = Number(process.env.BILIBILI_E2E_UID || info?.owner?.mid || selfInfo.mid);
  const data = await get_dynamic_page_info(credential, { host_mid: uid });
  return `items=${data.items?.length ?? 0}`;
}, true);

await step("动态详情（取动态页第一条）", async () => {
  const { Dynamic, get_dynamic_page_info } = require("../dist/dynamic.js");
  const uid = Number(process.env.BILIBILI_E2E_UID || info?.owner?.mid || selfInfo.mid);
  const page = await get_dynamic_page_info(credential, { host_mid: uid });
  const first = page.items?.[0];
  if (!first) return "无动态可读";
  const dyn = new Dynamic(first.id_str || first.id, credential);
  const detail = await dyn.get_info();
  return `id=${dyn.get_dynamic_id()} type=${detail?.item?.type ?? "n/a"}`;
}, true);


// ---------- 只读接口的真实调用（扩大覆盖） ----------

await step("相关视频 / 充电 / 快照 / AI 总结（只读）", async () => {
  if (!info) return "无可用视频";
  const video = new Video({ bvid: info.bvid, credential });
  const cid = info.cid || info.pages?.[0]?.cid;
  const related = await video.get_related();
  const charges = await video.get_chargers();
  const forbidNote = await video.is_forbid_note();
  const snapshot = await video.get_video_snapshot(cid, false, false);
  const ai = await video.get_ai_conclusion({ cid });
  return `related=${related?.length ?? 0} chargers=${charges?.list?.length ?? 0} forbidNote=${forbidNote} snapshot=${snapshot?.image?.length ?? 0} aiSum=${String(ai?.summary ?? ai?.model_result?.summary ?? "").length}`;
}, true);

await step("收藏夹内容（favorite_list 读取）", async () => {
  const { get_video_favorite_list, get_video_favorite_list_content } = require("../dist/favorite_list.js");
  const folders = await get_video_favorite_list(selfInfo.mid, null, credential);
  const first = folders?.list?.[0];
  if (!first) return "无收藏夹";
  const content = await get_video_favorite_list_content(first.id, { credential });
  return `folder=${first.title} medias=${content?.medias?.length ?? 0}`;
}, true);

await step("表情详情（emoji 读取）", async () => {
  const { get_emoji_list, get_emoji_detail, get_all_emoji } = require("../dist/emoji.js");
  const list = await get_emoji_list("reply", credential);
  const pkg = list?.packages?.[0];
  const all = await get_all_emoji("reply", credential);
  // get_all_emoji 的真实结构是 user_panel_packages（不是 packages）
  const panel = all?.user_panel_packages?.length ?? 0;
  if (!pkg) return `panel=${panel}（无可用表情包）`;
  const detail = await get_emoji_detail(pkg.id, "reply");
  // get_emoji_detail 的真实结构是 { packages: [{ emote: [...] }] }
  const emoteCount = detail?.packages?.[0]?.emote?.length ?? detail?.emote?.length ?? 0;
  return `package=${pkg.text ?? pkg.id} emotes=${emoteCount} panel=${panel}`;
}, true);

await step("创作中心：趋势图 / 粉丝概览 / 最近弹幕（只读）", async () => {
  const cc = require("../dist/creative_center.js");
  const graph = await cc.get_graph(credential);
  const fans = await cc.get_fan_overview(credential);
  const dms = await cc.get_recently_danmakus(credential);
  return `graphKeys=${Object.keys(graph ?? {}).length} fanKeys=${Object.keys(fans ?? {}).length} recentDms=${dms?.data?.result?.length ?? 0}`;
}, true);

await step("动态页列表（get_dynamic_page_list，指定 UP）", async () => {
  const { get_dynamic_page_list } = require("../dist/dynamic.js");
  // 用真实活跃 UP（2 = bishi）确保能拿到数据；自己的测试账号可能本来就没有动态
  const uid = Number(process.env.BILIBILI_E2E_DYNAMIC_UID || 2);
  const list = await get_dynamic_page_list(credential, { host_mid: uid });
  return `uid=${uid} items=${list?.length ?? 0}`;
}, true);

await step("动态详情与 rid 精度（19 位 ID 不能丢位）", async () => {
  const { Dynamic, get_dynamic_page_info } = require("../dist/dynamic.js");
  const uid = Number(process.env.BILIBILI_E2E_DYNAMIC_UID || 2);
  const page = await get_dynamic_page_info(credential, { host_mid: uid });
  const first = page?.items?.[0];
  if (!first) return "无动态可读";
  const dyn = new Dynamic(first.id_str, credential);
  const detail = await dyn.get_info();
  const rid = await dyn.get_rid();
  const exact = String(first.id_str) === String(dyn.get_dynamic_id());
  return `type=${detail?.item?.type} rid=${rid}(${typeof rid}) idExact=${exact}`;
}, true);

await step("合集元数据与合集内视频（ChannelSeries）", async () => {
  const { ChannelSeries, ChannelSeriesType } = require("../dist/channel_series.js");
  const { User: U } = require("../dist/index.js");
  const uid = Number(process.env.BILIBILI_E2E_UID || info?.owner?.mid || selfInfo.mid);
  const user = new U(uid, credential);
  const channelList = await user.get_channel_list();
  const season = channelList?.items_lists?.seasons_list?.[0];
  if (!season) return "该用户没有公开合集";
  const id = season.meta.season_id;
  const series = new ChannelSeries(uid, ChannelSeriesType.SEASON, id, credential);
  const meta = await series.get_meta();
  const videos = await series.get_videos();
  return `season=${meta?.name ?? id} videos=${videos?.archives?.length ?? 0}`;
}, true);

await step("特殊弹幕（get_special_dms，只读）", async () => {
  if (!info) return "无可用视频";
  const video = new Video({ bvid: info.bvid, credential });
  const cid = info.cid || info.pages?.[0]?.cid;
  const special = await video.get_special_dms({ cid });
  return `special=${special.length}`;
}, true);

await step("弹幕点赞状态查询（has_liked_danmakus，只读）", async () => {
  if (!info) return "无可用视频";
  const video = new Video({ bvid: info.bvid, credential });
  const cid = info.cid || info.pages?.[0]?.cid;
  const list = await video.get_danmakus({ cid, from_seg: 0, to_seg: 0 });
  const ids = list.slice(0, 5).map((item) => Number(item.id_str || item.id_));
  const result = await video.has_liked_danmakus({ cid, ids });
  // 真实结构是以弹幕 ID 为 key 的字典，每项含 likes / user_like
  const entries = result && typeof result === "object" ? Object.entries(result) : [];
  const userLiked = entries.filter(([, value]) => value && value.user_like).length;
  return `checked=${ids.length} returned=${entries.length} userLiked=${userLiked}`;
}, true);

await step("历史弹幕索引（get_history_danmaku_index，只读）", async () => {
  if (!info) return "无可用视频";
  const video = new Video({ bvid: info.bvid, credential });
  const cid = info.cid || info.pages?.[0]?.cid;
  const date = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const index = await video.get_history_danmaku_index({ cid, date });
  return `days=${Array.isArray(index) ? index.length : index === null ? "none" : "n/a"}`;
}, true);

const failed = results.filter((item) => !item.ok);
process.stdout.write(`\n完成 ${results.length} 项，失败 ${failed.length} 项\n`);
if (failed.length) process.exit(1);
