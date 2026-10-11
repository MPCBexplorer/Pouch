/* ============================================================
   dom.js —— DOM 构造与格式化工具
   ============================================================ */

/**
 * 创建元素。
 * @param {string} tag
 * @param {object} [props]  class/attrs/on/style/text/children
 * @returns {HTMLElement}
 *
 * 用法：
 *   el('button', { class:'btn', text:'保存', on:{ click: save } })
 *   el('div', { class:'card', children:[ el('h3',{text:'标题'}), el('p',{text:'正文'}) ] })
 */
export function el(tag, props = {}) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    switch (k) {
      case 'class':
        // 支持 'a b c' 字符串或 ['a','b'] 数组，自动过滤假值
        node.className = (Array.isArray(v) ? v : String(v).split(/\s+/))
                           .filter(Boolean).join(' ');
        break;
      case 'text':    node.textContent = String(v); break;   // ★ 文本一律 textContent
      case 'html':    node.innerHTML = v; break;              // 仅限已净化的内容，见 §4.9
      case 'style':   Object.assign(node.style, v); break;
      case 'on':      for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn); break;
      case 'attrs':   for (const [a, val] of Object.entries(v)) {
                        if (val !== null && val !== undefined) node.setAttribute(a, val);
                      } break;
      case 'children': (Array.isArray(v) ? v : [v]).filter(Boolean)
                        .forEach(c => node.append(c)); break;
      default:        node[k] = v;   // value / checked / disabled / href 等直接属性
    }
  }
  return node;
}

/** 批量创建后一次性插入，避免多次重排。 */
export function frag(children) {
  const f = document.createDocumentFragment();
  children.filter(Boolean).forEach(c => f.append(c));
  return f;
}

/** 清空容器后填入新内容。 */
export function render(container, children) {
  container.replaceChildren(...(Array.isArray(children) ? children : [children]));
}

/** 防抖。搜索框输入用（见 §4.6）。 */
export function debounce(fn, wait = 250) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ============ 格式化 ============

/** 金额：分 → 元字符串，千分位，两位小数。见 01 §1.5.2。 */
export function yuan(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 元 → 分。用 Math.round 规避 19.99*100=1998.9999… */
export function toCents(yuanStr) {
  const n = parseFloat(String(yuanStr).replace(/[,，\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * 相对时间：「刚刚」「5 分钟前」「3 天前」「2026-09-28」。
 * 超过 30 天回落到绝对日期——太久远的事情说"3 个月前"没有信息量。
 */
export function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = 60_000, hour = 60 * min, day = 24 * hour;

  if (diff < min)        return '刚刚';
  if (diff < hour)       return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day)        return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day)    return `${Math.floor(diff / day)} 天前`;
  if (diff < 30 * day)   return `${Math.floor(diff / (7 * day))} 周前`;
  return iso.slice(0, 10);   // ISO 串前 10 位即 yyyy-MM-dd
}

/** 完整时间：2026-10-02 14:23。用于 title 提示与详情页元信息。 */
export function fullTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 摘要：Markdown 源码 → 纯文本前两行，用于列表项。 */
export function excerpt(md, maxLen = 120) {
  if (!md) return '';
  const plain = String(md)
    .replace(/```[\s\S]*?```/g, ' ')      // 代码块整段去掉
    .replace(/`([^`]*)`/g, '$1')          // 行内代码保留内容
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片整个去掉
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')   // 标题标记
    .replace(/^\s{0,3}>\s?/gm, '')        // 引用标记
    .replace(/^\s{0,3}[-*+]\s+/gm, '')    // 无序列表标记
    .replace(/^\s{0,3}\d+\.\s+/gm, '')    // 有序列表标记
    .replace(/[*_~]{1,3}/g, '')           // 强调标记
    .replace(/\$\$?[\s\S]*?\$\$?/g, ' ')  // 数学公式（本项目不渲染，去掉避免乱码）
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

/** 学科路径拆分：'数学/线性代数' → ['数学','线性代数'] */
export function subjectParts(path) {
  return path ? String(path).split('/').filter(Boolean) : [];
}