/*
 * Copyright 2026 MPCBexplorer
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
import { el, render, frag, excerpt, relTime, fullTime, toast, statusLabel, renderWarnings, errorCard, renderMarkdown, renderLatexText, bindLocalFileLinks } from '/js/dom.js';
import { initLang, t, getLang, applyI18n } from '/js/i18n.js';

// ============ 常量 ============

// 边界常量统一来自 api.js 的 LIMITS（与后端校验一致，docs/01 §1.9；Ticket 07 收敛）
const MAX_CONTENT = LIMITS.content;
const MAX_NOTE = LIMITS.note;
const MAX_TAGS = LIMITS.tags;

/** 状态 → 引导文案。问题只有在"答案被写下来"之后才算真正解决（用户故事 76）。文案通过 t() 动态获取。 */

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

/** 正文/笔记的只读渲染节点。html 内容必经 DOMPurify 净化（el 的唯一注入入口）。 */
function markdownNode(src, cls, images = []) {
  const html = renderMarkdown(src, images);
  if (!html) return el('p', { class: 'empty-hint', text: '（无正文）' });
  return el('div', { class: ['markdown', cls].filter(Boolean).join(' '), html });
}

// ============ 启动 ============

async function boot() {
  await initLang();
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
    if (e?.code === 'record_not_found') showFatal(t('detail.toastRecordNotFound'), e);
    else showFatal(t('detail.toastLoadFailed'), e);
    return;
  }

  renderAll();
  applyI18n();
  loadWarnings();

  // 语言切换后重新渲染页面（JS 生成的文案 + data-i18n 元素）
  document.addEventListener('pouch:langchange', () => {
    renderAll();
    applyI18n();
  });
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
        el('button', { type: 'button', class: 'btn btn-primary', id: 'saveBtn', text: t('detail.btnSave'),
                       on: { click: save } }),
        el('button', { type: 'button', class: 'btn btn-ghost', text: t('detail.btnCancel'),
                       on: { click: confirmDiscard } }),
      ])
    : el('button', { type: 'button', class: 'btn', text: t('detail.btnEdit'), on: { click: enterEdit } }));
}

function renderHeader() {
  const cat = catOf(record.type);
  render(els.header, frag([
    el('div', { class: 'detail-badges', children: [
      el('span', { class: ['badge', `badge-${record.type}`], text: cat ? t('category.' + cat.type, { default: cat.label }) : record.type }),
      el('span', { class: ['badge', `badge-status-${record.status}`], text: statusLabel(cat, record.status) }),
      record.pinned ? el('span', { class: 'badge badge-pinned', text: t('detail.badgePinned') }) : null,
    ]}),
    el('h1', { class: 'detail-title', html: renderLatexText(record.title) }),
    record.source
      ? el('p', { class: 'detail-subtitle', children: [
          el('span', { class: 'detail-source', text: `${t('detail.labelSource')}: ${record.source}` }),
        ] })
      : null,
    el('p', { class: 'detail-meta', children: [
      el('span', { text: `${t('detail.labelCreated')} ${fullTime(record.createdAt)}` }),
      el('span', { text: '·' }),
      el('span', { text: `${t('detail.labelUpdated')} ${relTime(record.updatedAt)}`, attrs: { title: fullTime(record.updatedAt) } }),
    ]}),
  ]));
}

/** 问题标记已解决后的答案引导（用户故事 76）。 */
function renderGuide() {
  if (record.status !== 'resolved') { els.guide.hidden = true; render(els.guide, []); return; }
  els.guide.hidden = false;
  render(els.guide, el('div', { class: 'detail-guide-box', attrs: { role: 'note' }, children: [
    el('strong', { text: t('detail.guideResolvedTitle') }),
    el('span', { text: t('detail.guideResolvedDesc') }),
  ]}));
}

// ============ 正文：只读 / 编辑 ============

