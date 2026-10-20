import { aid2bvid, bvid2aid } from "./utils/aid";
import { Api, Credential, getApi } from "./utils/network";

const API = getApi("video");

export enum VideoQuality {
  Q127 = 127,
  Q126 = 126,
  Q125 = 125,
  Q120 = 120,
  Q116 = 116,
  Q112 = 112,
  Q80 = 80,
  Q74 = 74,
  Q64 = 64,
  Q32 = 32,
  Q16 = 16,
  Q6 = 6,
}

export interface VideoOptions {
  bvid?: string | null;
  aid?: number | null;
  credential?: Credential;
}

export class Video {
  __bvid = "";
  __aid = 0;
  __info: any = null;
  credential: Credential;

  constructor(options: VideoOptions) {
    const { bvid = null, aid = null, credential = new Credential() } = options || {};
    if (bvid) {
      this.setBvid(bvid);
    } else if (aid) {
      this.setAid(aid);
    } else {
      throw new Error("请至少提供 bvid 和 aid 中的其中一个参数。");
    }
    this.credential = credential;
  }

  setBvid(bvid: string): void {
    if (bvid.length !== 12 || !bvid.startsWith("BV")) {
      throw new Error("bvid 提供错误，必须是以 BV 开头的纯字母和数字组成的 12 位字符串（大小写敏感）。");
    }
    this.__bvid = bvid;
    this.__aid = bvid2aid(bvid);
  }

  getBvid(): string {
    return this.__bvid;
  }

  get_bvid(): string {
    return this.__bvid;
  }

  setAid(aid: number): void {
    if (aid <= 0) throw new Error("aid 提供错误，必须大于 0。");
    this.__aid = aid;
    this.__bvid = aid2bvid(aid);
  }

  getAid(): number {
    return this.__aid;
  }

  get_aid(): number {
    return this.__aid;
  }

  async __getInfoCached(): Promise<any> {
    if (this.__info === null) await this.get_info();
    return this.__info;
  }

  async get_info(): Promise<any> {
    const api = API.info.info;
    const params = { bvid: this.__bvid, aid: this.__aid };
    const resp = await new Api({ ...api, credential: this.credential }).updateParams(params).result;
    this.__info = resp;
    return resp;
  }

  async get_tags(options: { page_index?: number | null; cid?: number | null } = {}): Promise<any> {
    const { page_index = 0, cid = null } = options;
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new Error("page_index 和 cid 至少提供一个。");
      actualCid = await this.get_cid(page_index);
    }
    const api = API.info.tags;
    const params = { bvid: this.__bvid, aid: this.__aid, cid: actualCid };
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  async get_pages(): Promise<any> {
    const api = API.info.pages;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ aid: this.__aid, bvid: this.__bvid })
      .result;
  }

  async __getPageIdByIndex(pageIndex: number): Promise<number> {
    if (pageIndex < 0) throw new Error("分 p 号必须大于或等于 0。");
    const info = await this.__getInfoCached();
    const pages = info.pages || [];
    if (pages.length <= pageIndex) throw new Error("不存在该分 p。");
    return pages[pageIndex].cid;
  }

  async get_cid(page_index = 0): Promise<number> {
    return this.__getPageIdByIndex(page_index);
  }

  async get_subtitle(options: { cid?: number | null } = {}): Promise<any> {
    const { cid = null } = options;
    if (cid === null || cid === undefined) throw new Error("需要 cid");
    return (await this.get_player_info({ cid })).subtitle;
  }

  async get_player_info(options: { cid?: number | null; epid?: number | null } = {}): Promise<any> {
    const { cid = null, epid = null } = options;
    if (cid === null || cid === undefined) throw new Error("需要 cid");
    const api = API.info.get_player_info;
    const params: Record<string, any> = {
      aid: this.__aid,
      cid,
      isGaiaAvoided: false,
      web_location: 1315873,
    };
    if (epid) params.epid = epid;
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  async get_related(): Promise<any> {
    const api = API.info.related;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ aid: this.__aid, bvid: this.__bvid })
      .result;
  }

  async get_download_url(options: { page_index?: number | null; cid?: number | null; html5?: boolean } = {}): Promise<any> {
    const { page_index = null, cid = null, html5 = false } = options;
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new Error("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const api = API.info.playurl;
    const params: Record<string, any> = {
      avid: this.__aid,
      cid: actualCid,
      qn: "127",
      otype: "json",
      fnval: 4048,
      fourk: 1,
    };
    if (html5) params.platform = "html5";
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }
}
