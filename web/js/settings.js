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
 * settings.js — 设置页（数据位置、存储体积、备份管理）
 * 所有后端交互走 api.js，不直接 fetch。
 */
import { API } from '/js/api.js';
import { el, render, frag, toast, errorCard } from '/js/dom.js';

console.log('[settings.js] Module loaded');
console.log('[settings.js] DOM elements found:', {
  dataDir: !!document.getElementById('dataDir'),
  dataSize: !!document.getElementById('dataSize'),
  backupSize: !!document.getElementById('backupSize'),
  totalSize: !!document.getElementById('totalSize'),
  openFolderBtn: !!document.getElementById('openFolderBtn'),
  errorCard: !!document.getElementById('settingsError'),
});

const els = {
  dataDir: document.getElementById('dataDir'),
  dataSize: document.getElementById('dataSize'),
  backupSize: document.getElementById('backupSize'),
  totalSize: document.getElementById('totalSize'),
  openFolderBtn: document.getElementById('openFolderBtn'),
  refreshSizeBtn: document.getElementById('refreshSizeBtn'),
  clearBackupsBtn: document.getElementById('clearBackupsBtn'),
  cancelClearBtn: document.getElementById('cancelClearBtn'),
  confirmClearBtn: document.getElementById('confirmClearBtn'),
  clearConfirm: document.getElementById('clearConfirm'),
  errorCard: document.getElementById('settingsError'),
  // 版本检查
  checkUpdateBtn: document.getElementById('checkUpdateBtn'),
  currentVersionEl: document.getElementById('currentVersion'),
  latestVersionEl: document.getElementById('latestVersion'),
  latestPreVersionEl: document.getElementById('latestPreVersion'),
  updateResult: document.getElementById('updateResult'),
};

/** 字节数 → 人类可读（KB / MB / GB，保留 1 位小数）。 */
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const v = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${v} ${sizes[i]}`;
}

async function loadStorageInfo() {
  try {
    const info = await API.getStorageInfo();
    els.dataDir.textContent = info.dataDir || '';
    els.dataSize.textContent = formatBytes(info.dataSize);
    els.backupSize.textContent = formatBytes(info.backupSize);
    const total = (info.dataSize || 0) + (info.backupSize || 0);
    els.totalSize.textContent = formatBytes(total);
    els.errorCard.hidden = true;
  } catch (e) {
    els.errorCard.hidden = false;
    render(els.errorCard, errorCard('读取存储信息失败', e));
  }
}

async function handleOpenFolder() {
  try {
    await API.openDataFolder();
    toast('已在资源管理器中打开数据目录', 'ok');
  } catch (e) {
    toast(e?.message || '打开文件夹失败', 'error');
  }
}

async function handleClearBackups() {
  els.clearConfirm.hidden = false;
}

async function cancelClear() {
  els.clearConfirm.hidden = true;
}

async function confirmClear() {
  try {
    const result = await API.clearBackups();
    els.clearConfirm.hidden = true;
    toast(`已清除 ${result.cleared || 0} 个备份文件，释放 ${formatBytes(result.freedBytes || 0)}`, 'ok');
    await loadStorageInfo();
  } catch (e) {
    els.clearConfirm.hidden = true;
    toast(e?.message || '清除备份失败', 'error');
  }
}

/** 当前版本（与 build.ps1 -Version 保持一致，构建时可替换）。 */
const CURRENT_VERSION = '1.3.0+beta';

/** 检查版本更新（同时检测稳定版与预览版）。 */
async function checkUpdate() {
  els.checkUpdateBtn.disabled = true;
  els.checkUpdateBtn.textContent = '';
  els.checkUpdateBtn.insertAdjacentHTML('afterbegin', '<span class="spinner"></span>检查中…');
  els.updateResult.textContent = '';
  els.updateResult.className = 'update-result';

  try {
    const info = await API.checkVersion();
    if (!info.stable?.version) {
      throw new Error('版本信息无效');
    }

    // 显示稳定版
    els.latestVersionEl.textContent = info.stable.version;
    // 显示预览版（如有）
    if (info.prerelease) {
      els.latestPreVersionEl.textContent = info.prerelease.version;
    } else {
      els.latestPreVersionEl.textContent = '暂无';
    }

    // 比较当前版本与稳定版/预览版
    const stableNewer = info.stable.version !== CURRENT_VERSION;
    const preNewer = info.prerelease && info.prerelease.version !== CURRENT_VERSION;

    if (!stableNewer && !preNewer) {
      els.updateResult.textContent = '已是最新版本';
      els.updateResult.className = 'update-result update-ok';
      toast('已是最新版本', 'ok');
    } else {
      const lines = [];
      if (stableNewer) {
        lines.push(`发现新稳定版 ${info.stable.version}，`);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-download';
        btn.textContent = '下载稳定版';
        btn.onclick = () => { window.open(info.stable.downloadUrl, '_blank'); };
        els.updateResult.appendChild(btn);
        lines.push(' ');
      }
      if (preNewer) {
        lines.push(`发现新预览版 ${info.prerelease.version}，`);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-download';
        btn.textContent = '下载预览版';
        btn.onclick = () => { window.open(info.prerelease.downloadUrl, '_blank'); };
        els.updateResult.appendChild(btn);
      }
      els.updateResult.textContent = lines.join('');
      els.updateResult.className = 'update-result update-available';
      toast('发现新版本', 'ok');
    }
  } catch (e) {
    els.latestVersionEl.textContent = '检测失败';
    els.latestPreVersionEl.textContent = '检测失败';
    els.updateResult.textContent = e.message || '无法获取最新版本信息，请稍后再试';
    els.updateResult.className = 'update-result update-error';
    toast('检查更新失败', 'error');
  } finally {
    els.checkUpdateBtn.disabled = false;
    els.checkUpdateBtn.textContent = '重试';
  }
}

function init() {
  console.log('[settings.js] init() 开始');
  console.log('[settings.js] DOM 元素状态:', {
    draftTitle: !!els.currentVersionEl,
  });

  // 初始化版本显示
  if (els.currentVersionEl) {
    els.currentVersionEl.textContent = CURRENT_VERSION;
  }

  // 绑定按钮事件
  els.openFolderBtn.onclick = handleOpenFolder;
  els.refreshSizeBtn.onclick = loadStorageInfo;
  els.clearBackupsBtn.onclick = handleClearBackups;
  els.cancelClearBtn.onclick = cancelClear;
  els.confirmClearBtn.onclick = confirmClear;
  els.checkUpdateBtn.onclick = checkUpdate;

  // 首次加载即获取存储信息
  console.log('[settings.js] 调用 loadStorageInfo()...');
  loadStorageInfo();
  console.log('[settings.js] loadStorageInfo() 已调用');

  // 首次加载即自动检查版本更新
  checkUpdate();
}

init();




