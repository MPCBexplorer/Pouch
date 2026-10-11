/**
 * wishlist.js — 心愿单页完整交互（Ticket 04）
 * 依赖：API、shared/currency.js（ES module 导入）
 * 约束：不直接 fetch、不用字符串拼 HTML、只通过 DOM API 构造、错误卡片友好提示
 */
import { API } from '/js/api.js';
import { formatCents, parseYuan } from '/js/shared/currency.js';
(async function () {
  'use strict';

  // 页面元素引用
  const els = {
    totalWish: document.getElementById('totalWish'),
    spent: document.getElementById('spent'),
    remaining: document.getElementById('remaining'),
    progressWrap: document.getElementById('progressWrap'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    quickAddForm: document.getElementById('quickAddForm'),
    wishName: document.getElementById('wishName'),
    wishAmount: document.getElementById('wishAmount'),
    wishNote: document.getElementById('wishNote'),
    quickAddBtn: document.getElementById('quickAddBtn'),
    wishlistItems: document.getElementById('wishlistItems'),
    emptyState: document.getElementById('emptyState'),
    wishlistError: document.getElementById('wishlistError')
  };

  // 状态
  let items = [];
  let isLoading = false;

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

  function createElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => el.dataset[dk] = dv);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
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

    if (summary.totalWishCents > 0) {
      els.progressWrap.hidden = false;
      const pct = Math.round((summary.spentCents / summary.totalWishCents) * 100);
      els.progressFill.style.width = pct + '%';
      els.progressFill.setAttribute('aria-valuenow', String(pct));
      els.progressText.textContent = pct + '%';
    } else {
      els.progressWrap.hidden = true;
    }
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
      const li = createElement('li', { class: 'wishlist-item', dataset: { id: item.id } });

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

      // 复选框
      const checkbox = createElement('input', {
        type: 'checkbox',
        class: 'wish-checkbox',
        checked: item.purchased,
        'aria-label': item.purchased ? '标记为未购买' : '标记为已购买',
        onChange: () => togglePurchased(item, checkbox)
      });

      const checkboxLabel = createElement('label', { class: 'checkbox-label' }, [checkbox, ' 已购']);

      actions.append(upBtn, downBtn, delBtn);

      const row = createElement('div', { class: 'wish-row' }, [
        checkboxLabel,
        nameEl,
        amountEl,
        actions
      ]);

      if (noteEl || purchasedAtEl) {
        const meta = createElement('div', { class: 'wish-meta' }, []);
        if (noteEl) meta.append(noteEl);
        if (purchasedAtEl) meta.append(purchasedAtEl);
        li.append(row, meta);
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
      } else {
        showError('新增失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  }

  // ---- 初始化 ----

  els.quickAddForm.addEventListener('submit', handleQuickAdd);

  // 回车在金额框也提交
  els.wishAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleQuickAdd(e);
  });

  // 初始加载
  await loadWishlist();
})();