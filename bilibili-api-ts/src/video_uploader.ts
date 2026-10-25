/**
 * 本文件是 Python 版 bilibili_api.video_uploader（视频投稿 / 稿件编辑）的 TypeScript 移植。
 *
 * 对照源码：bilibili-api-python/bilibili_api/video_uploader.py
 *
 * 说明：
 * + 所有接口地址均取自 src/data/api/video_uploader.ts（getApi("video_uploader")），未内联任何 URL；
 *   仅 upos 分片上传 / 线路探测直接拼接 preupload 返回的 endpoint（与 Python 完全一致）。
 * + Python 的 data/video_uploader_lines.json 在 TS 仓库中没有对应数据文件，本文件内联为 LINES_INFO 常量。
 * + Python 的 data/video_uploader_meta_pre.json（tid 树，约 115KB）同样没有对应数据文件，
 *   因此 VideoMeta._check_tid 改为按需请求 "pre" 接口获取 tid_list。
 * + Picture.convert_format 依赖 PIL，TS 版未实现，upload_cover 不再做 PNG 转码，直接按原格式编码 data URI。
 * + 事件机制见本文件内的 AsyncEvent（对应 Python utils/AsyncEvent.py 的常用子集）。
 */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";

import { BiliApiException, NetworkException, ResponseCodeException } from "./exceptions";
import { bvid2aid } from "./utils/aid";
import { Api, Credential, HEADERS, encodeQuery, getApi, rawRequest, requestSettings } from "./utils/network";
import { Picture } from "./utils/picture";
import { Video } from "./video";

const API = getApi("video_uploader");

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */

/** 对应 os.path.basename（同时兼容 / 与 \\）。 */
function pyBasename(path: string): string {
  const parts = String(path).split(/[\\/]/);
  return parts[parts.length - 1];
}

/** 对应 os.path.splitext(...)[0]，即去掉最后一个扩展名。 */
function pySplitextRoot(path: string): string {
  const text = String(path);
  const sep = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
  const dot = text.lastIndexOf(".");
  if (dot > sep) return text.slice(0, dot);
  return text;
}

/** 对应 Python 的 json.dumps，仅用于异常信息。 */
function jsonText(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 对应 copy.deepcopy 的常用场景（事件回调里的数据快照）。 */
function deepCopy<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    if (Array.isArray(value)) return [...value] as any;
    return { ...(value as any) } as T;
  }
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

interface BinaryRequestOptions {
  method: string;
  url: string;
  params?: Record<string, any>;
  headers?: Record<string, string>;
  /** 二进制请求体（分片上传必须保持原始字节）。 */
  body?: Buffer | string;
  timeout?: number;
}

/**
 * upos 分片 / 探测请求：需要发送原始字节，rawRequest 只支持表单 / 字符串，
 * 因此这里直接使用 fetch，并把 HEADERS 作为默认请求头（与 Python get_client 的行为一致）。
 */
async function binaryRequest(options: BinaryRequestOptions): Promise<{ status: number; text: string }> {
  const params = options.params || {};
  const query = encodeQuery(params);
  const url = query ? options.url + (options.url.includes("?") ? "&" : "?") + query : options.url;
  // 大小写不敏感地合并请求头，避免与 HEADERS 中的同名头重复。
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...HEADERS, ...(options.headers || {}) })) {
    merged[key.toLowerCase()] = value;
  }
  const response = await fetch(url, {
    method: options.method.toUpperCase(),
    headers: merged,
    body: options.body as any,
    signal: AbortSignal.timeout(options.timeout ?? requestSettings.timeout),
  });
  return { status: response.status, text: await response.text() };
}

/* ------------------------------------------------------------------ */
/* AsyncEvent（对应 Python utils/AsyncEvent.py 的常用子集）             */
/* ------------------------------------------------------------------ */

export type AsyncEventHandler = (data?: any, ...rest: any[]) => any;

/**
 * 轻量发布-订阅事件类。
 *
 * + add_event_listener(name, handler) 注册监听；
 * + dispatch(name, data) 触发，监听器可以是同步函数，也可以返回 Promise；
 * + 与 Python 一致支持特殊事件 "__ALL__"（所有事件都会再向它转发一次）。
 */
export class AsyncEvent {
  __handlers: Map<string, AsyncEventHandler[]> = new Map();
  __ignore_events: string[] = [];

  add_event_listener(name: string, handler: AsyncEventHandler): void {
    const key = String(name).toUpperCase();
    if (!this.__handlers.has(key)) this.__handlers.set(key, []);
    this.__handlers.get(key)!.push(handler);
  }

  /** 对应 Python 的 @on 装饰器：on(name)(handler) 注册并返回 handler。 */
  on(eventName: string): (handler: AsyncEventHandler) => AsyncEventHandler {
    return (handler: AsyncEventHandler) => {
      this.add_event_listener(eventName, handler);
      return handler;
    };
  }

  remove_all_event_listener(): void {
    this.__handlers = new Map();
  }

  remove_event_listener(name: string, handler: AsyncEventHandler): boolean {
    const key = String(name).toUpperCase();
    const handlers = this.__handlers.get(key);
    if (!handlers) return false;
    const index = handlers.indexOf(handler);
    if (index < 0) return false;
    handlers.splice(index, 1);
    return true;
  }

  ignore_event(name: string): void {
    this.__ignore_events.push(String(name).toUpperCase());
  }

  remove_ignore_events(): void {
    this.__ignore_events = [];
  }

  dispatch(name: string, data?: any): void {
    // 与 Python 对齐：不传参数时监听器收到 {}。
    const payload = arguments.length < 2 ? {} : data;
    const key = String(name).toUpperCase();
    if (this.__ignore_events.includes(key)) return;
    const handlers = this.__handlers.get(key);
    if (handlers) {
      for (const handler of handlers) {
        const result = handler(payload);
        // 异步监听器的异常不应打断上传主流程。
        if (result && typeof result.then === "function") result.then(undefined, () => undefined);
      }
    }
    if (key !== "__ALL__") {
      this.dispatch("__ALL__", { name: key, data: [payload] });
    }
  }
}

