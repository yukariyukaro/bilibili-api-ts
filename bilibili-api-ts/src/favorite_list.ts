/**
 * bilibili_api.favorite_list 的 TypeScript 移植。
 *
 * 对应 Python 模块：bilibili_api/favorite_list.py
 * 提供视频 / 专栏 / 课程 / 话题 / 笔记收藏夹的查询与增删改操作。
 * 端点数据来自 src/data/api/favorite-list.ts（Python 的 data/api/favorite-list.json）。
 */

import { ArgsException } from "./exceptions";
import { get_self_info } from "./user";
import type { Video } from "./video";
import { Api, Credential, getApi } from "./utils/network";

const API = getApi("favorite-list");

/**
 * 收藏夹列表内容排序方式枚举。
 */
export enum FavoriteListContentOrder {
  /** 最近收藏 */
  MTIME = "mtime",
  /** 最多播放 */
  VIEW = "view",
  /** 最新投稿 */
  PUBTIME = "pubtime",
}

/**
 * 收藏夹类型枚举。
 */
export enum FavoriteListType {
  /** 视频收藏夹 */
  VIDEO = "video",
  /** 专栏收藏夹 */
  ARTICLE = "articles",
  /** 课程收藏夹 */
  CHEESE = "pugvfav",
}

/**
 * 收藏夹搜索模式枚举。
 */
export enum SearchFavoriteListMode {
  /** 仅当前收藏夹 */
  ONLY = 0,
  /** 该用户所有收藏夹 */
  ALL = 1,
}

/**
 * 对应 Python 的 utils.utils.raise_for_statement：
 * 条件不满足时抛出异常（Python 抛 StatementException，TS 侧统一用 ArgsException）。
 */
function raiseForStatement(statement: boolean, msg: string): void {
  if (!statement) throw new ArgsException(msg);
}

/**
 * 对应 Python 的 utils.utils.join：逐个 str() 后用分隔符连接。
 */
function joinValues(separator: string, array: any[]): string {
  return array.map((item) => String(item)).join(separator);
}

/**
 * 把「资源 ID 列表」编码成 Python 版要求的形式：'ID:2,ID:2'（视频类型固定为 2）。
 */
function encodeResources(aids: any[]): string {
  return aids.map((aid) => `${String(aid)}:2`).join(",");
}

export interface FavoriteListOptions {
  /** 收藏夹类型，默认 FavoriteListType.VIDEO。 */
  type_?: FavoriteListType;
  /** 收藏夹号（仅视频收藏夹需要）。 */
  media_id?: number | null;
  /** 凭据类。 */
  credential?: Credential;
}

export interface FavoriteListContentOptions {
  /** 页码，默认 1。 */
  page?: number;
  /** 搜索关键词。 */
  keyword?: string | null;
  /** 排序方式，默认 FavoriteListContentOrder.MTIME。 */
  order?: FavoriteListContentOrder;
  /** 分区 ID，默认 0（全部分区）。 */
  tid?: number;
  /** 搜索模式，默认仅当前收藏夹。 */
  mode?: SearchFavoriteListMode;
  /** 凭据。 */
  credential?: Credential | null;
}

/**
 * 收藏夹类。
 *
 * 支持两种构造方式，便于 Python 代码直接平移：
 * - new FavoriteList({ type_, media_id, credential })
 * - new FavoriteList(type_, media_id, credential)
 */
export class FavoriteList {
  __type: FavoriteListType;
  __media_id: number | null;
  credential: Credential;

  constructor(
    options: FavoriteListOptions | FavoriteListType = {},
    media_id: number | null = null,
    credential: Credential = new Credential(),
  ) {
    if (typeof options === "string") {
      // 兼容 Python 的位置参数写法：FavoriteList(type_, media_id, credential)
      this.__type = options as FavoriteListType;
      this.__media_id = media_id ?? null;
      this.credential = credential ?? new Credential();
    } else {
      const {
        type_ = FavoriteListType.VIDEO,
        media_id: mid = null,
        credential: cred = new Credential(),
      } = options || {};
      this.__type = type_;
      this.__media_id = mid;
      this.credential = cred;
    }
  }

  /**
   * 收藏夹是否为视频收藏夹。
   */
  is_video_favorite_list(): boolean {
    return this.__type === FavoriteListType.VIDEO;
  }

  /**
   * 获取收藏夹 media_id，仅视频收藏夹存在此属性。
   */
  get_media_id(): number | null {
    return this.__media_id;
  }