function renderContent() {
  if (!editing) {
    render(els.content, markdownNode(record.content, undefined, record.images || []));
    bindLocalFileLinks(els.content);
    return;
  }

  draft = structuredClone(record);   // 草稿深拷贝：取消编辑不动基线（用户故事 41）

  const cat = catOf(draft.type);
  inputs = {
    title: el('input', { type: 'text', class: 'input input-title', id: 'edit-title',
                         value: draft.title, maxLength: 120, attrs: { 'aria-label': t('detail.labelTitle') } }),
    content: el('textarea', { class: 'input input-content', id: 'edit-content', rows: 18,
                              value: draft.content, placeholder: t('detail.placeholderContent'),
                              maxLength: MAX_CONTENT, attrs: { 'aria-label': t('detail.labelContent') } }),
    type: el('select', { class: 'select', id: 'edit-type', attrs: { 'aria-label': t('detail.labelType') },
                         on: { change: e => changeDraftType(e.target.value) },
                         children: CATEGORIES.map(c => el('option', {
                           value: c.type, text: c.label, selected: c.type === draft.type,
                         })) }),
  };

  render(els.content, frag([
    el('div', { class: 'form-field', children: [
      el('label', { attrs: { for: 'edit-title' }, text: t('detail.labelTitle') }),
      inputs.title,
    ]}),
    el('div', { class: 'form-field', children: [
      el('label', { attrs: { for: 'edit-type' }, text: t('detail.labelType') }),
      inputs.type,
    ]}),
    el('div', { class: 'form-field', children: [
      el('label', { attrs: { for: 'edit-content' }, text: t('detail.labelContent') }),
      el('div', { class: 'edit-content-wrap', children: [
        inputs.content,
        el('div', { class: 'edit-buttons', children: [
          el('button', { type: 'button', class: 'btn btn-primary', id: 'edit-insert-image', text: t('detail.btnInsertImage'),
                         on: { click: insertImage } }),
          el('button', { type: 'button', class: 'btn btn-primary', id: 'edit-link-file', text: t('detail.btnLinkFile'),
                         on: { click: linkFile } }),
        ]}),
      ]}),
    ]}),
    el('div', { class: 'edit-hint', text: t('detail.hintMarkdown') }),
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
  source: {
    label: t('detail.labelSource'), aria: '来源', required: false,
    control: v => el('input', { type: 'text', class: 'input', id: 'edit-source',
                                value: v || '', maxLength: 200,
                                placeholder: t('detail.placeholderSource'), attrs: { 'aria-label': t('detail.labelSource') } }),
  },
  dueDate: {
    label: t('detail.labelDueDate'), aria: '截止日期', required: false,
    control: v => el('input', { type: 'date', class: 'input input-date', id: 'edit-dueDate',
                                value: v || '', attrs: { 'aria-label': t('detail.labelDueDate') } }),
  },
  priority: {
    label: t('detail.labelPriority'), aria: '优先级', required: false,
    control: v => el('select', { class: 'select', id: 'edit-priority',
                                 attrs: { 'aria-label': t('detail.labelPriority') },
                                 children: [
                                   el('option', { value: 'low', text: t('detail.priorityLow'), selected: v === 'low' }),
                                   el('option', { value: 'normal', text: t('detail.priorityNormal'), selected: (v || 'normal') === 'normal' }),
                                   el('option', { value: 'high', text: t('detail.priorityHigh'), selected: v === 'high' }),
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
    `${t('detail.confirmChangeType', { from: from ? from.label : draft.type, to: to ? to.label : nextType })}\n\n` +
    `${t('detail.confirmChangeTypeDesc')}`
  );
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
    const fieldLabel = FIELD_EDITORS[missing].label.replace('（必填）', '');
    toast(t('detail.toastNeedField', { cat: to?.label || nextType, field: fieldLabel }));
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
      || !eq(draft.source, record.source)
      || !eq(draft.dueDate, record.dueDate)
      || !eq(draft.priority, record.priority)
      || draft.type !== record.type
      || JSON.stringify(draft.images ?? []) !== JSON.stringify(record.images ?? []);
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
  if (!draft.title) { toast(t('detail.toastTitleRequired')); inputs.title.focus(); return; }
  if (draft.content.length > MAX_CONTENT) {
    toast(`${t('detail.toastContentTooLong', { len: draft.content.length, max: MAX_CONTENT })}`);
    inputs.content.focus();
    return;
  }
  const cat = catOf(draft.type);
  const missing = fieldsOf(draft.type).find(f => FIELD_EDITORS[f]?.required && !draft[f]);
  if (missing) {
    const fieldLabel = FIELD_EDITORS[missing].label.replace('（必填）', '');
    toast(cat.label + t('detail.toastNeedField2', { field: fieldLabel }));
    inputs[missing]?.focus();
    return;
  }

  const typeChanged = draft.type !== record.type;
  // 若正文中已不再引用任何 img:xxx 图片占位符，清空 images（仅删除完整链接，避免部分字母误删）
  if (!draft.content.match(/!\[[^\]]*\]\(img:[^)]+\)/g)) draft.images = [];
  const patch = { title: draft.title, content: draft.content, images: draft.images || [] };
  // 专有字段只发目标类别认识的；空值显式传 null = 清空（docs/03 §3.0.4）
  for (const f of fieldsOf(draft.type)) {
    if (FIELD_EDITORS[f]) patch[f] = draft[f] || null;
  }

  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = t('detail.btnSaving'); }
  try {
    // 跨类别变更：新 type 走查询参数（docs/03 §3.3），id 由服务端保持不变
    record = await API.updateRecord(record.id, patch, typeChanged ? draft.type : undefined);
    exitEdit();
    toast(t('detail.toastSaved'), 'ok');
  } catch (e) {
    // ★ 失败不退出编辑态：草稿完整保留在输入框里供重试（docs/04 §4.9.4）
    if (e?.code === 'invalid_due_date') { toast(t('detail.toastInvalidDueDate')); inputs.dueDate?.focus(); }
    else toast(e?.message || t('detail.toastSaveFailed'));
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = t('detail.btnSave'); }
  }
}

/** 向 textarea 光标位置插入文本，并触发 input 事件同步草稿。 */
function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value;
  textarea.value = value.slice(0, start) + text + value.slice(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 图片压缩：file → 缩放（最长边 1600）→ WebP 0.85 → base64 纯字符串。 */
async function compressImage(file) {
  const MAX_BYTES = 5 * 1024 * 1024;   // 原始文件上限 5 MB
  if (file.size > MAX_BYTES) throw new Error(t('detail.toastImageTooLarge'));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxSide = 1600;
      if (width > maxSide || height > maxSide) {
        const scale = Math.min(maxSide / width, maxSide / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          const base64 = dataUrl.split(',')[1];
          resolve({ mime: 'image/webp', size: blob.size, width, height, base64 });
        };
        reader.onerror = () => reject(new Error(t('detail.toastImageReadFailed')));
        reader.readAsDataURL(blob);
      }, 'image/webp', 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error(t('detail.toastImageLoadFailed')));
    img.src = URL.createObjectURL(file);
  });
}

