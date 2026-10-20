import { Credential, HEADERS, rawRequest } from "./network";

const accessIds: Record<string, string> = {};
const lastTimestamp: Record<string, number> = {};

function decodeJwtPayload(token: string): any {
  const payload = token.split(".")[1];
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
}

export async function getWebId(url: string, credential: Credential): Promise<string | null> {
  if (accessIds[url] && lastTimestamp[url] > Math.floor(Date.now() / 1000)) {
    return accessIds[url];
  }
  const response = await rawRequest({
    method: "GET",
    url,
    headers: { ...HEADERS },
    cookies: credential.getCookies(),
  });
  const match = /<script id="__RENDER_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(response.text);
  if (!match) return null;
  let render: any;
  try {
    render = JSON.parse(match[1]);
  } catch {
    render = JSON.parse(decodeURIComponent(match[1]));
  }
  const accessId = render.access_id;
  if (!accessId) return null;
  accessIds[url] = accessId;
  const payload = decodeJwtPayload(accessId);
  lastTimestamp[url] = Number(payload.iat) + Number(payload.ttl);
  return accessId;
}

export async function getUserDynamicRenderData(uid: number, credential: Credential): Promise<string | null> {
  return getWebId(`https://space.bilibili.com/${uid}/dynamic`, credential);
}
