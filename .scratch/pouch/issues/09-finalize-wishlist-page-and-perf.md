# 09 — Finalize: Wishlist Page Linking & Performance

**Parent**: [spec.md](../spec.md)

**Status**: ready-for-agent

**Blocked by**: 08 Index Page, 04 Wishlist Page

## What to build

项目收尾——README.md / .gitignore 补齐、`--data= --web= --port=` 启动参数可独立覆盖、心愿单页完成与首页入口的正式联通（08 中留下的"临时的 04 link" 替换为正式入口）、全仓库反向搜索测试（`innerHTML`/颜色字面量/`fetch` 三套 grep）、1000 条数据的性能监测单（首页 <800ms、列表筛选 <300ms）。

## Acceptance criteria

- [ ] `README.md`：本地启动、参数覆盖、数据目录说明、常见排查
- [ ] `.gitignore`：排除 `server/out/`、`data/.backup/`、`*.corrupt`、`data/*` `.keep` 模式可选
- [ ] `start.ps1` 支持 `-Data -Web -Port` 三个参数覆盖默认值
- [ ] 全仓库反向搜索（一次性脚本 `scripts/check-constraints.ps1`，后续可选集成到 tck start.ps1 之前）：
    - `echo | grep -Rn "innerHTML"`：仅允许 1 处（`web/js/dom.js` 中 `DOMPurify.sanitize` 后赋值）
    - `grep -RnE "#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\("` `web/css/*.css`：全部集中在 `tokens.css` 的 `:root` 区块；`layout.css` 与 `pages.css` 零命中
    - `grep -Rn "fetch\b"` `web/js/*.js`（排除 `vendor/`）：仅 `api.js` 出现；`index.js/list.js/detail.js/wishlist.js/dom.js/theme.js/warn.js` 零命中
- [ ] `grep -RnE "\"(inspirations|questions|knowledge|todos|wishlist)\.json\""` `server/src/`：仅 `model/Category.java` 出现
- [ ] 1000 条测试数据下：首页 <800ms、列表页筛选+分页 <300ms、单次 PATCH <200ms
- [ ] 键盘 Tab 全走一遍 4 页：焦点可见、顺序合理、模态框可 Tab 进出、Esc 能关闭模态
- [ ] 所有 ticket 已完成且 acceptance 全勾
- [ ] 08 留下的 wishlist 占位 link 替换为正式入口（04 页面完全可跳转）

## Reference

`docs/05-开发计划与运维.md` §5.1 阶段 5；`docs/04-前端实现.md` §4.9.1（innerHTML 限制）；`docs/00-总览与技术选型.md` ADR-006（杂志化）
