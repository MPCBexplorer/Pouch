# 03 · API 契约

> 上游：[01-数据模型](./01-数据模型与存储.md)（字段定义）、[02-后端实现](./02-后端实现.md)（实现）
> 下游：[04-前端实现](./04-前端实现.md) 的 `js/api.js` 严格按本文调用

**基础地址**：`http://127.0.0.1:8787`（端口可用 `--port=` 覆盖）

本文是前后端的**唯一契约**。任何一侧要改，先改这里，再改代码。

---

## 3.0 通用约定

### 3.0.1 请求与响应格式

| 项 | 约定 |
|---|---|
| 请求体 | `Content-Type: application/json; charset=utf-8`，UTF-8 编码 |
| 响应体 | 同上。除 `204 No Content` 外，所有响应都是 JSON |
| 请求体大小上限 | 2 MB，超出返回 `400 body_too_large` |
| 时间格式 | ISO-8601 带时区偏移：`2026-10-02T14:23:11.482+08:00` |
| 日期格式 | 仅日期字段用 `yyyy-MM-dd`（当前只有 `dueDate`） |
| 金额 | **整数分**（`long`），字段名一律带 `Cents` 后缀 |
| 缓存 | API 响应带 `Cache-Control: no-store`；静态 HTML 同；其他静态资源 `max-age=3600` |

### 3.0.2 统一错误信封

所有非 2xx 响应体结构一致：

```json
{
  "error": {
    "code": "invalid_subject",
    "message": "碎片知识必须指定 subject（学科）"
  }
}
```

| 字段 | 说明 |
|---|---|
| `code` | **机器可读**，前端据此做分支处理（如高亮某个输入框）。取值见 §3.9 |
| `message` | **人类可读**，简体中文，可直接展示给用户或写入控制台 |

前端处理原则：`message` 用于展示，`code` 用于逻辑。**不要**用 `message` 做字符串匹配判断错误类型——文案可能调整。

### 3.0.3 分页信封

列表类 GET 返回统一分页结构：

```json
{
  "items": [ /* ... */ ],
  "pagination": {
    "total": 137,
    "page": 2,
    "size": 20,
    "totalPages": 7
  }
}
```

`totalPages` 由后端计算（`ceil(total / size)`），前端不要自己算。`total` 是**筛选后**的总数，不是全库总数。

### 3.0.4 PATCH 语义

所有 `PATCH` 采用**部分更新**：

- 请求体中**出现的字段**才修改；未出现的字段保持原值。
- 空请求体 `{}` 是合法的（等于无修改，但仍会更新 `updatedAt`——刻意如此，可用于"touch"一条记录）。
- 显式传 `null` 表示**清空该可选字段**（如 `{"dueDate": null}` 移除截止日期）。这与"不传该字段"不同。
- 传入当前类别不适用的专有字段会被**忽略**，不报错（01 §1.9）。

### 3.0.5 端点总表

| # | 方法 | 路径 | 用途 | 详见 |
|---|---|---|---|---|
| 1 | `GET` | `/api/health` | 存活探针 + 数据概况 | §3.1 |
| 2 | `GET` | `/api/meta/categories` | 四个类别的元信息（含合法状态） | §3.2 |
| 3 | `GET` | `/api/meta/tags` | 全部标签及计数 | §3.2 |
| 4 | `GET` | `/api/meta/subjects` | 学科树（扁平化，带层级） | §3.2 |
| 5 | `GET` | `/api/records` | 查询记录（筛选/排序/分页） | §3.3 |
| 6 | `POST` | `/api/records` | 新建记录 | §3.3 |
| 7 | `GET` | `/api/records/{id}` | 取单条记录 | §3.3 |
| 8 | `PATCH` | `/api/records/{id}` | 修改记录（含状态切换） | §3.3 |
| 9 | `DELETE` | `/api/records/{id}` | 删除记录 | §3.3 |
| 10 | `POST` | `/api/records/{id}/notes` | 追加笔记 | §3.4 |
| 11 | `PATCH` | `/api/records/{id}/notes/{noteId}` | 编辑笔记 | §3.4 |
| 12 | `DELETE` | `/api/records/{id}/notes/{noteId}` | 删除笔记 | §3.4 |
| 13 | `GET` | `/api/wishlist` | 心愿单列表 + 三项汇总 | §3.5 |
| 14 | `POST` | `/api/wishlist` | 新增心愿条目 | §3.5 |
| 15 | `PATCH` | `/api/wishlist/{id}` | 修改条目（含切换已购） | §3.5 |
| 16 | `DELETE` | `/api/wishlist/{id}` | 删除条目 | §3.5 |
| 17 | `GET` | `/api/stats/overview` | 首页统计（计数 + 完成率） | §3.6 |
| 18 | `GET` | `/api/stats/random` | 随机抽取一条灵感/知识点 | §3.7 |
| 19 | `GET` | `/api/stats/stale` | 陈旧提醒（长期未推进的记录） | §3.8 |

---

## 3.1 健康检查

### `GET /api/health`

无需参数。用于确认服务已起、数据已载入。

**响应 `200`**

```json
{
  "status": "ok",
  "startedAt": "2026-10-02T14:20:03.117+08:00",
  "dataDir": "D:\\Documents\\qwen-agent\\GGibrnReLK\\Pouch\\data",
  "counts": {
    "inspiration": 23,
    "question": 41,
    "knowledge": 87,
    "todo": 15,
    "wishlist": 6
  },
  "warnings": []
}
```

