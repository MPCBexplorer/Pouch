/**
 * api.js — 唯一发起 fetch 的模块（用户故事 64）
 * 所有页面脚本通过此模块与后端通信，不直接拼 URL、不直接 fetch。
 */
const API = (function () {
  'use strict';

  const BASE = '';

  async function request(path, options = {}) {
    const url = BASE + path;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ...options.headers
    };
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body,
      credentials: 'omit'
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error?.message || `HTTP ${res.status}`);
      err.code = data.error?.code;
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // Wishlist
  async function getWishlist() {
    return request('/api/wishlist');
  }
  async function getWish(id) {
    return request(`/api/wishlist/${encodeURIComponent(id)}`);
  }
  async function createWish(item) {
    return request('/api/wishlist', { method: 'POST', body: item });
  }
  async function updateWish(id, patch) {
    return request(`/api/wishlist/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  }
  async function deleteWish(id) {
    return request(`/api/wishlist/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // Records
  async function getRecords(params) {
    const q = new URLSearchParams(params).toString();
    return request('/api/records' + (q ? '?' + q : ''));
  }
  async function getRecord(id) {
    return request(`/api/records/${encodeURIComponent(id)}`);
  }
  async function createRecord(type, body) {
    return request('/api/records?type=' + encodeURIComponent(type), { method: 'POST', body });
  }
  async function updateRecord(id, body, type) {
    const q = type ? '?type=' + encodeURIComponent(type) : '';
    return request(`/api/records/${encodeURIComponent(id)}${q}`, { method: 'PATCH', body });
  }
  async function deleteRecord(id) {
    return request(`/api/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async function appendNote(id, content) {
    return request(`/api/records/${encodeURIComponent(id)}/notes`, { method: 'POST', body: { content } });
  }
  async function editNote(id, noteId, content) {
    return request(`/api/records/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { method: 'PATCH', body: { content } });
  }
  async function deleteNote(id, noteId) {
    return request(`/api/records/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
  }

  // Meta
  async function getCategories() {
    return request('/api/meta/categories');
  }
  async function getTags(type) {
    const q = type ? '?type=' + encodeURIComponent(type) : '';
    return request('/api/meta/tags' + q);
  }
  async function getSubjects() {
    return request('/api/meta/subjects');
  }

  // Stats
  async function getOverview() {
    return request('/api/stats/overview');
  }
  async function getRandom(type, count, exclude) {
    const q = new URLSearchParams({ type, count: String(count) });
    if (exclude && exclude.length) q.set('exclude', exclude.join(','));
    return request('/api/stats/random?' + q.toString());
  }
  async function getStale(limit) {
    return request('/api/stats/stale?limit=' + encodeURIComponent(limit));
  }

  // Health
  async function getHealth() {
    return request('/api/health');
  }

  return {
    // Wishlist
    getWishlist,
    getWish,
    createWish,
    updateWish,
    deleteWish,
    // Records
    getRecords,
    getRecord,
    createRecord,
    updateRecord,
    deleteRecord,
    appendNote,
    editNote,
    deleteNote,
    // Meta
    getCategories,
    getTags,
    getSubjects,
    // Stats
    getOverview,
    getRandom,
    getStale,
    // Health
    getHealth
  };
})();

// ES module 导出兼容
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}