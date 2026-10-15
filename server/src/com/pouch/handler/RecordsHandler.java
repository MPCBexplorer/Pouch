package com.pouch.handler;

import com.google.gson.JsonObject;
import com.pouch.*;
import com.pouch.model.Category;
import com.pouch.model.Record;
import com.pouch.service.RecordService;
import com.pouch.store.JsonStore;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public class RecordsHandler implements Handler {
    private final JsonStore store;
    private final RecordService svc;
    public RecordsHandler(JsonStore s) { this.store = s; this.svc = new RecordService(s); }

    @Override
    public void handle(HttpExchange ex, Map<String, String> pp) throws IOException {
        String m = ex.getRequestMethod();

        // ---- /api/records/{id}/notes/{noteId} （noteId 优先） ----
        if (pp.containsKey("noteId")) {
            String id = pp.get("id");
            String noteId = pp.get("noteId");
            if ("PATCH".equals(m)) {
                Record r = svc.editNote(id, noteId, Requests.readBody(ex));
                Respond.json(ex, 200, r);
                return;
            }
            if ("DELETE".equals(m)) { Record r = svc.deleteNote(id, noteId); Respond.json(ex, 200, r); return; }
        }

        // ---- /api/records/{id} ----
        if (pp.containsKey("id")) {
            String id = pp.get("id");
            if ("GET".equals(m)) { Respond.json(ex, 200, svc.findAnyMust(id)); return; }
            if ("PATCH".equals(m)) {
                String typeQ = Requests.query(ex).get("type");
                Category target = null;
                if (typeQ != null && !typeQ.isEmpty()) {
                    try { target = Category.fromWire(typeQ); }
                    catch (IllegalArgumentException e) { throw new HttpError(400, "invalid_type", "type 非法"); }
                }
                Respond.json(ex, 200, svc.update(id, Requests.readBody(ex), target));
                return;
            }
            if ("DELETE".equals(m)) { svc.delete(id); Respond.noContent(ex); return; }
        }

        // ---- /api/records ----
        if ("POST".equals(m)) {
            Map<String, String> q = Requests.query(ex);
            Category c;
            try { c = Category.fromWire(q.get("type")); }
            catch (IllegalArgumentException e) { throw new HttpError(400, "invalid_type", "type 非法"); }
            JsonObject body = Requests.readBody(ex);
            Record r = svc.create(c, body);
            Respond.json(ex, 201, r);
            return;
        }
        if ("GET".equals(m)) {
            Map<String, String> q = Requests.query(ex);
            Category c;
            try { c = Category.fromWire(q.get("type")); }
            catch (IllegalArgumentException e) { throw new HttpError(400, "invalid_type", "type 非法"); }
            RecordService.Filter f = new RecordService.Filter();
            f.q = q.get("q");
            // tags 为逗号分隔的多选值（每项支持"父/子"层级路径）
            String tagParam = q.get("tags");
            if (tagParam != null && !tagParam.isBlank()) {
                f.tags = java.util.Arrays.stream(tagParam.split(","))
                        .map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
            }
            f.status = q.get("status");
            if (q.get("pinned") != null) f.pinned = Boolean.parseBoolean(q.get("pinned"));
            f.dueFrom = Requests.parseDateParam(q, "dueFrom", "dueFrom");
            f.dueTo   = Requests.parseDateParam(q, "dueTo", "dueTo");
            f.sort = q.getOrDefault("sort", "updatedAt");
            f.order = q.getOrDefault("order", "desc");
            if (!Set.of("updatedAt", "createdAt", "title", "dueDate").contains(f.sort)) f.sort = "updatedAt";
            if (!Set.of("asc", "desc").contains(f.order)) f.order = "desc";
            try { f.page = Math.max(1, Integer.parseInt(q.getOrDefault("page", "1"))); } catch (NumberFormatException e) { f.page = 1; }
            try { int sz = Integer.parseInt(q.getOrDefault("size", "30")); f.size = Math.max(1, Math.min(200, sz)); } catch (NumberFormatException e) { f.size = 30; }
            RecordService.Result r = svc.list(c, f);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("items", r.items);
            Map<String, Object> pagination = new LinkedHashMap<>();
            pagination.put("total", r.total);
            pagination.put("page", r.page);
            pagination.put("size", r.size);
            pagination.put("totalPages", (int) Math.ceil((double) r.total / r.size));
            out.put("pagination", pagination);
            Respond.json(ex, 200, out);
            return;
        }
        Respond.error(ex, 405, "method_not_allowed", "unsupported " + m);
    }
}
