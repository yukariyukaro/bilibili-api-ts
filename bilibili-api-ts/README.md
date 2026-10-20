# @yukariyukaro/bilibili-api-ts

`bilibili-api-python` 的 TypeScript 移植，基准为 Python 仓库 `0147ab61aa5a9f821c9b441cb1ddfdc761a3d999`（17.4.1）。

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
- `video`：`Video`、`get_info`、`get_pages`、`get_player_info`、`get_subtitle`、`get_tags`、`get_download_url`
- `comment`：`get_comments`、`get_comments_lazy`、`send_comment`、`Comment`（楼中楼、删除、点赞、点踩、置顶、举报）
- `user`：`get_user_info`（含 `w_webid`）、`get_relation`、`get_relation_info`、`get_self_info`、空间公告、关注操作
- `session`：私信收发、会话列表、会话详情、回复/点赞/@ 通知、未读计数、系统消息、消息设置
- `hot`：热门视频、每周必看、入站必刷、热词

尚未移植：

- `live`、`dynamic`、`bangumi`、`manga`、`audio`、`article`、`opus`、`favorite_list`、`video_uploader`、`creative_center` 等模块。对应的 API 数据已经生成，补模块时不需要再抄接口。
- `Credential.refresh()`（Cookie 刷新）与 `Session` 轮询监听类。
- 图片评论、图片私信、代理。Node 原生 `fetch` 不接受 `proxy` 选项；如有需要应传入自定义 `dispatcher`。

## 测试

```bash
npm test
```

包含：

- 43 个 API JSON 与生成 TS 的逐文件一致性
- 核心接口 URL / method
- WBI、APP 签名、BV/AV 的 Python 固定向量
- 私信发送字段名与类型

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
