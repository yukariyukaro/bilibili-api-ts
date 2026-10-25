/**
 * bilibili_api.dynamic 的 TypeScript 移植。
 *
 * 对应 Python 模块 bilibili_api/dynamic.py：动态相关（发表动态、定时动态、
 * 动态详情 / 点赞 / 转发 / 收藏 / 置顶 / markdown 渲染、动态页列表等）。
 *
 * 与 Python 版的主要差异：
 * - article / opus / vote 模块尚未移植：turn_to_article / turn_to_opus 抛明确错误；
 *   投票标题改为直接请求 vote.vote_info（与 vote.Vote.get_info 是同一个接口）。
 * - Python 用 PyYAML 生成 markdown 头部的元数据，这里用内置的极简 YAML 序列化实现。
 * - 动态 ID 在 JS 里用 number 会丢精度（超过 2^53），Dynamic 允许传 number / string / bigint。
 */
import { ArgsException } from "./exceptions";
import { User, get_self_info, name2uid } from "./user";
import { Api, Credential, getApi } from "./utils/network";
import { Picture } from "./utils/picture";

const API = getApi("dynamic");
const API_opus = getApi("opus");

/** 对应 Python 模块级 uid2uname（uid -> 用户名缓存）。 */
export const uid2uname: Record<string, string> = {};
/** 对应 Python 模块级 uname2uid（用户名 -> uid 缓存）。 */
export const uname2uid: Record<string, number> = {};

/** 对应 Python cache_pool 中与动态相关的几个缓存。 */
const dynamicIsArticle: Record<string, boolean> = {};
const dynamicIsOpus: Record<string, boolean> = {};
const dynamic2article: Record<string, number> = {};
/** 专栏 -> 动态：动态 ID 可能是超过 2^53 的大整数，这里原样保存。 */
const article2dynamic: Record<string, number | string | bigint> = {};

export enum DynamicType {
  /** 所有动态 */
  ALL = "all",
  /** 追番追剧 */
  ANIME = "pgc",
  /** 文章 */
  ARTICLE = "article",
  /** 视频投稿 */
  VIDEO = "video",
}

export enum SendDynamicType {
  /** 纯文本 */
  TEXT = 1,
  /** 图片 */
  IMAGE = 2,
}

export enum DynamicContentType {
  /** 文本 */
  TEXT = 1,
  /** 表情 */
  EMOJI = 9,
  /** @ 用户 */
  AT = 2,
  /** 投票 */
  VOTE = 4,
}

/** Python 的 len() 按 Unicode 码点计数，@ 的 ctrl.location 也按码点算。 */
function __pyLen(text: string): number {
  return Array.from(text).length;
}

/** 对应 Python json.dumps(..., ensure_ascii=False) 的输出风格（分隔符带空格）。 */
function __pyJsonDumps(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(__pyJsonDumps).join(", ") + "]";
  return (
    "{" +
    Object.keys(value)
      .map((key) => JSON.stringify(key) + ": " + __pyJsonDumps(value[key]))
      .join(", ") +
    "}"
  );
}

// ------------------------------ 极简 YAML（仅用于 markdown 头部） ------------------------------

/** 标量转 YAML：数字 / 布尔 / null 原样，字符串统一加引号以避免任何歧义。 */
function __yamlScalar(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "bigint") return String(value);
  const text = String(value);
  // 含控制字符（含换行、制表符）时用双引号 + JSON 转义，其余用单引号。
  if (/[\x00-\x1f\x7f]/.test(text)) return JSON.stringify(text);
  return "'" + text.replace(/'/g, "''") + "'";
}

/** 该值是否需要展开成块结构。 */
function __yamlIsBlock(value: any): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

/** 空数组 / 空对象 / 标量的单行形式。 */
function __yamlInline(value: any): string {
  if (Array.isArray(value)) return "[]";
  if (value !== null && typeof value === "object") return "{}";
  return __yamlScalar(value);
}

