import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

import { installFetchStub, stubCredential } from "./helpers/fetch-stub.mjs";

const require = createRequire(import.meta.url);

// 这些测试不访问 B 站：fetch 被替换成探针，只断言「真正会发出的请求」的
// URL、method、关键字段与 CSRF，从而在离线环境证明接口接线正确。

async function withStub(fn, responder) {
  const stub = installFetchStub(responder);
  try {
    const { Credential } = require("../dist/index.js");
    const credential = await stubCredential(Credential);
    return await fn({ stub, credential, Credential });
  } finally {
    stub.uninstall();
  }
}

function assertPost(request, url) {
  assert.ok(request, "应当发出请求");
  assert.equal(request.url.split("?")[0], url);
  assert.equal(request.method, "POST");
}

/** 与 Python 一致：verify=True 的写接口才会自动注入 csrf / csrf_token。 */
function assertCsrf(request) {
  assert.equal(request.body.fields.csrf, "stub-bili-jct", "写操作必须带 csrf");
  assert.equal(request.body.fields.csrf_token, "stub-bili-jct", "写操作必须带 csrf_token");
}

function assertWriteRequest(request, url) {
  assertPost(request, url);
  assertCsrf(request);
}

// ---------- 收藏夹 ----------

test("收藏夹：新建收藏夹的请求形态与 Python 一致", async () => {
  const { getApi } = require("../dist/index.js");
  const favoriteList = require("../dist/favorite_list.js");
  await withStub(async ({ stub, credential }) => {
    await favoriteList.create_video_favorite_list("我的收藏", "简介", true, credential);
    const request = stub.last("/x/v3/fav/folder/add");
    assertWriteRequest(request, "https://api.bilibili.com/x/v3/fav/folder/add");
    // Python 的字段名是 intro（不是 introduction），并且固定带空 cover
    assert.equal(request.body.fields.title, "我的收藏");
    assert.equal(request.body.fields.intro, "简介");
    assert.equal(request.body.fields.privacy, "1");
    assert.equal(request.body.fields.cover, "");
  });
});

test("收藏夹：删除、复制、移动、清理都打到 Python 对应端点", async () => {
  const favoriteList = require("../dist/favorite_list.js");
  await withStub(async ({ stub, credential }) => {
    await favoriteList.delete_video_favorite_list([1, 2], credential);
    assertWriteRequest(stub.last("/x/v3/fav/folder/del"), "https://api.bilibili.com/x/v3/fav/folder/del");

    await favoriteList.copy_video_favorite_list_content(1, 2, [3, 4], credential);
    assertWriteRequest(stub.last("/x/v3/fav/resource/copy"), "https://api.bilibili.com/x/v3/fav/resource/copy");

    await favoriteList.move_video_favorite_list_content(1, 2, [3], credential);
    assertWriteRequest(stub.last("/x/v3/fav/resource/move"), "https://api.bilibili.com/x/v3/fav/resource/move");

    await favoriteList.delete_video_favorite_list_content(1, [3], credential);
    assertWriteRequest(stub.last("/x/v3/fav/resource/batch-del"), "https://api.bilibili.com/x/v3/fav/resource/batch-del");

    await favoriteList.clean_video_favorite_list_content(1, credential);
    assertWriteRequest(stub.last("/x/v3/fav/resource/clean"), "https://api.bilibili.com/x/v3/fav/resource/clean");
  });
});

test("收藏夹：列表读取走 GET 且不需要 CSRF", async () => {
  const favoriteList = require("../dist/favorite_list.js");
  await withStub(async ({ stub, credential }) => {
    await favoriteList.get_video_favorite_list(10001, null, credential);
    const request = stub.last("/x/v3/fav/folder/created/list-all");
    assert.equal(request.method, "GET");
    assert.ok(request.url.includes("up_mid=10001"));
  });
});

// ---------- 表情 ----------

