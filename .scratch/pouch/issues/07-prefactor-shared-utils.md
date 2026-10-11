# 07 — Prefactor: Shared Utils

**Parent**: [spec.md](../spec.md)

**Status**: resolved

**Blocked by**: 05 List Page

## What to build

为满足首页 A~F 六区块与心愿单页不重复实现"金额化为元"与"构成环渲染"，在 `web/js/shared/` 下抽出 `currency.js`（集中的"分→元"格式化）与 `compose-ring.js`（按学科/标签两维维度的环形图 + top-N 聚合 + 其他扇片固定灰）两个模块。本 ticket 不做 UI；仅为后续 08（首页 E 区块）与 04（如重构心愿单页的金额格式）提供复用件。抽出时记录顶部注释说明契约与付款点。

## Acceptance criteria

- [ ] `web/js/shared/currency.js` 一个模块导出 `formatCents(cents) -> "¥X,XXX.XX"`与必要接口
- [ ] `web/js/shared/compose-ring.js` 一个模块，导出 `renderComposeRing(el, data, {dimension})` 支持 subject/tag 两维
- [ ] top-N 聚合：超过 8 个 token 时仅展示前 8，其余进 "其他 N 个"，固定灰（`var(--gray-400)`）
- [ ] 环形图与 `theme.js` 联动：`data-theme` 切换时扇片颜色跟随 theme token 重绘
- [ ] 模块均不 import 任何 `api.js` 之外的模块、不直接 `fetch`
- [ ] 完整边界场景：空数组 / 全部超上限 / 单一大项 / 只有 other
- [ ] 顶部注释记录：契约（输入 shape、输出 DOM 子树）与 consumer 入口
- [ ] `grep -Rn "innerHTML"` 全仓库：仅允许出现在 `web/js/dom.js` 的显式 `DOMPurify.sanitize` 后赋值那一处
- [ ] 金额格式化经 `currency.js` 的重复实现为零（后续 08 与未来 04 重构都只 import 这一个）

## Reference

`docs/04-前端实现.md` §4.6（顶栏共享与暗色主题 re-render）；`docs/00-总览与技术选型.md` §0.2.1（E 区块 top-N 聚合与 other 灰色）；`docs/03-API契约.md` §3.6（overview 中的 knowledgeComposition 上下文，非必读）

## Comments

### 2026-10-11 — 完成（含评审遗留项一并收敛）

**交付物**：
1. `web/js/shared/currency.js` —— 从全局 IIFE 改为标准 ES module：`formatCents(cents)` / `parseYuan(str)`，纯函数、零 import、合同注释保留。wishlist.js 改 import 使用，wishlist.html 移除经典 script 标签。
2. `web/js/shared/compose-ring.js` —— 新模块，导出 `aggregateTopN(tokens, limit?)`（纯函数）、`tokensFromData(data, dimension)`、`renderComposeRing(host, data, {dimension})`。`--ring-1..8` 分类色板与 `.compose-*` 样式入 tokens.css / pages.css；"其他 N 个"固定 `var(--gray-400)`。
3. `theme.js` —— `apply()` 末尾派发 `pouch:themechange` CustomEvent（docs/04 §4.6 约定，toggle 与系统偏好两条路径都覆盖）；compose-ring 监听后用上次数据重绘（只重绘、不重新请求），Chart 缺失时走空态不抛错。
4. 评审遗留的重复代码一并收敛（工单 06 Comments 记录的 SUGGESTION 子集）：`toast()` 与元数据驱动的 `statusLabel()` 收进 `dom.js`（list.js / detail.js 改 import，list.js 的硬编码状态映射删除）；网络错误判断统一用 api.js 的 `e.isNetwork`；`MAX_*`/maxlength 数字面值收敛为 api.js 导出的 `LIMITS`（与后端 RecordService 常量一一对应，注明后端才是强制执行方）；dom.js 里重复的 `yuan`/`toCents` 删除（金额格式化零重复）。

**验证**（Node DOM shim，全部通过）：
- shared modules 46/46：currency 17 项边界（含负数/NULL/NaN/千分位/四舍五入）；compose-ring 29 项——`aggregateTopN` 空数组 / null / 单一大项 / 恰好 8 / 9 / 100 / 自定义 limit / count=0 与空 label 过滤，渲染集成（Chart 桩）top-8 取色、other 固定灰、legend 9 项、空态、Chart 缺失降级、`pouch:themechange` 重绘读到新 token 值
- wishlist boot 4 项（currency import 链路 + 汇总/条目金额格式化）
- 回归：list acceptance 32/32、detail smoke 43/43、search timing 6/6、后端 E2E、verify.ps1 8/8
- 反向搜索：innerHTML 仅 dom.js 一处；fetch 仅 api.js；颜色字面量仅 tokens.css；var() 全部可解析；金额格式化实现仅 currency.js 一处

**未做（刻意留在 08）**：构成环的滑块 UI、首页 E 区块装配、`renderComposeRing` 的真实浏览器端到端（需 Chart.js + canvas，08 联调时验证）。
