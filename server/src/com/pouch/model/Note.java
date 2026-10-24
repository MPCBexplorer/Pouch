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
package com.pouch.model;

public class Note {
    private String id;
    private String content;
    private String createdAt;
    private String updatedAt;   // 未编辑过时为 null，Gson 默认不序列化

    public Note() {}
    public Note(String id, String content, String createdAt) {
        this.id = id; this.content = content; this.createdAt = createdAt;
    }

    public String id()        { return id; }
    public String content()   { return content; }
    public String createdAt() { return createdAt; }
    public String updatedAt() { return updatedAt; }

    public void setContent(String c) { this.content = c; }
    public void touch(String iso)    { this.updatedAt = iso; }
}
