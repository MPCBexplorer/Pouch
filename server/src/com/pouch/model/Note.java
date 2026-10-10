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
