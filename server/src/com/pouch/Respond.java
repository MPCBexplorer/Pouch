package com.pouch;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public final class Respond {
    private static final Gson GSON = new Gson();

    private Respond() {}

    public static void json(HttpExchange ex, int status, Object body) throws IOException {
        byte[] bytes = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }

    public static void noContent(HttpExchange ex) throws IOException {
        ex.sendResponseHeaders(204, -1);
        ex.close();
    }

    /** 统一错误信封：{ "error": { "code": "...", "message": "..." } } */
    public static void error(HttpExchange ex, int status, String code, String message) throws IOException {
        json(ex, status, Map.of("error", Map.of(
                "code", code, "message", message == null ? "" : message)));
    }
}