function __yamlEmit(value: any, indent: number, lines: string[]): void {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(pad + "[]");
      return;
    }
    for (const item of value) {
      if (__yamlIsBlock(item)) {
        const sub: string[] = [];
        __yamlEmit(item, indent + 2, sub);
        if (!Array.isArray(item) && sub.length > 0) {
          // 字典的第一行接到 "- " 后面，符合 YAML 的序列缩写
          sub[0] = pad + "- " + sub[0].slice(indent + 2);
          for (const line of sub) lines.push(line);
        } else {
          lines.push(pad + "-");
          for (const line of sub) lines.push(line);
        }
      } else {
        lines.push(pad + "- " + __yamlInline(item));
      }
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) {
      lines.push(pad + "{}");
      return;
    }
    for (const key of keys) {
      const item = value[key];
      if (__yamlIsBlock(item)) {
        lines.push(pad + __yamlScalar(key) + ":");
        __yamlEmit(item, indent + 2, lines);
      } else {
        lines.push(pad + __yamlScalar(key) + ": " + __yamlInline(item));
      }
    }
    return;
  }
  lines.push(pad + __yamlScalar(value));
}

/**
 * 极简版 yaml.safe_dump(obj, allow_unicode=True)，对应 Python markdown() 里的
 * yaml.safe_dump(info["item"])。只覆盖 JSON 可表达的类型（动态详情本来就是纯 JSON）。
 *
 * 与 PyYAML 的差异：字符串一律加引号（单引号或 JSON 双引号），键按字典序排序，
 * 嵌套序列用两级缩进。输出本身始终是合法 YAML。
 */
