import { Api, Credential, getApi } from "./utils/network";
import { getUserDynamicRenderData } from "./utils/user_render_data";

const API = getApi("user");

export enum RelationType {
  FOLLOW = 1,
  UNFOLLOW = 2,
  BLOCK = 5,
  UNBLOCK = 6,
  REMOVE_FANS = 7,
}

export class User {
  __uid: number;
  credential: Credential;
  __selfInfo: any = null;

  constructor(uid: number, credential: Credential = new Credential()) {
    this.__uid = uid;
    this.credential = credential;
  }

  get_uid(): number {
    return this.__uid;
  }

  async get_access_id(): Promise<string | null> {
    return getUserDynamicRenderData(this.__uid, this.credential);
  }

  async get_user_info(): Promise<any> {
    const params = { mid: this.__uid, w_webid: await this.get_access_id() };
    return new Api({ ...API.info.info, credential: this.credential }).updateParams(params).result;
  }

  async get_relation_info(): Promise<any> {
    const api = API.info.relation_stat;
    return new Api({ ...api, credential: this.credential }).updateParams({ vmid: this.__uid }).result;
  }

  async get_space_notice(): Promise<any> {
    const api = API.info.space_notice;
    return new Api({ ...api, credential: this.credential }).updateParams({ mid: this.__uid }).result;
  }

  async get_relation(): Promise<any> {
    const api = API.info.relation;
    return new Api({ ...api, credential: this.credential }).updateParams({ mid: this.__uid }).result;
  }

  async modify_relation(relation: RelationType): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.operate.modify;
    return new Api({ ...api, credential: this.credential })
      .updateData({ fid: this.__uid, act: relation, re_src: 11 })
      .result;
  }

  async get_videos(options: { tid?: number; pn?: number; ps?: number; keyword?: string; order?: string } = {}): Promise<any> {
    const { tid = 0, pn = 1, ps = 30, keyword = "", order = "pubdate" } = options;
    const api = API.info.video;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ mid: this.__uid, ps, tid, pn, keyword, order })
      .result;
  }

  // 有关合集与列表（对应 Python user.py「有关合集与列表」一节）

  /** 查看频道内所有视频。仅供 series_list。 */
  async get_channel_videos_series(
    sid: number,
    sort: any = "false",
    pn: number = 1,
    ps: number = 100,
  ): Promise<any> {
    const api = API.info.channel_video_series;
    const params = {
      mid: this.__uid,
      series_id: sid,
      pn,
      ps,
      sort: sort === "true" ? "asc" : "desc",
    };
    return new Api({ ...api, wbi: true, credential: this.credential }).updateParams(params).result;
  }

  /** 查看频道内所有视频。仅供 season_list。 */
  async get_channel_videos_season(
    sid: number,
    sort: any = "false",
    pn: number = 1,
    ps: number = 100,
  ): Promise<any> {
    const api = API.info.channel_video_season;
    const params = {
      mid: this.__uid,
      season_id: sid,
      sort_reverse: sort,
      page_num: pn,
      page_size: ps,
    };
    return new Api({ ...api, wbi: true, credential: this.credential }).updateParams(params).result;
  }

  /** 查看用户所有的频道（包括新版）和部分视频。 */
  async get_channel_list(pn: number = 1, ps: number = 20): Promise<any> {
    const api = API.info.channel_list;
    return new Api({ ...api, wbi: true, credential: this.credential })
      .updateParams({ mid: this.__uid, page_num: pn, page_size: ps })
      .result;
  }

  /** 获取用户所有合集。 */
  async get_channels(): Promise<any[]> {
    const { ChannelSeries, ChannelSeriesType, channel_meta_cache } = await import("./channel_series");
    let seasonList: any[] = [];
    let seriesList: any[] = [];
    let pn = 1;
    let channelData = await this.get_channel_list(pn, 20);
    seasonList = channelData.items_lists.seasons_list;
    seriesList = channelData.items_lists.series_list;
    const total = channelData.items_lists.page.total;
    let current = channelData.items_lists.page.page_size;
    while (current < total) {
      pn += 1;
      channelData = await this.get_channel_list(pn, 20);
      seasonList = seasonList.concat(channelData.items_lists.seasons_list);
      seriesList = seriesList.concat(channelData.items_lists.series_list);
      current += channelData.items_lists.page.page_size;
    }
    const channels: any[] = [];
    for (const item of seasonList) {
      const id = item.meta.season_id;
      channel_meta_cache[String(ChannelSeriesType.SEASON) + "-" + String(id)] = item.meta;
      channels.push(new ChannelSeries(this.__uid, ChannelSeriesType.SEASON, id, this.credential));
    }
    for (const item of seriesList) {
      const id = item.meta.series_id;
      channel_meta_cache[String(ChannelSeriesType.SERIES) + "-" + String(id)] = item.meta;
      channels.push(new ChannelSeries(this.__uid, ChannelSeriesType.SERIES, id, this.credential));
    }
    return channels;
  }
}

export async function get_self_info(credential: Credential): Promise<any> {
  const api = API.info.my_info;
  credential.raiseForNoSessdata();
  return new Api({ ...api, credential }).result;
}

export async function name2uid(names: string | string[], credential?: Credential): Promise<any> {
  const api = API.info.name_to_uid;
  const value = Array.isArray(names) ? names.join(",") : names;
  return new Api({ ...api, credential: credential ?? new Credential() }).updateParams({ names: value }).result;
}
