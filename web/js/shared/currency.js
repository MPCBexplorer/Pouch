/**
 * currency.js — 金额格式化共享模块（Ticket 07 预置 / Ticket 04/08 使用）
 * 契约：
 * - 输入：整数分（long，来自 API 的 amountCents / totalWishCents / spentCents / remainingCents）
 * - 输出："¥X,XXX.XX" 字符串（两位小数、千分位分隔符、人民币符号）
 * - 约束：不 import 任何模块、不直接 fetch、纯函数、无副作用
 * - consumer 入口：wishlist.js、index.js（后续 08）
 */
const Currency = (function () {
  'use strict';

  /**
   * 将整数分格式化为 "¥X,XXX.XX"
   * @param {number} cents - 整数分（如 1999 → ¥19.99）
   * @returns {string}
   */
  function formatCents(cents) {
    if (cents === null || cents === undefined || isNaN(cents)) {
      return '¥0.00';
    }
    const yuan = cents / 100;
    const sign = yuan < 0 ? '-' : '';
    const abs = Math.abs(yuan);
    const intPart = Math.floor(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = (Math.round(abs * 100) % 100).toString().padStart(2, '0');
    return sign + '¥' + intPart + '.' + decPart;
  }

  /**
   * 解析用户输入的元字符串为整数分
   * @param {string} yuanStr - 用户输入（如 "19.99"、"100"、"1,234.56"）
   * @returns {number|null} 整数分，或 null 表示无效
   */
  function parseYuan(yuanStr) {
    if (yuanStr === null || yuanStr === undefined) return null;
    const cleaned = String(yuanStr).replace(/[¥￥,，\s]/g, '');
    if (!cleaned) return null;
    const num = parseFloat(cleaned);
    if (isNaN(num) || !isFinite(num)) return null;
    // 四舍五入到分
    return Math.round(num * 100);
  }

  return { formatCents, parseYuan };
})();

// ES module 导出兼容
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Currency;
}