import { Api, Credential, getApi } from "./utils/network";
import { get_self_info } from "./user";

const API = getApi("session");

export enum EventType {
  TEXT = 1,
  PICTURE = 2,
  WITHDRAW = 5,
  GROUPS_PICTURE = 6,
  SHARE_VIDEO = 7,
  NOTICE = 10,
  PUSHED_VIDEO = 11,
  WELCOME = 306,
}

export async function fetch_session_msgs(options: {
  talker_id: number;
  credential: Credential;
  session_type?: number;
  begin_seqno?: number;
}): Promise<any> {
  const { talker_id, credential, session_type = 1, begin_seqno = 0 } = options;
  credential.raiseForNoSessdata();
  const params = { talker_id, session_type, size: 30, begin_seqno };
  const api = API.session.fetch;
  return new Api({ ...api, credential }).updateParams(params).result;
}

export async function new_sessions(options: { credential: Credential; begin_ts?: number }): Promise<any> {
  const { credential, begin_ts = Math.floor(Date.now() * 1000) } = options;
  credential.raiseForNoSessdata();
  const api = API.session.new;
  return new Api({ ...api, credential }).updateParams({ begin_ts, build: 0, mobi_app: "web" }).result;
}

export async function get_sessions(options: { credential: Credential; session_type?: number }): Promise<any> {
  const { credential, session_type = 4 } = options;
  credential.raiseForNoSessdata();
  const params = { session_type, group_fold: 1, unfollow_fold: 0, sort_rule: 2, build: 0, mobi_app: "web" };
  const api = API.session.get;
  return new Api({ ...api, credential }).updateParams(params).result;
}

export async function get_session_detail(options: {
  credential: Credential;
  talker_id: number;
  session_type?: number;
}): Promise<any> {
  const { credential, talker_id, session_type = 1 } = options;
  credential.raiseForNoSessdata();
  const api = API.session.get_session_detail;
  return new Api({ ...api, credential }).updateParams({ talker_id, session_type }).result;
}

export async function get_replies(options: {
  credential: Credential;
  last_reply_id?: number | null;
  reply_time?: number | null;
}): Promise<any> {
  const { credential, last_reply_id = null, reply_time = null } = options;
  const api = API.session.replies;
  return new Api({ ...api, credential }).updateParams({ id: last_reply_id, reply_time }).result;
}

export async function get_likes(options: {
  credential: Credential;
  last_id?: number | null;
  like_time?: number | null;
}): Promise<any> {
  const { credential, last_id = null, like_time = null } = options;
  const api = API.session.likes;
  return new Api({ ...api, credential }).updateParams({ id: last_id, like_time }).result;
}

export async function get_at(options: {
  credential: Credential;
  last_uid?: number | null;
  at_time?: number | null;
  last_id?: number | null;
}): Promise<any> {
  const { credential, last_uid = null, at_time = null, last_id = null } = options;
  const api = API.session.at;
  const id = last_id === null ? last_uid : last_id;
  return new Api({ ...api, credential }).updateParams({ id, at_time }).result;
}

export async function get_unread_messages(credential: Credential): Promise<any> {
  const api = API.session.unread;
  return new Api({ ...api, credential }).result;
}

export async function get_system_messages(credential: Credential): Promise<any> {
  const api = API.session.system_msg;
  return new Api({ ...api, credential }).result;
}

export async function get_session_settings(credential: Credential): Promise<any> {
  const api = API.session.session_settings;
  return new Api({ ...api, credential }).result;
}

export async function send_msg(options: {
  credential: Credential;
  receiver_id: number;
  msg_type: EventType;
  content: string;
}): Promise<any> {
  const { credential, receiver_id, msg_type, content } = options;
  credential.raiseForNoSessdata();
  credential.raiseForNoBiliJct();
  const api = API.operate.send_msg;
  let sender_uid: number;
  if (credential.hasDedeuserid() && Number(credential.dedeuserid) !== 0) {
    sender_uid = Number(credential.dedeuserid);
  } else {
    const selfInfo = await get_self_info(credential);
    sender_uid = selfInfo.mid;
  }

  if (msg_type !== EventType.TEXT && msg_type !== EventType.WITHDRAW) {
    throw new Error("信息类型不支持（当前仅移植 TEXT / WITHDRAW）。");
  }
  const realContent = msg_type === EventType.TEXT ? JSON.stringify({ content }) : String(content);
  const data: Record<string, any> = {
    "msg[sender_uid]": sender_uid,
    "msg[receiver_id]": receiver_id,
    "msg[receiver_type]": 1,
    "msg[msg_type]": msg_type,
    "msg[msg_status]": 0,
    "msg[content]": realContent,
    "msg[dev_id]": "A6716E9A-7CE3-47AF-994B-F0B34178D28D",
    "msg[new_face_version]": 0,
    "msg[timestamp]": Math.floor(Date.now() / 1000),
    from_filework: 0,
    build: 0,
    mobi_app: "web",
  };
  const query = { w_sender_uid: sender_uid, w_receiver_id: receiver_id };
  return new Api({ ...api, credential }).updateParams(query).updateData(data).result;
}
