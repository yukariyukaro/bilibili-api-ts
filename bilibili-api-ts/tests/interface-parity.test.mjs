import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { apiData } = require("../dist/data/api/index.js");

const expected = [
  ["search", "search.web_search", "https://api.bilibili.com/x/web-interface/wbi/search/all/v2", "GET"],
  ["search", "search.web_search_by_type", "https://api.bilibili.com/x/web-interface/wbi/search/type", "GET"],
  ["video", "info.info", "https://api.bilibili.com/x/web-interface/view", "GET"],
  ["video", "info.pages", "https://api.bilibili.com/x/player/pagelist", "GET"],
  ["video", "info.get_player_info", "https://api.bilibili.com/x/player/wbi/v2", "GET"],
  ["common", "comment.get", "https://api.bilibili.com/x/v2/reply", "GET"],
  ["common", "comment.send", "https://api.bilibili.com/x/v2/reply/add", "POST"],
  ["common", "comment.del", "https://api.bilibili.com/x/v2/reply/del", "POST"],
  ["common", "comment.sub_reply", "https://api.bilibili.com/x/v2/reply/reply", "GET"],
  ["user", "info.info", "https://api.bilibili.com/x/space/wbi/acc/info", "GET"],
  ["user", "info.relation", "https://api.bilibili.com/x/space/wbi/acc/relation", "GET"],
  ["user", "info.my_info", "https://api.bilibili.com/x/space/myinfo", "GET"],
  ["session", "session.fetch", "https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs", "GET"],
  ["session", "operate.send_msg", "https://api.vc.bilibili.com/web_im/v1/web_im/send_msg", "POST"],
  ["rank", "info.hot", "https://api.bilibili.com/x/web-interface/popular", "GET"],
];

test("核心接口 URL / 方法与 Python 数据层一致", () => {
  for (const [file, path, url, method] of expected) {
    const node = path.split(".").reduce((value, key) => value[key], apiData[file]);
    assert.equal(node.url, url, `${file}:${path} url`);
    assert.equal(String(node.method).toUpperCase(), method, `${file}:${path} method`);
  }
});

test("搜索模块按 Python 代码显式开启 WBI", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/search.ts", import.meta.url), "utf8"));
  assert.equal((source.match(/wbi:\s*true/g) || []).length, 2);
});

test("私信发送使用 Python 相同的 submit 字段名与类型", () => {
  const send = apiData.session.operate.send_msg;
  assert.equal(send.method, "POST");
  assert.equal(send.verify, true);
  assert.equal(send.wbi, true);
  assert.ok(Object.hasOwn(send.data, "msg[sender_uid]"));
  assert.ok(Object.hasOwn(send.data, "msg[receiver_id]"));
  assert.ok(Object.hasOwn(send.data, "msg[content]"));
});

test("API 数据覆盖全部 43 个 Python 数据文件", () => {
  assert.equal(Object.keys(apiData).length, 43);
});

test("rank 模块导出与 Python 公开函数一致", () => {
  const rank = require("../dist/rank.js");
  for (const name of [
    "get_rank",
    "get_music_rank_list",
    "get_music_rank_weekly_detail",
    "get_music_rank_weekly_musics",
    "get_vip_rank",
    "get_manga_rank",
    "get_live_hot_rank",
    "get_live_sailing_rank",
    "get_live_energy_user_rank",
  ]) {
    assert.equal(typeof rank[name], "function", name);
  }
});

test("homepage 模块导出与 Python 公开函数一致", () => {
  const homepage = require("../dist/homepage.js");
  for (const name of [
    "get_top_photo",
    "get_links",
    "get_popularize",
    "get_videos",
    "get_favorite_list_and_toview",
    "get_favorite_list_content",
  ]) {
    assert.equal(typeof homepage[name], "function", name);
  }
});

test("video_tag 模块导出与 Python 类方法一致", () => {
  const { Tag } = require("../dist/video_tag.js");
  for (const name of [
    "get_tag_id",
    "get_tag_name",
    "get_tag_info",
    "get_similar_tags",
    "subscribe_tag",
    "unsubscribe_tag",
  ]) {
    assert.equal(typeof Tag.prototype[name], "function", name);
  }
});

test("rank 接口 URL 与 Python 数据层一致", () => {
  assert.equal(apiData.rank.info.v2_ranking.url, "https://api.bilibili.com/x/web-interface/ranking/v2");
  assert.equal(apiData.rank.info.pgc_ranking.url, "https://api.bilibili.com/pgc/web/rank/list");
  assert.equal(apiData.rank.info.live_energy_user_rank.url, "https://api.live.bilibili.com/xlive/general-interface/v1/rank/getFeedingMonthlyRankEnergy");
  assert.equal(apiData.video_tag.info.tag_info.url, "https://api.bilibili.com/x/tag/info");
  assert.equal(apiData.homepage.info.videos.url, "https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd");
});
