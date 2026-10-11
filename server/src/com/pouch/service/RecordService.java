package com.pouch.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.pouch.GsonUtil;
import com.pouch.HttpError;
import com.pouch.Requests;
import com.pouch.model.Category;
import com.pouch.model.Note;
import com.pouch.model.Record;
import com.pouch.store.JsonStore;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

public class RecordService {
    private final JsonStore store;
    public RecordService(JsonStore store) { this.store = store; }

    // ---------- 校验（02 §2.2） ----------

    /** key 是否出现在请求体中。与 Requests.has 的区别：显式传 null 也算出现（清空语义，03 §3.0.4）。 */
    static boolean present(JsonObject body, String key) { return body != null && body.has(key); }

    static JsonObject validate(Category c, JsonObject body, boolean isPatch) {
        JsonObject out = new JsonObject();
        if (!isPatch || present(body, "title")) {
            String t = Requests.str(body, "title");
            if (t == null) throw new HttpError(400, "invalid_title", "title 为必填项");
            t = t.trim();
            if (t.isEmpty() || t.length() > 120) throw new HttpError(400, "invalid_title", "title 长度需 1~120");
            out.addProperty("title", t);
        }
        if (!isPatch || present(body, "content")) {
            String s = Requests.str(body, "content");
            if (s != null && s.length() > 100_000) throw new HttpError(400, "invalid_content", "content 超过 100000 字符");
            if (s != null) out.addProperty("content", s);
            else if (isPatch) out.add("content", JsonNull.INSTANCE);   // 显式 null = 清空（03 §3.0.4）
            else out.addProperty("content", "");
        }
        if (!isPatch || present(body, "tags")) {
            List<String> raw = (body == null || !present(body, "tags")) ? new ArrayList<>() : GsonUtil.strList(body.get("tags"), "tags");
            if (raw.size() > 20) throw new HttpError(400, "invalid_tags", "tags 最多 20 个");
            Set<String> uniq = new TreeSet<>();
            for (String t : raw) {
                t = t.trim();
                if (t.isEmpty() || t.length() > 24) throw new HttpError(400, "invalid_tags", "单个 tag 需 1~24 字符");
                if (t.contains("/")) throw new HttpError(400, "invalid_tags", "tag 不能包含 /");
                uniq.add(t);
            }
            JsonArray arr = new JsonArray();
            uniq.forEach(arr::add);
            out.add("tags", arr);
        }
        if (Requests.has(body, "status")) {
            String s = Requests.str(body, "status");
            if (s == null || !c.allowedStatuses().contains(s)) throw new HttpError(400, "invalid_status", "status 非法");
            out.addProperty("status", s);
        }
        if (present(body, "pinned")) {
            JsonElement e = body.get("pinned");
            if (e.isJsonNull()) out.add("pinned", JsonNull.INSTANCE);
            else out.addProperty("pinned", Requests.bool(body, "pinned", false));
        }

        if (c == Category.KNOWLEDGE) {
            if (!isPatch || present(body, "subject")) {
                String pv = Requests.presentValue(body, "subject").value();
                if (!isPatch && pv == null) throw new HttpError(400, "invalid_subject", "碎片知识必须指定 subject");
                // PATCH 显式 null 忽略：knowledge 的 subject 不可清空
                if (pv != null) {
                    String[] parts = pv.split("/", -1);
                    if (parts.length < 1 || parts.length > 3) throw new HttpError(400, "invalid_subject", "subject 最多 3 层");
                    for (String p : parts) { p = p.trim(); if (p.isEmpty() || p.length() > 20) throw new HttpError(400, "invalid_subject", "每层 1~20 字符"); }
                    out.addProperty("subject", pv);
                }
            }
        }
        if (c == Category.KNOWLEDGE || c == Category.QUESTION) {
            if (present(body, "source")) {
                String pv = Requests.presentValue(body, "source").value();
                if (pv != null && pv.length() > 200) throw new HttpError(400, "invalid_source", "source 超过 200 字符");
                if (pv != null) out.addProperty("source", pv);
                else out.add("source", JsonNull.INSTANCE);
            }
        }
        if (c == Category.TODO) {
            if (present(body, "dueDate")) {
                String pv = Requests.presentValue(body, "dueDate").value();
                if (pv != null) { try { LocalDate.parse(pv); } catch (DateTimeParseException e) { throw new HttpError(400, "invalid_due_date", "dueDate 需 yyyy-MM-dd"); } }
                if (pv != null) out.addProperty("dueDate", pv);
                else out.add("dueDate", JsonNull.INSTANCE);
            }
            if (present(body, "priority")) {
                String s = Requests.str(body, "priority");
                if (s == null) out.add("priority", JsonNull.INSTANCE);
                else {
                    if (!Set.of("low", "normal", "high").contains(s)) throw new HttpError(400, "invalid_priority", "priority 非法");
                    out.addProperty("priority", s);
                }
            }
        }
        return out;
    }

