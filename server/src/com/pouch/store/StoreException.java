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
