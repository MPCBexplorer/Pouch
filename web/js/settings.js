/**
 * settings.js — 设置页（数据位置、存储体积、备份管理）
 * 所有后端交互走 api.js，不直接 fetch。
 */
import { API } from '/js/api.js';
import { el, render, frag, toast, errorCard } from '/js/dom.js';

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

function init() {
  els.openFolderBtn.onclick = handleOpenFolder;
  els.refreshSizeBtn.onclick = loadStorageInfo;
  els.clearBackupsBtn.onclick = handleClearBackups;
  els.cancelClearBtn.onclick = cancelClear;
  els.confirmClearBtn.onclick = confirmClear;

  loadStorageInfo();
}

init();