/** 用户调用 abort() 后用于中断流程的内部异常（对应 Python 的 asyncio.CancelledError）。 */
export class VideoUploadAbortedException extends BiliApiException {
  constructor() {
    super("用户手动取消");
  }
}

/* ------------------------------------------------------------------ */
/* 封面                                                                */
/* ------------------------------------------------------------------ */

export interface UploadCoverOptions {
  /**
   * 是否改用 multipart 文件上传（Api.updateFiles）。默认为 false，
   * 与 Python 一致使用表单字段 cover=data:image/png;base64,...。
   */
  useFile?: boolean;
}

/**
 * 上传封面（video_uploader.up.cover）
 *
 * @returns 封面 URL
 */
export async function upload_cover(
  cover: Picture | string,
  credential: Credential,
  options: UploadCoverOptions = {},
): Promise<string> {
  credential.raiseForNoBiliJct();
  const api = API.cover_up;
  const pic = cover instanceof Picture ? cover : Picture.from_file(cover);

  if (options.useFile === true) {
    const result = await new Api({ ...api, credential }).updateFiles({ cover: pic._toBiliapifile() }).result;
    return result.url ?? result.image_url;
  }

  // Python 会先 pic.convert_format("png")；TS 版未实现图片转码，按原始格式编码。
  const format = (pic.imageType || "png").toLowerCase();
  const mime = IMAGE_MIME[format] || "image/png";
  const data = { cover: "data:" + mime + ";base64," + pic.content.toString("base64") };
  const result = await new Api({ ...api, credential }).updateData(data).result;
  return result.url;
}

/* ------------------------------------------------------------------ */
/* 线路                                                                */
/* ------------------------------------------------------------------ */

export enum Lines {
  BDA2 = "bda2",
  QN = "qn",
  WS = "ws",
  BLDSA = "bldsa",
}

export interface LineInfo {
  os: string;
  upcdn: string;
  probe_version: number;
  query: string;
  probe_url: string;
}

/** 对应 Python data/video_uploader_lines.json（TS 仓库无对应数据文件，内联在此）。 */
export const LINES_INFO: Record<string, LineInfo> = {
  bda2: {
    os: "upos",
    upcdn: "bda2",
    probe_version: 20221109,
    query: "probe_version=20221109&upcdn=bda2",
    probe_url: "//upos-cs-upcdnbda2.bilivideo.com/OK",
  },
  bldsa: {
    os: "upos",
    upcdn: "bldsa",
    probe_version: 20221109,
    query: "upcdn=bldsa&probe_version=20221109",
    probe_url: "//upos-cs-upcdnbldsa.bilivideo.com/OK",
  },
  qn: {
    os: "upos",
    upcdn: "qn",
    probe_version: 20221109,
    query: "probe_version=20221109&upcdn=qn",
    probe_url: "//upos-cs-upcdnqn.bilivideo.com/OK",
  },
  ws: {
    os: "upos",
    upcdn: "ws",
    probe_version: 20221109,
    query: "upcdn=ws&probe_version=20221109",
    probe_url: "//upos-cs-upcdnws.bilivideo.com/OK",
  },
};

/** 探测时向各线路 POST 0.1MB 数据（对应 Python 的 bytes(int(1024 * 0.1 * 1024))）。 */
const PROBE_BODY_SIZE = Math.trunc(1024 * 0.1 * 1024);

/**
 * 测试所有线路（测速网页 https://member.bilibili.com/preupload?r=ping）
 *
 * @returns 最快的线路信息
 */
export async function _probe(): Promise<LineInfo> {
  const legacyTimeout = requestSettings.timeout;
  // 测试时设置为 30s
  requestSettings.timeout = 30000;
  let minCost = 30;
  let fastestLine: LineInfo | null = null;
  try {
    for (const line of Object.values(LINES_INFO)) {
      const start = performance.now();
      let costTime: number;
      try {
        const resp = await binaryRequest({
          method: "POST",
          url: "https:" + line.probe_url,
          body: Buffer.alloc(PROBE_BODY_SIZE),
          timeout: requestSettings.timeout,
        });
        if (resp.status >= 400) throw new NetworkException(resp.status, resp.text);
        costTime = (performance.now() - start) / 1000;
      } catch {
        // 失败按超时时间计（与 Python 一致）
        costTime = requestSettings.timeout / 1000;
      }
      if (costTime < minCost) {
        minCost = costTime;
        fastestLine = line;
      }
    }
  } finally {
    requestSettings.timeout = legacyTimeout;
  }
  // Python 在全部失败时返回 None，这里显式报错，避免后续 self.line["os"] 崩溃。
  if (fastestLine === null) throw new BiliApiException("线路测速失败，请通过 line 参数手动指定线路");
  return fastestLine;
}

/**
 * 选择线路，不存在则直接测速自动选择
 */
export async function _choose_line(line: Lines | string | null | undefined): Promise<LineInfo> {
  if (line !== null && line !== undefined) {
    const lineInfo = (LINES_INFO as Record<string, LineInfo>)[String(line)];
    if (lineInfo !== undefined) return lineInfo;
  }
  return _probe();
}

/* ------------------------------------------------------------------ */
/* 分 P 对象                                                            */
/* ------------------------------------------------------------------ */

export class VideoUploaderPage {
  path: string;
  title: string;
  description: string;
  cached_size: number | null = null;

  constructor(path: string, title: string, description = "") {
    this.path = path;
    this.title = title;
    this.description = description;
  }

