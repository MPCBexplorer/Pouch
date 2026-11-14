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
 * list.js — 列表页完整交互（Ticket 05）
 * 依赖：API（含 LIMITS）、DOM 工具（toast / statusLabel 共享件）、主题
 * 约束：不直接 fetch、不用字符串拼 HTML、只通过 DOM API 构造、错误卡片友好提示
 */
import { API, LIMITS } from '/js/api.js';
import { el, render, frag, debounce, excerpt, relTime, fullTime, toast, statusLabel, renderLatexText, renderMarkdown } from '/js/dom.js';

  // ============ 页面元素引用 ============
  const els = {
    catNav: document.getElementById('catNav'),
    extraNav: document.getElementById('extraNav'),
listTitle: document.getElementById('listTitle'),
    filterBar: document.getElementById('filterBar'),
    filterChips: document.getElementById('filterChips'),
    listBody: document.getElementById('listBody'),
    listPager: document.getElementById('listPager'),
    listError: document.getElementById('listError'),
    newRecordModal: document.getElementById('newRecordModal'),
    newRecordForm: document.getElementById('newRecordForm'),
    modalBody: document.getElementById('modalBody'),
     modalTitle: document.getElementById('modalTitle'),
    modalSubmit: document.getElementById('modalSubmit'),
    modalBackdrop: document.getElementById('modalBackdrop'),
  exportToolbar: document.getElementById('exportToolbar'),
  exportPreview: document.getElementById('exportPreview'),
  importJsonFile: document.getElementById('importJsonFile'),
  filterbarCard: document.getElementById('filterbarCard'),
  listviewCard: document.getElementById('listviewCard'),
};

  // ============ 状态管理 ============
  let CATEGORIES = [];
  const catOf = (type) => CATEGORIES.find(c => c.type === type);

  const state = {
    type: 'todo',
    q: '',
    tags: [],
    status: '',
    dueFrom: '',
    dueTo: '',
    sort: 'updatedAt',
    order: 'desc',
    page: 1,
    size: 20,
    pinned: null,
  };

/** 列表页正文是否完全渲染（Markdown+LaTeX）。关闭后使用经过 LaTeX 保护的纯文本摘要。 */
function isListFullRender() {
  return localStorage.getItem('pouch.listFullRender') === 'true';
}

// ============ 导出模式（导出功能） ============

/** 提取当前筛选条件（不含分页）。 */
function getExportFilters() {
  return {
    q: state.q,
    tags: state.tags.join(','),
    status: state.status,
    pinned: state.pinned,
    dueFrom: state.dueFrom,
    dueTo: state.dueTo,
    sort: state.sort,
    order: state.order,
  };
}

/** 分页获取全部符合当前筛选的记录。 */
async function fetchAllFiltered() {
  let allItems = [];
  let page = 1;
  const size = 1000;
  while (true) {
    const filters = { ...getExportFilters(), page, size };
    const res = await API.listRecords(state.type, filters);
    const items = res.items || [];
    allItems.push(...items);
    if (items.length < size) break;
    page++;
  }
  return allItems;
}

function enterExportMode() {
  exportMode = true;
  previewMode = false;
  selectedIds.clear();
  reload();
}

function exitExportMode() {
  exportMode = false;
  previewMode = false;
  selectedIds.clear();
  reload();
  els.filterbarCard.hidden = false;
  els.listviewCard.hidden = false;
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateExportCount();
}

async function selectAllVisible() {
  const all = await fetchAllFiltered();
  all.forEach(r => selectedIds.add(r.id));
  updateExportCount();
}

async function invertSelection() {
  const all = await fetchAllFiltered();
  const allIds = new Set(all.map(r => r.id));
  for (const id of allIds) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
  }
  updateExportCount();
}

function updateExportCount() {
  const el = els.exportToolbar.querySelector('.export-count');
  if (el) el.textContent = `已选 ${selectedIds.size} 条`;
}

async function confirmSelection() {
  const allItems = await fetchAllFiltered();
  const previewItems = allItems.filter(r => selectedIds.has(r.id));
  previewMode = true;
  renderPreview(previewItems);
}

/** 在预览区域直接渲染带 PDF 层次格式的内容（标签按 "/" 分层、标题粗体大号、内容小号、碎片知识无日期）。
 * 分层规则：取每条记录的首个标签并按 "/" 拆分，第一段作为主标签分组键，
 * 第二段（若存在）作为次级标签子分组键。无子标签时不显示次级组头。
 * 条目编号为 主.条目（无子标签）或 主.子.条目（有子标签），如 1.2.3。 */
