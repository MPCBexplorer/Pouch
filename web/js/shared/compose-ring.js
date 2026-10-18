/**
 * compose-ring.js — 碎片知识构成环（Ticket 08 建立；2026-10-15 随学科分类取消而重构）
 *
 * 契约：
 * - `buildTagLevel(tags, path)`：从 /api/meta/tags 的全量树（tag/name/depth/count/ownCount，
 *   中间层节点由后端合成）取出 path 下一层的分片。path='' 表示一级标签。
 *   返回 { slices, hasChildren }，按计数降序，全部显示（不聚合“其他”）。
 * - `renderComposeRing(host, slices, onSliceClick)`：渲染 doughnut + 自绘图例。
 *   支持点击扇环钻取子标签（onSliceClick 接收被点击的 slice）。
 * - 主题联动：监听 theme.js 派发的 pouch:themechange，用上次的 slices 重绘
 *   （docs/04 §4.6：只重绘、不重新请求）。
 * - 约束：不 import 任何模块（含 api.js）、不直接 fetch；Chart.js 经全局 <script> 提供，
 *   缺失时渲染空态而不是抛错（上线安全）。
 *
 * consumer 入口：index.js（Ticket 08 首页 E 区块）。学科维度已取消，仅保留按标签。
 */

const PALETTE_TOKENS = ['--ring-1', '--ring-2', '--ring-3', '--ring-4',
                        '--ring-5', '--ring-6', '--ring-7', '--ring-8'];
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
let lastOnSliceClick = null;
let bound = false;

function destroyChart() {
  if (chart && typeof chart.destroy === 'function') chart.destroy();
  chart = null;
}

function draw(host, slices, onSliceClick) {
  let canvas = host.querySelector('.compose-canvas');
  if (!canvas) { canvas = h('canvas', 'compose-canvas'); host.append(canvas); }
  destroyChart();
  chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: slices.map(s => s.label),
      datasets: [{
        data: slices.map(s => s.count),
        backgroundColor: slices.map((_, i) => tokenValue(PALETTE_TOKENS[i % PALETTE_TOKENS.length])),
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
      onClick: (event, elements) => {
        if (!onSliceClick || !elements.length) return;
        const index = elements[0].index;
        onSliceClick(slices[index]);
      },
    },
  });
}

const LEGEND_SHOW_COUNT = 5;   // 默认只显示前 5 条

function renderLegend(host, slices) {
  const old = host.querySelector('.compose-legend');
  if (old) old.remove();
  const ul = h('ul', 'compose-legend');
  slices.forEach((s, i) => {
    const li = h('li', 'compose-legend-item');
    if (i >= LEGEND_SHOW_COUNT) li.classList.add('compose-legend-hidden');
    const dot = h('span', 'compose-legend-dot');
    dot.style.background = tokenValue(PALETTE_TOKENS[i % PALETTE_TOKENS.length]);
    li.append(dot);
    li.append(h('span', 'compose-legend-label', s.label));
    li.append(h('span', 'compose-legend-count', String(s.count)));
    ul.append(li);
  });
  // 当条目超过 5 条时，添加展开/收起切换
  if (slices.length > LEGEND_SHOW_COUNT) {
    const toggle = h('li', 'compose-legend-toggle');
    const btn = h('button', 'compose-legend-toggle-btn', '展开更多');
    btn.type = 'button';
    let expanded = false;
    btn.addEventListener('click', () => {
      expanded = !expanded;
      const shouldHide = !expanded;
      ul.querySelectorAll('.compose-legend-item').forEach((li, idx) => {
        if (idx >= LEGEND_SHOW_COUNT) {
          li.classList.toggle('compose-legend-hidden', shouldHide);
        }
      });
      btn.textContent = expanded ? '收起' : '展开更多';
    });
    toggle.append(btn);
    ul.append(toggle);
  }
  host.append(ul);
}

/**
 * 渲染构成环（全部标签，不聚合）。
 * @param {HTMLElement} host 挂载容器
 * @param {Array<{label:string,count:number,full:string}>} slices 当前层级分片（全部，不做 top-N 聚合）
 * @param {Function} [onSliceClick] 点击扇环的回调，接收被点击的 slice
 * @returns {number} 渲染的分片数；空数据返回 0
 */
export function renderComposeRing(host, slices, onSliceClick) {
  lastHost = host;
  lastSlices = slices;
  lastOnSliceClick = onSliceClick;
  bindTheme();

  // 全部显示，不聚合“其他 N 个”
  const agg = slices.map(s => ({
    label: String(s && s.label != null ? s.label : ''),
    count: Number(s && s.count) || 0,
    full: s && s.full != null ? s.full : null,
  })).filter(s => s.label && s.count > 0)
    .sort((a, b) => b.count - a.count);

  if (!agg.length || typeof Chart !== 'function') {
    destroyChart();
    host.replaceChildren(h('p', 'empty-hint', '还没有带标签的碎片知识。'));
    return 0;
  }
  draw(host, agg, onSliceClick);
  renderLegend(host, agg);
  return agg.length;
}

/** 主题切换后用上次的分片重绘（只重绘、不重新请求）。 */
function onThemeChange() {
  if (lastHost && lastSlices) renderComposeRing(lastHost, lastSlices, lastOnSliceClick);
}

/** 绑定主题监听（幂等：首次渲染时才需要）。 */
function bindTheme() {
  if (bound) return;
  bound = true;
  document.addEventListener(THEME_EVENT, onThemeChange);
}
