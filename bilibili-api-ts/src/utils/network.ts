import { createHash, createHmac } from "node:crypto";
import { apiData } from "../data/api/index";
import {
  ArgsException,
  CookiesRefreshException,
  CredentialNoAcTimeValueException,
  CredentialNoBiliJctException,
  CredentialNoBuvid3Exception,
  CredentialNoBuvid4Exception,
  CredentialNoDedeUserIDException,
  CredentialNoSessdataException,
  NetworkException,
  ResponseCodeException,
  WbiRetryTimesExceedException,
} from "../exceptions";

export const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  Referer: "https://www.bilibili.com",
};

const OE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];
const APPKEY = "4409e2ce8ffd12b8";
const APPSEC = "59b43e04ad6965f34319062b478f83dd";

export function getApi(name: string): any {
  const api = apiData[name];
  if (!api) throw new ArgsException(`未知 API 数据：${name}`);
  return api;
}

function pyStr(value: any): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .map(([key, item]) => `${pyRepr(key)}: ${pyRepr(item)}`)
      .join(", ")}}`;
  }
  return String(value);
}

function pyRepr(value: any): string {
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  return pyStr(value);
}

function pyQuote(value: string, safe = ""): string {
  let encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  for (const char of safe) encoded = encoded.split(encodeURIComponent(char)).join(char);
  return encoded;
}

function pyQuotePlus(value: string): string {
  return pyQuote(value).replace(/%20/g, "+");
}

function encodePairs(params: Record<string, any>, doseq: boolean): [string, string][] {
  const pairs: [string, string][] = [];
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value === null || value === undefined) continue;
    if (doseq && Array.isArray(value)) {
      for (const item of value) pairs.push([pyQuotePlus(key), pyQuotePlus(pyStr(item))]);
    } else {
      pairs.push([pyQuotePlus(key), pyQuotePlus(pyStr(value))]);
    }
  }
  return pairs;
}

export function encodeQuery(params: Record<string, any>): string {
  return encodePairs(params, true)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function encodeForm(data: Record<string, any>): string {
  return encodePairs(data, true)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export const requestSettings = {
  wbiRetryTimes: 3,
  enableAutoBuvid: true,
  enableBiliTicket: false,
  timeout: 30000,
  proxy: "",
};

let cachedBuvid3 = "";
let cachedBuvid4 = "";
let cachedBiliTicket = "";
let cachedBiliTicketExpires = 0;
let cachedMixinKey = "";

export function refreshBuvid(): void {
  cachedBuvid3 = "";
  cachedBuvid4 = "";
}

export function refreshBiliTicket(): void {
  cachedBiliTicket = "";
  cachedBiliTicketExpires = 0;
}

export function recalculateWbi(): void {
  cachedMixinKey = "";
}

export interface CredentialOptions {
  sessdata?: string | null;
  bili_jct?: string | null;
  buvid3?: string | null;
  buvid4?: string | null;
  dedeuserid?: string | null;
  ac_time_value?: string | null;
  proxy?: string | null;
  [key: string]: any;
}

export class Credential {
  sessdata: string | null;
  bili_jct: string | null;
  buvid3: string | null;
  buvid4: string | null;
  dedeuserid: string | null;
  ac_time_value: string | null;
  proxy: string | null;
  [key: string]: any;

  constructor(options: CredentialOptions = {}) {
    const {
      sessdata = null,
      bili_jct = null,
      buvid3 = null,
      buvid4 = null,
      dedeuserid = null,
      ac_time_value = null,
      proxy = null,
      ...rest
    } = options;
    this.sessdata = sessdata === null ? null : sessdata.includes("%") ? sessdata : pyQuote(sessdata, "/");
    this.bili_jct = bili_jct;
    this.buvid3 = buvid3;
    this.buvid4 = buvid4;
    this.dedeuserid = dedeuserid;
    this.ac_time_value = ac_time_value;
    this.proxy = proxy;
    Object.assign(this, rest);
  }

  getCookies(): Record<string, string> {
    const cookies: Record<string, string> = {
      SESSDATA: this.sessdata || "",
      buvid3: this.buvid3 || "",
      buvid4: this.buvid4 || "",
      bili_jct: this.bili_jct || "",
      ac_time_value: this.ac_time_value || "",
    };
    if (this.dedeuserid) cookies.DedeUserID = this.dedeuserid;
    for (const [key, value] of Object.entries(this)) {
      if (key === "proxy") continue;
      if (!(key in cookies) && value !== null && value !== undefined && typeof value !== "function") {
        cookies[key] = String(value);
      }
    }
    return cookies;
  }

  async getBuvidCookies(): Promise<Record<string, string>> {
    const [buvid3, buvid4] = await getBuvid();
    const cookies = this.getCookies();
    cookies.buvid3 = this.buvid3 || buvid3;
    cookies.buvid4 = this.buvid4 || buvid4;
    return cookies;
  }

  hasSessdata(): boolean {
    return this.sessdata !== null && this.sessdata !== "";
  }

  hasBiliJct(): boolean {
    return this.bili_jct !== null && this.bili_jct !== "";
  }

  hasBuvid3(): boolean {
    return this.buvid3 !== null && this.buvid3 !== "";
  }

  hasBuvid4(): boolean {
    return this.buvid4 !== null && this.buvid4 !== "";
  }

  hasDedeuserid(): boolean {
    return this.dedeuserid !== null && this.dedeuserid !== "";
  }

  hasAcTimeValue(): boolean {
    return this.ac_time_value !== null && this.ac_time_value !== "";
  }

  raiseForNoSessdata(): void {
    if (!this.hasSessdata()) throw new CredentialNoSessdataException();
  }

  raiseForNoBiliJct(): void {
    if (!this.hasBiliJct()) throw new CredentialNoBiliJctException();
  }

  raiseForNoBuvid3(): void {
    if (!this.hasBuvid3()) throw new CredentialNoBuvid3Exception();
  }

  raiseForNoBuvid4(): void {
    if (!this.hasBuvid4()) throw new CredentialNoBuvid4Exception();
  }

  raiseForNoDedeuserid(): void {
    if (!this.hasDedeuserid()) throw new CredentialNoDedeUserIDException();
  }

  raiseForNoAcTimeValue(): void {
    if (!this.hasAcTimeValue()) throw new CredentialNoAcTimeValueException();
  }

  async checkValid(): Promise<boolean> {
    const api = getApi("credential").info.valid;
    return (await new Api({ ...api, credential: this }).result).isLogin;
  }

  async checkRefresh(): Promise<boolean> {
    const api = getApi("credential").info.check_cookies;
    return (await new Api({ ...api, credential: this }).result).refresh;
  }

  async refresh(): Promise<void> {
    throw new CookiesRefreshException("Credential.refresh 尚未移植；请重新扫码登录");
  }

  static fromCookies(cookies: Record<string, string> = {}): Credential {
    return new Credential({
      sessdata: cookies.SESSDATA ?? null,
      bili_jct: cookies.bili_jct ?? null,
      buvid3: cookies.buvid3 ?? null,
      buvid4: cookies.buvid4 ?? null,
      dedeuserid: cookies.DedeUserID ?? null,
      ac_time_value: cookies.ac_time_value ?? null,
      ...Object.fromEntries(
        Object.entries(cookies).filter(
          ([key]) => !["SESSDATA", "bili_jct", "buvid3", "buvid4", "DedeUserID", "ac_time_value"].includes(key),
        ),
      ),
    });
  }
}

export interface RawRequestOptions {
  method: string;
  url: string;
  params?: Record<string, any>;
  data?: Record<string, any> | string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  jsonBody?: boolean;
}

export async function rawRequest(options: RawRequestOptions): Promise<{ status: number; headers: Headers; text: string; url: string }> {
  const method = options.method.toUpperCase();
  const params = options.params || {};
  const query = encodeQuery(params);
  const url = query ? options.url + (options.url.includes("?") ? "&" : "?") + query : options.url;
  const headers: Record<string, string> = { ...HEADERS, ...(options.headers || {}) };
  const cookies = options.cookies || {};
  const cookie = Object.entries(cookies)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  if (cookie && !headers.Cookie) headers.Cookie = cookie;

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD" && options.data !== undefined) {
    if (options.jsonBody) {
      headers["Content-Type"] = "application/json";
      body = typeof options.data === "string" ? options.data : JSON.stringify(options.data);
    } else if (typeof options.data === "string") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = options.data;
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = encodeForm(options.data);
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: "follow",
    signal: AbortSignal.timeout(requestSettings.timeout),
  });
  return { status: response.status, headers: response.headers, text: await response.text(), url: response.url };
}

async function getSpibuvid(): Promise<{ b_3: string; b_4: string }> {
  const api = getApi("credential").info.spi;
  const response = await rawRequest({ method: "GET", url: api.url, headers: { ...HEADERS } });
  if (response.status !== 200) throw new NetworkException(response.status, response.text);
  return JSON.parse(response.text).data;
}

export async function getBuvid(): Promise<[string, string]> {
  if (cachedBuvid3 === "" || cachedBuvid4 === "") {
    const spi = await getSpibuvid();
    cachedBuvid3 = spi.b_3;
    cachedBuvid4 = spi.b_4;
  }
  return [cachedBuvid3, cachedBuvid4];
}

async function getBiliTicket(credential: Credential = new Credential()): Promise<[string, string]> {
  if (Date.now() / 1000 > cachedBiliTicketExpires) refreshBiliTicket();
  if (cachedBiliTicket === "") {
    const timestamp = Math.floor(Date.now() / 1000);
    const hexsign = createHmac("sha256", "XgwSnGZ1p").update(`ts${timestamp}`).digest("hex");
    const api = getApi("credential").info.ticket;
    const response = await rawRequest({
      method: "POST",
      url: api.url,
      params: {
        key_id: "ec02",
        hexsign,
        "content[ts]": String(timestamp),
        csrf: "",
      },
      headers: { ...HEADERS },
      cookies: credential.getCookies(),
    });
    if (response.status !== 200) throw new NetworkException(response.status, response.text);
    cachedBiliTicket = JSON.parse(response.text).data.ticket;
    cachedBiliTicketExpires = timestamp + 3 * 86400;
  }
  return [cachedBiliTicket, String(cachedBiliTicketExpires)];
}

async function getNav(credential: Credential = new Credential()): Promise<any> {
  const api = getApi("credential").info.valid;
  const response = await rawRequest({
    method: "GET",
    url: api.url,
    headers: { ...HEADERS },
    cookies: credential.getCookies(),
  });
  if (response.status !== 200) throw new NetworkException(response.status, response.text);
  return JSON.parse(response.text).data;
}

export async function getWbiMixinKey(credential: Credential = new Credential()): Promise<string> {
  if (cachedMixinKey === "") {
    const nav = await getNav(credential);
    const wbiImg = nav.wbi_img;
    const split = (key: string) => wbiImg[key].split("/").pop().split(".")[0];
    const raw = split("img_url") + split("sub_url");
    cachedMixinKey = OE.map((index) => (index < raw.length ? raw[index] : "")).join("").slice(0, 32);
  }
  return cachedMixinKey;
}

export function encWbi(
  params: Record<string, any>,
  mixinKey: string,
  timestamp = Math.floor(Date.now() / 1000),
): Record<string, any> {
  delete params.w_rid;
  params.wts = timestamp;
  if (!params.web_location) params.web_location = 1550101;
  const query = Object.keys(params)
    .sort()
    .map((key) => [key, params[key]] as [string, string])
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${pyQuotePlus(key)}=${pyQuotePlus(pyStr(value))}`)
    .join("&");
  params.w_rid = createHash("md5").update(query + mixinKey, "utf8").digest("hex");
  return params;
}

