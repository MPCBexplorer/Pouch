/**
 * detail.js — 详情页完整交互（Ticket 06 / docs/04 §4.8）
 *
 * 能力：跨类别加载（GET /{id} 不带 type）、Markdown 只读渲染 + DOMPurify 净化、
 *       编辑态（草稿深拷贝 / 保存失败保留草稿 / Ctrl+Enter、Esc / beforeunload）、
 *       类别专有字段动态表单、跨类别变更、状态切换主按钮、笔记增删改、
 *       标签增删 + datalist 补全、置顶开关、弱化删除入口、返回逻辑。
 *
 * 约束（docs/04 §4.9 / spec 用户故事 63-65）：
 *   - 不直接 fetch（全部走 api.js）、不硬编码枚举（类别/状态/字段全来自 /api/meta/categories）
 *   - 不用字符串拼接 HTML；唯一 DOM 注入入口是 dom.js 的 el({html})，且只喂 DOMPurify 净化后的 Markdown
 */
import { API, LIMITS } from '/js/api.js';
import { el, render, frag, excerpt, relTime, fullTime, toast, statusLabel, renderWarnings, errorCard } from '/js/dom.js';

// ============ 常量 ============

// 边界常量统一来自 api.js 的 LIMITS（与后端校验一致，docs/01 §1.9；Ticket 07 收敛）
const MAX_CONTENT = LIMITS.content;
const MAX_NOTE = LIMITS.note;
const MAX_TAGS = LIMITS.tags;

/** 状态 → 引导文案。问题只有在"答案被写下来"之后才算真正解决（用户故事 76）。 */
const STATUS_GUIDES = {
  resolved: '问题已标记为已解决。把答案补充到正文或笔记里——未来翻出这条记录时，答案本身才是能被看到的东西。'
};

// ============ 页面元素 ============

const els = {
  backBtn: document.getElementById('backBtn'),
  toolbarActions: document.getElementById('toolbarActions'),
  error: document.getElementById('detailError'),
  card: document.getElementById('detailCard'),
  header: document.getElementById('detailHeader'),
  guide: document.getElementById('detailGuide'),
  content: document.getElementById('detailContent'),
  tags: document.getElementById('detailTags'),
  notes: document.getElementById('detailNotes'),
  footer: document.getElementById('detailFooter'),
  warnBanner: document.getElementById('warnBanner'),
};

// ============ 状态 ============

let record = null;        // 服务端确认的干净基线
let draft = null;         // 编辑中的草稿（structuredClone 深拷贝，与 record 分离）
let editing = false;
let noteEditingId = null; // 正在编辑的笔记 id
let CATEGORIES = [];      // /api/meta/categories
let inputs = {};          // 编辑态输入框引用

const catOf = (type) => CATEGORIES.find(c => c.type === type) || null;

/** 状态文案来自元数据，不硬编码（用户故事 62）。 */
// ============ 状态文案（共享件：dom.js 从元数据取值） ============

// ============ Markdown 渲染（docs/04 §4.8.2，本项目唯一 XSS 风险点） ============

function renderMarkdown(src) {
  if (!src || !src.trim()) return '';
  marked.setOptions({
    gfm: true,          // GitHub 风格：表格、删除线、任务列表
    breaks: true,       // 单个换行转 <br>，符合随手记录的书写习惯
    headerIds: false,   // 不生成 id，避免与页面元素冲突
    mangle: false,
  });
  const raw = marked.parse(src);
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
                   'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                   'a', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'img'],
    ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'class'],
    // 禁止 javascript: 等危险协议（DOMPurify 默认已阻止，显式声明以防配置漂移）
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/** 正文/笔记的只读渲染节点。html 内容必经 DOMPurify 净化（el 的唯一注入入口）。 */
function markdownNode(src, cls) {
  const html = renderMarkdown(src);
  if (!html) return el('p', { class: 'empty-hint', text: '（无正文）' });
  return el('div', { class: ['markdown', cls].filter(Boolean).join(' '), html });
}

// ============ 启动 ============

