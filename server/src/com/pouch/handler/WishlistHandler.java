package com.pouch.handler;

import com.google.gson.JsonObject;
import com.pouch.*;
import com.pouch.model.WishItem;
import com.pouch.service.WishlistService;
import com.pouch.store.JsonStore;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

public class WishlistHandler implements Handler {
    private final JsonStore store;
    private final WishlistService svc;
    public WishlistHandler(JsonStore s) { this.store = s; this.svc = new WishlistService(s); }

    @Override
    public void handle(HttpExchange ex, Map<String, String> pp) throws IOException {
        String m = ex.getRequestMethod();
        if (pp.containsKey("id")) {
            String id = pp.get("id");
            if ("GET".equals(m)) {
                WishItem w = store.findWish(id);
                if (w == null) throw new HttpError(404, "wish_not_found", "心愿条目不存在：" + id);
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("item", w);
                out.put("summary", svc.summary());
                Respond.json(ex, 200, out);
                return;
            }
            if ("PATCH".equals(m)) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("item", svc.update(id, Requests.readBody(ex)));
                out.put("summary", svc.summary());
                Respond.json(ex, 200, out);
                return;
            }
            if ("DELETE".equals(m)) {
                svc.delete(id);
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("summary", svc.summary());
                Respond.json(ex, 200, out);
                return;
            }
        } else {
            if ("GET".equals(m)) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("items", svc.list());
                out.put("summary", svc.summary());
                Respond.json(ex, 200, out);
                return;
            }
            if ("POST".equals(m)) {
                JsonObject b = Requests.readBody(ex);
                WishItem w = svc.create(b);
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("item", w);
                out.put("summary", svc.summary());
                Respond.json(ex, 201, out);
                return;
            }
        }
        Respond.error(ex, 405, "method_not_allowed", "unsupported " + m);
    }
}
