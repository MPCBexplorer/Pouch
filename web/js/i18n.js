const bundles = {};
let currentLang = 'zh-CN';

async function loadLang(lang) {
  delete bundles[lang];
  const paths = [`/locales/${lang}.json`, `/web/locales/${lang}.json`];
  for (const path of paths) {
    try {
      console.log(`[i18n] Fetching ${path}...`);
      const res = await fetch(path);
      console.log(`[i18n] ${path} status: ${res.status} ${res.statusText}`);
      if (res.ok) {
        const data = await res.json();
        bundles[lang] = data;
        console.log(`[i18n] Loaded ${lang} from ${path}`, Object.keys(data || {}).length, 'keys:', Object.keys(data || {}));
        return bundles[lang];
      } else {
        console.warn(`[i18n] ${path} returned non-ok status: ${res.status}`);
      }
    } catch (e) {
      console.warn(`[i18n] ${path} fetch error:`, e.message);
    }
  }
  bundles[lang] = {};
  console.warn(`[i18n] Failed to load ${lang} from all paths`);
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
  console.log(`[i18n] Language switched to: ${lang}, bundles keys:`, Object.keys(bundles));
}

export function getLang() {
  return currentLang;
}

export function t(key, params = {}) {
  let value = getNested(bundles[currentLang], key);

  if (typeof value !== 'string' && params.default !== undefined) {
    value = params.default;
  }

  if (typeof value !== 'string' && currentLang !== 'zh-CN') {
    if (!bundles['zh-CN']) {
      return params.default !== undefined ? params.default : key;
    }
    value = getNested(bundles['zh-CN'], key);
  }

  if (typeof value !== 'string') {
    return params.default !== undefined ? params.default : key;
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