/** 插入图片：选文件 → 压缩 → base64 → 插入 img:xxx 占位符 → 计入 draft.images。 */
async function insertImage() {
  if (!editing || !inputs.content) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await compressImage(file);
      const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      draft.images = draft.images || [];
      draft.images.push({ id, mime: data.mime, size: data.size, width: data.width, height: data.height, data: data.base64 });
      insertAtCursor(inputs.content, `![${t('detail.imageAlt')}](img:${id})`);
      toast(t('detail.toastImageInserted'), 'ok');
    } catch (err) {
      toast(t('detail.toastImageInsertFailed') + ': ' + (err.message || t('detail.unknownError')));
    }
  };
  input.click();
}

/** 链接本地文件：弹出网页内路径输入框，用户输入完整路径后插入 [文件名](local-file:路径)。 */
function linkFile() {
  if (!editing || !inputs.content) return;

  const backdrop = el('div', {
    class: 'modal-backdrop',
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.45)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  });

  const dialog = el('div', {
    class: 'card',
    style: {
      padding: 'var(--sp-6)',
      minWidth: '420px',
      maxWidth: '90vw',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
    },
    children: [
      el('h3', { class: 'dialog-title', text: t('detail.dialogLinkFileTitle'), style: { marginTop: 0, marginBottom: 'var(--sp-4)', fontSize: 'var(--fs-md)' } }),
      el('p', { class: 'dialog-hint', text: t('detail.dialogLinkFileHint'), style: { fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' } }),
      el('input', {
        class: 'input input-text',
        id: 'linkFilePathInput',
        attrs: {
          placeholder: t('detail.placeholderFilePath'),
          'aria-label': t('detail.ariaFilePath')
        },
        style: { width: '100%', boxSizing: 'border-box', marginBottom: 'var(--sp-4)' }
      }),
      el('div', { class: 'dialog-actions', style: { display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }, children: [
        el('button', {
          type: 'button',
          class: 'btn btn-ghost',
          text: t('detail.btnCancel'),
          on: { click: () => document.body.removeChild(backdrop) }
        }),
        el('button', {
          type: 'button',
          class: 'btn btn-primary',
          id: 'linkFileConfirmBtn',
          text: t('detail.btnConfirmInsert'),
          on: { click: () => {
            const inputEl = document.getElementById('linkFilePathInput');
            const rawPath = inputEl.value.trim();
            if (!rawPath) {
              inputEl.focus();
              return;
            }
            const displayName = rawPath.split(/[/\\]/).pop() || rawPath;
            insertAtCursor(inputs.content, `[${displayName}](local-file:${rawPath})`);
            toast(t('detail.toastFileLinkInserted'), 'ok');
            document.body.removeChild(backdrop);
          } }
        })
      ]})
    ]
  });

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const pathInput = document.getElementById('linkFilePathInput');
  pathInput.focus();
  pathInput.addEventListener('keydown', function onEnter(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('linkFileConfirmBtn').click();
      pathInput.removeEventListener('keydown', onEnter);
    }
  });

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) document.body.removeChild(backdrop);
  });
}

