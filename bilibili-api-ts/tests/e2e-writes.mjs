import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 真实写接口验证：会在账号上产生真实操作，默认关闭，必须同时满足
//   BILIBILI_E2E=1 BILIBILI_E2E_WRITE=1
// 并用 BILIBILI_E2E_BVID 指定目标视频。每一项写完立刻撤销，并核对最终状态。
//
// 红线：
// - 不投币、不三连（硬币花掉退不回来）
// - 不投稿、不改资料
// - 失败立即记录并继续下一项（保证已产生的写操作都会被撤销）

const require = createRequire(import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function credentialPath() {
  if (process.env.BILIBILI_CREDENTIAL_FILE) return process.env.BILIBILI_CREDENTIAL_FILE;
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "bilibili-skill", "bili_credential.json");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "bilibili-skill", "bili_credential.json");
}

function loadCredential(Credential) {
  const file = credentialPath();
  if (!existsSync(file)) throw new Error("找不到凭证文件：" + file);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return new Credential({
    sessdata: raw.sessdata || null,
    bili_jct: raw.bili_jct || null,
    buvid3: raw.buvid3 || null,
    dedeuserid: raw.dedeuserid || null,
  });
}

if (process.env.BILIBILI_E2E !== "1" || process.env.BILIBILI_E2E_WRITE !== "1") {
  process.stdout.write("跳过：写接口验证需要 BILIBILI_E2E=1 且 BILIBILI_E2E_WRITE=1\n");
  process.exit(0);
}

const BV = process.env.BILIBILI_E2E_BVID;
if (!BV) {
  process.stdout.write("跳过：需要 BILIBILI_E2E_BVID 指定要操作的视频（推荐自己的稿件或测试视频）\n");
  process.exit(0);
}

const {
  Credential,
  Video,
  Dynamic,
  BuildDynamic,
  send_dynamic,
  send_comment,
  Comment,
  CommentResourceType,
  get_self_info,
} = require("../dist/index.js");
const { Danmaku } = require("../dist/utils/danmaku.js");
const { get_video_favorite_list } = require("../dist/favorite_list.js");

const credential = loadCredential(Credential);
const me = await get_self_info(credential);
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  process.stdout.write((ok ? "通过：" : "失败：") + name + (detail ? "（" + detail + "）" : "") + "\n");
}
const brief = (value) => (value === undefined ? "undefined" : JSON.stringify(value).slice(0, 100));

const video = new Video({ bvid: BV, credential });
const info = await video.get_info();
const cid = info.cid;
process.stdout.write("目标视频：" + BV + "（aid=" + info.aid + "，UP=" + info.owner.mid + "，自己=" + me.mid + "）\n\n");

// 1) 点赞 -> 取消点赞
try {
  const before = await video.has_liked();
  let likeResult;
  if (!before) likeResult = await video.like(true);
  await sleep(1500);
  const afterLike = await video.has_liked();
  if (afterLike) await video.like(false);
  await sleep(1200);
  const finalLiked = await video.has_liked();
  record("点赞 → 取消点赞", finalLiked === before, "before=" + before + " 点赞后=" + afterLike + " 还原后=" + finalLiked + " like=" + brief(likeResult));
} catch (error) {
  record("点赞 → 取消点赞", false, String(error && error.message ? error.message : error).slice(0, 140));
}

// 2) 收藏 -> 取消收藏（用「我」的收藏夹，之前错误地用了 UP 的 mid，接口会返回空）
try {
  const folders = await get_video_favorite_list(me.mid, video, credential);
  const target = (folders && folders.list || []).find((item) => item.title === "默认收藏夹") || (folders && folders.list || [])[0];
  if (!target) {
    record("收藏 → 取消收藏", false, "没有可用收藏夹");
  } else {
    const before = await video.has_favoured();
    if (!before) await video.set_favorite([target.id], []);
    await sleep(1500);
    const afterFav = await video.has_favoured();
    if (afterFav) await video.set_favorite([], [target.id]);
    await sleep(1200);
    const finalFav = await video.has_favoured();
    record("收藏 → 取消收藏", finalFav === before, "folder=" + target.title + "(" + target.id + ") before=" + before + " 收藏后=" + afterFav + " 还原后=" + finalFav);
  }
} catch (error) {
  record("收藏 → 取消收藏", false, String(error && error.message ? error.message : error).slice(0, 140));
}

// 3) 发弹幕 -> 撤回（dmid 是 19 位，必须用 dmid_str，Number() 会丢精度）
try {
  const text = "连通性测试" + String(Date.now()).slice(-6);
  const dm = new Danmaku(text, { dm_time: 1, color: "ffffff", font_size: 25, mode: 1 });
  const sent = await video.send_danmaku({ cid, danmaku: dm });
  const dmid = sent && (sent.dmid_str || sent.dmid);
  if (!dmid) {
    record("发弹幕 → 撤回", false, "未拿到 dmid：" + brief(sent));
  } else {
    await sleep(1000);
    await video.recall_danmaku({ cid, dmid: String(dmid) });
    record("发弹幕 → 撤回", true, "dmid=" + String(dmid) + " text=" + text);
  }
} catch (error) {
  record("发弹幕 → 撤回", false, String(error && error.message ? error.message : error).slice(0, 140));
}

// 4) 发动态 -> 删除
try {
  const text = "连通性测试，稍后删除。" + new Date().toISOString();
  const sent = await send_dynamic(BuildDynamic.create_by_args({ text }), credential);
  const dynId = sent && (sent.dyn_id_str || sent.dyn_id || (sent.data && (sent.data.dyn_id_str || sent.data.dyn_id)));
  if (!dynId) {
    record("发动态 → 删除", false, "未拿到动态 ID：" + brief(sent));
  } else {
    await new Dynamic(String(dynId), credential).delete();
    record("发动态 → 删除", true, "dynamic_id=" + String(dynId));
  }
} catch (error) {
  record("发动态 → 删除", false, String(error && error.message ? error.message : error).slice(0, 140));
}

// 5) 发评论 -> 删除
try {
  const text = "连通性测试，稍后删除。" + new Date().toISOString();
  const sent = await send_comment({ oid: info.aid, type_: CommentResourceType.VIDEO, text, credential });
  const rpid = sent && (sent.rpid_str || sent.rpid);
  if (!rpid) {
    record("发评论 → 删除", false, "未拿到 rpid：" + brief(sent));
  } else {
    await new Comment(info.aid, CommentResourceType.VIDEO, rpid, credential).delete();
    record("发评论 → 删除", true, "rpid=" + String(rpid));
  }
} catch (error) {
  record("发评论 → 删除", false, String(error && error.message ? error.message : error).slice(0, 140));
}

// 收尾：核对账号没有留下痕迹
const finalLiked = await video.has_liked();
const finalFav = await video.has_favoured();
const finalCoins = await video.get_pay_coins();
process.stdout.write("\n账号状态复核：liked=" + finalLiked + " favoured=" + finalFav + " coins=" + finalCoins + "\n");

const failed = results.filter((item) => !item.ok);
process.stdout.write("完成 " + results.length + " 项，失败 " + failed.length + " 项\n");
if (failed.length || finalLiked || finalFav) process.exit(1);
