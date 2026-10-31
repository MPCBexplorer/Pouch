/*
 * Pouch LaTeX 渲染辅助（基于 KaTeX，单文件引用）
 * Copyright (c) 2026 Pouch Contributors
 *
 * 在 marked/DOMPurify Markdown 渲染流程中保护 LaTeX 公式（$...$ 行内，$$...$$ 块），
 * 并使用 KaTeX 进行真正的数学公式渲染。KaTeX 本地引用，运行时不访问 CDN。
 * 占位符替换在 DOM 层面进行，避免 Markdown 解析器破坏占位符文本。
 */
(function () {
  'use strict';

  var PouchLatex = {};
  var PLACEHOLDER_PREFIX = '[[POUCH_LATEX_';
  var PLACEHOLDER_SUFFIX = ']]';
  var PLACEHOLDER_RE = /\[\[POUCH_LATEX_(\d+)\]\]/g;
  var store = [];

  function makePlaceholder(index) {
    return PLACEHOLDER_PREFIX + index + PLACEHOLDER_SUFFIX;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** 将文本中的 LaTeX 公式替换为占位符，返回保护后的文本。 */
  function protect(text) {
    store = [];
    return String(text)
      .replace(/\$\$([\s\S]*?)\$\$/g, function (match, content) {
        var idx = store.length;
        store.push({ type: 'block', content: content });
        return makePlaceholder(idx);
      })
      .replace(/\$([^\$]+?)\$/g, function (match, content) {
        var idx = store.length;
        store.push({ type: 'inline', content: content });
        return makePlaceholder(idx);
      });
  }

  /** 使用 KaTeX 渲染单个 LaTeX 内容为 HTML 字符串。 */
  function renderLatex(content, displayMode) {
    if (typeof window.katex !== 'undefined') {
      try {
        var html = window.katex.renderToString(content, {
          throwOnError: false,
          displayMode: displayMode
        });
        if (displayMode) {
          return '<div class="latex-block">' + html + '</div>';
        }
        return '<span class="latex-inline">' + html + '</span>';
      } catch (e) {
        // KaTeX 渲染失败，降级
      }
    }
    var escaped = escapeHtml(content);
    if (displayMode) {
      return '<div class="latex-block"><span class="latex-content">\\[ ' + escaped + ' \\]</span></div>';
    }
    return '<span class="latex-inline">\\( ' + escaped + ' \\)</span>';
  }

  /** 在 DOM 容器中查找所有 LaTeX 占位符文本节点，替换为 KaTeX 渲染后的元素。 */
  function replaceInContainer(container) {
    if (!container) return;
    var walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }
    nodes.forEach(function (textNode) {
      var text = textNode.textContent;
      if (!PLACEHOLDER_RE.test(text)) return;
      var parent = textNode.parentNode;
      if (!parent) return;
      var frag = document.createDocumentFragment();
      var lastIndex = 0;
      var match;
      PLACEHOLDER_RE.lastIndex = 0;
      while ((match = PLACEHOLDER_RE.exec(text))) {
        var before = text.slice(lastIndex, match.index);
        if (before) frag.appendChild(document.createTextNode(before));
        var idx = parseInt(match[1], 10);
        var item = store[idx];
        var html = item ? renderLatex(item.content, item.type === 'block') : match[0];
        var temp = document.createElement('div');
        temp.innerHTML = html;
        while (temp.firstChild) frag.appendChild(temp.firstChild);
        lastIndex = match.index + match[0].length;
      }
      var after = text.slice(lastIndex);
      if (after) frag.appendChild(document.createTextNode(after));
      parent.replaceChild(frag, textNode);
    });
  }

  PouchLatex.protect = protect;
  PouchLatex.renderLatex = renderLatex;
  PouchLatex.replaceInContainer = replaceInContainer;
  PouchLatex.getStore = function () { return store; };

  // 注入基础容器样式（KaTeX 渲染结果自带排版，此处只做外壳）
  var style = document.createElement('style');
  style.textContent = [
    '.latex-inline {',
    '  font-size: 0.95em;',
    '  margin: 0 0.2em;',
    '}',
    '.latex-block {',
    '  margin: var(--sp-3, 0.75rem) 0;',
    '  overflow-x: auto;',
    '  text-align: center;',
    '}',
    '.latex-block katex-display {',
    '  margin: 0;',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PouchLatex;
  } else {
    window.PouchLatex = PouchLatex;
  }
})();
