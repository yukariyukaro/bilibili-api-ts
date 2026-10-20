import { Api, Credential, getApi } from "./utils/network";

const API = getApi("search");

export enum SearchObjectType {
  VIDEO = "video",
  BANGUMI = "media_bangumi",
  FT = "media_ft",
  LIVE = "live",
  ARTICLE = "article",
  TOPIC = "topic",
  USER = "bili_user",
  LIVEUSER = "live_user",
  PHOTO = "photo",
}

export enum OrderVideo {
  TOTALRANK = "totalrank",
  CLICK = "click",
  PUBDATE = "pubdate",
  DM = "dm",
  STOW = "stow",
  SCORES = "scores",
}

export enum OrderLiveRoom {
  NEWLIVE = "live_time",
  ONLINE = "online",
}

export enum OrderArticle {
  TOTALRANK = "totalrank",
  PUBDATE = "pubdate",
  CLICK = "click",
  ATTENTION = "attention",
  SCORES = "scores",
}

export enum OrderUser {
  FANS = "fans",
  LEVEL = "level",
}

export enum CategoryTypePhoto {
  All = 0,
  DrawFriend = 2,
  PhotoFriend = 1,
}

export interface SearchByTypeOptions {
  keyword: string;
  search_type?: SearchObjectType | string | null;
  order_type?: OrderUser | OrderLiveRoom | OrderArticle | OrderVideo | string | null;
  time_range?: number;
  video_zone_type?: number | string | null;
  order_sort?: number | null;
  category_id?: number | string | null;
  time_start?: string | null;
  time_end?: string | null;
  page?: number;
  page_size?: number;
}

function enumValue(value: any): any {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

export async function search(keyword: string, page = 1): Promise<any> {
  const api = API.search.web_search;
  return new Api({ ...api, wbi: true }).updateParams({ keyword, page }).result;
}

export async function search_by_type(options: SearchByTypeOptions): Promise<any> {
  const {
    keyword,
    search_type = null,
    order_type = null,
    time_range = -1,
    video_zone_type = null,
    order_sort = null,
    category_id = null,
    time_start = null,
    time_end = null,
    page = 1,
    page_size = 42,
  } = options;
  if (!search_type) throw new Error("缺少 search_type");
  const type = enumValue(search_type);
  const params: Record<string, any> = { keyword, page, page_size, search_type: type };

  if (type === SearchObjectType.ARTICLE || type === SearchObjectType.PHOTO) {
    if (category_id !== null && category_id !== undefined) params.category_id = enumValue(category_id);
  }

  if (type === SearchObjectType.VIDEO) {
    let timeCode = 0;
    if (time_range > 60) timeCode = 4;
    else if (time_range > 30) timeCode = 3;
    else if (time_range > 10) timeCode = 2;
    else if (time_range > 0) timeCode = 1;
    params.duration = timeCode;
  }

  if (video_zone_type) params.tids = enumValue(video_zone_type);
  if (order_type) params.order = enumValue(order_type);
  if (type === SearchObjectType.USER) params.order_sort = order_sort;

  if (time_start && time_end) {
    const start = Math.floor(new Date(`${time_start}T00:00:00+08:00`).getTime() / 1000);
    const end = Math.floor(new Date(`${time_end}T23:59:59+08:00`).getTime() / 1000);
    params.pubtime_begin_s = start;
    params.pubtime_end_s = end;
  }

  const api = API.search.web_search_by_type;
  return new Api({ ...api, wbi: true }).updateParams(params).result;
}

export async function get_default_search_keyword(): Promise<any> {
  const api = API.search.default_search_keyword;
  return new Api({ method: api.method, url: api.url }).result;
}

export async function get_hot_search_keywords(): Promise<any> {
  const api = API.search.hot_search_keywords;
  return new Api({ method: api.method, url: api.url, credential: new Credential() }).result;
}

export async function get_suggest_keywords(keyword: string): Promise<string[]> {
  const api = API.search.suggest;
  const data = await new Api({ method: api.method, url: api.url, credential: new Credential() })
    .updateParams({ term: keyword })
    .result;
  return Object.values(data).map((item: any) => item.term);
}
