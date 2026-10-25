/**
 * bilibili_api.utils.danmaku 的 TypeScript 移植。
 *
 * 对应 Python：bilibili_api/utils/danmaku.py（199 行）。
 *
 * 包含 DmFontSize、DmMode 两个枚举与 Danmaku、SpecialDanmaku 两个类，
 * 属性名与 Python 完全一致（id_、dm_time、mode、font_size、color、crc32_id、
 * text、send_time、weight、action、pool、id_str、attr、uid 等）。
 *
 * 未移植项：
 * - 本版 Python 的 danmaku.py 里没有 DanmakuSwitch、也没有 from_xml，
 *   因此这里同样不提供；
 * - 不依赖 danmaku2ass / PIL：Python 版本身也没有用到，to_xml() 是纯字符串拼接。
 *
 * 与 Python 的语义差异：
 * - Python 用关键字参数构造（Danmaku(text, dm_time=..., ...)），这里改为
 *   new Danmaku(text, { dm_time: ... }) 的 options 对象，与本仓库其他类的风格一致；
 * - Python 的 send_time 默认值 time.time() 在函数定义（模块导入）时求值，属于已知
 *   quirk；这里在每次构造时取当前时间，符合文档描述的意图；
 * - Python 的 __str__ / __len__ 分别对应 toString() / length getter。
 */

/**
 * 字体大小枚举。
 *
 * - EXTREME_SMALL
 * - SUPER_SMALL
 * - SMALL
 * - NORMAL
 * - BIG
 * - SUPER_BIG
 * - EXTREME_BIG
 */
export enum DmFontSize {
  EXTREME_SMALL = 12,
  SUPER_SMALL = 16,
  SMALL = 18,
  NORMAL = 25,
  BIG = 36,
  SUPER_BIG = 45,
  EXTREME_BIG = 64,
}

/**
 * 弹幕模式枚举。
 *
 * - FLY: 飞行弹幕
 * - TOP: 置顶弹幕
 * - BOTTOM: 底部弹幕
 * - REVERSE: 反向弹幕
 * - ADVANCE: 高级弹幕
 * - CODE: 代码弹幕 (基于 flash 实现)
 * - SPECIAL: BAS 弹幕
 */
export enum DmMode {
  FLY = 1,
  TOP = 5,
  BOTTOM = 4,
  REVERSE = 6,
  ADVANCE = 7,
  CODE = 8,
  SPECIAL = 9,
}

/**
 * 取枚举的真实数值。
 *
 * TS 的数字枚举成员本身就是 number，直接返回；同时兼容外部传进来的
 * Python 风格枚举对象（带 value 字段）。
 */
function enumValue(value: any): any {
  return value !== null && value !== undefined && typeof value === "object" && "value" in value
    ? value.value
    : value;
}

/**
 * 按 Python str(float) 的风格输出数字：整数值补 ".0"，其余与 JS 一致。
 *
 * Python: 0.0 -> "0.0"，2.345 -> "2.345"，1700000000.0 -> "1700000000.0"。
 */
function pyFloatString(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e16) {
    return value.toFixed(1);
  }
  return String(value);
}

/**
 * 等价于 Python 的 int(color, 16)。
 *
 * @param color 十六进制颜色字符串，如 "ffffff"。
 * @returns 十进制数值。
 */
function hexToInt(color: string): number {
  let text = String(color).trim();
  let sign = 1;
  if (text.startsWith("+") || text.startsWith("-")) {
    if (text.startsWith("-")) sign = -1;
    text = text.slice(1);
  }
  if (text.startsWith("0x") || text.startsWith("0X")) {
    text = text.slice(2);
  }
  // Python 允许数字之间用单下划线分隔
  text = text.replace(/_/g, "");
  if (!/^[0-9a-fA-F]+$/.test(text)) {
    // 与 Python 的报错文字保持一致
    throw new Error(`invalid literal for int() with base 16: '${color}'`);
  }
  return sign * parseInt(text, 16);
}

/* ------------------------------------------------------------------ */
/* 弹幕 CRC32 ID 破解（对应 Python utils/utils.py 的 crack_uid）        */
/* ------------------------------------------------------------------ */

const CRC_POLYNOMIAL = 0xedb88320;

/** CRC32 查表，等价于 Python 版里的 __crctable。 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crcreg = i;
    for (let j = 0; j < 8; j += 1) {
      if ((crcreg & 1) !== 0) {
        crcreg = (CRC_POLYNOMIAL ^ (crcreg >>> 1)) >>> 0;
      } else {
        crcreg >>>= 1;
      }
    }
    table[i] = crcreg >>> 0;
  }
  return table;
})();

/** 等价于 Python 版的 __crc32：把字符串逐字符跑一遍 CRC32。 */
function crc32OfString(input: string): number {
  let crcstart = 0xffffffff;
  for (let i = 0; i < input.length; i += 1) {
    const index = (crcstart ^ input.charCodeAt(i)) & 0xff;
    crcstart = ((crcstart >>> 8) ^ CRC_TABLE[index]) >>> 0;
  }
  return crcstart >>> 0;
}

