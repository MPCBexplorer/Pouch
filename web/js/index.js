/**
 * index.js — 首页看板六区块（Ticket 08 / docs/04 §4.6、docs/00 §0.2.1）
 *
 * A 四类别总量卡（点击跳列表） · B 待办完成率环（中心百分比 / 暂无待办）
 * C 心愿单三项汇总 + 进度条（只取 summary，不列条目） · D 随机回顾双 tab（独立已看队列、切 tab 不重抽）
 * E 碎片知识构成环（学科/标签滑块、tag 维度懒加载） · F 陈旧提醒 Top N + 阈值分布
 * 顶部告警横幅承接 /api/health.warnings。
 *
 * 约束（spec 用户故事 62-66）：不直接 fetch（全部走 api.js）；类别/状态/按钮文案全部来自
 * /api/meta/categories；不用字符串拼接 HTML；颜色只引用 design token（图表色经 getComputedStyle 读变量）。
 */
import { API } from '/js/api.js';
import { el, render, frag, excerpt, relTime, fullTime, toast, statusLabel,
         renderWarnings, errorCard } from '/js/dom.js';
import { formatCents } from '/js/shared/currency.js';
import { renderComposeRing, buildTagLevel } from '/js/shared/compose-ring.js';

// ============ 状态 ============

let CATEGORIES = [];                       // /api/meta/categories，不硬编码枚举
const catOf = type => CATEGORIES.find(c => c.type === type);

const SEEN_LIMIT = 50;                     // 已看队列上限，超过重开一轮（避免 exclude 过长）
const RECALL_TYPES = ['inspiration', 'knowledge'];

/** 随机回顾：每个 tab 各自维护"本轮已看"与"上次渲染的数据"（切 tab 不重抽，用户故事 15）。 */
const recall = {
  inspiration: { seen: [], last: null, exhausted: false },
  knowledge: { seen: [], last: null, exhausted: false },
};
let activeRecall = 'inspiration';

let lastOverview = null;                   // 主题切换后只重绘图表、不重新请求（docs/04 §4.6）
let completionChart = null;

const els = {
  statCards: document.getElementById('statCards'),
  completionMeta: document.getElementById('completionMeta'),
  completionCanvas: document.getElementById('completionChart'),
  wishSummary: document.getElementById('wishSummary'),
  recallBody: document.getElementById('recallBody'),
  composeRing: document.getElementById('composeRing'),
  composePath: document.getElementById('composePath'),
  ringUp: document.getElementById('ringUp'),
  ringDown: document.getElementById('ringDown'),
  staleBody: document.getElementById('staleBody'),
  warnBanner: document.getElementById('warnBanner'),
};

// ============ 启动 ============

async function boot() {
  bindRecallTabs();
  bindComposeNav();
  bindThemeRedraw();

  // 六路并发，不串行等待（验收：完整加载 <800ms）
  await Promise.allSettled([
    loadCategories(),
    loadOverview(),
    loadWishSummary(),
    loadRandom('inspiration'),
    loadRandom('knowledge'),
    loadHealth(),
    loadStale(),
    loadCompose(),
  ]);
}

async function loadCategories() {
  try {
    const data = await API.getCategories();
    CATEGORIES = Array.isArray(data?.categories) ? data.categories : [];
  } catch (e) {
    render(els.statCards, errorCard('类别加载失败', e));
  }
}

async function loadHealth() {
  try {
    const h = await API.getHealth();
    renderWarnings(els.warnBanner, h.warnings || []);
  } catch { /* 健康检查失败不打扰用户，其他区块会各自报错 */ }
}

// ============ 区块 A：总量统计 ============

async function loadOverview() {
  try {
    const s = await API.statsOverview();
    lastOverview = s;
    renderStatCards(s);
    renderCompletion(s);
  } catch (e) {
    render(els.statCards, errorCard('统计数据加载失败', e));
    render(els.completionMeta, errorCard('完成情况加载失败', e));
  }
}

function renderStatCards(s) {
  render(els.statCards, frag(
    CATEGORIES.map(c => el('a', {
      class: 'stat-card',
      href: `/list.html?type=${c.type}`,
      attrs: { 'aria-label': `查看${c.label}，共 ${s.counts[c.type] ?? 0} 条` },
      style: { '--card-accent': `var(--cat-${c.type})` },
      children: [
        el('span', { class: 'stat-num', text: String(s.counts[c.type] ?? 0) }),
        el('span', { class: 'stat-label', text: c.label }),
      ],
    }))
  ));
}

