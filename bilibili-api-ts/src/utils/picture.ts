import { readFileSync, writeFileSync } from "node:fs";

import { BiliAPIFile, Credential } from "./network";

/** 常见图片格式的字节长度解析：不依赖图像库，只读文件头。 */
function detectMeta(content: Buffer): { width: number; height: number; imageType: string } {
  // PNG: 89 50 4E 47 0D 0A 1A 0A，IHDR 位于 16 字节后
  if (content.length >= 24 && content.readUInt32BE(0) === 0x89504e47) {
    return { width: content.readUInt32BE(16), height: content.readUInt32BE(20), imageType: "png" };
  }
  // GIF87a / GIF89a
  if (content.length >= 10 && content.toString("ascii", 0, 3) === "GIF") {
    return { width: content.readUInt16LE(6), height: content.readUInt16LE(8), imageType: "gif" };
  }
  // JPEG：扫描 SOF 段
  if (content.length >= 4 && content[0] === 0xff && content[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < content.length) {
      if (content[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = content[offset + 1];
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { width: content.readUInt16BE(offset + 7), height: content.readUInt16BE(offset + 5), imageType: "jpg" };
      }
      const length = content.readUInt16BE(offset + 2);
      if (length <= 0) break;
      offset += 2 + length;
    }
    return { width: -1, height: -1, imageType: "jpg" };
  }
  // WebP：VP8 / VP8L / VP8X
  if (content.length >= 30 && content.toString("ascii", 0, 4) === "RIFF" && content.toString("ascii", 8, 12) === "WEBP") {
    const chunk = content.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      const width = 1 + content.readUIntLE(24, 3);
      const height = 1 + content.readUIntLE(27, 3);
      return { width, height, imageType: "webp" };
    }
    if (chunk === "VP8 ") {
      return { width: content.readUInt16LE(26) & 0x3fff, height: content.readUInt16LE(28) & 0x3fff, imageType: "webp" };
    }
    if (chunk === "VP8L") {
      const bits = content.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, imageType: "webp" };
    }
    return { width: -1, height: -1, imageType: "webp" };
  }
  // BMP
  if (content.length >= 26 && content.toString("ascii", 0, 2) === "BM") {
    return { width: content.readInt32LE(18), height: Math.abs(content.readInt32LE(22)), imageType: "bmp" };
  }
  return { width: -1, height: -1, imageType: "" };
}

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

export interface PictureOptions {
  height?: number;
  imageType?: string;
  size?: any;
  url?: string;
  width?: number;
  content?: Buffer | Uint8Array | string;
}

/**
 * 图片类：包含图片链接、尺寸以及下载 / 上传操作。
 *
 * 与 Python 版一致，可用 load_url / from_file / from_content 构造。
 * `convert_format`、`resize` 依赖 PIL，本移植未实现（会抛出明确错误）。
 */
export class Picture {
  height = -1;
  imageType = "";
  size: any = "";
  url = "";
  width = -1;
  content: Buffer = Buffer.alloc(0);

  constructor(options: PictureOptions = {}) {
    const { height = -1, imageType = "", size = "", url = "", width = -1, content = Buffer.alloc(0) } = options;
    this.height = height;
    this.imageType = imageType;
    this.size = size;
    this.url = url;
    this.width = width;
    this.content = Buffer.isBuffer(content) ? content : Buffer.from(content as any);
  }

  toString(): string {
    return "Picture(height='" + this.height + "', width='" + this.width + "', imageType='" + this.imageType + "', size=" + this.size + ", url='" + this.url + "')";
  }

  __setPictureMetaFromBytes(imageType?: string): void {
    const meta = detectMeta(this.content);
    this.size = Math.round(this.content.length / 1024);
    this.height = meta.height;
    this.width = meta.width;
    this.imageType = imageType || meta.imageType;
  }

  static async load_url(url: string): Promise<Picture> {
    if (!/^[a-z]+:\/\//i.test(url)) url = "https:" + url;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.54",
        Referer: url,
      },
    });
    if (response.status !== 200) throw new Error("图片下载失败：HTTP " + response.status);
    const obj = new Picture();
    obj.content = Buffer.from(await response.arrayBuffer());
    obj.url = url;
    const tail = url.split("/").pop() || "";
    obj.__setPictureMetaFromBytes(tail.split(".").pop()!.split("?")[0]);
    return obj;
  }

  static from_file(path: string): Picture {
    const obj = new Picture();
    obj.content = readFileSync(path);
    obj.url = "file://" + path;
    obj.__setPictureMetaFromBytes((path.split(/[\\/]/).pop() || "").split(".").pop());
    return obj;
  }

  static from_content(content: Buffer | Uint8Array | string, format: string): Picture {
    const obj = new Picture();
    obj.content = Buffer.isBuffer(content) ? content : Buffer.from(content as any);
    obj.url = "bytes://" + obj.content.toString("utf-8");
    obj.__setPictureMetaFromBytes(format);
    return obj;
  }

  _toBiliapifile(): BiliAPIFile {
    const format = this.imageType || "png";
    return {
      path: undefined,
      content: this.content,
      mimeType: MIME_BY_FORMAT[format.toLowerCase()] || "application/octet-stream",
    };
  }

  /** 上传图片至 B 站（动态图床），返回 self。 */
  async upload(credential: Credential): Promise<Picture> {
    const { upload_image } = await import("../dynamic");
    const res: any = await upload_image(this, credential);
    this.height = res.image_height;
    this.width = res.image_width;
    this.url = res.image_url;
    this.size = res.img_size;
    const loaded = await Picture.load_url(this.url);
    this.content = loaded.content;
    return this;
  }

  convert_format(): never {
    throw new Error("Picture.convert_format 依赖 Python PIL，本移植未实现；请先转换好图片再传入。");
  }

  resize(): never {
    throw new Error("Picture.resize 依赖 Python PIL，本移植未实现；请先调整好图片尺寸再传入。");
  }

  to_file(path: string): Picture {
    writeFileSync(path, this.content);
    this.url = "file://" + path;
    return this;
  }

  /** 转成 B 站 API 里描述图片的 JSON 结构。 */
  to_json(): Record<string, any>[] {
    return [
      {
        img_src: this.url,
        img_width: this.width,
        img_height: this.height,
        img_size: this.size,
      },
    ];
  }
}

