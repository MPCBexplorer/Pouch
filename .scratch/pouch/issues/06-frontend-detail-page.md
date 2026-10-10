# 06 — Frontend: Detail Page

**Parent**: [spec.md](../spec.md)

**Status**: ready-for-agent

**Blocked by**: 05 List Page

## What to build

详情页（detail.html）完整可用——Markdown 只读渲染 + 编辑态切换（草稿深拷贝、保存失败保留草稿、Ctrl+Enter/Esc 快捷键）、笔记追加/编辑/删除、标签增删与 datalist 自动补全、按类别变化的状态切换主按钮、跨类别变更（保留 id、清空源类别专有字段）、置顶开关、超组合前置的删除入口、`history.back()` + `from` 兜底返回列表保留原筛选状态。

## Acceptance criteria

- [ ] `GET /api/records/{id}`（不带 type）可跨类别加载
- [ ] 正文 Markdown 渲染（标题/列表/代码/链接），不出现原始标记
- [ ] XSS 测试：正文写入 `<img src=x onerror="alert(1)">` → 详情页不弹出 alert，显示为转义文本
- [ ] 编辑态草稿深拷贝：取消 → 文本回到进入编辑前原值
- [ ] 保存失败（模拟断后端）→ textarea 内容完整保留，toast 提示
- [ ] `Ctrl+Enter` 保存、`Esc` 取消
- [ ] `beforeunload` 在编辑模式有未保存变更时拦截
- [ ] 备注区：追加（父记录 updatedAt 同步刷新）、编辑（显示"编辑于 X"）、删除（二次确认）
- [ ] 标签区：增/删即时、输入时 datalist 自动补全、含 `/` 的名字被拒并提示
- [ ] 类别专有字段表单按 Category.fields 动态生成
- [ ] 状态切换主按钮文案随状态与类别变化；「要做的事」的状态切换同时设置/清空 `doneAt`
- [ ] 变更类别（如「问题」→「碎片知识」）：id 不变，目标必填字段随之必填、源类别专有字段被清空（无残留 dueDate/priority）
- [ ] 置顶开关、元信息面板（createdAt/updatedAt/status/subject 生效）
- [ ] 删除记录入口弱化（细字/灰），强制二次确认
- [ ] 返回列表 → `history.back()` 优先；`history.length<=1` 时用 `from` 参数；`from` 缺失时兜底 `list.html` 保留原筛选状态
- [ ] 问题标记为「已解决」后出现引导文案（提示将答案追加到正文或笔记中）
- [ ] 以上各项均通过 `docs/04` §4.9 评论区参考的代码拼接实现

## Reference

`docs/04-前端实现.md` §4.8；`docs/05-开发计划与运维.md` §5.1 阶段 4；`docs/01-数据模型与存储.md` §1.8（跨类别变更）