function renderPreview(previewItems) {
  const cat = catOf(state.type);

  // 按首个标签的 "/" 分段建立两层层级：主标签 -> 次级标签 -> 条目[]
  const hierarchy = new Map();
  for (const r of previewItems) {
    const tags = r.tags || [];
    const firstTag = tags[0] || '';
    const parts = firstTag.split('/').map(p => p.trim()).filter(Boolean);
    const mainTag = parts[0] || '(无标签)';
    if (!hierarchy.has(mainTag)) hierarchy.set(mainTag, new Map());
    const subMap = hierarchy.get(mainTag);
    const subTag = parts[1] || null;
    const key = subTag ? subTag : '(无子标签)';
    if (!subMap.has(key)) subMap.set(key, []);
    subMap.get(key).push({ record: r, hasSub: !!subTag });
  }

  const catLabel = cat ? cat.label : '记录';

  render(els.listBody, []);
  els.listPager.hidden = true;
  els.filterBar.hidden = true;
  els.exportToolbar.hidden = true;
  els.filterbarCard.hidden = true;
  els.listviewCard.hidden = true;
  els.exportPreview.hidden = false;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const previewTitle = el('h3', { class: 'export-preview-total', children: [
    el('span', { text: `${catLabel}（共 ${previewItems.length} 条）` }),
    el('span', { class: 'export-preview-timestamp', text: `  导出于 ${dateStr} ${timeStr}` }),
  ]});

  const groupNodes = [];
  let groupNum = 0;
  for (const [mainTag, subMap] of hierarchy) {
    groupNum++;
    const mainItemCount = Array.from(subMap.values()).reduce((sum, items) => sum + items.length, 0);
    const tagHeader = el('h4', { class: 'export-pdf-tag-group', text: `${groupNum}. ${mainTag}（共 ${mainItemCount} 条）` });

    const subNodes = [];
    let subNum = 0;
    for (const [subTagKey, entries] of subMap) {
      const hasSub = entries.every(e => e.hasSub);
      subNum++;

      const itemNodes = entries.map(({ record: r }, itemIdx) => {
        const itemNum = itemIdx + 1;
        const itemNumStr = hasSub ? `${groupNum}.${subNum}.${itemNum}` : `${groupNum}.${itemNum}`;
        const isKnowledge = r.type === 'knowledge';
        const titleHtml = renderLatexText(r.title);
        const contentHtml = r.content ? renderMarkdown(r.content, r.images || []) : '';
        const dateHtml = isKnowledge ? '' : `<div class="export-pdf-date">${relTime(r.updatedAt)}</div>`;
        return el('div', { class: 'export-pdf-item', children: [
          el('div', { class: 'export-pdf-title', html: `<span class="export-pdf-item-num">${itemNumStr}.</span> ${titleHtml}` }),
          contentHtml ? el('div', { class: 'export-pdf-content', html: contentHtml }) : null,
          dateHtml ? el('div', { class: 'export-pdf-date' }, [el('span', { text: dateHtml })]) : null,
        ]});
      });

      if (hasSub) {
        const subItemCount = entries.length;
        const subHeader = el('div', { class: 'export-pdf-sub-group', text: `  ${groupNum}.${subNum}. ${subTagKey}（共 ${subItemCount} 条）` });
        subNodes.push(subHeader, ...itemNodes);
      } else {
        subNodes.push(...itemNodes);
      }
    }
    groupNodes.push(tagHeader, ...subNodes);
  }

  render(els.exportPreview, frag([
    previewTitle,
    el('div', { class: 'export-preview-list', children: groupNodes }),
    el('div', { class: 'export-preview-footer', children: [
      el('button', { class: 'btn btn-primary', text: '下载 PDF', on: { click: savePDF } }),
      el('button', { class: 'btn btn-ghost', text: '导出为 JSON', on: { click: exportJSON } }),
      el('button', { class: 'btn btn-ghost', text: '取消', on: { click: exitExportMode } }),
    ]}),
  ]));
}

/** 按标签分组（取第一个标签作为分组键）。 */
function groupByTag(items) {
  const groups = {};
  for (const r of items) {
    const tag = (r.tags && r.tags[0]) || '(无标签)';
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(r);
  }
  return groups;
}

async function exportJSON() {
  try {
    const allItems = await fetchAllFiltered();
    const filtered = allItems.filter(r => selectedIds.has(r.id));
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    // 导出时注明类别：每条记录确保带 type 字段
    const exportData = filtered.map(r => ({ ...r, type: r.type || state.type }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `pouch-export-${state.type}-${dateStr}.json`, attrs: { style: 'display:none' } });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`JSON 导出成功（${state.type}）`, 'ok');
  } catch (e) {
    toast('导出失败：' + (e.message || '未知错误'), 'error');
  }
}

/** 从 JSON 文件导入选中的记录。导入前验证类别是否与当前页一致。 */
async function handleImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const items = JSON.parse(text);
    if (!Array.isArray(items)) throw new Error('JSON 必须是数组');
    // 验证类别：导入的每条记录 type 必须与当前页类别一致
    for (const item of items) {
      if (item.type && item.type !== state.type) {
        throw new Error('错误的类别');
      }
    }
    const res = await API.importRecords(state.type, items);
    const n = res?.imported ?? items.length;
    toast(`已导入 ${n} 条（${state.type}）`, 'ok');
    els.importJsonFile.value = '';
    await reload();
  } catch (err) {
    els.importJsonFile.value = '';
    toast('导入失败：' + (err.message || '未知错误'), 'error');
  }
}

/** 将 ArrayBuffer 转换为 base64 字符串，避免大文件展开参数溢出。 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** 将一段纯文本（可能含行内 Markdown `**粗体**` `*斜体*` `` `代码` `` 以及行首的块级标记 `#` / `-` / `1.` / `>`）渲染进 PDF。
 * 返回更新后的 y。只依赖已注册的 NotoSansSC normal/bold 字体，斜体与等宽退化为 normal，
 * 但标记本身会被去掉，不会以源码形式泄露进 PDF。 */