async function boot() {
  els.backBtn.addEventListener('click', () => goBack());
  // 输入实时同步进草稿（isDirty / 取消拦截 / beforeunload 都依赖它）
  els.content.addEventListener('input', syncDraft);
  els.content.addEventListener('change', syncDraft);

  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    showFatal('链接缺少记录 id', '详情页需要 ?id=<记录UUID> 参数。请从列表页进入。');
    return;
  }

  try {
    // 不带 type：服务端跨文件查找（用户故事 75 / docs/03 §3.3）
    const [catData, rec] = await Promise.all([API.getCategories(), API.getRecord(id)]);
    CATEGORIES = Array.isArray(catData?.categories) ? catData.categories : [];
    record = rec;
  } catch (e) {
    if (e?.code === 'record_not_found') showFatal('记录不存在或已被删除', e.message);
    else showFatal('无法加载这条记录', e);
    return;
  }

  renderAll();
  loadWarnings();
}

function renderAll() {
  renderToolbar();
  renderHeader();
  renderGuide();
  renderContent();
  renderTags();
  renderNotes();
  renderFooter();
}

// ============ 工具栏与页头 ============

function renderToolbar() {
  render(els.toolbarActions, editing
    ? frag([
        el('button', { type: 'button', class: 'btn btn-primary', id: 'saveBtn', text: '保存',
                       on: { click: save } }),
        el('button', { type: 'button', class: 'btn btn-ghost', text: '取消',
                       on: { click: confirmDiscard } }),
      ])
    : el('button', { type: 'button', class: 'btn', text: '编辑', on: { click: enterEdit } }));
}

function renderHeader() {
  const cat = catOf(record.type);
  render(els.header, frag([
    el('div', { class: 'detail-badges', children: [
      el('span', { class: ['badge', `badge-${record.type}`], text: cat ? cat.label : record.type }),
      el('span', { class: ['badge', `badge-status-${record.status}`], text: statusLabel(cat, record.status) }),
      record.pinned ? el('span', { class: 'badge badge-pinned', text: '已置顶' }) : null,
    ]}),
    el('h1', { class: 'detail-title', text: record.title }),
    record.subject || record.source
      ? el('p', { class: 'detail-subject', children: [
          record.subject ? el('span', { class: 'detail-subject-path', text: record.subject }) : null,
          record.source ? el('span', { class: 'detail-source', text: `来源：${record.source}` }) : null,
        ].filter(Boolean) })
      : null,
    el('p', { class: 'detail-meta', children: [
      el('span', { text: `创建于 ${fullTime(record.createdAt)}` }),
      el('span', { text: '·' }),
      el('span', { text: `更新于 ${relTime(record.updatedAt)}`, attrs: { title: fullTime(record.updatedAt) } }),
    ]}),
  ]));
}

/** 问题标记已解决后的答案引导（用户故事 76）。 */
function renderGuide() {
  const guide = STATUS_GUIDES[record.status];
  if (!guide) { els.guide.hidden = true; render(els.guide, []); return; }
  els.guide.hidden = false;
  render(els.guide, el('div', { class: 'detail-guide-box', attrs: { role: 'note' }, children: [
    el('strong', { text: '已解决 ✓' }),
    el('span', { text: guide }),
  ]}));
}

// ============ 正文：只读 / 编辑 ============

function renderContent() {
  if (!editing) {
    render(els.content, markdownNode(record.content));
    return;
  }

  draft = structuredClone(record);   // 草稿深拷贝：取消编辑不动基线（用户故事 41）

  const cat = catOf(draft.type);
  inputs = {
    title: el('input', { type: 'text', class: 'input input-title', id: 'edit-title',
                         value: draft.title, maxLength: 120, attrs: { 'aria-label': '标题' } }),
    content: el('textarea', { class: 'input input-content', id: 'edit-content', rows: 18,
                              value: draft.content, placeholder: '用 Markdown 写…',
                              maxLength: MAX_CONTENT, attrs: { 'aria-label': '正文' } }),
    type: el('select', { class: 'select', id: 'edit-type', attrs: { 'aria-label': '类别' },
                         on: { change: e => changeDraftType(e.target.value) },
                         children: CATEGORIES.map(c => el('option', {
                           value: c.type, text: c.label, selected: c.type === draft.type,
                         })) }),
  };

  render(els.content, frag([
    el('div', { class: 'form-field', children: [
      el('label', { attrs: { for: 'edit-title' }, text: '标题' }),
      inputs.title,
    ]}),
    el('div', { class: 'form-field', children: [
      el('label', { attrs: { for: 'edit-type' }, text: '类别' }),
      inputs.type,
    ]}),
    el('div', { class: 'form-field', children: [
      el('label', { attrs: { for: 'edit-content' }, text: '正文' }),
      inputs.content,
    ]}),
    el('div', { class: 'edit-hint', text: '支持 Markdown 语法。Ctrl+Enter 保存，Esc 取消。' }),
    el('div', { class: 'detail-extra', id: 'detailExtra' }),
  ]));

  renderExtraFields(cat);

  inputs.content.focus();
  // 光标置于末尾，避免打开就选中全部文本
  inputs.content.setSelectionRange(inputs.content.value.length, inputs.content.value.length);
}