| 字段 | 说明 |
|---|---|
| `startedAt` | 服务启动时间 |
| `dataDir` | 实际使用的数据目录绝对路径（排查"改的文件没生效"时很有用） |
| `counts` | 五个文件各自的条目数 |
| `warnings` | 启动过程中的非致命告警，如"某文件已损坏并从备份恢复"。**前端应在页面顶部横幅展示非空告警**，见 04 §4.8 |

---

## 3.2 元数据

### `GET /api/meta/categories`

返回四个类别的静态元信息。前端据此渲染导航、状态选择器、类别专属表单字段，**不得在前端硬编码这些枚举值**——否则将来加类别要改两处。

**响应 `200`**

```json
{
  "categories": [
    {
      "type": "inspiration",
      "label": "灵感",
      "statuses": [
        { "value": "active",   "label": "活跃" },
        { "value": "archived", "label": "已归档" }
      ],
      "defaultStatus": "active",
      "statusActionLabel": "归档",
      "fields": [],
      "randomEligible": true
    },
    {
      "type": "question",
      "label": "问题",
      "statuses": [
        { "value": "open",     "label": "待解决" },
        { "value": "resolved", "label": "已解决" }
      ],
      "defaultStatus": "open",
      "statusActionLabel": "标记已解决",
      "fields": ["source"],
      "randomEligible": false
    },
    {
      "type": "knowledge",
      "label": "碎片知识",
      "statuses": [
        { "value": "learning", "label": "学习中" },
        { "value": "mastered", "label": "已掌握" }
      ],
      "defaultStatus": "learning",
      "statusActionLabel": "标记已掌握",
      "fields": ["subject", "source"],
      "randomEligible": true
    },
    {
      "type": "todo",
      "label": "要做的事",
      "statuses": [
        { "value": "open",      "label": "待办" },
        { "value": "done",      "label": "已完成" },
        { "value": "cancelled", "label": "已取消" }
      ],
      "defaultStatus": "open",
      "statusActionLabel": "标记完成",
      "fields": ["dueDate", "priority"],
      "randomEligible": false
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `statusActionLabel` | 详情页主操作按钮的文字。随当前状态变化时前端自行切换（如已 `done` 时显示"标记未完成"） |
| `fields` | 该类别在新建/编辑表单中需要额外显示的专有字段名 |
| `randomEligible` | 是否参与首页随机回顾。只有 `inspiration` 和 `knowledge` 为真 |

### `GET /api/meta/tags`

全部已使用标签及计数，按计数降序、同计数按字典序。用于列表页筛选器、详情页标签自动补全，以及首页构成环的「按标签」维度（00 §0.2.1 区块 E）。

**查询参数**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `type` | string | 否 | — | 只统计该类别的标签。省略时跨全部四类聚合。非法值 → `400 invalid_type` |

**响应 `200`**

```json
{
  "tags": [
    { "tag": "线性代数", "count": 14 },
    { "tag": "Java",     "count": 9 },
    { "tag": "算法",     "count": 7 },
    { "tag": "产品设计", "count": 2 }
  ],
  "total": 4,
  "type": null
}
```

| 字段 | 说明 |
|---|---|
| `tags` | 标签及计数，降序。`count` 是**带该标签的记录数**，不是标签出现次数（一条记录同一标签只算一次，且标签在写入时已去重，见 01 §1.9） |
| `total` | 去重后的标签种类数 |
| `type` | 回显请求的过滤条件，未过滤时为 `null`。便于前端缓存区分 |

**首页构成环的用法**：`GET /api/meta/tags?type=knowledge`，前端取前 8 个渲染、其余合并为「其他 N 个」（ADR-012）。

> **端点不实现 `limit` 参数**。列表页筛选器需要完整标签列表，若在这里截断就会拿到不完整数据。Top N 聚合是纯展示逻辑，放前端做。

### `GET /api/meta/subjects`

学科树，**扁平化输出**（每项带 `path` 与 `depth`），前端据此渲染分组下拉。仅统计 `knowledge` 类别。

**响应 `200`**

```json
{
  "subjects": [
    { "path": "数学",             "name": "数学",       "depth": 0, "ownCount": 3, "count": 17 },
    { "path": "数学/线性代数",     "name": "线性代数",   "depth": 1, "ownCount": 11, "count": 11 },
    { "path": "数学/微积分",       "name": "微积分",     "depth": 1, "ownCount": 3,  "count": 3 },
    { "path": "英语",             "name": "英语",       "depth": 0, "ownCount": 8,  "count": 8 }
  ],
  "total": 4
}
```

| 字段 | 说明 |
|---|---|
| `path` | 完整学科路径，作为筛选参数原样回传给 `/api/records?subject=` |
| `name` | 该层名称，用于显示 |
| `depth` | 层级，`0` 为一级学科。前端按此缩进渲染 |
| `ownCount` | **恰好**标为该 path 的记录数 |
| `count` | 该节点**子树总数**（含所有下级）。`数学` 的 `count=17` = `ownCount 3` + 线性代数 `11` + 微积分 `3` |

**顺序为深度优先**：父节点紧跟其整棵子树，然后是下一个兄弟。前端可直接顺序渲染，无需重排。

**筛选语义**：`?subject=数学` 命中 `数学`、`数学/线性代数`、`数学/微积分` 三者（前缀 + 层级边界匹配），因此下拉中父节点的 `count` 就是选它时会得到的结果数——这两个数字必须对得上，否则用户会困惑。

---

## 3.3 记录

### `GET /api/records`

查询某类别的记录，支持筛选、排序、分页。

**查询参数**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `type` | string | **是** | — | 类别。非法值 → `400 invalid_type`（此参数无法回退，必须报错） |
| `q` | string | 否 | — | 关键词。匹配 `title` + `content`，子串、忽略大小写 |
| `tags` | string | 否 | — | 逗号分隔，**AND 语义**（须全部命中）。`tags=Java,算法` |
| `status` | string | 否 | — | 逗号分隔，**OR 语义**。`status=open,done` |
| `subject` | string | 否 | — | 仅 `knowledge` 有效。前缀 + 层级边界匹配 |
| `pinned` | boolean | 否 | — | `true` 只看置顶，`false` 只看未置顶，不传则不过滤 |
| `dueFrom` | date | 否 | — | 仅 `todo`。`yyyy-MM-dd`，含当日 |
| `dueTo` | date | 否 | — | 仅 `todo`。`yyyy-MM-dd`，含当日 |
| `sort` | string | 否 | `updatedAt` | `updatedAt` / `createdAt` / `title` / `dueDate`。非法值回退默认 |
| `order` | string | 否 | `desc` | `asc` / `desc`。非法值回退默认 |
| `page` | int | 否 | `1` | 从 1 开始。≤0 或非法回退为 1 |
| `size` | int | 否 | `20` | 每页条数，夹紧到 1~200 |

**排序规则**（三级，见 02 §2.5）：

1. `pinned=true` 的记录**始终优先**，不受 `order` 影响
2. 按 `sort` 指定的键，方向由 `order` 决定；该键为 `null` 的记录**排末尾**（如按 `dueDate` 排序时无截止日期的）
3. 最后按 `id` 兜底，保证全序稳定——**这是分页不重复不遗漏的前提**

**请求示例**

```
GET /api/records?type=knowledge&subject=数学&status=learning&sort=updatedAt&order=desc&page=1&size=20
```

**响应 `200`**

```json
{
  "items": [
    {
      "id": "7c2d9e41-0f58-4b36-9a17-5e8c3d2b1f60",
      "type": "knowledge",
      "title": "矩阵乘法的几何意义是线性变换的复合",
      "content": "$AB$ 表示先做 $B$ 对应的变换…",
      "tags": ["几何直观", "线性代数"],
      "notes": [ /* Note 数组，见 01 §1.3 */ ],
      "status": "learning",
      "subject": "数学/线性代数",
      "source": "3Blue1Brown《线性代数的本质》第4集",
      "createdAt": "2026-09-28T20:05:33.917+08:00",
      "updatedAt": "2026-09-28T20:05:33.917+08:00",
      "pinned": true
    }
  ],
  "pagination": { "total": 11, "page": 1, "size": 20, "totalPages": 1 }
}
```

> **列表响应包含完整的 `content` 与 `notes`**，不做字段裁剪。理由：数据量小（单页 ≤200 条），前端列表只取 `content` 前两行做摘要即可，省掉一次详情页请求；且实现裁剪需要维护两套序列化路径，复杂度不值得。
>
> 若将来数据量大到列表变慢，正确的优化是加 `?fields=title,tags,status` 参数做字段裁剪，而非默认裁剪。

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 400 | `invalid_type` | 缺 `type` 或值非法 |
| 400 | `invalid_dueFrom` / `invalid_dueTo` | 日期格式错误 |

其余查询参数非法时**静默回退默认值**，不报错（01 §1.9 的宽容策略）。

### `POST /api/records`

新建记录。类别由查询参数 `type` 指定（不是请求体字段）。

**请求**

```
POST /api/records?type=knowledge
Content-Type: application/json; charset=utf-8
```

```json
{
  "title": "矩阵乘法的几何意义是线性变换的复合",
  "content": "$AB$ 表示先做 $B$ 对应的变换，再做 $A$ 对应的变换。",
  "tags": ["线性代数", "几何直观"],
  "subject": "数学/线性代数",
  "source": "3Blue1Brown 第4集",
  "pinned": true
}
```

**必填字段**：`title`；`knowledge` 额外必填 `subject`。其余可省略，取默认值（`status` 取类别默认，`content` 取 `""`，`tags` 取 `[]`，`pinned` 取 `false`）。

**服务端生成**：`id`、`createdAt`、`updatedAt`、`type`（取自查询参数）、`notes`（初始为 `[]`）、`status`（未传时取默认）。

**响应 `201 Created`** —— 返回完整记录对象：

```json
{
  "id": "7c2d9e41-0f58-4b36-9a17-5e8c3d2b1f60",
  "type": "knowledge",
  "title": "矩阵乘法的几何意义是线性变换的复合",
  "content": "$AB$ 表示先做 $B$ 对应的变换，再做 $A$ 对应的变换。",
  "tags": ["几何直观", "线性代数"],
  "notes": [],
  "status": "learning",
  "subject": "数学/线性代数",
  "source": "3Blue1Brown 第4集",
  "createdAt": "2026-10-02T15:01:44.208+08:00",
  "updatedAt": "2026-10-02T15:01:44.208+08:00",
  "pinned": true
}
```

> 注意返回的 `tags` 是 `["几何直观", "线性代数"]`——**已被服务端按 Unicode 升序重排**（请求中是 `["线性代数", "几何直观"]`）。前端不应假设标签顺序与输入一致，见 01 §1.9。

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 400 | `invalid_type` | 缺 `type` 或值非法 |
| 400 | `invalid_title` | 缺失、空白、或超过 120 字符 |
| 400 | `invalid_content` | 超过 100,000 字符 |
| 400 | `invalid_tags` | 不是数组、超过 20 个、单个超 24 字符、含 `/` |
| 400 | `invalid_status` | 不属于该类别的合法状态集合 |
| 400 | `invalid_subject` | `knowledge` 缺失 `subject`，或层级/长度非法 |
| 400 | `invalid_source` | 超过 200 字符 |
| 400 | `invalid_due_date` | 格式非 `yyyy-MM-dd` 或不是真实日期 |
| 400 | `invalid_priority` | 非 `low`/`normal`/`high` |

### `GET /api/records/{id}`

取单条完整记录（含全部 `notes`）。

**路径参数**：`id` —— 记录 UUID。

**查询参数**：`type` **可选**。

- 带 `type` → 直接定位到对应文件，最快
- 不带 → 服务端按枚举序（`inspiration` → `question` → `knowledge` → `todo`）遍历四个文件查找

**为什么允许不带 `type`**：详情页 URL 形如 `detail.html?id=xxx`。若强制要求 `type`，用户从书签或浏览器历史进入时参数容易丢失，导致 404。4 次 HashMap 查找的代价换来 URL 健壮性，见 02 §2.6。

**响应 `200`** —— 完整记录对象，结构同 `POST` 响应。

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 404 | `record_not_found` | 四个文件中都无此 id |

### `PATCH /api/records/{id}`

部分更新。语义见 §3.0.4。

**请求示例 1 —— 标记待办完成**

```
PATCH /api/records/b5e8f0a2-3c74-49d6-8b15-e2a9c7f4d038
```
```json
{ "status": "done" }
```

**响应 `200`** —— 返回更新后的完整记录。注意 `doneAt` 已被服务端自动填入：

```json
{
  "id": "b5e8f0a2-3c74-49d6-8b15-e2a9c7f4d038",
  "type": "todo",
  "title": "把《算法导论》第3章的课后题做完",
  "status": "done",
  "dueDate": "2026-10-10",
  "priority": "high",
  "doneAt": "2026-10-02T15:20:09.441+08:00",
  "updatedAt": "2026-10-02T15:20:09.441+08:00"
}
```
（其余字段省略未变）

**`doneAt` 联动规则**（服务端自动处理，前端不得传）：

| 变更 | `doneAt` |
|---|---|
| `todo` 的 `status` → `done` | 写入当前时间 |
| `todo` 的 `status` 从 `done` → 其他 | 清空为 `null` |
| 非 `todo` 类别 | 恒为 `null` |

**请求示例 2 —— 清空截止日期**

```json
{ "dueDate": null }
```

**请求示例 3 —— 变更类别**

```
PATCH /api/records/d94c7b13-6e28-4f50-a3c9-1b7e5d208f46?type=knowledge
```
```json
{
  "type": "knowledge",
  "subject": "计算机/Java",
  "content": "（补充上弄懂的答案）HashMap 容量为 2 的幂时，n-1 的低位全为 1，(n-1) & hash 恰好等价于 hash % n。"
}
```

变更类别的特殊处理：

1. **必须在查询参数中同时给出新的 `type`**（决定写入哪个文件），请求体中的 `type` 字段可省略
2. 目标类别的必填字段必须齐全（转 `knowledge` 必须给 `subject`），否则 `400 invalid_subject`
3. **源类别的专有字段被自动清除**：本例中 `question` 的 `source` 会被清掉（因为目标类别 `knowledge` 也支持 `source`，所以此例实际保留；若是 `todo` → `inspiration`，`dueDate`/`priority`/`doneAt` 会被清除）
4. `id` **保持不变**——这样详情页 URL 和任何引用仍然有效
5. 底层是跨文件写，采用"先加后删"策略（01 §1.8.1）

**错误响应**：同 `POST`，另加：

| 状态 | code | 触发条件 |
|---|---|---|
| 404 | `record_not_found` | id 不存在 |
| 400 | `invalid_type` | 变更类别时目标 `type` 非法 |

### `DELETE /api/records/{id}`

硬删除（ADR-007）。写盘前自动生成备份快照。

**查询参数**：`type` 可选，语义同 `GET /{id}`。

**响应 `204 No Content`** —— 无响应体。

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 404 | `record_not_found` | id 不存在 |

---

## 3.4 笔记

笔记是记录的内嵌子资源。**只提供单条操作，不提供整体替换**（01 §1.3 的追加式语义），以防前端误操作覆盖整段历史。

笔记的增删改与父记录**在同一文件、同一次原子写**内完成，因此不存在"笔记写成功但记录写失败"的中间态。父记录的 `updatedAt` 会同步更新。

### `POST /api/records/{id}/notes`

追加一条笔记到末尾。

**请求**

```
POST /api/records/3f8a1c2e-9b47-4d11-a6e5-2c7f0b8d4e19/notes
```
```json
{ "content": "查了一下，这个思路叫 SM-2 算法的简化版" }
```

**响应 `201 Created`** —— 返回**父记录的完整对象**（而非单条笔记）。

> 为什么返回父记录而不是新建的笔记：前端追加笔记后需要刷新整个笔记区，返回父记录可让前端直接替换本地状态，省一次 GET。新建笔记的 `id` 在返回的 `notes` 数组末尾。

```json
{
  "id": "3f8a1c2e-9b47-4d11-a6e5-2c7f0b8d4e19",
  "type": "inspiration",
  "title": "用间隔重复做知识点回顾",
  "notes": [
    {
      "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "content": "查了一下，这个思路叫 SM-2 算法的简化版",
      "createdAt": "2026-10-03T09:12:44.103+08:00"
    }
  ],
  "updatedAt": "2026-10-03T09:12:44.103+08:00"
}
```
（其余字段省略未变）

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 404 | `record_not_found` | 父记录不存在 |
| 400 | `invalid_note` | `content` 缺失、空白、或超过 5000 字符 |

### `PATCH /api/records/{id}/notes/{noteId}`

编辑单条笔记内容。

**请求**

```json
{ "content": "更正：是 SM-2 的变体，不是简化版" }
```

**响应 `200`** —— 返回父记录完整对象。被编辑的笔记获得 `updatedAt` 字段（此前未编辑过的笔记没有这个字段）。

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 404 | `record_not_found` | 父记录不存在 |
| 404 | `note_not_found` | 父记录存在但其中无此 `noteId` |
| 400 | `invalid_note` | `content` 非法 |

### `DELETE /api/records/{id}/notes/{noteId}`

删除单条笔记。

**响应** —— `200`，返回父记录完整对象（删除后前端需刷新笔记区，返回父记录比 `204` 更实用）。

**错误响应**：同 `PATCH`。

---

## 3.5 心愿单

独立数据域，**不复用** `Record`（术语表见 00 §0.6）。

### `GET /api/wishlist`

列表 + 三项汇总，一次返回。首页只需这一个调用。

**查询参数**：无。列表按 `sortIndex` 升序 → `createdAt` 升序 → `id` 排序（三级，保证稳定）。

**响应 `200`**

```json
{
  "items": [
    {
      "id": "e07a4c95-1b38-42f6-9d04-c8b51e7f2a30",
      "name": "HHKB Professional HYBRID Type-S",
      "amountCents": 238800,
      "note": "等双11，看看能不能到 2000 以内",
      "purchased": false,
      "createdAt": "2026-09-15T21:08:44.120+08:00",
      "updatedAt": "2026-09-15T21:08:44.120+08:00",
      "sortIndex": 0
    },
    {
      "id": "f18b5da6-2c49-43a7-8e15-d9c62f8a3b41",
      "name": "《算法导论》第三版",
      "amountCents": 12800,
      "note": "",
      "purchased": true,
      "purchasedAt": "2026-09-20T10:33:02.551+08:00",
      "createdAt": "2026-09-10T09:00:00.000+08:00",
      "updatedAt": "2026-09-20T10:33:02.551+08:00",
      "sortIndex": 1
    }
  ],
  "summary": {
    "totalWishCents": 251600,
    "spentCents": 12800,
    "remainingCents": 238800,
    "itemCount": 2,
    "purchasedCount": 1
  }
}
```

**汇总字段语义**（计算规则见 01 §1.5.1）：

| 字段 | 含义 | 首页展示文案 |
|---|---|---|
| `totalWishCents` | 全部条目金额之和，**含已购** | 总心愿 |
| `spentCents` | 已购条目金额之和 | 已花掉 |
| `remainingCents` | `totalWishCents - spentCents` | 还差 |
| `itemCount` | 条目总数 | — |
| `purchasedCount` | 已购条目数 | — |

恒等式 `totalWish = spent + remaining` **始终成立**。前端不得自行累加计算这三个值——一律使用后端返回的，避免口径漂移。

> 未购条目不返回 `purchasedAt` 字段（Gson 不序列化 null）。前端读取时用 `item.purchasedAt || null` 兜底，不要假设字段一定存在。

### `POST /api/wishlist`

新增心愿条目。

**请求**

```json
{
  "name": "HHKB Professional HYBRID Type-S",
  "amountCents": 238800,
  "note": "等双11，看看能不能到 2000 以内"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 1~120 字符 |
| `amountCents` | 是 | 整数分，`0 ~ 999_999_999_99` |
| `note` | 否 | ≤500 字符，默认 `""` |

**服务端生成**：`id`、`createdAt`、`updatedAt`、`purchased`（**强制 `false`**，即使请求中传了 `true` 也忽略）、`purchasedAt`（`null`）、`sortIndex`（取现有最大值 +1）。

> **新建时强制 `purchased=false`**：新建即"已买"没有业务意义（那应该走记账而非心愿单）。忽略而非报错，是为了让前端的快速录入表单不必刻意剔除这个字段。

**响应 `201 Created`** —— 返回新条目完整对象，以及**更新后的 `summary`**：

```json
{
  "item": { /* WishItem */ },
  "summary": { "totalWishCents": 490400, "spentCents": 12800, "remainingCents": 477600, "itemCount": 3, "purchasedCount": 1 }
}
```

> 同时返回 `summary` 是为了让首页新增后能立即更新三个数字，无需再发一次 `GET`。这是刻意的接口冗余。

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 400 | `invalid_wish_name` | 缺失、空白、超 120 字符 |
| 400 | `invalid_amount` | 缺失、非整数、负数、超上限 |
| 400 | `invalid_wish_note` | 超 500 字符 |

> **`invalid_amount` 的一个常见触发场景**：前端传了 `2388.00`（元）而非 `238800`（分）。服务端检测到非整数会返回明确提示 `"amountCents 必须是整数（单位为分）"`。**前端表单的职责是把用户输入的元转成分再发**：`Math.round(parseFloat(input) * 100)`。用 `Math.round` 而非直接乘，因为 `19.99 * 100 = 1998.9999999999998`。

### `PATCH /api/wishlist/{id}`

部分更新。语义同 §3.0.4。

**请求示例 1 —— 标记已买**（最常见操作，首页复选框）

```json
{ "purchased": true }
```

**响应 `200`**：

```json
{
  "item": {
    "id": "e07a4c95-1b38-42f6-9d04-c8b51e7f2a30",
    "name": "HHKB Professional HYBRID Type-S",
    "amountCents": 238800,
    "purchased": true,
    "purchasedAt": "2026-10-02T16:44:18.902+08:00",
    "updatedAt": "2026-10-02T16:44:18.902+08:00",
    "sortIndex": 0
  },
  "summary": { "totalWishCents": 251600, "spentCents": 251600, "remainingCents": 0, "itemCount": 2, "purchasedCount": 2 }
}
```

**`purchasedAt` 联动规则**：

| 变更 | `purchasedAt` |
|---|---|
| `purchased` `false` → `true` | 写入当前时间 |
| `purchased` `true` → `false` | 清空为 `null` |
| 值未变化 | 保持原值不动 |

**请求示例 2 —— 手动排序（`↑` `↓` 交换相邻两条）**

前端把两条记录的 `sortIndex` 互换，发**两次独立 `PATCH`**：

```
PATCH /api/wishlist/{idA}   { "sortIndex": 1 }
PATCH /api/wishlist/{idB}   { "sortIndex": 0 }
```

`sortIndex` 允许重复值（不做唯一性约束）。重复时按 `createdAt` → `id` 决胜。

**部分失败的处理**：两次请求中若第二次失败，服务端会留下两条 `sortIndex` 相同的状态——这是**可接受的**，因为决胜规则保证顺序仍然确定，不会导致列表错乱或数据损坏。前端在任一请求失败后重新 `GET /api/wishlist`，以服务端返回的真实顺序重绘即可，**不做乐观回滚**。

**不设计批量排序端点**。批量端点会引入跨条目的部分失败语义（一半生效一半不生效），而心愿单条目数通常只有几十条，两次 `PATCH` 的代价可以忽略。用简单性换取一致性。

> 排序的整体设计（为什么是 `↑` `↓` 而不是拖拽、为什么"默认按创建时间"与 `sortIndex` 不冲突）见 00 §0.2.4。

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 404 | `wish_not_found` | id 不存在 |
| 400 | `invalid_sort_index` | 非整数或超出 0~1,000,000 |
| 400 | 同 `POST` | 其余字段校验 |

### `DELETE /api/wishlist/{id}`

删除条目。**UI 上入口刻意弱化**（ADR-005）——心愿单是账本，历史完整性比操作便利更重要。

**响应 `200`** —— 返回更新后的 `summary`（前端需要重算三个数字）：

```json
{ "summary": { "totalWishCents": 12800, "spentCents": 12800, "remainingCents": 0, "itemCount": 1, "purchasedCount": 1 } }
```

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 404 | `wish_not_found` | id 不存在 |

---

## 3.6 首页统计

### `GET /api/stats/overview`

首页 A、B 两个区块的数据源。一次调用返回全部所需。

**查询参数**：无。

**响应 `200`**

```json
{
  "total": 166,
  "counts": {
    "inspiration": 23,
    "question": 41,
    "knowledge": 87,
    "todo": 15
  },
  "inspirationStatus": { "active": 20, "archived": 3 },
  "questionStatus":    { "open": 28, "resolved": 13 },
  "knowledgeStatus":   { "learning": 61, "mastered": 26 },
  "todoStatus":        { "open": 9, "done": 5, "cancelled": 1 },
  "todoCompletion": {
    "done": 5,
    "open": 9,
    "denominator": 14,
    "rate": 0.35714285714285715
  },
  "todoCancelled": 1
}
```

**字段说明**

| 字段 | 用途 |
|---|---|
| `total` | 四类记录总和。首页顶部可展示 |
| `counts` | 区块 A 的四个类别卡片数字 |
| `<type>Status` | 各类别的状态分布。**四类都返回**，虽然饼图只用 todo 那份（ADR-004）——将来加"问题解决率"环改前端一行即可 |
| `todoCompletion` | 区块 B 饼图的数据源 |
| `todoCancelled` | 饼图下方的小字「另有 N 项已取消」 |

**饼图口径**（详见 01 §1.4.1）：

- `done` 片 ← `todoStatus.done`
- `open` 片 ← `todoStatus.open`
- `cancelled` **不计入任何一片**

**`rate` 为 `null` 的情况**：当 `denominator == 0`（一条待办都没有，或全部已取消）时，`rate` 返回 `null` 而非 `0`。

```json
"todoCompletion": { "done": 0, "open": 0, "denominator": 0, "rate": null }
```

**前端必须处理 `null`**：显示「暂无待办」文案，**不要**画一个 0% 的空环——后者会让人误以为自己有大量未完成事项。这是 01 §1.4.1 明确约定的语义。

**`rate` 是 0~1 的小数**，不是百分数。前端格式化为百分比时乘 100：`(rate * 100).toFixed(0) + '%'`。

**状态键的完整性保证**：`<type>Status` 对象中，**该类别的所有合法状态键都会出现，计数为 0 时也保留**。前端可以直接 `data.todoStatus.done` 取值而无需判空。这是 `StatsService` 里预置零值的结果（02 §2.5）。

---

## 3.7 随机回顾

### `GET /api/stats/random`

首页 D、E 区块的数据源。

**查询参数**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `type` | string | 否 | `inspiration` | 只接受 `inspiration` 和 `knowledge`（唯二 `randomEligible` 的类别）。传其他值 → `400 invalid_type` |
| `exclude` | string | 否 | — | 逗号分隔的 id 列表，表示"本轮已看过"，用于避免连续重复 |

**参与资格**（02 §2.5 `isRandomEligible`）：

| 类别 | 规则 |
|---|---|
| `inspiration` | 只有 `status=active` 参与。`archived`（已验证或已放弃的）不出现 |
| `knowledge` | `learning` 和 `mastered` **都参与**——已掌握的知识点仍需复习，这是间隔重复的语义 |

**请求示例**

```
GET /api/stats/random?type=knowledge&exclude=7c2d9e41-0f58-4b36-9a17-5e8c3d2b1f60,a3f8...
```

**响应 `200`（抽中）**

```json
{
  "record": { /* 完整 Record 对象 */ },
  "poolSize": 87,
  "exhausted": false
}
```

| 字段 | 说明 |
|---|---|
| `record` | 抽中的记录 |
| `poolSize` | 当前符合条件的候选总数（**未排除 `exclude` 前的**）。前端可显示「87 条知识点」 |
| `exhausted` | 本轮是否已遍历完。`true` 表示 `exclude` 已覆盖全部候选，服务端**忽略了 `exclude` 重抽**，前端应据此清空本地 exclude 列表重新开始一轮 |

**响应 `200`（池中无记录）**

该类别一条记录都没有（或灵感全部已归档）时：

```json
{
  "record": null,
  "poolSize": 0,
  "exhausted": false
}
```

**不返回 404**。空数据是正常状态（首次使用时必然如此），前端应显示空状态引导「还没有灵感，去记一条吧」，而非错误提示。见 04 §4.7。

**`exhausted` 机制的完整流程**（前端实现见 04 §4.4）：

```
初次加载        → exclude 为空 → 抽中 A → 前端 exclude = [A]
点「换一条」     → exclude=[A] → 抽中 B → 前端 exclude = [A,B]
…持续点击…
点「换一条」     → exclude=[A..Z]（已覆盖全部）→ 服务端发现池空
                → 忽略 exclude 重抽 → 抽中 A → exhausted=true
                → 前端收到 exhausted=true，清空 exclude = [A]
```

这样"换一条"可以无限点击，且在一轮之内绝不重复。**为什么在服务端而非前端做排除**：前端只有当前页数据，不知道全库有哪些 id；且排除逻辑放服务端可保证多标签页打开首页时行为一致。

**错误响应**

| 状态 | code | 触发条件 |
|---|---|---|
| 400 | `invalid_type` | `type` 不是 `inspiration` / `knowledge` |

---

## 3.8 陈旧提醒

### `GET /api/stats/stale`

首页区块 F 的数据源。返回长期未被推进的记录，按停滞天数降序。判定规则与阈值见 00 ADR-009。

**查询参数**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `limit` | int | 否 | `10` | 返回条数上限，范围 1~50。**非法值静默回退为 10**，不报错 |

> **`limit` 不返回 400 的理由**：本文档对查询参数有一条统一原则——除日期参数外，非法值一律静默回退默认值（§3.9）。理由是查询失败对用户毫无价值，返回合理默认结果集比返回 400 更有用。`limit` 是纯展示参数，传了 `abc` 就当作 10，没有任何理由让首屏一个区块因为参数拼错而显示错误。
>
> **越界处理**：`limit=0`、`limit=-5`、`limit=9999` 都**钳制**到 1~50 范围内（`0`→`1`，`9999`→`50`），同样不报错。

> **不提供 `type` 过滤参数**。陈旧提醒的价值恰恰在于**跨类别**地指出"你在忽视什么"；按类别过滤会削弱这个意图。各类别的分布通过响应里的 `byType` 字段体现，前端可用它做分类小计，而不必过滤主列表。

**响应 `200`**

```json
{
  "items": [
    {
      "id": "b3d4...",
      "type": "question",
      "title": "为什么 HashMap 扩容要用 2 的幂",
      "status": "open",
      "updatedAt": "2026-08-01T10:00:00.000+08:00",
      "idleDays": 62
    },
    {
      "id": "c9e1...",
      "type": "todo",
      "title": "读完《重构》第二章",
      "status": "open",
      "updatedAt": "2026-09-05T20:30:00.000+08:00",
      "idleDays": 27
    }
  ],
  "byType": { "question": 12, "todo": 5, "inspiration": 3 },
  "thresholds": { "question": 30, "todo": 21, "inspiration": 60 },
  "total": 20,
  "returned": 2,
  "now": "2026-10-02T15:00:00.000+08:00"
}
```

**字段说明**

| 字段 | 说明 |
|---|---|
| `items[]` | 陈旧记录，按 `idleDays` 降序，最多 `limit` 条。每项是**精简投影**，不含 `content`/`notes`/`tags`——列表只需标题、类别、状态、停滞天数，点进详情再取完整对象 |
| `items[].idleDays` | `floor((now - updatedAt) / 一天)`，向下取整的整数天。`now` 即响应里的 `now` 字段 |
| `byType` | 各类别**超过阈值**的记录总数（不受 `limit` 截断影响）。用于「你有 12 个问题超过一个月」这类汇总文案。**只有存在陈旧记录的类别才出现**，计数为 0 的类别省略 |
| `thresholds` | 各类别的判定阈值（天），回显给前端用于文案（如副标题「超过 30 天未推进的问题」）。值来自服务端配置，前端不硬编码 |
| `total` | 所有类别陈旧记录之和（= `byType` 各值相加） |
| `returned` | `items.length`，便于前端判断是否被 `limit` 截断 |
| `now` | 服务端计算 `idleDays` 的基准时刻。**前端不得用本地时间重算**，避免与服务端口径漂移 |

**参与范围**（ADR-009，服务端据此筛选，前端不做二次过滤）：

| 类别 | 参与条件 | 默认阈值 |
|---|---|---|
| `question` | `status = open` | 30 天 |
| `todo` | `status = open` 且**无 `dueDate`** | 21 天 |
| `inspiration` | `status = active` | 60 天 |
| `knowledge` | 不参与 | — |

**空态**：没有任何陈旧记录时，`items` 为 `[]`，`byType` 为 `{}`，`total` 为 `0`。**不返回 404**——这是正常状态。前端显示「近期都在推进，没有陈旧记录」而非空白卡片。

**为什么 `todo` 排除有 `dueDate` 的**：带截止日的待办由 `dueDate` 本身驱动提醒（列表页可按截止日排序、临期高亮），再进陈旧列表是重复且会干扰——一个"下个月才到期"的待办不该因为"21 天没动"就被判为陈旧。

**错误响应**：本端点**不返回任何 4xx**。`limit` 非法时静默回退（见上），无其他客户端可犯的错误。唯一可能的失败是读取数据文件时的 `500 storage_error`，与全局一致（§3.9）。

---

## 3.9 错误码表

全部错误码汇总。前端可按需针对特定 code 做交互优化（如高亮对应输入框），未特殊处理的 code 一律展示 `message`。

### 请求格式类

| code | HTTP | 说明 |
|---|---|---|
| `invalid_json` | 400 | 请求体不是合法 JSON，或不是 JSON 对象 |
| `body_too_large` | 400 | 请求体超过 2 MB |
| `method_not_allowed` | 405 | 路径存在但方法不支持。响应带 `Allow` 头 |
| `not_found` | 404 | 无此 API 端点 |
| `forbidden` | 403 | 静态资源路径非法（穿越尝试或访问隐藏目录） |

### 记录字段类

| code | HTTP | 说明 |
|---|---|---|
| `invalid_type` | 400 | `type` 缺失或非法；`random` 端点收到不支持随机回顾的类别；或 `meta/tags?type=` 收到非法类别 |
| `invalid_title` | 400 | 标题缺失、空白或超 120 字符 |
| `invalid_content` | 400 | 正文超 100,000 字符 |
| `invalid_tags` | 400 | 标签非数组、超 20 个、单个超 24 字符或含 `/` |
| `invalid_status` | 400 | 状态不属于该类别的合法集合 |
| `invalid_subject` | 400 | 碎片知识缺 `subject`，或层级超 3、单层长度非法 |
| `invalid_source` | 400 | 来源超 200 字符 |
| `invalid_due_date` | 400 | 截止日期格式非 `yyyy-MM-dd` 或非真实日期 |
| `invalid_priority` | 400 | 优先级非 `low`/`normal`/`high` |
| `invalid_pinned` | 400 | 置顶标记非布尔 |
| `invalid_note` | 400 | 笔记内容缺失、空白或超 5000 字符 |
| `record_not_found` | 404 | 记录 id 不存在 |
| `note_not_found` | 404 | 笔记 id 在该记录中不存在 |

### 心愿单类

| code | HTTP | 说明 |
|---|---|---|
| `invalid_wish_name` | 400 | 名称缺失、空白或超 120 字符 |
| `invalid_amount` | 400 | 金额缺失、非整数、负数或超上限 |
| `invalid_wish_note` | 400 | 备注超 500 字符 |
| `invalid_purchased` | 400 | 已购标记非布尔 |
| `invalid_sort_index` | 400 | 排序号非整数或超 0~1,000,000 |
| `wish_not_found` | 404 | 心愿条目 id 不存在 |

### 查询参数类

| code | HTTP | 说明 |
|---|---|---|
| `invalid_dueFrom` | 400 | 起始日期格式错误 |
| `invalid_dueTo` | 400 | 结束日期格式错误 |

> 除上述两个日期参数外，**其余查询参数非法时一律静默回退默认值，不报错**（01 §1.9）。理由是查询失败对用户毫无价值，返回合理默认结果集比返回 400 更有用。

### 服务端类

| code | HTTP | 说明 |
|---|---|---|
| `storage_error` | 500 | 数据读写失败（磁盘满、权限、文件锁）。详情见服务端日志 |
| `internal_error` | 500 | 未预期异常。详情见服务端日志 |

**前端对 5xx 的统一处理**：显示「保存失败，数据未写入。请检查服务端日志」，**不清空用户已填的表单内容**——让用户可以重试。这一点很重要：500 时用户的输入是最有价值的资产，绝不能丢。见 04 §4.9。

---

## 3.10 前端调用对照表

`js/api.js` 应导出的函数与端点的对应关系（实现见 04 §4.3）：

| api.js 函数 | 请求 |
|---|---|
| `api.health()` | `GET /api/health` |
| `api.categories()` | `GET /api/meta/categories` |
| `api.tags(type?)` | `GET /api/meta/tags[?type=…]` |
| `api.subjects()` | `GET /api/meta/subjects` |
| `api.listRecords(type, filters)` | `GET /api/records?type=…&…` |
| `api.getRecord(id, type?)` | `GET /api/records/{id}[?type=…]` |
| `api.createRecord(type, data)` | `POST /api/records?type=…` |
| `api.updateRecord(id, patch, type?)` | `PATCH /api/records/{id}[?type=…]` |
| `api.deleteRecord(id, type?)` | `DELETE /api/records/{id}[?type=…]` |
| `api.addNote(id, content)` | `POST /api/records/{id}/notes` |
| `api.editNote(id, noteId, content)` | `PATCH /api/records/{id}/notes/{noteId}` |
| `api.deleteNote(id, noteId)` | `DELETE /api/records/{id}/notes/{noteId}` |
| `api.wishlist()` | `GET /api/wishlist` |
| `api.addWish(data)` | `POST /api/wishlist` |
| `api.updateWish(id, patch)` | `PATCH /api/wishlist/{id}` |
| `api.deleteWish(id)` | `DELETE /api/wishlist/{id}` |
| `api.statsOverview()` | `GET /api/stats/overview` |
| `api.random(type, excludeIds)` | `GET /api/stats/random?type=…&exclude=…` |
| `api.stale(limit?)` | `GET /api/stats/stale[?limit=…]` |

**约定**：

- 所有函数返回 `Promise`，`resolve` 值为**已解析的 JSON 对象**（不是 `Response`）
- 非 2xx 一律 `reject` 一个 `ApiError` 对象，含 `status`、`code`、`message` 三个字段
- 页面代码通过 `catch (e) { toast(e.message) }` 统一处理错误，无需各自解析响应
- **页面代码中不得出现 `fetch(` 字样**——所有网络调用收口在 `api.js`
