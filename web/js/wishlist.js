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
 * wishlist.js — 心愿单页完整交互（Ticket 04）
 * 依赖：API、shared/currency.js（ES module 导入）
 * 约束：不直接 fetch、不用字符串拼 HTML、只通过 DOM API 构造、错误卡片友好提示
 */
import { API } from '/js/api.js';
import { formatCents, parseYuan } from '/js/shared/currency.js';
import { toast } from '/js/dom.js';
(async function () {
  'use strict';

  // 页面元素引用
  const els = {
    totalWish: document.getElementById('totalWish'),
    spent: document.getElementById('spent'),
    remaining: document.getElementById('remaining'),
    progressCountWrap: document.getElementById('progressCountWrap'),
    progressAmountWrap: document.getElementById('progressAmountWrap'),
    quickAddForm: document.getElementById('quickAddForm'),
    wishName: document.getElementById('wishName'),
    wishAmount: document.getElementById('wishAmount'),
    wishNote: document.getElementById('wishNote'),
    quickAddBtn: document.getElementById('quickAddBtn'),
    wishlistExportBtn: document.getElementById('wishlistExportBtn'),
    wishlistImportBtn: document.getElementById('wishlistImportBtn'),
    wishlistItems: document.getElementById('wishlistItems'),
    wishlistList: document.getElementById('wishlistList'),
    emptyState: document.getElementById('emptyState'),
    wishlistError: document.getElementById('wishlistError'),
    wishlistExportToolbar: document.getElementById('wishlistExportToolbar'),
    wishlistExportPreview: document.getElementById('wishlistExportPreview'),
    wishlistImportJsonFile: document.getElementById('wishlistImportJsonFile'),
  };

  // 状态
  let items = [];
  let isLoading = false;

  // 导出模式状态
  let exportMode = false;
  let previewMode = false;
  let selectedIds = new Set();

  // ---- 工具函数 ----

  function showError(message) {
    els.wishlistError.textContent = message;
    els.wishlistError.hidden = false;
  }

  function hideError() {
    els.wishlistError.hidden = true;
    els.wishlistError.textContent = '';
  }

  function setLoading(loading) {
    isLoading = loading;
    els.quickAddBtn.disabled = loading;
    els.quickAddBtn.textContent = loading ? '添加中…' : '添加';
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  // ============ 导出模式（导出功能） ============

  function enterExportMode() {
    exportMode = true;
    previewMode = false;
    selectedIds.clear();
    els.quickAddBtn.disabled = true;
    els.wishlistExportToolbar.replaceChildren(buildExportToolbar());
    els.wishlistExportToolbar.hidden = false;
    renderItems(items);
  }

  function exitExportMode() {
    exportMode = false;
    previewMode = false;
    selectedIds.clear();
    els.quickAddBtn.disabled = false;
    renderItems(items);
    els.wishlistExportToolbar.replaceChildren();
    els.wishlistExportToolbar.hidden = true;
    els.wishlistExportPreview.hidden = true;
    els.wishlistList.hidden = false;
    els.wishlistExportBtn.disabled = false;
  }

  function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    renderItems(items);
    updateExportCount();
  }

  function selectAll() {
    items.forEach(item => selectedIds.add(item.id));
    renderItems(items);
    updateExportCount();
  }

  function invertSelection() {
    items.forEach(item => {
      if (selectedIds.has(item.id)) selectedIds.delete(item.id);
      else selectedIds.add(item.id);
    });
    renderItems(items);
    updateExportCount();
  }

  function updateExportCount() {
    const countEl = els.wishlistExportToolbar.querySelector('.export-count');
    if (countEl) countEl.textContent = `已选 ${selectedIds.size} 条`;
  }

  function confirmSelection() {
    previewMode = true;
    renderPreview();
  }

  function renderPreview() {
    const selectedItems = items.filter(item => selectedIds.has(item.id));
    els.wishlistItems.replaceChildren();
    els.emptyState.hidden = true;
    els.wishlistExportToolbar.hidden = true;
    els.wishlistExportPreview.hidden = false;
    els.wishlistList.hidden = true;
    els.wishlistExportPreview.replaceChildren();

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

    const preview = createElement('div', { class: 'export-preview' }, [
      createElement('h3', { class: 'export-preview-title' }, [
        `导出预览（共 ${selectedItems.length} 条）`,
        createElement('span', { class: 'export-preview-timestamp' }, [`  导出于 ${dateStr} ${timeStr}`]),
      ]),
      createElement('div', { class: 'export-preview-list' }, selectedItems.map(item =>
        createElement('div', { class: 'export-preview-item' }, [
          createElement('div', { class: 'export-preview-item-row' }, [
            createElement('span', { class: 'export-preview-title-text' }, [item.name]),
            createElement('span', { class: 'export-preview-type' }, [formatCents(item.amountCents)]),
          ]),
          item.note ? createElement('div', { class: 'export-preview-note' }, [`备注：${item.note}`]) : null,
          createElement('div', { class: 'export-preview-status' }, [
            `状态：${item.purchased ? '已购买' : '未购买'}` + (item.purchasedAt ? `，购买于 ${formatDate(item.purchasedAt)}` : ''),
          ]),
        ])
      )),
      createElement('hr', { class: 'export-preview-divider' }),
      createElement('div', { class: 'export-preview-summary' }, [
        createElement('span', { class: 'export-preview-summary-value' }, [formatCents(
          selectedItems.reduce((s, i) => s + i.amountCents, 0)
        )]),
        createElement('span', { class: 'export-preview-summary-value spent' }, [formatCents(
          selectedItems.filter(i => i.purchased).reduce((s, i) => s + i.amountCents, 0)
        )]),
        createElement('span', { class: 'export-preview-summary-value remaining' }, [formatCents(
          selectedItems.filter(i => !i.purchased).reduce((s, i) => s + i.amountCents, 0)
        )]),
      ]),
      createElement('div', { class: 'export-preview-footer' }, [
        createElement('button', { class: 'btn btn-primary', onClick: savePDF }, ['下载 PDF']),
        createElement('button', { class: 'btn btn-ghost', onClick: exportJSON }, ['导出为 JSON']),
        createElement('button', { class: 'btn btn-ghost', onClick: () => { previewMode = false; els.wishlistExportToolbar.hidden = false; els.wishlistList.hidden = false; renderItems(items); } }, ['返回重选']),
        createElement('button', { class: 'btn btn-ghost', onClick: exitExportMode }, ['取消']),
      ]),
    ]);
    els.wishlistExportPreview.appendChild(preview);
  }

  async function exportJSON() {
    try {
      const selectedItems = items.filter(item => selectedIds.has(item.id));
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(selectedItems, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pouch-wishlist-export-${dateStr}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('JSON 导出成功', 'ok');
    } catch (e) {
      console.error('导出失败:', e);
      toast('导出失败：' + (e.message || '未知错误'), 'error');
    }
  }

  /** 从 JSON 文件导入心愿条目。 */
  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const items = JSON.parse(text);
      if (!Array.isArray(items)) throw new Error('JSON 必须是数组');
      // 验证类别：每条心愿条目必须包含 name 与 amountCents
      for (const item of items) {
        if (!item || typeof item.name !== 'string' || item.amountCents === undefined) {
          throw new Error('错误的类别');
        }
      }
      const res = await API.importWishlist(items);
      const n = res?.imported ?? items.length;
      toast(`已导入 ${n} 条`, 'ok');
      els.wishlistImportJsonFile.value = '';
      await loadWishlist();
    } catch (err) {
      els.wishlistImportJsonFile.value = '';
      toast('导入失败：' + (err.message || '未知错误'), 'error');
    }
  }

  /** 生成 PDF 并在新标签页预览，用户可预览后再下载保存。预览即所得。 */
  async function savePDF() {
    try {
      const previewEl = els.wishlistExportPreview;
      if (!previewEl) {
        throw new Error('找不到导出预览区域 #wishlistExportPreview');
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

      // 直接把整个 #wishlistExportPreview 区域绘制为图片，再写入 PDF，实现“预览即所得”
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
      const slicePxHeight = contentHeight / scale;
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

        const imgWidth = contentWidth;
        const imgHeight = sliceHeight * scale;
        doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, imgHeight);
        top = bottom;
      }

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const fileName = `pouch-wishlist-export-${dateStr}.pdf`;

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
      toast('PDF 生成失败：' + (e.message || '未知错误'), 'error');
    }
  }

  function buildExportToolbar() {
    return createElement('div', { class: 'export-toolbar' }, [
      createElement('div', { class: 'export-toolbar-left' }, [
        createElement('span', { class: 'export-count' }, [`已选 ${selectedIds.size} 条`]),
      ]),
      createElement('div', { class: 'export-toolbar-right' }, [
        createElement('button', { class: 'btn btn-ghost', onClick: () => { selectAll(); renderItems(items); } }, ['全选']),
        createElement('button', { class: 'btn btn-ghost', onClick: () => { invertSelection(); renderItems(items); } }, ['反选']),
        createElement('button', { class: 'btn btn-primary', onClick: confirmSelection }, ['确定']),
        createElement('button', { class: 'btn btn-ghost', onClick: exitExportMode }, ['取消']),
      ]),
    ]);
  }


  function createElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => el.dataset[dk] = dv);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') el[k] = v;   // checked/disabled 等布尔属性必须走属性对象：
                                                   // setAttribute('checked','false') 在浏览器里依然为真
      else el.setAttribute(k, v);
    });
    children.forEach(c => {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c instanceof Node) el.appendChild(c);
    });
    return el;
  }

  // ---- 渲染 ----

  function renderSummary(summary) {
    els.totalWish.textContent = formatCents(summary.totalWishCents);
    els.spent.textContent = formatCents(summary.spentCents);
    els.remaining.textContent = formatCents(summary.remainingCents);

    // 进度一：按数量（已购条目数 / 总条目数）
    const itemCount = summary.itemCount || 0;
    const countPct = itemCount > 0
      ? Math.round(((summary.purchasedCount || 0) / itemCount) * 100) : 0;
    renderProgress(els.progressCountWrap, countPct, itemCount > 0);

    // 进度二：按金额（已花费 / 总心愿，原有进度条）
    const amountPct = summary.totalWishCents > 0
      ? Math.round((summary.spentCents / summary.totalWishCents) * 100) : 0;
    renderProgress(els.progressAmountWrap, amountPct, summary.totalWishCents > 0);
  }

  /** 渲染一条进度条：pct 0~100；visible=false 时隐藏整条（分母为 0 不显示空条）。 */
  function renderProgress(wrap, pct, visible) {
    wrap.hidden = !visible;
    wrap.querySelector('.progress-fill').style.width = pct + '%';
    // role=progressbar 在 .progress-bar 上，aria-valuenow 必须设在它身上
    wrap.querySelector('.progress-bar').setAttribute('aria-valuenow', String(pct));
    wrap.querySelector('.progress-text').textContent = pct + '%';
  }

  function renderItems(list) {
    items = list;
    els.wishlistItems.replaceChildren();

    if (!list.length) {
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;

    list.forEach((item, idx) => {
      const isSelected = selectedIds.has(item.id);
      const li = createElement('li', { class: 'wishlist-item' + (exportMode ? ' export-mode' : ''), dataset: { id: item.id } });

      // 导出选择复选框（仅在导出模式下显示）
      const exportCheckbox = exportMode
        ? createElement('label', { class: 'export-checkbox-label' }, [
          createElement('input', {
            type: 'checkbox',
            class: 'export-checkbox',
            checked: isSelected,
            onChange: () => toggleSelect(item.id)
          })
        ])
        : null;

      const nameEl = createElement('span', { class: 'wish-name' }, [item.name]);
      if (item.purchased) nameEl.classList.add('purchased');

      const amountEl = createElement('span', { class: 'wish-amount' }, [formatCents(item.amountCents)]);
      if (item.purchased) amountEl.classList.add('purchased');

      const noteEl = item.note ? createElement('span', { class: 'wish-note' }, [item.note]) : null;

      const purchasedAtEl = item.purchasedAt
        ? createElement('span', { class: 'wish-purchased-at' }, ['✓ ' + formatDate(item.purchasedAt)])
        : null;

      const actions = createElement('div', { class: 'wish-actions' }, []);

      // ↑ 按钮
      const upBtn = createElement('button', {
        class: 'btn-icon',
        'aria-label': '上移',
        title: '上移',
        disabled: idx === 0,
        onClick: () => moveItem(idx, -1)
      }, [createElement('span', { class: 'icon-up' }, ['↑'])]);

      // ↓ 按钮
      const downBtn = createElement('button', {
        class: 'btn-icon',
        'aria-label': '下移',
        title: '下移',
        disabled: idx === list.length - 1,
        onClick: () => moveItem(idx, 1)
      }, [createElement('span', { class: 'icon-down' }, ['↓'])]);

      // 删除按钮
      const delBtn = createElement('button', {
        class: 'btn-icon btn-danger',
        'aria-label': '删除',
        title: '删除',
        onClick: () => confirmDelete(item)
      }, [createElement('span', { class: 'icon-del' }, ['🗑'])]);

      // 购买状态复选框
      const checkbox = createElement('input', {
        type: 'checkbox',
        class: 'wish-checkbox',
        checked: item.purchased,
        'aria-label': item.purchased ? '标记为未购买' : '标记为已购买',
        onChange: () => togglePurchased(item, checkbox)
      });

      const checkboxLabel = createElement('label', { class: 'checkbox-label' }, [checkbox]);

      actions.append(upBtn, downBtn, delBtn);

      const rowChildren = exportMode ? [exportCheckbox, checkboxLabel, nameEl, purchasedAtEl, amountEl, actions]
        : [checkboxLabel, nameEl, purchasedAtEl, amountEl, actions];

      const row = createElement('div', { class: 'wish-row' }, rowChildren);

      // 备注留在第二行；购买日期已在行内（金额左侧）
      if (noteEl) {
        li.append(row, createElement('div', { class: 'wish-meta' }, [noteEl]));
      } else {
        li.append(row);
      }

      els.wishlistItems.append(li);
    });
  }

  // ---- 交互 ----

  async function loadWishlist() {
    hideError();
    try {
      const data = await API.getWishlist();
      renderSummary(data.summary);
      renderItems(data.items || []);
    } catch (err) {
      console.error('加载心愿单失败:', err);
      showError('无法连接到本地服务器，请检查后端是否启动');
      els.emptyState.hidden = true;
      renderItems([]);
      renderSummary({ totalWishCents: 0, spentCents: 0, remainingCents: 0 });
    }
  }

  async function togglePurchased(item, checkbox) {
    const originalChecked = item.purchased;
    checkbox.disabled = true;
    try {
      const res = await API.updateWish(item.id, { purchased: !item.purchased });
      // 更新本地状态
      const updated = res.item;
      item.purchased = updated.purchased;
      item.purchasedAt = updated.purchasedAt;
      item.updatedAt = updated.updatedAt;
      // 重新渲染汇总和列表
      renderSummary(res.summary);
      renderItems(items);
    } catch (err) {
      console.error('切换已购失败:', err);
      checkbox.checked = originalChecked;
      showError(err.code === 'wish_not_found' ? '条目已不存在，请刷新重试' : '操作失败，请重试');
    } finally {
      checkbox.disabled = false;
    }
  }

  async function moveItem(index, direction) {
    if (isLoading) return;
    const item = items[index];
    const target = items[index + direction];
    if (!item || !target) return;

    // 交换 sortIndex
    const itemSort = item.sortIndex;
    const targetSort = target.sortIndex;

    setLoading(true);
    try {
      // 两次独立 PATCH 交换 sortIndex
      await API.updateWish(item.id, { sortIndex: targetSort });
      await API.updateWish(target.id, { sortIndex: itemSort });
      // 成功后重新加载（保证服务端真实状态）
      await loadWishlist();
    } catch (err) {
      console.error('排序失败:', err);
      showError('排序失败，已恢复原顺序');
      await loadWishlist();
    } finally {
      setLoading(false);
    }
  }

  function confirmDelete(item) {
    const confirmed = confirm(
      `确定删除「${item.name}」吗？\n\n` +
      `删除后可从 data/.backup/ 恢复。`
    );
    if (confirmed) deleteItem(item);
  }

  async function deleteItem(item) {
    setLoading(true);
    try {
      const res = await API.deleteWish(item.id);
      renderSummary(res.summary);
      await loadWishlist();
    } catch (err) {
      console.error('删除失败:', err);
      showError('删除失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickAdd(e) {
    e.preventDefault();
    if (isLoading) return;

    const name = els.wishName.value.trim();
    const amountStr = els.wishAmount.value.trim();
    const note = els.wishNote.value.trim();

    if (!name) {
      els.wishName.focus();
      return;
    }
    const amountCents = parseYuan(amountStr);
    if (amountCents === null || amountCents <= 0) {
      els.wishAmount.focus();
      showError('请输入有效金额（如 2388 或 19.99）');
      return;
    }

    setLoading(true);
    hideError();
    try {
      await API.createWish({ name, amountCents, note });
      els.wishName.value = '';
      els.wishAmount.value = '';
      els.wishNote.value = '';
      els.wishName.focus();
      await loadWishlist();
    } catch (err) {
      console.error('新增失败:', err);
      if (err.code === 'invalid_amount') {
        showError('金额无效：必须为整数分，且不超过 1,000,000.00 元');
      } else if (err.code === 'invalid_wish_name') {
        showError('名称需 1~120 字符');
      } else if (err.code === 'invalid_wish_note') {
        showError('备注需 500 字符以内');
      } else {
        showError('新增失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  }

  // ---- 初始化 ----

  els.quickAddForm.addEventListener('submit', handleQuickAdd);
  els.wishlistImportJsonFile.addEventListener('change', handleImport);

  // 回车在金额框也提交
  els.wishAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleQuickAdd(e);
  });

  // 导出按钮
  els.wishlistExportBtn.addEventListener('click', () => {
    els.wishlistExportBtn.disabled = true;
    enterExportMode();
    els.wishlistExportToolbar.hidden = false;
    renderItems(items);
  });

  // 导入按钮（在导出按钮旁）
  els.wishlistImportBtn.addEventListener('click', () => {
    els.wishlistImportJsonFile.click();
  });

  // 初始加载
  await loadWishlist();
})();