  /** 获取文件大小（字节）。 */
  get_size(): number {
    if (this.cached_size !== null) return this.cached_size;
    // Python 逐 1KB 读取统计字节数；这里用 fstat 得到同样的结果，且不必整体读入内存。
    const fd = openSync(this.path, "r");
    let size = 0;
    try {
      size = fstatSync(fd).size;
    } finally {
      closeSync(fd);
    }
    this.cached_size = size;
    return size;
  }
}

/* ------------------------------------------------------------------ */
/* 上传事件                                                             */
/* ------------------------------------------------------------------ */

export enum VideoUploaderEvents {
  PREUPLOAD = "PREUPLOAD",
  PREUPLOAD_FAILED = "PREUPLOAD_FAILED",
  PRE_PAGE = "PRE_PAGE",

  PRE_CHUNK = "PRE_CHUNK",
  AFTER_CHUNK = "AFTER_CHUNK",
  CHUNK_FAILED = "CHUNK_FAILED",

  PRE_PAGE_SUBMIT = "PRE_PAGE_SUBMIT",
  PAGE_SUBMIT_FAILED = "PAGE_SUBMIT_FAILED",
  AFTER_PAGE_SUBMIT = "AFTER_PAGE_SUBMIT",

  AFTER_PAGE = "AFTER_PAGE",

  PRE_COVER = "PRE_COVER",
  AFTER_COVER = "AFTER_COVER",
  COVER_FAILED = "COVER_FAILED",

  PRE_SUBMIT = "PRE_SUBMIT",
  SUBMIT_FAILED = "SUBMIT_FAILED",
  AFTER_SUBMIT = "AFTER_SUBMIT",

  COMPLETED = "COMPLETE",
  ABORTED = "ABORTED",
  FAILED = "FAILED",
}

/**
 * 获取可用 topic 列表
 */
export async function get_available_topics(tid: number, credential: Credential): Promise<any[]> {
  credential.raiseForNoSessdata();
  const api = API.available_topics;
  const params = { type_id: tid, pn: 0, ps: 200 }; // 一次性获取完
  const result = await new Api({ ...api, credential }).updateParams(params).result;
  return result.topics;
}

/* ------------------------------------------------------------------ */
/* 商业参数                                                             */
/* ------------------------------------------------------------------ */

export class VideoPorderType {
  /** 花火 */
  static readonly FIREWORK: { value: Record<string, any> } = { value: { flow_id: 1 } };
  /** 其他 */
  static readonly OTHER: { value: Record<string, any> } = {
    value: {
      flow_id: 1,
      industry_id: null,
      official: null,
      brand_name: null,
      show_type: [],
    },
  };
}

export enum VideoPorderIndustry {
  MOBILE_GAME = 1,
  CONSOLE_GAME = 20,
  WEB_GAME = 21,
  PC_GAME = 22,
  PC_NETWORK_GAME = 23,
  SOFTWARE_APPLICATION = 2,
  DAILY_NECESSITIES_AND_COSMETICS = 3,
  CLOTHING_SHOES_AND_HATS = 4,
  LUGGAGE_AND_ACCESSORIES = 5,
  FOOD_AND_BEVERAGE = 6,
  PUBLISHING_AND_MEDIA = 7,
  COMPUTER_HARDWARE = 8,
  OTHER = 9,
  MEDICAL = 213,
  FINANCE = 214,
}

export enum VideoPorderShowType {
  LOGO = 15,
  OTHER = 10,
  SPOKEN_AD = 11,
  PATCH = 12,
  TVC_IMBEDDED = 14,
  CUSTOMIZED_AD = 19,
  PROGRAM_SPONSORSHIP = 18,
  SLOGAN = 17,
  QR_CODE = 16,
  SUBTITLE_PROMOTION = 13,
}

/**
 * 视频商业相关参数
 *
 * 与 Python 的差异：Python 直接把类级字典 porden_type.value 赋给实例并原地修改，
 * 会造成不同实例之间互相污染；这里对字典做深拷贝，字段名保持 Python 的写法。
 */
export class VideoPorderMeta {
  flow_id = 1;
  __info: Record<string, any> = {};

  constructor(
    porden_type: { value: Record<string, any> } | Record<string, any> = VideoPorderType.FIREWORK,
    industry_type: VideoPorderIndustry | number | null = null,
    brand_name: string | null = null,
    show_types: Array<VideoPorderShowType | number> = [],
  ) {
    const raw = (porden_type as any).value !== undefined ? (porden_type as any).value : porden_type;
    this.__info = deepCopy(raw || {});
    this.flow_id = 1;
    if (porden_type === VideoPorderType.OTHER) {
      // Python 写的是 industry（而 VideoPorderType.OTHER 里是 industry_id），这里保持一致。
      this.__info.industry = industry_type;
      this.__info.brand_name = brand_name;
      this.__info.show_types = show_types.map((show_type) => String(show_type)).join(",");
    }
  }

  __dict__(): Record<string, any> {
    return this.__info;
  }
}

/* ------------------------------------------------------------------ */
/* 视频源数据                                                           */
/* ------------------------------------------------------------------ */

export class VideoMeta {
  tid: number;
  title: string;
  desc: string;
  cover: Picture;
  tags: string[];
  topic_id: number | null = null;
  mission_id: number | null = null;
  original = true;
  source: string | null = null;
  recreate = false;
  no_reprint = false;
  open_elec = false;
  up_selection_reply = false;
  up_close_danmu = false;
  up_close_reply = false;
  lossless_music = false;
  dolby = false;
  subtitle: Record<string, any> | null = null;
  dynamic: string | null = null;
  neutral_mark: string | null = null;
  delay_time: number | null = null;
  porder: VideoPorderMeta | Record<string, any> | null = null;
  watermark = false;

  __credential: Credential = null as any;
  __pre_info: any = null;

