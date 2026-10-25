/**
 * bilibili_api.creative_center 的 TypeScript 移植。
 *
 * 创作中心相关（数据概览、粉丝数据、内容管理、评论管理、弹幕管理、单稿件信息）。
 * 务必携带 Credential 信息，否则无法获取到数据。
 *
 * 接口地址全部来自 src/data/api/creative_center.ts，与 Python 数据层一致。
 */
import { Api, Credential, getApi } from "./utils/network";

const API = getApi("creative_center");

/**
 * 统计图表的时间段。
 * + YESTERDAY: 昨天
 * + WEEK: 近一周
 * + MONTH: 近一月
 * + THREE_MONTH: 近三月
 * + TOTAL: 历史累计
 */
export enum GraphPeriod {
  YESTERDAY = -1,
  WEEK = 0,
  MONTH = 1,
  THREE_MONTH = 2,
  TOTAL = 3,
}

/**
 * 粉丝统计图表的时间段。
 * + YESTERDAY: 昨天
 * + WEEK: 近一周
 * + MONTH: 近一月
 * + THREE_MONTH: 近三月
 */
export enum FanGraphPeriod {
  YESTERDAY = -1,
  WEEK = 0,
  MONTH = 1,
  THREE_MONTH = 2,
}

/**
 * 统计图表的类型。
 * + PLAY: 播放量
 * + VISITOR: 访问量
 * + FAN: 粉丝数
 * + LIKE: 点赞数
 * + FAV: 收藏数
 * + SHARE: 分享数
 * + COMMENT: 评论数
 * + DAMKU: 弹幕数
 * + COIN: 投币数
 * + ELEC: 充电数
 */
export enum GraphType {
  PLAY = "play",
  VISITOR = "visitor",
  FAN = "fan",
  LIKE = "like",
  FAV = "fav",
  SHARE = "share",
  COMMENT = "comment",
  DAMKU = "dm",
  COIN = "coin",
  ELEC = "elec",
}

/**
 * 粉丝统计图表的类型。
 * + ALL_FANS: 粉丝总量
 * + NEW_FANS: 新增粉丝
 * + FOLLOW: 新增关注
 * + UNFOLLOW: 取消关注
 */
export enum FanGraphType {
  ALL_FANS = "all_fans",
  NEW_FANS = "fan",
  FOLLOW = "follow",
  UNFOLLOW = "unfollow",
}

/**
 * 文章统计信息的类型。
 * + READ: 阅读
 * + COMMENT: 评论
 * + SHARE: 分享
 * + COIN: 投币
 * + FAV: 收藏
 * + LIKE: 点赞
 */
export enum ArticleInfoType {
  READ = 1,
  COMMENT = 2,
  SHARE = 3,
  COIN = 4,
  FAV = 5,
  LIKE = 6,
}

/**
 * 稿件播放完成率对比的版权类型。
 * + ALL: 全部
 * + ORIGINAL: 原创
 * + REPRINT: 转载
 */
export enum Copyright {
  ALL = 0,
  ORIGINAL = 1,
  REPRINT = 2,
}

/**
 * 内容管理排序字段。
 * + CLICK: 点击
 * + STOW: 收藏
 * + SENDDATE: 上传日期
 * + DM_COUNT: 弹幕数量
 * + COMMENT_COUNT: 评论数量（接口里叫 scores）
 */
export enum UploadManagerOrder {
  CLICK = "click",
  STOW = "stow",
  SENDDATE = "senddate",
  DM_COUNT = "dm_count",
  COMMENT_COUNT = "scores",
}

/**
 * 内容管理稿件状态字段。
 * + ALL: 全部稿件
 * + PUBED: 已通过
 * + IS_PUBING: 进行中
 * + NOT_PUBED: 未通过
 */
export enum UploadManagerStatus {
  ALL = "is_pubing,pubed,not_pubed",
  PUBED = "pubed",
  IS_PUBING = "is_pubing",
  NOT_PUBED = "not_pubed",
}

/**
 * 内容管理文章排序字段。
 * + CREATED_TIME: 创建日期
 * + LIKE: 点赞
 * + COMMENT: 评论
 * + FAV: 收藏
 * + COIN: 投币
 */
export enum UploadManagerSort {
  CREATED_TIME = 1,
  LIKE = 2,
  COMMENT = 3,
  FAV = 5,
  COIN = 6,
}

