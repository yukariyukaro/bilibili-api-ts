import { activityData } from "./activity";
import { albumData } from "./album";
import { appData } from "./app";
import { articleCategoryData } from "./article-category";
import { articleData } from "./article";
import { audioData } from "./audio";
import { audioUploaderData } from "./audio_uploader";
import { bangumiData } from "./bangumi";
import { blackRoomData } from "./black-room";
import { channelSeriesData } from "./channel-series";
import { cheeseData } from "./cheese";
import { clientData } from "./client";
import { commonData } from "./common";
import { creativeCenterData } from "./creative_center";
import { credentialData } from "./credential";
import { dynamicData } from "./dynamic";
import { emojiData } from "./emoji";
import { favoriteListData } from "./favorite-list";
import { gameData } from "./game";
import { garbData } from "./garb";
import { homepageData } from "./homepage";
import { hotData } from "./hot";
import { interactiveVideoData } from "./interactive_video";
import { liveAreaData } from "./live-area";
import { liveData } from "./live";
import { loginData } from "./login";
import { mangaData } from "./manga";
import { musicData } from "./music";
import { noteData } from "./note";
import { opusData } from "./opus";
import { rankData } from "./rank";
import { searchData } from "./search";
import { sessionData } from "./session";
import { showData } from "./show";
import { topicData } from "./topic";
import { toviewData } from "./toview";
import { userData } from "./user";
import { videoData } from "./video";
import { videoTagData } from "./video_tag";
import { videoUploaderData } from "./video_uploader";
import { videoZoneData } from "./video_zone";
import { voteData } from "./vote";
import { watchroomData } from "./watchroom";

export const apiData: Record<string, unknown> = {
    "activity": activityData,
    "album": albumData,
    "app": appData,
    "article-category": articleCategoryData,
    "article": articleData,
    "audio": audioData,
    "audio_uploader": audioUploaderData,
    "bangumi": bangumiData,
    "black-room": blackRoomData,
    "channel-series": channelSeriesData,
    "cheese": cheeseData,
    "client": clientData,
    "common": commonData,
    "creative_center": creativeCenterData,
    "credential": credentialData,
    "dynamic": dynamicData,
    "emoji": emojiData,
    "favorite-list": favoriteListData,
    "game": gameData,
    "garb": garbData,
    "homepage": homepageData,
    "hot": hotData,
    "interactive_video": interactiveVideoData,
    "live-area": liveAreaData,
    "live": liveData,
    "login": loginData,
    "manga": mangaData,
    "music": musicData,
    "note": noteData,
    "opus": opusData,
    "rank": rankData,
    "search": searchData,
    "session": sessionData,
    "show": showData,
    "topic": topicData,
    "toview": toviewData,
    "user": userData,
    "video": videoData,
    "video_tag": videoTagData,
    "video_uploader": videoUploaderData,
    "video_zone": videoZoneData,
    "vote": voteData,
    "watchroom": watchroomData,
};
