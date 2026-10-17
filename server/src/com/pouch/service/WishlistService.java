package com.pouch.service;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.pouch.HttpError;
import com.pouch.Requests;
import com.pouch.model.WishItem;
import com.pouch.store.JsonStore;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class WishlistService {
    private final JsonStore store;
    public WishlistService(JsonStore store) { this.store = store; }

    public WishItem create(JsonObject body) {
        String name = Requests.str(body, "name");
        if (name == null || name.trim().isEmpty() || name.trim().length() > 120)
            throw new HttpError(400, "invalid_wish_name", "name 需 1~120 字符");
        Long am = readAmount(body);
        String note = Requests.str(body, "note");
        if (note != null && note.length() > 500) throw new HttpError(400, "invalid_wish_note", "note 需 ≤500");
        // 新建时强制 purchased=false（即使请求传了 true 也忽略），purchasedAt 恒为 null
        int sort = store.maxWishSortIndex() + 1;
        WishItem w = new WishItem();
        w.setId(UUID.randomUUID().toString());
        w.setName(name.trim());
        w.setAmountCents(am);
        w.setNote(note == null ? "" : note);
        w.setPurchased(false);
        w.setPurchasedAt(null);
        String now = Svc.now();
        w.setCreatedAt(now);
        w.setUpdatedAt(now);
        w.setSortIndex(sort);
        try { store.insertWish(w); }
        catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
        return w;
    }

    static long readAmount(JsonObject body) {
        if (!Requests.has(body, "amountCents")) throw new HttpError(400, "invalid_amount", "amountCents 为必填项");
        JsonElement e = body.get("amountCents");
        if (!e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber())
            throw new HttpError(400, "invalid_amount", "amountCents 必须是整数（单位为分）");
        if (e.getAsJsonPrimitive().isBoolean())
            throw new HttpError(400, "invalid_amount", "amountCents 必须是整数（单位为分）");
        double d = e.getAsDouble();
        if (d != Math.floor(d) || !Double.isFinite(d))
            throw new HttpError(400, "invalid_amount", "amountCents 必须是整数（单位为分）");
        long v = (long) d;
        if (v < 0 || v > 100_000_000L) throw new HttpError(400, "invalid_amount", "amountCents 需 0~100000000");
        return v;
    }

    public WishItem update(String id, JsonObject body) {
        WishItem w = store.findWish(id);
        if (w == null) throw new HttpError(404, "wish_not_found", "心愿条目不存在：" + id);
        if (Requests.has(body, "name")) {
            String t = Requests.str(body, "name");
            if (t == null || t.trim().isEmpty() || t.trim().length() > 120) throw new HttpError(400, "invalid_wish_name", "name 需 1~120");
            w.setName(t.trim());
        }
        if (Requests.has(body, "amountCents")) w.setAmountCents(readAmount(body));
        if (Requests.has(body, "note")) {
            String n = Requests.str(body, "note");
            if (n != null && n.length() > 500) throw new HttpError(400, "invalid_wish_note", "note 需 ≤500");
            w.setNote(n == null ? "" : n);
        }
        if (Requests.has(body, "purchased")) {
            boolean p = Requests.bool(body, "purchased", w.purchased());
            if (p && !w.purchased()) w.setPurchasedAt(Svc.now());
            else if (!p && w.purchased()) w.setPurchasedAt(null);
            w.setPurchased(p);
        }
        if (body.has("sortIndex")) w.setSortIndex(body.get("sortIndex").getAsInt());
        w.setUpdatedAt(Svc.now());
        try { store.updateWish(id, w); }
        catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
        return w;
    }

    public void delete(String id) {
        if (store.findWish(id) == null) throw new HttpError(404, "wish_not_found", "心愿条目不存在：" + id);
        try { store.deleteWish(id); }
        catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
    }

    /**
     * 列表顺序=契约本身（03 §3.5）：sortIndex 升序 → createdAt 升序 → id 决胜，稳定全序。
     *
     * 曾经的 bug：直接返回 store 快照（文件插入顺序）， ↑/↓ 按契约交换 sortIndex 后
     * 两次 PATCH 都成功、数据也写对了，但 GET 回来顺序不变——用户看到"移动没实现"。
     * 修好排序后，前端零改动即恢复（前端逻辑本就按契约实现）。
     */
    public List<WishItem> list() {
        return store.wishesSnapshot().stream()
                .sorted(Comparator
                        .comparingInt(WishItem::sortIndex)
                        .thenComparing(WishItem::createdAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(WishItem::id, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    public Map<String, Long> summary() {
        long total = 0, spent = 0;
        int itemCount = 0, purchasedCount = 0;
        for (WishItem w : store.wishesSnapshot()) {
            total += w.amountCents();
            itemCount++;
            if (w.purchased()) { spent += w.amountCents(); purchasedCount++; }
        }
        var m = new java.util.LinkedHashMap<String, Long>();
        m.put("totalWishCents", total);
        m.put("spentCents", spent);
        m.put("remainingCents", total - spent);
        m.put("itemCount", (long) itemCount);
        m.put("purchasedCount", (long) purchasedCount);
        return m;
    }
}
