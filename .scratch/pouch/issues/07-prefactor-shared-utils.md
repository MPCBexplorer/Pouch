# 07 — Prefactor: Shared Utils

**Parent**: [spec.md](../spec.md)

**Status**: ready-for-agent

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
