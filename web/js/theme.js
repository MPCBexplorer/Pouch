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
// theme.js — 主题切换逻辑。
// 优先级（04 §4.4）：localStorage('pouch-theme') > prefers-color-scheme > 默认亮色。
// 存的是"mode"（'light' | 'dark' | 'auto'），不是当前生效的主题——
// 'auto' 让跟随系统偏好在用户 override 后仍能自动响应。
(function () {
  'use strict';

  var KEY = 'pouch-theme';

  function apply(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    // Chart.js 等把 CSS 变量值固化进 canvas 的组件需要靠这个事件重绘
    // （docs/04 §4.6：只重绘、不重新请求 API）
    document.dispatchEvent(new CustomEvent('pouch:themechange', {
      detail: { theme: theme || effectiveTheme() },
    }));
  }

  function currentMode() {
    var v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  }

  function effectiveTheme() {
    var m = currentMode();
    if (m !== 'auto') return m;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function init() {
    apply(effectiveTheme());

    // 系统偏好变化时，只有模式是 auto 才跟随
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onMq = function () { if (currentMode() === 'auto') apply(effectiveTheme()); };
      mq.addEventListener ? mq.addEventListener('change', onMq)
                           : mq.addListener(onMq);   // 旧 Safari
    }

    // 找所有 .theme-toggle 按钮（4 页顶部导航各一个，静态 HTML 里写死的）
    var btns = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, next); } catch (e) { /* 隐私模式忽略 */ }
        apply(next);
      });
    }
  }

  // 关键时机：theme.js 放在 <head>（见各 HTML），
  // 在 body 渲染前执行，避免"先画亮色再闪到暗色"。按钮绑定等 DOM 就绪。
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
    // 按钮要 DOM 里有 .theme-toggle 才能绑；readyState='loading' 说明按钮还没解析完
  } else {
    init();
  }
})();
