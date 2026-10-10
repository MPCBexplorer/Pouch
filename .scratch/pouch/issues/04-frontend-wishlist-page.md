# 04 — Frontend: Wishlist Page

**Parent**: [spec.md](../spec.md)

**Status**: resolved

**Blocked by**: 03 Wishlist Backend

## What to build

心愿单页（wishlist.html）完整可用——条目列表、勾选已购（金额显示删除线）、快速新增、条目备注、`↑`/`↓` 邻位升级排序、删除二次确认、顶部三项金额汇总与进度条。首页此时的入口在 08 完成前可临时跳转到本页面；本 ticket 产出后，用户在 05/06 完成列表/详情页前就能端到端管理自己的心愿单。

## Acceptance criteria

- [ ] 顶部三项金额（总愿望/已划/还差）格式化为"¥X,XXX.XX"（两位小数、千分位）
- [ ] 进度条不为空时宽度 = `spentCents / totalWishCents`
- [ ] 勾"已购"切换到 PATCH 即时生效：金额删除线、实现日期出现、汇总与进度条自动跳动
- [ ] 快速新增：输入名称 + 金额（单位:元，前端转分），回车/确认即 POST，成功焦点回到名称框
- [ ] 条目右侧 `↑` `↓` 邻位按钮调用 2 次独立 PATCH 交换 sortIndex；任一失败后页面刷新为服务端真实状态
- [ ] 删除条目为二次确认，明确提示"可从 `data/.backup/` 恢复"
- [ ] 默认按创建时间（未手动排序时等价于 sortIndex 升序 = createdAt 升序）
- [ ] 停后端时刷新 → 友好错误卡片，非白页

## Reference

`docs/04-前端实现.md` §4.10（建议按 §4.5 心愿单页接入上述服务）；`docs/00-总览与技术选型.md` §0.2.4；`docs/03-API契约.md` §3.5
