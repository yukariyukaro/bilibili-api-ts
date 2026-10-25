import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 真实写接口验证：会在账号上产生真实操作，因此默认关闭，必须同时满足
//   BILIBILI_E2E=1 BILIBILI_E2E_WRITE=1
// 并且显式给出要操作的目标。每一项写完立刻撤销，最后核对撤销结果。
//
// 明确的红线：
// - 不投币、不三连（硬币花掉退不回来）
// - 不投稿、不改资料
// - 每一项只操作一次，失败立即停止，不做重试

const require = createRequire(import.meta.url);

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

const { Credential, Video, Dynamic, BuildDynamic, send_dynamic, send_comment, Comment, CommentResourceType } = require("../dist/index.js");

const credential = loadCredential(Credential);
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  process.stdout.write((ok ? "通过：" : "失败：") + name + (detail ? "（" + detail + "）" : "") + "\n");
}

const video = new Video({ bvid: BV, credential });
const info = await video.get_info();
const cid = info.cid;
process.stdout.write("目标视频：" + BV + "（aid=" + info.aid + "，UP=" + info.owner.mid + "）\n");

// 1) 点赞 -> 取消
let beforeLiked = null;
try {
  beforeLiked = await video.has_liked();
  const on = await video.like(true);
  const off = await video.like(false);
  const after = await video.has_liked();
  record("点赞 → 取消点赞", after === beforeLiked, "before=" + beforeLiked + " after=" + after + " on=" + (on && typeof on === "object" ? "ok" : on) + " off=" + (off && typeof off === "object" ? "ok" : off));
} catch (error) {
  record("点赞 → 取消点赞", false, String(error && error.message ? error.message : error).slice(0, 120));
}

// 2) 收藏 -> 取消（只动默认收藏夹；先记下原有状态）
try {
  const { get_video_favorite_list } = require("../dist/favorite_list.js");
  const folders = await get_video_favorite_list(info.owner.mid, video, credential);
  const target = folders && folders.list && folders.list[0];
  if (!target) {
    record("收藏 → 取消收藏", false, "没有可用收藏夹");
  } else {
    const had = await video.has_favoured();
    await video.set_favorite([target.id], []);
    await video.set_favorite([], [target.id]);
    const now = await video.has_favoured();
    record("收藏 → 取消收藏", now === had, "folder=" + target.title + " before=" + had + " after=" + now);
  }
} catch (error) {
  record("收藏 → 取消收藏", false, String(error && error.message ? error.message : error).slice(0, 120));
}

// 3) 发弹幕 -> 撤回
try {
  const { Danmaku } = require("../dist/utils/danmaku.js");
  const dm = new Danmaku("接口连通性测试，稍后撤回", { dm_time: 1, color: "ffffff", font_size: 25, mode: 1 });
  const sent = await video.send_danmaku({ cid, danmaku: dm });
  const dmid = sent && (sent.dmid || sent.dmid_str || (sent.data && sent.data.dmid));
  if (!dmid) {
    record("发弹幕 → 撤回", false, "未拿到 dmid：" + JSON.stringify(sent).slice(0, 120));
  } else {
    const recalled = await video.recall_danmaku({ cid, dmid: Number(dmid) });
    record("发弹幕 → 撤回", Boolean(recalled) || recalled === undefined, "dmid=" + dmid + " recall=" + JSON.stringify(recalled).slice(0, 80));
  }
} catch (error) {
  record("发弹幕 → 撤回", false, String(error && error.message ? error.message : error).slice(0, 120));
}

// 4) 发动态 -> 删除
try {
  const info_ = BuildDynamic.create_by_args({ text: "接口连通性测试，稍后删除。" + new Date().toISOString() });
  const sent = await send_dynamic(info_, credential);
  const dynId = sent && (sent.dyn_id_str || sent.dyn_id || (sent.data && (sent.data.dyn_id_str || sent.data.dyn_id)));
  if (!dynId) {
    record("发动态 → 删除", false, "未拿到动态 ID：" + JSON.stringify(sent).slice(0, 120));
  } else {
    const dyn = new Dynamic(dynId, credential);
    await dyn.delete();
    record("发动态 → 删除", true, "dynamic_id=" + dynId);
  }
} catch (error) {
  record("发动态 → 删除", false, String(error && error.message ? error.message : error).slice(0, 120));
}

// 5) 发评论 -> 删除
try {
  const text = "接口连通性测试，稍后删除。" + new Date().toISOString();
  const sent = await send_comment({ oid: info.aid, type_: CommentResourceType.VIDEO, text, credential });
  const rpid = sent && (sent.rpid || sent.rpid_str);
  if (!rpid) {
    record("发评论 → 删除", false, "未拿到 rpid：" + JSON.stringify(sent).slice(0, 120));
  } else {
    const comment = new Comment(info.aid, CommentResourceType.VIDEO, rpid, credential);
    await comment.delete();
    record("发评论 → 删除", true, "rpid=" + rpid);
  }
} catch (error) {
  record("发评论 → 删除", false, String(error && error.message ? error.message : error).slice(0, 120));
}

const failed = results.filter((item) => !item.ok);
process.stdout.write("\n完成 " + results.length + " 项，失败 " + failed.length + " 项\n");
if (failed.length) process.exit(1);