test("表情：列表与添加表情的端点", async () => {
  const emoji = require("../dist/emoji.js");
  await withStub(async ({ stub, credential }) => {
    await emoji.get_emoji_list("reply", credential);
    assert.equal(stub.last("/x/emote/user/panel/web").method, "GET");

    await emoji.add_emoji(1234, credential);
    assertWriteRequest(stub.last("/x/emote/package/add"), "https://api.bilibili.com/x/emote/package/add");
  });
});

// ---------- 创作中心 ----------

test("创作中心：数据概览与稿件管理端点", async () => {
  const cc = require("../dist/creative_center.js");
  await withStub(async ({ stub, credential }) => {
    await cc.get_compare(credential);
    assert.equal(stub.last("/x/web/data/v2/overview/compare").method, "GET");

    await cc.get_video_upload_manager_info(credential);
    assert.equal(stub.last("/x/web/archives").method, "GET");

    await cc.get_recently_danmakus(credential);
    assert.equal(stub.last("/x/v2/dm/recent").method, "GET");

    await cc.del_comments(credential, 1, 2);
    assertWriteRequest(stub.last("/x/v2/reply/del"), "https://api.bilibili.com/x/v2/reply/del");
  });
});

test("创作中心：单稿章节与改稿历史用 Video 的 aid/bvid", async () => {
  const cc = require("../dist/creative_center.js");
  await withStub(async ({ stub, credential }) => {
    const fakeVideo = { get_aid: () => 123, get_bvid: () => "BV1xx411c7mD", credential };
    await cc.get_archive_parts(fakeVideo);
    assert.equal(stub.last("/x/web/archive/parts").method, "GET");
    await cc.get_archive_edits(fakeVideo);
    assert.equal(stub.last("/x/web/archive/history/list").method, "GET");
  });
});

// ---------- 合集 ----------

test("合集：订阅/取消订阅合集", async () => {
  const cs = require("../dist/channel_series.js");
  await withStub(async ({ stub, credential }) => {
    // 注意：Python 该接口的数据层没有 verify=True，因此不会自动注入 csrf（移植保持一致）。
    await cs.set_follow_channel_season(42, true, credential);
    const fav = stub.last("/x/v3/fav/season/fav");
    assertPost(fav, "https://api.bilibili.com/x/v3/fav/season/fav");
    assert.equal(fav.body.fields.season_id, "42");

    await cs.set_follow_channel_season(42, false, credential);
    assertPost(stub.last("/x/v3/fav/season/unfav"), "https://api.bilibili.com/x/v3/fav/season/unfav");
  });
});

test("合集：创建、增删视频", async () => {
  const cs = require("../dist/channel_series.js");
  await withStub(async ({ stub, credential }) => {
    await cs.create_channel_series("系列", [1, 2], ["kw"], "描述", credential);
    assertWriteRequest(stub.last("/x/series/series/createAndAddArchives"), "https://api.bilibili.com/x/series/series/createAndAddArchives");

    await cs.add_aids_to_series(42, [1], credential);
    assertWriteRequest(stub.last("/x/series/series/addArchives"), "https://api.bilibili.com/x/series/series/addArchives");

    await cs.del_aids_from_series(42, [1], credential);
    assertWriteRequest(stub.last("/x/series/series/delArchives"), "https://api.bilibili.com/x/series/series/delArchives");
  });
});

test("合集：拉取用户合集列表与合集内视频（含 WBI）", async () => {
  const { User } = require("../dist/index.js");
  await withStub(async ({ stub, credential }) => {
    const user = new User(10001, credential);
    await user.get_channel_list();
    assert.equal(stub.last("/x/polymer/web-space/seasons_series_list").method, "GET");

    await user.get_channel_videos_season(42);
    assert.equal(stub.last("/x/polymer/web-space/seasons_archives_list").method, "GET");

    await user.get_channel_videos_series(42);
    assert.equal(stub.last("/x/series/archives").method, "GET");
  });
});


// ---------- 视频互动（点赞 / 投币 / 分享 / 三连 / 收藏 / 标签 / 稍后再看） ----------

