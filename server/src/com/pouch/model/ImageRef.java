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

/**
 * 嵌入在记录正文中的压缩图片引用（方案 A：图文分离，base64 内嵌于同一 JSON 文件）。
 * data 字段存放压缩后的 base64 纯字符串（无 data: 前缀），前端渲染时拼接为
 * {@code data:<mime>;base64,<data>}。
 */
public class ImageRef {
    private String id;        // 图片唯一标识（前端生成，如 img_<timestamp>_<random>）
    private String mime;      // 如 image/webp
    private long size;        // 压缩后字节数
    private int width;        // 缩放后宽度（px）
    private int height;       // 缩放后高度（px）
    private String data;      // base64 纯字符串，不含 data: 前缀

    public ImageRef() {}

    // getters
    public String id()    { return id; }
    public String mime()  { return mime; }
    public long size()    { return size; }
    public int width()    { return width; }
    public int height()   { return height; }
    public String data()  { return data; }

    // setters
    public void setId(String v)    { id = v; }
    public void setMime(String v)  { mime = v; }
    public void setSize(long v)    { size = v; }
    public void setWidth(int v)    { width = v; }
    public void setHeight(int v)   { height = v; }
    public void setData(String v)  { data = v; }
}
