# 05 — Frontend: List Page

**Parent**: [spec.md](../spec.md)

**Status**: ready-for-agent

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
