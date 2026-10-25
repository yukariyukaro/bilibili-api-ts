# @yukariyukaro/bilibili-api-ts

`bilibili-api-python` 的 TypeScript 移植，基准为 Python 仓库 `0147ab61aa5a9f821c9b441cb1ddfdc761a3d999`（17.4.1）。

当前版本 **17.5.0**：在 17.4.1 的搜索 / 视频 / 评论 / 用户 / 私信 / 热门 / 排行榜之上，补齐了动态、收藏夹、合集、创作中心、投稿、表情与图片上传。

目标不是“另写一个 B 站客户端”，而是让同一份接口定义、同一套请求签名和同一组参数在两个语言里保持一致。

## 多仓库布局

| 仓库 | 角色 |
| --- | --- |
| `bilibili-api-python` | 接口数据与行为的基准，`bilibili_api/data/api/*.json` 是唯一事实来源 |
| `bilibili-api-ts` | 本仓库，TypeScript 实现与 npm 包 |
| `dsh-bili-scroll` | 通过 `bilibili` 命令消费上述能力的 CLI 与 Skill |

本仓库的 `scripts/sync-api.mjs` 直接读取 Python 仓库的 43 个 API JSON 文件，生成 `src/data/api/*.ts`，同时把源文件留档到 `vendor/api/`。脚本会从当前目录向上逐级查找 `bilibili-api-python/bilibili_api/data/api`，找不到时（例如 CI 只检出本仓库）自动回退到 `vendor/api/`；也可用 `BILIBILI_API_PYTHON_DIR` 指定路径。任何接口定义变更都应先在 Python 侧发生，再执行 `npm run sync:api`。

## 安装

```bash
npm install @yukariyukaro/bilibili-api-ts
```

要求 Node.js 18+，无运行时第三方依赖。

## 快速开始

```js
const {
  Credential,
  Video,
  search_by_type,
  SearchObjectType,
  get_self_info,
} = require("@yukariyukaro/bilibili-api-ts");

const credential = new Credential({
  sessdata: process.env.SESSDATA,
  bili_jct: process.env.BILI_JCT,
  buvid3: process.env.BUVID3,
  dedeuserid: process.env.DEDEUSERID,
});

(async () => {
  const self = await get_self_info(credential);
  console.log(self.mid);

  const result = await search_by_type({
    keyword: "B站",
    search_type: SearchObjectType.VIDEO,
    page: 1,
    page_size: 10,
  });
  console.log(result.result.length);

  const video = new Video({ bvid: "BV1uv411q7Mv", credential });
  const info = await video.get_info();
  const pages = await video.get_pages();
  const player = await video.get_player_info({ cid: pages[0].cid });
  console.log(info.title, player.subtitle.subtitles);
})();
```

### 私信

```js
const { Credential, EventType, fetch_session_msgs, send_msg } = require("@yukariyukaro/bilibili-api-ts");

const credential = new Credential({ sessdata, bili_jct, buvid3, dedeuserid });

// 读取与某个用户的最近 30 条消息（接口单次上限，固定 size=30）
await fetch_session_msgs({ talker_id: 946974, credential });

// 发送纯文本
await send_msg({ credential, receiver_id: 946974, msg_type: EventType.TEXT, content: "你好" });
```

发送私信属于写操作。CLI 层仍应保留“写开关 + 逐次确认 + 审计”，库本身不做额度或收件人白名单。

## 与 Python 版的一致性

| 层 | 状态 |
| --- | --- |
| 43 个 `data/api/*.json` | 由脚本全量生成，逐文件 deep-equal 校验 |
| WBI（`w_rid` / `wts` / mixin key） | 与 Python 固定向量逐字节一致 |
| WBI2（`dm_img_*`） | 已实现，字段与 Python 相同 |
| CSRF / Cookie / `buvid3` / `buvid4` | 已实现；`buvid` 通过 SPI 获取 |
| APP 签名（`appkey` / `sign`） | 已实现，与 Python 固定向量一致 |
| `-403` WBI 重试 | 已实现，默认 3 次 |
| BV / AV 互转 | 已实现 |

已移植的模块：

