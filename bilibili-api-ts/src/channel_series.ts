/**
 * bilibili_api.channel_series 的 TypeScript 移植。
 *
 * 用户合集与列表相关：
 *   - 旧版视频列表（series）
 *   - 新版合集（season，名字形如「合集·XXX」）
 *
 * 接口地址全部来自 src/data/api/user.ts 与 src/data/api/channel-series.ts，
 * 与 Python 数据层（vendor/api/user.json、vendor/api/channel-series.json）一致。
 */
import { ArgsException } from "./exceptions";
import { Api, Credential, getApi } from "./utils/network";
import { User, get_self_info } from "./user";

const API_USER = getApi("user");
const API = getApi("channel-series");

/** 合集元数据缓存，等价于 Python 的模块级 channel_meta_cache。 */
export const channel_meta_cache: Record<string, any> = {};

/**
 * 合集视频排序顺序。
 * + DEFAULT: 默认排序
 * + CHANGE : 升序排序
 */
export enum ChannelOrder {
  DEFAULT = "false",
  CHANGE = "true",
}

/**
 * 合集与列表类型。
 *
 * + SERIES: 相同视频分类
 * + SEASON: 新概念多 P
 *
 * SEASON 类合集与列表名字为「合集·XXX」，请注意区别。
 */
export enum ChannelSeriesType {
  SERIES = 0,
  SEASON = 1,
}

/**
 * 合集与列表类。
 */
export class ChannelSeries {
  /** 合集与列表对应用户的 uid。 */
  __uid: number;
  /** 是否为新版合集（1 为是，0 为否），对应 Python 的 self.is_new。 */
  is_new: number;
  /** season_id 或 series_id。 */
  id_: number;
  /** 合集列表对应用户。 */
  owner: User;
  /** 凭据类。 */
  credential: Credential;
  /** 合集与列表基本信息。 */
  meta: any = null;

  /**
   * @param uid 用户 uid，默认 -1。
   * @param type_ 合集与列表类型，默认 ChannelSeriesType.SERIES。
   * @param id_ season_id 或 series_id，默认 -1。
   * @param credential 凭据。
   */
  constructor(
    uid: number = -1,
    type_: ChannelSeriesType = ChannelSeriesType.SERIES,
    id_: number = -1,
    credential: Credential | null = null,
  ) {
    if (id_ === -1) throw new ArgsException("未满足条件：id_ 不能为 -1");
    if (type_ === null || type_ === undefined) throw new ArgsException("未满足条件：type_ 不能为 None");

    this.__uid = uid;
    this.is_new = type_;
    this.id_ = id_;
    this.credential = credential ?? new Credential();
    this.owner = new User(this.__uid, this.credential);
    this.meta = null;
    const cacheKey = `${type_}-${id_}`;
    if (Object.prototype.hasOwnProperty.call(channel_meta_cache, cacheKey)) {
      this.meta = channel_meta_cache[cacheKey];
    }
  }

  /** 请求并缓存合集元数据（等价于 Python 的 __fetch_meta）。 */
  async __fetch_meta(): Promise<void> {
    let api: any;
    let params: Record<string, any>;
    if (this.is_new) {
      api = API_USER.channel_series.season_info;
      params = { season_id: this.id_ };
    } else {
      api = API_USER.channel_series.info;
      params = { series_id: this.id_ };
    }
    const resp = await new Api({ ...api, credential: this.credential }).updateParams(params).result;
    if (this.is_new) {
      this.meta = resp.info;
      this.meta.mid = resp.info.upper.mid;
      this.__uid = this.meta.mid;
      this.owner = new User(this.__uid, this.credential);
    } else {
      this.meta = resp.meta;
      this.__uid = this.meta.mid;
      this.owner = new User(this.__uid, this.credential);
    }
  }

  /** 获取合集与列表类型。 */
  get_type(): ChannelSeriesType {
    return this.is_new as ChannelSeriesType;
  }

  /** 获取 season_id / series_id。 */
  get_id(): number {
    return this.id_;
  }

  /** 获取元数据。 */
  async get_meta(): Promise<any> {
    if (!this.meta) await this.__fetch_meta();
    return this.meta;
  }

  /** 获取合集列表对应用户。 */
  async get_owner(): Promise<User> {
    if (this.__uid === -1) await this.__fetch_meta();
    return this.owner;
  }

