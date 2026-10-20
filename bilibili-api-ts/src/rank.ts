import { Api, Credential, getApi } from "./utils/network";

const API = getApi("rank");

export enum RankAPIType {
  PGC = "pgc",
  V2 = "x",
}

export enum RankDayType {
  THREE_DAY = 3,
  WEEK = 7,
}

export const RankType = {
  All: { api_type: "x", rid: 0, type: "all" },
  Bangumi: { api_type: "pgc", season_type: 1 },
  GuochuangAnime: { api_type: "pgc", season_type: 4 },
  Guochuang: { api_type: "x", rid: 168, type: "all" },
  Documentary: { api_type: "pgc", season_type: 3 },
  Douga: { api_type: "x", rid: 1005, type: "all" },
  Music: { api_type: "x", rid: 1003, type: "all" },
  Dance: { api_type: "x", rid: 1004, type: "all" },
  Game: { api_type: "x", rid: 1008, type: "all" },
  Knowledge: { api_type: "x", rid: 1010, type: "all" },
  Technology: { api_type: "x", rid: 1012, type: "all" },
  Sports: { api_type: "x", rid: 1018, type: "all" },
  Car: { api_type: "x", rid: 1013, type: "all" },
  Life: { api_type: "x", rid: 160, type: "all" },
  Food: { api_type: "x", rid: 1020, type: "all" },
  Animal: { api_type: "x", rid: 1024, type: "all" },
  Kichiku: { api_type: "x", rid: 1007, type: "all" },
  Fashion: { api_type: "x", rid: 1014, type: "all" },
  Ent: { api_type: "x", rid: 1002, type: "all" },
  Cinephile: { api_type: "x", rid: 1001, type: "all" },
  Movie: { api_type: "pgc", season_type: 2 },
  TV: { api_type: "pgc", season_type: 5 },
  Variety: { api_type: "pgc", season_type: 7 },
  Original: { api_type: "x", rid: 0, type: "origin" },
  Rookie: { api_type: "x", rid: 0, type: "rookie" },
} as const;

export enum VIPRankType {
  VIP = 279,
  BANGUMI = 118,
  GUOCHUANG = 119,
  MOVIE = 174,
  DOCUMENTARY = 175,
  TV = 176,
  VARIETY = 177,
}

export enum MangeRankType {
  NEW = 7,
  BOY = 11,
  GRIL = 12,
  GUOCHUANG = 1,
  JAPAN = 0,
  SOUTHKOREA = 2,
  OFFICAL = 5,
  FINISH = 13,
}

export enum LiveEnergyRankType {
  MONTH = "month",
  PRE_MONTH = "pre_month",
}

export type RankTypeValue = (typeof RankType)[keyof typeof RankType];

export async function get_rank(
  type_: RankTypeValue = RankType.All,
  day: RankDayType = RankDayType.THREE_DAY,
): Promise<any> {
  const params: Record<string, any> = { web_location: "333.934" };
  let api: any;
  if (type_.api_type === RankAPIType.V2) {
    api = API.info.v2_ranking;
    params.rid = (type_ as { rid: number }).rid;
    params.type = (type_ as { type: string }).type;
  } else if (type_.api_type === RankAPIType.PGC) {
    api = API.info.pgc_ranking;
    params.season_type = (type_ as { season_type: number }).season_type;
    params.day = day;
  } else {
    throw new Error("Unknown RankType");
  }
  return new Api({ ...api }).updateParams(params).result;
}

export async function get_music_rank_list(): Promise<any> {
  const api = API.info.music_weekly_series;
  return new Api({ ...api }).updateParams({ list_type: 1 }).result;
}

export async function get_music_rank_weekly_detail(week = 1): Promise<any> {
  const api = API.info.music_weekly_details;
  return new Api({ ...api }).updateParams({ list_id: week }).result;
}

export async function get_music_rank_weekly_musics(week = 1): Promise<any> {
  const api = API.info.music_weekly_content;
  return new Api({ ...api }).updateParams({ list_id: week }).result;
}

export async function get_vip_rank(type_: VIPRankType = VIPRankType.VIP): Promise<any> {
  const api = API.info.VIP_rank;
  return new Api({ ...api }).updateParams({ rank_id: type_ }).result;
}

export async function get_manga_rank(
  type_: MangeRankType = MangeRankType.NEW,
  credential: Credential = new Credential(),
): Promise<any> {
  credential.raiseForNoSessdata();
  const api = API.info.manga_rank;
  return new Api({ ...api, no_csrf: true, credential })
    .updateData({ id: type_ })
    .updateParams({ device: "pc", platform: "web" })
    .result;
}

export async function get_live_hot_rank(): Promise<any> {
  const api = API.info.live_hot_rank;
  return new Api({ ...api }).result;
}

export async function get_live_sailing_rank(): Promise<any> {
  const api = API.info.live_sailing_rank;
  return new Api({ ...api }).updateParams({}).result;
}

export async function get_live_energy_user_rank(
  date: LiveEnergyRankType = LiveEnergyRankType.MONTH,
  pn = 1,
  ps = 20,
): Promise<any> {
  const api = API.info.live_energy_user_rank;
  return new Api({ ...api }).updateParams({ date, page: pn, page_size: ps }).result;
}