function renderPlainText(plainText, doc, margin, y, maxWidth) {
  if (!plainText || !plainText.trim()) return y;

  // 按原始换行拆分，使行首的块级标记（标题/列表/引用）能被逐行识别
  const lines = plainText.split('\n');
  let paraStarted = false;
  for (const line of lines) {
    if (!line.trim()) { paraStarted = false; y += 2; continue; } // 空行 = 段落间距

    let body = line;
    let size = 10;
    let blockBold = false;
    let prefix = '';

    // 行首块级 Markdown：标题 / 无序列表 / 有序列表 / 引用
    const heading = line.match(/^(#{1,6})\s+(.*)$/s);
    if (heading) {
      blockBold = true;
      size = Math.max(8, 13 - heading[1].length); // h1≈13 … h6≈8
      body = heading[2];
    } else if (/^[-*+]\s/.test(line)) {
      prefix = '• ';
      body = line.replace(/^[-*+]\s+/, '');
    } else if (/^\d+\.\s/.test(line)) {
      prefix = (line.match(/^\d+\./)[0] || '') + ' ';
      body = line.replace(/^\d+\.\s+/, '');
    } else if (/^>\s/.test(line)) {
      body = line.replace(/^>\s+/, '');
    }

    // 行内 Markdown → 样式运行，去掉标记但保留粗体语义
    const runs = [];
    let rest = body;
    let last = 0;
    const tokenRe = /\*\*(.+?)\*\*|\*(.+?)\*|\`(.+?)\`/g;
    tokenRe.lastIndex = 0;
    let t;
    while ((t = tokenRe.exec(rest))) {
      if (t.index > last) runs.push({ text: rest.slice(last, t.index), bold: false });
      if (t[1] !== undefined) runs.push({ text: t[1], bold: true });     // **粗体**
      else if (t[2] !== undefined) runs.push({ text: t[2], bold: false }); // *斜体*
      else runs.push({ text: t[3], bold: false });                          // `代码`
      last = t.index + t[0].length;
    }
    if (last < rest.length) runs.push({ text: rest.slice(last), bold: false });

    // 合并相邻同样式运行
    const merged = [];
    for (const run of runs) {
      const prev = merged[merged.length - 1];
      if (prev && prev.bold === run.bold) prev.text += run.text;
      else merged.push({ text: run.text, bold: run.bold });
    }

    paraStarted = false;
    for (const run of merged) {
      if (!run.text.trim()) continue;
      doc.setFontSize(size);
      doc.setFont('NotoSansSC', blockBold || run.bold ? 'bold' : 'normal');
      const subLines = doc.splitTextToSize(run.text, maxWidth);
      for (const subLine of subLines) {
        const display = (!paraStarted && prefix) ? prefix + subLine : subLine;
        doc.text(display, margin, y);
        y += 5;
        paraStarted = true;
      }
    }
  }
  return y + 4;
}

async function renderTextWithLatexToPdfFragments(text, doc, margin, y, maxWidth) {
  if (!text) return y;

  console.log('[renderTextWithLatexToPdfFragments] 开始渲染:', text);

  // 将文本按 LaTeX 公式分段：$$...$$ 块公式优先，然后 $...$ 行内公式
  const allMatches = [];
  let m;
  const blockRe = /\$\$([\s\S]*?)\$\$/g;
  blockRe.lastIndex = 0;
  while ((m = blockRe.exec(text))) {
    allMatches.push({ start: m.index, end: m.index + m[0].length, type: 'block', content: m[1] });
  }
  const inlineRe = /\$([^\$]+?)\$/g;
  inlineRe.lastIndex = 0;
  while ((m = inlineRe.exec(text))) {
    allMatches.push({ start: m.index, end: m.index + m[0].length, type: 'inline', content: m[1] });
  }
  // 按位置排序
  allMatches.sort((a, b) => a.start - b.start);

  // 去重
  const uniqueMatches = [];
  for (const match of allMatches) {
    let overlapped = false;
    for (const u of uniqueMatches) {
      if (match.start < u.end && match.end > u.start) {
        overlapped = true;
        break;
      }
    }
    if (!overlapped) uniqueMatches.push(match);
  }

  console.log('[renderTextWithLatexToPdfFragments] 匹配到公式:', uniqueMatches);

  let lastEnd = 0;
  for (const match of uniqueMatches) {
    // 渲染公式前的普通文本
    if (match.start > lastEnd) {
      const plainText = text.slice(lastEnd, match.start);
      if (plainText.trim()) {
        y = renderPlainText(plainText, doc, margin, y, maxWidth);
      }
    }

    // 渲染 LaTeX 公式
    const latexContent = match.content;
    const displayMode = match.type === 'block';
    console.log('[renderTextWithLatexToPdfFragments] 渲染公式:', latexContent, 'displayMode:', displayMode);

    // 检查 katex 是否可用
    if (!window.katex) {
      console.error('[renderTextWithLatexToPdfFragments] window.katex 未定义!');
      doc.setFontSize(9);
      doc.setFont('NotoSansSC', 'normal');
      doc.setTextColor('#4f46e5');
      const lines = doc.splitTextToSize('\$' + latexContent + '\$', maxWidth);
      for (const line of lines) {
        doc.text(line, margin, y);
        y += 5;
      }
      doc.setTextColor('#000000');
      lastEnd = match.end;
      continue;
    }

    try {
      // 使用 KaTeX 渲染为 SVG，并把纯净的 <svg> 元素以图像形式绘制进 PDF。
      // renderToString() 可能返回带 <span class="katex"> 包装的 HTML，必须从 DOM 中取出纯 svg。
      // 使用 Blob URL（而非 data:image/svg+xml;base64）可完整保留 UTF-8 字节，避免
      // btoa() 对非 Latin-1 字符抛出 DOMException，也避免 data URI 的命名空间问题。
      let svgString = '';
      try {
        const katexHtml = window.katex.renderToString(latexContent, {
          throwOnError: false,
          displayMode: displayMode
        });
        const temp = document.createElement('div');
        temp.innerHTML = katexHtml;
        const svgEl = temp.querySelector('svg');
        if (svgEl) {
          // 确保作为独立图像文档能被浏览器正确解码
          if (!svgEl.getAttribute('xmlns')) {
            svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          }
          const imgWidth = Math.min(maxWidth, 200);
          const imgHeight = Math.max(1, Math.round(imgWidth * 0.4));
          if (!svgEl.getAttribute('width')) svgEl.setAttribute('width', String(imgWidth));
          if (!svgEl.getAttribute('height')) svgEl.setAttribute('height', String(imgHeight));
          if (!svgEl.getAttribute('viewBox')) {
            svgEl.setAttribute('viewBox', `0 0 ${imgWidth} ${imgHeight}`);
          }
          svgString = svgEl.outerHTML;
        }
      } catch (e) {
        // KaTeX 渲染失败，公式将被跳过（不以原始 $...$ 源码泄露进 PDF）
      }

      if (svgString) {
        const imgWidth = Math.min(maxWidth, 200);
        const imgHeight = Math.max(1, Math.round(imgWidth * 0.4));
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('svg image load failed'));
          img.src = url;
        });
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, imgWidth, imgHeight);
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, y, imgWidth, imgHeight);
        y += imgHeight + 4;
      }
      // svg 为空时不降级为文本：避免将原始 $...$/$$...$$ 源码泄露进 PDF
    } catch (e) {
      console.error('[renderTextWithLatexToPdfFragments] 渲染公式出错:', e);
      // 不降级为文本，公式在此处被跳过
    }

    lastEnd = match.end;
  }

  // 渲染剩余普通文本
  if (lastEnd < text.length) {
    const plainText = text.slice(lastEnd);
    if (plainText.trim()) {
      y = renderPlainText(plainText, doc, margin, y, maxWidth);
    }
  }

  return y + 3;
}

async function savePDF() {
  try {
    const previewEl = els.exportPreview;
    if (!previewEl) {
      throw new Error('找不到导出预览区域 #exportPreview');
    }

    const jsPDFClass = window.jspdf?.jsPDF || window.jsPDF;
    if (typeof jsPDFClass !== 'function') {
      throw new Error('jsPDF constructor not found.');
    }
    const doc = new jsPDFClass();

    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    // 直接把整个 #exportPreview 区域（含已渲染的 Markdown 与 KaTeX 公式）绘制为图片，
    // 再写入 PDF，实现“预览即所得”，避免 jsPDF 逐段绘制导致公式/Markdown 丢失。
    const canvas = await html2canvas(previewEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      // 页脚按钮区（下载/返回/取消）属于操作 UI，不应出现在 PDF 中
      ignoreElements: (element) => element.classList?.contains('export-preview-footer'),
    });

    // 按页面可用高度切片，每片一页
    const scale = contentWidth / canvas.width;
    const slicePxHeight = contentHeight / scale; // 每页对应的 canvas 像素高度
    let top = 0;
    let firstPage = true;
    while (top < canvas.height) {
      if (!firstPage) {
        doc.addPage();
      }
      firstPage = false;

      const bottom = Math.min(top + slicePxHeight, canvas.height);
      const sliceHeight = bottom - top;
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      // 按实际比例绘制，避免最后一页不足时被拉伸变形
      const imgWidth = contentWidth;
      const imgHeight = sliceHeight * scale;
      doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, imgHeight);
      top = bottom;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const cat = catOf(state.type);
    const fileName = `pouch-export-${cat ? cat.label : 'record'}-${dateStr}.pdf`;

    // 生成 Data URI 并在新标签页预览
    const pdfDataUri = doc.output('datauristring');
    const previewWin = window.open('', '_blank', 'width=1100,height=1500');
    previewWin.document.write(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <title>PDF 预览 - ${fileName}</title>
        <style>
          body { margin: 0; padding: 0; background: #f5f5f5; font-family: sans-serif; }
          .toolbar { position: fixed; top: 10px; left: 10px; right: 10px; z-index: 9999;
            background: white; border: 1px solid #ddd; border-radius: 6px;
            padding: 10px 16px; display: flex; gap: 10px; justify-content: flex-end;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
          .toolbar button { background: #4f46e5; color: #fff; border: none; padding: 10px 20px;
            border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; }
          .toolbar button:hover { background: #4338ca; }
          .toolbar .hint { font-size: 13px; color: #666; margin-right: auto; margin-top: 3px; }
          iframe { width: 100vw; height: 100vh; border: none; display: block; }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <span class="hint">预览效果即最终 PDF 效果，点击下方按钮保存到本地</span>
          <button type="button" onclick="downloadPdf()">下载 PDF</button>
        </div>
        <iframe src="${pdfDataUri}" id="pdfFrame"></iframe>
        <script>
          function downloadPdf() {
            const link = document.createElement('a');
            link.href = document.getElementById('pdfFrame').src;
            link.download = '${fileName}';
            document.body.append(link);
            link.click();
            link.remove();
          }
        </script>
      </body>
      </html>
    `);
    previewWin.document.close();
  } catch (e) {
    console.error('PDF 生成失败:', e);
    alert('PDF 生成失败：' + (e.message || '未知错误'));
  }

}

function buildExportToolbar() {
  return el('div', { class: 'export-toolbar', children: [
    el('div', { class: 'export-toolbar-left', children: [
      el('span', { class: 'export-count', text: `已选 ${selectedIds.size} 条` }),
    ]}),
    el('div', { class: 'export-toolbar-right', children: [
      el('button', { class: 'btn btn-ghost', text: '全选', on: { click: async () => { await selectAllVisible(); reload(); } } }),
      el('button', { class: 'btn btn-ghost', text: '反选', on: { click: async () => { await invertSelection(); reload(); } } }),
      el('button', { class: 'btn btn-primary', text: '确定', on: { click: confirmSelection } }),
      el('button', { class: 'btn btn-ghost', text: '取消', on: { click: exitExportMode } }),
    ]}),
  ]});
}

function importButton() {
  return el('button', {
    type: 'button',
    class: 'btn btn-primary',
    text: '导入 JSON',
    on: { click: () => els.importJsonFile.click() }
  });
}

function exportButton() {
  return el('div', { class: 'export-button-group', children: [
    el('button', {
      type: 'button',
      class: 'btn btn-primary',
      text: '导出',
      on: { click: enterExportMode }
    }),
    importButton(),
  ]});
}

let isLoading = false;
let currentItems = [];
let modalTags = [];        // 新建模态框里已选标签

// 导出模式状态
let exportMode = false;
let previewMode = false;
let selectedIds = new Set();

  // ============ 工具函数 ============
  function showError(message) {
    els.listError.textContent = message;
    els.listError.hidden = false;
  }

  function hideError() {
    els.listError.hidden = true;
    els.listError.textContent = '';
  }

  function setLoading(loading) {
    isLoading = loading;
    els.listBody.classList.toggle('is-loading', loading);
  }

  // ============ 状态文案 / Toast（共享件，dom.js） ============

  function detailUrl(record) {
    const from = encodeURIComponent(location.pathname + location.search);
    return `/detail.html?id=${record.id}&from=${from}`;
  }

  function refreshOverviewCounts() {
    API.statsOverview().then(s => {
      CATEGORIES.forEach(c => {
        const el = document.querySelector(`[data-cat="${c.type}"] .cat-count`);
        if (el) el.textContent = s.counts[c.type] ?? 0;
      });
    }).catch(() => {});
  }

  // ============ URL 同步 ============
  function readStateFromURL() {
    const params = new URLSearchParams(location.search);
    state.type = params.get('type') || 'todo';
    state.q = params.get('q') || '';
    state.tags = params.get('tags') ? params.get('tags').split(',').filter(Boolean) : [];
    state.status = params.get('status') || '';
    state.dueFrom = params.get('dueFrom') || '';
    state.dueTo = params.get('dueTo') || '';
    state.sort = params.get('sort') || 'updatedAt';
    state.order = params.get('order') || 'desc';
    state.page = Math.max(1, parseInt(params.get('page') || '1', 10));
    state.size = parseInt(params.get('size') || '20', 10);
    state.pinned = params.get('pinned') ? params.get('pinned') === 'true' : null;
  }

  function writeStateToURL(replace = false) {
    const params = new URLSearchParams();
    params.set('type', state.type);
    if (state.q) params.set('q', state.q);
    if (state.tags.length) params.set('tags', state.tags.join(','));
    if (state.status) params.set('status', state.status);
    if (state.dueFrom) params.set('dueFrom', state.dueFrom);
    if (state.dueTo) params.set('dueTo', state.dueTo);
    if (state.sort !== 'updatedAt') params.set('sort', state.sort);
    if (state.order !== 'desc') params.set('order', state.order);
    if (state.page > 1) params.set('page', String(state.page));
    if (state.size !== 20) params.set('size', String(state.size));
    if (state.pinned !== null) params.set('pinned', String(state.pinned));
    const url = `/list.html?${params.toString()}`;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }

 // ============ 筛选栏构建 ============
  function searchInput() {
    return el('input', {
      type: 'search',
      class: 'input input-search',
      placeholder: '搜索标题与正文…',
      value: state.q || '',
      attrs: { 'aria-label': '关键词搜索' },
      on: {
        keydown: e => { if (e.key === 'Enter') { e.preventDefault(); state.q = e.target.value; state.page = 1; reload(); } }
      }
    });

  }

  function statusSelect(cat) {
    // 状态枚举来自元数据（用户故事 62）：/api/meta/categories 的 statuses 是 [{value,label}]
    const options = [{ value: '', text: '全部状态' }].concat(
      (cat.statuses || []).map(s => ({ value: s.value, text: s.label }))
    );
    return el('select', {
      class: 'select',
      attrs: { 'aria-label': '按状态筛选' },
      value: state.status || '',
      on: { change: e => { state.status = e.target.value; state.page = 1; reload(); } },
      children: options.map(o => el('option', { value: o.value, text: o.text, selected: state.status === o.value }))
    });
  }

  /**
   * 标签筛选：单下拉（与状态/学科一致），选项按 / 分层缩进显示"名 (计数)"；
   * 计数为子树记录数，与"选父标签"的筛选结果严格一致（docs/01 §1.8 前缀语义）。
   * 下拉是"挑选器"：选中即加入当前筛选（可累加多项），已选标签以下方 chip 展示并可单独移除。
   */
  function tagSelect() {
    const select = el('select', {
      class: 'select',
      attrs: { 'aria-label': '按标签筛选' },
      value: '',
      on: {
        change: e => {
          const v = e.target.value;
          if (!v) return;
          if (!state.tags.includes(v)) { state.tags.push(v); state.page = 1; reload(); }
          e.target.value = '';   // 复位为"全部标签"，便于继续追加挑选
        }
      },
      children: [el('option', { value: '', text: '全部标签' })]
    });

    API.tags(state.type).then(({ tags }) => {
      render(select, frag([
        el('option', { value: '', text: '全部标签' }),
        ...tags.map(t => el('option', {
          value: t.tag,
          text: '　'.repeat(t.depth || 0) + (t.name || t.tag) + ` (${t.count})`,
        })),
      ]));
    }).catch(() => {});
    return select;
  }

  function dueRangeInputs() {
    return el('div', { class: 'due-range' , children: [
      el('input', {
        type: 'date',
        class: 'input input-date',
        value: state.dueFrom || '',
        attrs: { 'aria-label': '截止日期从', placeholder: '开始日期' },
        on: { change: e => { state.dueFrom = e.target.value; state.page = 1; reload(); } }
      }),
      el('span', { class: 'date-sep', text: '~' }),
      el('input', {
        type: 'date',
        class: 'input input-date',
        value: state.dueTo || '',
        attrs: { 'aria-label': '截止日期到', placeholder: '结束日期' },
        on: { change: e => { state.dueTo = e.target.value; state.page = 1; reload(); } }
      }),
    ]});
  }

  function sortSelect() {
    const options = [
      { value: 'updatedAt', text: '更新时间' },
      { value: 'createdAt', text: '创建时间' },
      { value: 'title', text: '标题' },
    ];
    const cat = catOf(state.type);
    if (cat.fields.includes('dueDate')) {
      options.push({ value: 'dueDate', text: '截止日期' });
    }
    return el('select', {
      class: 'select',
      attrs: { 'aria-label': '排序方式' },
      value: state.sort,
      on: { change: e => { state.sort = e.target.value; state.page = 1; reload(); } },
      children: options.map(o => el('option', { value: o.value, text: o.text, selected: state.sort === o.value }))
    });
  }

  function orderSelect() {
    return el('select', {
      class: 'select select-sm',
      attrs: { 'aria-label': '排序方向' },
      value: state.order,
      on: { change: e => { state.order = e.target.value; state.page = 1; reload(); } },
      children: [
        el('option', { value: 'desc', text: '降序', selected: state.order === 'desc' }),
        el('option', { value: 'asc', text: '升序', selected: state.order === 'asc' }),
      ]
    });
  }

  function sizeSelect() {
    return el('select', {
      class: 'select select-sm',
      attrs: { 'aria-label': '每页条数' },
      value: String(state.size),
      on: { change: e => { state.size = parseInt(e.target.value, 10); state.page = 1; reload(); } },
      children: [10, 20, 50, 100].map(n =>
        el('option', { value: String(n), text: `${n} 条/页`, selected: state.size === n })
      )
    });
  }

  function pinnedSelect() {
    return el('select', {
      class: 'select select-sm',
      attrs: { 'aria-label': '置顶筛选' },
      value: state.pinned === null ? '' : String(state.pinned),
      on: { change: e => { state.pinned = e.target.value === '' ? null : e.target.value === 'true'; state.page = 1; reload(); } },
      children: [
        el('option', { value: '', text: '全部', selected: state.pinned === null }),
        el('option', { value: 'true', text: '仅置顶', selected: state.pinned === true }),
        el('option', { value: 'false', text: '仅非置顶', selected: state.pinned === false }),
      ]
    });
  }

  function newButton() {
    return el('button', {
      type: 'button',
      class: 'btn btn-primary',
      text: '+ 新建',
      on: { click: openNewModal }
    });
  }

  function clearFiltersButton() {
    return el('button', {
      type: 'button',
      class: 'btn btn-ghost',
      text: '清除全部筛选',
      on: { click: clearFilters }
    });
  }

function buildFilters() {
  const cat = catOf(state.type);
  const parts = [searchInput(), statusSelect(cat), tagSelect()];

  if (cat.fields.includes('dueDate')) parts.push(dueRangeInputs());

  parts.push(sortSelect(), orderSelect(), sizeSelect(), pinnedSelect());

  if (previewMode) {
    render(els.filterBar, []);
    els.filterBar.hidden = true;
    els.exportToolbar.hidden = true;
    els.exportPreview.hidden = false;
    return;
  }

  els.filterBar.hidden = false;
if (exportMode) {
    parts.push(newButton());
    render(els.filterBar, frag(parts));
    render(els.exportToolbar, frag([buildExportToolbar()]));
    els.exportToolbar.hidden = false;
    els.exportPreview.hidden = true;
  } else {
    parts.push(newButton(), exportButton());
 render(els.filterBar, frag(parts));
    els.exportToolbar.hidden = true;
    els.exportPreview.hidden = true;
  }
}

  function renderFilterChips() {
    const chips = [];
    if (state.q) chips.push(makeChip(`搜索: ${state.q}`, () => { state.q = ''; state.page = 1; reload(); }));
    for (const t of state.tags) {
      chips.push(makeChip(`标签: ${t}`, () => { state.tags = state.tags.filter(x => x !== t); state.page = 1; reload(); }));
    }
    if (state.status) chips.push(makeChip(`状态: ${statusLabel(catOf(state.type), state.status)}`, () => { state.status = ''; state.page = 1; reload(); }));
    if (state.dueFrom || state.dueTo) chips.push(makeChip(`截止: ${state.dueFrom || '…'} ~ ${state.dueTo || '…'}`, () => { state.dueFrom = ''; state.dueTo = ''; state.page = 1; reload(); }));
    if (state.pinned !== null) chips.push(makeChip(`置顶: ${state.pinned ? '是' : '否'}`, () => { state.pinned = null; state.page = 1; reload(); }));

    if (chips.length) {
      render(els.filterChips, frag([el('div', { class: 'chips-label', text: '当前筛选:' }), ...chips]));
      els.filterChips.hidden = false;
    } else {
      // 必须清空子节点：只设 hidden 会留下旧 chip 的 DOM（若 CSS 的 display 覆盖了
      // [hidden]，用户就会看到"点了 × 标签还在"——本 bug 的实际形态）
      render(els.filterChips, []);
      els.filterChips.hidden = true;
    }
  }

  function makeChip(text, onRemove) {
    return el('span', { class: 'filter-chip', children: [
      el('span', { text }),
      el('button', { class: 'chip-remove', 'aria-label': `移除筛选: ${text}`, on: { click: onRemove }, children: ['×'] })
    ]});
  }

  function clearFilters() {
    state.q = '';
    state.tags = [];
    state.status = '';
    state.dueFrom = '';
    state.dueTo = '';
    state.pinned = null;
    state.page = 1;
    reload();
  }

  // ============ 列表渲染 ============
  function renderList() {
    if (!currentItems.length) {
      render(els.listBody, [emptyState()]);
      els.listPager.hidden = true;
      return;
    }

    render(els.listBody, currentItems.map(recordRow));
    renderPager();
  }

  function recordRow(r) {
    const cat = catOf(r.type);
    const isSelected = selectedIds.has(r.id);
    const children = [];

    if (exportMode) {
      children.push(
        el('label', { class: 'export-row-checkbox', children: [
          el('input', {
            type: 'checkbox',
            checked: isSelected,
            on: { change: () => toggleSelect(r.id) }
          })
        ]})
      );
}

    children.push(
      statusControl(r, cat),
      el('a', { class: 'row-main', href: exportMode ? undefined : detailUrl(r), children: [
        el('h3', { class: 'row-title', children: [
          r.pinned ? el('span', { class: 'pin-mark', text: '置顶', attrs: { 'aria-label': '已置顶' } }) : null,
          el('span', { html: renderLatexText(r.title) }),
  ]}),
        r.content ? el('p', { class: 'row-excerpt', html: isListFullRender() ? renderMarkdown(r.content) : renderLatexText(excerpt(r.content, 150)) }) : null,
        el('div', { class: 'row-meta', children: [
          el('span', { class: ['badge', `badge-status-${r.status}`], text: statusLabel(cat, r.status) }),
          ...r.tags.slice(0, 4).map(t => el('span', { class: 'badge badge-tag', text: t })),
          r.tags.length > 4 ? el('span', { class: 'badge badge-tag', text: `+${r.tags.length - 4}` }) : null,
          r.dueDate ? dueBadge(r) : null,
          r.notes?.length ? el('span', { class: 'row-note-count', text: `${r.notes.length} 条笔记` }) : null,
          ]}),
      ]}),
      el('time', { class: 'row-time', text: relTime(r.updatedAt), attrs: { title: '更新于 ' + fullTime(r.updatedAt), datetime: r.updatedAt } }),
    );

    const row = el('article', {
      class: ['row', `row-${r.type}`, r.pinned && 'is-pinned', exportMode && 'export-mode'],
      style: { '--card-accent': `var(--cat-${r.type})` },
      attrs: { 'data-id': r.id },
      on: exportMode ? {
        click: (e) => {
          const tag = e.target.tagName;
          if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'LABEL') return;
          if (e.target.closest('a, button, input, label')) return;
          toggleSelect(r.id);
        }
      } : undefined,
      children,
});

    return row;
  }

  function statusControl(r, cat) {
    if (r.type === 'todo') {
      return el('input', {
        type: 'checkbox',
        checked: r.status === 'done',
        attrs: { 'aria-label': `标记「${r.title}」为已完成` },
        on: { change: e => flipStatus(r, e.target.checked ? 'done' : 'open', e.target) }
      });
    }
    if (r.type === 'question') {
      return el('input', {
        type: 'checkbox',
        checked: r.status === 'resolved',
        attrs: { 'aria-label': `标记「${r.title}」为已解决` },
        on: { change: e => flipStatus(r, e.target.checked ? 'resolved' : 'open', e.target) }
      });
    }
    return el('span', { class: 'row-status-slot' });
  }

  function dueBadge(r) {
    const due = new Date(r.dueDate + 'T23:59:59');
    const days = Math.ceil((due - Date.now()) / 86400000);
    const done = r.status === 'done';
    const cls = done ? '' : days < 0 ? 'badge-overdue' : days <= 3 ? 'badge-soon' : '';
    const text = days < 0 && !done ? `逾期 ${-days} 天` : r.dueDate.slice(5);
    return el('span', { class: ['badge', 'badge-due', cls], text, attrs: { title: '截止 ' + r.dueDate } });
  }

  async function flipStatus(r, newStatus, input) {
    input.disabled = true;
    try {
      await API.updateRecord(r.id, { status: newStatus }, r.type);
      r.status = newStatus;
      const row = input.closest('.row');
      const badge = row.querySelector('[class*="badge-status-"]');
      if (badge) {
        badge.className = `badge badge-status-${newStatus}`;
        badge.textContent = statusLabel(catOf(r.type), newStatus);
      }
      if (state.status && !state.status.split(',').includes(newStatus)) {
        row.classList.add('is-leaving');
        setTimeout(() => { row.remove(); refreshOverviewCounts(); }, 250);
      }
      refreshOverviewCounts();
    } catch (e) {
      input.checked = !input.checked;
      toast(e.message);
    } finally {
      input.disabled = false;
    }
  }

  function renderPager() {
    const totalPages = Math.ceil(state.total / state.size);
    if (totalPages <= 1) { els.listPager.hidden = true; return; }
    els.listPager.hidden = false;

    const pages = [];
    if (state.page > 1) {
      pages.push(el('button', { class: 'pager-btn', text: '← 上一页', on: { click: () => { state.page--; reload(); } } }));
    }
    pages.push(el('span', { class: 'pager-info', text: `第 ${state.page} 页 / 共 ${totalPages} 页 (${state.total} 条)` }));
    if (state.page < totalPages) {
      pages.push(el('button', { class: 'pager-btn', text: '下一页 →', on: { click: () => { state.page++; reload(); } } }));
    }
    render(els.listPager, frag(pages));
  }

  function emptyState() {
    const cat = catOf(state.type);
    const hasFilter = state.q || state.tags.length || state.status || state.dueFrom || state.dueTo || state.pinned !== null;
    return el('div', { class: 'empty', children: [
      el('div', { class: 'empty-icon', text: hasFilter ? '🔍' : '✎', attrs: { 'aria-hidden': 'true' } }),
      el('p', { class: 'empty-title', text: hasFilter ? '没有符合条件的记录' : `还没有${cat.label}` }),
      el('p', { class: 'empty-desc', text: hasFilter
        ? '试着放宽筛选条件，或清除全部筛选。'
        : `把学习中冒出来的${cat.label}记下来，之后可以随时回看。` }),
      hasFilter
        ? el('button', { class: 'btn btn-ghost', text: '清除全部筛选', on: { click: clearFilters } })
        : el('button', { class: 'btn btn-primary', text: `记一条${cat.label}`, on: { click: openNewModal } }),
    ]});
  }

  // ============ 数据加载 ============
  async function reload() {
    hideError();
    setLoading(true);
    writeStateToURL();
    buildFilters();
    renderFilterChips();
    updateTitle();

    try {
      const filters = { q: state.q, tags: state.tags.join(','), status: state.status,
        pinned: state.pinned, dueFrom: state.dueFrom, dueTo: state.dueTo, sort: state.sort, order: state.order,
        page: state.page, size: state.size };
      let res = await API.listRecords(state.type, filters);
      const total = res.pagination?.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / state.size));
      // 删除后从详情页返回、或带着旧页码链接进来：页码越界时回落到新的有效最后一页，
      // 不停在"现在为空"的空白页（spec 用户故事 33 / docs/05 阶段 3）
      if (total > 0 && state.page > totalPages) {
        state.page = totalPages;
        writeStateToURL();
        res = await API.listRecords(state.type, { ...filters, page: state.page });
      }
      currentItems = res.items || [];
      state.total = res.pagination?.total || 0;
      renderList();
    } catch (e) {
      console.error('加载列表失败:', e);
      if (e.isNetwork) {
        showError('无法连接到本地服务器。请确认 Pouch 服务已启动（运行 server\\start.ps1）。');
      } else {
        showError(e.message || '加载失败');
      }
      currentItems = [];
      state.total = 0;
      renderList();
    } finally {
      setLoading(false);
    }
  }

  function updateTitle() {
    const cat = catOf(state.type);
    els.listTitle.textContent = cat ? cat.label : '列表';
  }