/** 等价于 Python 版的 __crc32lastindex：返回最后一轮查表用到的下标。 */
function crc32LastIndex(input: string): number {
  let crcstart = 0xffffffff;
  let index = 0;
  for (let i = 0; i < input.length; i += 1) {
    index = (crcstart ^ input.charCodeAt(i)) & 0xff;
    crcstart = ((crcstart >>> 8) ^ CRC_TABLE[index]) >>> 0;
  }
  return index;
}

/** 等价于 Python 版的 __getcrcindex：按高字节反查表下标，找不到返回 -1。 */
function getCrcIndex(t: number): number {
  for (let i = 0; i < 256; i += 1) {
    if (CRC_TABLE[i] >>> 24 === t) return i;
  }
  return -1;
}

/**
 * 等价于 Python 版的 __deepCheck。
 *
 * @returns 命中的三位尾号；不匹配时返回 null（对应 Python 的 [0]）。
 */
function deepCheck(i: number, index: number[]): string | null {
  const digits: number[] = [];
  let hash = crc32OfString(String(i));

  let tc = (hash & 0xff) ^ index[2];
  if (!(57 >= tc && tc >= 48)) return null;
  digits.push(tc - 48);
  hash = (CRC_TABLE[index[2]] ^ (hash >>> 8)) >>> 0;

  tc = (hash & 0xff) ^ index[1];
  if (!(57 >= tc && tc >= 48)) return null;
  digits.push(tc - 48);
  hash = (CRC_TABLE[index[1]] ^ (hash >>> 8)) >>> 0;

  tc = (hash & 0xff) ^ index[0];
  if (!(57 >= tc && tc >= 48)) return null;
  digits.push(tc - 48);

  return digits.join("");
}

/**
 * 弹幕中的 CRC32 ID 转换成用户 UID。
 *
 * 对应 Python utils/utils.py 的 crack_uid。暴力搜索 10000000 以内的 UID，
 * 结果不一定准确，仅供参考。算法翻译自 https://github.com/esterTion/BiliBili_crc2mid。
 *
 * @param crc32Id crc32 计算摘要后的 UID（十六进制字符串）。
 * @returns 真实 UID；未命中返回 -1。
 */
function crackUid(crc32Id: string): number {
  const hex = String(crc32Id).trim();
  if (!/^(0x)?[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`invalid literal for int() with base 16: '${crc32Id}'`);
  }
  let ht = (parseInt(hex, 16) ^ 0xffffffff) >>> 0;
  const index: number[] = [0, 0, 0, 0];

  for (let i = 3; i >= 0; i -= 1) {
    const found = getCrcIndex(ht >>> (i * 8));
    index[3 - i] = found;
    // Python 里查不到时是 -1，而 __crctable[-1] 取的是最后一格，这里保持一致
    const snum = found < 0 ? CRC_TABLE[255] : CRC_TABLE[found];
    ht = (ht ^ (snum >>> ((3 - i) * 8))) >>> 0;
  }

  let resultIndex = 10000000;
  let suffix = "";
  for (let i = 0; i < 10000000; i += 1) {
    const lastindex = crc32LastIndex(String(i));
    if (lastindex === index[3]) {
      const deep = deepCheck(i, index);
      if (deep !== null) {
        resultIndex = i;
        suffix = deep;
        break;
      }
    }
  }

  if (resultIndex === 10000000) return -1;
  return Number(String(resultIndex) + suffix);
}

/* ------------------------------------------------------------------ */
/* 弹幕类                                                              */
/* ------------------------------------------------------------------ */

/** Danmaku 构造参数，对应 Python __init__ 的关键字参数。 */
export interface DanmakuOptions {
  /** 弹幕在视频中的位置，单位为秒。默认 0.0。 */
  dm_time?: number;
  /** 弹幕发送的时间（秒级时间戳）。默认为当前时间。 */
  send_time?: number;
  /** 弹幕发送者 UID 经 CRC32 算法取摘要后的值。默认 ""。 */
  crc32_id?: string;
  /** 弹幕十六进制颜色；大会员专属颜色时为 "special"。默认 "ffffff"。 */
  color?: string;
  /** 弹幕在弹幕列表显示的权重。默认 -1。 */
  weight?: number;
  /** 弹幕 ID。默认 -1。 */
  id_?: number;
  /** 弹幕字符串 ID。默认 ""。 */
  id_str?: string;
  /** 暂不清楚。默认 ""。 */
  action?: string;
  /** 弹幕模式。默认 DmMode.FLY。 */
  mode?: DmMode | number;
  /** 弹幕字体大小。默认 DmFontSize.NORMAL。 */
  font_size?: DmFontSize | number;
  /** 是否为字幕弹幕。默认 false。 */
  is_sub?: boolean;
  /** 池。默认 0。 */
  pool?: number;
  /** 暂不清楚。默认 -1。 */
  attr?: number;
  /** 弹幕发送者 UID。默认 -1。 */
  uid?: number;
}

/**
 * 弹幕类。
 *
 * 大会员专属颜色文字填充：http://i0.hdslb.com/bfs/dm/9dcd329e617035b45d2041ac889c49cb5edd3e44.png
 * 大会员专属颜色背景填充：http://i0.hdslb.com/bfs/dm/ba8e32ae03a0a3f70f4e51975a965a9ddce39d50.png
 */