export function encWbi2(params: Record<string, any>): Record<string, any> {
  const alphabet = "ABCDEFGHIJK";
  const sample = () => {
    const first = alphabet[Math.floor(Math.random() * alphabet.length)];
    let second = alphabet[Math.floor(Math.random() * alphabet.length)];
    while (second === first) second = alphabet[Math.floor(Math.random() * alphabet.length)];
    return first + second;
  };
  params.dm_img_list = "[]";
  params.dm_img_str = sample();
  params.dm_cover_img_str = sample();
  params.dm_img_inter = '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}';
  return params;
}

export function encSign(paramsOrData: Record<string, any>): Record<string, any> {
  paramsOrData.appkey = APPKEY;
  const sorted = Object.fromEntries(Object.entries(paramsOrData).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  sorted.sign = createHash("md5")
    .update(encodeForm(sorted) + APPSEC, "utf8")
    .digest("hex");
  return sorted;
}

export interface ApiOptions {
  url: string;
  method: string;
  comment?: string;
  wbi?: boolean;
  wbi2?: boolean;
  verify?: boolean;
  no_csrf?: boolean;
  json_body?: boolean;
  ignore_code?: boolean;
  sign?: boolean;
  data?: Record<string, any>;
  params?: Record<string, any>;
  files?: Record<string, any>;
  headers?: Record<string, string>;
  credential?: Credential;
}

export class Api {
  url: string;
  method: string;
  comment: string;
  wbi: boolean;
  wbi2: boolean;
  verify: boolean;
  no_csrf: boolean;
  json_body: boolean;
  ignore_code: boolean;
  sign: boolean;
  data: Record<string, any>;
  params: Record<string, any>;
  files: Record<string, any>;
  headers: Record<string, string>;
  credential: Credential;

  constructor(options: ApiOptions) {
    if (!options || !options.url || !options.method) throw new ArgsException("Api 需要 url 和 method");
    this.url = options.url;
    this.method = options.method.toUpperCase();
    this.comment = options.comment || "";
    this.wbi = options.wbi === true;
    this.wbi2 = options.wbi2 === true;
    this.verify = options.verify === true;
    this.no_csrf = options.no_csrf === true;
    this.json_body = options.json_body === true;
    this.ignore_code = options.ignore_code === true;
    this.sign = options.sign === true;
    this.data = {};
    this.params = {};
    this.files = {};
    this.headers = {};
    this.credential = options.credential || new Credential();
  }

  updateData(data: Record<string, any>): this {
    this.data = data;
    return this;
  }

  updateParams(params: Record<string, any>): this {
    this.params = params;
    return this;
  }

  updateHeaders(headers: Record<string, string>): this {
    this.headers = headers;
    return this;
  }

  async prepareRequest(): Promise<RawRequestOptions> {
    const params: Record<string, any> = {};
    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(this.params)) {
      if (typeof value === "boolean") params[key] = Number(value);
      else if (value !== null && value !== undefined) params[key] = value;
    }
    for (const [key, value] of Object.entries(this.data)) {
      if (typeof value === "boolean") params[key] = Number(value);
      else if (value !== null && value !== undefined) data[key] = value;
    }

    if (this.verify) this.credential.raiseForNoSessdata();
    if (this.method !== "GET" && !this.no_csrf) this.credential.raiseForNoBiliJct();
    if (params.jsonp === "jsonp") params.callback = "callback";
    if (this.wbi2) encWbi2(params);
    if (this.wbi) encWbi(params, await getWbiMixinKey(this.credential));
    if (!this.no_csrf && this.verify && ["POST", "DELETE", "PATCH"].includes(this.method)) {
      data.csrf = this.credential.bili_jct;
      data.csrf_token = this.credential.bili_jct;
    }

    const cookies = this.credential.getCookies();
    if ((cookies.buvid3 === "" || cookies.buvid4 === "") && requestSettings.enableAutoBuvid) {
      const [buvid3, buvid4] = await getBuvid();
      cookies.buvid3 = buvid3;
      cookies.buvid4 = buvid4;
    }
    cookies["opus-goback"] = "1";
    if (requestSettings.enableBiliTicket) {
      const [ticket, expires] = await getBiliTicket(this.credential);
      cookies.bili_ticket = ticket;
      cookies.bili_ticket_expires = expires;
    }

    if (this.sign) {
      if (this.method === "GET") Object.assign(params, encSign(params));
      else Object.assign(data, encSign(data));
    }

    this.params = params;
    this.data = data;

    const headers = Object.keys(this.headers).length === 0 ? { ...HEADERS } : { ...this.headers };
    if (this.json_body) headers["Content-Type"] = "application/json";
    return {
      method: this.method,
      url: this.url,
      params,
      data,
      headers,
      cookies,
      jsonBody: this.json_body,
    };
  }

  processResponse(response: { status: number; headers: Headers; text: string }, raw = false): any {
    if (response.status !== 200) throw new NetworkException(response.status, response.text);
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) === 0) return null;
    let respData: any;
    if (this.params.callback !== undefined) {
      const match = /^[\s\S]*?({[\s\S]*})[\s\S]*$/.exec(response.text);
      if (!match) throw new ResponseCodeException(-1, "JSONP 响应无法解析", response.text);
      respData = JSON.parse(match[1]);
    } else {
      respData = JSON.parse(response.text);
    }
    if (raw) return respData;
    const ok = respData.OK;
    if (!this.ignore_code) {
      if (ok === undefined || ok === null) {
        if (respData.code === undefined || respData.code === null) {
          throw new ResponseCodeException(-1, "API 返回数据未含 code 字段", respData);
        }
        if (respData.code !== 0) {
          throw new ResponseCodeException(respData.code, respData.msg ?? respData.message ?? "接口未返回错误信息", respData);
        }
      } else if (ok !== 1) {
        throw new ResponseCodeException(-1, "API 返回数据 OK 不为 1", respData);
      }
    }
    if (ok === undefined || ok === null) return respData.data ?? respData.result;
    return respData;
  }

  async request(raw = false): Promise<any> {
    const times = requestSettings.wbiRetryTimes;
    for (let loop = times; loop > 0; loop -= 1) {
      try {
        const config = await this.prepareRequest();
        const response = await rawRequest(config);
        return this.processResponse(response, raw);
      } catch (error) {
        if (error instanceof ResponseCodeException && error.code === -403 && this.wbi) {
          recalculateWbi();
          continue;
        }
        throw error;
      }
    }
    throw new WbiRetryTimesExceedException();
  }

  get result(): Promise<any> {
    return this.request();
  }
}
