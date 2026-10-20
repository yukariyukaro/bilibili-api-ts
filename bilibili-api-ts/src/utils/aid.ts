const TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf".split("");
const BASE = 58n;
const XOR_CODE = 23442827791579n;
const MASK_CODE = 2251799813685247n;
const MAX_AID = 1n << 51n;
const BV_LEN = 12;

export function bvid2aid(bvid: string): number {
  if (bvid.length !== BV_LEN || !bvid.startsWith("BV")) {
    throw new Error("bvid 必须是以 BV 开头、长度为 12 的字符串");
  }
  const chars = bvid.split("");
  [chars[3], chars[9]] = [chars[9], chars[3]];
  [chars[4], chars[7]] = [chars[7], chars[4]];
  let tmp = 0n;
  for (const char of chars.slice(3)) {
    const index = TABLE.indexOf(char);
    if (index < 0) throw new Error(`bvid 含非法字符：${char}`);
    tmp = tmp * BASE + BigInt(index);
  }
  return Number((tmp & MASK_CODE) ^ XOR_CODE);
}

export function aid2bvid(aid: number): string {
  const chars = ["B", "V", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
  let index = BV_LEN - 1;
  let tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE;
  while (tmp !== 0n) {
    chars[index] = TABLE[Number(tmp % BASE)];
    tmp /= BASE;
    index -= 1;
  }
  [chars[3], chars[9]] = [chars[9], chars[3]];
  [chars[4], chars[7]] = [chars[7], chars[4]];
  return chars.join("");
}
