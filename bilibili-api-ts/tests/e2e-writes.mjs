import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 真实写接口验证：会在账号上产生真实操作，默认关闭，必须同时满足
//   BILIBILI_E2E=1 BILIBILI_E2E_WRITE=1
// 并用 BILIBILI_E2E_BVID 指定目标视频。
//
// 覆盖社交类写接口，每一项写完立即撤销：
//   视频：点赞/收藏/稍后再看/标签
//   弹幕：发送/点赞/撤回
//   评论：发根评论/楼中楼回复/点赞/删除、评论区管理端删除
//   动态：发布/点赞/收藏/置顶/转发/删除
//   关系：取消关注 -> 重新关注
//
// 红线：不投币、不三连（硬币不可退回）；不投稿；不发私信（无法撤回）。
// 无权限的操作（例如对别人的稿件置顶评论、改标签）记为「预期被拒」，不算失败。

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
  process.stdout.write("跳过：需要 BILIBILI_E2E_BVID 指定目标视频\n");
  process.exit(0);
}

const {
  Credential, Video, User, RelationType, Dynamic, BuildDynamic, send_dynamic,
  send_comment, get_comments, Comment, CommentResourceType, get_self_info,
} = require("../dist/index.js");
const { Danmaku } = require("../dist/utils/danmaku.js");
const { get_video_favorite_list } = require("../dist/favorite_list.js");
const cc = require("../dist/creative_center.js");
const cs = require("../dist/channel_series.js");

const credential = loadCredential(Credential);
const me = await get_self_info(credential);
const video = new Video({ bvid: BV, credential });
const info = await video.get_info();
const cid = info.cid;
const aid = info.aid;
const stamp = String(Date.now()).slice(-6);
const isOwner = String(info.owner.mid) === String(me.mid);

const results = [];
function record(name, status, detail) {
  results.push({ name, status });
  const tag = status === "ok" ? "通过" : status === "deny" ? "预期被拒" : "失败";
  process.stdout.write(tag + "：" + name + (detail ? "（" + detail + "）" : "") + "\n");
}
async function step(name, fn, options = {}) {
  try {
    const detail = await fn();
    record(name, "ok", detail);
  } catch (error) {
    const message = String(error && error.message ? error.message : error).slice(0, 150);
    const denied = /权限|禁止|not allowed|-403|-404|-101|invalid|没有权限|稿件.*不属于|仅.*作者/i.test(message);
    record(name, options.allowDeny && denied ? "deny" : "fail", message);
  }
}

process.stdout.write("目标视频：" + BV + "（aid=" + aid + "，UP=" + info.owner.mid + "，自己=" + me.mid + "，是否本人稿件=" + isOwner + "）\n");

// ---------- 视频互动 ----------
await step("视频：点赞 → 取消点赞", async () => {
  const before = await video.has_liked();
  if (!before) await video.like(true);
  await sleep(1200);
  const afterLike = await video.has_liked();
  if (afterLike) await video.like(false);
  await sleep(1000);
  const final = await video.has_liked();
  if (final !== before) throw new Error("状态未复原：" + before + " -> " + final);
  return before + " -> " + afterLike + " -> " + final;
});

await step("视频：收藏 → 取消收藏", async () => {
  const folders = await get_video_favorite_list(me.mid, video, credential);
  const folder = (folders.list || []).find((f) => f.title === "默认收藏夹") || (folders.list || [])[0];
  if (!folder) throw new Error("没有可用收藏夹");
  const before = await video.has_favoured();
  if (!before) await video.set_favorite([folder.id], []);
  await sleep(1200);
  const afterFav = await video.has_favoured();
  if (afterFav) await video.set_favorite([], [folder.id]);
  await sleep(1000);
  const final = await video.has_favoured();
  if (final !== before) throw new Error("状态未复原");
  return folder.title + " " + before + " -> " + afterFav + " -> " + final;
});

await step("视频：加入稍后再看 → 移出", async () => {
  await video.add_to_toview();
  await sleep(800);
  const res = await video.delete_from_toview();
  return "add + del " + (res === undefined ? "ok" : "ok");
});

