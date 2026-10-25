// 离线证明「请求构造正确」的探针：拦截 globalThis.fetch，记录每一次真实要发出的请求，
// 并按路由返回**假**响应。它不访问 B 站，也不读写任何凭证文件。

const NAV = {
  code: 0,
  data: {
    isLogin: true,
    mid: 10001,
    uname: "stub",
    wbi_img: {
      img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
      sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
    },
  },
};

const SPI = { code: 0, data: { b_3: "stub-buvid3", b_4: "stub-buvid4" } };

function defaultResponse(url) {
  if (url.includes("/x/web-interface/nav")) return NAV;
  if (url.includes("/x/frontend/finger/spi")) return SPI;
  return { code: 0, data: { stub: true } };
}

async function describeBody(body) {
  if (body === undefined || body === null) return { kind: "none", fields: {} };
  if (typeof body === "string") {
    const fields = {};
    for (const pair of body.split("&")) {
      if (!pair) continue;
      const index = pair.indexOf("=");
      const key = decodeURIComponent(index === -1 ? pair : pair.slice(0, index));
      const value = index === -1 ? "" : decodeURIComponent(pair.slice(index + 1).replace(/\+/g, " "));
      fields[key] = value;
    }
    return { kind: "form", fields, raw: body };
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const fields = {};
    const files = [];
    for (const [key, value] of body.entries()) {
      if (typeof value === "string") fields[key] = value;
      else files.push({ field: key, filename: value.name, type: value.type, size: value.size });
    }
    return { kind: "multipart", fields, files };
  }
  return { kind: typeof body, fields: {} };
}

/**
 * 安装 fetch 探针。
 * @param {(url: string) => object} [responder] 自定义响应，返回 JSON 对象
 */
export function installFetchStub(responder = defaultResponse) {
  const original = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : String(input && input.url ? input.url : input);
    const method = String(init.method || "GET").toUpperCase();
    const headers = {};
    if (init.headers) {
      const entries = init.headers instanceof Headers ? init.headers.entries() : Object.entries(init.headers);
      for (const [key, value] of entries) headers[String(key).toLowerCase()] = String(value);
    }
    const described = await describeBody(init.body);
    requests.push({ url, method, headers, body: described });

    const payload = responder(url, { method, headers, body: described }) || { code: 0, data: {} };
    // 二进制接口（弹幕 .so / xml）：responder 直接返回 Buffer 时原样送出。
    if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
      return new Response(payload, { status: 200, headers: { "content-type": "application/octet-stream" } });
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  return {
    requests,
    uninstall() {
      globalThis.fetch = original;
    },
    reset() {
      requests.length = 0;
    },
    find(pattern) {
      return requests.filter((item) => (typeof pattern === "string" ? item.url.includes(pattern) : pattern.test(item.url)));
    },
    /** 取最后一次匹配的请求 */
    last(pattern) {
      const matched = this.find(pattern);
      return matched[matched.length - 1];
    },
  };
}

/** 生成一个带 dummy 凭证的 Credential，避免真的读磁盘。 */
export async function stubCredential(CredentialClass) {
  return new CredentialClass({
    sessdata: "stub-sessdata",
    bili_jct: "stub-bili-jct",
    buvid3: "stub-buvid3",
    buvid4: "stub-buvid4",
    dedeuserid: "10001",
  });
}

/** 1x1 透明 PNG 的字节，供上传类接口在内存里构造 Picture。 */
export const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** protobuf 基础编码：字段 tag（wire type 0 或 2）+ 值。 */
export function pbVarint(value) {
  const bytes = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}

export function pbKey(field, wireType) {
  return pbVarint(field * 8 + wireType);
}

export function pbInt(field, value) {
  return Buffer.concat([pbKey(field, 0), pbVarint(value)]);
}

export function pbString(field, value) {
  const content = Buffer.from(value, "utf8");
  return Buffer.concat([pbKey(field, 2), pbVarint(content.length), content]);
}

export function pbMessage(field, parts) {
  const content = Buffer.concat(parts);
  return Buffer.concat([pbKey(field, 2), pbVarint(content.length), content]);
}

export function samplePngBuffer() {
  return Buffer.from(SAMPLE_PNG_BASE64, "base64");
}