test("视频互动：like / pay_coin / share / triple / set_favorite / add_tag / toview", async () => {
  const { Video } = require("../dist/index.js");
  await withStub(async ({ stub, credential }) => {
    const video = new Video({ bvid: "BV1xx411c7mD", credential });

    await video.like(true);
    const like = stub.last("/x/web-interface/archive/like");
    assertWriteRequest(like, "https://api.bilibili.com/x/web-interface/archive/like");
    assert.equal(like.body.fields.like, "1", "点赞传 1，取消传 2");

    await video.pay_coin(2, true);
    const coin = stub.last("/x/web-interface/coin/add");
    assertWriteRequest(coin, "https://api.bilibili.com/x/web-interface/coin/add");
    assert.equal(coin.body.fields.multiply, "2");
    assert.equal(coin.body.fields.like, "1");

    await video.share();
    assertWriteRequest(stub.last("/x/web-interface/share/add"), "https://api.bilibili.com/x/web-interface/share/add");

    await video.triple();
    assertWriteRequest(
      stub.last("/x/web-interface/archive/like/triple"),
      "https://api.bilibili.com/x/web-interface/archive/like/triple",
    );

    await video.set_favorite([11], [22]);
    const fav = stub.last("/x/v3/fav/resource/deal");
    assertWriteRequest(fav, "https://api.bilibili.com/x/v3/fav/resource/deal");
    assert.equal(fav.body.fields.type, "2");
    assert.equal(fav.body.fields.add_media_ids, "11");
    assert.equal(fav.body.fields.del_media_ids, "22");

    await video.add_tag("测试标签");
    assertWriteRequest(stub.last("/x/tag/archive/add"), "https://api.bilibili.com/x/tag/archive/add");

    await video.add_to_toview();
    assertWriteRequest(stub.last("/x/v2/history/toview/add"), "https://api.bilibili.com/x/v2/history/toview/add");
  });
});

test("视频互动：投币数量非法时在本地报错，不发请求", async () => {
  const { Video } = require("../dist/index.js");
  await withStub(async ({ stub, credential }) => {
    const video = new Video({ bvid: "BV1xx411c7mD", credential });
    await assert.rejects(() => video.pay_coin(3), /1 ~ 2/);
    assert.equal(stub.requests.length, 0);
  });
});

// ---------- 动态 ----------

test("动态：上传图片走 multipart 且字段名为 file_up", async () => {
  const { Picture, Credential } = require("../dist/index.js");
  const { upload_image } = require("../dist/dynamic.js");
  const { samplePngBuffer } = await import("./helpers/fetch-stub.mjs");
  await withStub(async ({ stub, credential }) => {
    const picture = Picture.from_content(samplePngBuffer(), "png");
    await upload_image(picture, credential);
    const request = stub.last("/x/dynamic/feed/draw/upload_bfs");
    assertPost(request, "https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs");
    assert.equal(request.body.kind, "multipart");
    assert.equal(request.body.files.length, 1);
    assert.equal(request.body.files[0].field, "file_up");
    assert.equal(request.body.files[0].type, "image/png");
    assert.equal(request.body.fields.biz, "new_dyn");
    assert.equal(request.body.fields.csrf, "stub-bili-jct");
  });
});

test("动态：纯文字动态走 instant 接口并带正文", async () => {
  const { BuildDynamic, send_dynamic } = require("../dist/dynamic.js");
  await withStub(async ({ stub, credential }) => {
    const info = BuildDynamic.empty().add_plain_text("hello from ts");
    await send_dynamic(info, credential);
    const request = stub.last(/dynamic/);
    assert.equal(request.method, "POST");
    assert.ok(request.body.raw.includes("hello"), "请求体应包含动态正文");
  });
});