// ============ 左侧导航 ============
  function renderSidebar() {
    // 四个类别
    const catItems = CATEGORIES.map(c => el('a', {
      class: ['cat-item', state.type === c.type && 'active'],
      href: `/list.html?type=${c.type}`,
      attrs: { 'data-cat': c.type, role: 'listitem' },
      children: [
        el('span', { class: 'cat-color', style: { background: `var(--cat-${c.type})` }, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'cat-label', text: c.label }),
        el('span', { class: 'cat-count', text: '0' }),
      ]
    }));
    render(els.catNav, frag(catItems));

    // 心愿单入口
    render(els.extraNav, frag([
      el('a', {
        class: 'cat-item',
        href: '/wishlist.html',
        attrs: { role: 'listitem' },
        children: [
          el('span', { class: 'cat-color', style: { background: 'var(--cat-todo)' }, attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'cat-label', text: '心愿单' }),
        ]
      })
    ]));
  }

  // ============ 新建记录模态框 ============
  function openNewModal() {
    const cat = catOf(state.type);
    modalTags = [];
    els.modalTitle.textContent = `新建${cat.label}`;
    renderModalFields(cat);
    els.newRecordModal.showModal();
    els.modalBackdrop.hidden = false;
    // 聚焦第一个输入框
    setTimeout(() => {
      const firstInput = els.modalBody.querySelector('input, textarea, select');
      firstInput?.focus();
    }, 50);
  }

  function closeNewModal() {
    els.newRecordModal.close();
    els.modalBackdrop.hidden = true;
    render(els.modalBody, []);
  }

  function renderModalFields(cat) {
    const fields = [
      { name: 'title', label: '标题', type: 'text', required: true, maxlength: LIMITS.title, placeholder: '请输入标题' },
      { name: 'content', label: '正文', type: 'textarea', rows: 8, placeholder: '支持 Markdown 语法' },
    ];
    if (cat.fields.includes('source')) {
      fields.push({ name: 'source', label: '来源', type: 'text', maxlength: LIMITS.source, placeholder: '如：书名、链接、课程名' });
    }
    if (cat.fields.includes('dueDate')) {
      fields.push({ name: 'dueDate', label: '截止日期', type: 'date' });
    }
    if (cat.fields.includes('priority')) {
      fields.push({ name: 'priority', label: '优先级', type: 'select', options: [
        { value: 'low', text: '低' }, { value: 'normal', text: '普通' }, { value: 'high', text: '高' }
      ], default: 'normal' });
    }
    fields.push({ name: 'tags', label: '标签', type: 'tags' });

    const children = fields.map(f => {
      if (f.type === 'tags') return tagsField();
      if (f.type === 'textarea') {
        return el('div', { class: 'form-field' , children: [
          el('label', { attrs: { for: `modal-${f.name}` }, text: f.label }),
          el('textarea', {
            id: `modal-${f.name}`,
            name: f.name,
            class: 'input input-textarea',
            rows: f.rows || 4,
            placeholder: f.placeholder || '',
            maxlength: f.maxlength || LIMITS.content,
            required: f.required || false
          })
        ]});
      }
      if (f.type === 'select') {
        return el('div', { class: 'form-field' , children: [
          el('label', { attrs: { for: `modal-${f.name}` }, text: f.label }),
          el('select', {
            id: `modal-${f.name}`,
            name: f.name,
            class: 'input input-select',
            children: f.options.map(o => el('option', { value: o.value, text: o.text, selected: o.value === f.default }))
          })
        ]});
      }
 return el('div', { class: 'form-field' , children: [
        el('label', { attrs: { for: `modal-${f.name}` }, text: f.label }),
        el('input', {
          id: `modal-${f.name}`,
          name: f.name,
          type: f.type,
          class: 'input',
          placeholder: f.placeholder || '',
          maxlength: f.maxlength || LIMITS.title,
          required: f.required || false
        })
      ]});
    });

    render(els.modalBody, frag(children));
  }

  /**
   * 标签组合框：input 自由输入（回车添加）+ datalist 下拉补全（来自 /api/meta/tags，
   * 值为完整层级路径）+ 已选 chip（× 移除）。支持 / 创建子标签（如 Java/并发）。
   */
  function tagsField() {
    const chips = el('div', { class: 'modal-tag-chips' });
    const input = el('input', {
      class: 'input', id: 'modal-tags-input', type: 'text',
      placeholder: '输入后回车添加；用 / 可建子标签（如 Java/并发）',
      attrs: { 'aria-label': '标签', list: 'modalTagSuggestions' },
    });
    const list = el('datalist', { id: 'modalTagSuggestions' });

    const renderChips = () => {
      render(chips, frag(modalTags.map(t => el('span', { class: 'badge badge-tag badge-editable', children: [
        el('span', { text: t }),
        el('button', { class: 'badge-x', text: '×', attrs: { 'aria-label': `移除标签 ${t}` },
                       on: { click: () => { modalTags = modalTags.filter(x => x !== t); renderChips(); } } }),
      ]}))));
    };

    // 候选来自已有标签；补全失败不影响手动输入
    API.tags(state.type).then(({ tags }) => {
      render(list, tags.filter(t => !modalTags.includes(t.tag)).slice(0, 50)
                       .map(t => el('option', { value: t.tag, label: `${t.name || t.tag} · ${t.count} 条` })));
    }).catch(() => {});

    const add = raw => {
      const v = String(raw).trim().replace(/\s*\/\s*/g, '/').replace(/^\/+|\/+$/g, '');
      if (!v) return;
      const segs = v.split('/');
      if (segs.length > 3 || segs.some(s => !s || s.length > 24)) {
        toast('标签每段 1~24 字符、最多 3 层（如 Java/并发）');
        return;
      }
      if (modalTags.includes(v)) { toast('标签已存在'); return; }
      if (modalTags.length >= LIMITS.tags) { toast(`标签最多 ${LIMITS.tags} 个`); return; }
      modalTags.push(v);
      renderChips();
      input.value = '';
    };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); add(input.value); }   // 回车=添加，不提交表单
      if (e.key === 'Escape') input.blur();
    });

    renderChips();
    return el('div', { class: 'form-field', children: [
      el('label', { attrs: { for: 'modal-tags-input' }, text: '标签' }),
      input,
      list,
      chips,
    ]});
  }

  async function handleNewRecord(e) {
    e.preventDefault();
    if (isLoading) return;

    const formData = new FormData(els.newRecordForm);
    const data = {};
    for (const [k, v] of formData.entries()) {
      if (v !== '') data[k] = v;
    }
    if (!data.title) { toast('标题不能为空'); return; }
    if (modalTags.length) data.tags = [...modalTags];

    setLoading(true);
    els.modalSubmit.disabled = true;
    els.modalSubmit.textContent = '创建中…';
    try {
      await API.createRecord(state.type, data);
      modalTags = [];
      closeNewModal();
      await reload();
      toast('创建成功', 'ok');
    } catch (err) {
      console.error('新建失败:', err);
      if (err.code === 'invalid_title') toast('标题需 1~120 字符');
      else if (err.code === 'invalid_due_date') toast('截止日期格式需 yyyy-MM-dd');
      else if (err.code === 'invalid_priority') toast('优先级非法');
      else if (err.code === 'invalid_tags') toast(err.message || '标签不合法：每段 1~24 字符、最多 3 层');
      else toast('创建失败，请重试');
    } finally {
      setLoading(false);
      els.modalSubmit.disabled = false;
      els.modalSubmit.textContent = '创建';
    }
  }

  // ============ Toast（共享件：dom.js import） ============

  // ============ 事件绑定 ============
  els.newRecordForm.addEventListener('submit', handleNewRecord);
  els.newRecordModal.querySelector('.modal-close').addEventListener('click', closeNewModal);
  els.newRecordModal.querySelector('.modal-cancel').addEventListener('click', closeNewModal);
  els.modalBackdrop.addEventListener('click', closeNewModal);
  els.importJsonFile.addEventListener('change', handleImport);
  // ESC 关闭模态框
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && els.newRecordModal.open) closeNewModal(); });

  // ============ 初始化 ============
  async function boot() {
    try {
      const catData = await API.categories();
      CATEGORIES = Array.isArray(catData?.categories) ? catData.categories : [];
      readStateFromURL();
      renderSidebar();
      refreshOverviewCounts();   // 侧栏计数徽标：进入页面即有真实计数（用户故事 27）
      await reload();
    } catch (e) {
      console.error('初始化失败:', e);
      showError(e.isNetwork
        ? '无法连接到本地服务器。请确认 Pouch 服务已启动（运行 server\\start.ps1）。'
        : '初始化失败，请刷新重试');
    }
  }
boot();