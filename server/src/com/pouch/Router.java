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

import com.pouch.handler.Handler;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 极简路由：注册 (method, pattern) → handler。
 * pattern 中的 {name} 段都会解析进 pathParams；支持一段或多段。
 */
public class Router {

    record Route(String method, Pattern pattern, String[] paramNames, String suffix, Handler handler) {}

    private final List<Route> routes = new java.util.ArrayList<>();
    private final Handler fallback;   // StaticHandler，兜底

    public Router(Handler fallback) { this.fallback = fallback; }

    public Router register(String method, String pattern, Handler handler) {
        String[] paramNames = null;
        int paramCount = 0;
        for (String seg : pattern.split("/", -1))
            if (seg.startsWith("{") && seg.endsWith("}")) paramCount++;
        if (paramCount > 0) paramNames = new String[paramCount];
        int idx = 0;
        String suffix = null;
        StringBuilder sb = new StringBuilder("^");
        boolean first = true;
        for (String seg : pattern.split("/", -1)) {
            if (!first) sb.append('/');
            first = false;
            if (seg.startsWith("{") && seg.endsWith("}")) {
                paramNames[idx++] = seg.substring(1, seg.length() - 1);
                sb.append("([^/]+)");
            } else if (!seg.isEmpty()) {
                sb.append(Pattern.quote(seg));
                suffix = seg;   // 最后一个固定段
            }
        }
        sb.append("$");
        routes.add(new Route(method.toUpperCase(), Pattern.compile(sb.toString()), paramNames, suffix, handler));
        return this;
    }

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String rawPath = ex.getRequestURI().getRawPath();

        Route matched = null;
        java.util.regex.Matcher matcher = null;
        Route pathMatched = null;
        for (Route r : routes) {
            java.util.regex.Matcher m = r.pattern.matcher(rawPath);
            if (!m.matches()) continue;
            pathMatched = r;
            if (r.method.equals(method)) { matched = r; matcher = m; break; }
        }

        if (matched == null) {
            if (rawPath.startsWith("/api/")) {
                if (pathMatched != null) {
                    Respond.error(ex, 405, "method_not_allowed", "不支持的请求方法：" + method);
                    ex.getResponseHeaders().set("Allow", pathMatched.method);
                } else {
                    Respond.error(ex, 404, "not_found", "未知端点：" + method + " " + rawPath);
                }
            } else {
                fallback.handle(ex, Map.of());
            }
            return;
        }

        Map<String, String> params = new LinkedHashMap<>();
        if (matched.paramNames() != null) {
            for (int i = 0; i < matched.paramNames().length; i++) {
                params.put(matched.paramNames()[i], URLDecoder.decode(matcher.group(i + 1), StandardCharsets.UTF_8));
            }
        }
        if (matched.suffix() != null) params.put("_suffix", matched.suffix());
        try {
            matched.handler().handle(ex, params);
        } catch (HttpError e) {
            Respond.error(ex, e.status, e.code, e.getMessage());
        } catch (Exception e) {
            System.err.println("[ERROR] " + method + " " + rawPath + " → " + e);
            e.printStackTrace();
            Respond.error(ex, 500, "internal_error", "服务器内部错误");
        }
    }
}