function __yamlSafeDump(value: any): string {
  const lines: string[] = [];
  __yamlEmit(value, 0, lines);
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

// ------------------------------ 内部辅助 ------------------------------

/**
 * 用户名 -> uid。对应 Python _name2uid。
 * 缓存未命中时调用 user.name2uid；结果为空或名字不完全一致时返回 0。
 */
export async function _name2uid(uname: string, credential: Credential): Promise<number> {
  if (uname2uid[uname] === undefined) {
    const resp = await name2uid(uname, credential);
    const uidList = resp["uid_list"] || [];
    if (uidList.length === 0) return 0;
    if (uidList[0]["name"] !== uname) return 0;
    uname2uid[uname] = uidList[0]["uid"];
  }
  return uname2uid[uname];
}

/** uid -> 用户名。对应 Python _uid2name。 */
export async function _uid2name(uid: number, credential: Credential): Promise<string> {
  if (uid2uname[uid] === undefined) {
    const info = await new User(uid, credential).get_user_info();
    uid2uname[uid] = info["name"];
  }
  return uid2uname[uid];
}

/**
 * 解析文本中的 @ 提及，格式为“@用户名 ”（以空格结尾）或“@用户名:”。
 * 对应 Python _parse_at。
 *
 * 返回：原始文本、逗号分隔的 uid 字符串、JSON 格式的 ctrl 控制数据。
 */
export async function _parse_at(text: string, credential: Credential): Promise<[string, string, string]> {
  // 捕获组 1：'@'；捕获组 2：用户名（非贪婪）；捕获组 3：空格或冒号终止符。
  const pattern = /(@)(.*?)( |:)/g;

  const uid_list: string[] = [];
  const ctrl: any[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const uname = match[2];

    const uid = await _name2uid(uname, credential);
    if (uid === 0) continue;

    uid_list.push(String(uid));

    // 与 Python 一致：length = len(完整匹配串) + 1。
    const calculatedLength = __pyLen(match[0]) + 1;

    ctrl.push({
      // Python 的 match.start(1) 是码点下标，这里同样按码点换算。
      location: __pyLen(text.slice(0, match.index)),
      type: 1,
      length: calculatedLength,
      data: uid,
    });
  }

  const at_uids = uid_list.join(",");
  return [text, at_uids, __pyJsonDumps(ctrl)];
}

/** 获取文本（转发 / 纯文本）动态的请求参数。对应 Python _get_text_data。 */
export async function _get_text_data(text: string, credential: Credential): Promise<Record<string, any>> {
  const [new_text, at_uids, ctrl] = await _parse_at(text, credential);
  return {
    dynamic_id: 0,
    type: 4,
    rid: 0,
    content: new_text,
    extension: '{"emoji_type":1}',
    at_uids,
    ctrl,
  };
}

/**
 * 上传动态图片。对应 Python dynamic.upload_image。
 *
 * @param image      图片（有格式要求）
 * @param credential 凭据
 * @param data       自定义请求体，默认 { biz: "new_dyn", category: "daily" }
 */
export async function upload_image(
  image: Picture,
  credential: Credential,
  data?: Record<string, any> | null,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();

  const api = API["send"]["upload_img"];

  let body = data;
  if (body === undefined || body === null) body = { biz: "new_dyn", category: "daily" };

  const files = { file_up: image._toBiliapifile() };
  return new Api({ ...api, credential }).updateData(body).updateFiles(files).result;
}

/** 投票标题。等价于 Python vote.Vote(vote_id).get_info()["info"]["title"]。 */
async function __getVoteTitle(voteId: any): Promise<string> {
  const api = getApi("vote")["info"]["vote_info"];
  const info = await new Api({ ...api }).updateParams({ vote_id: voteId }).result;
  return info["info"]["title"];
}

/** BuildDynamic.create_by_args 的参数。 */
export interface BuildDynamicArgs {
  /** 动态文字 */
  text?: string;
  /** 动态图片列表 */
  pics?: Picture[];
  /** 动态话题 id */
  topic_id?: number;
  /** 动态中投票的 id（放在整个动态最后面） */
  vote_id?: number;
  /** 直播预约 oid（live.create_live_reserve 获取） */
  live_reserve_id?: number;
  /** 定时发送时间 */
  send_time?: Date | null;
}

/**
 * 构建动态内容，提供两种 API：
 *
 * 1. 链式调用构建
 *
 *    BuildDynamic.empty().add_plain_text("114514").add_image(await Picture.load_url("https://www.bilibili.com/favicon.ico"));
 *
 * 2. 参数构建
 *
 *    BuildDynamic.create_by_args({ text: "114514", topic_id: 114514 });
 */
export class BuildDynamic {
  contents: any[] = [];
  pics: Picture[] = [];
  attach_card: Record<string, any> | null = null;
  topic: Record<string, any> | null = null;
  options: Record<string, number> = {};
  time: Date | null = null;

  /** 新建空的动态以链式逐步构建。 */
  static empty(): BuildDynamic {
    return new BuildDynamic();
  }

  /** 通过参数构建动态。 */
  static create_by_args(args: BuildDynamicArgs = {}): BuildDynamic {
    const {
      text = "",
      pics = [],
      topic_id = -1,
      vote_id = -1,
      live_reserve_id = -1,
      send_time = null,
    } = args;
    const dyn = new BuildDynamic();
    dyn.add_text(text);
    dyn.add_image(pics);
    if (topic_id !== -1) dyn.set_topic(topic_id);
    // Python 这里传的是 vote.Vote 对象，get_contents 里会再套一层 Vote 而报错，故直接传 id。
    if (vote_id !== -1) dyn.add_vote(vote_id);
    if (live_reserve_id !== -1) dyn.set_attach_card(live_reserve_id);
    if (send_time !== null) dyn.set_send_time(send_time);
    return dyn;
  }

  /** 添加纯文本。 */
  add_plain_text(text: string): this {
    this.contents.push({ biz_id: "", type: DynamicContentType.TEXT, raw_text: text });
    return this;
  }

  /** 添加 @ 用户，支持传入 UID 或用户名。 */
  add_at(uid = 0, uname = ""): this {
    this.contents.push({ biz_id: uid, type: DynamicContentType.AT, raw_text: "@" + uname });
    return this;
  }

  /** 添加表情。 */
  add_emoji(emoji: string): this {
    this.contents.push({ biz_id: "", type: DynamicContentType.EMOJI, raw_text: emoji });
    return this;
  }

  /** 添加投票。 */
  add_vote(vote_id: number): this {
    this.contents.push({ biz_id: vote_id, type: DynamicContentType.VOTE, raw_text: "" });
    return this;
  }

  /** 添加图片。 */
  add_image(image: Picture | Picture[]): this {
    const images = image instanceof Picture ? [image] : image;
    this.pics = this.pics.concat(images);
    return this;
  }

  /**
   * 添加文本（可包含 @ 与表情包），内部按 @ / [表情] 切分成若干内容段。
   * 对应 Python BuildDynamic.add_text。
   */
  add_text(text: string): this {
    const _get_ats = (source: string): any[] => {
      const paddedText = source + " ";
      const pattern = /(?<=@).*?(?=\s)/g;
      const names: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(paddedText)) !== null) names.push(match[0]);

      const data: any[] = [];
      let lastIndex = 0;
      for (const name of names) {
        const index = paddedText.indexOf("@" + name, lastIndex);
        // Python 这里用 str.index，找不到会抛 ValueError
        if (index === -1) throw new Error("无法在文本中定位 @" + name);
        lastIndex = index + 1;
        const length = 2 + name.length;
        data.push({ location: index, length, text: "@" + name, type: "at", uid: 0 });
      }
      return data;
    };

    const _get_emojis = (source: string): any[] => {
      const pattern = /(?<=\[).*?(?=\])/g;
      const emotes: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) emotes.push("[" + match[0] + "]");

      const data: any[] = [];
      let lastIndex = 0;
      for (const emoji of emotes) {
        const index = source.indexOf(emoji, lastIndex);
        if (index === -1) throw new Error("无法在文本中定位 " + emoji);
        lastIndex = index + 1;
        data.push({ location: index, length: emoji.length, text: emoji, type: "emoji" });
      }
      return data;
    };

    // 与 Python 一致：@ 列表在前、表情列表在后，不按 location 统一排序。
    const allAtAndEmoji = _get_ats(text).concat(_get_emojis(text));

    // 对应 Python 的 split_text_to_plain_at_and_emoji / base_split（这里用循环替代递归）。
    const split_text_to_plain_at_and_emoji = (source: string, items: any[]): any[] => {
      const pending = items.slice();
      const pieces: any[] = [source];
      let lastLength = 0;
      while (pending.length > 0) {
        const lastPiece: string = pieces.pop();
        const next = pending.shift();
        pieces.push(
          lastPiece.slice(0, next["location"] - lastLength),
          next,
          lastPiece.slice(next["location"] + next["length"] - lastLength),
        );
        lastLength += next["length"] + next["location"] - lastLength;
      }
      return pieces;
    };

    const allPieces = split_text_to_plain_at_and_emoji(text, allAtAndEmoji);
    for (const piece of allPieces) {
      if (typeof piece === "string") {
        this.add_plain_text(piece);
      } else if (piece["type"] === "at") {
        this.contents.push({ biz_id: piece["uid"], type: DynamicContentType.AT, raw_text: piece["text"] });
      } else {
        this.contents.push({ biz_id: "", type: DynamicContentType.EMOJI, raw_text: piece["text"] });
      }
    }
    return this;
  }

  /** 设置直播预约（oid 由 live.create_live_reserve 获取）。 */
  set_attach_card(oid: number): this {
    this.attach_card = {
      type: 14,
      biz_id: oid,
      // 疑似 0 为视频预告但没法验证
      reserve_source: 1,
      reserve_lottery: 0,
    };
    return this;
  }

  /** 设置话题。 */
  set_topic(topic_id: number): this {
    this.topic = { id: topic_id };
    return this;
  }

  /** 设置选项：精选评论 / 关闭评论。 */
  set_options(up_choose_comment = false, close_comment = false): this {
    if (up_choose_comment) this.options["up_choose_comment"] = 1;
    if (close_comment) this.options["close_comment"] = 1;
    return this;
  }

  /** 设置定时发送时间。 */
  set_send_time(time: Date): this {
    this.time = time;
    return this;
  }

  /** 获取动态类型（带图 / 纯文本）。 */
  get_dynamic_type(): SendDynamicType {
    if (this.pics.length !== 0) return SendDynamicType.IMAGE;
    return SendDynamicType.TEXT;
  }

  /**
   * 获取动态内容：补齐 @ 的 uid / 用户名、投票标题，并把 biz_id 统一转成字符串。
   * 注意（与 Python 一致）：会就地修改 this.contents。
   */
  async get_contents(credential: Credential): Promise<any[]> {
    const contents = this.contents;
    for (let idx = 0; idx < contents.length; idx += 1) {
      const content = contents[idx];
      if (content["type"] === DynamicContentType.AT) {
        if (content["biz_id"] === 0) {
          if (content["raw_text"] === "@") {
            contents[idx] = { biz_id: "", type: DynamicContentType.EMOJI, raw_text: "@" };
            continue;
          }
          const uid = await _name2uid(content["raw_text"].slice(1), credential);
          if (uid === 0) {
            contents[idx] = { biz_id: "", type: DynamicContentType.TEXT, raw_text: content["raw_text"] };
          } else {
            contents[idx]["biz_id"] = String(uid);
          }
        } else if (content["raw_text"] === "@") {
          contents[idx]["raw_text"] = "@" + (await _uid2name(content["biz_id"], credential));
        }
      }
      if (content["type"] === DynamicContentType.VOTE) {
        contents[idx]["raw_text"] = await __getVoteTitle(content["biz_id"]);
      }
    }
    for (let idx = 0; idx < contents.length; idx += 1) {
      contents[idx]["biz_id"] = String(contents[idx]["biz_id"]);
    }
    return contents;
  }

  /** 获取动态图片。 */
  get_pics(): Picture[] {
    return this.pics;
  }

  /** 获取动态预约。 */
  get_attach_card(): Record<string, any> | null {
    return this.attach_card;
  }

  /** 获取动态话题。 */
  get_topic(): Record<string, any> | null {
    return this.topic;
  }

  /** 获取动态选项。 */
  get_options(): Record<string, number> {
    return this.options;
  }
}