  constructor(
    tid: number,
    title: string,
    desc: string,
    cover: Picture | string,
    tags: string[] | string,
    topic: number | any = null,
    mission_id: number | null = null,
    original = true,
    source: string | null = null,
    recreate = false,
    no_reprint = false,
    open_elec = false,
    up_selection_reply = false,
    up_close_danmu = false,
    up_close_reply = false,
    lossless_music = false,
    dolby = false,
    subtitle: Record<string, any> | null = null,
    dynamic: string | null = null,
    neutral_mark: string | null = null,
    delay_time: number | Date | null = null,
    porder: VideoPorderMeta | Record<string, any> | null = null,
    watermark = false,
  ) {
    if (typeof tid === "number") {
      this.tid = tid;
    } else {
      throw new BiliApiException("tid 不合法");
    }

    if (typeof title === "string" && title.length <= 80) {
      this.title = title;
    } else {
      throw new BiliApiException("title 不合法或者大于 80 字");
    }

    if (tags === null || tags === undefined) {
      throw new BiliApiException("tags 不能为空");
    } else if (typeof tags === "string") {
      this.tags = tags.includes(",") ? tags.split(",") : [tags];
    } else if (Array.isArray(tags) && tags.length <= 10) {
      this.tags = tags;
    } else {
      throw new BiliApiException("tags 不合法或者多于 10 个");
    }

    if (typeof cover === "string") {
      this.cover = Picture.from_file(cover);
    } else if (cover instanceof Picture) {
      this.cover = cover;
    } else {
      throw new BiliApiException("cover 不合法");
    }

    if (topic !== null && topic !== undefined) {
      this.mission_id = mission_id;
      if (typeof topic === "number") {
        this.topic_id = topic;
      } else if (topic && typeof topic.get_topic_id === "function") {
        // 对应 Python 的 isinstance(topic, Topic)；Topic 类尚未移植，这里做鸭子类型判断。
        this.topic_id = topic.get_topic_id();
      }
    }

    if (typeof desc === "string" && desc.length <= 2000) {
      this.desc = desc;
    } else {
      throw new BiliApiException("desc 不合法或者大于 2000 字");
    }

    this.original = typeof original === "boolean" ? original : true;
    if (!this.original && source !== null && source !== undefined) {
      if (typeof source === "string" && source.length <= 200) {
        this.source = source;
      } else {
        throw new BiliApiException("source 不合法或者大于 200 字");
      }
    }

    this.recreate = typeof recreate === "boolean" ? recreate : false;
    this.no_reprint = typeof no_reprint === "boolean" ? no_reprint : false;
    this.open_elec = typeof open_elec === "boolean" ? open_elec : false;
    this.up_selection_reply = typeof up_selection_reply === "boolean" ? up_selection_reply : false;
    this.up_close_danmu = typeof up_close_danmu === "boolean" ? up_close_danmu : false;
    this.up_close_reply = typeof up_close_reply === "boolean" ? up_close_reply : false;
    this.lossless_music = typeof lossless_music === "boolean" ? lossless_music : false;
    this.dolby = typeof dolby === "boolean" ? dolby : false;
    this.subtitle = subtitle && typeof subtitle === "object" ? subtitle : null;
    this.dynamic = typeof dynamic === "string" && dynamic.length <= 233 ? dynamic : null;
    this.neutral_mark = typeof neutral_mark === "string" ? neutral_mark : null;
    if (typeof delay_time === "number") {
      this.delay_time = delay_time;
    } else if (delay_time instanceof Date) {
      this.delay_time = Math.floor(delay_time.getTime() / 1000);
    }
    // Python 用 isinstance(porder, dict) 判断，导致传入 VideoPorderMeta 时被丢弃；这里两种都接受。
    if (porder instanceof VideoPorderMeta || (porder && typeof porder === "object")) {
      this.porder = porder;
    } else {
      this.porder = null;
    }
    this.watermark = watermark;
  }

  __dict__(): Record<string, any> {
    const porderValue =
      this.porder === null || this.porder === undefined
        ? null
        : typeof (this.porder as any).__dict__ === "function"
          ? (this.porder as any).__dict__()
          : this.porder;
    const meta: Record<string, any> = {
      title: this.title,
      copyright: this.original ? 1 : 2,
      tid: this.tid,
      tag: this.tags.join(","),
      mission_id: this.mission_id, // 根据 topic 对应任务
      topic_id: this.topic_id,
      topic_detail: {
        from_topic_id: this.topic_id,
        from_source: "arc.web.recommend",
      },
      desc_format_id: 9999,
      desc: this.desc,
      dtime: this.delay_time,
      recreate: this.recreate ? 1 : -1,
      dynamic: this.dynamic,
      interactive: 0,
      act_reserve_create: 0, // unknown
      no_disturbance: 0, // unknown
      porder: porderValue,
      adorder_type: 9, // unknown
      no_reprint: this.no_reprint ? 1 : 0,
      subtitle:
        this.subtitle !== null
          ? this.subtitle
          : {
              open: 0,
              lan: "",
            }, // 莫名其妙没法上传 srt 字幕，显示格式错误，不校验
      neutral_mark: this.neutral_mark, // 不知道能不能随便写文本
      dolby: this.dolby ? 1 : 0,
      lossless_music: this.lossless_music ? 1 : 0,
      // 与 Python 一致：up_selection_reply 取的是 up_close_reply（原版如此，未修正）
      up_selection_reply: this.up_close_reply,
      up_close_reply: this.up_close_reply,
      up_close_danmu: this.up_close_danmu,
      web_os: 1, // const 1
      source: this.source,
      watermark: { state: this.watermark ? 1 : 0 },
    };
    for (const key of Object.keys(meta)) {
      if (meta[key] === null) delete meta[key];
    }
    return meta;
  }

  /**
   * 获取上传参数基本信息
   */
  async _pre(): Promise<any> {
    const api = API.pre;
    this.__pre_info = await new Api({ ...api, credential: this.__credential }).result;
    return this.__pre_info;
  }

