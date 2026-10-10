package com.pouch.model;

import java.util.Set;

/**
 * 四个记录类别。文件名映射的唯一权威来源——
 * 代码中任何位置都不得硬编码 "todos.json" 之类的字符串。
 */
public enum Category {
    INSPIRATION("inspiration", "灵感", "inspirations.json"),
    QUESTION   ("question",    "问题", "questions.json"),
    KNOWLEDGE  ("knowledge",   "碎片知识", "knowledge.json"),
    TODO       ("todo",        "要做的事", "todos.json");

    private final String wire;       // API 与 JSON 中的取值
    private final String label;      // 界面显示名
    private final String fileName;   // 数据文件名

    Category(String wire, String label, String fileName) {
        this.wire = wire;
        this.label = label;
        this.fileName = fileName;
    }

    public String wire()     { return wire; }
    public String label()    { return label; }
    public String fileName() { return fileName; }

    /** 由 API 字符串解析；非法值抛 IllegalArgumentException（Handler 转 400 invalid_type）。 */
    public static Category fromWire(String s) {
        for (Category c : values()) if (c.wire.equals(s)) return c;
        throw new IllegalArgumentException("unknown type: " + s);
    }

    /** 该类别的合法状态集合。 */
    public Set<String> allowedStatuses() {
        return switch (this) {
            case INSPIRATION -> Set.of("active", "archived");
            case QUESTION    -> Set.of("open", "resolved");
            case KNOWLEDGE   -> Set.of("learning", "mastered");
            case TODO        -> Set.of("open", "done", "cancelled");
        };
    }

    /** 创建时的默认状态。 */
    public String defaultStatus() {
        return switch (this) {
            case INSPIRATION -> "active";
            case QUESTION    -> "open";
            case KNOWLEDGE   -> "learning";
            case TODO        -> "open";
        };
    }
}
