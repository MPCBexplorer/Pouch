package com.pouch.handler;

import com.pouch.Respond;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * 静态资源服务：web/ 目录下的文件。
 *
 * ★ 两道逻辑（02 §2.7.1 路径穿越防护，必须理解）：
 *   1. normalize() 后 startsWith(webRoot) —— 把 .. 解析掉再比对前缀（主防线）
 *   2. 拒绝任何以 . 开头的路径段 —— 挡掉 .backup/、.git/ 隐藏目录
 */
public class StaticHandler implements Handler {

    private static final Map<String, String> MIME = Map.ofEntries(
            Map.entry("html",  "text/html; charset=utf-8"),
            Map.entry("htm",   "text/html; charset=utf-8"),
            Map.entry("css",   "text/css; charset=utf-8"),
            Map.entry("js",    "text/javascript; charset=utf-8"),
            Map.entry("mjs",   "text/javascript; charset=utf-8"),
            Map.entry("json",  "application/json; charset=utf-8"),
            Map.entry("svg",   "image/svg+xml"),
            Map.entry("png",   "image/png"),
            Map.entry("ico",   "image/x-icon"),
            Map.entry("webp",  "image/webp"),
            Map.entry("map",   "application/json"));

    private final Path webRoot;

    public StaticHandler(Path webRoot) {
        this.webRoot = webRoot.toAbsolutePath().normalize();
    }

    @Override
    public void handle(HttpExchange ex, Map<String, String> pathParams) throws IOException {
        String rawPath = ex.getRequestURI().getRawPath();
        if (rawPath == null || rawPath.isEmpty()) rawPath = "/";

        Path target = webRoot.resolve(rawPath.substring(Math.min(1, rawPath.length()))).normalize();

        // ★ 防线 1：必须在 webRoot 之内
        if (!target.startsWith(webRoot)) {
            Respond.error(ex, 403, "forbidden", "非法路径");
            return;
        }
        // ★ 防线 2：拒绝隐藏段（defense in depth，即使 normalize 失败也挡得住）
        for (Path seg : webRoot.relativize(target)) {
            if (seg.toString().startsWith(".")) {
                Respond.error(ex, 403, "forbidden", "非法路径");
                return;
            }
        }

        // 回退规则：目录或不存在的路径
        if (Files.exists(target) && Files.isDirectory(target)) {
            // 深链回退：/list → list.html，/ → index.html（04 §4.3.3 各页面的直达链接）
            String name = target.equals(webRoot) ? "index"
                    : target.getFileName().toString();
            Path deepLink = target.resolve(name + ".html");
            if (Files.exists(deepLink)) {
                target = deepLink;
            } else {
                target = webRoot.resolve("index.html");
            }
        } else if (!Files.exists(target)) {
            target = webRoot.resolve("index.html");   // 单页兜底，前端会显示"无数据"而非白屏
            if (!Files.exists(target)) {
                Respond.error(ex, 404, "not_found", "资源不存在");
                return;
            }
        }

        String fileName = target.getFileName().toString();
        String ext = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase() : "";
        ex.getResponseHeaders().set("Content-Type", MIME.getOrDefault(ext, "application/octet-stream"));
        // 所有静态资源一律 no-store（开发期改完刷新即生效）。
        // 历史坑（b3f227d 事后分析）：曾给非 HTML 资源带一小时缓存寿命，而 HTML 是 no-store。
        // wishlist.js 的布尔属性 bug 修好后，用户一小时内刷新页面仍在执行浏览器缓存的旧
        // wishlist.js，症状"修了还复现"。本地单用户应用重取几个文件成本为零，不赌缓存。
        ex.getResponseHeaders().set("Cache-Control", "no-store");

        byte[] bytes = Files.readAllBytes(target);
        if ("HEAD".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(200, -1);
            ex.close();
            return;
        }
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }
}