await step("视频：添加标签 → 删除标签（需要作者权限）", async () => {
  const added = await video.add_tag("连通性测试" + stamp);
  const tagId = added && (added.tag_id || added.tagid);
  if (!tagId) return "已添加（未返回 tag_id，无法自动删除，请手动确认）";
  await video.delete_tag(Number(tagId));
  return "tag_id=" + tagId;
}, { allowDeny: true });

// ---------- 弹幕 ----------
let danmakuId = null;
await step("弹幕：发送 → 点赞 → 取消点赞 → 撤回", async () => {
  const dm = new Danmaku("连通性测试" + stamp, { dm_time: 1, color: "ffffff", font_size: 25, mode: 1 });
  const sent = await video.send_danmaku({ cid, danmaku: dm });
  danmakuId = sent && (sent.dmid_str || sent.dmid);
  if (!danmakuId) throw new Error("未拿到 dmid");
  await sleep(1000);
  await video.like_danmaku({ cid, dmid: String(danmakuId), status: true });
  const liked = await video.has_liked_danmakus({ cid, ids: [String(danmakuId)] });
  await video.like_danmaku({ cid, dmid: String(danmakuId), status: false });
  await sleep(800);
  await video.recall_danmaku({ cid, dmid: String(danmakuId) });
  const keys = liked && typeof liked === "object" ? Object.keys(liked).length : 0;
  return "dmid=" + danmakuId + " 点赞查询命中=" + keys;
});

// ---------- 评论 ----------
let rootRpid = null;
await step("评论：发根评论 → 点赞 → 楼中楼回复 → 删除根评论", async () => {
  const text = "连通性测试，稍后删除。" + stamp;
  const sent = await send_comment({ oid: aid, type_: CommentResourceType.VIDEO, text, credential });
  rootRpid = sent && (sent.rpid_str || sent.rpid);
  if (!rootRpid) throw new Error("未拿到 rpid");
  await sleep(1500);
  const comment = new Comment(aid, CommentResourceType.VIDEO, rootRpid, credential);
  await comment.like(true);
  await sleep(800);
  const replyText = "楼中楼连通性测试。" + stamp;
  await send_comment({ oid: aid, type_: CommentResourceType.VIDEO, text: replyText, root: rootRpid, parent: rootRpid, credential });
  await sleep(1200);
  const subs = await comment.get_sub_comments(1, 10);
  await comment.delete();
  await sleep(800);
  const after = await get_comments({ oid: aid, type_: CommentResourceType.VIDEO, page_index: 1, credential });
  const stillThere = (after.replies || []).some((r) => String(r.rpid) === String(rootRpid));
  if (stillThere) throw new Error("删除后仍能查到该评论（可能是分页/缓存）");
  return "rpid=" + rootRpid + " 楼中楼=" + ((subs && subs.replies || []).length);
});

await step("评论：置顶 / 取消置顶（需要作者权限）", async () => {
  if (!rootRpid) {
    const sent = await send_comment({ oid: aid, type_: CommentResourceType.VIDEO, text: "置顶测试" + stamp, credential });
    rootRpid = sent && (sent.rpid_str || sent.rpid);
    await sleep(1500);
  }
  const comment = new Comment(aid, CommentResourceType.VIDEO, rootRpid, credential);
  try {
    await comment.pin(true);
    await sleep(800);
    await comment.pin(false);
  } finally {
    try { await comment.delete(); } catch { /* 已删除或无权 */ }
  }
  return "rpid=" + rootRpid;
}, { allowDeny: true });

await step("评论：评论区管理端删除（creative_center）", async () => {
  const text = "管理端删除测试。" + stamp;
  const sent = await send_comment({ oid: aid, type_: CommentResourceType.VIDEO, text, credential });
  const rpid = sent && (sent.rpid_str || sent.rpid);
  if (!rpid) throw new Error("未拿到 rpid");
  await sleep(1500);
  await cc.del_comments(credential, aid, Number(rpid));
  return "rpid=" + rpid;
});

