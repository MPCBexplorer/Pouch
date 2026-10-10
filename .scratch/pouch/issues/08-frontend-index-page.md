# 08 — Frontend: Index Page

**Parent**: [spec.md](../spec.md)

**Status**: ready-for-agent

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