    static void applyAll(Record r, JsonObject v) {
        if (v.has("title")) r.setTitle(v.get("title").getAsString());
        if (v.has("content")) r.setContent(strOrEmpty(v.get("content")));
        if (v.has("tags")) r.setTags(GsonUtil.strList(v.get("tags"), "tags"));
        if (v.has("status")) r.setStatus(v.get("status").getAsString());
        if (v.has("pinned")) { JsonElement e = v.get("pinned"); r.setPinned(!e.isJsonNull() && e.getAsBoolean()); }
        if (v.has("subject")) r.setSubject(v.get("subject").getAsString());
        if (v.has("source")) r.setSource(strOrNull(v.get("source")));
        if (v.has("dueDate")) r.setDueDate(strOrNull(v.get("dueDate")));
        if (v.has("priority")) r.setPriority(strOrNull(v.get("priority")));
    }

    private static String strOrNull(JsonElement e) { return e.isJsonNull() ? null : e.getAsString(); }
    private static String strOrEmpty(JsonElement e) { return e.isJsonNull() ? "" : e.getAsString(); }

    // ---------- CRUD ----------
    public Record create(Category c, JsonObject body) {
        JsonObject v = validate(c, body, false);
        Record r = new Record();
        r.setId(UUID.randomUUID().toString());
        r.setType(c.wire());
        applyAll(r, v);
        r.setStatus(v.has("status") ? v.get("status").getAsString() : c.defaultStatus());
        String now = Svc.now();
        // doneAt：status 为 done 时由服务端写入（01 §1.2.2），新建时即完成也同样记录
        if (c == Category.TODO && "done".equals(r.status())) r.setDoneAt(now);
        if (c == Category.TODO && r.priority() == null) r.setPriority("normal");
        r.setCreatedAt(now); r.setUpdatedAt(now);
        try { store.insertRecord(c, r); }
        catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
        return r;
    }

    public Record update(String id, JsonObject body, Category targetOverride) {
        Record old = findAnyMust(id);
        Category c = Category.fromWire(old.type());
        Category target = (targetOverride != null) ? targetOverride : c;
        // 跨类别变更时一律按【目标类别】校验（01 §1.8.1 / 03 §3.3）：
        // 请求体里目标类别不认识的专有字段按契约忽略、不报错（03 §3.0.4），
        // 保存时由 clearForeignFields 清掉，不会残留 dueDate/priority。
        JsonObject v = validate(target, body, true);
        if (target != c) {
            // 目标类别必填字段必须齐全：转 knowledge 必须有 subject
            if (target == Category.KNOWLEDGE) {
                String subj = v.has("subject") ? v.get("subject").getAsString() : old.subject();
                if (subj == null || subj.isBlank())
                    throw new HttpError(400, "invalid_subject", "转为碎片知识必须指定 subject（学科）");
            }
            // 源类别状态在目标类别可能非法（如 todo 的 done/cancelled → knowledge）→ 重置为目标类别默认状态
            String st = v.has("status") ? v.get("status").getAsString() : old.status();
            if (st == null || !target.allowedStatuses().contains(st)) v.addProperty("status", target.defaultStatus());
        }
        applyAll(old, v);
        if (target != c) {
            old.setType(target.wire());
            old.clearForeignFields(target);   // 必须在 applyAll 之后：清掉源类别专有字段，无残留
        }
        if (c == Category.TODO && target == Category.TODO) {
            String now = Svc.now();
            if ("done".equals(old.status()) && old.doneAt() == null) old.setDoneAt(now);
            else if (!"done".equals(old.status()) && old.doneAt() != null) old.setDoneAt(null);
        }
        old.setUpdatedAt(Svc.now());
        try {
            if (target != c) store.moveRecord(c, target, id, old);
            else store.updateRecord(c, id, old);
        } catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
        return old;
    }

