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
