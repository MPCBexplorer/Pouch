package com.pouch.store;

import java.nio.file.Path;

/**
 * 存储层 I/O 异常上抛（01 §1.7 原子写/备份/恢复）。上层 Service/Handler 捕获后一律转
 * 500 internal_error「数据写入失败」。与业务 4xx（HttpError）刻意分家：这里是"我们的
 * 文件系统出问题了"，不是"你的请求参数写错了"。
 */
public class StoreException extends RuntimeException {
    private final Path file;

    public StoreException(Path file, String message) {
        super(message);
        this.file = file;
    }

    public StoreException(Path file, String message, Throwable cause) {
        super(message, cause);
        this.file = file;
    }

    public Path file() { return file; }
}
