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
package com.pouch;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.Map;

/** 请求侧辅助：读 body、解析 query 参数。 */
public final class Requests {
    private static final long MAX_BODY = 2L * 1024 * 1024;   // 2 MB

    private Requests() {}

    /** 读 request body：<=2MB，非 JSON 对象抛 invalid_json，空 body 返回空 JsonObject (PATCH 语义)。 */
    public static JsonObject readBody(HttpExchange ex) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        long total = 0;
        try (InputStream in = ex.getRequestBody()) {
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_BODY) throw new HttpError(400, "body_too_large", "请求体超过 2 MB");
                bos.write(buf, 0, n);
            }
        }
        byte[] bytes = bos.toByteArray();
        if (bytes.length == 0) return new JsonObject();
        JsonElement el;
        try { el = JsonParser.parseString(new String(bytes, java.nio.charset.StandardCharsets.UTF_8)); }
        catch (RuntimeException e) { throw new HttpError(400, "invalid_json", "请求体不是合法 JSON"); }
        if (el == null || el.isJsonNull()) return new JsonObject();
        if (!el.isJsonObject()) throw new HttpError(400, "invalid_json", "请求体必须是 JSON 对象");
        return el.getAsJsonObject();
    }

    /** 解析 query string → Map。保留第一个值（重复键不覆盖）。 */
    public static Map<String, String> query(HttpExchange ex) {
        Map<String, String> out = new HashMap<>();
        String q = ex.getRequestURI().getQuery();
        if (q == null || q.isEmpty()) return out;
        for (String kv : q.split("&")) {
            if (kv.isEmpty()) continue;
            int eq = kv.indexOf('=');
            String k, v;
            if (eq < 0) { k = kv; v = ""; } else { k = kv.substring(0, eq); v = kv.substring(eq + 1); }
            try {
                k = java.net.URLDecoder.decode(k, java.nio.charset.StandardCharsets.UTF_8);
                v = java.net.URLDecoder.decode(v, java.nio.charset.StandardCharsets.UTF_8);
            } catch (Exception ignore) {}
            out.putIfAbsent(k, v);
        }
        return out;
    }

    public static String str(JsonObject obj, String key) {
        if (obj == null) return null;
        JsonElement e = obj.get(key);
        if (e == null || e.isJsonNull()) return null;
        return e.getAsString();
    }
    public static boolean has(JsonObject obj, String key) { return obj != null && obj.has(key) && !obj.get(key).isJsonNull(); }

    public static PresentValue presentValue(JsonObject obj, String key) {
        if (obj == null || !obj.has(key)) return new PresentValue(false, null);
        JsonElement e = obj.get(key);
        if (e == null || e.isJsonNull()) return new PresentValue(true, null);
        return new PresentValue(true, e.getAsString());
    }
    public record PresentValue(boolean present, String value) {}

    public static boolean bool(JsonObject obj, String key, boolean def) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) return def;
        JsonElement e = obj.get(key);
        try { return e.getAsBoolean(); }
        catch (RuntimeException e2) { throw new HttpError(400, "invalid_pinned", "pinned 必须是布尔"); }
    }

    public static java.util.List<String> tagList(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) return null;
        return GsonUtil.strList(obj.get(key), key);
    }

    public static LocalDate parseDateParam(Map<String, String> q, String key, String paramName) {
        String raw = q.get(key);
        if (raw == null || raw.isEmpty()) return null;
        try { return LocalDate.parse(raw); }
        catch (DateTimeParseException e) { throw new HttpError(400, "invalid_" + paramName, "日期格式必须为 yyyy-MM-dd"); }
    }
}