test("动态：删除与点赞命中 operate 端点", async () => {
  const { Dynamic } = require("../dist/dynamic.js");
  await withStub(async ({ stub, credential }) => {
    const dyn = new Dynamic(1234567890, credential);
    await dyn.delete();
    assertWriteRequest(stub.last("/dynamic_svr/rm_dynamic"), "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/rm_dynamic");

    await dyn.set_like(true);
    assertPost(stub.last("/dynamic_like/thumb"), "https://api.vc.bilibili.com/dynamic_like/v1/dynamic_like/thumb");
  });
});

// ---------- 投稿 ----------

test("投稿：封面、分区话题、活动列表的端点", async () => {
  const { Picture } = require("../dist/index.js");
  const { upload_cover, get_available_topics, get_missions } = require("../dist/video_uploader.js");
  const { samplePngBuffer } = await import("./helpers/fetch-stub.mjs");
  await withStub(async ({ stub, credential }) => {
    await get_available_topics(160, credential);
    assert.equal(stub.last("/x/vupre/web/topic/type").method, "GET");

    await get_missions();
    assert.equal(stub.last("/x/vupre/app/h5/mission/type/all").method, "GET");

    // 默认走 data URI 表单，不产生 multipart
    await upload_cover(Picture.from_content(samplePngBuffer(), "png"), credential);
    const cover = stub.last("/x/vu/web/cover/up");
    assertPost(cover, "https://member.bilibili.com/x/vu/web/cover/up");
    assert.equal(cover.body.kind, "form");
    assert.ok(String(cover.body.fields.cover).startsWith("data:image/png;base64,"));
  });
});

// ---------- 弹幕（protobuf / 二进制 / 写接口） ----------

test("弹幕：get_danmakus 解析 .so protobuf", async () => {
  const { Video } = require("../dist/index.js");
  const { pbInt, pbMessage, pbString } = await import("./helpers/fetch-stub.mjs");
  // 一条 DanmakuElem：id=12345, progress=5000ms, mode=1, fontsize=25, color=16777215, text="弹幕内容", id_str="12345"
  const elem = Buffer.concat([
    pbInt(1, 12345),
    pbInt(2, 5000),
    pbInt(3, 1),
    pbInt(4, 25),
    pbInt(5, 16777215),
    pbString(6, "abcd1234"),
    pbString(7, "弹幕内容"),
    pbInt(8, 1700000000),
    pbInt(9, 5),
    pbString(12, "12345"),
  ]);
  const reply = pbMessage(1, [elem]);

  await withStub(
    async ({ stub, credential }) => {
      const video = new Video({ bvid: "BV1xx411c7mD", credential });
      const list = await video.get_danmakus({ cid: 999, from_seg: 0, to_seg: 0 });
      assert.equal(list.length, 1, "应解析出 1 条弹幕");
      assert.equal(list[0].id_, 12345);
      assert.equal(list[0].dm_time, 5);
      assert.equal(list[0].mode, 1);
      assert.equal(list[0].font_size, 25);
      assert.equal(list[0].color, "ffffff");
      assert.equal(list[0].text, "弹幕内容");
      assert.equal(list[0].id_str, "12345");
      const request = stub.last("/x/v2/dm/wbi/web/seg.so");
      assert.ok(request.url.includes("oid=999"), "应带上 cid");
      assert.ok(request.url.includes("segment_index=1"), "段号从 1 开始");
    },
    (url) => (url.includes("/x/v2/dm/wbi/web/seg.so") ? reply : { code: 0, data: {} }),
  );
});