function confirmDiscard() {
  if (isDirty() && !confirm(t('detail.confirmDiscard'))) return;
  exitEdit();
}

// ============ 状态切换主按钮（docs/04 §4.8.1，文案随类别与状态变化） ============

/**
 * 主按钮文案与目标状态全部由元数据推导（用户故事 62）：
 * statusActionLabel 表达"进入目标状态"的动作（如"标记完成"）；
 * 已在目标状态时反转为"标记未X"（如"标记未完成"），回到默认状态。
 */
// 状态切换主按钮文案映射：按类别映射到 i18n key，避免硬编码后端返回的中文标签
const ACTION_KEYS = {
  inspiration: 'detail.actionArchive',
  question: 'detail.actionResolve',
  knowledge: 'detail.actionMaster',
  todo: 'detail.actionDone',
};

function statusAction(cat, status) {
  const actionLabel = cat?.statusActionLabel || t('detail.btnSwitchStatus');
  const statuses = cat?.statuses || [];
  const bare = actionLabel.replace(/^标记/, '');
  let target = null;
  for (const s of statuses) {
    if (s.label && (actionLabel.includes(s.label) || s.label.includes(bare))) { target = s.value; break; }
  }
  if (!target) target = statuses.length ? statuses[statuses.length - 1].value : null;

  if (target && status === target) {
    const t = statusLabel(cat, target);
    return { text: t('detail.btnUndoStatus', { label: t }), next: cat.defaultStatus() };
  }
  return { text: t(ACTION_KEYS[cat?.type], { default: actionLabel }), next: target };
}

async function flipStatus(next) {
  try {
    record = await API.updateRecord(record.id, { status: next });
    renderAll();
    toast(t('detail.toastStatusUpdated'), 'ok');
  } catch (e) {
    toast(e?.message || t('detail.toastStatusUpdateFailed'));
    renderFooter();   // 重绘即回滚，UI 与服务端保持一致
  }
}

// ============ 标签（增删 + datalist 自动补全） ============

function renderTags() {
  const tags = record.tags || [];
  render(els.tags, frag([
    el('h2', { class: 'detail-section-title', text: t('detail.sectionTags') }),
    el('div', { class: 'tag-list', id: 'tagList', children: [
      ...tags.map(t => el('span', { class: ['badge', 'badge-tag', 'badge-editable'], children: [
        el('span', { text: t }),
        el('button', { class: 'badge-x', text: '×', attrs: { 'aria-label': `移除标签 ${t}` },
                       on: { click: () => removeTag(t) } }),
      ]})),
      el('button', { class: 'badge badge-add', text: t('detail.btnAddTag'), on: { click: showTagInput } }),
    ]}),
  ]));
}

