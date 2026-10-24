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

/** 业务异常，携带 HTTP 状态码与错误码字符串（03 §3.0.2 统一错误信封）。 */
public class HttpError extends RuntimeException {
    public final int status;
    public final String code;

    public HttpError(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static HttpError badRequest(String code, String msg) { return new HttpError(400, code, msg); }
    public static HttpError notFound(String code, String msg)   { return new HttpError(404, code, msg); }
    public static HttpError conflict(String code, String msg)   { return new HttpError(409, code, msg); }
    public static HttpError internal(String msg)                { return new HttpError(500, "internal_error", msg); }
}
