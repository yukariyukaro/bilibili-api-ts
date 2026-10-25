import { ArgsException, DanmakuClosedException, NetworkException, ResponseCodeException } from "./exceptions";
import { aid2bvid, bvid2aid } from "./utils/aid";
import { BytesReader } from "./utils/BytesReader";
import { Danmaku, SpecialDanmaku } from "./utils/danmaku";
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

/** 弹幕操作枚举：删除 / 保护 / 取消保护。 */
export enum DanmakuOperatorType {
  DELETE = 1,
  PROTECT = 2,
  UNPROTECT = 3,
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

  // ---------- 以下为 17.5.0 补齐：与 Python video.py 的互动 / 详情接口一致 ----------

  /** 获取视频详细信息（比 get_info 多返回运营卡片等字段）。 */
  async get_detail(): Promise<any> {
    const api = API.info.detail;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ bvid: this.__bvid, aid: this.__aid, need_operation_card: 0, need_elec: 0 })
      .result;
  }

  /** 获取视频 UP 主的 mid。 */
  async get_up_mid(): Promise<number> {
    const info = await this.__getInfoCached();
    return info.owner.mid;
  }

  /** 获取视频充电用户。 */
  async get_chargers(): Promise<any> {
    const info = await this.__getInfoCached();
    const api = API.info.chargers;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ aid: this.__aid, bvid: this.__bvid, mid: info.owner.mid })
      .result;
  }

  /** 获取视频快照（各时间段截图拼图）。返回的 Url 没有 http 头。 */
  async get_video_snapshot(cid: number | null = null, json_index = false, pvideo = true): Promise<any> {
    const params: Record<string, any> = { aid: this.__aid };
    let api: any;
    if (pvideo) {
      api = API.info.video_snapshot_pvideo;
    } else {
      params.bvid = this.__bvid;
      if (json_index) params.index = 1;
      if (cid) params.cid = cid;
      api = API.info.video_snapshot;
    }
    return new Api({ ...api, credential: this.credential }).updateParams(params).result;
  }

  /** 是否禁止笔记。 */
  async is_forbid_note(): Promise<boolean> {
    const api = API.info.is_forbid;
    return (await new Api({ ...api, credential: this.credential }).updateParams({ aid: this.__aid }).result)
      .forbid_note_entrance;
  }

  /** 获取稿件私有笔记列表（note id 列表）。 */
  async get_private_notes_list(): Promise<any> {
    this.credential.raiseForNoSessdata();
    const api = API.info.private_notes;
    return (await new Api({ ...api, credential: this.credential }).updateParams({ oid: this.__aid, oid_type: 0 }).result)
      .noteIds;
  }

  /** 获取稿件公开笔记列表。 */
  async get_public_notes_list(pn: number, ps: number): Promise<any> {
    const api = API.info.public_notes;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ oid: this.__aid, oid_type: 0, pn, ps })
      .result;
  }

  /** 获取稿件 AI 总结结果。cid 与 page_index 至少提供一个，cid 优先。 */
  async get_ai_conclusion(
    options: { cid?: number | null; page_index?: number | null; up_mid?: number | null } = {},
  ): Promise<any> {
    const { cid = null, page_index = null, up_mid = null } = options;
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const api = API.info.ai_conclusion;
    return new Api({ ...api, credential: this.credential })
      .updateParams({
        aid: this.__aid,
        bvid: this.__bvid,
        cid: actualCid,
        up_mid: up_mid ?? (await this.get_up_mid()),
        web_location: "333.788",
      })
      .result;
  }

  /** 获取当前用户与视频的关系（需要登录）。 */
  async get_relation(): Promise<any> {
    this.credential.raiseForNoSessdata();
    const api = API.info.relation;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ aid: this.__aid, bvid: this.__bvid })
      .result;
  }

  /** 视频是否已点赞（需要登录）。 */
  async has_liked(): Promise<boolean> {
    this.credential.raiseForNoSessdata();
    const api = API.info.has_liked;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ bvid: this.__bvid, aid: this.__aid })
      .result;
  }

  /** 视频已投币数量（需要登录）。 */
  async get_pay_coins(): Promise<number> {
    this.credential.raiseForNoSessdata();
    const api = API.info.get_pay_coins;
    const data = await new Api({ ...api, credential: this.credential })
      .updateParams({ bvid: this.__bvid, aid: this.__aid })
      .result;
    return data.multiply;
  }

  /** 视频是否已收藏（需要登录）。 */
  async has_favoured(): Promise<boolean> {
    this.credential.raiseForNoSessdata();
    const api = API.info.has_favoured;
    const data = await new Api({ ...api, credential: this.credential })
      .updateParams({ bvid: this.__bvid, aid: this.__aid })
      .result;
    return data.favoured;
  }

  /** 点赞 / 取消点赞。 */
  async like(status = true): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.operate.like;
    return new Api({ ...api, credential: this.credential })
      .updateData({ aid: this.__aid, like: status ? 1 : 2 })
      .result;
  }

  /** 投币。num 只能为 1 或 2。 */
  async pay_coin(num = 1, like = false): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    if (num !== 1 && num !== 2) throw new ArgsException("投币数量只能是 1 ~ 2 个。");
    const api = API.operate.coin;
    return new Api({ ...api, credential: this.credential })
      .updateData({ aid: this.__aid, bvid: this.__bvid, multiply: num, like: like ? 1 : 0 })
      .result;
  }

  /** 分享视频，返回当前分享数。 */
  async share(): Promise<number> {
    const api = API.operate.share;
    return new Api({ ...api, credential: this.credential })
      .updateData({ bvid: this.__bvid, aid: this.__aid, csrf: this.credential.bili_jct })
      .result;
  }

  /** 一键三连（点赞 + 投币 + 收藏）。 */
  async triple(): Promise<any> {
    const api = API.operate.yjsl;
    return new Api({ ...api, credential: this.credential })
      .updateData({ bvid: this.__bvid, aid: this.__aid })
      .result;
  }

  /** 给稿件添加标签。 */
  async add_tag(name: string): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.operate.add_tag;
    return new Api({ ...api, credential: this.credential })
      .updateData({ aid: this.__aid, bvid: this.__bvid, tag_name: name })
      .result;
  }

  /** 删除稿件标签。 */
  async delete_tag(tag_id: number): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.operate.del_tag;
    return new Api({ ...api, credential: this.credential })
      .updateData({ tag_id, aid: this.__aid, bvid: this.__bvid })
      .result;
  }

  /** 设置视频收藏状态。add/del 至少提供一个。 */
  async set_favorite(add_media_ids: number[] = [], del_media_ids: number[] = []): Promise<any> {
    if (add_media_ids.length + del_media_ids.length === 0) {
      throw new ArgsException("对收藏夹无修改。请至少提供 add_media_ids 和 del_media_ids 中的其中一个。");
    }
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.operate.favorite;
    return new Api({ ...api, credential: this.credential })
      .updateData({
        rid: this.__aid,
        type: 2,
        add_media_ids: add_media_ids.map((item) => String(item)).join(","),
        del_media_ids: del_media_ids.map((item) => String(item)).join(","),
      })
      .result;
  }

  /** 添加视频至稍后再看列表。 */
  async add_to_toview(): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = getApi("toview").operate.add;
    return new Api({ ...api, credential: this.credential }).updateData({ aid: this.__aid }).result;
  }

  /** 从稍后再看列表删除视频。 */
  async delete_from_toview(): Promise<any> {
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = getApi("toview").operate.del;
    return new Api({ ...api, credential: this.credential })
      .updateData({ viewed: "false", aid: this.__aid })
      .result;
  }

  // ---------- 弹幕（对应 Python video.py「弹幕」一节，protobuf 解析） ----------

  /** 获取弹幕设置、特殊弹幕、弹幕数量、弹幕分段等信息。 */
  async get_danmaku_view(options: { page_index?: number | null; cid?: number | null } = {}): Promise<any> {
    const { page_index = null, cid = null } = options;
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const api = API.danmaku.view;
    let buffer: Buffer;
    try {
      buffer = await new Api({ ...api, credential: this.credential })
        .updateParams({ type: 1, oid: actualCid, pid: this.__aid })
        .requestBytes();
    } catch (error) {
      throw new NetworkException(-1, String((error as Error)?.message ?? error));
    }

    const readDmSeg = (stream: Uint8Array): Record<string, any> => {
      const reader = new BytesReader(stream);
      const data: Record<string, any> = {};
      while (!reader.has_end()) {
        const t = reader.varint() >> 3;
        if (t === 1) data.page_size = reader.varint();
        else if (t === 2) data.total = reader.varint();
        else continue;
      }
      return data;
    };

    const readFlag = (stream: Uint8Array): Record<string, any> => {
      const reader = new BytesReader(stream);
      const data: Record<string, any> = {};
      while (!reader.has_end()) {
        const t = reader.varint() >> 3;
        if (t === 1) data.rec_flag = reader.varint();
        else if (t === 2) data.rec_text = reader.string();
        else if (t === 3) data.rec_switch = reader.varint();
        else continue;
      }
      return data;
    };

    const readSettings = (stream: Uint8Array): Record<string, any> => {
      const reader = new BytesReader(stream);
      const data: Record<string, any> = {};
      while (!reader.has_end()) {
        const t = reader.varint() >> 3;
        if (t === 1) data.dm_switch = reader.bool();
        else if (t === 2) data.ai_switch = reader.bool();
        else if (t === 3) data.ai_level = reader.varint();
        else if (t === 4) data.enable_top = reader.bool();
        else if (t === 5) data.enable_scroll = reader.bool();
        else if (t === 6) data.enable_bottom = reader.bool();
        else if (t === 7) data.enable_color = reader.bool();
        else if (t === 8) data.enable_special = reader.bool();
        else if (t === 9) data.prevent_shade = reader.bool();
        else if (t === 10) data.dmask = reader.bool();
        else if (t === 11) data.opacity = reader.float(true);
        else if (t === 12) data.dm_area = reader.varint();
        else if (t === 13) data.speed_plus = reader.float(true);
        else if (t === 14) data.font_size = reader.float(true);
        else if (t === 15) data.screen_sync = reader.bool();
        else if (t === 16) data.speed_sync = reader.bool();
        else if (t === 17) data.font_family = reader.string();
        else if (t === 18) data.bold = reader.bool();
        else if (t === 19) data.font_border = reader.varint();
        else if (t === 20) data.draw_type = reader.string();
        else if (t === 22 || t === 24 || t === 26) reader.bool();
        else if (t === 25) reader.varint();
        else if (t === 23) reader.bytes_string();
        else continue;
      }
      return data;
    };

    const jsonData: Record<string, any> = {};
    const reader = new BytesReader(buffer);
    while (!reader.has_end()) {
      const type_ = reader.varint() >> 3;
      if (type_ === 1) jsonData.state = reader.varint();
      else if (type_ === 2) jsonData.text = reader.string();
      else if (type_ === 3) jsonData.text_side = reader.string();
      else if (type_ === 4) jsonData.dm_seg = readDmSeg(reader.bytes_string());
      else if (type_ === 5) jsonData.flag = readFlag(reader.bytes_string());
      else if (type_ === 6) {
        if (!jsonData.special_dms) jsonData.special_dms = [];
        jsonData.special_dms.push(reader.string());
      } else if (type_ === 7) jsonData.check_box = reader.bool();
      else if (type_ === 8) jsonData.count = reader.varint();
      else if (type_ === 10) jsonData.dm_setting = readSettings(reader.bytes_string());
      else if (type_ === 9 || type_ === 12) {
        // 折叠弹幕 / 图文弹幕：Python 逐个字段解析，这里保留原始字节（见 README「已知差异」）。
        const key = type_ === 9 ? "command_dms_raw" : "image_dms_raw";
        if (!jsonData[key]) jsonData[key] = [];
        jsonData[key].push(reader.bytes_string());
      } else continue;
    }
    return jsonData;
  }

  /**
   * 获取弹幕。
   * @param page_index 分 P 号（从 0 开始）
   * @param date 指定日期后为历史弹幕（精确到年月日），此时只取该日全部段
   * @param cid 分 P 的 cid
   * @param from_seg / to_seg 段范围（一段 6 分钟，仅在 date 为空时有效）
   */
  async get_danmakus(
    options: { page_index?: number | null; date?: Date | string | null; cid?: number | null; from_seg?: number | null; to_seg?: number | null } = {},
  ): Promise<Danmaku[]> {
    const { page_index = 0, date = null, cid = null, from_seg = null, to_seg = null } = options;
    if (date !== null && date !== undefined) this.credential.raiseForNoSessdata();

    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }

    const params: Record<string, any> = { oid: actualCid, type: 1, pid: this.__aid };
    let api: any;
    let startSeg = from_seg;
    let endSeg = to_seg;
    if (date !== null && date !== undefined) {
      api = API.danmaku.get_history_danmaku;
      const formatted = typeof date === "string" ? date : formatDate(date);
      params.date = formatted;
      params.type = 1;
      startSeg = 0;
      endSeg = 0;
    } else {
      api = API.danmaku.get_danmaku;
      if (startSeg === null || startSeg === undefined) startSeg = 0;
      if (endSeg === null || endSeg === undefined) {
        const info = await this.__getInfoCached();
        const pages = info.pages || [];
        const target = pages.find((item: any) => item.cid === actualCid);
        endSeg = Math.floor(((target?.duration ?? 0) / 360)) + 1;
      }
    }

    const danmakus: Danmaku[] = [];
    for (let seg = startSeg; seg <= endSeg; seg += 1) {
      if (date === null || date === undefined) params.segment_index = seg + 1;
      let data: Buffer;
      try {
        data = await new Api({ ...api, credential: this.credential }).updateParams(params).requestBytes();
      } catch (error) {
        throw new NetworkException(-1, String((error as Error)?.message ?? error));
      }
      if (data.length === 2 && data[0] === 0x10 && data[1] === 0x01) {
        throw new DanmakuClosedException();
      }

      // Python 版假设「顶层只会出现字段 1」，按字段号分支；真实响应里出现过
      // 字段号相同但 wire type 不同的变体，会让逐字移植的循环错位。
      // 这里按 protobuf 的 wire type 跳读：语义等价（字段 1 + wire 2 解析弹幕），
      // 但对未知字段更健壮。
      const reader = new BytesReader(data);
      while (!reader.has_end()) {
        const tag = reader.varint();
        const type_ = tag >> 3;
        const wire = tag & 7;
        if (!(type_ === 1 && wire === 2)) {
          if (wire === 0) reader.varint();
          else if (wire === 1) {
            for (let index = 0; index < 8; index += 1) reader.byte();
          } else if (wire === 2) reader.bytes_string();
          else if (wire === 5) {
            for (let index = 0; index < 4; index += 1) reader.byte();
          } else throw new ResponseCodeException(-1, "解析响应数据错误", {});
          continue;
        }
        const dm = new Danmaku("");
        const dmReader = new BytesReader(reader.bytes_string());
        while (!dmReader.has_end()) {
          const elemTag = dmReader.varint();
          const dataType = elemTag >> 3;
          const elemWire = elemTag & 7;
          if (dataType > 26 || (elemWire !== 0 && elemWire !== 2)) {
            // 未知字段：按 wire type 跳过，保证后面的字段还能读出来
            if (elemWire === 0) dmReader.varint();
            else if (elemWire === 2) dmReader.bytes_string();
            else if (elemWire === 1) {
              for (let index = 0; index < 8; index += 1) dmReader.byte();
            } else if (elemWire === 5) {
              for (let index = 0; index < 4; index += 1) dmReader.byte();
            } else break;
            continue;
          }
          if (dataType === 1) dm.id_ = dmReader.varint();
          else if (dataType === 2) dm.dm_time = dmReader.varint() / 1000;
          else if (dataType === 3) dm.mode = dmReader.varint();
          else if (dataType === 4) dm.font_size = dmReader.varint();
          else if (dataType === 5) {
            const color = dmReader.varint();
            dm.color = color !== 60001 ? color.toString(16) : "special";
          } else if (dataType === 6) dm.crc32_id = dmReader.string();
          else if (dataType === 7) dm.text = dmReader.string();
          else if (dataType === 8) dm.send_time = dmReader.varint();
          else if (dataType === 9) dm.weight = dmReader.varint();
          else if (dataType === 10) dm.action = String(dmReader.string());
          else if (dataType === 11) dm.pool = dmReader.varint();
          else if (dataType === 12) dm.id_str = dmReader.string();
          else if (dataType === 13) dm.attr = dmReader.varint();
          else if (dataType === 14) dm.uid = dmReader.varint();
          else if (dataType === 15) dmReader.varint();
          else if (dataType === 20 || dataType === 21 || dataType === 22) dmReader.bytes_string();
          else if (dataType === 25 || dataType === 26) dmReader.varint();
          else break;
        }
        danmakus.push(dm);
      }
    }
    return danmakus;
  }

  /** 获取特殊弹幕。 */
  async get_special_dms(options: { page_index?: number; cid?: number | null } = {}): Promise<SpecialDanmaku[]> {
    const { page_index = 0, cid = null } = options;
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const view = await this.get_danmaku_view({ cid: actualCid });
    if (!view.special_dms) return [];
    const dms: SpecialDanmaku[] = [];
    for (const url of view.special_dms) {
      const buffer = await new Api({ url, method: "GET", credential: this.credential } as any).requestBytes();
      const reader = new BytesReader(buffer);
      while (!reader.has_end()) {
        const type_ = reader.varint() >> 3;
        if (type_ !== 1) continue;
        const spec = new SpecialDanmaku("");
        const inner = new BytesReader(reader.bytes_string());
        while (!inner.has_end()) {
          const t = inner.varint() >> 3;
          if (t === 1) spec.id_ = inner.varint();
          else if (t === 3) spec.mode = inner.varint();
          else if (t === 4) inner.varint();
          else if (t === 5) inner.varint();
          else if (t === 6) inner.string();
          else if (t === 7) spec.content = inner.string();
          else if (t === 8) inner.varint();
          else if (t === 11) spec.pool = inner.varint();
          else if (t === 12) spec.id_str = inner.string();
          else continue;
        }
        dms.push(spec);
      }
    }
    return dms;
  }

  /** 获取特定月份存在历史弹幕的日期。 */
  async get_history_danmaku_index(
    options: { page_index?: number | null; date?: Date | string | null; cid?: number | null } = {},
  ): Promise<string[] | null> {
    const { page_index = null, date = null, cid = null } = options;
    if (date === null || date === undefined) throw new ArgsException("请提供 date 参数");
    this.credential.raiseForNoSessdata();
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const api = API.danmaku.get_history_danmaku_index;
    const month = typeof date === "string" ? date : formatMonth(date);
    return new Api({ ...api, credential: this.credential })
      .updateParams({ oid: actualCid, month, type: 1 })
      .result;
  }

  /** 查询这些弹幕是否已点赞。 */
  async has_liked_danmakus(options: { page_index?: number | null; ids?: number[] | null; cid?: number | null } = {}): Promise<any> {
    const { page_index = null, ids = null, cid = null } = options;
    if (!ids || ids.length === 0) throw new ArgsException("请提供 ids 参数并至少有一个元素");
    this.credential.raiseForNoSessdata();
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const api = API.danmaku.has_liked_danmaku;
    return new Api({ ...api, credential: this.credential })
      .updateParams({ oid: actualCid, ids: ids.map((item) => String(item)).join(",") })
      .result;
  }

  /** 发送弹幕。 */
  async send_danmaku(options: { page_index?: number | null; danmaku?: Danmaku | null; cid?: number | null } = {}): Promise<any> {
    const { page_index = null, danmaku = null, cid = null } = options;
    if (!danmaku) throw new ArgsException("请提供 danmaku 参数");
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const api = API.danmaku.send_danmaku;
    const pool = danmaku.is_sub ? 1 : 0;
    return new Api({ ...api, credential: this.credential })
      .updateData({
        type: 1,
        oid: actualCid,
        msg: danmaku.text,
        aid: this.__aid,
        bvid: this.__bvid,
        progress: Math.trunc(danmaku.dm_time * 1000),
        color: parseInt(danmaku.color, 16),
        fontsize: danmaku.font_size,
        pool,
        mode: danmaku.mode,
        plat: 1,
      })
      .result;
  }

  /** 获取所有弹幕的 XML 源文件（非装填）。 */
  async get_danmaku_xml(options: { page_index?: number | null; cid?: number | null } = {}): Promise<string> {
    const { page_index = null, cid = null } = options;
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const buffer = await new Api({ url: "https://comment.bilibili.com/" + actualCid + ".xml", method: "GET" } as any).requestBytes();
    return buffer.toString("utf-8");
  }

  /** 点赞 / 取消点赞弹幕。 */
  async like_danmaku(options: { page_index?: number | null; dmid?: number | null; status?: boolean; cid?: number | null } = {}): Promise<any> {
    const { page_index = null, dmid = null, status = true, cid = null } = options;
    if (dmid === null || dmid === undefined) throw new ArgsException("请提供 dmid 参数");
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const api = API.danmaku.like_danmaku;
    return new Api({ ...api, credential: this.credential })
      .updateData({ dmid, oid: actualCid, op: status ? 1 : 2, platform: "web_player" })
      .result;
  }

  /** 操作弹幕：删除 / 保护 / 取消保护。 */
  async operate_danmaku(
    options: {
      page_index?: number | null;
      dmids?: number[] | null;
      cid?: number | null;
      type_?: DanmakuOperatorType | null;
    } = {},
  ): Promise<any> {
    const { page_index = null, dmids = null, cid = null, type_ = null } = options;
    if (!dmids || dmids.length === 0) throw new ArgsException("请提供 dmid 参数");
    if (type_ === null || type_ === undefined) throw new ArgsException("请提供 type_ 参数");
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    const api = API.danmaku.edit_danmaku;
    return new Api({ ...api, credential: this.credential })
      .updateData({
        type: 1,
        dmids: dmids.map((item) => String(item)).join(","),
        oid: actualCid,
        state: type_,
      })
      .result;
  }

  /** 获取弹幕快照。 */
  async get_danmaku_snapshot(): Promise<any> {
    const api = API.danmaku.snapshot;
    return new Api({ ...api, credential: this.credential }).updateParams({ aid: this.__aid }).result;
  }

  /** 撤回弹幕。 */
  async recall_danmaku(options: { page_index?: number | null; dmid?: number; cid?: number | null } = {}): Promise<any> {
    const { page_index = null, dmid = 0, cid = null } = options;
    let actualCid = cid;
    if (actualCid === null || actualCid === undefined) {
      if (page_index === null || page_index === undefined) throw new ArgsException("page_index 和 cid 至少提供一个。");
      actualCid = await this.__getPageIdByIndex(page_index);
    }
    this.credential.raiseForNoSessdata();
    this.credential.raiseForNoBiliJct();
    const api = API.danmaku.recall;
    // Python 把这个 GET 的参数放在 body 里；这里按 GET 语义放进 query，否则参数会丢。
    return new Api({ ...api, credential: this.credential })
      .updateParams({ dmid, cid: actualCid })
      .result;
  }
}

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function formatMonth(date: Date): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}


