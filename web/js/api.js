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
 * api.js — 唯一发起 fetch 的模块（用户故事 64 / docs/04 §4.3）
 * 所有页面脚本通过此模块与后端通信，不直接拼 URL、不直接 fetch。
 *
 * 双轨暴露：
 *   - ES module：`import { API } from '/js/api.js';`（list.js / detail.js）
 *   - 全局变量：window.API（经典脚本 / 非模块页面使用）
 */
/**
 * 客户端侧边界常量：与后端 RecordService 的校验保持一致（docs/01 §1.9）。
 * 收敛到此一份（Ticket 07），页面只 import 使用——后端才是强制执行方，
 * 这里只用于 maxlength 与提交前提示。改边界时同步后端一处。
 */
const LIMITS = {
  title: 120,
  content: 100_000,
  note: 5_000,
  tags: 20,
  tagName: 24,
  source: 200,
  wishName: 120,
  wishNote: 500,
};

const API = (function () {
  'use strict';

  const BASE = '';

  /** 网络层失败（服务未启动/断连）时抛出的错误，与业务错误区分处理。 */
  function networkError() {
    const err = new Error('无法连接到本地服务器。请确认 Pouch 服务已启动（运行 server\\start.ps1）。');
    err.code = 'network_error';
    err.status = 0;
    err.isNetwork = true;
    return err;
  }

  /** 构造查询串，跳过 null/undefined/空串（空串会被后端当成真实筛选值，见 03 §3.0）。 */
  function qs(params) {
    if (!params) return '';
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined || v === '') continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    return s ? '?' + s : '';
  }

  async function request(path, options = {}) {
    const url = BASE + path;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ...options.headers
    };
    const body = options.body ? JSON.stringify(options.body) : undefined;
    let res;
    try {
      res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body,
        credentials: 'omit'
      });
    } catch (e) {
      throw networkError();   // fetch 只在网络层失败时抛（服务未启动、连接被拒）
    }
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
    return request('/api/records' + qs(params));
  }
  /** 列表页契约：type 单独传，筛选条件在 params（docs/04 §4.7 / docs/03 §3.1）。 */
  async function listRecords(type, params) {
    return request('/api/records' + qs({ ...params, type }));
  }
  async function getRecord(id) {
    return request(`/api/records/${encodeURIComponent(id)}`);
  }
  async function createRecord(type, body) {
    return request('/api/records' + qs({ type }), { method: 'POST', body });
  }
  async function updateRecord(id, body, type) {
    return request(`/api/records/${encodeURIComponent(id)}${qs({ type })}`, { method: 'PATCH', body });
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
    return request('/api/meta/tags' + qs({ type }));
  }

  // Stats
  async function getOverview() {
    return request('/api/stats/overview');
  }
  /** 随机回顾：excludeIds 为本轮已看（docs/03 §3.10 签名）。 */
  async function getRandom(type, excludeIds) {
    return request('/api/stats/random' + qs({
      type,
      exclude: excludeIds && excludeIds.length ? excludeIds.join(',') : undefined
    }));
  }
  async function getStale(limit) {
    return request('/api/stats/stale' + qs({ limit: limit === undefined ? undefined : String(limit) }));
  }

  // Health
  async function getHealth() {
    return request('/api/health');
  }

  // Storage
  async function getStorageInfo() {
    return request('/api/storage/info');
  }
  async function openDataFolder() {
    return request('/api/storage/open-folder', { method: 'POST' });
  }
  async function clearBackups() {
    return request('/api/storage/clear-backups', { method: 'POST' });
  }

  // Version check (GitHub API, no auth needed for public repos)
  async function checkVersion() {
    // 获取最新稳定版
    const stableRes = await fetch('https://api.github.com/repos/MPCBexplorer/Pouch/releases/latest', {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!stableRes.ok) throw new Error(`GitHub API ${stableRes.status}`);
    const stableData = await stableRes.json();

    // 获取所有 release，找最新预览版
    const allRes = await fetch('https://api.github.com/repos/MPCBexplorer/Pouch/releases', {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!allRes.ok) throw new Error(`GitHub API ${allRes.status}`);
    const allData = await allRes.json();
    const prerelease = allData.find(r => r.prerelease === true);

    return {
      stable: {
        version: stableData.tag_name.replace(/^v/, ''),
        downloadUrl: stableData.html_url,
        body: stableData.body || '',
        publishedAt: stableData.published_at,
      },
      prerelease: prerelease ? {
        version: prerelease.tag_name.replace(/^v/, ''),
        downloadUrl: prerelease.html_url,
        body: prerelease.body || '',
        publishedAt: prerelease.published_at,
      } : null,
    };
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
    // Stats
    getOverview,
    getRandom,
    getStale,
    // Health
    getHealth,
    // Storage
    getStorageInfo,
    openDataFolder,
    clearBackups,
    // Version
    checkVersion,
    // ---- docs/03 §3.10 函数名别名（ES module 页面直接用这些名字）----
    categories: getCategories,
    tags: getTags,
    listRecords,
    statsOverview: getOverview,
    random: getRandom,
    stale: getStale,
    health: getHealth,
  };
})();

// 经典脚本（非 module）也能拿到全局引用
if (typeof window !== 'undefined') {
  window.API = API;
}

// ES module 导出（list.js / detail.js 走这条）
export { API, LIMITS };
