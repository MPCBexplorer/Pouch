package com.pouch.handler;

import com.pouch.Requests;
import com.pouch.Respond;
import com.pouch.HttpError;
import com.pouch.model.Category;
import com.pouch.service.RecordService;
import com.pouch.store.JsonStore;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /api/health（阶段 0 唯一 API）与 /api/meta/*（阶段 1 元数据）。
 * warnings 从 store.loadWarnings() 取（启动检查后填写）。
 */
public class MetaHandler implements Handler {

    private final JsonStore store;
    private final OffsetDateTime startedAt = OffsetDateTime.now();

    public MetaHandler(JsonStore store) { this.store = store; }

    /** /api/health */
    @Override
    public void handle(HttpExchange ex, Map<String, String> pathParams) throws IOException {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Category c : Category.values()) counts.put(c.wire(), store.count(c));
        counts.put("wishlist", store.countWishes());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "ok");
        body.put("startedAt", startedAt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        body.put("dataDir", store.dataDir().toString());
        body.put("counts", counts);
        body.put("warnings", store.loadWarnings());
        Respond.json(ex, 200, body);
    }

    /** GET /api/meta/categories */
    public void handleCategories(HttpExchange ex) throws IOException {
        RecordService svc = new RecordService(store);
        Respond.json(ex, 200, svc.metaCategories());
    }

    /** GET /api/meta/tags?type=... */
    public void handleTags(HttpExchange ex, Map<String, String> q) throws IOException {
        Category c = null;
        String t = q.get("type");
        if (t != null && !t.isEmpty()) {
            try { c = Category.fromWire(t); }
            catch (IllegalArgumentException e) { throw new HttpError(400, "invalid_type", "type 非法或缺失"); }
        }
        RecordService svc = new RecordService(store);
        Respond.json(ex, 200, svc.metaTags(c));
    }

    /** GET /api/meta/subjects */
    public void handleSubjects(HttpExchange ex) throws IOException {
        RecordService svc = new RecordService(store);
        Respond.json(ex, 200, svc.metaSubjects());
    }
}
