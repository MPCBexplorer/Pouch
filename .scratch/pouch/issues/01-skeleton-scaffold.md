# 01 — Skeleton Scaffold

**Parent**: [spec.md](../spec.md)

**Status**: resolved

**Blocked by**: None — can start immediately

## What to build

项目从空仓库到"能跑"——4 页 HTML 骨架（首页/列表/详情/心愿单，均为占位）、5 个合法 JSON 数据文件、一条 PowerShell 命令本地起服务、视觉上可切换主题与响应式、浏览器访问 `http://127.0.0.1:8787` 能看到 4 个空白页面（各页面会因无后端返回而显示加载失败，属预期）。所有数据写、业务接口、功能交互均尚未实现。

## Acceptance criteria

- [ ] `server\start.ps1` 一条命令起服务，控制台打印数据目录与端口
- [ ] 5 个 JSON 文件存在于 `data/`（inspirations/questions/knowledge/todos/wishlist），合法 JSON，重启后不丢失
- [ ] 4 个 HTML（index/list/detail/wishlist）均可在 `127.0.0.1:8787` 访问
- [ ] 路径穿越防护生效：`GET /../../data/todos.json` 返回 403/404
- [ ] 主题切换（亮/暗）生效，刷新后保持选择
- [ ] 窗口 <768px 无横向滚动，主要内容居中
- [ ] `javac` 编译通过，启动后控制台无错误/异常堆栈
- [ ] `--data=`、`--web=`、`--port=` 三个参数不传时使用默认值，不报 NPE

## Reference

Primary source: `docs/05-开发计划与运维.md` §5.1 阶段 0；`docs/02-后端实现.md` §2.1-2.9；`docs/00-总览与技术选型.md` §0.3-0.4