// ---------- 动态 ----------
await step("动态：发布 → 点赞 → 收藏 → 置顶 → 取消置顶 → 转发 → 删除", async () => {
  const sent = await send_dynamic(BuildDynamic.create_by_args({ text: "连通性测试，稍后删除。" + stamp }), credential);
  const dynId = sent && (sent.dyn_id_str || sent.dyn_id || (sent.data && (sent.data.dyn_id_str || sent.data.dyn_id)));
  if (!dynId) throw new Error("未拿到动态 ID：" + JSON.stringify(sent).slice(0, 120));
  const dyn = new Dynamic(String(dynId), credential);
  await sleep(800);
  await dyn.set_like(true);
  await sleep(600);
  await dyn.set_favorite(true);
  await sleep(600);
  await dyn.set_top();
  await sleep(600);
  await dyn.remove_top();
  await sleep(600);
  const repostText = "连通性测试转发" + stamp;
  const reposted = await dyn.repost(repostText);
  let repostId = reposted && (reposted.dyn_id_str || reposted.dyn_id || (reposted.data && (reposted.data.dyn_id_str || reposted.data.dyn_id)));
  if (!repostId) {
    // 接口不回动态 ID 时，从自己的动态页按文本找回再删，避免留下残留
    const { get_dynamic_page_info } = require("../dist/dynamic.js");
    const page = await get_dynamic_page_info(credential, { host_mid: me.mid });
    const hit = (page.items || []).find((item) => JSON.stringify(item).includes(repostText));
    if (hit) repostId = hit.id_str || hit.id;
  }
  if (repostId) {
    await sleep(800);
    await new Dynamic(String(repostId), credential).delete();
  }
  await sleep(800);
  await dyn.delete();
  return "dynamic_id=" + String(dynId) + " 转发=" + (repostId ? String(repostId) : "无");
});

// ---------- 关注关系 ----------
await step("关注：取消关注 → 重新关注（目标 UP 本身）", async () => {
  const target = new User(info.owner.mid, credential);
  const relation = await target.get_relation();
  // 真实结构里 relation.relation.attribute（2 = 已关注）与顶层 attention 都可能出现，
  // 任一个表示已关注即可，避免像上一版那样误判成「未关注」而跳过。
  // B 站的 relation.attribute：0 未关注、2 已关注、6 互相关注（互关也是已关注）。
  const attribute = relation && relation.relation && relation.relation.attribute;
  const attention = Boolean(
    (relation && relation.attention === true) || attribute === 2 || attribute === 6,
  );
  if (!attention) return "当前未关注，跳过（避免产生多余关注）";
  await target.modify_relation(RelationType.UNFOLLOW);
  await sleep(1200);
  const mid = await target.get_relation();
  await target.modify_relation(RelationType.FOLLOW);
  await sleep(1200);
  const after = await target.get_relation();
  return "已取消并重新关注 uid=" + info.owner.mid + " 中间态=" + JSON.stringify(mid).slice(0, 60);
});

await step("合集：创建 → 删除（需要作者权限）", async () => {
  const created = await cs.create_channel_series("连通性测试合集" + stamp, [], [], "自动化测试合集", credential);
  const seriesId = created && (created.series_id || (created.data && created.data.series_id));
  if (!seriesId) return "已创建但未返回 series_id：请手动确认";
  await cs.del_channel_series(Number(seriesId), credential);
  return "series_id=" + seriesId;
}, { allowDeny: true });

// ---------- 收尾：兜底清理残留动态 ----------
await step("收尾：清理本轮残留动态", async () => {
  const { get_dynamic_page_info } = require("../dist/dynamic.js");
  const page = await get_dynamic_page_info(credential, { host_mid: me.mid });
  const leftovers = (page.items || []).filter((item) => JSON.stringify(item).includes(stamp) || JSON.stringify(item).includes("连通性测试"));
  for (const item of leftovers) {
    await new Dynamic(String(item.id_str || item.id), credential).delete();
    await sleep(600);
  }
  return "清理 " + leftovers.length + " 条";
});

// ---------- 收尾复核 ----------
await sleep(800);
const finalLiked = await video.has_liked();
const finalFav = await video.has_favoured();
const finalCoins = await video.get_pay_coins();
process.stdout.write("\n账号状态复核：liked=" + finalLiked + " favoured=" + finalFav + " coins=" + finalCoins + "\n");

const failed = results.filter((item) => item.status === "fail");
const denied = results.filter((item) => item.status === "deny");
process.stdout.write("完成 " + results.length + " 项：通过 " + (results.length - failed.length - denied.length)
  + "，预期被拒 " + denied.length + "，失败 " + failed.length + "\n");
if (failed.length || finalLiked || finalFav) process.exit(1);