/**
 * 发送动态。对应 Python dynamic.send_dynamic。
 *
 * @param info           动态内容
 * @param credential     凭据
 * @param web_repost_src 网页端转发的来源（传入后 scene 会被置为 5）
 */
export async function send_dynamic(
  info: BuildDynamic,
  credential: Credential,
  web_repost_src: any = null,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();

  const pic_data: any[] = [];
  for (const image of info.pics) {
    await image.upload(credential);
    pic_data.push({ img_src: image.url, img_width: image.width, img_height: image.height });
  }

  const api = API["send"]["instant"];
  const dyn_req: Record<string, any> = {
    content: {
      // 必要参数
      contents: await info.get_contents(credential),
    },
    // 必要参数
    scene: info.get_dynamic_type(),
    meta: {
      app_meta: { from: "create.dynamic.web", mobi_app: "web" },
    },
  };
  const data: Record<string, any> = { dyn_req };
  if (info.time) {
    dyn_req["option"] = { timer_pub_time: Math.floor(info.time.getTime() / 1000) };
  }
  if (info.get_pics().length !== 0) dyn_req["pics"] = pic_data;
  if (info.get_topic() !== null) dyn_req["topic"] = info.get_topic();
  // 与 Python 一致：设了选项会覆盖上面的定时发送 option。
  if (Object.keys(info.get_options()).length > 0) dyn_req["option"] = info.get_options();
  if (info.get_attach_card() !== null) {
    dyn_req["attach_card"] = {};
    dyn_req["attach_card"]["common_card"] = info.get_attach_card();
  } else {
    dyn_req["attach_card"] = null;
  }
  if (web_repost_src) {
    data["web_repost_src"] = web_repost_src;
    dyn_req["scene"] = 5;
  }
  const params = { csrf: credential.bili_jct };

  return new Api({ ...api, credential, json_body: true }).updateData(data).updateParams(params).result;
}