/**
 * 内容管理文章状态字段。
 * + ALL: 全部稿件
 * + PUBED: 已通过
 * + IS_PUBING: 进行中
 * + NOT_PUBED: 未通过
 */
export enum UploadManagerArticleStatus {
  ALL = 0,
  PUBED = 2,
  IS_PUBING = 1,
  NOT_PUBED = 3,
}

/**
 * 评论管理中的稿件类型。
 * + VIDEO: 视频
 * + ARTICLE: 文章
 * + AUDIO: 音频
 */
export enum ArchiveType {
  VIDEO = 1,
  ARTICLE = 12,
  AUDIO = 14,
}

/**
 * 评论管理中的排序字段。
 * + RECENTLY: 最近
 * + LIKE: 点赞
 * + REPLY: 回复
 */
export enum CommentManagerOrder {
  RECENTLY = 1,
  LIKE = 2,
  REPLY = 3,
}

/**
 * 弹幕模式。
 * + ROLL: 滚动
 * + BOTTOM: 底端
 * + TOP: 顶端
 * + REVERSE: 逆向
 * + ADVANCED: 高级
 * + CODE: 代码
 * + BAS: BAS 补充注释
 */
export enum DanmakuMode {
  ROLL = 1,
  BOTTOM = 4,
  TOP = 5,
  REVERSE = 6,
  ADVANCED = 7,
  CODE = 8,
  BAS = 9,
}

/**
 * 弹幕池类型。
 * + NORMAL: 普通
 * + SUBTITLE: 字幕
 * + SPECIAL: 特殊
 */
export enum DanmakuPool {
  NORMAL = 0,
  SUBTITLE = 1,
  SPECIAL = 2,
}

/**
 * 弹幕排序依据。
 * + CTIME: 发送时间
 * + LIKE_COUNT: 点赞数
 */
export enum DanmakuOrder {
  CTIME = "ctime",
  LIKE_COUNT = "like_count",
}

/**
 * 弹幕排序顺序。
 * + DESC: 降序
 * + ASC: 升序
 */
export enum DanmakuSort {
  DESC = "desc",
  ASC = "asc",
}

/**
 * 弹幕筛选类型。
 * + ALL: 全部
 * + PROTECT: 保护弹幕
 */
export enum DanmakuType {
  ALL = 0,
  PROTECT = 2,
}

/** 去掉 Python 风格枚举的外壳，取真正的值；普通值原样返回。 */
function enumValue(value: any): any {
  return value !== null && value !== undefined && typeof value === "object" && "value" in value
    ? value.value
    : value;
}

/** 把单个枚举或枚举列表拼成逗号分隔字符串（对应 Python 的 ",".join(...)）。 */
function joinEnumValues(values: any | any[]): any {
  if (values === null || values === undefined) return null;
  if (Array.isArray(values)) return values.map((item) => enumValue(item)).join(",");
  return enumValue(values);
}

