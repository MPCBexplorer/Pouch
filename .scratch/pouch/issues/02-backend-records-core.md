# 02 — Backend: Records Core

**Parent**: [spec.md](../spec.md)

**Status**: resolved

**Blocked by**: 01 Skeleton

## What to build

4 类记录（灵感/问题/碎片知识/要做的事）与追加式笔记数据的底层服务跑起来：健康检查、4 类元数据（category/tags/subjects/overview/random/stale）、以及记录的增删改查 + 笔记追加/编辑/删除共 14 个端点。该阶段没有前端入口——通过 PowerShell 脚本对本地服务进行黑盒验证。完成后所有后续阶段的前端都以此为基础。

## Acceptance criteria

- [ ] `GET /api/health` 返回启动时间、数据目录、5 文件计数、warnings 数组
- [ ] `GET /api/meta/categories` 返回 4 类别全部元信息，编码与 `Category.java` 同步
- [ ] `GET /api/meta/tags` 能区分 knowledge/todo 范围（type 参数）
- [ ] `GET /api/meta/subjects` 返回扁平学科树（字段：path/depth/count）
- [ ] 4 类记录可分别 `POST` 创建（对错类别填专有字段返回 400 `invalid_*`）
- [ ] `PATCH` 语义：部分字段更新、空 body 合法、显式 null 清空、不适用专有字段静默忽略
- [ ] `GET /api/records/{id}` 跨类别查找可用（不依赖 `?type=`）
- [ ] 笔记 3 端点可用，追加/编辑任一项会同步更新父记录 `updatedAt`
- [ ] `GET /api/records` 支持 type/tags/status/subject/q/sort/order/page/size 全部筛选参数
- [ ] 学科前缀筛选：`subject=数学` 命中 `数学/线性代数`（前缀 + 层级边界）
- [ ] 排序稳定：`pinned desc → updatedAt desc → id`，翻页不重复（`02` §2.5 兑底）
- [ ] `GET /api/stats/overview` 完成率分母仅计 done+open，cancelled 不计入
- [ ] `GET /api/stats/random` 连续 5 次调用（带 exclude 参数）不重复
- [ ] 陈旧判定按类别阈值（30/21/60天），有 dueDate 的 todo 与 knowledge 不参与
- [ ] `GET /api/stats/stale` 返回 Top N 降序 + 各类别超阈值分布
- [ ] 错误信封：`code` + 中文 `message`；对 `invalid_type/invalid_status/invalid_subject/invalid_amount/record_not_found/wish_not_found/body_too_large` 逐个触发一次验证格式
- [ ] `scripts/smoke-test.ps1` 步骤 1-8、11、12、13 全部通过（无红色 ✗）
- [ ] 写操作后 `data/.backup/` 生成新快照；损坏的 `todos.json` 重启 → 恢复后生成 `.corrupt` 与告警，服务正常启动

## Reference

`docs/05-开发计划与运维.md` §5.1 阶段 1（含 smoke-test.ps1 步骤 1-13）；`docs/03-API契约.md` §3.1, §3.2, §3.3, §3.4, §3.6, §3.7, §3.8；`docs/01-数据模型与存储.md` §1.5（校验矩阵）、§1.6.3（类别 applyStatusTransitions）
