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
