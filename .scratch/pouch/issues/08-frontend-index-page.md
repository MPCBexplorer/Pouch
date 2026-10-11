# 08 — Frontend: Index Page

**Parent**: [spec.md](../spec.md)

**Status**: resolved

**Blocked by**: 06 Detail Page, 07 Prefactor

## What to build

首页（index.html）完整可用——A 四类别总数卡（点击跳列表页）、B 完成率环形图（中心百分比、无待办时显示"暂无待办"）、C 心愿单三项汇总 + 进度条（点击跳 04 心愿单页）、D 随机回顾 tab（灵感/知识点各自独立已看列表、连续换一条不重复、池空占位不同）、E 碎片知识构成环（按学科/标签滑块、top-N 聚合、other 灰色）、F 陈旧提醒 Top N + 条数分布、顶部告警横幅承接 `/api/health.warnings`。主题切换跟随图表弹簧。

## Acceptance criteria

- [ ] A 区 4 个计数卡：点击跳 `list.html?type=<x>`
- [ ] B 区完成率：中心展示百分比（`rate*100`，保留 1 位或整数）、暗色主题下 canvas 重绘颜色跟随 theme token；`rate=null` 时画布替换为「暂无待办」文案 + 副文本
- [ ] C 区心愿单汇总：与 wishlist 同数据同源（`GET /api/wishlist`）取 `summary`，不请求 items；底部「查看全部」跳 04 页面（此 ticket 中可仍为占位 04 link，不允许内联条目列表）
- [ ] D 区随机回顾：两个 tab（inspiration|knowledge）、tab 切换**不**重抽（保留上一次状态）、连续换一条不重复（前端维护独立 tab 已看队列，全上层后 `exhausted` 提示）、空池时专门文案引导跳转
- [ ] E 区构成环：复用 07 `compose-ring.js`，滑块切换 dimension 不刷新时重新请求、首次默认 subject、tag 维度**只异步取 `tags?type=knowledge`**
- [ ] F 区陈旧提醒：`Top N` 列表 + 各类别超阈值分布小条；每条点击跳详情；空态显示「近期都在推进，没有陈旧记录」
- [ ] 顶部告警横幅：`/api/health.warnings[].message` 逐条渲染，橙色背景，本 ticket 关闭后每次进页重新 fetch
- [ ] 停后端时刷新 → 每个区块展示友好错误卡（非空白）
- [ ] 首页完整加载 <800ms（`Promise.allSettled` 并发，非串行）
- [ ] 窗口 <768px 单列堆叠无横向滚动

## Reference

`docs/04-前端实现.md` §4.5, §4.6, §4.8.6（告警横幅）；`docs/00-总览与技术选型.md` §0.2.1；`docs/05-开发计划与运维.md` §5.1 阶段 2

## Comments

### 2026-10-11 — 完成

**实现**：`web/index.html` + `web/js/index.js`（六区块）+ `pages.css` 首页区块样式（全 token）。
复用：`api.js`（statsOverview/random/stale、wishlist、meta）、`shared/currency.js`（区块 C 金额）、
`shared/compose-ring.js`（区块 E）、`dom.js`（toast/statusLabel/renderWarnings/errorCard 共享件）。

**逐项结论**（Node DOM shim 场景冒烟 39 项 + 真实 HTTP 计时）：
1. ✅ A 区 4 张类别卡来自元数据，点击跳 `list.html?type=<x>`
2. ✅ B 区中心百分比 `rate*100`；暗色主题切换经 `pouch:themechange` 只重绘图表、不重新请求（断言读到新 token 值）；`rate=null` → 隐藏画布 +「暂无待办」+ 副文本 +「去记一条」引导
3. ✅ C 区只取 `summary`（不请求 items、不渲染条目）；三项数字经 `shared/currency.js` 格式化；进度条 aria 完整；「查看全部」→ wishlist.html
4. ✅ D 区双 tab：boot 两路并发预加载但**只有激活 tab 渲染**（修掉了一个共享容器互相覆盖的真实竞态）；切 tab 不重抽（渲染缓存的上次内容）；换一条带 `exclude=已看`；`exhausted` 后队列重开（再换一条 exclude 只含新纪录）+「本轮已全部看过」提示；池空专门文案 + 跳转引导
5. ✅ E 区首屏默认 subject；tag 维度**滑块切过去才请求** `tags?type=knowledge`（断言首屏零 tag 请求）；切回用缓存
6. ✅ F 区 Top N 列表（类别徽标/状态/停滞天数、点击跳详情）+ 各类别阈值分布小条 + 截断提示；空态「近期都在推进，没有陈旧记录」
7. ✅ 告警横幅逐条渲染 `health.warnings`（橙色 warn-banner，可关闭）
8. ✅ 停后端：A/C/D/E/F 五个区块均渲染友好错误卡（含启动提示与重试按钮），无白屏
9. ✅ 首屏 8 个端点并发（`Promise.allSettled`）248ms < 800ms
10. ✅ <768px：`.dashboard` 单列、`.dashboard-stats` 2×2、`.sum-row` 单列、陈旧项纵向堆叠（token 间距）

**过程中修掉的真实缺陷**：
1. `loadRandom` 的 `const st` 在使用后声明（TDZ）→ 随机回顾整体加载失败。已移到函数首行。
2. `recall-foot` 的 children 嵌套 `.map()` 数组——浏览器 `append(数组)` 会转成 `"[object Object]"` 文本。已 spread 摊平；同时给 `dom.js` 的 `children` 分支加 `flat(Infinity)` 防御（全页面受益）。
3. 双 tab 预加载共用展示容器导致后完成者覆盖激活 tab（详见上表第 4 条）。

**回归**：index 39/39 · list acceptance 32/32 · detail smoke 43/43 · shared modules 46/46 · search timing 6/6 · 后端 E2E 18/19（1 项为 PowerShell 204 解析假象，已单独确认 204 NoContent）· verify.ps1 8/8 · 反向搜索全部干净。
