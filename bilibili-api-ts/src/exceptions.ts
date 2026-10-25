export class BiliApiException extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ArgsException extends BiliApiException {}

/** 视频弹幕已被关闭（Python 同名异常）。 */
export class DanmakuClosedException extends BiliApiException {
  constructor(message = "视频弹幕已关闭") {
    super(message);
  }
}

export class ResponseCodeException extends BiliApiException {
  code: number;
  data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(`${code}: ${message}`);
    this.code = code;
    this.data = data;
  }
}

export class NetworkException extends BiliApiException {
  code: number;
  text: string;

  constructor(code: number, text: string) {
    super(`网络请求失败（HTTP ${code}）：${text}`);
    this.code = code;
    this.text = text;
  }
}

export class CredentialNoSessdataException extends BiliApiException {
  constructor() {
    super("Credential 类需要 sessdata");
  }
}

export class CredentialNoBiliJctException extends BiliApiException {
  constructor() {
    super("Credential 类需要 bili_jct");
  }
}

export class CredentialNoBuvid3Exception extends BiliApiException {
  constructor() {
    super("Credential 类需要 buvid3");
  }
}

export class CredentialNoBuvid4Exception extends BiliApiException {
  constructor() {
    super("Credential 类需要 buvid4");
  }
}

export class CredentialNoDedeUserIDException extends BiliApiException {
  constructor() {
    super("Credential 类需要 DedeUserID");
  }
}

export class CredentialNoAcTimeValueException extends BiliApiException {
  constructor() {
    super("Credential 类需要 ac_time_value");
  }
}

export class WbiRetryTimesExceedException extends BiliApiException {
  constructor() {
    super("WBI 签名重试次数已用尽");
  }
}

export class CookiesRefreshException extends BiliApiException {}

export class ExClimbWuzhiException extends BiliApiException {
  code: number;

  constructor(code: number, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}