  /**
   * 检查 tid 是否合法
   *
   * 与 Python 的差异：Python 读取本地缓存文件 data/video_uploader_meta_pre.json，
   * TS 仓库没有该数据文件，改为按需请求 "pre" 接口（结果模块内缓存）。
   */
  async _check_tid(): Promise<boolean> {
    if (VideoMeta.__tidListCache === null) {
      if (this.__pre_info === null || this.__pre_info === undefined) {
        await this._pre();
      }
      const tidList = (this.__pre_info && this.__pre_info.tid_list) || [];
      const ids: number[] = [];
      for (const parentType of tidList) {
        for (const childType of parentType.children || []) ids.push(childType.id);
      }
      VideoMeta.__tidListCache = ids;
    }
    return VideoMeta.__tidListCache.includes(this.tid);
  }

  static __tidListCache: number[] | null = null;

  /**
   * 检查封面是否合法
   */
  async _check_cover(): Promise<boolean> {
    try {
      await upload_cover(this.cover, this.__credential);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查 tag 是否合法（需要登录）
   */
  static async _check_tag_name(name: string, credential: Credential): Promise<boolean> {
    const api = API.check_tag_name;
    // Python 用 .result["code"]；而 result 会取 data/result 字段，这里改用原始响应判断 code。
    const resp = await new Api({ ...api, credential, ignore_code: true }).updateParams({ t: name }).request(true);
    return resp.code === 0;
  }

  /**
   * 检查所有 tag 是否合法
   */
  async _check_tags(): Promise<string[]> {
    const result: string[] = [];
    for (const tag of this.tags) {
      if (await VideoMeta._check_tag_name(tag, this.__credential)) result.push(tag);
    }
    return result;
  }

  /**
   * 检查 topic -> mission 是否存在
   */
  async _check_topic_to_mission(): Promise<number | boolean> {
    // 只知道能从这里获取...不确定其他地方的 topic -> mission 能否传入
    const allTopicInfo = await get_available_topics(this.tid, this.__credential);
    for (const topic of allTopicInfo) {
      if (topic.topic_id === this.topic_id) {
        return topic.mission_id;
      }
    }
    return false;
  }

  /**
   * 验证参数是否可用，仅供参考
   *
   * 检测 tags、delay_time、topic -> mission、cover 和 tid
   *
   * 验证失败会抛出异常
   */
  async verify(credential: Credential): Promise<boolean> {
    credential.raiseForNoSessdata();
    this.__credential = credential;

    const errorTags = await this._check_tags();
    if (errorTags.length !== 0) {
      throw new BiliApiException('以下 tags 不合法: ' + errorTags.join(","));
    }

    if (!(await this._check_tid())) {
      throw new BiliApiException("tid " + this.tid + " 不合法");
    }

    const topicToMission = await this._check_topic_to_mission();
    // Python 中 bool 是 int 的子类，False 也会进入 isinstance(..., int) 分支（且不会报错），这里保持一致。
    if (typeof topicToMission === "number" || typeof topicToMission === "boolean") {
      this.mission_id = topicToMission as any;
    } else if (!topicToMission) {
      throw new BiliApiException("topic -> mission 不存在: " + this.topic_id + " -> " + this.mission_id);
    }

    if (!(await this._check_cover())) {
      throw new BiliApiException("封面不合法 " + this.cover.toString());
    }

    if (this.delay_time !== null && this.delay_time !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      if (this.delay_time < now + 7200) throw new BiliApiException("delay_time 不能小于两小时");
      if (this.delay_time > now + 3600 * 24 * 15) throw new BiliApiException("delay_time 不能大于十五天");
    }
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* 视频上传                                                             */
/* ------------------------------------------------------------------ */

export class VideoUploader extends AsyncEvent {
  pages: VideoUploaderPage[];
  meta: VideoMeta | Record<string, any>;
  credential: Credential;
  cover: Picture;
  line: LineInfo | Lines | string | null;

  __task: Promise<any> | null = null;
  __aborted = false;

  constructor(
    pages: VideoUploaderPage[],
    meta: VideoMeta | Record<string, any>,
    credential: Credential,
    cover: string | Picture = "",
    line: Lines | string | null = null,
  ) {
    super();
    this.meta = meta;
    this.pages = pages;
    this.credential = credential;
    if (meta instanceof VideoMeta) {
      this.cover = meta.cover;
    } else if (cover instanceof Picture) {
      this.cover = cover;
    } else if (typeof cover === "string" && cover !== "") {
      this.cover = Picture.from_file(cover);
    } else {
      throw new BiliApiException("meta 为 dict 时必须传入封面（cover）");
    }
    this.line = line as any;
  }

  /** 当前线路信息（start() 之后必为具体线路）。 */
  __getLineInfo(): LineInfo {
    const line = this.line as any;
    if (line === null || line === undefined) throw new BiliApiException("尚未选择线路，请先调用 start()");
    if (typeof line === "string") {
      const info = (LINES_INFO as Record<string, LineInfo>)[line];
      if (!info) throw new BiliApiException("未知线路：" + line);
      return info;
    }
    return line as LineInfo;
  }

  /**
   * 分 P 上传初始化
   */
  async _preupload(page: VideoUploaderPage): Promise<any> {
    this.dispatch(VideoUploaderEvents.PREUPLOAD, { page });
    const api = API.preupload;
    const line = this.__getLineInfo();

    // 首先获取视频文件预检信息（以下 version/build 等参数与 Python 源码一致，覆盖数据文件中的默认值）
    const resp = await rawRequest({
      method: "GET",
      url: api.url,
      params: {
        profile: "ugcfx/bup",
        name: pyBasename(page.path),
        size: page.get_size(),
        r: line.os,
        ssl: "0",
        version: "2.14.0",
        build: "2100400",
        upcdn: line.upcdn,
        probe_version: line.probe_version,
      },
      cookies: await this.credential.getBuvidCookies(),
    });
    if (resp.status >= 400) {
      this.dispatch(VideoUploaderEvents.PREUPLOAD_FAILED, { page });
      throw new NetworkException(resp.status, "");
    }

    let preupload: any = JSON.parse(resp.text);

    if (preupload.OK !== 1) {
      this.dispatch(VideoUploaderEvents.PREUPLOAD_FAILED, { page });
      throw new BiliApiException(jsonText(preupload));
    }

    preupload = VideoUploader._switch_upload_endpoint(preupload, line);
    const url = VideoUploader._get_upload_url(preupload);

    // 获取 upload_id
    const respId = await rawRequest({
      method: "POST",
      url: url,
      headers: { "x-upos-auth": preupload.auth },
      params: {
        uploads: "",
        output: "json",
        profile: "ugcfx/bup",
        filesize: page.get_size(),
        partsize: preupload.chunk_size,
        biz_id: preupload.biz_id,
      },
    });
    if (respId.status >= 400) {
      this.dispatch(VideoUploaderEvents.PREUPLOAD_FAILED, { page });
      throw new BiliApiException("获取 upload_id 错误");
    }

    const data = JSON.parse(respId.text);
    if (data.OK !== 1) {
      this.dispatch(VideoUploaderEvents.PREUPLOAD_FAILED, { page });
      throw new BiliApiException("获取 upload_id 错误：" + jsonText(data));
    }

    preupload.upload_id = data.upload_id;
    return preupload;
  }

  async _main(): Promise<any> {
    const videos: any[] = [];
    for (const page of this.pages) {
      if (this.__aborted) throw new VideoUploadAbortedException();
      const data = await this._upload_page(page);
      videos.push({
        title: page.title,
        desc: page.description,
        filename: data.filename,
        cid: data.cid,
      });
    }

    const coverUrl = await this._upload_cover();

    const result = await this._submit(videos, coverUrl);

    this.dispatch(VideoUploaderEvents.COMPLETED, result);
    return result;
  }

  /**
   * 开始上传
   *
   * @returns 返回带有 bvid 和 aid 的字典。
   */
  async start(): Promise<any> {
    this.line = await _choose_line(this.line as any);
    const task = this._main();
    this.__task = task;

    try {
      const result = await task;
      this.__task = null;
      return result;
    } catch (error) {
      this.__task = null;
      if (error instanceof VideoUploadAbortedException) {
        // 忽略主动取消异常（与 Python 一致）
        return undefined as any;
      }
      this.dispatch(VideoUploaderEvents.FAILED, { err: error });
      throw error;
    }
  }

  /**
   * 上传封面
   *
   * @returns 封面 URL
   */
  async _upload_cover(): Promise<string> {
    this.dispatch(VideoUploaderEvents.PRE_COVER, null);
    try {
      const coverUrl = await upload_cover(this.cover, this.credential);
      this.dispatch(VideoUploaderEvents.AFTER_COVER, { url: coverUrl });
      return coverUrl;
    } catch (error) {
      this.dispatch(VideoUploaderEvents.COVER_FAILED, { err: error });
      throw error;
    }
  }

  /**
   * 上传分 P
   *
   * @returns filename: 该分 P 的标识符（submit 时的 videos[n].filename）；cid: 分 P 的 cid
   */
  async _upload_page(page: VideoUploaderPage): Promise<any> {
    const preupload = await this._preupload(page);
    this.dispatch(VideoUploaderEvents.PRE_PAGE, { page });

    const pageSize = page.get_size();
    // 所有分块起始位置
    const chunkOffsetList: number[] = [];
    for (let offset = 0; offset < pageSize; offset += preupload.chunk_size) chunkOffsetList.push(offset);
    // 分块总数
    const totalChunkCount = chunkOffsetList.length;
    // 上传队列（Python 用 insert(0, ...) 再 pop()，即后进先出，这里保持同样顺序）
    const chunksPending: Array<{ offset: number; chunkNumber: number }> = [];
    // 缓存 upload_id，这玩意只能从上传的分块预检结果获得
    const uploadId = preupload.upload_id;
    for (let index = 0; index < chunkOffsetList.length; index += 1) {
      chunksPending.unshift({ offset: chunkOffsetList[index], chunkNumber: index });
    }

    const threads = Number(preupload.threads) > 0 ? Number(preupload.threads) : 1;
    const runChunk = (item: { offset: number; chunkNumber: number }) =>
      this._upload_chunk(page, item.offset, item.chunkNumber, totalChunkCount, preupload);

    while (chunksPending.length > 0) {
      if (this.__aborted) throw new VideoUploadAbortedException();
      const batch: Array<{ offset: number; chunkNumber: number }> = [];
      while (batch.length < threads && chunksPending.length > 0) {
        batch.push(chunksPending.pop()!);
      }

      const result = await Promise.all(batch.map(runChunk));

      for (const item of result) {
        if (!item.ok) {
          chunksPending.unshift({ offset: item.offset, chunkNumber: item.chunk_number });
        }
      }
    }

    const data = await this._complete_page(page, totalChunkCount, preupload, uploadId);

    this.dispatch(VideoUploaderEvents.AFTER_PAGE, { page });

    return data;
  }

  /** 替换线路 endpoint */
  static _switch_upload_endpoint(preupload: any, line: any = null): any {
    if (line !== null && line !== undefined) {
      const endpoint = String(preupload.endpoint ?? "");
      if (/\/\/upos-(sz|cs)-upcdn(bda2|ws|qn)\.bilivideo\.com/.test(endpoint)) {
        preupload.endpoint = endpoint.replace(/upcdn(bda2|qn|ws)/, "upcdn" + line.upcdn);
      }
    }
    return preupload; // tbh not needed since it is ref type
  }

  /** 上传目标 URL */
  static _get_upload_url(preupload: any): string {
    const uri = String(preupload.upos_uri ?? "");
    const prefix = "upos://";
    const stripped = uri.startsWith(prefix) ? uri.slice(prefix.length) : uri;
    return "https:" + preupload.endpoint + "/" + stripped;
  }

  /**
   * 上传视频分块
   */
  async _upload_chunk(
    page: VideoUploaderPage,
    offset: number,
    chunk_number: number,
    total_chunk_count: number,
    preupload: any,
  ): Promise<any> {
    // abort() 之后立即中断后续分块（对应 Python 的 task.cancel）
    if (this.__aborted) throw new VideoUploadAbortedException();
    const chunk_event_callback_data: Record<string, any> = {
      page,
      offset,
      chunk_number,
      total_chunk_count,
    };
    this.dispatch(VideoUploaderEvents.PRE_CHUNK, chunk_event_callback_data);

    // 只读取当前分块的字节，不把整个文件读入内存
    const chunkSize = preupload.chunk_size;
    const fd = openSync(page.path, "r");
    let chunk: Buffer;
    try {
      const buffer = Buffer.alloc(chunkSize);
      const bytesRead = readSync(fd, buffer, 0, chunkSize, offset);
      chunk = buffer.subarray(0, bytesRead);
    } finally {
      closeSync(fd);
    }

    // 上传目标 URL
    preupload = VideoUploader._switch_upload_endpoint(preupload, this.line);
    const url = VideoUploader._get_upload_url(preupload);

    const err_return = {
      ok: false,
      chunk_number,
      offset,
      page,
    };

    const realChunkSize = chunk.length;

    const params = {
      partNumber: String(chunk_number + 1),
      uploadId: String(preupload.upload_id),
      chunk: String(chunk_number),
      chunks: String(total_chunk_count),
      size: String(realChunkSize),
      start: String(offset),
      end: String(offset + realChunkSize),
      total: page.get_size(),
    };

    const ok_return = {
      ok: true,
      chunk_number,
      offset,
      page,
    };

    try {
      const resp = await binaryRequest({
        method: "PUT",
        url,
        body: chunk,
        params,
        headers: { "x-upos-auth": preupload.auth },
      });
      if (resp.status >= 400) {
        chunk_event_callback_data.info = "Status " + resp.status;
        this.dispatch(VideoUploaderEvents.CHUNK_FAILED, chunk_event_callback_data);
        return err_return;
      }

      const data = resp.text;
      if (data !== "MULTIPART_PUT_SUCCESS" && data !== "") {
        chunk_event_callback_data.info = "分块上传失败";
        this.dispatch(VideoUploaderEvents.CHUNK_FAILED, chunk_event_callback_data);
        return err_return;
      }
    } catch (error) {
      chunk_event_callback_data.info = String((error as any)?.message ?? error);
      this.dispatch(VideoUploaderEvents.CHUNK_FAILED, chunk_event_callback_data);
      return err_return;
    }

    this.dispatch(VideoUploaderEvents.AFTER_CHUNK, chunk_event_callback_data);
    return ok_return;
  }

  /**
   * 提交分 P 上传
   */
  async _complete_page(
    page: VideoUploaderPage,
    chunks: number,
    preupload: any,
    upload_id: string,
  ): Promise<any> {
    this.dispatch(VideoUploaderEvents.PRE_PAGE_SUBMIT, { page });

    const parts: Array<{ partNumber: number; eTag: string }> = [];
    for (let index = 1; index <= chunks; index += 1) parts.push({ partNumber: index, eTag: "etag" });
    const data = { parts };

    const params = {
      output: "json",
      name: pyBasename(page.path),
      profile: "ugcfx/bup",
      uploadId: upload_id,
      biz_id: preupload.biz_id,
    };

    preupload = VideoUploader._switch_upload_endpoint(preupload, this.line);
    const url = VideoUploader._get_upload_url(preupload);

    const resp = await binaryRequest({
      method: "POST",
      url,
      body: JSON.stringify(data),
      headers: {
        "x-upos-auth": preupload.auth,
        "content-type": "application/json; charset=UTF-8",
      },
      params,
    });
    if (resp.status >= 400) {
      const err = new NetworkException(resp.status, "状态码错误，提交分 P 失败");
      this.dispatch(VideoUploaderEvents.PAGE_SUBMIT_FAILED, { page, err });
      throw err;
    }

    const result = JSON.parse(resp.text);
    if (result.OK !== 1) {
      const err = new ResponseCodeException(-1, "提交分 P 失败，原因: " + result.message);
      this.dispatch(VideoUploaderEvents.PAGE_SUBMIT_FAILED, { page, err });
      throw err;
    }

    this.dispatch(VideoUploaderEvents.AFTER_PAGE_SUBMIT, { page });

    const key = String(result.key ?? "").replace(/^\//, "");
    return {
      filename: pySplitextRoot(key),
      cid: preupload.biz_id,
    };
  }

  /**
   * 提交视频
   *
   * @returns 含 bvid 和 aid 的字典
   */
  async _submit(videos: any[], cover_url = ""): Promise<any> {
    const meta: Record<string, any> = {
      ...((this.meta instanceof VideoMeta ? this.meta.__dict__() : this.meta) as Record<string, any>),
    };
    meta.cover = cover_url;
    meta.videos = videos;

    this.dispatch(VideoUploaderEvents.PRE_SUBMIT, deepCopy(meta));

    meta.csrf = this.credential.bili_jct; // csrf 不需要 print
    const api = API.submit;

    try {
      const params = { csrf: this.credential.bili_jct, t: Date.now() };
      // 已有 json_body，似乎不需要单独设置 content-type
      const resp = await new Api({ ...api, credential: this.credential, no_csrf: true, json_body: true })
        .updateParams(params)
        .updateData(meta).result;
      this.dispatch(VideoUploaderEvents.AFTER_SUBMIT, resp);
      return resp;
    } catch (error) {
      this.dispatch(VideoUploaderEvents.SUBMIT_FAILED, { err: error });
      throw error;
    }
  }

  /** 中断上传 */
  async abort(): Promise<void> {
    if (this.__task) this.__aborted = true;
    this.dispatch(VideoUploaderEvents.ABORTED, null);
  }
}

/* ------------------------------------------------------------------ */
/* 活动                                                                */
/* ------------------------------------------------------------------ */

/**
 * 获取活动信息
 */
export async function get_missions(tid = 0, credential: Credential = new Credential()): Promise<any> {
  const api = API.missions;
  const params = { tid };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/* ------------------------------------------------------------------ */
/* 稿件编辑                                                             */
/* ------------------------------------------------------------------ */

export enum VideoEditorEvents {
  PRELOAD = "PRELOAD",
  AFTER_PRELOAD = "AFTER_PRELOAD",
  PRELOAD_FAILED = "PRELOAD_FAILED",

  PRE_COVER = "PRE_COVER",
  AFTER_COVER = "AFTER_COVER",
  COVER_FAILED = "COVER_FAILED",

  PRE_SUBMIT = "PRE_SUBMIT",
  SUBMIT_FAILED = "SUBMIT_FAILED",
  AFTER_SUBMIT = "AFTER_SUBMIT",

  COMPLETED = "COMPLETE",
  ABORTED = "ABORTED",
  FAILED = "FAILED",
}

/**
 * 视频稿件编辑
 */
export class VideoEditor extends AsyncEvent {
  bvid: string;
  meta: Record<string, any>;
  credential: Credential;
  cover_path: string | Picture;

  __old_configs: any = {};
  __task: Promise<any> | null = null;
  __aborted = false;

  constructor(bvid: string, meta: Record<string, any>, cover: string | Picture = "", credential: Credential | null = null) {
    super();
    this.bvid = bvid;
    this.meta = meta;
    this.credential = credential ? credential : new Credential();
    this.cover_path = cover;
    this.__old_configs = {};
    this.meta.aid = bvid2aid(bvid);
  }

  /** 在本地缓存原来的上传信息 */
  async _fetch_configs(): Promise<void> {
    this.dispatch(VideoEditorEvents.PRELOAD);
    try {
      const api = API.upload_args;
      const params = { bvid: this.bvid };
      this.__old_configs = await new Api({ ...api, credential: this.credential }).updateParams(params).result;
    } catch (error) {
      // Python 原版此处 dispatch 的是集合 {"err", e}，这里修正为 { err: e }
      this.dispatch(VideoEditorEvents.PRELOAD_FAILED, { err: error });
      throw error;
    }
    this.dispatch(VideoEditorEvents.AFTER_PRELOAD, { data: this.__old_configs });
  }

  /** 更换封面 */
  async _change_cover(): Promise<void> {
    if (this.cover_path === "") return;
    this.dispatch(VideoEditorEvents.PRE_COVER, null);
    try {
      const pic = this.cover_path instanceof Picture ? this.cover_path : Picture.from_file(this.cover_path);
      // Python 原版把 upload_cover 返回的 str 当成 dict 用（resp["url"] / resp["image_url"]），必然报错；
      // 这里直接使用返回的封面 URL。
      const url = await upload_cover(pic, this.credential);
      this.dispatch(VideoEditorEvents.AFTER_COVER, { url });
      this.meta.cover = url;
    } catch (error) {
      this.dispatch(VideoEditorEvents.COVER_FAILED, { err: error });
      throw error;
    }
  }

  async _submit(): Promise<void> {
    const api = API.edit;
    const data = this.meta;
    data.csrf = this.credential.bili_jct;
    this.dispatch(VideoEditorEvents.PRE_SUBMIT);
    try {
      const params = { csrf: this.credential.bili_jct, t: Math.floor(Date.now() / 1000) };
      const headers = {
        "content-type": "application/json;charset=UTF-8",
        referer: "https://member.bilibili.com",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      };
      const resp = await new Api({ ...api, credential: this.credential, no_csrf: true, json_body: true })
        .updateParams(params)
        .updateData(data)
        .updateHeaders(headers).result;
      this.dispatch(VideoEditorEvents.AFTER_SUBMIT, resp);
    } catch (error) {
      // Python 原版此处 dispatch 的是集合 {"err", e}，这里修正为 { err: e }
      this.dispatch(VideoEditorEvents.SUBMIT_FAILED, { err: error });
      throw error;
    }
  }

  async _main(): Promise<any> {
    await this._fetch_configs();
    if (this.__aborted) throw new VideoUploadAbortedException();
    this.meta.videos = [];
    let cnt = 0;
    for (const v of this.__old_configs.videos) {
      const item: Record<string, any> = { title: v.title, desc: v.desc, filename: v.filename };
      this.meta.videos.push(item);
      const cid = await new Video({ bvid: this.bvid }).get_cid(cnt);
      this.meta.videos[this.meta.videos.length - 1].cid = cid;
      cnt += 1;
    }
    this.meta.cover = this.__old_configs.archive.cover;
    this.meta.tid = this.__old_configs.archive.tid;
    if (this.__aborted) throw new VideoUploadAbortedException();
    await this._change_cover();
    if (this.__aborted) throw new VideoUploadAbortedException();
    await this._submit();
    this.dispatch(VideoEditorEvents.COMPLETED);
    return { bvid: this.bvid };
  }

  /**
   * 开始更改
   *
   * @returns 返回带有 bvid 的字典。
   */
  async start(): Promise<any> {
    const task = this._main();
    this.__task = task;

    try {
      const result = await task;
      this.__task = null;
      return result;
    } catch (error) {
      this.__task = null;
      if (error instanceof VideoUploadAbortedException) {
        return undefined as any;
      }
      this.dispatch(VideoEditorEvents.FAILED, { err: error });
      throw error;
    }
  }

  /** 中断更改 */
  async abort(): Promise<void> {
    if (this.__task) this.__aborted = true;
    this.dispatch(VideoEditorEvents.ABORTED, null);
  }
}
