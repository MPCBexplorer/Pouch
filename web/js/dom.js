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
      case 'children': (Array.isArray(v) ? v : [v])
                         .flat(Infinity)        // 摊平嵌套 map() 结果——浏览器 append(数组) 会把它转成 "[object Object]" 文本
                         .filter(Boolean)
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

/**
 * 状态文案：一律取自 /api/meta/categories 的 statuses（用户故事 62），
 * 不硬编码——服务端改枚举/文案，前端自动跟随。未知状态原样返回。
 * @param {object} cat - 元数据里的类别对象（含 statuses: [{value,label}]）
 * @param {string} status - 状态值
 */
export function statusLabel(cat, status) {
  if (!cat || !Array.isArray(cat.statuses)) return status;
  const found = cat.statuses.find(s => s.value === status);
  return found ? found.label : status;
}

/**
 * 轻提示（toast）。三封顶、3s 自动消失。
 * 原先 list.js / detail.js 各有一份逐字相同的实现，收敛到此（Ticket 07）。
 */
export function toast(message, kind = 'error') {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = el('div', { id: 'toastHost', class: 'toast-host', attrs: { role: 'status', 'aria-live': 'polite' } });
    document.body.append(host);
  }
  if (host.children.length >= 3) host.firstElementChild.remove();
  const t = el('div', { class: ['toast', `toast-${kind}`], text: message });
  host.append(t);
  requestAnimationFrame(() => t.classList.add('is-visible'));
  setTimeout(() => {
    t.classList.remove('is-visible');
    setTimeout(() => t.remove(), 250);
  }, 3000);
}

/**
 * 数据告警横幅（/api/health 的 warnings）。detail.js / index.js 共用（Ticket 08 收敛）。
 * 数据文件损坏并从备份恢复时必须让用户知道——静默恢复等于隐瞒数据丢失（docs/04 §4.8.6）。
 */
export function renderWarnings(host, warnings) {
  if (!warnings.length) { render(host, []); return; }
  render(host, el('div', { class: 'warn-banner', attrs: { role: 'alert' }, children: [
    el('div', { class: 'warn-body', children: [
      el('strong', { text: '数据告警' }),
      el('ul', { children: warnings.map(w => el('li', { text: w })) }),
      el('p', { class: 'warn-hint',
                text: '损坏的原文件已保留为 .corrupt，备份在 data/.backup/ 目录。详情见 docs/05 §5.6。' }),
    ]}),
    el('button', { class: 'link-btn', text: '知道了', on: { click: () => render(host, []) } }),
  ]}));
}

/**
 * 友好错误卡（区块级）。网络失败时附启动提示（spec 用户故事 66）。
 * @param {string} title 区块标题
 * @param {Error} e api.js 抛出的错误（isNetwork / message）
 * @param {Array<{text:string, onClick:Function}>} [actions] 操作按钮，默认只给"重试"
 */
export function errorCard(title, e, actions) {
  const isNet = e && e.isNetwork;
  const btns = actions || [{ text: '重试', onClick: () => location.reload() }];
  return el('div', { class: 'card card-error', children: [
    el('p', { class: 'error-title', text: title }),
    el('p', { class: 'error-msg', text: isNet ? e.message : (e && e.message ? e.message : '未知错误') }),
    isNet ? el('p', { class: 'error-hint',
                      text: '提示：先运行 server\\start.ps1 启动本地服务，再刷新本页。' }) : null,
    el('div', { class: 'detail-fatal-actions', children: btns.map(b =>
      el('button', { class: 'btn btn-ghost', text: b.text, on: { click: b.onClick } })) }),
  ]});
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