package com.pouch.handler;

import com.pouch.*;
import com.pouch.model.Category;
import com.pouch.service.RecordService;
import com.pouch.service.StatsService;
import com.pouch.store.JsonStore;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

public class StatsHandler implements Handler {
    private final JsonStore store;
    private final StatsService stats;
    private final RecordService rec;
    public StatsHandler(JsonStore s) { this.store = s; this.stats = new StatsService(s); this.rec = new RecordService(s); }

    @Override
    public void handle(HttpExchange ex, Map<String, String> pp) throws IOException {
        String suffix = pp.get("_suffix");
        Map<String, String> q = Requests.query(ex);

        if ("overview".equals(suffix)) {
            Respond.json(ex, 200, stats.overview());
            return;
        }
        if ("random".equals(suffix)) {
            String t = q.get("type");
            Category c;
            try { c = Category.fromWire(t); }
            catch (IllegalArgumentException e) { throw new HttpError(400, "invalid_type", "type 非法"); }
            int count;
            try { count = Math.max(1, Math.min(50, Integer.parseInt(q.getOrDefault("count", "5")))); }
            catch (NumberFormatException e) { count = 5; }
            String excl = q.get("exclude");
            Set<String> set = (excl == null || excl.isEmpty()) ? Set.of()
                    : Arrays.stream(excl.split(",")).map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toSet());
            RecordService.RandomResult rr = rec.random(c, count, set);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("record", rr.records.isEmpty() ? null : rr.records.get(0));
            out.put("poolSize", rr.poolSize);
            out.put("exhausted", rr.exhausted);
            out.put("pickedAt", rr.pickedAt);
            Respond.json(ex, 200, out);
            return;
        }
        if ("stale".equals(suffix)) {
            int limit;
            try { limit = Integer.parseInt(q.getOrDefault("limit", "10")); } catch (NumberFormatException e) { limit = 10; }
            limit = Math.max(1, Math.min(50, limit));
            List<Map<String, Object>> items = stats.staleItems(limit);
            Map<String, Integer> all = stats.staleByType();
            Map<String, Integer> nonZero = new LinkedHashMap<>();
            int total = 0;
            for (Map.Entry<String, Integer> e : all.entrySet()) {
                total += e.getValue();
                if (e.getValue() > 0) nonZero.put(e.getKey(), e.getValue());
            }
            Map<String, Integer> th = new LinkedHashMap<>();
            th.put("question", 30); th.put("todo", 21); th.put("inspiration", 60);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("items", items);
            out.put("byType", nonZero);
            out.put("thresholds", th);
            out.put("total", total);
            out.put("returned", items.size());
            out.put("now", com.pouch.service.Svc.now());
            Respond.json(ex, 200, out);
            return;
        }
        Respond.error(ex, 404, "not_found", "unknown stats " + suffix);
    }
}