/**
 * 类别专有字段的控件表（Category.fields 的取值 → 编辑器）。
 * 渲染、草稿同步、PATCH 组包三处共用，避免同一字段名三处 if 级联。
 * 新增字段只需在后端 fields 里加名字并在此加一行。
 */
const FIELD_EDITORS = {
  subject: {
    label: '学科（必填）', aria: '学科', required: true,
    control: v => el('input', { type: 'text', class: 'input', id: 'edit-subject',
                                value: v || '', maxLength: 60,
                                placeholder: '如：数学/线性代数', attrs: { 'aria-label': '学科' } }),
  },
  source: {
    label: '来源', aria: '来源', required: false,
    control: v => el('input', { type: 'text', class: 'input', id: 'edit-source',
                                value: v || '', maxLength: 200,
                                placeholder: '如：书名、链接、课程名', attrs: { 'aria-label': '来源' } }),
  },
  dueDate: {
    label: '截止日期', aria: '截止日期', required: false,
    control: v => el('input', { type: 'date', class: 'input input-date', id: 'edit-dueDate',
                                value: v || '', attrs: { 'aria-label': '截止日期' } }),
  },
  priority: {
    label: '优先级', aria: '优先级', required: false,
    control: v => el('select', { class: 'select', id: 'edit-priority',
                                 attrs: { 'aria-label': '优先级' },
                                 children: [
                                   el('option', { value: 'low', text: '低', selected: v === 'low' }),
                                   el('option', { value: 'normal', text: '普通', selected: (v || 'normal') === 'normal' }),
                                   el('option', { value: 'high', text: '高', selected: v === 'high' }),
                                 ] }),
  },
};

const fieldsOf = (type) => catOf(type)?.fields || [];

/** 类别专有字段表单按 Category.fields 动态生成（用户故事 62 / 验收项）。 */
function renderExtraFields(cat) {
  const host = document.getElementById('detailExtra');
  if (!host) return;
  const fields = cat?.fields || [];
  if (!fields.length) { render(host, []); return; }
  const parts = [];
  for (const f of fields) {
    const ed = FIELD_EDITORS[f];
    if (!ed) continue;   // 后端新增字段而前端未认领时跳过，不阻塞编辑
    inputs[f] = ed.control(draft[f]);
    parts.push(el('div', { class: 'form-field', children: [
      el('label', { attrs: { for: `edit-${f}` }, text: ed.label }),
      inputs[f],
    ]}));
  }
  render(host, frag(parts));
}

/** 读一个专有字段输入框的规范值：去空白，空串归一为 null（= 清空，docs/03 §3.0.4）。 */
function readField(f, input) {
  const v = String(input.value ?? '').trim();
  return v || null;
}

/** 编辑态切换类别：id 不变，目标必填字段随之必填，源类别专有字段保存时由服务端清空（用户故事 48）。 */
function changeDraftType(nextType) {
  if (!editing || nextType === draft.type) return;
  const from = catOf(draft.type);
  const to = catOf(nextType);
  const ok = confirm(
    `将类别从「${from ? from.label : draft.type}」改为「${to ? to.label : nextType}」？\n\n` +
    `id 保持不变；不再适用的专有字段（如截止日期、优先级）会在保存时自动清空。`);
  if (!ok) { inputs.type.value = draft.type; return; }

  // 目标类别同样支持的专有字段保留原值（如 question→knowledge 的 source，docs/03 §3.3 示例 3）；
  // 不再适用的字段清掉草稿值，输入框按目标类别重新生成
  const keep = new Set(to?.fields || []);
  for (const f of Object.keys(FIELD_EDITORS)) {
    if (!keep.has(f)) draft[f] = null;
    delete inputs[f];
  }
  draft.type = nextType;
  renderExtraFields(catOf(nextType));
  const missing = fieldsOf(nextType).find(f => FIELD_EDITORS[f]?.required && !draft[f]);
  if (missing) {
    toast(`转为「${to?.label || nextType}」需要填写${FIELD_EDITORS[missing].label.replace('（必填）', '')}`);
    inputs[missing]?.focus();
  }
}

