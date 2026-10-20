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
async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    process.stdout.write(`通过：${name}${detail ? `（${detail}）` : ""}\n`);
  } catch (error) {
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

const failed = results.filter((item) => !item.ok);
process.stdout.write(`\n完成 ${results.length} 项，失败 ${failed.length} 项\n`);
if (failed.length) process.exit(1);