// ============ 区块 B：完成率环 ============

/**
 * rate 为 null = "无待办"（一条都没有或全部已取消），不是 0%（用户故事 4）。
 * 此时隐藏画布并给出引导，避免一个误导人的空环。
 */
function renderCompletion(s) {
  const c = s.todoCompletion;
  const meta = els.completionMeta;

  if (!c || c.rate === null) {
    if (completionChart) { completionChart.destroy(); completionChart = null; }
    els.completionCanvas.style.display = 'none';
    render(meta, frag([
      el('p', { class: 'empty-hint', text: '暂无待办' }),
      el('p', { class: 'chart-meta-sub', text: s.todoCancelled > 0
        ? `${s.todoCancelled} 项已取消，不计入完成率`
       : '记一条"要做的事"后这里会显示完成率' }),
      el('a', { class: 'btn btn-ghost', href: '/list.html?type=todo', text: '去记一条 →' }),
    ]));
    return;
  }

  els.completionCanvas.style.display = '';
  drawCompletionChart(c.done, c.open);

  const pct = Math.round(c.rate * 100);
  render(meta, frag([
    el('div', { class: 'meta-row', children: [
      el('span', { class: ['dot', 'dot-done'], attrs: { 'aria-hidden': 'true' } }),
      el('span', { text: `已完成 ${c.done}` }),
    ]}),
    el('div', { class: 'meta-row', children: [
      el('span', { class: ['dot', 'dot-open'], attrs: { 'aria-hidden': 'true' } }),
      el('span', { text: `未完成 ${c.open}` }),
    ]}),
    s.todoCancelled > 0
      ? el('p', { class: 'meta-note', text: `另有 ${s.todoCancelled} 项已取消，不计入统计` })
      : null,
    el('p', { class: 'meta-rate', text: `完成率 ${pct}%` }),
  ]));
}