function enterEdit() {
  editing = true;
  renderToolbar();
  renderContent();
}

function exitEdit() {
  editing = false;
  draft = null;
  inputs = {};
  renderAll();
}

/** 草稿与基线逐字段比对（草稿是进入编辑态时的深拷贝，输入变更实时同步进来）。 */
function isDirty() {
  if (!editing || !draft) return false;
  const eq = (a, b) => (a ?? '') === (b ?? '');
  return draft.title !== record.title
      || draft.content !== record.content
      || !eq(draft.subject, record.subject)
      || !eq(draft.source, record.source)
      || !eq(draft.dueDate, record.dueDate)
      || !eq(draft.priority, record.priority)
      || draft.type !== record.type;
}

/** 把输入框的当前值同步进草稿（草稿深拷贝是"暂存正在编辑的内容"，用户故事 41）。 */
function syncDraft() {
  if (!editing || !inputs.title) return;
  draft.title = inputs.title.value;
  draft.content = inputs.content.value;
  for (const f of fieldsOf(draft.type)) {
    if (inputs[f]) draft[f] = readField(f, inputs[f]);
  }
}

function collectDraft() {
  syncDraft();
  draft.title = draft.title.trim();
}

async function save() {
  collectDraft();
  if (!draft.title) { toast('标题不能为空'); inputs.title.focus(); return; }
  if (draft.content.length > MAX_CONTENT) {
    toast(`正文过长（${draft.content.length} 字符），上限 ${MAX_CONTENT} 字符`);
    inputs.content.focus();
    return;
  }
  const cat = catOf(draft.type);
  const missing = fieldsOf(draft.type).find(f => FIELD_EDITORS[f]?.required && !draft[f]);
  if (missing) {
    toast(`${cat.label}必须指定${FIELD_EDITORS[missing].label.replace('（必填）', '')}`);
    inputs[missing]?.focus();
    return;
  }

  const typeChanged = draft.type !== record.type;
  const patch = { title: draft.title, content: draft.content };
  // 专有字段只发目标类别认识的；空值显式传 null = 清空（docs/03 §3.0.4）
  for (const f of fieldsOf(draft.type)) {
    if (FIELD_EDITORS[f]) patch[f] = draft[f] || null;
  }

  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中…'; }
  try {
    // 跨类别变更：新 type 走查询参数（docs/03 §3.3），id 由服务端保持不变
    record = await API.updateRecord(record.id, patch, typeChanged ? draft.type : undefined);
    exitEdit();
    toast('已保存', 'ok');
  } catch (e) {
    // ★ 失败不退出编辑态：草稿完整保留在输入框里供重试（docs/04 §4.9.4）
    if (e?.code === 'invalid_subject') {
      const req = fieldsOf(draft.type).find(f => FIELD_EDITORS[f]?.required);
      toast(`${cat.label}必须指定${req ? FIELD_EDITORS[req].label.replace('（必填）', '') : '必填字段'}`);
      inputs[req]?.focus();
    }
    else if (e?.code === 'invalid_due_date') { toast('截止日期格式需 yyyy-MM-dd'); inputs.dueDate?.focus(); }
    else toast(e?.message || '保存失败，请重试');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存'; }
  }
}

function confirmDiscard() {
  if (isDirty() && !confirm('放弃未保存的更改？')) return;
  exitEdit();
}

// ============ 状态切换主按钮（docs/04 §4.8.1，文案随类别与状态变化） ============

/**
 * 主按钮文案与目标状态全部由元数据推导（用户故事 62）：
 * statusActionLabel 表达"进入目标状态"的动作（如"标记完成"）；
 * 已在目标状态时反转为"标记未X"（如"标记未完成"），回到默认状态。
 */