function showTagInput() {
  const host = document.getElementById('tagList');
  if (!host) return;
  const input = el('input', { class: 'tag-input', placeholder: t('detail.placeholderTagInput'), maxLength: 80,
                              attrs: { 'aria-label': t('detail.ariaTagNew'), list: 'tagSuggestions' } });
  const list = el('datalist', { id: 'tagSuggestions' });

  // 候选来自 /api/meta/tags（完整层级路径），排除已用标签；补全失败不影响手动输入
  const used = new Set(record.tags || []);
  API.getTags().then(({ tags }) => {
    render(list, tags.filter(t => !used.has(t.tag)).slice(0, 50)
                     .map(t => el('option', { value: t.tag, label: `${t.tag} · ${t.count} 条记录` })));
  }).catch(() => { /* 补全失败不阻塞手动输入 */ });

  /** 归一化：修剪每段空白、去首尾斜杠；非法返回 null（每段 1~24 字符、最多 3 层）。 */
  const normalizeTagInput = raw => {
    const v = String(raw).trim().replace(/\s*\/\s*/g, '/').replace(/^\/+|\/+$/g, '');
    if (!v) return null;
    const segs = v.split('/');
    if (segs.length > 3 || segs.some(s => !s || s.length > 24)) return null;
    return v;
  };

  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = normalizeTagInput(input.value);
      if (!v) { toast(t('detail.toastTagFormat')); return; }
      if (used.has(v)) { toast(t('detail.toastTagExists')); return; }
      if ((record.tags || []).length >= MAX_TAGS) { toast(t('detail.toastTagLimit')); return; }
      try {
        // API 无单独标签端点：本地算好数组后整体 PATCH（数组内单条增删由前端完成）
        record = await API.updateRecord(record.id, { tags: [...new Set([...(record.tags || []), v])] });
        renderTags();
        renderHeader();
        toast(t('detail.toastTagAdded'), 'ok');
      } catch (err) { toast(t('detail.toastTagAddFailed')); }
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
    toast(t('detail.toastTagRemoved'), 'ok');
  } catch (e) { toast(t('detail.toastTagRemoveFailed')); }
}

// ============ 笔记（追加 / 编辑 / 删除，逐条操作，docs/03 §3.4） ============

function renderNotes() {
  const notes = record.notes || [];
  render(els.notes, frag([
    el('h2', { class: 'detail-section-title', text: `${t('detail.sectionNotes')} (${notes.length})` }),
    notes.length === 0
      ? el('p', { class: 'empty-hint', text: t('detail.noNotes') })
      : el('ul', { class: 'note-list', children: notes.map(noteItem) }),
    noteComposer(),
  ]));
  bindLocalFileLinks(els.notes);
}

function noteItem(n) {
  if (noteEditingId === n.id) return noteEditor(n);
  return el('li', { class: 'note-item', attrs: { 'data-note-id': n.id }, children: [
    el('div', { class: 'note-head', children: [
      el('time', { class: 'note-time', text: fullTime(n.createdAt), attrs: { datetime: n.createdAt } }),
      n.updatedAt
        ? el('span', { class: 'note-edited', text: t('detail.editedAt', { time: relTime(n.updatedAt) }),
                       attrs: { title: fullTime(n.updatedAt) } })
        : null,
      el('span', { class: 'note-actions', children: [
        el('button', { class: 'link-btn', text: t('detail.btnEdit'), on: { click: () => { noteEditingId = n.id; renderNotes(); } } }),
        el('button', { class: 'link-btn link-btn-danger', text: t('detail.btnDelete'), on: { click: () => removeNote(n) } }),
      ]}),
    ]}),
    markdownNode(n.content, 'note-body', record.images || []),
  ]});
}

function noteEditor(n) {
  const area = el('textarea', { class: 'input note-edit-area', rows: 5, value: n.content,
                                maxLength: MAX_NOTE, attrs: { 'aria-label': t('detail.ariaNoteContent') } });
  return el('li', { class: 'note-item is-editing', attrs: { 'data-note-id': n.id }, children: [
    el('div', { class: 'note-head', children: [
      el('time', { class: 'note-time', text: fullTime(n.createdAt), attrs: { datetime: n.createdAt } }),
      el('span', { class: 'note-actions', children: [
        el('button', { class: 'link-btn', text: t('detail.btnSave'), on: { click: async () => {
          const text = area.value.trim();
          if (!text) { toast(t('detail.toastNoteEmpty')); return; }
          try {
            record = await API.editNote(record.id, n.id, text);
            noteEditingId = null;
            renderNotes();
            renderHeader();
            renderFooter();
            toast(t('detail.toastNoteUpdated'), 'ok');
          } catch (e) {
            toast(e?.message || t('detail.toastNoteSaveFailed'));
          }
        } } }),
        el('button', { class: 'link-btn', text: t('detail.btnCancel'), on: { click: () => { noteEditingId = null; renderNotes(); } } }),
      ]}),
    ]}),
    area,
  ]});
}

function noteComposer() {
  const area = el('textarea', { class: 'input note-composer-input', rows: 3,
                                placeholder: t('detail.placeholderNote'), id: 'noteInput',
                                maxLength: MAX_NOTE, attrs: { 'aria-label': t('detail.ariaNoteNew') } });
  const add = el('button', { type: 'button', class: 'btn btn-primary', text: t('detail.btnAddNote'),
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
      toast(t('detail.toastNoteAdded'), 'ok');
    } catch (e) {
      toast(e?.message || t('detail.toastNoteAddFailed'));   // 失败不清空输入框，用户可重试
    } finally {
      add.disabled = false;
    }
  } } });
  return el('div', { class: 'note-composer', children: [area, add] });
}

