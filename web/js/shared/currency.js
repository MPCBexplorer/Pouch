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
/**
 * currency.js — 金额格式化共享模块（Ticket 07）
 * 契约：
 * - 输入：整数分（long，来自 API 的 amountCents / totalWishCents / spentCents / remainingCents）
 * - 输出："¥X,XXX.XX" 字符串（两位小数、千分位分隔符、人民币符号）
 * - 约束：不 import 任何模块（含 api.js）、不直接 fetch、纯函数、无副作用
 * - consumer 入口：wishlist.js（import { formatCents, parseYuan }）、index.js（后续 08）
 * - 金額运算一律在整数分上完成，只在展示层转元（spec 决策 10）
 */

/**
 * 将整数分格式化为 "¥X,XXX.XX"
 * @param {number} cents - 整数分（如 1999 → ¥19.99）
 * @returns {string}
 */
export function formatCents(cents) {
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
export function parseYuan(yuanStr) {
  if (yuanStr === null || yuanStr === undefined) return null;
  const cleaned = String(yuanStr).replace(/[¥￥,，\s]/g, '');
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  if (isNaN(num) || !isFinite(num)) return null;
  // 四舍五入到分
  return Math.round(num * 100);
}
