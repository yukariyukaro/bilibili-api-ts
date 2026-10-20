# bilibili-api-ts

`bilibili-api-python` 的 TypeScript 移植仓库。包源码位于 [`bilibili-api-ts/`](./bilibili-api-ts)，完整说明见 [包 README](./bilibili-api-ts/README.md)。

## 仓库关系

| 仓库 | 作用 |
| --- | --- |
| [`bilibili-api-python`](https://github.com/qianxuntudou-ops/bilibili-api-python) | 接口定义与行为的基准 |
| 本仓库 | TypeScript 实现与 npm 包 |
| `dsh-bili-scroll` | 使用本包的 CLI 与 Skill |

## 开发

```bash
cd bilibili-api-ts
npm install
npm run sync:api   # 自动查找 bilibili-api-python，缺失时回退 vendor/api
npm run build
npm test
```

真实接口回归默认关闭，需显式设置 `BILIBILI_E2E=1`。

## 发布

```bash
cd bilibili-api-ts
npm pack
npm publish --access public
```

或推送 `v*` 标签，由 `.github/workflows/publish.yml` 使用 `NPM_TOKEN` 发布。

## 许可证

GPL-3.0-or-later。
