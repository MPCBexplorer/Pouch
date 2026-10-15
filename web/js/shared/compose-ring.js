/**
 * compose-ring.js — 碎片知识构成环（Ticket 08 建立；2026-10-15 随学科分类取消而重构）
 *
 * 契约：
 * - `buildTagLevel(tags, path)`：从 `/api/meta/tags` 的全量树（tag/name/depth/count/ownCount，
 *   中间层节点由后端合成）取出 `path` 下一层的分片。`path=''` 表示一级标签。
 *   返回 `{ slices: [{label, count, full}], hasChildren }`，按计数降序。
 * - `renderComposeRing(host, slices)`：渲染 doughnut + 自绘图例；超过 TOP_N(8) 片时
 *   取计数最高的前 8 个，其余合并为「其他 N 个」，固定中性灰 var(--gray-400)。
 * - 主题联动：监听 theme.js 派发的 `pouch:themechange`，用上次的 slices 重绘
 *   （docs/04 §4.6：只重绘、不重新请求）。
 * - 约束：不 import 任何模块（含 api.js）、不直接 fetch；Chart.js 经全局 <script> 提供，
 *   缺失时渲染空态而不是抛错（上线安全）。
 *
 * consumer 入口：index.js（Ticket 08 首页 E 区块）。学科维度已取消，仅保留按标签。
 */

export const TOP_N = 8;                    // 构成环最多展示的分片数（docs/00 §0.2.1）

const PALETTE_TOKENS = ['--ring-1', '--ring-2', '--ring-3', '--ring-4',
                        '--ring-5', '--ring-6', '--ring-7', '--ring-8'];
const OTHER_TOKEN = '--gray-400';          // "其他 N 个"固定中性灰
const THEME_EVENT = 'pouch:themechange';

/**
 * 从全量标签树取某一层级（纯函数，可单测）。
 * @param {Array<{tag:string,name:string,depth:number,count:number,ownCount:number}>} tags
 * @param {string} [path] 当前层级路径，'' = 一级标签；'Java' = Java 的下一层
 * @returns {{slices: Array<{label:string,count:number,full:string}>, hasChildren: boolean}}
 */
export function buildTagLevel(tags, path = '') {
  const list = Array.isArray(tags) ? tags : [];
  const prefix = path ? path + '/' : '';
  const byTag = new Map(list.map(t => [t && t.tag, t]));
  const level = new Map();

  for (const t of list) {
    const p = t && t.tag;
    if (!p) continue;
    if (path && p !== path && !p.startsWith(prefix)) continue;   // 只收当前路径子树内的节点
    const rest = path ? p.slice(prefix.length) : p;
    const seg = rest.split('/')[0];
    if (!seg) continue;
    const full = prefix + seg;
    if (level.has(full)) continue;
    const node = byTag.get(full);
    // 层级节点的子树计数：后端已合成中间层节点，直接取；取不到则退化为当前节点计数
    level.set(full, { label: seg, count: node ? (node.count || 0) : (t.count || 0), full });
  }

  const slices = [...level.values()].sort((a, b) => b.count - a.count);
  const hasChildren = slices.some(s => list.some(x => x && x.tag && x.tag.startsWith(s.full + '/')));
  return { slices, hasChildren };
}

/**
 * top-N 聚合：计数降序取前 limit 个，其余合并为「其他 N 个」（保留 full 供钻取）。
 * @returns {Array<{label:string,count:number,full:?string,isOther:boolean,index:number}>}
 */
export function aggregateTopN(slices, limit = TOP_N) {
  const list = (Array.isArray(slices) ? slices : [])
    .map(s => ({ label: String(s && s.label != null ? s.label : ''), count: Number(s && s.count) || 0, full: s && s.full != null ? s.full : null }))
    .filter(s => s.label && s.count > 0);
  list.sort((a, b) => b.count - a.count);
  const head = list.slice(0, limit);
  const rest = list.slice(limit);
  const out = head.map((s, i) => ({ ...s, isOther: false, index: i }));
  if (rest.length > 0) {
    out.push({
      label: `其他 ${rest.length} 个`,
      count: rest.reduce((sum, s) => sum + s.count, 0),
      full: null,
      isOther: true,
      index: out.length,
    });
  }
  return out;
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

let chart = null;
let lastSlices = null;       // 主题切换时重绘用（docs/04 §4.6：不重新请求）
let lastHost = null;
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
        backgroundColor: slices.map(s => tokenValue(s.isOther ? OTHER_TOKEN : PALETTE_TOKENS[s.index % PALETTE_TOKENS.length])),
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
  slices.forEach(s => {
    const li = h('li', 'compose-legend-item');
    const dot = h('span', 'compose-legend-dot');
    dot.style.background = tokenValue(s.isOther ? OTHER_TOKEN : PALETTE_TOKENS[s.index % PALETTE_TOKENS.length]);
    li.append(dot);
    li.append(h('span', 'compose-legend-label', s.label));
    li.append(h('span', 'compose-legend-count', String(s.count)));
    ul.append(li);
  });
  host.append(ul);
}

/**
 * 渲染构成环。
 * @param {HTMLElement} host 挂载容器
 * @param {Array<{label:string,count:number}>} slices 当前层级分片（内部做 top-N 聚合）
 * @returns {number} 渲染的分片数；空数据返回 0
 */
export function renderComposeRing(host, slices) {
  lastHost = host;
  lastSlices = slices;
  bindTheme();

  const agg = aggregateTopN(slices);
  if (!agg.length || typeof Chart !== 'function') {
    destroyChart();
    host.replaceChildren(h('p', 'empty-hint', '还没有带标签的碎片知识。'));
    return 0;
  }
  draw(host, agg);
  renderLegend(host, agg);
  return agg.length;
}

/** 主题切换后用上次的分片重绘（只重绘、不重新请求）。 */
function onThemeChange() {
  if (lastHost && lastSlices) renderComposeRing(lastHost, lastSlices);
}

/** 绑定主题监听（幂等：首次渲染时才需要）。 */
function bindTheme() {
  if (bound) return;
  bound = true;
  document.addEventListener(THEME_EVENT, onThemeChange);
}
