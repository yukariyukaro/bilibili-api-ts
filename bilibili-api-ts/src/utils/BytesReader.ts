/**
 * bilibili_api.utils.BytesReader 的 TypeScript 移植。
 *
 * 对应 Python：bilibili_api/utils/BytesReader.py（244 行）。
 *
 * 这是一个用于手工解析 protobuf 的极简流式读取器（B 站弹幕 protobuf 用到）。
 * Python 版依赖 struct.unpack 与 utils/varint.py 的 read_varint；因为本仓库
 * 还没有单独的 varint.ts，read_varint 放在本文件内（保持同名导出，日后可拆走）。
 *
 * 行为约定（尽量与 Python 一致）：
 * - 每个读取方法都会推进内部游标；
 * - 多字节数值默认按大端读取，LE = true 时小端，等价于 struct 的 ">x" / "<x"；
 * - 带长度前缀的 string / bytes_string 在字节不足时按 Python 切片语义静默截断；
 *   定长读取（double / fixed* 等）在字节不足时抛错，对应 Python 的 struct.error；
 * - byte() / bool() 越界抛错，对应 Python 的 IndexError。
 *
 * 与 Python 的已知差异：
 * - Python int 是任意精度，这里用 number（安全整数上限 2^53 - 1）；固定 64 位读取
 *   经 BigInt 转换，超过安全整数范围会丢精度；
 * - Python 的 decode(errors="ignore") 会丢弃非法字节，TextDecoder 会替换成 U+FFFD；
 * - 抛出的异常是普通 Error，文字为中文说明。
 */

/** 字节流类型：Node 的 Buffer 是 Uint8Array 的子类，可直接传入。 */
export type ByteStream = Uint8Array;

/** 构造 BytesReader 时允许的输入类型。 */
export type ByteLike = Uint8Array | ArrayBuffer | ArrayLike<number>;

/**
 * 读取 varint，返回 [真实值, 占用的字节数]。
 *
 * 对应 Python utils/varint.py 的 read_varint。逐字节取低 7 位，最高位为 1
 * 表示后面还有字节；用 2 ** shift 而不是位运算，因为 JS 的 << 只有 32 位宽。
 *
 * 注意：与 Python 一样，字节流提前结束时返回 position + 1（可能多算 1 字节）。
 *
 * @param stream 字节流（从当前位置开始的一段）。
 * @returns [value, length]。
 */
export function read_varint(stream: Uint8Array): [number, number] {
  let value = 0;
  let position = 0;
  let shift = 0;
  while (true) {
    if (position >= stream.length) break;
    const byte = stream[position];
    value += (byte & 0b01111111) * 2 ** shift;
    if ((byte & 0b10000000) === 0) break;
    position += 1;
    shift += 7;
  }
  return [value, position + 1];
}

/** Python codec 名与 WHATWG TextDecoder 标签的差异映射。 */
const ENCODING_ALIASES: Record<string, string> = {
  utf8: "utf-8",
  u8: "utf-8",
  "utf-8": "utf-8",
  gb2312: "gbk",
  // WHATWG 规范里 latin1 系列标签实际指向 windows-1252，
  // 与 Python 的 iso-8859-1 在 0x80-0x9F 区间上不同。
  latin1: "windows-1252",
  "latin-1": "windows-1252",
  iso88591: "windows-1252",
};

/** TextDecoder 有构造开销，按编码缓存。 */
const DECODERS = new Map<string, TextDecoder>();

/**
 * 按指定编码把字节解码成字符串。
 *
 * @param data 待解码的字节。
 * @param encoding 编码名（Python 风格，如 "utf8"、"gbk"）。
 * @returns 字符串；非法字节会被替换成 U+FFFD（Python 是丢弃）。
 */
function decodeBytes(data: Uint8Array, encoding: string): string {
  const key = encoding.toLowerCase().replace(/_/g, "-");
  const label = ENCODING_ALIASES[key] ?? key;
  let decoder = DECODERS.get(label);
  if (!decoder) {
    try {
      decoder = new TextDecoder(label);
    } catch {
      // 未知编码时退回 UTF-8，避免直接抛错（Python 会抛 LookupError）
      decoder = new TextDecoder("utf-8");
    }
    DECODERS.set(label, decoder);
  }
  return decoder.decode(data);
}

/**
 * 把各种易用输入统一成 Uint8Array。
 *
 * @param stream 字节流、ArrayBuffer 或数字数组。
 * @returns Uint8Array（若是 Buffer 则保持为零拷贝视图）。
 */
function toBytes(stream: ByteLike): Uint8Array {
  if (stream instanceof Uint8Array) return stream;
  if (stream instanceof ArrayBuffer) return new Uint8Array(stream);
  if (ArrayBuffer.isView(stream)) {
    return new Uint8Array(stream.buffer, stream.byteOffset, stream.byteLength);
  }
  return Uint8Array.from(stream as ArrayLike<number>);
}

/**
 * 读字节流助手类。
 *
 * 对应 Python 的 BytesReader：游标从 0 开始，方法读取后自动推进。
 */
export class BytesReader {
  /** 原始字节流（Buffer 传入时即为 Buffer，零拷贝）。 */
  private stream: Uint8Array;
  /** 覆盖同一段内存的 DataView，用于 struct 风格读取。 */
  private view: DataView;
  /** 当前读取位置。 */
  private offset: number = 0;

  /**
   * @param stream 字节流。
   */
  constructor(stream: ByteLike) {
    this.stream = toBytes(stream);
    this.view = new DataView(this.stream.buffer, this.stream.byteOffset, this.stream.byteLength);
  }