    public void delete(String id) {
        Record old = findAnyMust(id);
        try { store.deleteRecord(Category.fromWire(old.type()), id); }
        catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
    }

    public Record findAnyMust(String id) {
        Record r = store.findAny(id);
        if (r == null) throw new HttpError(404, "record_not_found", "记录不存在：" + id);
        return r;
    }

    // ---------- Notes ----------
    public Record appendNote(String id, JsonObject body) {
        String content = Requests.str(body, "content");
        if (content == null || content.isEmpty() || content.length() > 5000)
            throw new HttpError(400, "invalid_note", "note.content 需 1~5000 字符");
        Record r = findAnyMust(id);
        Note n = new Note(UUID.randomUUID().toString(), content, Svc.now());
        r.notes().add(n);
        r.setUpdatedAt(Svc.now());
        try { store.updateRecord(Category.fromWire(r.type()), r.id(), r); }
        catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
        return r;
    }
    public Record editNote(String id, String noteId, JsonObject body) {
        String content = Requests.str(body, "content");
        if (content == null || content.isEmpty() || content.length() > 5000)
            throw new HttpError(400, "invalid_note", "note.content 需 1~5000 字符");
        Record r = findAnyMust(id);
        Note n = r.notes().stream().filter(x -> x.id().equals(noteId)).findFirst()
                .orElseThrow(() -> new HttpError(404, "note_not_found", "笔记不存在：" + noteId));
        n.setContent(content);
        n.touch(Svc.now());
        r.setUpdatedAt(Svc.now());
        try { store.updateRecord(Category.fromWire(r.type()), r.id(), r); }
        catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
        return r;
    }
    public Record deleteNote(String id, String noteId) {
        Record r = findAnyMust(id);
        boolean removed = r.notes().removeIf(x -> x.id().equals(noteId));
        if (!removed) throw new HttpError(404, "note_not_found", "笔记不存在：" + noteId);
        r.setUpdatedAt(Svc.now());
        try { store.updateRecord(Category.fromWire(r.type()), r.id(), r); }
        catch (RuntimeException e) { throw new HttpError(500, "internal_error", "数据写入失败"); }
        return r;
    }

    // ---------- 查询 ----------
    public static final class Filter {
        public String q, tag, status, subject;
        public Boolean pinned;
        public LocalDate dueFrom, dueTo;
        public String sort = "updatedAt", order = "desc";
        public int page = 1, size = 30;
    }
    public static final class Result {
        public final List<Record> items; public final int total; public final int page; public final int size;
        public Result(List<Record> it, int t, int p, int s) { items = it; total = t; page = p; size = s; }
    }

    public Result list(Category c, Filter f) {
        List<Record> all = store.snapshot(c);
        String ql = f.q == null ? null : f.q.toLowerCase();
        List<Record> out = new ArrayList<>();
        for (Record r : all) {
            if (ql != null && !(r.title().toLowerCase().contains(ql)
                    && (r.content() == null || r.content().toLowerCase().contains(ql) || true))) {
                // 简化：title 或 content 任一含即可
                if (!(r.title() != null && r.title().toLowerCase().contains(ql))
                    && !(r.content() != null && r.content().toLowerCase().contains(ql))) continue;
            }
            if (f.tag != null && !r.tags().contains(f.tag)) continue;
            if (f.status != null) {
                boolean hit = false;
                for (String s : f.status.split(",")) { s = s.trim(); if (s.equals(r.status())) { hit = true; break; } }
                if (!hit) continue;
            }
            if (f.subject != null && c == Category.KNOWLEDGE) {
                String subj = r.subject() == null ? "" : r.subject();
                if (!subj.equals(f.subject) && !subj.startsWith(f.subject + "/")) continue;
            }
            if (f.pinned != null && r.pinned() != f.pinned) continue;
            if (c == Category.TODO && (f.dueFrom != null || f.dueTo != null)) {
                if (r.dueDate() == null) continue;
                LocalDate d = LocalDate.parse(r.dueDate());
                if (f.dueFrom != null && d.isBefore(f.dueFrom)) continue;
                if (f.dueTo != null && d.isAfter(f.dueTo)) continue;
            }
            out.add(r);
        }
        out.sort(newComparator(c, f.sort, "desc".equals(f.order)));
        int total = out.size();
        int from = Math.min((f.page - 1) * f.size, total);
        int to = Math.min(from + f.size, total);
        return new Result(new ArrayList<>(out.subList(from, to)), total, f.page, f.size);
    }

