import { Api, getApi } from "./utils/network";

const RANK = getApi("rank");
const HOT = getApi("hot");

export async function get_hot_videos(options: { pn?: number; ps?: number } = {}): Promise<any> {
  const { pn = 1, ps = 20 } = options;
  const api = RANK.info.hot;
  return new Api({ ...api }).updateParams({ ps, pn, web_location: "333.934" }).result;
}

export async function get_weekly_hot_videos_list(): Promise<any> {
  const api = RANK.info.weekly_series;
  return new Api({ ...api }).updateParams({ web_location: "333.934" }).result;
}

export async function get_weekly_hot_videos(week = 1): Promise<any> {
  const api = RANK.info.weekly_details;
  return new Api({ ...api }).updateParams({ web_location: "333.934", number: week }).result;
}

export async function get_history_popular_videos(): Promise<any> {
  const api = RANK.info.history_popular;
  return new Api({ ...api }).updateParams({ web_location: "333.934", page_size: 85, page: 1 }).result;
}

export async function get_hot_buzzwords(options: { page_num?: number; page_size?: number } = {}): Promise<any> {
  const { page_num = 1, page_size = 20 } = options;
  const api = HOT.info.buzzwords;
  return new Api({ ...api }).updateParams({ page_num, page_size }).result;
}