export class Danmaku {
  /** 弹幕文本。 */
  text: string;
  /** 弹幕在视频中的位置，单位为秒。 */
  dm_time: number;
  /** 弹幕发送的时间（秒级时间戳）。 */
  send_time: number;
  /** 弹幕发送者 UID 经 CRC32 算法取摘要后的值。 */
  crc32_id: string;
  /** 弹幕十六进制颜色；大会员专属颜色时为 "special"。 */
  color: string;
  /** 弹幕在弹幕列表显示的权重。 */
  weight: number;
  /** 弹幕 ID。 */
  id_: number;
  /** 弹幕字符串 ID。 */
  id_str: string;
  /** 暂不清楚。 */
  action: string;
  /** 弹幕模式（DmMode 的数值）。 */
  mode: number;
  /** 弹幕字体大小（DmFontSize 的数值）。 */
  font_size: number;
  /** 是否为字幕弹幕。 */
  is_sub: boolean;
  /** 池。 */
  pool: number;
  /** 暂不清楚。 */
  attr: number;
  /** 弹幕发送者 UID。 */
  uid: number;

  /**
   * @param text 弹幕文本。
   * @param options 其余属性，字段与 Python __init__ 的关键字参数一一对应。
   */
  constructor(text: string, options: DanmakuOptions = {}) {
    this.text = text;
    this.dm_time = options.dm_time ?? 0.0;
    // Python 的默认值 time.time() 在模块导入时求值；这里按文档意图取构造时间
    this.send_time = options.send_time ?? Date.now() / 1000;
    this.crc32_id = options.crc32_id ?? "";
    this.color = options.color ?? "ffffff";
    this.weight = options.weight ?? -1;
    this.id_ = options.id_ ?? -1;
    this.id_str = options.id_str ?? "";
    this.action = options.action ?? "";
    this.mode = enumValue(options.mode ?? DmMode.FLY);
    this.font_size = enumValue(options.font_size ?? DmFontSize.NORMAL);
    this.is_sub = options.is_sub ?? false;
    this.pool = options.pool ?? 0;
    this.attr = options.attr ?? -1;
    this.uid = options.uid ?? -1;
  }

  /**
   * 对应 Python 的 __str__："发送时间, 视频内时间, 文本"。
   */
  toString(): string {
    return `${pyFloatString(this.send_time)}, ${pyFloatString(this.dm_time)}, ${this.text}`;
  }

  /**
   * 对应 Python 的 __len__：文本长度。
   *
   * 按 Unicode 码点计数（Python len 的语义），而非 UTF-16 码元。
   */
  get length(): number {
    return Array.from(this.text).length;
  }

  /**
   * 暴力破解 UID，可能存在误差，请慎重使用。
   *
   * 精确至 UID 小于 10000000 的破解。
   *
   * @param crc32_id crc32 id。
   * @returns 真实 UID；未命中返回 -1。
   */
  static crack_uid(crc32_id: string): number {
    return crackUid(crc32_id);
  }

  /**
   * 将弹幕转换为 xml 格式弹幕。
   *
   * color 为 "special" 时 Python 的 int(color, 16) 会抛错，这里同样抛错。
   *
   * @returns xml 字符串。
   */
  to_xml(): string {
    const txt = this.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const color = hexToInt(this.color);
    return (
      `<d p="${pyFloatString(this.dm_time)},${this.mode},${this.font_size},${color},` +
      `${pyFloatString(this.send_time)},${this.pool},${this.crc32_id},${this.id_},11">${txt}</d>`
    );
  }
}

/** SpecialDanmaku 构造参数，对应 Python __init__ 的关键字参数。 */
export interface SpecialDanmakuOptions {
  /** 弹幕 id。默认 -1。 */
  id_?: number;
  /** 弹幕 id（string 类型）。默认 ""。 */
  id_str?: string;
  /** 弹幕类型。默认 DmMode.SPECIAL。 */
  mode?: DmMode | number;
  /** 弹幕池。默认 2。 */
  pool?: number;
}

/**
 * 特殊弹幕（BAS 弹幕）类。
 */
export class SpecialDanmaku {
  /** 弹幕内容。 */
  content: string;
  /** 弹幕 id。 */
  id_: number;
  /** 弹幕 id（string 类型）。 */
  id_str: string;
  /** 弹幕类型（DmMode 的数值）。 */
  mode: number;
  /** 弹幕池。 */
  pool: number;

  /**
   * @param content 弹幕内容。
   * @param options 其余属性，字段与 Python __init__ 的关键字参数一一对应。
   */
  constructor(content: string, options: SpecialDanmakuOptions = {}) {
    this.content = content;
    this.id_ = options.id_ ?? -1;
    this.id_str = options.id_str ?? "";
    this.mode = enumValue(options.mode ?? DmMode.SPECIAL);
    this.pool = options.pool ?? 2;
  }

  /**
   * 对应 Python 的 __str__：直接返回内容。
   */
  toString(): string {
    return `${this.content}`;
  }
}
