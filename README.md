# Pouch · 奚囊 · 学习看板

> 恒从小奚奴，骑距驴，背一古破锦囊，遇有所得，即书投囊中。——《李贺小传》

![Java](https://img.shields.io/badge/Java-21-ED8B00?style=flat-square&logo=openjdk&logoColor=white)
![完全本地](https://img.shields.io/badge/完全本地-127.0.0.1-success?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.1.1+beta-success?style=flat-square)

---

人们往往会随手记下很多东西，然后随手把它们忘记。这些记录往往分散在各种地方，或者被遗忘在某个角落。它们可能是一些灵感、问题、知识、待办事项。Pouch 是一个单用户、本地运行的学习记录看板，数据以纯 JSON 文件落盘。零构建工具、零前端框架、零运行时外部请求。Pouch旨在帮助人们更好地组织和管理这些记录。Pouch 还附带一个心愿单系统，用于管理心愿收支。

- 后端：Java 21 + JDK `HttpServer`，三方库仅Gson
- 前端：原生 HTML/CSS/JS，本地化引入 Chart.js / marked / DOMPurify

## 环境要求

- JDK 21

## 第三方依赖

Pouch 使用以下开源第三方库，详见 `NOTICE` 文件：

- Gson 2.11.0 — Apache License 2.0（后端 JSON 序列化）
- Chart.js — MIT License（前端图表）
- marked — MIT License（前端 Markdown 渲染）
- DOMPurify — Mozilla Public License 2.0（前端 HTML sanitize）

## 快速开始

```powershell
# 编译 + 启动
powershell -ExecutionPolicy Bypass -File server\start.ps1
```

启动后浏览器打开 <http://127.0.0.1:8787>。只监听回环地址。

```powershell
# 仅编译
powershell -ExecutionPolicy Bypass -File server\build.ps1

# 编译 + 替换版本徽章 + 打包分发包
powershell -ExecutionPolicy Bypass -File server\build.ps1 -Version 2.0.0

# 后台启动（不占用当前终端）
powershell -ExecutionPolicy Bypass -File server\run-bg.ps1
```

## 启动参数

`start.ps1` 支持三个参数覆盖默认值，便于用临时数据目录做测试而不污染真实数据：

| 参数 | 默认 | 说明 |
|---|---|---|
| `-Data` | `<仓库>\data` | 数据根目录（5 个 JSON 文件所在） |
| `-Web` | `<仓库>\web` | 静态资源根目录 |
| `-Port` | `8787` | 监听端口（仅 `127.0.0.1`） |

```powershell
powershell -ExecutionPolicy Bypass -File server\start.ps1 -Data D:\tmp\pouch-test -Port 9000
```

底层等价于 `java -cp server\out;server\lib\* com.pouch.PouchServer --data=… --web=… --port=…`。

## 数据目录

默认 `data/`，5 个文件（纯 JSON、UTF-8、可读缩进）：

| 文件 | 内容 |
|---|---|
| `inspirations.json` / `questions.json` / `knowledge.json` / `todos.json` | 四个类别的记录（共用同一记录模型，`type` 区分） |
| `wishlist.json` | 心愿单条目（独立模型） |

每个文件带 `version` 与文件级 `updatedAt`。**写前自动备份**：每次写入前在 `data/.backup/` 留一份快照（每文件保留最近约 50 份）。数据文件名只在 `server/src/com/pouch/model/Category.java` 声明，别处不得硬编码。
## 四个页面

| 页面 | 内容 |
|---|---|
| `/` | 首页看板：类别计数、待办完成率环、心愿单汇总、随机回顾、碎片知识构成环、陈旧提醒 |
| `/list.html?type=<类别>` | 列表页：按类别浏览、筛选（学科/标签/状态/关键词/日期/排序/分页）、行内状态切换、快速新建 |
| `/detail.html?id=<uuid>` | 详情页：Markdown 只读/编辑、追加式笔记、标签管理、类别变更、状态切换 |
| `/wishlist.html` | 心愿单：增删改、勾选已购、↑/↓ 邻位排序、三项汇总 |

## 常用排查

| 症状 | 原因 / 处理 |
|---|---|
| 页面显示"无法连接到本地服务器" | 后端没启动 → 运行 `start.ps1`；或用了 `file://` 打开 |
| `无法绑定端口 8787` | 端口被占用，`-Port 9000`换端口 |
| `package com.google.gson does not exist` | `server/lib/*.jar` 缺失，或 classpath 分隔符用错（Windows 是 `;`） |
| `错误: 无效的目标发布版: 21` | `JAVA_HOME` 指向旧 JDK，显式指定 JDK 21 的 `javac` |
| 启动打印 `[WARN] xxx.json 解析失败，尝试从备份恢复…` | 数据文件损坏，已自动从 `.backup/` 恢复，原件存为 `xxx.json.corrupt`；页面顶部有橙色告警横幅 |
| 改了数据文件页面没变化 | 内存为查询源，重启服务 |
| 控制台中文乱码 | `chcp 65001` 后再启动 |
## 约定检查

```powershell
# 全仓库反向搜索约束（innerHTML / 颜色字面量 / fetch / 数据文件名 / CSS 变量）
powershell -ExecutionPolicy Bypass -File scripts\check-constraints.ps1
```

这些约束来自 spec 的 Testing Decisions：`innerHTML` 只允许 `web/js/dom.js` 中 DOMPurify 净化后赋值处；颜色字面量只允许出现在 `web/css/tokens.css`；`fetch` 只允许出现在 `web/js/api.js`。

## 目录结构

```
server/            Java 源码（PouchServer → Handler → Service → Store 分层）
web/               前端（页面 / js / css / vendor）
data/              5 个 JSON 数据文件 + .backup/ 备份
scripts/           约束检查脚本
```