/** 按 Python 的 strftime("%d-%m-%Y %H:%M:%S") 格式化本地时间。 */
function formatCtime(value: Date | string): string {
  if (typeof value === "string") return value;
  const pad = (num: number): string => String(num).padStart(2, "0");
  return (
    `${pad(value.getDate())}-${pad(value.getMonth() + 1)}-${value.getFullYear()} ` +
    `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  );
}

/** 逗号拼接 int 列表（对应 Python 的 ",".join(map(str, ...))）。 */
function joinNumbers(values: number[]): string {
  return values.map((item) => String(item)).join(",");
}

/**
 * 获取对比数据。
 *
 * @param credential Credential 凭据。
 */
export async function get_compare(credential: Credential): Promise<any> {
  const api = API.overview.compare;
  return new Api({ ...api, credential }).result;
}

/**
 * 获取统计图表数据。
 *
 * @param credential Credential 凭据。
 * @param period 时间段。
 * @param graph_type 图表类型。
 */
export async function get_graph(
  credential: Credential,
  period: GraphPeriod = GraphPeriod.WEEK,
  graph_type: GraphType = GraphType.PLAY,
): Promise<any> {
  const api = API.overview.graph;
  const params = {
    period: period,
    s_locale: "zh_CN",
    type: graph_type,
  };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取概览数据。
 *
 * @param credential Credential 凭据。
 * @param period 时间段。
 */
export async function get_overview(
  credential: Credential,
  period: GraphPeriod = GraphPeriod.WEEK,
): Promise<any> {
  const api = API.overview.num;
  // 不知道 tab 的作用是什么，但是不传会报错
  const params = { period: period, s_locale: "zh_CN", tab: 0 };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取视频各分区中占比排行。
 *
 * @param credential Credential 凭据。
 */
export async function get_video_survey(credential: Credential): Promise<any> {
  const api = API["data-up"].video.survey;
  const params = { type: 1 };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取稿件播放完成率对比。
 *
 * @param credential Credential 凭据。
 * @param copyright 版权类型。
 */
export async function get_video_playanalysis(
  credential: Credential,
  copyright: Copyright = Copyright.ALL,
): Promise<any> {
  const api = API["data-up"].video.playanalysis;
  const params = { copyright: copyright };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取稿件播放来源分布。
 *
 * @param credential Credential 凭据。
 */
export async function get_video_source(credential: Credential): Promise<any> {
  const api = API["data-up"].video.source;
  const params = { s_locale: "zh_CN" };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取粉丝概览数据。
 *
 * @param credential Credential 凭据。
 * @param period 时间段。
 */
export async function get_fan_overview(
  credential: Credential,
  period: FanGraphPeriod = FanGraphPeriod.WEEK,
): Promise<any> {
  const api = API["data-up"].fan.overview;
  const params = { period: period };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取粉丝图表数据。
 *
 * @param credential Credential 凭据。
 * @param period 时间段。
 * @param graph_type 图表类型。
 */
export async function get_fan_graph(
  credential: Credential,
  period: FanGraphPeriod = FanGraphPeriod.WEEK,
  graph_type: FanGraphType = FanGraphType.ALL_FANS,
): Promise<any> {
  const api = API["data-up"].fan.graph;
  const params = { period: period, type: graph_type };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取文章概览数据。
 *
 * @param credential Credential 凭据。
 */
export async function get_article_overview(credential: Credential): Promise<any> {
  const api = API["data-up"].article.overview;
  return new Api({ ...api, credential }).result;
}

/**
 * 获取文章图表数据。
 *
 * @param credential Credential 凭据。
 * @param graph_type 图表类型。
 */
export async function get_article_graph(
  credential: Credential,
  graph_type: ArticleInfoType = ArticleInfoType.READ,
): Promise<any> {
  const api = API["data-up"].article.graph;
  const params = { type: graph_type };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取文章排行数据。
 *
 * @param credential Credential 凭据。
 * @param rank_type 排行依据。
 */
export async function get_article_rank(
  credential: Credential,
  rank_type: ArticleInfoType = ArticleInfoType.READ,
): Promise<any> {
  const api = API["data-up"].article.rank;
  const params = { type: rank_type };
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取文章阅读终端数据。
 *
 * @param credential Credential 凭据。
 */
export async function get_article_source(credential: Credential): Promise<any> {
  const api = API["data-up"].article.source;
  return new Api({ ...api, credential }).result;
}

/*
 * upload manager
 * https://member.bilibili.com/platform/upload-manager
 */

/**
 * 获取内容管理视频草稿信息。
 *
 * @param credential Credential 凭据。
 */
export async function get_video_draft_upload_manager_info(credential: Credential): Promise<any> {
  const api = API["upload-manager"].video_draft;
  return new Api({ ...api, credential }).result;
}

/**
 * 获取内容管理视频信息。
 *
 * @param credential Credential 凭据。
 * @param is_interative 是否为互动视频（参数名沿用 Python 的拼写）。
 * @param pn 页码。
 * @param ps 每页项数。
 * @param order 稿件排序。
 * @param tid 分区（视频分区枚举或分区 id）。
 * @param status 稿件状态。
 */
export async function get_video_upload_manager_info(
  credential: Credential,
  is_interative: boolean = false,
  pn: number = 1,
  ps: number = 10,
  order: UploadManagerOrder = UploadManagerOrder.CLICK,
  tid: any = null,
  status: UploadManagerStatus = UploadManagerStatus.ALL,
): Promise<any> {
  const params = {
    pn: pn,
    ps: ps,
    coop: 1,
    status: status,
    order: order,
    interactive: is_interative ? 2 : 1,
    tid: enumValue(tid),
  };
  const api = API["upload-manager"].video;
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取内容管理文章信息。
 *
 * @param credential Credential 凭据。
 * @param status 稿件状态。
 * @param sort 稿件排序。
 * @param pn 页码。
 */
export async function get_article_upload_manager_info(
  credential: Credential,
  status: UploadManagerArticleStatus = UploadManagerArticleStatus.ALL,
  sort: UploadManagerSort = UploadManagerSort.CREATED_TIME,
  pn: number = 1,
): Promise<any> {
  const params = { pn: pn, group: status, sort: sort, mobi_app: "pc" };
  const api = API["upload-manager"].article;
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 获取内容管理文集信息。
 *
 * @param credential Credential 凭据。
 */
export async function get_article_list_upload_manager_info(credential: Credential): Promise<any> {
  const api = API["upload-manager"].article_list;
  return new Api({ ...api, credential }).result;
}

/*
 * comment manager
 * https://member.bilibili.com/platform/comment
 */

/**
 * 获取评论。
 *
 * @param credential Credential 凭据。
 * @param oid 指定稿件。
 * @param keyword 关键词。
 * @param archive_type 稿件类型。
 * @param order 排序字段。
 * @param filter 筛选器，作用未知。
 * @param pn 页码。
 * @param ps 每页项数。
 * @param charge_plus_filter charge_plus_filter。
 */
export async function get_comments(
  credential: Credential,
  oid: number | null = null,
  keyword: string | null = null,
  archive_type: ArchiveType = ArchiveType.VIDEO,
  order: CommentManagerOrder = CommentManagerOrder.RECENTLY,
  filter: number = -1,
  pn: number = 1,
  ps: number = 10,
  charge_plus_filter: boolean = false,
): Promise<any> {
  const params: Record<string, any> = {
    order: order,
    filter: filter,
    type: archive_type,
    pn: pn,
    ps: ps,
    charge_plus_filter: charge_plus_filter,
  };
  if (keyword !== null && keyword !== undefined) params.keyword = keyword;
  if (oid !== null && oid !== undefined) params.oid = oid;

  const api = API["comment-manager"].fulllist;
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 删除评论。每个评论对应一个 oid。
 *
 * @param credential Credential 凭据。
 * @param oid 指定稿件。
 * @param rpid 指定评论。
 * @param archive_type 稿件类型。
 */
export async function del_comments(
  credential: Credential,
  oid: number | number[],
  rpid: number | number[],
  archive_type: ArchiveType = ArchiveType.VIDEO,
): Promise<any> {
  const data = {
    oid: Array.isArray(oid) ? joinNumbers(oid) : oid,
    type: archive_type,
    rpid: Array.isArray(rpid) ? joinNumbers(rpid) : rpid,
    jsonp: "jsonp",
    csrf: credential.bili_jct,
  };

  const api = API["comment-manager"].del;
  return new Api({ ...api, credential }).updateData(data).result;
}

/*
 * danmaku manager
 * https://member.bilibili.com/platform/inter-active/danmu
 */

/**
 * 最近弹幕。
 *
 * @param credential Credential 凭据。
 * @param pn 页码。
 * @param ps 每页项数。
 */
export async function get_recently_danmakus(
  credential: Credential,
  pn: number = 1,
  ps: number = 50,
): Promise<any> {
  const params = { pn: pn, ps: ps };

  const api = API["danmaku-manager"].recent;
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 弹幕搜索。
 *
 * @param credential Credential 凭据。
 * @param oid 稿件 oid。
 * @param select_type 弹幕类型。
 * @param archive_type 稿件类型。
 * @param mids 用户 mids，逗号分隔或者直接 int。
 * @param keyword 关键词。
 * @param progress_from 进度开始。
 * @param progress_to 进度结束。
 * @param ctime_from 创建时间起始。
 * @param ctime_to 创建时间结束。
 * @param modes 弹幕模式（单个或列表）。
 * @param pools 弹幕池（单个或列表）。
 * @param attrs 弹幕属性，未知参数。
 * @param order 排序字段。
 * @param sort 排序方式。
 * @param pn 页码。
 * @param ps 每页项数。
 * @param cp_filter 是否过滤 CP 弹幕。
 */
export async function get_danmakus(
  credential: Credential,
  oid: number,
  select_type: DanmakuType = DanmakuType.ALL,
  archive_type: ArchiveType = ArchiveType.VIDEO,
  mids: number | number[] | null = null,
  keyword: string | null = null,
  progress_from: number | null = null,
  progress_to: number | null = null,
  ctime_from: Date | string | null = null,
  ctime_to: Date | string | null = null,
  modes: DanmakuMode | DanmakuMode[] | null = null,
  pools: DanmakuPool | DanmakuPool[] | null = null,
  attrs: any = null,
  order: DanmakuOrder = DanmakuOrder.CTIME,
  sort: DanmakuSort = DanmakuSort.DESC,
  pn: number = 1,
  ps: number = 50,
  cp_filter: boolean = false,
): Promise<any> {
  const params = {
    oid: oid,
    type: archive_type,
    mids: Array.isArray(mids) ? joinNumbers(mids) : mids,
    select_type: select_type,
    keyword: keyword,
    progress_from: progress_from,
    progress_to: progress_to,
    ctime_from: ctime_from === null || ctime_from === undefined ? null : formatCtime(ctime_from),
    ctime_to: ctime_to === null || ctime_to === undefined ? null : formatCtime(ctime_to),
    modes: joinEnumValues(modes),
    pool: joinEnumValues(pools),
    attrs: attrs,
    order: order,
    sort: sort,
    pn: pn,
    ps: ps,
    cp_filter: cp_filter,
  };

  const api = API["danmaku-manager"].search;
  return new Api({ ...api, credential }).updateParams(params).result;
}

/**
 * 删除弹幕。
 *
 * @param credential Credential 凭据。
 * @param oid 稿件 oid。
 * @param dmids 弹幕 id，可以传入列表和 int。
 */
export async function del_danmaku(
  credential: Credential,
  oid: number,
  dmids: number | number[],
): Promise<any> {
  return edit_danmaku_state(credential, oid, dmids, 1);
}

/**
 * 操作弹幕状态。
 *
 * @param credential Credential 凭据。
 * @param oid 稿件 oid。
 * @param dmids 弹幕 id，可以传入列表和 int。
 * @param state 弹幕状态：1 删除、2 保护、3 取消保护。
 */
export async function edit_danmaku_state(
  credential: Credential,
  oid: number,
  dmids: number | number[],
  state: number | null = null,
): Promise<any> {
  const data = {
    type: 1,
    oid: oid,
    dmids: Array.isArray(dmids) ? joinNumbers(dmids) : dmids,
    state: state,
  };

  const api = API["danmaku-manager"].state;
  return new Api({ ...api, credential }).updateData(data).result;
}

/**
 * 操作弹幕池。
 *
 * @param credential Credential 凭据。
 * @param oid 稿件 oid。
 * @param dmids 弹幕 id，可以传入列表和 int。
 * @param is_subtitle 是否为字幕。
 */
export async function edit_danmaku_pool(
  credential: Credential,
  oid: number,
  dmids: number | number[],
  is_subtitle: boolean = true,
): Promise<any> {
  const data = {
    type: 1,
    oid: oid,
    dmids: Array.isArray(dmids) ? joinNumbers(dmids) : dmids,
    pool: is_subtitle ? 1 : 0,
  };

  const api = API["danmaku-manager"].pool;
  return new Api({ ...api, credential }).updateData(data).result;
}

/*
 * 单个稿件相关
 * from: https://github.com/SocialSisterYi/bilibili-API-collect/issues/1286
 * from: https://github.com/SocialSisterYi/bilibili-API-collect/issues/1285
 */

/**
 * get_archive_edits / get_archive_parts 需要的 Video 结构类型。
 *
 * 这里使用结构化类型（等价于 Python 的鸭子类型），避免 import "./video"
 * 造成模块循环依赖；src/video.ts 的 Video 天然满足该接口。
 */
export interface ArchiveVideoLike {
  get_bvid(): string;
  get_aid(): number;
  credential?: Credential | null;
}

/**
 * 获取自己的单个稿件的编辑记录。
 *
 * @param video 视频对象。请在视频对象中传入凭据类。
 */
export async function get_archive_edits(video: ArchiveVideoLike): Promise<any> {
  const api = API.archive.edits;
  const params = { bvid: video.get_bvid() };
  return new Api({ ...api, credential: video.credential ?? null }).updateParams(params).result;
}

/**
 * 获取自己的单个稿件的分 P 信息。
 *
 * @param video 视频对象。请在视频对象中传入凭据类。
 */
export async function get_archive_parts(video: ArchiveVideoLike): Promise<any> {
  const api = API.archive.pages;
  const params = { aid: video.get_aid() };
  return new Api({ ...api, credential: video.credential ?? null }).updateParams(params).result;
}