// ------------------------------ 定时动态操作 ------------------------------

/** 获取待发送定时动态列表。 */
export async function get_schedules_list(credential: Credential): Promise<any> {
  credential.raiseForNoSessdata();
  const api = API["schedule"]["list"];
  return new Api({ ...api, credential }).result;
}

/** 立即发送定时动态。 */
export async function send_schedule_now(draft_id: number, credential: Credential): Promise<any> {
  credential.raiseForNoSessdata();
  const api = API["schedule"]["publish_now"];
  return new Api({ ...api, credential }).updateData({ draft_id }).result;
}

/** 删除定时动态。 */
export async function delete_schedule(draft_id: number, credential: Credential): Promise<any> {
  credential.raiseForNoSessdata();
  const api = API["schedule"]["delete"];
  return new Api({ ...api, credential }).updateData({ draft_id }).result;
}

// ------------------------------ 动态类 ------------------------------

/**
 * 动态类。
 *
 * 动态 ID 在 Python 里是任意精度 int，而 JS 的 number 超过 2^53 会丢精度，
 * 因此这里允许传 number / string / bigint，并原样参与请求。
 */
export class Dynamic {
  __dynamic_id: number | string | bigint;
  __detail: any = null;
  credential: Credential;

  constructor(dynamic_id: number | string | bigint, credential: Credential | null = null) {
    this.__dynamic_id = dynamic_id;
    this.__detail = null;
    this.credential = credential !== null && credential !== undefined ? credential : new Credential();
  }

  /** 获取动态 ID。 */
  get_dynamic_id(): number | string | bigint {
    return this.__dynamic_id;
  }

