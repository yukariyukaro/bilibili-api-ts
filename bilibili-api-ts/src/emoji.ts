/**
 * bilibili_api.emoji 的 TypeScript 移植。
 *
 * 对应 Python 模块：bilibili_api/emoji.py
 * 表情包相关：表情包列表、详情、全部表情包与添加表情包。
 * 端点数据来自 src/data/api/emoji.ts（Python 的 data/api/emoji.json）。
 */

import { Api, Credential, getApi } from "./utils/network";

const API = getApi("emoji");

/**
 * 获取表情包列表。
 *
 * @param business 使用场景，reply / dynamic。
 * @param credential 登录凭证。
 */
export async function get_emoji_list(
  business = "reply",
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  const api = API.list;
  const params = { business };
  return new Api({ ...api, credential: cred }).updateParams(params).result;
}

/**
 * 获取表情包详情。
 *
 * @param id 表情包 id（单个或列表），可通过 `get_emoji_list` 或 `get_all_emoji` 查询。
 * @param business 使用场景，reply / dynamic。
 */
export async function get_emoji_detail(
  id: number | number[],
  business = "reply",
): Promise<any> {
  const api = API.detail;
  const params = {
    // Python：list 时用 ",".join(str(i) for i in id)，否则原样传 id。
    ids: Array.isArray(id) ? id.map((item) => String(item)).join(",") : id,
    business,
  };
  return new Api({ ...api }).updateParams(params).result;
}

/**
 * 获取所有表情包。
 *
 * @param business 使用场景，reply / dynamic。
 * @param credential 登录凭证。
 */
export async function get_all_emoji(
  business = "reply",
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  const api = API.all;
  const params = { business };
  return new Api({ ...api, credential: cred }).updateParams(params).result;
}

/**
 * 添加表情包。
 *
 * @param package_id 表情包 id，可通过 `get_emoji_list` 或 `get_all_emoji` 查询。
 * @param credential 登录凭证。
 */
export async function add_emoji(
  package_id: number,
  credential: Credential | null = null,
): Promise<any> {
  const cred = credential ?? new Credential();
  cred.raiseForNoSessdata();
  const api = API.add;
  // Python 版同样用 update_params（而非 update_data）提交，保持行为一致。
  const params = {
    package_id,
    business: "reply",
    csrf: cred.bili_jct,
  };
  return new Api({ ...api, credential: cred }).updateParams(params).result;
}
