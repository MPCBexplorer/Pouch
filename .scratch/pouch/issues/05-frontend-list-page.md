# 05 — Frontend: List Page

**Parent**: [spec.md](../spec.md)

**Status**: resolved

**Blocked by**: 02 Records Backend

## What to build

列表页（list.html）完整可用——左侧 4 类导航 + 计数徽标、按当前类别动态变化的筛选栏（关键词/标签/状态/排序/分页通用项 + 学科/日期类别专属项）、列表视图、行内状态切换（失败回滚/筛选后淡出）、新建记录模态框、两种空态区分。这是"随手记一条"的主入口。

## Acceptance criteria

- [ ] 左侧导航 4 类 + 计数徽标，类别与类别间切换均触发生效
- [ ] 筛选栏随 `type` 动态增减：knowledge 才出 `subject`、todo 才出日期范围；通用 4 项常开
- [ ] 中文字符 `q` 搜索正常（无乱码、无 400）；250ms 防抖 + Enter 立即执行
- [ ] `subject` 多选级联 —— 选一级（如"数学"）结果数 == dropdown count，且包含所有子学科
- [ ] 筛选条件变化 → 页码自动回到 1
- [ ] 最后一页删除一条 → 自动跳回新的最后一页
- [ ] 行内勾完状态成功 → 若当前筛选不再匹配则淡出移除；失败回滚 + toast
- [ ] 新建记录模态框：按当前类别出 `fields` 表单，必填走后端校验，成功后插入列表（或重载）
- [ ] 空态 A："还没有X，去记一条吧" + 新建按钮；空态 B："没有符合条件的记录" + 清除筛选按钮
- [ ] 点击任意行跳 → `detail.html?id=<uuid>&from=<encoded-list-url>`
- [ ] 筛选/排序参数持久化到 URL 搜索参数，刷新不丢
- [ ] 1000 条+ 数据翻页流畅（<300ms，单次列表查询无多包 I/O）

## Reference

`docs/04-前端实现.md` §4.7；`docs/05-开发计划与运维.md` §5.1 阶段 3；`docs/03-API契约.md` §3.2（categories.fields 驱动筛选栏）

## Comments

### 2026-10-11 — 验收通过（在工单 06 之后补跑）

**验收方式**：Node DOM shim 场景化冒烟（32 项断言，覆盖全部 12 条验收项）+ 真实 HTTP 行为验证 + 1000 条数据隔离实例计时。原代码随工单 06 的提交（`0f257e0`）入库；本次验收又发现并修复 2 个缺陷（见下）。

**逐项结论**：
1. ✅ 侧栏 4 类导航 + 计数徽标（`/api/stats/overview` 真实计数，boot 时刷新）+ 心愿单独立入口
2. ✅ 筛选栏随 type 动态增减：knowledge 出学科下拉（层级缩进 + 计数）、todo 出日期范围、通用项（搜索/状态/标签/排序）常开
3. ✅ 中文 q 搜索：真实 HTTP 造中文记录验证 `线性代数/矩阵/线性相关` 均命中；防抖 250ms（150ms 内无请求）+ Enter 立即执行（定时器断言）
4. ✅ 学科前缀语义：`数学` 下拉计数 7 == 筛选结果 7，且含子学科 `数学/线性代数`
5. ✅ 任何筛选变化 → `page=1`
6. ✅ 最后一页删除后返回 → 回落有效最后一页（本次修复）
7. ✅ 行内勾选：PATCH 带 type；不再匹配当前筛选 → `is-leaving` 淡出后移除；失败 → 复选框回滚 + toast + 行保留
8. ✅ 新建模态框按 `fields` 生成表单、提交 POST `/api/records?type=…`（含专有字段）、成功后关模态 + 重载
9. ✅ 空态 A（`还没有灵感` + 记一条按钮）/ 空态 B（`没有符合条件的记录` + 清除全部筛选按钮）
10. ✅ 行链接 `detail.html?id=<uuid>&from=<encoded-list-url>`
11. ✅ 筛选/排序参数写入 URL search，刷新经 `readStateFromURL` 恢复
12. ✅ 1000 条 todos 隔离实例计时：分页 14–49ms（均值 21ms）、中文搜索 26ms、筛选 26ms、size=100 84ms，全部 < 300ms

**验收中发现并已修复的缺陷**：
1. [CRITICAL] `web/js/api.js` 别名签名不匹配：`listRecords: getRecords` 只透传第一个参数，而 `list.js` 调用 `API.listRecords(type, filters)` —— type 字符串被 `qs()` 当可迭代对象展开成 `?0=t&1=o…`，**全部筛选条件与分页参数被静默丢弃**，列表页筛选/搜索/翻页实际全部失效。已改为独立函数 `listRecords(type, params)`。
2. [CRITICAL→WARNING] 越界页码不回落：最后一页删一条后从详情页返回（或带旧页码链接进入），列表请求越界 page、后端返回空 → 停在空态 B。已在 `reload()` 增加回落：`total>0 && page>totalPages` 时取 `totalPages` 并重新请求、同步 URL。