  /**
   * 是否已读到末尾。
   *
   * @returns 游标是否已经不小于字节流长度。
   */
  has_end(): boolean {
    return this.offset >= this.stream.length;
  }

  /**
   * 读 double（8 字节浮点数）。
   *
   * @param LE 为小端。
   * @returns 浮点数。
   */
  double(LE: boolean = false): number {
    this.require(8, "double");
    const value = this.view.getFloat64(this.offset, LE);
    this.offset += 8;
    return value;
  }

  /**
   * 读 float（4 字节浮点数）。
   *
   * @param LE 为小端。
   * @returns 浮点数。
   */
  float(LE: boolean = false): number {
    this.require(4, "float");
    const value = this.view.getFloat32(this.offset, LE);
    this.offset += 4;
    return value;
  }

  /**
   * 读 varint。
   *
   * @returns 数值。
   */
  varint(): number {
    const [value, length] = read_varint(this.stream.subarray(this.offset));
    this.offset += length;
    return value;
  }

  /**
   * 读一个字节。
   *
   * @returns 0-255 的整数。
   */
  byte(): number {
    this.require(1, "byte");
    const data = this.stream[this.offset];
    this.offset += 1;
    return data;
  }

  /**
   * 读带长度前缀的字符串（protobuf 的 length-delimited string）。
   *
   * @param encoding 编码方式（Python 风格名字）。
   * @returns 字符串。
   */
  string(encoding: string = "utf8"): string {
    const strLen = this.varint();
    const start = this.offset;
    this.offset += strLen;
    // subarray 越界时会自动截断，与 Python 的切片一致
    return decodeBytes(this.stream.subarray(start, start + strLen), encoding);
  }

  /**
   * 读一个布尔值：读取 1 字节，等于 1 时为 true。
   *
   * @returns 布尔值。
   */
  bool(): boolean {
    this.require(1, "bool");
    const data = this.stream[this.offset];
    this.offset += 1;
    return data === 1;
  }

  /**
   * 读带长度前缀的原始字节流（protobuf 的 bytes 字段）。
   *
   * @returns 字节数组（复制一份，与 Python 切片语义一致）。
   */
  bytes_string(): Uint8Array {
    const strLen = this.varint();
    const start = this.offset;
    this.offset += strLen;
    return new Uint8Array(this.stream.subarray(start, start + strLen));
  }

  /**
   * 读 Fixed int16（有符号）。
   *
   * @param LE 为小端。
   * @returns 整数。
   */
  fixed16(LE: boolean = false): number {
    this.require(2, "fixed16");
    const value = this.view.getInt16(this.offset, LE);
    this.offset += 2;
    return value;
  }

  /**
   * 读 Fixed int32（有符号）。
   *
   * @param LE 为小端。
   * @returns 整数。
   */
  fixed32(LE: boolean = false): number {
    this.require(4, "fixed32");
    const value = this.view.getInt32(this.offset, LE);
    this.offset += 4;
    return value;
  }

  /**
   * 读 Fixed int64（有符号）。
   *
   * 内部用 BigInt 读取再转成 number，超出 2^53 - 1 会丢精度。
   *
   * @param LE 为小端。
   * @returns 整数。
   */
  fixed64(LE: boolean = false): number {
    this.require(8, "fixed64");
    const value = this.view.getBigInt64(this.offset, LE);
    this.offset += 8;
    return Number(value);
  }

  /**
   * 读 Unsigned fixed Int16。
   *
   * @param LE 为小端。
   * @returns 整数。
   */
  ufixed16(LE: boolean = false): number {
    this.require(2, "ufixed16");
    const value = this.view.getUint16(this.offset, LE);
    this.offset += 2;
    return value;
  }

  /**
   * 读 Unsigned fixed Int32。
   *
   * @param LE 为小端。
   * @returns 整数。
   */
  ufixed32(LE: boolean = false): number {
    this.require(4, "ufixed32");
    const value = this.view.getUint32(this.offset, LE);
    this.offset += 4;
    return value;
  }

  /**
   * 读 Unsigned fixed Int64。
   *
   * 内部用 BigInt 读取再转成 number，超出 2^53 - 1 会丢精度。
   *
   * @param LE 为小端。
   * @returns 整数。
   */
  ufixed64(LE: boolean = false): number {
    this.require(8, "ufixed64");
    const value = this.view.getBigUint64(this.offset, LE);
    this.offset += 8;
    return Number(value);
  }

  /**
   * 设置读取起始位置。
   *
   * @param pos 读取起始位置。
   */
  set_pos(pos: number): void {
    if (pos < 0) {
      throw new Error("读取位置不能小于 0");
    }
    if (pos >= this.stream.length) {
      throw new Error("读取位置超过字节流长度");
    }
    this.offset = pos;
  }

  /**
   * 获取当前位置。
   *
   * @returns 当前游标位置。
   */
  get_pos(): number {
    return this.offset;
  }

  /**
   * 校验剩余字节是否足够，不够则抛错（对应 Python 的 struct.error / IndexError）。
   *
   * @param n 需要的字节数。
   * @param method 出错的方法名，用于报错信息。
   */
  private require(n: number, method: string): void {
    if (this.offset + n > this.stream.length) {
      throw new Error(
        `BytesReader.${method}: 字节流长度不足，需要 ${n} 字节，剩余 ${this.stream.length - this.offset} 字节`,
      );
    }
  }
}
