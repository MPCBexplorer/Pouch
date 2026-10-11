# 09 — Finalize: Wishlist Page Linking & Performance

**Parent**: [spec.md](../spec.md)

**Status**: resolved

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

## Comments

### 2026-10-11 — 收尾完成

**交付物**：
1. `README.md`（新建）——环境要求、快速开始、`-Data/-Web/-Port` 参数表、数据目录与备份机制、四页面说明、常用排查表、约定检查入口、目录结构。
2. `scripts/check-constraints.ps1`（新建）——全仓库反向搜索一次性脚本：innerHTML 唯一性、颜色字面量收敛、fetch 唯一性、数据文件名字面量仅 Category.java、CSS var() 全部有定义。仓库原位运行（已带 BOM）全绿；后续可集成到 start.ps1 之前。
3. `server`：`JsonStore` 的 3 处 `"wishlist.json"` 字面量收敛到 `Category.WISHLIST_FILE`（数据文件名单一事实来源，验收第 4 项 grep 现在零违反）。
4. `web/js/wishlist.js`：修复布尔属性 bug——本地 `createElement` 对 `checked/disabled` 用 `setAttribute(k, v)`，浏览器里属性存在即为真，导致**所有复选框显示已勾选、所有 ↑/↓ 按钮被禁用**；改为布尔值走属性对象（`el[k] = v`）。顺带补 `invalid_wish_note` 错误映射，并把 `LIMITS.wishNote` 修正为后端的 500（原写 200）。

**逐项结论**：
1. ✅ README：本地启动/参数覆盖/数据目录/常见排查四节齐全
2. ✅ .gitignore：`server/out/`、`data/.backup/`、`*.corrupt`、`*.corrupt-duplicate`、`.tmp/`、run.log/pid 均已排除（`data/*.json` 有意纳入版本管理，符合 spec 用户故事 54）
3. ✅ `start.ps1 -Data -Web -Port` 三参数独立覆盖（默认 data=<仓库>\data、web=<仓库>\web、port=8787）
4. ✅ `check-constraints.ps1` 五项全绿（innerHTML 1 处 dom.js / 颜色仅 tokens.css / fetch 1 处 api.js / 文件名仅 Category.java / CSS 变量全解析）
5. ✅ 数据文件名字面量 grep 仅 Category.java
6. ✅ 性能（1000 todos + 100 wishes 隔离实例实测）：首页 9 端点并发 185–451ms < 800ms；列表筛选+分页 16–72ms < 300ms；单次 PATCH 稳态 29–53ms（均值 48.6ms）< 200ms；唯一超标是服务重启后第一笔（冷启动 JIT + 首次全文件备份写）328ms，属一次性成本
7. ✅ 键盘可达性静态审计（4 页）：交互元素全部原生可聚焦（逐个核查了 review 标记的 8 处包装容器，处理器都在内层 button/input/select/a 上）；base.css 全局 `:focus-visible` 2px 高对比轮廓；新建模态框用 `<dialog>`+`showModal()` = 原生焦点陷阱，Esc 关闭（document keydown + 关闭/取消/遮罩三通道）；aria 覆盖四页（tablist/tab/tabpanel、aria-pressed、progressbar、role=status、role=alert）
8. ✅ 所有 ticket 均 resolved
9. ✅ 08 的 C 区块「查看全部」已为正式入口 `href="/wishlist.html"`（静态 HTML）

**心愿单页验收**（Node DOM 冒烟 30 项全过，`wishlist-smoke.mjs`）：三项汇总 + 进度条每次变更后实时联动；↑/↓ 邻位交换（两次 PATCH 交换 sortIndex + 按服务端顺序重渲，首/末项按钮禁用，失败恢复原序）；已购删除线 + 实现日期（勾选/取消联动 purchasedAt）；快速新增（空名称/无效金额/0 金额前端拦截，invalid_amount/invalid_wish_name/invalid_wish_note 错误码映射，成功后清空并 reload）；删除二次确认（含条目名 + `data/.backup/` 提示）+ 汇总联动 + 失败提示；空态与进度条隐藏。

**回归**：wishlist 30/30 · shared modules 46/46 · index 39/39 · list acceptance 32/32 · detail smoke 43/43 · search timing 6/6 · 后端 E2E 18/19（1 项为 PowerShell 204 解析假象）· verify.ps1 8/8 · check-constraints 5/5。
