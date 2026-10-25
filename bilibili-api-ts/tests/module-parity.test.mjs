import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

// 每个模块的公开导出面必须与 Python 侧一致：Python 有的，这里必须有。
// 这些清单是从 bilibili_api/*.py 的公开 class/def 逐个抄下来的，改模块时同步改这里。

const EXPECTED = {
  favorite_list: {
    functions: [
      "get_video_favorite_list",
      "get_video_favorite_list_content",
      "get_topic_favorite_list",
      "get_article_favorite_list",
      "get_course_favorite_list",
      "get_note_favorite_list",
      "create_video_favorite_list",
      "modify_video_favorite_list",
      "delete_video_favorite_list",
      "copy_video_favorite_list_content",
      "move_video_favorite_list_content",
      "delete_video_favorite_list_content",
      "clean_video_favorite_list_content",
      "get_favorite_collected",
    ],
    classes: ["FavoriteList"],
    enums: ["FavoriteListContentOrder", "FavoriteListType", "SearchFavoriteListMode"],
  },
  emoji: {
    functions: ["get_emoji_list", "get_emoji_detail", "get_all_emoji", "add_emoji"],
  },
  channel_series: {
    functions: [
      "create_channel_series",
      "del_channel_series",
      "add_aids_to_series",
      "del_aids_from_series",
      "set_follow_channel_season",
    ],
    classes: ["ChannelSeries"],
    enums: ["ChannelOrder", "ChannelSeriesType"],
  },
  creative_center: {
    functions: [
      "get_compare",
      "get_graph",
      "get_overview",
      "get_video_survey",
      "get_video_playanalysis",
      "get_video_source",
      "get_fan_overview",
      "get_fan_graph",
      "get_article_overview",
      "get_article_graph",
      "get_article_rank",
      "get_article_source",
      "get_video_draft_upload_manager_info",
      "get_video_upload_manager_info",
      "get_article_upload_manager_info",
      "get_article_list_upload_manager_info",
      "get_comments",
      "del_comments",
      "get_recently_danmakus",
      "get_danmakus",
      "del_danmaku",
      "edit_danmaku_state",
      "edit_danmaku_pool",
      "get_archive_edits",
      "get_archive_parts",
    ],
    enums: [
      "GraphPeriod",
      "FanGraphPeriod",
      "GraphType",
      "FanGraphType",
      "ArticleInfoType",
      "Copyright",
      "UploadManagerOrder",
      "UploadManagerStatus",
      "UploadManagerSort",
      "UploadManagerArticleStatus",
      "ArchiveType",
      "CommentManagerOrder",
      "DanmakuMode",
      "DanmakuPool",
      "DanmakuOrder",
      "DanmakuSort",
      "DanmakuType",
    ],
  },
  dynamic: {
    functions: [
      "upload_image",
      "send_dynamic",
      "get_schedules_list",
      "send_schedule_now",
      "delete_schedule",
      "get_new_dynamic_users",
      "get_live_users",
      "get_dynamic_page_UPs_info",
      "get_dynamic_page_info",
      "get_dynamic_page_list",
    ],
    classes: ["BuildDynamic", "Dynamic"],
    enums: ["DynamicType", "SendDynamicType", "DynamicContentType"],
  },
  video_uploader: {
    functions: ["upload_cover", "get_available_topics", "get_missions", "_probe", "_choose_line"],
    classes: ["VideoUploaderPage", "VideoMeta", "VideoUploader", "VideoEditor", "AsyncEvent", "VideoPorderType", "VideoPorderMeta"],
    enums: ["Lines", "VideoUploaderEvents", "VideoEditorEvents", "VideoPorderIndustry", "VideoPorderShowType"],
  },
};

for (const [moduleName, spec] of Object.entries(EXPECTED)) {
  test(`${moduleName} 的公开导出与 Python 一致`, () => {
    const module = require(`../dist/${moduleName}.js`);
    for (const name of spec.functions || []) {
      assert.equal(typeof module[name], "function", `${moduleName}: 缺少函数 ${name}`);
    }
    for (const name of spec.classes || []) {
      assert.equal(typeof module[name], "function", `${moduleName}: 缺少类 ${name}`);
    }
    for (const name of spec.enums || []) {
      assert.equal(typeof module[name], "object", `${moduleName}: 缺少枚举 ${name}`);
    }
  });
}

test("User 补齐了 Python 的合集相关方法", () => {
  const { User } = require("../dist/user.js");
  for (const name of ["get_channel_videos_series", "get_channel_videos_season", "get_channel_list", "get_channels"]) {
    assert.equal(typeof User.prototype[name], "function", `User: 缺少 ${name}`);
  }
});

test("Video 补齐了 Python 的互动与详情方法", () => {
  const { Video } = require("../dist/video.js");
  for (const name of [
    "get_detail",
    "get_up_mid",
    "get_chargers",
    "get_video_snapshot",
    "is_forbid_note",
    "get_private_notes_list",
    "get_public_notes_list",
    "get_ai_conclusion",
    "get_relation",
    "has_liked",
    "get_pay_coins",
    "has_favoured",
    "like",
    "pay_coin",
    "share",
    "triple",
    "add_tag",
    "delete_tag",
    "set_favorite",
    "add_to_toview",
    "delete_from_toview",
    "get_danmaku_view",
    "get_danmakus",
    "get_special_dms",
    "get_history_danmaku_index",
    "has_liked_danmakus",
    "send_danmaku",
    "get_danmaku_xml",
    "like_danmaku",
    "operate_danmaku",
    "get_danmaku_snapshot",
    "recall_danmaku",
  ]) {
    assert.equal(typeof Video.prototype[name], "function", `Video: 缺少 ${name}`);
  }
});

test("Picture / BytesReader / Danmaku 可从包入口导入", () => {
  const mod = require("../dist/index.js");
  assert.equal(typeof mod.Picture, "function");
  assert.equal(typeof mod.Picture.from_content, "function");
  assert.equal(typeof mod.BytesReader, "function");
  assert.equal(typeof mod.Danmaku, "function");
  assert.equal(typeof mod.SpecialDanmaku, "function");
});

test("弹幕操作枚举与 Python 一致", () => {
  const { DanmakuOperatorType } = require("../dist/video.js");
  assert.equal(DanmakuOperatorType.DELETE, 1);
  assert.equal(DanmakuOperatorType.PROTECT, 2);
  assert.equal(DanmakuOperatorType.UNPROTECT, 3);
});