    static Comparator<Record> newComparator(Category c, String sort, boolean desc) {
        Comparator<Record> base = switch (sort) {
            case "createdAt" -> Comparator.comparing(Record::createdAt, Comparator.nullsLast(Comparator.naturalOrder()));
            case "title"     -> Comparator.comparing(Record::title, Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER));
            case "dueDate"   -> (a, b) -> {
                String s = a.dueDate(), t = b.dueDate();
                if (s == null && t == null) return 0;
                if (s == null) return 1;
                if (t == null) return -1;
                return s.compareTo(t);
            };
            default -> Comparator.comparing(Record::updatedAt, Comparator.nullsLast(Comparator.naturalOrder()));
        };
        Comparator<Record> main = desc ? base.reversed() : base;
        return new Comparator<Record>() {
            @Override
            public int compare(Record a, Record b) {
                int p = Boolean.compare(b.pinned(), a.pinned());
                if (p != 0) return p;
                int m = main.compare(a, b);
                if (m != 0) return m;
                return a.id().compareTo(b.id());
            }
        };
    }

    public static final class RandomResult {
        public final List<Record> records; public final int poolSize; public final boolean exhausted; public final String pickedAt;
        public RandomResult(List<Record> r, int p, boolean e, String pa) { records = r; poolSize = p; exhausted = e; pickedAt = pa; }
    }

    public RandomResult random(Category c, int count, Set<String> exclude) {
        if (c != Category.KNOWLEDGE && c != Category.INSPIRATION)
            throw new HttpError(400, "invalid_type", "随机回顾仅支持 knowledge/inspiration");
        List<Record> eligible = new ArrayList<>();
        for (Record r : store.snapshot(c)) {
            if (c == Category.INSPIRATION && !"active".equals(r.status())) continue;
            if (c == Category.KNOWLEDGE && !("learning".equals(r.status()) || "mastered".equals(r.status()))) continue;
            eligible.add(r);
        }
        int poolSize = eligible.size();
        List<Record> pool = new ArrayList<>();
        boolean exhausted = false;
        for (Record r : eligible) {
            if (exclude == null || !exclude.contains(r.id())) pool.add(r);
        }
        if (pool.isEmpty() && poolSize > 0) {
            pool = new ArrayList<>(eligible);
            exhausted = true;
        }
        if (pool.isEmpty()) return new RandomResult(new ArrayList<>(), 0, false, Svc.now());
        Collections.shuffle(pool);
        if (count >= pool.size()) return new RandomResult(pool, pool.size(), exhausted, Svc.now());
        return new RandomResult(new ArrayList<>(pool.subList(0, count)), pool.size(), exhausted, Svc.now());
    }

    // ---------- 元数据 ----------
    public List<Map<String, Object>> metaCategories() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Category c : Category.values()) {
            Map<String, Object> one = new LinkedHashMap<>();
            one.put("type", c.wire());
            one.put("label", c.label());
            List<Map<String, Object>> statuses = new ArrayList<>();
            String actionLabel = switch (c) {
                case INSPIRATION -> "归档";
                case QUESTION    -> "标记已解决";
                case KNOWLEDGE   -> "标记已掌握";
                case TODO        -> "标记完成";
            };
            for (String s : c.allowedStatuses()) {
                Map<String, Object> st = new LinkedHashMap<>();
                st.put("value", s);
                st.put("label", statusLabel(c, s));
                statuses.add(st);
            }
            one.put("statuses", statuses);
            one.put("defaultStatus", c.defaultStatus());
            one.put("statusActionLabel", actionLabel);
            one.put("fields", switch (c) {
                case KNOWLEDGE -> List.of("subject", "source");
                case QUESTION  -> List.of("source");
                case TODO      -> List.of("dueDate", "priority");
                default        -> List.of();
            });
            one.put("randomEligible", c == Category.INSPIRATION || c == Category.KNOWLEDGE);
            list.add(one);
        }
        return list;
    }

    private static String statusLabel(Category c, String s) {
        if (c == Category.INSPIRATION) return "active".equals(s) ? "活跃" : "已归档";
        if (c == Category.QUESTION)    return "open".equals(s) ? "待解决" : "已解决";
        if (c == Category.KNOWLEDGE)   return "learning".equals(s) ? "学习中" : "已掌握";
        // todo
        return switch (s) { case "done" -> "已完成"; case "cancelled" -> "已取消"; default -> "待办"; };
    }

    public Map<String, Object> metaTags(Category c) {
        Map<String, Integer> counts = new TreeMap<>();
        if (c == null) {
            for (Category cat : Category.values())
                for (Record r : store.snapshot(cat)) for (String t : r.tags()) counts.merge(t, 1, Integer::sum);
        } else {
            for (Record r : store.snapshot(c)) for (String t : r.tags()) counts.merge(t, 1, Integer::sum);
        }
        List<Map<String, Object>> tags = new ArrayList<>();
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            Map<String, Object> one = new LinkedHashMap<>();
            one.put("tag", e.getKey());
            one.put("count", e.getValue());
            tags.add(one);
        }
        tags.sort((a, b) -> {
            int cmp = Integer.compare((Integer) b.get("count"), (Integer) a.get("count"));
            return cmp != 0 ? cmp : ((String) a.get("tag")).compareTo((String) b.get("tag"));
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tags", tags);
        out.put("total", tags.size());
        out.put("type", c == null ? null : c.wire());
        return out;
    }

    public Map<String, Object> metaSubjects() {
        Map<String, int[]> ownCount = new HashMap<>();
        for (Record r : store.snapshot(Category.KNOWLEDGE)) {
            if (r.subject() == null || r.subject().isBlank()) continue;
            ownCount.merge(r.subject(), new int[]{1}, (a, b) -> { a[0] += b[0]; return a; });
        }
        List<String> paths = new ArrayList<>(ownCount.keySet());
        // depth-first: compare segment by segment
        paths.sort((a, b) -> {
            String[] pa = a.split("/"), pb = b.split("/");
            int n = Math.min(pa.length, pb.length);
            for (int i = 0; i < n; i++) {
                int c = pa[i].compareTo(pb[i]);
                if (c != 0) return c;
            }
            return Integer.compare(pa.length, pb.length);
        });
        // subtree counts: process from deepest to shallowest, add ownCount to each ancestor
        Map<String, Integer> subtree = new HashMap<>();
        for (String p : paths) subtree.put(p, ownCount.get(p)[0]);
        // sort descending by depth to propagate child counts upward
        List<String> byDepth = new ArrayList<>(paths);
        byDepth.sort((a, b) -> Integer.compare(b.split("/").length, a.split("/").length));
        for (String p : byDepth) {
            String[] parts = p.split("/");
            for (int i = parts.length - 1; i > 0; i--) {
                String parent = String.join("/", Arrays.copyOf(parts, i));
                if (ownCount.containsKey(parent)) {
                    subtree.put(parent, subtree.get(parent) + ownCount.get(p)[0]);
                }
            }
        }
        List<Map<String, Object>> flat = new ArrayList<>();
        for (String p : paths) {
            Map<String, Object> one = new LinkedHashMap<>();
            String[] parts = p.split("/");
            one.put("path", p);
            one.put("name", parts[parts.length - 1]);
            one.put("depth", parts.length - 1);
            one.put("ownCount", ownCount.get(p)[0]);
            one.put("count", subtree.get(p));
            flat.add(one);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("subjects", flat);
        out.put("total", flat.size());
        return out;
    }
}