  /**
   * 获取合集视频。
   *
   * 实际请求由 user.User.get_channel_videos_season /
   * get_channel_videos_series 完成（与 Python 一致）。
   *
   * @param sort 排序方式。
   * @param pn 页数，默认为 1。
   * @param ps 每一页显示的视频数量，默认 100。
   */
  async get_videos(
    sort: ChannelOrder = ChannelOrder.DEFAULT,
    pn: number = 1,
    ps: number = 100,
  ): Promise<any> {
    if (this.__uid === -1) await this.__fetch_meta();
    const owner: any = this.owner;
    if (this.is_new) {
      if (typeof owner.get_channel_videos_season !== "function") {
        throw new ArgsException("user.User.get_channel_videos_season 尚未移植，无法获取合集视频");
      }
      return owner.get_channel_videos_season(this.id_, sort, pn, ps);
    }
    if (typeof owner.get_channel_videos_series !== "function") {
      throw new ArgsException("user.User.get_channel_videos_series 尚未移植，无法获取列表视频");
    }
    return owner.get_channel_videos_series(this.id_, sort, pn, ps);
  }
}

/**
 * 新建一个视频列表（旧版合集）。
 *
 * @param name 列表名称。
 * @param aids 要加入列表的视频的 aid 列表。
 * @param keywords 列表的关键词。
 * @param description 列表的描述。
 * @param credential 凭据类。
 */
export async function create_channel_series(
  name: string,
  aids: number[] = [],
  keywords: string[] = [],
  description: string = "",
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  cred.raiseForNoBiliJct();
  const api = API_USER.channel_series.create;
  const info = await get_self_info(cred);
  const data = {
    mid: info.mid,
    aids: aids.map((x) => String(x)).join(","),
    name: name,
    keywords: keywords.join(","),
    description: description,
  };
  return new Api({ ...api, credential: cred }).updateData(data).result;
}

/**
 * 删除视频列表（旧版合集）。
 *
 * 注意：Python 原实现中 `ChannelSeries(...).get_meta()["total"]` 少写了一层 await，
 * 属于上游 bug（协程不可下标）；此处按正确语义 await 后再取 total。
 *
 * @param series_id 旧版合集 id。
 * @param credential 凭据类。
 */
export async function del_channel_series(series_id: number, credential: Credential): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const meta = await new ChannelSeries(-1, ChannelSeriesType.SERIES, series_id, credential).get_meta();
  const series_total: number = meta.total;
  const selfUid: number = (await get_self_info(credential)).mid;
  const aids: number[] = [];
  const pages = Math.floor(series_total / 20) + (series_total % 20 !== 0 ? 1 : 0);
  const owner = new User(selfUid, credential);
  for (let page = 1; page <= pages; page += 1) {
    const pageInfo = await (owner as any).get_channel_videos_series(
      series_id,
      ChannelOrder.DEFAULT,
      page,
      20,
    );
    for (const aid of pageInfo.aids || []) aids.push(aid);
  }
  const api = API_USER.channel_series.del_channel_series;
  const data = {
    mid: selfUid,
    series_id: series_id,
    aids: aids.map((x) => String(x)).join(","),
  };
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 添加视频至视频列表（旧版合集）。
 *
 * @param series_id 旧版合集 id。
 * @param aids 视频 aid 列表。
 * @param credential 凭据类。
 */
export async function add_aids_to_series(
  series_id: number,
  aids: number[],
  credential: Credential,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const selfInfo = await get_self_info(credential);
  const api = API_USER.channel_series.add_channel_aids_series;
  const data = {
    mid: selfInfo.mid,
    series_id: series_id,
    aids: aids.map((x) => String(x)).join(","),
  };
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 从视频列表（旧版合集）删除视频。
 *
 * @param series_id 旧版合集 id。
 * @param aids 视频 aid 列表。
 * @param credential 凭据类。
 */
export async function del_aids_from_series(
  series_id: number,
  aids: number[],
  credential: Credential,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const selfInfo = await get_self_info(credential);
  const api = API_USER.channel_series.del_channel_aids_series;
  const data = {
    mid: selfInfo.mid,
    series_id: series_id,
    aids: aids.map((x) => String(x)).join(","),
  };
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 设置是否订阅合集（新版）。
 *
 * @param season_id 合集 id。
 * @param status 是否订阅状态，默认 True。
 * @param credential 凭据。
 */
export async function set_follow_channel_season(
  season_id: number,
  status: boolean = true,
  credential: Credential | null = null,
): Promise<any> {
  const api = status ? API.operate.fav : API.operate.unfav;
  const data = { season_id: season_id };
  return new Api({ ...api, credential: credential ?? null }).updateData(data).result;
}
