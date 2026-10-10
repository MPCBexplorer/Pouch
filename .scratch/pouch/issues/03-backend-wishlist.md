# 03 — Backend: Wishlist

**Parent**: [spec.md](../spec.md)

**Status**: resolved

**Blocked by**: 01 Skeleton

## What to build

心愿单数据的底层服务跑起来——新增、列表（带三项金额汇总：总愿望/已花费/还差）、修改（含已购切换）、删除，4 个端点。该阶段同样仅可做后端黑盒验证；前端入口在 ticket 04 提供。汇总采用整数分精确计算，"总 = 已花 + 还差"恒等式由服务端强制。

## Acceptance criteria

- [ ] `GET /api/wishlist` 返回 items[] + summary{totalWishCents,spentCents,remainingCents}
- [ ] 恒等式：`totalWishCents == spentCents + remainingCents`（对任何 dataset）
- [ ] `POST /api/wishlist` 递增 `sortIndex` = 当前 max+1，items 按 sortIndex → createdAt → id 升序
- [ ] `PATCH` 切换 `purchased` 时 `purchasedAt` 同步设置/清空
- [ ] `DELETE` 直接硬删，但写入已在 backup 快照中
- [ ] `amountCents` 传小数（19.99）与 >100,000,000 分 都返回 400 `invalid_amount`
- [ ] `GET /api/wishlist` 恒包含 summary，即使 items 为空
- [ ] `scripts/smoke-test.ps1` 步骤 9、10 全部通过（含"10. 金额传小数返回 400" 的断言）

## Reference

`docs/05-开发计划与运维.md` §5.1 阶段 1（smoke-test.ps1 步骤 9-10）；`docs/03-API契约.md` §3.5；`docs/01-数据模型与存储.md` §1.10.6
