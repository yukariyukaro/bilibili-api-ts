import { Api, Credential, getApi } from "./utils/network";

const API = getApi("video_tag");
const VIDEO_API = getApi("video");

export interface TagOptions {
  tag_name?: string | null;
  tag_id?: number | null;
  credential?: Credential;
}

export class Tag {
  __tagId: number | null;
  __tagName: string | null;
  credential: Credential;

  constructor(options: TagOptions = {}) {
    const { tag_name = null, tag_id = null, credential = new Credential() } = options;
    this.__tagId = tag_id;
    this.__tagName = tag_name;
    this.credential = credential;
  }

  async get_tag_id(): Promise<number> {
    if (!this.__tagId) await this.get_tag_info();
    return this.__tagId as number;
  }

  async get_tag_name(): Promise<string> {
    if (!this.__tagName) await this.get_tag_info();
    return this.__tagName as string;
  }

  async get_tag_info(): Promise<any> {
    if (!this.__tagId && !this.__tagName) throw new Error("初始化时 tag_id 和 tag_name 至少要提供一个。");
    const api = API.info.tag_info;
    const params: Record<string, any> = this.__tagId
      ? { tag_id: this.__tagId }
      : { tag_name: this.__tagName };
    const result = await new Api({ ...api }).updateParams(params).result;
    if (!this.__tagId) this.__tagId = result.tag_id;
    if (!this.__tagName) this.__tagName = result.tag_name;
    return result;
  }

  async get_similar_tags(): Promise<any> {
    const api = API.info.get_similar;
    return new Api({ ...api }).updateParams({ tag_id: await this.get_tag_id() }).result;
  }

  async subscribe_tag(): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = VIDEO_API.operate.subscribe_tag;
    return new Api({ ...api, credential: this.credential }).updateData({ tag_id: await this.get_tag_id() }).result;
  }

  async unsubscribe_tag(): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = VIDEO_API.operate.unsubscribe_tag;
    return new Api({ ...api, credential: this.credential }).updateData({ tag_id: await this.get_tag_id() }).result;
  }
}