  /** 获取动态信息（带缓存，并顺带填充专栏 / 图文缓存）。 */
  async get_info(): Promise<any> {
    if (!this.__detail) {
      const api = API["info"]["detail"];
      const params = {
        // 注意：Python 这里用的参数名是 id（接口数据文件里写的是 dynamic_id，仅作文档）。
        id: this.__dynamic_id,
        timezone_offset: -480,
        platform: "web",
        gaia_source: "main_web",
        features:
          "itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete",
        web_location: "333.1368",
        "x-bili-device-req-json": '{"platform":"web","device":"pc"}',
        "x-bili-web-req-json": '{"spm_id":"333.1368"}',
      };
      this.__detail = await new Api({ ...api, credential: this.credential }).updateParams(params).result;
      const key = String(this.__dynamic_id);
      dynamicIsArticle[key] = this.__detail["item"]["basic"]["comment_type"] === 12;
      if (dynamicIsArticle[key]) {
        dynamic2article[key] = Number(this.__detail["item"]["basic"]["rid_str"]);
        article2dynamic[String(dynamic2article[key])] = this.__dynamic_id;
      }
      const moduleDynamic = this.__detail["item"]["modules"]["module_dynamic"];
      if (moduleDynamic["major"] === undefined || moduleDynamic["major"] === null) {
        dynamicIsOpus[key] = false;
      } else {
        dynamicIsOpus[key] = moduleDynamic["major"]["type"] === "MAJOR_TYPE_OPUS";
      }
    }
    return this.__detail;
  }

  /** 判断动态是否为专栏发布动态（评论、点赞等数据由专栏 / 动态 / 图文共享）。 */
  async is_article(): Promise<boolean> {
    const key = String(this.get_dynamic_id());
    if (dynamicIsArticle[key] === undefined) await this.get_info();
    return dynamicIsArticle[key];
  }

  /**
   * 将专栏发布动态转为对应专栏。
   *
   * article 模块尚未移植：这里只做与 Python 一致的校验，然后抛出明确错误，
   * 并在错误信息里给出可用的 cvid。
   */
  async turn_to_article(): Promise<never> {
    const key = String(this.get_dynamic_id());
    if (dynamic2article[key] === undefined) {
      await this.get_info();
      if (!(await this.is_article())) throw new ArgsException("提供的动态无对应专栏");
    }
    throw new Error(
      "turn_to_article 依赖 article 模块，本仓库尚未移植。该动态对应专栏 cvid=" +
        dynamic2article[key] +
        "，请移植 article 模块后用 cvid 构造 Article。",
    );
  }

  /** 判断动态是否为图文（图文的评论 / 点赞 / 转发数据与动态共享）。 */
  async is_opus(): Promise<boolean> {
    const key = String(this.__dynamic_id);
    if (dynamicIsOpus[key] === undefined) await this.get_info();
    return dynamicIsOpus[key];
  }

  /** 对图文动态转换为图文。opus 模块尚未移植，这里直接抛错并给出 opus_id。 */
  turn_to_opus(): never {
    throw new Error(
      "turn_to_opus 依赖 opus 模块，本仓库尚未移植。该动态对应的 opus_id=" +
        this.__dynamic_id +
        "，请移植 opus 模块后用 opus_id 构造 Opus。",
    );
  }

