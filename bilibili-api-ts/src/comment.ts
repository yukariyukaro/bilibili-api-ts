import { Api, Credential, getApi } from "./utils/network";

const API = getApi("common");

export enum CommentResourceType {
  VIDEO = 1,
  ARTICLE = 12,
  DYNAMIC_DRAW = 11,
  DYNAMIC = 17,
  AUDIO = 14,
  AUDIO_LIST = 19,
  CHEESE = 33,
  BLACK_ROOM = 6,
  MANGA = 22,
  ACTIVITY = 4,
}

export enum OrderType {
  LIKE = 2,
  TIME = 0,
}

export enum ReportReason {
  OTHER = 0,
  SPAM_AD = 1,
  PORNOGRAPHY = 2,
  FLOOD = 3,
  PROVOCATION = 4,
  SPOILER = 5,
  POLITICS = 6,
  PERSONAL_ATTACK = 7,
  IRRELEVANT_CONTENT = 8,
  ILLEGAL = 9,
  VULGAR = 10,
  ILLEGAL_WEBSITE = 11,
  GAMBLING_FRAUD = 12,
  SPREADING_FALSE_INFORMATION = 13,
  INCITING_INFORMATION = 14,
  PRIVACY_VIOLATION = 15,
  FLOOR_TAKING = 16,
  INAPPROPRIATE_CONTENT_FOR_MINORS = 17,
}

function enumValue(value: any): any {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

export class Comment {
  __oid: number;
  __rpid: number;
  __type: CommentResourceType;
  credential: Credential;

  constructor(oid: number, type: CommentResourceType, rpid: number, credential: Credential = new Credential()) {
    this.__oid = oid;
    this.__rpid = rpid;
    this.__type = type;
    this.credential = credential;
  }

  __getData(status: boolean): Record<string, any> {
    return {
      oid: this.__oid,
      type: this.__type,
      rpid: this.__rpid,
      action: status ? 1 : 0,
    };
  }

  get_rpid(): number {
    return this.__rpid;
  }

  get_type(): CommentResourceType {
    return this.__type;
  }

  get_oid(): number {
    return this.__oid;
  }

  async like(status = true): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.comment.like;
    return new Api({ ...api, credential: this.credential }).updateData(this.__getData(status)).result;
  }

  async hate(status = true): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.comment.hate;
    return new Api({ ...api, credential: this.credential }).updateData(this.__getData(status)).result;
  }

  async pin(status = true): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.comment.pin;
    return new Api({ ...api, credential: this.credential }).updateData(this.__getData(status)).result;
  }

  async delete(): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.comment.del;
    const data = this.__getData(true);
    delete data.action;
    return new Api({ ...api, credential: this.credential }).updateData(data).result;
  }

  async get_sub_comments(page_index = 1, page_size = 10): Promise<any> {
    if (page_index <= 0) throw new Error("page_index 必须大于或等于 1");
    const api = API.comment.sub_reply;
    const params = {
      pn: page_index,
      ps: page_size,
      type: this.__type,
      oid: this.__oid,
      root: this.__rpid,
    };
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  async report(report_reason: ReportReason, content?: string | null): Promise<any> {
    this.credential.raiseForNoSessdata();
    if (content !== undefined && content !== null && report_reason !== ReportReason.OTHER) {
      throw new Error("content 只能在 report_reason=ReportReason.OTHER 时使用");
    }
    if ((content === undefined || content === null) && report_reason === ReportReason.OTHER) {
      throw new Error("report_reason=ReportReason.OTHER 时 content 不能为空");
    }
    const api = API.comment.report;
    return new Api({ ...api, credential: this.credential })
      .updateData({
        oid: this.__oid,
        type: this.__type,
        rpid: this.__rpid,
        reason: report_reason,
        content: content ?? null,
      })
      .result;
  }
}

export interface SendCommentOptions {
  text: string;
  oid: number;
  type_: CommentResourceType;
  root?: number | null;
  parent?: number | null;
  credential?: Credential;
}

export async function send_comment(options: SendCommentOptions): Promise<any> {
  const { text, oid, type_, root = null, parent = null, credential = new Credential() } = options;
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const data: Record<string, any> = {
    oid,
    type: enumValue(type_),
    message: text,
    plat: 1,
    statistics: { appId: 100, platform: 5 },
    gaia_source: "main_web",
  };
  if (root === null && parent === null) {
    // 直接回复资源
  } else if (root !== null && parent === null) {
    data.root = root;
    data.parent = root;
  } else if (root !== null && parent !== null) {
    data.root = root;
    data.parent = parent;
  } else {
    throw new Error("root=None 时，parent 不得设置");
  }
  const api = API.comment.send;
  return new Api({ ...api, credential }).updateData(data).result;
}

export interface GetCommentsOptions {
  oid: number;
  type_: CommentResourceType;
  page_index?: number;
  order?: OrderType;
  credential?: Credential;
}

export async function get_comments(options: GetCommentsOptions): Promise<any> {
  const { oid, type_, page_index = 1, order = OrderType.TIME, credential } = options;
  if (page_index <= 0) throw new Error("page_index 必须大于或等于 1");
  const api = API.comment.get;
  return new Api({ ...api, credential: credential ?? null })
    .updateParams({ pn: page_index, type: enumValue(type_), oid, sort: enumValue(order) })
    .result;
}

export interface GetCommentsLazyOptions {
  oid: number;
  type_: CommentResourceType;
  offset?: string;
  order?: OrderType;
  credential?: Credential;
}

export async function get_comments_lazy(options: GetCommentsLazyOptions): Promise<any> {
  const { oid, type_, offset = "", order = OrderType.TIME, credential } = options;
  const escaped = offset.replace(/"/g, '\\"');
  const pagination = `{"offset":"${escaped}"}`;
  const modeMap: Record<number, number> = { 0: 2, 2: 3 };
  const api = API.comment.reply_by_session_id;
  return new Api({ ...api, credential: credential ?? null })
    .updateParams({
      oid,
      type: enumValue(type_),
      mode: modeMap[enumValue(order)],
      pagination_str: pagination,
      web_location: "1315875",
    })
    .result;
}
