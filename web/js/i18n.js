const bundles = {};
let currentLang = 'zh-CN';

async function loadLang(lang) {
  if (bundles[lang]) return bundles[lang];
  try {
    const res = await fetch(`/locales/${lang}.json`);
    bundles[lang] = res.ok ? await res.json() : {};
  } catch (e) {
    bundles[lang] = {};
  }
  return bundles[lang];
}

function getNested(obj, path) {
  return path.split('.').reduce(
    (o, k) => (o && typeof o === 'object' ? o[k] : undefined),
    obj
  );
}

export async function setLang(lang) {
  await loadLang(lang);
  if (lang !== 'zh-CN') {
    await loadLang('zh-CN');
  }
  currentLang = lang;
  localStorage.setItem('pouch.lang', lang);
}

export function getLang() {
  return currentLang;
}

export async function t(key, params = {}) {
  let value = getNested(bundles[currentLang], key);

  if (typeof value !== 'string' && currentLang !== 'zh-CN') {
    if (!bundles['zh-CN']) {
      await loadLang('zh-CN');
    }
    value = getNested(bundles['zh-CN'], key);
  }

  if (typeof value !== 'string') {
    return key;
  }

  return value.replace(/\{\{(\w+)\}\}/g, (_, p) =>
    params[p] !== undefined ? String(params[p]) : `{{${p}}}`
  );
}

export async function initLang() {
  const stored = localStorage.getItem('pouch.lang');
  if (stored === 'zh-CN' || stored === 'en-US') {
    currentLang = stored;
  } else if (navigator.language && navigator.language.startsWith('zh')) {
    currentLang = 'zh-CN';
  } else {
    currentLang = 'en-US';
  }

  await loadLang(currentLang);

  if (currentLang !== 'zh-CN') {
    await loadLang('zh-CN');
  }
}