function drawCompletionChart(done, open) {
  const css = getComputedStyle(document.documentElement);
  const color = v => css.getPropertyValue(v).trim();
  if (completionChart) completionChart.destroy();
  completionChart = new Chart(els.completionCanvas, {
    type: 'doughnut',
    data: {
      labels: ['已完成', '未完成'],
      datasets: [{
        data: [done, open],
        backgroundColor: [color('--cat-todo'), color('--gray-300')],
        borderColor: color('--bg-surface'),
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}：${ctx.parsed} 项` } },
      },
    },
  });
}

/** 主题切换后只重绘图表，不重新请求（docs/04 §4.6）。 */
function bindThemeRedraw() {
  document.addEventListener('pouch:themechange', () => {
    if (lastOverview) renderCompletion(lastOverview);
  });
}

// ============ 区块 C：心愿单汇总 ============

/**
 * 只取 summary，不请求/不渲染 items（docs/00 §0.2.1 C：首页保持轻量，条目管理去心愿单页）。
 * 三项数字由后端统一计算，前端只做格式化（用户故事 6)。
 */
async function loadWishSummary() {
  try {
    const data = await API.getWishlist();
    renderWishSummary(data.summary);
  } catch (e) {
    render(els.wishSummary, errorCard('心愿单汇总加载失败', e));
  }
}

function renderWishSummary(s) {
  if (!s) { render(els.wishSummary, el('p', { class: 'empty-hint', text: '心愿单数据不可用' })); return; }
  // 两条进度：数量 + 金额（与心愿单页同口径；首页保持 slim 样式）
  const itemCount = s.itemCount || 0;
  const countPct = itemCount > 0 ? Math.round(((s.purchasedCount || 0) / itemCount) * 100) : 0;
  const amountPct = s.totalWishCents > 0 ? Math.round((s.spentCents / s.totalWishCents) * 100) : 0;
  render(els.wishSummary, frag([
    el('div', { class: 'sum-row', children: [
      summaryItem('总心愿', s.totalWishCents, 'sum-total'),
      summaryItem('已花费', s.spentCents, 'sum-spent'),
      summaryItem('还差', s.remainingCents, 'sum-remaining'),
    ]}),
    sumProgressBar('数量', countPct, '已购条目占比'),
    sumProgressBar('金额', amountPct, '已花占总额比例'),
    el('p', { class: 'sum-note', text: s.purchasedCount > 0
      ? `${s.purchasedCount} / ${s.itemCount} 项已实现`
      : `共 ${s.itemCount} 项` }),
  ]));
}

/** 首页 slim 进度：小标签 + 条（复用 .sum-progress，数量/金额两条同样式）。 */
function sumProgressBar(label, pct, ariaLabel) {
  return el('div', { class: 'sum-progress-item', children: [
    el('span', { class: 'sum-progress-label', text: label }),
    el('div', { class: 'sum-progress', attrs: { role: 'progressbar', 'aria-valuenow': String(pct),
                                             'aria-valuemin': '0', 'aria-valuemax': '100',
                                             'aria-label': ariaLabel },
      children: [el('div', { class: 'sum-progress-fill', style: { width: pct + '%' } })] }),
  ]});
}

function summaryItem(label, cents, cls) {
  return el('div', { class: ['sum-item', cls], children: [
    el('span', { class: 'sum-label', text: label }),
    el('span', { class: 'sum-value', text: formatCents(cents) }),
  ]});
}

// ============ 区块 D：随机回顾（双 tab，用户故事 13-17） ============

function bindRecallTabs() {
  document.querySelectorAll('.recall-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      if (type === activeRecall) return;
      activeRecall = type;
      document.querySelectorAll('.recall-tab').forEach(b => {
        const on = b.dataset.type === type;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      // 切 tab 不重抽：渲染该 tab 上一次的内容（用户故事 15）
      renderRecall(type);
    });
  });
}

async function loadRandom(type) {
  const box = els.recallBody;
  const st = recall[type];
  box.classList.add('is-loading');
  try {
    const data = await API.getRandom(type, st.seen);   // 后端排除已看，实现"一轮不重复"（用户故事 14）
    if (data.exhausted) st.seen = [];            // 服务端已遍历完一轮，前端队列同步重开
    if (data.record) {
      st.seen.push(data.record.id);
      if (st.seen.length > SEEN_LIMIT) st.seen = [];
    }
    st.last = data;
    st.exhausted = data.exhausted;
    // 两个 tab 在 boot 时都会静默预加载，但共用一个展示容器：
    // 只有当前激活的 tab 才渲染，另一个的数据留待切 tab 时使用（切 tab 不重抽，用户故事 15）
    if (type === activeRecall) renderRecall(type);
  } catch (e) {
    render(box, errorCard('随机回顾加载失败', e));
  } finally {
    box.classList.remove('is-loading');
  }
}

function renderRecall(type) {
  const box = els.recallBody;
  const st = recall[type];

  if (!st.last) {   // 该 tab 尚未加载过（理论上 boot 已并发加载；防御性占位）
    render(box, el('p', { class: 'empty-hint', text: '加载中…' }));
    return;
  }
  const data = st.last;

  // 池空：专门引导文案（用户故事 17）
  if (!data.record) {
    const cat = catOf(type);
    render(box, frag([
      el('p', { class: 'empty-hint', text: `还没有${cat ? cat.label : '记录'}，去记一条` }),
      el('a', { class: 'btn btn-ghost', href: `/list.html?type=${type}`, text: '去记一条 →' }),
    ]));
    return;
  }

  const r = data.record;
  const cat = catOf(type);
  render(box, frag([
    el('a', { class: 'recall-link', href: `/detail.html?id=${r.id}&from=%2F`, children: [
      el('h3', { class: 'recall-title', text: r.title }),
      el('p', { class: 'recall-excerpt', text: excerpt(r.content, 140) || '（无正文）' }),
      el('div', { class: 'recall-foot', children: [
        ...(r.tags || []).slice(0, 3).map(t => el('span', { class: 'badge badge-tag', text: t })),
        el('span', { class: 'recall-time', text: relTime(r.createdAt),
                     attrs: { title: fullTime(r.createdAt) } }),
      ]}),
    ]}),
    el('div', { class: 'recall-actions', children: [
      el('button', { class: 'btn btn-ghost', text: '换一条',
                     on: { click: () => loadRandom(type) } }),
      el('span', { class: 'recall-pool', text: `共 ${data.poolSize} 条${cat ? cat.label : ''}` }),
    ]}),
    st.exhausted
      ? el('p', { class: 'recall-exhausted', text: '本轮已全部看过，再点"换一条"重新开始' })
      : null,
  ]));
}

// ============ 区块 E：构成环（只按标签；←/→ 沿层级调整粒度） ============

const compose = { tags: null, path: '' };   // 全量标签树缓存；path='' = 一级标签

function bindComposeNav() {
  els.ringUp?.addEventListener('click', () => navRing(-1));
  els.ringDown?.addEventListener('click', () => navRing(1));
}

/** 懒加载全量标签树（一次请求，之后上下钻全是客户端计算）。 */
async function loadCompose() {
  if (compose.tags) { renderRing(); return; }
  try {
    const data = await API.tags('knowledge');
    compose.tags = (data.tags || []).filter(t => t && t.count > 0);
    renderRing();
  } catch (e) {
    render(els.composeRing, errorCard('构成数据加载失败', e));
  }
}

/** 渲染当前层级：面包屑 + 圆环 + 箭头可用性。 */
function renderRing() {
  if (!compose.tags) return;
  const { slices, hasChildren } = buildTagLevel(compose.tags, compose.path);
  renderComposeRing(els.composeRing, slices);
  if (els.composePath) els.composePath.textContent = compose.path || '全部标签';
  if (els.ringUp) els.ringUp.disabled = !compose.path;
  if (els.ringDown) els.ringDown.disabled = !hasChildren;
}

/** dir=-1 上一级（更概览）；dir=1 下一级（进入计数最大的子标签，更详细）。 */
function navRing(dir) {
  if (!compose.tags) return;
  if (dir > 0) {
    const { slices, hasChildren } = buildTagLevel(compose.tags, compose.path);
    if (!slices.length) return;
    // slices 按 count 降序，但计数相同时保持插入顺序——
    // 第一个切片可能是叶子（无子标签），盲目钻进去会卡在空环里。
    // 改为：优先选有子标签的切片；都没有时才回退到 slices[0]。
    const pick = hasChildren ? slices.find(s => hasChildrenOf(s.full)) : null;
    compose.path = (pick || slices[0]).full;
  } else {
    if (!compose.path) return;
    const parts = compose.path.split("/");
    parts.pop();
    compose.path = parts.join("/");
  }
  renderRing();
}

/** 某个 full 标签路径下是否还有子标签（供 navRing 选可钻取的切片）。 */
function hasChildrenOf(full) {
  const prefix = full + '/';
  return compose.tags.some(t => t && t.tag && t.tag.startsWith(prefix));
}
// ============ 区块 F：陈旧提醒（用户故事 22-26） ============

async function loadStale() {
  try {
    const s = await API.getStale(10);
    renderStale(s);
  } catch (e) {
    render(els.staleBody, errorCard('陈旧提醒加载失败', e));
  }
}

function renderStale(s) {
  const items = s.items || [];

  // 阈值分布小条：即便清单被截断也能感知真实规模（用户故事 24）
  const byType = s.byType || {};
  const thresholds = s.thresholds || {};
  const dist = Object.keys(byType).filter(t => byType[t] > 0);
  const distNodes = dist.length
    ? dist.map(t => {
        const cat = catOf(t);
        return el('span', { class: 'badge badge-stale-count', text: `${cat ? cat.label : t}共 ${byType[t]} 个` });
      })
    : null;

  if (!items.length) {
    render(els.staleBody, frag([
      el('p', { class: 'empty-hint', text: '近期都在推进，没有陈旧记录' }),
      distNodes ? el('div', { class: 'stale-dist', children: distNodes }) : null,
    ]));
    return;
  }

  render(els.staleBody, frag([
    el('ul', { class: 'stale-items', children: items.map(it => {
      const cat = catOf(it.type);
      return el('li', { class: 'stale-item', children: [
        el('a', { class: 'stale-link', href: `/detail.html?id=${it.id}&from=%2F`, children: [
          el('span', { class: ['badge', `badge-${it.type}`], text: cat ? cat.label : it.type }),
          el('span', { class: 'stale-title', text: it.title }),
          el('span', { class: ['badge', `badge-status-${it.status}`], text: statusLabel(cat, it.status) }),
          el('span', { class: 'stale-days', text: `${it.idleDays} 天` }),
        ]}),
        el('span', { class: 'stale-threshold',
                     text: thresholds[it.type] != null ? `停滞超 ${thresholds[it.type]} 天` : '' }),
      ]});
    }) }),
    distNodes ? el('div', { class: 'stale-dist', children: distNodes }) : null,
    (s.total > s.returned)
      ? el('p', { class: 'stale-more', text: `仅显示最严重的 ${s.returned} 条，共 ${s.total} 条` })
      : null,
  ]));
}

boot();
