import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { encSign, encWbi } = require("../dist/utils/network.js");
const { aid2bvid, bvid2aid } = require("../dist/utils/aid.js");

test("WBI 签名与 Python 17.4.1 固定向量一致", () => {
  const params = { foo: "bar", baz: 1, q: "a b&c/中文" };
  encWbi(params, "0123456789abcdef0123456789abcdef", 1792447051);
  assert.deepEqual(params, {
    baz: 1,
    foo: "bar",
    q: "a b&c/中文",
    w_rid: "220ac33ffc7e348f1eacd75f0c30b7fe",
    web_location: 1550101,
    wts: 1792447051,
  });
});

test("APP 签名与 Python 17.4.1 固定向量一致", () => {
  assert.deepEqual(encSign({ a: 1, b: "x y" }), {
    a: 1,
    appkey: "4409e2ce8ffd12b8",
    b: "x y",
    sign: "6e7fcf608320c5673e8b7e21ca3df4ca",
  });
});

test("BV / AV 互转与 Python 17.4.1 一致", () => {
  assert.equal(bvid2aid("BV1xx411c7mD"), 2);
  assert.equal(bvid2aid("BV17x411w7KC"), 170001);
  assert.equal(aid2bvid(170001), "BV17x411w7KC");
});