  /** 生成动态富文本对应的 markdown。 */
  async markdown(): Promise<string> {
    const info = await this.get_info();

    const parse_module_dynamic = (module: Record<string, any>): string => {
      let nodes: any[] = [];
      let pics: any[] = [];
      let title: string = "";
      if ((module["major"] ?? null) === null) {
        // 转发动态
        nodes = module["desc"]["rich_text_nodes"];
        pics = [];
        title = "";
      } else if (module["major"]["type"] === "MAJOR_TYPE_OPUS") {
        // 图文
        nodes = module["major"]["opus"]["summary"]["rich_text_nodes"];
        pics = module["major"]["opus"]["pics"];
        title = module["major"]["opus"]["title"];
      } else {
        // 按投稿：找到同时带 cover / jump_url / title 的那个字段。
        // Python 原版这里引用了尚未赋值的 jump_url，会抛 UnboundLocalError，此处按当前 key 的 jump_url 处理。
        for (const key of Object.keys(module["major"])) {
          const majorItem = module["major"][key];
          if (majorItem === null || majorItem === undefined) continue;
          if (
            majorItem["cover"] !== undefined &&
            majorItem["cover"] !== null &&
            majorItem["jump_url"] !== undefined &&
            majorItem["jump_url"] !== null &&
            majorItem["title"] !== undefined &&
            majorItem["title"] !== null
          ) {
            const cover = majorItem["cover"];
            let majorJumpUrl: string = majorItem["jump_url"];
            if (majorJumpUrl.startsWith("//")) majorJumpUrl = "https:" + majorJumpUrl;
            return "# " + majorItem["title"] + "\n\n![](" + cover + ")\n\n<" + majorJumpUrl + ">\n";
          }
        }
      }
      let ret = title === null ? "" : "# " + title + "\n\n";
      for (const node of nodes) {
        let text: string = node["text"];
        let jump_url: string | null = node["jump_url"] ?? null;
        if (jump_url !== null && jump_url.startsWith("//")) jump_url = "https:" + jump_url;
        text = text.replace(/\t/g, " ");
        text = text.replace(/ /g, "&emsp;");
        // Python chr(160)（不换行空格）
        text = text.replace(/\u00a0/g, "&emsp;");
        for (const c of ["\\", "*", "$", "<", ">", "|", "~", "_"]) {
          text = text.split(c).join("\\" + c);
        }
        if (node["type"] === "RICH_TEXT_NODE_TYPE_AT") {
          ret += "[" + text + "](https://space.bilibili.com/" + node["rid"] + ") ";
        } else if (node["type"] === "RICH_TEXT_NODE_TYPE_EMOJI") {
          let icon_url: string = node["emoji"]["icon_url"];
          if (icon_url.startsWith("//")) icon_url = "https:" + icon_url;
          ret += "<img width=50px height=50px src=" + icon_url + "> ";
        } else if (jump_url !== null) {
          ret += "[" + text + "](" + jump_url + ")";
        } else {
          ret += text + " ";
        }
      }
      ret += "\n\n";
      for (const pic of pics) {
        let url: string = pic["url"];
        if (url.startsWith("//")) url = "https:" + url;
        ret += "![](" + url + ") \n";
      }
      return ret;
    };

    let content = parse_module_dynamic(info["item"]["modules"]["module_dynamic"]);
    content += "\n\n";
    if (info["item"]["orig"]) {
      const orig_content = parse_module_dynamic(info["item"]["orig"]["modules"]["module_dynamic"]);
      for (const line of orig_content.split("\n")) content += "> " + line + "\n";
    }
    const meta_yaml = __yamlSafeDump(info["item"]);
    return "---\n" + meta_yaml + "\n---\n\n" + content;
  }

  /** 获取点赞、转发。 */
  async get_reaction(offset = ""): Promise<any> {
    const api = API["info"]["reaction"];
    const params = { web_location: "333.1369", offset, id: this.__dynamic_id };
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  /** 获取动态转发列表。 */
  async get_reposts(offset = "0"): Promise<any> {
    const api = API["info"]["repost"];
    const params: Record<string, any> = { dynamic_id: this.__dynamic_id };
    if (offset !== "0") params["offset"] = offset;
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  /** 获取 rid，可作为 comment.get_comments_lazy 等函数的 oid 参数。 */
  async get_rid(): Promise<number> {
    return Number((await this.get_info())["item"]["basic"]["rid_str"]);
  }

  /** 获取动态点赞列表。 */
  async get_likes(pn = 1, ps = 30): Promise<any> {
    const api = API["info"]["likes"];
    const params = { dynamic_id: this.__dynamic_id, pn, ps };
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  /** 设置动态点赞状态。 */
  async set_like(status = true): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();

    const api = API["operate"]["like"];
    const user_info = await get_self_info(this.credential);
    const self_uid = user_info["mid"];
    const data = {
      dynamic_id: this.__dynamic_id,
      up: status ? 1 : 2,
      uid: self_uid,
    };
    return new Api({ ...api, credential: this.credential }).updateData(data).result;
  }

  /** 删除动态。 */
  async delete(): Promise<any> {
    this.credential.raiseForNoSessdata();
    const api = API["operate"]["delete"];
    const data = { dynamic_id: this.__dynamic_id };
    return new Api({ ...api, credential: this.credential }).updateData(data).result;
  }

  /** 转发动态。 */
  async repost(text = "转发动态"): Promise<any> {
    this.credential.raiseForNoSessdata();
    const api = API["operate"]["repost"];
    const data = await _get_text_data(text, this.credential);
    data["dynamic_id"] = this.__dynamic_id;
    return new Api({ ...api, credential: this.credential }).updateData(data).result;
  }

  /** 设置动态（图文）收藏状态。 */
  async set_favorite(status = true): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();

    const api = API_opus["operate"]["simple_action"];
    const params = {
      csrf: this.credential.bili_jct,
    };
    const data = {
      meta: {
        spmid: "444.42.0.0",
        from_spmid: "333.1365.0.0",
        from: "unknown",
      },
      entity: {
        object_id_str: String(this.__dynamic_id),
        type: {
          biz: 2,
        },
      },
      action: status ? 3 : 4,
    };
    return new Api({ ...api, credential: this.credential }).updateParams(params).updateData(data).result;
  }

  /** 获取动态抽奖信息。 */
  async get_lottery_info(): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();

    const api = API["info"]["lottery"];
    const params = {
      business_id: this.get_dynamic_id(),
      business_type: 1,
      csrf: this.credential.bili_jct,
      web_location: "333.1330",
    };
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  /** 置顶动态。 */
  async set_top(): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();

    const api = API["operate"]["set_top"];
    const params = {
      csrf: this.credential.bili_jct,
    };
    const data = { dyn_str: String(this.get_dynamic_id()) };
    return new Api({ ...api, credential: this.credential }).updateParams(params).updateData(data).result;
  }