async function removeNote(n) {
  // 删除不可逆（虽有备份，但用户不知道），必须二次确认
  if (!confirm(t('detail.confirmDeleteNote', { excerpt: excerpt(n.content, 60) }))) return;
  try {
    record = await API.deleteNote(record.id, n.id);
    if (noteEditingId === n.id) noteEditingId = null;
    renderNotes();
    renderHeader();
    renderFooter();
    toast(t('detail.toastNoteDeleted'), 'ok');
  } catch (e) { toast(t('detail.toastNoteDeleteFailed')); }
}

// ============ 元信息面板 + 置顶开关 ============

function renderFooter() {
  const cat = catOf(record.type);
  const act = statusAction(cat, record.status);

  const metaRows = [
    [t('detail.labelCreated'), fullTime(record.createdAt)],
    [t('detail.labelUpdated'), `${fullTime(record.updatedAt)}（${relTime(record.updatedAt)}）`],
    [t('detail.labelStatus'), statusLabel(cat, record.status)],
    record.source ? [t('detail.labelSource'), record.source] : null,
    record.dueDate ? [t('detail.labelDueDate'), record.dueDate] : null,
    record.priority ? [t('detail.labelPriority'), { low: t('detail.priorityLow'), normal: t('detail.priorityNormal'), high: t('detail.priorityHigh') }[record.priority] || record.priority] : null,
    record.doneAt ? [t('detail.labelDoneAt'), fullTime(record.doneAt)] : null,
  ].filter(Boolean);

  // 编辑态不渲染可写操作：状态切换/置顶/删除都会整体重绘，
  // 会把编辑中的草稿冲掉（用户故事 41：草稿深拷贝是编辑期间的唯一工作区）。
  const actionArea = editing
    ? el('p', { class: 'detail-edit-lock', text: t('detail.msgEditing') })
    : frag([
        el('div', { class: 'detail-footer-main', children: [
          el('button', { type: 'button', class: 'btn btn-primary', text: act.text,
                         on: { click: () => flipStatus(act.next) } }),
          el('label', { class: 'pin-toggle', children: [
            el('input', { type: 'checkbox', checked: record.pinned,
                          attrs: { 'aria-label': t('detail.ariaPin') },
                          on: { change: e => togglePin(e.target) } }),
            el('span', { text: t('detail.labelPin') }),
          ]}),
        ]}),
        el('div', { class: 'detail-danger-zone', children: [
          el('button', { type: 'button', class: 'link-btn link-btn-danger detail-delete',
                         text: t('detail.btnDeleteRecord'), on: { click: confirmDelete } }),
          el('span', { class: 'detail-delete-hint', text: t('detail.hintDeleteRecord') }),
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
    toast(next ? t('detail.toastPinned') : t('detail.toastUnpinned'), 'ok');
  } catch (e) {
    input.checked = !next;   // 失败回滚（docs/04 §4.9.4）
    toast(e?.message || t('detail.toastOpFailed'));
  } finally {
    input.disabled = false;
    renderHeader();   // 置顶徽标同步
  }
}

async function confirmDelete() {
  if (!confirm(t('detail.confirmDeleteRecord', { title: record.title }))) return;
  try {
    await API.deleteRecord(record.id);
    toast(t('detail.toastDeleted'), 'ok');
    setTimeout(() => goBack(true), 300);
  } catch (e) { toast(e?.message || t('detail.toastDeleteFailed')); }
}

// ============ 返回逻辑（history.back 优先，from 兜底，用户故事 75） ============

/** from 参数是站内相对路径（可带 ? 查询参数），严格白名单，拒绝开放重定向（CWE-601）和 XSS。 */
function safeFrom() {
  const raw = new URLSearchParams(location.search).get('from');
  if (!raw) return null;
  let url;
  try { url = new URL(raw, location.origin); } catch { return null; }
  if (url.origin !== location.origin) return null;
  const allowed = ['/', '/list.html', '/detail.html', '/wishlist.html', '/index.html', '/settings.html'];
  if (!allowed.includes(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
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
    { text: t('detail.btnRetry'), onClick: () => location.reload() },
    { text: t('detail.btnBackToList'), onClick: () => goBack(true) },
  ]));
}

boot();
