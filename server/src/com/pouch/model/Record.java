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

import java.util.ArrayList;
import java.util.List;

/**
 * 统一记录模型（ADR-003）。类别专有字段在不适用时为 null，
 * Gson 默认不序列化 null，因此落盘文件保持干净。
 */
public class Record {
    // ---- 公共字段 ----
    private String id;
    private String type;
    private String title;
    private String content = "";
    private List<String> tags = new ArrayList<>();
    private List<Note> notes = new ArrayList<>();
    private String status;
    private String createdAt;
    private String updatedAt;
    private boolean pinned = false;

    // ---- 类别专有字段 ----
    private String source;     // knowledge / question
    private String dueDate;    // todo
    private String priority;   // todo
    private String doneAt;     // todo

    public Record() {}

    // getters
    public String id()        { return id; }
    public String type()      { return type; }
    public String title()     { return title; }
    public String content()   { return content; }
    public List<String> tags(){ return tags; }
    public List<Note> notes() { return notes; }
    public String status()    { return status; }
    public String createdAt() { return createdAt; }
    public String updatedAt() { return updatedAt; }
    public boolean pinned()   { return pinned; }
    public String source()    { return source; }
    public String dueDate()   { return dueDate; }
    public String priority()  { return priority; }
    public String doneAt()    { return doneAt; }

    // setters（供 Service 层在校验通过后调用）
    public void setId(String v)        { id = v; }
    public void setType(String v)      { type = v; }
    public void setTitle(String v)     { title = v; }
    public void setContent(String v)   { content = v; }
    public void setTags(List<String> v){ tags = v; }
    public void setNotes(List<Note> v) { notes = v; }
    public void setStatus(String v)    { status = v; }
    public void setCreatedAt(String v) { createdAt = v; }
    public void setUpdatedAt(String v) { updatedAt = v; }
    public void setPinned(boolean v)   { pinned = v; }
    public void setSource(String v)    { source = v; }
    public void setDueDate(String v)   { dueDate = v; }
    public void setPriority(String v)  { priority = v; }
    public void setDoneAt(String v)    { doneAt = v; }

    /** 清除不属于目标类别的专有字段。变更类别时（01 §1.8.1）调用。 */
    public void clearForeignFields(Category target) {
        if (target != Category.KNOWLEDGE && target != Category.QUESTION) source = null;
        if (target != Category.TODO) { dueDate = null; priority = null; doneAt = null; }
    }
}