test("弹幕：顶层出现「字段 1 + 非 2 的 wire type」时按 wire type 跳读，不错位", async () => {
  const { Video } = require("../dist/index.js");
  const { pbInt, pbMessage, pbString } = await import("./helpers/fetch-stub.mjs");
  const makeElem = (id, text) => Buffer.concat([pbInt(1, id), pbInt(2, 1000), pbString(7, text), pbString(12, String(id))]);
  // 真实响应里出现过 field 1 + wire 0（varint）的变体，逐字段假设的解析会直接错位。
  const reply = Buffer.concat([pbMessage(1, [makeElem(11, "第一条")]), pbInt(1, 42), pbMessage(1, [makeElem(22, "第二条")])]);

  await withStub(
    async ({ credential }) => {
      const video = new Video({ bvid: "BV1xx411c7mD", credential });
      const list = await video.get_danmakus({ cid: 999, from_seg: 0, to_seg: 0 });
      assert.equal(list.length, 2, "跳读异常字段后应继续解析出 2 条弹幕");
      assert.deepEqual(list.map((item) => item.text), ["第一条", "第二条"]);
      assert.deepEqual(list.map((item) => item.id_str), ["11", "22"]);
    },
    (url) => (url.includes("/x/v2/dm/wbi/web/seg.so") ? reply : { code: 0, data: {} }),
  );
});

test("弹幕：get_danmaku_xml 取回 XML 文本", async () => {
  const { Video } = require("../dist/index.js");
  const xml = "<i><d p=\"1,1,25,16777215\">hi</d></i>";
  await withStub(
    async ({ stub, credential }) => {
      const video = new Video({ bvid: "BV1xx411c7mD", credential });
      const result = await video.get_danmaku_xml({ cid: 999 });
      assert.equal(result, xml);
      assert.equal(stub.last(".xml").url, "https://comment.bilibili.com/999.xml");
    },
    (url) => (url.includes("comment.bilibili.com") ? Buffer.from(xml, "utf8") : { code: 0, data: {} }),
  );
});

test("弹幕：发送弹幕的字段与 csrf", async () => {
  const { Video } = require("../dist/index.js");
  const { Danmaku } = require("../dist/utils/danmaku.js");
  await withStub(async ({ stub, credential }) => {
    const video = new Video({ bvid: "BV1xx411c7mD", credential });
    const dm = new Danmaku("测试弹幕", { dm_time: 1.5, color: "ff0000", font_size: 25, mode: 1 });
    await video.send_danmaku({ cid: 999, danmaku: dm });
    const request = stub.last("/x/v2/dm/post");
    assertWriteRequest(request, "https://api.bilibili.com/x/v2/dm/post");
    assert.equal(request.body.fields.msg, "测试弹幕");
    assert.equal(request.body.fields.progress, "1500", "毫秒进度");
    assert.equal(request.body.fields.color, "16711680");
    assert.equal(request.body.fields.mode, "1");
    assert.equal(request.body.fields.pool, "0");
  });
});

test("弹幕：撤回与操作弹幕", async () => {
  const { Video } = require("../dist/index.js");
  const { DanmakuOperatorType } = require("../dist/video.js");
  await withStub(async ({ stub, credential }) => {
    const video = new Video({ bvid: "BV1xx411c7mD", credential });
    await video.recall_danmaku({ cid: 999, dmid: 4321 });
    const recall = stub.last("/x/dm/recall");
    assert.equal(recall.method, "GET");
    assert.ok(recall.url.includes("dmid=4321") && recall.url.includes("cid=999"), "GET 参数必须进 query");

    await video.operate_danmaku({ cid: 999, dmids: [1, 2], type_: DanmakuOperatorType.DELETE });
    const operate = stub.last("/x/v2/dm/edit/state");
    assertWriteRequest(operate, "https://api.bilibili.com/x/v2/dm/edit/state");
    assert.equal(operate.body.fields.dmids, "1,2");
    assert.equal(operate.body.fields.state, "1");
  });
});

// ---------- 写操作凭证守卫 ----------

test("缺少 bili_jct 时写操作必须被拦下（不发请求）", async () => {
  const favoriteList = require("../dist/favorite_list.js");
  const { Credential } = require("../dist/index.js");
  const stub = installFetchStub();
  try {
    const bare = new Credential({ sessdata: "only-sessdata" });
    await assert.rejects(() => favoriteList.delete_video_favorite_list([1], bare));
    assert.equal(stub.requests.length, 0, "守卫应在发请求前就抛错");
  } finally {
    stub.uninstall();
  }
});