function statusAction(cat, status) {
  const actionLabel = cat?.statusActionLabel || '切换状态';
  const statuses = cat?.statuses || [];
  const bare = actionLabel.replace(/^标记/, '');
  let target = null;
  for (const s of statuses) {
    if (s.label && (actionLabel.includes(s.label) || s.label.includes(bare))) { target = s.value; break; }
  }
  if (!target) target = statuses.length ? statuses[statuses.length - 1].value : null;

  if (target && status === target) {
    const t = statusLabel(cat, target);
    return { text: t.startsWith('已') ? `标记未${t.slice(1)}` : `取消${t}`, next: cat.defaultStatus };
  }
  return { text: actionLabel, next: target };
}

async function flipStatus(next) {
  try {
    record = await API.updateRecord(record.id, { status: next });
    renderAll();
    toast('状态已更新', 'ok');
  } catch (e) {
    toast(e?.message || '状态更新失败');
    renderFooter();   // 重绘即回滚，UI 与服务端保持一致
  }
}

// ============ 标签（增删 + datalist 自动补全） ============

function renderTags() {
  const tags = record.tags || [];
  render(els.tags, frag([
    el('h2', { class: 'detail-section-title', text: '标签' }),
    el('div', { class: 'tag-list', id: 'tagList', children: [
      ...tags.map(t => el('span', { class: ['badge', 'badge-tag', 'badge-editable'], children: [
        el('span', { text: t }),
        el('button', { class: 'badge-x', text: '×', attrs: { 'aria-label': `移除标签 ${t}` },
                       on: { click: () => removeTag(t) } }),
      ]})),
      el('button', { class: 'badge badge-add', text: '+ 添加标签', on: { click: showTagInput } }),
    ]}),
  ]));
}

function showTagInput() {
  const host = document.getElementById('tagList');
  if (!host) return;
  const input = el('input', { class: 'tag-input', placeholder: '输入后回车', maxLength: 24,
                              attrs: { 'aria-label': '新标签', list: 'tagSuggestions' } });
  const list = el('datalist', { id: 'tagSuggestions' });

  // 候选来自 /api/meta/tags，排除已用标签；补全失败不影响手动输入
  const used = new Set(record.tags || []);
  API.getTags().then(({ tags }) => {
    render(list, tags.filter(t => !used.has(t.tag)).slice(0, 50)
                     .map(t => el('option', { value: t.tag, label: `${t.count} 条记录` })));
  }).catch(() => { /* 补全失败不阻塞手动输入 */ });

  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      if (v.includes('/')) { toast('标签不能包含 /（那是学科的层级分隔符）'); return; }
      if (used.has(v)) { toast('标签已存在'); return; }
      if ((record.tags || []).length >= MAX_TAGS) { toast(`标签最多 ${MAX_TAGS} 个`); return; }
      try {
        // API 无单独标签端点：本地算好数组后整体 PATCH（数组内单条增删由前端完成）
        record = await API.updateRecord(record.id, { tags: [...new Set([...(record.tags || []), v])] });
        renderTags();
        renderHeader();
        toast('已添加标签', 'ok');
      } catch (err) { toast(err?.message || '添加标签失败'); }
    }
    if (e.key === 'Escape') renderTags();
  });

  render(host, frag([input, list]));
  input.focus();
}

async function removeTag(t) {
  try {
    record = await API.updateRecord(record.id, { tags: (record.tags || []).filter(x => x !== t) });
    renderTags();
    renderHeader();
    toast('已移除标签', 'ok');
  } catch (e) { toast(e?.message || '移除标签失败'); }
}

// ============ 笔记（追加 / 编辑 / 删除，逐条操作，docs/03 §3.4） ============

function renderNotes() {
  const notes = record.notes || [];
  render(els.notes, frag([
    el('h2', { class: 'detail-section-title', text: `笔记 (${notes.length})` }),
    notes.length === 0
      ? el('p', { class: 'empty-hint', text: '还没有笔记。事后想到什么可以补在这里，不会覆盖原正文。' })
      : el('ul', { class: 'note-list', children: notes.map(noteItem) }),
    noteComposer(),
  ]));
}

