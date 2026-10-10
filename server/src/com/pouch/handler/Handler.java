package com.pouch.handler;

import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.Map;

public interface Handler {
    /** pathParams 是 Router 解析出的 {name} 段值（Ljava Map，找不到就是空串）。 */
    void handle(HttpExchange ex, Map<String, String> pathParams) throws IOException;
}