  /** 取消置顶动态。 */
  async remove_top(): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();

    const api = API["operate"]["rm_top"];
    const params = {
      csrf: this.credential.bili_jct,
    };
    const data = { dyn_str: String(this.get_dynamic_id()) };
    return new Api({ ...api, credential: this.credential }).updateParams(params).updateData(data).result;
  }
}

// ------------------------------ 动态页 ------------------------------

/** 获取更新了动态的关注者。 */
export async function get_new_dynamic_users(credential: Credential | null = null): Promise<any> {
  const cred = credential !== null && credential !== undefined ? credential : new Credential();
  cred.raiseForNoSessdata();
  const api = API["info"]["attention_new_dynamic"];
  return new Api({ ...api, credential: cred }).result;
}

/** 获取正在直播的关注者。 */
export async function get_live_users(size = 10, credential: Credential | null = null): Promise<any> {
  const cred = credential !== null && credential !== undefined ? credential : new Credential();
  cred.raiseForNoSessdata();
  const api = API["info"]["attention_live"];
  const params = { size };
  return new Api({ ...api, credential: cred }).updateParams(params).result;
}

/** 获取动态页 UP 主列表。 */
export async function get_dynamic_page_UPs_info(credential: Credential): Promise<any> {
  const api = API["info"]["dynamic_page_UPs_info"];
  return new Api({ ...api, credential }).result;
}

export interface GetDynamicPageInfoOptions {
  /** 动态类型；获取全部动态传 DynamicType.ALL */
  _type?: DynamicType | null;
  /** 获取指定 UP 主动态时的 mid */
  host_mid?: number | null;
  /** 默认 itemOpusStyle */
  features?: string;
  /** 页码 */
  pn?: number;
  /** 偏移值（下一页的第一个动态 ID，类似单向链表） */
  offset?: number | string | null;
}

/**
 * 获取动态页动态信息。
 *
 * 获取全部动态或相应类型需传 _type，获取指定 UP 主动态需传 host_mid。
 *
 * 注：Python 里对 api["params"] 的 pop 只是改共享的接口文档字典，Api 接收后会被
 * update_params 整体覆盖，故这里不再复刻。
 */
export async function get_dynamic_page_info(
  credential: Credential,
  options: GetDynamicPageInfoOptions = {},
): Promise<any> {
  const { _type = null, host_mid = null, features = "itemOpusStyle", pn = 1, offset = null } = options;

  const api = API["info"]["dynamic_page_info"];
  const params: Record<string, any> = {
    timezone_offset: -480,
    features,
    page: pn,
  };
  if (offset) params["offset"] = offset;
  if (_type) {
    // 全部动态
    params["type"] = _type;
  } else if (host_mid) {
    // 指定 UP 主动态
    params["host_mid"] = host_mid;
  }

  return new Api({ ...api, credential }).updateParams(params).result;
}

/** 获取动态页动态列表。 */
export async function get_dynamic_page_list(
  credential: Credential,
  options: GetDynamicPageInfoOptions = {},
): Promise<Dynamic[]> {
  const dynamic_data = await get_dynamic_page_info(credential, options);
  return dynamic_data["items"].map(
    (dynamic: any) => new Dynamic(dynamic["id_str"], credential),
  );
}