function noteItem(n) {
  if (noteEditingId === n.id) return noteEditor(n);
  return el('li', { class: 'note-item', attrs: { 'data-note-id': n.id }, children: [
    el('div', { class: 'note-head', children: [
      el('time', { class: 'note-time', text: fullTime(n.createdAt), attrs: { datetime: n.createdAt } }),
      n.updatedAt
        ? el('span', { class: 'note-edited', text: `（编辑于 ${relTime(n.updatedAt)}）`,
                       attrs: { title: fullTime(n.updatedAt) } })
        : null,
      el('span', { class: 'note-actions', children: [
        el('button', { class: 'link-btn', text: '编辑', on: { click: () => { noteEditingId = n.id; renderNotes(); } } }),
        el('button', { class: 'link-btn link-btn-danger', text: '删除', on: { click: () => removeNote(n) } }),
      ]}),
    ]}),
    markdownNode(n.content, 'note-body'),
  ]});
}

function noteEditor(n) {
  const area = el('textarea', { class: 'input note-edit-area', rows: 5, value: n.content,
                                maxLength: MAX_NOTE, attrs: { 'aria-label': '笔记内容' } });
  return el('li', { class: 'note-item is-editing', attrs: { 'data-note-id': n.id }, children: [
    el('div', { class: 'note-head', children: [
      el('time', { class: 'note-time', text: fullTime(n.createdAt), attrs: { datetime: n.createdAt } }),
      el('span', { class: 'note-actions', children: [
        el('button', { class: 'link-btn', text: '保存', on: { click: async () => {
          const text = area.value.trim();
          if (!text) { toast('笔记不能为空'); return; }
          try {
            record = await API.editNote(record.id, n.id, text);
            noteEditingId = null;
            renderNotes();
            renderHeader();   // 父记录 updatedAt 已刷新
            renderFooter();
            toast('笔记已更新', 'ok');
          } catch (e) {
            // 失败不清空编辑框，用户可重试（docs/04 §4.9.4）
            toast(e?.message || '保存笔记失败');
          }
        } } }),
        el('button', { class: 'link-btn', text: '取消', on: { click: () => { noteEditingId = null; renderNotes(); } } }),
      ]}),
    ]}),
    area,
  ]});
}

function noteComposer() {
  const area = el('textarea', { class: 'input note-composer-input', rows: 3,
                                placeholder: '写下新的想法…（支持 Markdown）', id: 'noteInput',
                                maxLength: MAX_NOTE, attrs: { 'aria-label': '新笔记' } });
  const add = el('button', { type: 'button', class: 'btn btn-primary', text: '添加',
                             on: { click: async () => {
    const text = area.value.trim();
    if (!text) { area.focus(); return; }
    add.disabled = true;
    try {
      // 响应是父记录完整对象，直接整体替换本地状态（docs/03 §3.4）
      record = await API.appendNote(record.id, text);
      renderNotes();
      renderHeader();   // updatedAt 同步刷新（用户故事 43）
      renderFooter();
      toast('已添加笔记', 'ok');
    } catch (e) {
      toast(e?.message || '添加笔记失败');   // 失败不清空输入框，用户可重试
    } finally {
      add.disabled = false;
    }
  } } });
  return el('div', { class: 'note-composer', children: [area, add] });
}

async function removeNote(n) {
  // 删除不可逆（虽有备份，但用户不知道），必须二次确认
  if (!confirm(`确定删除这条笔记？\n\n「${excerpt(n.content, 60)}」`)) return;
  try {
    record = await API.deleteNote(record.id, n.id);
    if (noteEditingId === n.id) noteEditingId = null;
    renderNotes();
    renderHeader();
    renderFooter();
    toast('笔记已删除', 'ok');
  } catch (e) { toast(e?.message || '删除笔记失败'); }
}

// ============ 元信息面板 + 置顶开关 ============