  /**
   * 获取收藏夹类型。
   */
  get_favorite_list_type(): FavoriteListType {
    return this.__type;
  }

  /**
   * 获取收藏夹信息。
   */
  async get_info(): Promise<any> {
    raiseForStatement(this.__media_id != null, "视频收藏夹需要 media_id");
    const api = API.info.info;
    const params = { media_id: this.__media_id };
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  /**
   * 获取视频收藏夹内容。
   *
   * @param options 页码 / 关键词 / 排序 / 搜索模式 / 分区 ID；也接受直接传页码数字。
   */
  async get_content_video(options: FavoriteListContentOptions | number = {}): Promise<any> {
    const opts = typeof options === "number" ? { page: options } : options || {};
    const {
      page = 1,
      keyword = null,
      order = FavoriteListContentOrder.MTIME,
      mode = SearchFavoriteListMode.ONLY,
      tid = 0,
    } = opts;
    raiseForStatement(this.__type === FavoriteListType.VIDEO, "此函数仅在收藏夹为视频收藏家时可用");
    raiseForStatement(this.__media_id != null, "视频收藏夹需要 media_id");
    return get_video_favorite_list_content(this.__media_id as number, {
      page,
      keyword,
      order,
      tid,
      mode,
      credential: this.credential,
    });
  }

  /**
   * 获取收藏夹内容（按收藏夹类型自动分派）。
   */
  async get_content(page = 1): Promise<any> {
    if (this.__type === FavoriteListType.ARTICLE) {
      return get_article_favorite_list(page, this.credential);
    } else if (this.__type === FavoriteListType.CHEESE) {
      return get_course_favorite_list(page, this.credential);
    } else if (this.__type === FavoriteListType.VIDEO) {
      raiseForStatement(this.__media_id != null, "视频收藏夹需要 media_id");
      return get_video_favorite_list_content(this.__media_id as number, {
        page,
        credential: this.credential,
      });
    } else {
      throw new ArgsException("无法识别传入的类型");
    }
  }

  /**
   * 获取收藏夹所有内容的 ID。
   *
   * **注意：接口针对番剧剧集视频返回的 id / bvid 实际上对应的是其 epid**
   */
  async get_content_ids_info(): Promise<any> {
    raiseForStatement(this.__media_id != null, "视频收藏夹需要 media_id");
    const api = API.info.list_content_id_list;
    const params = {
      media_id: this.__media_id,
      platform: "web",
    };
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }
}

/**
 * 获取视频收藏夹列表。
 *
 * @param uid 用户 UID。
 * @param video 视频类；提供时结果会附带该收藏夹是否存在该视频。
 * @param credential 凭据。
 */
export async function get_video_favorite_list(
  uid: number,
  video: Video | null = null,
  credential: Credential | null = null,
): Promise<any> {
  const api = API.info.list_list;
  const params: Record<string, any> = { up_mid: uid, type: 2, web_location: "333.1387" };
  if (video !== null && video !== undefined) {
    params.rid = video.get_aid();
  }
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取视频收藏夹列表内容，也可用于搜索收藏夹内容。
 *
 * @param media_id 收藏夹 ID。
 * @param options 页码 / 关键词 / 排序方式 / 分区 ID / 搜索模式 / 凭据；也接受直接传页码数字。
 */
export async function get_video_favorite_list_content(
  media_id: number,
  options: FavoriteListContentOptions | number = {},
): Promise<any> {
  const opts = typeof options === "number" ? { page: options } : options || {};
  const {
    page = 1,
    keyword = null,
    order = FavoriteListContentOrder.MTIME,
    tid = 0,
    mode = SearchFavoriteListMode.ONLY,
    credential = null,
  } = opts;

  const api = API.info.list_content;
  const params: Record<string, any> = {
    media_id,
    pn: page,
    ps: 20,
    order,
    tid,
    type: mode,
    platform: "web",
    web_location: "333.1387",
  };
  if (keyword !== null && keyword !== undefined) params.keyword = keyword;

  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取自己的话题收藏夹内容。
 */
export async function get_topic_favorite_list(
  page = 1,
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  const api = API.info.list_topics;
  const params = { page_num: page, page_size: 16 };
  return new Api({ ...api, credential: cred }).updateParams(params).result;
}

/**
 * 获取自己的专栏收藏夹内容。
 */
export async function get_article_favorite_list(
  page = 1,
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  const api = API.info.list_articles;
  const params = { pn: page, ps: 16 };
  return new Api({ ...api, credential: cred }).updateParams(params).result;
}

/**
 * 获取自己的课程收藏夹内容。
 */
export async function get_course_favorite_list(
  page = 1,
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  const api = API.info.list_courses;
  const selfInfo = await get_self_info(cred);
  const params = { pn: page, ps: 10, mid: selfInfo.mid };
  return new Api({ ...api, credential: cred }).updateParams(params).result;
}

/**
 * 获取自己的笔记收藏夹内容。
 */
export async function get_note_favorite_list(
  page = 1,
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  const api = API.info.list_notes;
  const params = { pn: page, ps: 16 };
  return new Api({ ...api, credential: cred }).updateParams(params).result;
}

/**
 * 新建视频收藏夹列表。
 *
 * @param title 收藏夹名。
 * @param introduction 收藏夹简介。
 * @param private 是否为私有（TS 里 private 是保留字作参数名没问题，但按 Python 命名保留）。
 * @param credential 凭据。
 */
export async function create_video_favorite_list(
  title: string,
  introduction = "",
  private_ = false,
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  cred.raiseForNoBiliJct();

  const api = API.operate.new;
  const data = {
    title,
    intro: introduction,
    privacy: private_ ? 1 : 0,
    cover: "",
  };
  return new Api({ ...api, credential: cred }).updateData(data).result;
}

/**
 * 修改视频收藏夹信息。
 */
export async function modify_video_favorite_list(
  media_id: number,
  title: string,
  introduction = "",
  private_ = false,
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  cred.raiseForNoBiliJct();

  const api = API.operate.modify;
  const data = {
    title,
    intro: introduction,
    privacy: private_ ? 1 : 0,
    cover: "",
    media_id,
  };
  return new Api({ ...api, credential: cred }).updateData(data).result;
}

/**
 * 删除视频收藏夹，可批量删除。
 *
 * @param media_ids 收藏夹 ID 列表。
 * @param credential 凭据。
 */
export async function delete_video_favorite_list(
  media_ids: number[],
  credential: Credential,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();

  const data = { media_ids: joinValues(",", media_ids) };
  const api = API.operate.delete;
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 复制视频收藏夹内容。
 *
 * @param media_id_from 要复制的源收藏夹 ID。
 * @param media_id_to 目标收藏夹 ID。
 * @param aids 被复制的视频 ID 列表。
 * @param credential 凭据。
 */
export async function copy_video_favorite_list_content(
  media_id_from: number,
  media_id_to: number,
  aids: number[],
  credential: Credential,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const api = API.operate.content_copy;

  const selfInfo = await get_self_info(credential);

  const data = {
    src_media_id: media_id_from,
    tar_media_id: media_id_to,
    mid: selfInfo.mid,
    resources: encodeResources(aids),
  };
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 移动视频收藏夹内容。
 *
 * @param media_id_from 要移动的源收藏夹 ID。
 * @param media_id_to 目标收藏夹 ID。
 * @param aids 被移动的视频 ID 列表。
 * @param credential 凭据。
 */
export async function move_video_favorite_list_content(
  media_id_from: number,
  media_id_to: number,
  aids: number[],
  credential: Credential,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const api = API.operate.content_move;

  const data = {
    src_media_id: media_id_from,
    tar_media_id: media_id_to,
    resources: encodeResources(aids),
  };
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 删除视频收藏夹内容。
 *
 * @param media_id 收藏夹 ID。
 * @param aids 被删除的视频 ID 列表。
 * @param credential 凭据。
 */
export async function delete_video_favorite_list_content(
  media_id: number,
  aids: number[],
  credential: Credential,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const api = API.operate.content_rm;

  const data = {
    media_id,
    resources: encodeResources(aids),
  };
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 清除视频收藏夹失效内容。
 *
 * @param media_id 收藏夹 ID。
 * @param credential 凭据。
 */
export async function clean_video_favorite_list_content(
  media_id: number,
  credential: Credential,
): Promise<any> {
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const api = API.operate.content_clean;

  const data = { media_id };
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 获取收藏合集列表。
 *
 * @param uid 用户 UID。
 * @param pn 页码。
 * @param ps 每页数据大小。
 * @param credential 凭据。
 */
export async function get_favorite_collected(
  uid: number,
  pn = 1,
  ps = 20,
  credential: Credential | null = null,
): Promise<any> {
  const api = API.info.collected;
  const params = { up_mid: uid, platform: "web", pn, ps };
  return new Api({ ...api, credential }).updateParams(params).result;
}
