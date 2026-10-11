/**
 * compose-ring.js — 碎片知识构成环共享模块（Ticket 07）
 *
 * 契约：
 * - 输入 data：API 信封原样，两种维度各一种形状——
 *     dimension 'subject': { subjects: [{ path, name, depth, count }] }   （GET /api/meta/subjects）
 *     dimension 'tag':     { tags:     [{ tag, count }] }                （GET /api/meta/tags?type=knowledge）
 * - 输入 options：{ dimension: 'subject' | 'tag' }，默认 'subject'
 * - 输出 DOM 子树：host 内渲染 <canvas class="compose-canvas">（Chart.js doughnut）
 *   + <ul class="compose-legend">（每项：色点 + 名称 + 计数）
 *   + 空态 <p class="empty-hint">；返回 { slices, otherCount, totalCount } 摘要（无数据时返回 null）
 * - top-N 聚合（docs/00 §0.2.1）：超过 TOP_N(8) 个 token 时只展示计数最高的前 8 个，
 *   其余合并为"其他 N 个"一片，固定中性灰 var(--gray-400)，不参与主题色轮换
 * - 主题联动：颜色全部经 getComputedStyle 读 CSS 变量；监听 theme.js 派发的
 *   'pouch:themechange' 事件，用上次的数据重绘（docs/04 §4.6：只重绘、不重新请求）
 * - 约束：不 import 任何模块（含 api.js）、不直接 fetch；Chart.js 经全局 <script> 提供，
 *   缺失时渲染空态而不是抛错（上线安全）
 *
 * consumer 入口：index.js（Ticket 08，首页 E 区块，滑块切换 subject/tag 两维度）
 */

export const TOP_N = 8;                    // 构成环最多展示的分片数（docs/00 §0.2.1）

const PALETTE_TOKENS = ['--ring-1', '--ring-2', '--ring-3', '--ring-4',
                        '--ring-5', '--ring-6', '--ring-7', '--ring-8'];
const OTHER_TOKEN = '--gray-400';          // "其他 N 个"固定中性灰
const THEME_EVENT = 'pouch:themechange';

/**
 * 把 token 列表聚合为至多 TOP_N+1 个分片（纯函数，可单测）。
 * @param {Array<{label:string, count:number}>} tokens
 * @param {number} [limit=TOP_N]
 * @returns {{slices: Array<{label:string,count:number,isOther:boolean}>,
 *            otherCount: number, totalCount: number}}
 */
export function aggregateTopN(tokens, limit = TOP_N) {
  const max = typeof limit === 'number' && limit > 0 ? limit : TOP_N;
  const list = (Array.isArray(tokens) ? tokens : [])
    .map(t => ({ label: String(t && t.label != null ? t.label : ''), count: Number(t && t.count) || 0 }))
    .filter(t => t.label && t.count > 0);
  list.sort((a, b) => b.count - a.count);   // 计数降序

  const slices = list.slice(0, max).map(t => ({ label: t.label, count: t.count, isOther: false }));
  const rest = list.slice(max);
  const otherCount = rest.reduce((sum, t) => sum + t.count, 0);
  if (rest.length > 0) {
    slices.push({ label: `其他 ${rest.length} 个`, count: otherCount, isOther: true });
  }
  const totalCount = slices.reduce((sum, s) => sum + s.count, 0);
  return { slices, otherCount, totalCount };
}

/** 从 API 信封取 token 列表并按维度规整为 {label,count}。 */
export function tokensFromData(data, dimension) {
  const raw = dimension === 'tag' ? (data && data.tags) : (data && data.subjects);
  const list = Array.isArray(raw) ? raw : [];
  if (dimension === 'tag') {
    return list.map(t => ({ label: t && t.tag, count: t && t.count }));
  }
  return list.map(s => ({ label: s && (s.path || s.name), count: s && s.count }));
}

/** 读 CSS 变量当前值（Chart.js 创建时即固化，切主题需重绘）。 */
function tokenValue(name) {
  const css = getComputedStyle(document.documentElement);
  return css.getPropertyValue(name).trim();
}

/** 无 import 约束下的小型建 DOM 辅助（只走 textContent，不注入 HTML）。 */
function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function emptyText(dimension) {
  return dimension === 'tag' ? '还没有带标签的碎片知识。' : '还没有碎片知识记录。';
}

let chart = null;
let lastHost = null;
let lastData = null;      // 主题切换时重绘用（docs/04 §4.6：不重新请求）
let lastOpts = {};
let bound = false;

function destroyChart() {
  if (chart && typeof chart.destroy === 'function') chart.destroy();
  chart = null;
}

function draw(host, slices) {
  let canvas = host.querySelector('.compose-canvas');
  if (!canvas) { canvas = h('canvas', 'compose-canvas'); host.append(canvas); }
  destroyChart();
  chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: slices.map(s => s.label),
      datasets: [{
        data: slices.map(s => s.count),
        backgroundColor: slices.map((s, i) =>
          tokenValue(s.isOther ? OTHER_TOKEN : PALETTE_TOKENS[i % PALETTE_TOKENS.length])),
        borderColor: tokenValue('--bg-surface'),
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },   // 用自绘 legend，视觉统一
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}：${ctx.parsed} 项` } },
      },
    },
  });
}

function renderLegend(host, slices) {
  const old = host.querySelector('.compose-legend');
  if (old) old.remove();
  const ul = h('ul', 'compose-legend');
  slices.forEach((s, i) => {
    const li = h('li', 'compose-legend-item');
    const dot = h('span', 'compose-legend-dot');
    dot.style.background = tokenValue(s.isOther ? OTHER_TOKEN : PALETTE_TOKENS[i % PALETTE_TOKENS.length]);
    li.append(dot);
    li.append(h('span', 'compose-legend-label', s.label));
    li.append(h('span', 'compose-legend-count', String(s.count)));
    ul.append(li);
  });
  host.append(ul);
}

function renderEmpty(host, dimension) {
  destroyChart();
  host.replaceChildren(h('p', 'empty-hint', emptyText(dimension)));
}

/**
 * 渲染构成环。
 * @param {HTMLElement} host - 挂载容器
 * @param {object} data - API 信封（subjects 或 tags）
 * @param {{dimension?: 'subject'|'tag'}} [options]
 * @returns {{slices: Array, otherCount: number, totalCount: number}|null} 无数据/无 Chart 时返回 null
 */
export function renderComposeRing(host, data, options) {
  const opts = options || {};
  const dimension = opts.dimension === 'tag' ? 'tag' : 'subject';
  lastHost = host;
  lastData = data;
  lastOpts = { dimension };
  bindTheme();   // 首次渲染时绑定主题联动（幂等）

  const tokens = tokensFromData(data, dimension);
  if (!tokens.length || typeof Chart !== 'function') {
    renderEmpty(host, dimension);   // Chart.js 未加载也走空态，避免半渲染页面
    return null;
  }

  const { slices } = aggregateTopN(tokens);
  draw(host, slices);
  renderLegend(host, slices);
  const totalCount = slices.reduce((sum, s) => sum + s.count, 0);
  return { slices, otherCount: slices.filter(s => s.isOther).reduce((n, s) => n + s.count, 0), totalCount };
}

/** 主题切换后用上次的数据重绘（只重绘、不重新请求）。 */
function onThemeChange() {
  if (lastHost && lastData) renderComposeRing(lastHost, lastData, lastOpts);
}

/** 绑定主题监听（幂等：首次渲染时才需要，纯函数导入不依赖 DOM）。 */
function bindTheme() {
  if (bound) return;
  bound = true;
  document.addEventListener(THEME_EVENT, onThemeChange);
}