function renderFooter() {
  const cat = catOf(record.type);
  const act = statusAction(cat, record.status);

  const metaRows = [
    ['创建于', fullTime(record.createdAt)],
    ['更新于', `${fullTime(record.updatedAt)}（${relTime(record.updatedAt)}）`],
    ['状态', statusLabel(cat, record.status)],
    record.subject ? ['学科', record.subject] : null,
    record.source ? ['来源', record.source] : null,
    record.dueDate ? ['截止日期', record.dueDate] : null,
    record.priority ? ['优先级', { low: '低', normal: '普通', high: '高' }[record.priority] || record.priority] : null,
    record.doneAt ? ['完成于', fullTime(record.doneAt)] : null,
  ].filter(Boolean);

  // 编辑态不渲染可写操作：状态切换/置顶/删除都会整体重绘，
  // 会把编辑中的草稿冲掉（用户故事 41：草稿深拷贝是编辑期间的唯一工作区）。
  const actionArea = editing
    ? el('p', { class: 'detail-edit-lock', text: '编辑中：保存或取消后可切换状态、置顶或删除。' })
    : frag([
        el('div', { class: 'detail-footer-main', children: [
          el('button', { type: 'button', class: 'btn btn-primary', text: act.text,
                         on: { click: () => flipStatus(act.next) } }),
          el('label', { class: 'pin-toggle', children: [
            el('input', { type: 'checkbox', checked: record.pinned,
                          attrs: { 'aria-label': '置顶这条记录' },
                          on: { change: e => togglePin(e.target) } }),
            el('span', { text: '置顶' }),
          ]}),
        ]}),
        el('div', { class: 'detail-danger-zone', children: [
          el('button', { type: 'button', class: 'link-btn link-btn-danger detail-delete',
                         text: '删除这条记录', on: { click: confirmDelete } }),
          el('span', { class: 'detail-delete-hint', text: '硬删除。删除后可从 data/.backup/ 恢复。' }),
        ]}),
      ]);

  render(els.footer, frag([
    actionArea,
    el('dl', { class: 'detail-meta-panel', children: metaRows.map(([k, v]) =>
      frag([el('dt', { text: k }), el('dd', { text: v })])) }),
  ]));
}

async function togglePin(input) {
  const next = input.checked;
  input.disabled = true;
  try {
    record = await API.updateRecord(record.id, { pinned: next });
    toast(next ? '已置顶' : '已取消置顶', 'ok');
  } catch (e) {
    input.checked = !next;   // 失败回滚（docs/04 §4.9.4）
    toast(e?.message || '操作失败');
  } finally {
    input.disabled = false;
    renderHeader();   // 置顶徽标同步
  }
}

async function confirmDelete() {
  if (!confirm(`确定删除「${record.title}」吗？\n\n删除后可从 data/.backup/ 恢复。`)) return;
  try {
    await API.deleteRecord(record.id);
    toast('已删除', 'ok');
    setTimeout(() => goBack(true), 300);
  } catch (e) { toast(e?.message || '删除失败'); }
}

// ============ 返回逻辑（history.back 优先，from 兜底，用户故事 75） ============

/** from 参数是完整 URL，只允许站内相对路径，拒绝开放重定向（docs/04 §4.9.2）。 */
function safeFrom() {
  const raw = new URLSearchParams(location.search).get('from');
  if (!raw) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  return decoded.startsWith('/') && !decoded.startsWith('//') ? decoded : null;
}

function goBack(force = false) {
  if (!force && history.length > 1) { history.back(); return; }
  location.href = safeFrom() || '/list.html';
}

// ============ 快捷键 / 离开确认 ============

document.addEventListener('keydown', e => {
  if (!editing) return;
  // 笔记/标签输入框里的 Esc、Ctrl+Enter 归各自控件语义，不触发全局保存/取消
  const t = e.target;
  if (t && typeof t.closest === 'function' && (t.closest('#detailNotes') || t.closest('#detailTags'))) return;
  if (e.key === 'Escape') { e.preventDefault(); confirmDiscard(); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
});

window.addEventListener('beforeunload', e => {
  if (editing && isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

// ============ 告警横幅 / 错误卡（共享件：dom.js） ============

/** 数据文件损坏并从备份恢复时，必须让用户知道——静默恢复等于隐瞒数据丢失（docs/04 §4.8.6）。 */
async function loadWarnings() {
  try {
    const h = await API.getHealth();
    renderWarnings(els.warnBanner, h.warnings || []);
  } catch { /* 健康检查失败不打扰用户，其他区块会各自报错 */ }
}

/** 致命错误卡：dom.js errorCard + 详情页专属的"返回列表"动作。 */
function showFatal(title, e) {
  els.error.hidden = false;
  els.card.hidden = true;
  render(els.toolbarActions, []);
  render(els.error, errorCard(title, e, [
    { text: '重试', onClick: () => location.reload() },
    { text: '返回列表', onClick: () => goBack(true) },
  ]));
}

boot();
