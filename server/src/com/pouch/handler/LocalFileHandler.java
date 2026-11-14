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
package com.pouch.handler;

import com.pouch.Respond;
import com.pouch.HttpError;
import com.pouch.Requests;
import com.sun.net.httpserver.HttpExchange;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * /api/local-file/open —— 在系统默认程序中打开本地文件（方案 B）。
 * 不做路径白名单检查，路径由前端透传，后端仅负责校验文件存在并调用 Desktop.open。
 * 成功或失败均返回结构化 JSON，由前端通过 toast 告知用户。
 */
public class LocalFileHandler implements Handler {

    @Override
    public void handle(HttpExchange ex, Map<String, String> pp) throws IOException {
        if (!"GET".equals(ex.getRequestMethod())) {
            throw new HttpError(405, "method_not_allowed", "仅支持 GET");
        }

        Map<String, String> q = Requests.query(ex);
        String rawPath = q.get("path");
        if (rawPath == null || rawPath.isEmpty()) {
            throw new HttpError(400, "missing_path", "缺少 path 参数");
        }

        Path file = Paths.get(rawPath);
        if (!Files.isRegularFile(file)) {
            throw new HttpError(404, "not_found", "文件不存在：" + rawPath);
        }

        if (!Desktop.isDesktopSupported() || !Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
            throw new HttpError(500, "unsupported", "当前环境不支持打开本地文件");
        }

        try {
            Desktop.getDesktop().open(file.toFile());
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", true);
            body.put("path", rawPath);
            body.put("fileName", file.getFileName().toString());
            Respond.json(ex, 200, body);
        } catch (IOException e) {
            throw new HttpError(500, "open_failed", "无法打开文件：" + e.getMessage());
        }
    }
}
