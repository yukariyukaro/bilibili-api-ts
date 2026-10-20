import { Api, Credential, getApi } from "./utils/network";

const API = getApi("homepage");

export async function get_top_photo(): Promise<any> {
  const api = API.info.top_photo;
  return new Api({ ...api }).updateParams({ resource_id: 142 }).result;
}

export async function get_links(credential?: Credential): Promise<any> {
  const api = API.info.links;
  return new Api({ ...api, credential: credential ?? null }).updateParams({ pf: 0, ids: 4694 }).result;
}

export async function get_popularize(credential?: Credential): Promise<any> {
  const api = API.info.popularize;
  return new Api({ ...api, credential: credential ?? null }).updateParams({ pf: 0, ids: 34 }).result;
}

export async function get_videos(credential?: Credential): Promise<any> {
  const api = API.info.videos;
  return new Api({ ...api, credential: credential ?? null }).result;
}

export async function get_favorite_list_and_toview(credential: Credential): Promise<any> {
  credential.raiseForNoSessdata();
  const api = API.list.folder;
  return new Api({ ...api, credential }).result;
}

export async function get_favorite_list_content(
  media_id: number,
  credential?: Credential,
): Promise<any> {
  const api = API.list.resource;
  return new Api({ ...api, credential: credential ?? null })
    .updateParams({ web_location: "333.1007", platform: "web", media_id })
    .result;
}