- `search`：`search`、`search_by_type`、热搜、建议词
- `video`：`Video`（信息、分 P、播放器与字幕、标签、下载地址）+ **互动**（`like`、`pay_coin`、`share`、`triple`、`set_favorite`、`add_tag`、`delete_tag`、`add_to_toview`）+ **详情**（`get_detail`、`get_chargers`、`get_video_snapshot`、`get_ai_conclusion`、`get_relation`、`has_liked`、`get_pay_coins`、`has_favoured`）+ **弹幕**（`get_danmaku_view`、`get_danmakus`、`get_special_dms`、`send_danmaku`、`like_danmaku`、`recall_danmaku`、`operate_danmaku`、`get_danmaku_xml`、`get_history_danmaku_index`、`has_liked_danmakus`、`get_danmaku_snapshot`）
- `comment`：`get_comments`、`get_comments_lazy`、`send_comment`、`Comment`（楼中楼、删除、点赞、点踩、置顶、举报）
- `user`：`get_user_info`（含 `w_webid`）、`get_relation`、`get_relation_info`、`get_self_info`、空间公告、关注操作、**合集**（`get_channels`、`get_channel_list`、`get_channel_videos_season`、`get_channel_videos_series`）
- `session`：私信收发、会话列表、会话详情、回复/点赞/@ 通知、未读计数、系统消息、消息设置
- `hot`：热门视频、每周必看、入站必刷、热词
- **`dynamic`**：`BuildDynamic` 链式构建（纯文本 / @ / 表情 / 投票 / 图片 / 话题 / 定时）、`send_dynamic`、定时草案三件套、`Dynamic`（详情、点赞、转发、收藏、置顶、删除、抽奖信息、`markdown`）、关注动态与动态页列表
- **`favorite_list`**：视频 / 专栏 / 课程 / 话题 / 笔记收藏夹的读取与增删改、复制、移动、清理、`FavoriteList` 类
- **`channel_series`**：合集列表的创建 / 删除 / 增删视频 / 订阅，`ChannelSeries` 类
- **`creative_center`**：数据概览与趋势、播放分析、粉丝数据、稿件管理、评论与弹幕管理、单稿章节与改稿历史
- **`video_uploader`**：`upload_cover`、`VideoMeta`、`VideoUploader`（preupload + upos 分片 + 提交）、`VideoEditor`（改稿 / 换封面）、upos 线路探测、分区话题与活动
- **`emoji`**：可用表情包、表情详情、添加表情
- **`utils/picture`**：`Picture`（`load_url` / `from_file` / `from_content` / `upload` / `to_json`），图片尺寸由文件头解析，不依赖图像库
- **文件上传 / 二进制响应**：`Api.updateFiles()` 支持 multipart（字段名、文件名规则与 Python 的 curl_cffi 行为一致）；`Api.requestBytes()` 对应 Python 的 `request(byte=True)`
- **`utils/BytesReader`**：protobuf 手工解析器（varint / 定长 / length-delimited），弹幕 `.so` 用
- **`utils/danmaku`**：`Danmaku` / `SpecialDanmaku`（属性名与 Python 一致，含 `to_xml` 与 `crack_uid`）

尚未移植：

- `live`、`bangumi`、`manga`、`audio`、`article`、`opus`、`note` 等模块。对应的 API 数据已经生成，补模块时不需要再抄接口。
- `Credential.refresh()`（Cookie 刷新）与 `Session` 轮询监听类。
- `Picture.convert_format` / `Picture.resize`（依赖 Python 的 PIL，会抛出明确错误）。
- `dynamic.turn_to_article` / `turn_to_opus`（依赖未移植的 article / opus 模块，会抛出明确错误）。
- 代理。Node 原生 `fetch` 不接受 `proxy` 选项；如有需要应传入自定义 `dispatcher`。
- `get_danmaku_view` 里的折叠弹幕（字段 9）与图文弹幕（字段 12）保留原始字节，未逐字段解析。

### 与 Python 有意不同的两处

- `Video.get_danmakus` 按 protobuf 的 **wire type** 跳读未知字段。Python 版假设顶层只会出现字段 1；真实响应里出现过「字段号 1 + wire type 0」的变体，逐字移植会直接错位（Py 版同样会挂）。正常响应下解析结果完全一致。
- `Video.recall_danmaku` 的参数放进 query；Python 版对 GET 请求仍放在 body 里，多数客户端/服务端会丢掉。

## 测试

```bash
npm test
```

包含（全部离线，不访问 B 站、不读凭证）：

- 43 个 API JSON 与生成 TS 的逐文件一致性
- 核心接口 URL / method
- WBI、APP 签名、BV/AV 的 Python 固定向量
- 私信发送字段名与类型
- `module-parity`：每个模块的公开导出面必须与 Python 侧逐个对齐（含 `Video` / `User` 新增方法）
- `request-contract`：用 fetch 探针拦截**真正会发出的请求**，逐个断言 URL、method、关键字段、CSRF 与 multipart 形态；写操作缺 `bili_jct` 时必须在发请求前抛错

真实接口回归默认关闭：

```bash
BILIBILI_E2E=1 npm run e2e
```

凭证默认读取 `%APPDATA%/bilibili-skill/bili_credential.json`（非 Windows 为 `~/.config/bilibili-skill/bili_credential.json`），也可用 `BILIBILI_CREDENTIAL_FILE` 指定。测试只输出数量与布尔状态，不打印凭证。

可选变量：

- `BILIBILI_E2E_TALKER`：读取与该 UID 的最近私信
- `BILIBILI_E2E_WRITE=1`、`BILIBILI_E2E_DM_UID`、`BILIBILI_E2E_DM_TEXT`：显式开启一次私信发送测试

真实回归覆盖：登录态、热门、搜索、视频详情、分 P、播放器与字幕、评论列表、楼中楼、用户资料、用户关系、会话列表、未读计数、回复/点赞/@ 通知、最近私信。

## 发布

```bash
npm run build
npm pack
npm publish --access public
```

仓库内置 `.github/workflows/publish.yml`：推送 `v*` 标签后，用 `NPM_TOKEN` secret 自动发布。首次发布前需要确认 npm 账号拥有 `@yukariyukaro` scope；如果使用其他 scope，只需修改 `package.json` 的 `name`。

## 许可证

GPL-3.0-or-later。接口数据来自 [bilibili-api](https://github.com/Nemo2011/bilibili-api)，仅用于学习与测试，请遵守 B 站服务条款。