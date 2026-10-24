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

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.pouch.model.Category;
import com.pouch.model.Record;
import com.pouch.model.WishItem;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.Comparator;

/**
 * 存储层。5 个 JSON 文件的内存索引 + 每文件独立读写锁 + 原子写 + 备份 + 损坏恢复（01 §1.6/1.7）。
 *
 * 一致性约定：
 * - byId 与 ordered 必须同步维护；外部代码拿到的是不可变副本
 * - 写方法（insert/update/delete）在持有 writeLock 时完成"改内存 → 序列化 → 备份 → 原子替换"
 * - 每次整文件写入前备份一份到 .backup/，保留 50 份
 * - 启动时若解析失败，按最新到最旧尝试备份恢复，恢复后损坏文件改名为 .corrupt 供人工排查
 * - 多个数据文件之间的锁按 Category 声明序获取（本 ticket 不跨类别移动，暂无死锁风险；为将来 ADR
 *   保留"固定加锁顺序"策略）
 *
 * 命名空间的记录文件字段名是 records，心愿单是 items（区别在 seed/serialize 里）。
 */
public class JsonStore {

    /** 单文件内存索引 + 独立读写锁。 */
    private static final class FileSlot<T> {
        final List<T> items = new ArrayList<>();   // 按文件顺序
        volatile String lastUpdatedAt;             // 顶层 updatedAt（可选）
        final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    }

    private static final int VERSION = 1;
    /** 备份保留数量（01 §1.7.3） */
    private static final int BACKUP_KEEP = 50;
    private static final String BACKUP_DIR = ".backup";
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_OFFSET_DATE_TIME;
    private static final DateTimeFormatter BACKUP_TS = DateTimeFormatter
            .ofPattern("yyyyMMdd-HHmmss-SSS").withZone(ZoneId.systemDefault());
    private static final List<String> startupWarnings = new ArrayList<>();

    private final Path dataDir;
    private final Path backupDir;
    private final Map<Category, FileSlot<Record>> recordSlots = new EnumMap<>(Category.class);
    private final FileSlot<WishItem> wishSlot = new FileSlot<>();
    private final Gson gson = new GsonBuilder().disableHtmlEscaping().setPrettyPrinting().create();

    public JsonStore(Path dataDir) {
        this.dataDir = dataDir.toAbsolutePath().normalize();
        this.backupDir = dataDir.resolve(BACKUP_DIR);
        for (Category c : Category.values()) recordSlots.put(c, new FileSlot<>());
    }

    public Path dataDir() { return dataDir; }

    /** 启动期间收集的告警（MetaHandler /api/health 的 warnings 字段直接读此）。 */
    public List<String> loadWarnings() { return List.copyOf(startupWarnings); }

    /**
     * 启动加载：创建 dataDir/.backup，逐文件读取并建立索引。
     *  - 文件不存在 → 写空种子（version=1、updatedAt=now、空数组）
     *  - 文件存在但解析失败 → 走备份恢复；无备份可用 → 空数据启动 + warning
     *  - 全部类别载入后做一次重复 id 全局检测（01 §1.8.1 兜底）
     */
    public void load() throws IOException {
        Files.createDirectories(dataDir);
        Files.createDirectories(backupDir);

        for (Category c : Category.values()) {
            Path p = dataDir.resolve(c.fileName());
            if (!Files.exists(p)) {
                try {
                    Files.writeString(p, seed("records"), StandardCharsets.UTF_8);
                } catch (IOException e) {
                    throw new StoreException(p, "无法创建空种子 " + c.fileName(), e);
                }
                System.out.println("[init] " + c.label() + "（" + c.fileName() + "）不存在，已创建空文件");
            }
        }
        Path wp = dataDir.resolve(Category.WISHLIST_FILE);
        if (!Files.exists(wp)) {
            try {
                Files.writeString(wp, seed("items"), StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw new StoreException(wp, "无法创建空种子 wishlist.json", e);
            }
            System.out.println("[init] 心愿单（wishlist.json）不存在，已创建空文件");
        }

        boolean loadFailed = false;
        for (Category c : Category.values()) {
            if (!loadSlot(recordSlots.get(c), dataDir.resolve(c.fileName()), "records", Record.class)) loadFailed = true;
        }
        if (!loadSlot(wishSlot, dataDir.resolve(Category.WISHLIST_FILE), "items", WishItem.class)) loadFailed = true;
        if (loadFailed) {
            // 有一类以空数据启动（文件损坏且无可用备份）——不算致命，服务照常
            // 有 warning，health 会告诉前端
        }
        detectDuplicateIdsAfterLoad();
    }

    /** 文件不存在才写；返回 true 表示成功建索引。 */
    private <T> boolean loadSlot(FileSlot<T> slot, Path path, String arrayField, Class<T> elemType) {
        if (!Files.exists(path)) return false;
        String json;
        try { json = Files.readString(path, StandardCharsets.UTF_8); }
        catch (IOException e) {
            startupWarnings.add("⚠ 无法读取 " + path.getFileName() + "：" + e.getMessage());
            return false;
        }
        JsonObject root;
        List<T> parsed = null;
        try {
            root = JsonParserTry.parseObject(json);
            JsonElement arr = root.get(arrayField);
            if (arr != null && arr.isJsonArray()) {
                parsed = new ArrayList<>();
                for (JsonElement e : arr.getAsJsonArray()) parsed.add(gson.fromJson(e, elemType));
            } else {
                root = null; // 顶层结构缺字段，不算 fatal——以下方恢复尝试覆盖
            }
        } catch (Exception parseEx) {
            root = null;
        }
        slot.lock.writeLock().lock();
        try {
            if (root != null) {
                String updatedAt = root.has("updatedAt") && root.get("updatedAt").isJsonPrimitive()
                        ? root.get("updatedAt").getAsString() : null;
                slot.lastUpdatedAt = updatedAt;
                slot.items.clear();
                slot.items.addAll(parsed);
                return true;
            }
        } finally {
            slot.lock.writeLock().unlock();
        }
        // 解析失败 → 走备份恢复
        Path recovered = tryRestoreFromBackup(path, elemType, arrayField);
        if (recovered != null) {
            String backupName = recovered.getFileName().toString();
            Path corrupt = path.resolveSibling(path.getFileName().toString() + ".corrupt");
            try {
                // 顺序严格遵守：先把损坏文件改名 .corrupt，再写恢复内容——
                // 若反过来（先覆盖再改名），下一次试图改名的动作
                // 拿到的是"已恢复的干净文件"，损坏文件内容就永久丢失了。
                recoverInPlace(path, corrupt, recovered, elemType, arrayField, slot);
                startupWarnings.add("[告警] " + path.getFileName() + " 已损坏，已从备份 " + backupName + " 恢复；损坏文件保留为 " + corrupt.getFileName());
                System.err.println("[WARN] " + path.getFileName() + " 已损坏，已从备份 " + backupName + " 恢复；损坏文件保留为 " + corrupt);
                return true;
                      } catch (IOException e) {
                startupWarnings.add("\u26a0 从备份恢复 " + path.getFileName() + " 写盘失败：" + e.getMessage());
                System.err.println("[WARN] " + path.getFileName() + " 备份恢复写盘失败：" + e.getMessage());
            } catch (Exception e) {
                startupWarnings.add("\u26a0 从备份恢复 " + path.getFileName() + " 时解析备份失败：" + e.getMessage());
                System.err.println("[WARN] " + path.getFileName() + " 备份恢复解析失败：" + e.getMessage());
            }
        }
        slot.lock.writeLock().lock();
        try {
            slot.items.clear();
            slot.lastUpdatedAt = null;
        } finally {
            slot.lock.writeLock().unlock();
        }
        startupWarnings.add("\u26a0 " + path.getFileName() + " 已损坏且所有备份不可用，本类别以空数据启动");
        System.err.println("[WARN] " + path.getFileName() + " 所有备份均不可用，以空数据启动");
        return false;
    }


    /** 备份恢复：按 mtime 从新到旧尝试解析，返回第一份成功的备份路径；全部失败返回 null。 */
    private Path tryRestoreFromBackup(Path target, Class<?> elemType, String arrayField) {
        if (!Files.isDirectory(backupDir)) return null;
        String baseName = stripJsonExt(target.getFileName().toString());
        List<Path> candidates;
        try (Stream<Path> s = Files.list(backupDir)) {
            candidates = s.filter(p -> {
                String f = p.getFileName().toString();
                return f.startsWith(baseName + ".") && f.endsWith(".json");
            }).sorted((a, b) -> {
                try {
                    long ta = Files.getLastModifiedTime(a).toMillis();
                    long tb = Files.getLastModifiedTime(b).toMillis();
                    return Long.compare(tb, ta); // 新 → 旧
                } catch (IOException e) { return 0; }
            }).collect(Collectors.toList());
        } catch (IOException e) {
            return null;
        }
        for (Path cand : candidates) {
            try {
                String s = Files.readString(cand, StandardCharsets.UTF_8);
                JsonObject root = JsonParserTry.parseObject(s);
                JsonElement arr = root.get(arrayField);
                if (arr == null || !arr.isJsonArray()) continue;
                return cand;
            } catch (Exception ignore) { /* 继续找下一份 */ }
        }
        return null;
    }

    /** 说明：loadSlot 里"先把损坏文件改名 → 再写恢复内容"的完善版本。 */
    private <T> void recoverInPlace(Path target, Path corruptSlot, Path recovered,
                                    Class<T> elemType, String arrayField, FileSlot<T> slot) throws IOException {
        // 若 corruptSlot 已存在（前次就已改名过），直接覆盖
        Files.move(target, corruptSlot, StandardCopyOption.REPLACE_EXISTING);
        Files.copy(recovered, target, StandardCopyOption.REPLACE_EXISTING);
        // 上面一行把原损坏文件挪到 .corrupt，恢复内容覆回 target
        String restored = Files.readString(target, StandardCharsets.UTF_8);
        JsonObject rroot = JsonParserTry.parseObject(restored);
        JsonElement arr = rroot.get(arrayField);
        List<T> restoredList = new ArrayList<>();
        for (JsonElement e : arr.getAsJsonArray()) restoredList.add(gson.fromJson(e, elemType));
        slot.lock.writeLock().lock();
        try {
            slot.items.clear();
            slot.items.addAll(restoredList);
            slot.lastUpdatedAt = rroot.has("updatedAt") ? rroot.get("updatedAt").getAsString() : null;
        } finally {
            slot.lock.writeLock().unlock();
        }
    }

    private static class JsonParserTry {
        static JsonObject parseObject(String s) throws IOException {
            JsonElement e = com.google.gson.JsonParser.parseString(s);
            if (!e.isJsonObject()) throw new IOException("顶层不是 JSON 对象");
            return e.getAsJsonObject();
        }
    }

    private static String stripJsonExt(String fname) {
        int i = fname.lastIndexOf('.');
        return i > 0 ? fname.substring(0, i) : fname;
    }

    /** 5 个数据文件缺失时的合法空种子 JSON。 */
    private static String seed(String arrayField) {
        String now = OffsetDateTime.now().format(ISO);
        return "{\n" +
               "  \"version\": " + VERSION + ",\n" +
               "  \"updatedAt\": \"" + now + "\",\n" +
               "  \"" + arrayField + "\": []\n" +
               "}";
    }

    /** 启动时跨类别重复 id 检测（01 §1.8.1）：进入 warning，保留 updatedAt 最新的一份。 */
    private void detectDuplicateIdsAfterLoad() {
        Map<String, List<Record>> byId = new LinkedHashMap<>();
        for (Category c : Category.values()) {
            for (Record r : all(c)) byId.computeIfAbsent(r.id(), k -> new ArrayList<>()).add(r);
        }
        for (Map.Entry<String, List<Record>> kv : byId.entrySet()) {
            List<Record> list = kv.getValue();
            if (list.size() <= 1) continue;
            list.sort((a, b) -> {
                String ua = a.updatedAt() == null ? "" : a.updatedAt();
                String ub = b.updatedAt() == null ? "" : b.updatedAt();
                return ub.compareTo(ua);
            });
            Record keep = list.get(0);
            for (int i = 1; i < list.size(); i++) {
                Record drop = list.get(i);
                removeRecordSilent(Category.valueOf(drop.type()), drop.id());
                startupWarnings.add("⚠ 检测到跨文件重复 id " + drop.id()
                        + "（保留 type=" + keep.type() + "，丢弃 type=" + drop.type() + "）");
            }
        }
    }

    private void removeRecordSilent(Category c, String id) {
        FileSlot<Record> slot = recordSlots.get(c);
        slot.lock.writeLock().lock();
        boolean removed = slot.items.removeIf(r -> id.equals(r.id()));
        slot.lock.writeLock().unlock();
        if (removed) {
            try {
                // 内存改了就刷盘（把重复项排除出去）
                writeThroughRecord(c);
            } catch (Exception e) {
                // 初始化期忽略写失败——下次启动再检测即可
                System.err.println("[WARN] 去重后写 " + c.fileName() + " 失败：" + e.getMessage());
            }
        }
    }

    // ============================================================
    // 只读访问（现有 API 保持不变）
    // ============================================================

    public List<Record> all(Category c) {
        FileSlot<Record> slot = recordSlots.get(c);
        slot.lock.readLock().lock();
        try { return List.copyOf(slot.items); }
        finally { slot.lock.readLock().unlock(); }
    }

    public List<WishItem> allWishes() {
        wishSlot.lock.readLock().lock();
        try { return List.copyOf(wishSlot.items); }
        finally { wishSlot.lock.readLock().unlock(); }
    }

    public int count(Category c) {
        FileSlot<Record> slot = recordSlots.get(c);
        slot.lock.readLock().lock();
        try { return slot.items.size(); }
        finally { slot.lock.readLock().unlock(); }
    }

    public int countWishes() {
        wishSlot.lock.readLock().lock();
        try { return wishSlot.items.size(); }
        finally { wishSlot.lock.readLock().unlock(); }
    }

    /** 只读快照（别名，语义同 {@link #all(Category)}）。 */
    public List<Record> snapshot(Category c) { return all(c); }

    /** 只读快照（心愿单，语义同 {@link #allWishes()}）。 */
    public List<WishItem> wishesSnapshot() { return allWishes(); }

        // ============ Ticket 02 Batch C · 写方法 ============

    /** 全局查找（不区分类别）；没找到返 null。 */
    public Record findAny(String id) {
        for (Category c : Category.values())
            for (Record r : recordSlots.get(c).items) if (r.id().equals(id)) return r;
        return null;
    }
    public WishItem findWish(String id) {
        wishSlot.lock.readLock().lock();
        try {
            for (WishItem w : wishSlot.items) if (id.equals(w.id())) return w;
            return null;
        } finally { wishSlot.lock.readLock().unlock(); }
    }
    public int maxWishSortIndex() {
        int m = -1;
        for (WishItem w : wishSlot.items) m = Math.max(m, w.sortIndex());
        return m;
    }

    // ============================================================
    // 写方法（7 个）
    // ============================================================

    /** 新增记录到某类别文件末尾。record 的 id/createdAt/updatedAt/status 须由 Service 先填。 */
    public void insertRecord(Category c, Record record) {
        FileSlot<Record> slot = recordSlots.get(c);
        slot.lock.writeLock().lock();
        try {
            slot.items.add(record);
            writeThroughRecord(c);
        } finally {
            slot.lock.writeLock().unlock();
        }
    }

    /** 更新已存在的记录（by ordered 顺序替换）。record.id() 必须与现有某条相等，否则当新增。 */
    public void updateRecord(Category c, Record record) {
        FileSlot<Record> slot = recordSlots.get(c);
        slot.lock.writeLock().lock();
        try {
            for (int i = 0; i < slot.items.size(); i++) {
                if (record.id().equals(slot.items.get(i).id())) {
                    slot.items.set(i, record);
                    break;
                }
            }
            writeThroughRecord(c);
        } finally {
            slot.lock.writeLock().unlock();
        }
    }

    /** 兼容旧调用：按 id 定位后整体替换记录对象。 */
    public void updateRecord(Category c, String id, Record record) {
        FileSlot<Record> slot = recordSlots.get(c);
        slot.lock.writeLock().lock();
        try {
            for (int i = 0; i < slot.items.size(); i++) {
                if (id.equals(slot.items.get(i).id())) {
                    slot.items.set(i, record);
                    break;
                }
            }
            writeThroughRecord(c);
        } finally {
            slot.lock.writeLock().unlock();
        }
    }

    /** 硬删除记录。返回 true = 存在且已删。 */
    public boolean deleteRecord(Category c, String id) {
        FileSlot<Record> slot = recordSlots.get(c);
        slot.lock.writeLock().lock();
        try {
            boolean removed = slot.items.removeIf(r -> id.equals(r.id()));
            if (removed) writeThroughRecord(c);
            return removed;
        } finally {
            slot.lock.writeLock().unlock();
        }
    }

    /** 心愿条目：追加到末尾。 */
    public void insertWish(WishItem item) {
        wishSlot.lock.writeLock().lock();
        try {
            wishSlot.items.add(item);
            writeThroughWish();
        } finally {
            wishSlot.lock.writeLock().unlock();
        }
    }

    /** 心愿条目：顺序替换（已有 id 才更新；不存在则忽略，业务层应先校验）*/
    public void updateWish(WishItem item) {
        wishSlot.lock.writeLock().lock();
        try {
            for (int i = 0; i < wishSlot.items.size(); i++) {
                if (item.id().equals(wishSlot.items.get(i).id())) {
                    wishSlot.items.set(i, item);
                    break;
                }
            }
            writeThroughWish();
        } finally {
            wishSlot.lock.writeLock().unlock();
        }
    }

    /** 兼容旧调用：按 id 定位后整体替换。 */
    public void updateWish(String id, WishItem item) {
        wishSlot.lock.writeLock().lock();
        try {
            for (int i = 0; i < wishSlot.items.size(); i++) {
                if (id.equals(wishSlot.items.get(i).id())) {
                    wishSlot.items.set(i, item);
                    break;
                }
            }
            writeThroughWish();
        } finally {
            wishSlot.lock.writeLock().unlock();
        }
    }

    /** 心愿条目：删除。返回 true = 删除发生。 */
    public boolean deleteWish(String id) {
        wishSlot.lock.writeLock().lock();
        try {
            boolean removed = wishSlot.items.removeIf(w -> id.equals(w.id()));
            if (removed) writeThroughWish();
            return removed;
        } finally {
            wishSlot.lock.writeLock().unlock();
        }
    }

    /**
     * 跨类别移动一条记录（01 §1.8.1）。全系统**唯一跨文件**写。
     *
     * 语义：先在目标类别 append 一条保留原 id 的新 Record（type/clearForeignFields
     * 由 Service 层保证已经校正），原子写目标文件；随后从源类别删除，原子写源文件。
     *
     * 加锁顺序：按 {@link Category#ordinal()} 升序获取两把写锁。Category 的声明序
     * 是 INSPIRATION < QUESTION < KNOWLEDGE < TODO，两个并发的 A→B 与 B→A 移动都会按相同的
     * 枚举序持锁，避免死锁（01 §1.8.1 唯一跨文件操作的明确约定）。
     *
     * 最坏情况（写目标成功、写源文件前进程崩溃）：id 会**同时**存在于两个文件。
     * 启动时 {@link #detectDuplicateIdsAfterLoad()} 会识别并告警——比"直接丢失"更容易发现。
     * 本方法不包含重复 id 检测职责。
     *
     * @return 若源文件原本没有该 id 则返回 false（即不是真正的"移动"，目标记录了
     *         插入但源删除是 no-op）。调用方（Service）负责先 findRecord 校验存在。
     */
    public boolean moveRecord(Category from, Category to, String id, Record record) {
        if (from == null || to == null || id == null || record == null) return false;
        if (from == to) {
            // 同类别"移动"语义上退化为 update；此处不处理，交给 Service 层清分支
            return false;
        }
        // 固定锁顺序：Category.ORDINAL 升序获取两把写锁，避免死锁（01 §1.8.1）
        FileSlot<Record> fromSlot = recordSlots.get(from);
        FileSlot<Record> toSlot   = recordSlots.get(to);
        FileSlot<Record> firstSlot  = from.ordinal() <= to.ordinal() ? fromSlot : toSlot;
        FileSlot<Record> secondSlot = (firstSlot == fromSlot) ? toSlot : fromSlot;
        firstSlot.lock.writeLock().lock();
        try {
            secondSlot.lock.writeLock().lock();
            try {
                // 1. 先在目标文件 append（保留 record.id() 不变；Service 已校正 type）
                toSlot.items.add(record);
                // 2. 原子写目标文件
                Path targetPath = dataDir.resolve(to.fileName());
                atomicWrite(targetPath, serializeRecords(toSlot));
                // 3. 从源文件删除
                boolean removed = removeFromSlot(fromSlot, id);
                // 4. 原子写源文件
                Path sourcePath = dataDir.resolve(from.fileName());
                atomicWrite(sourcePath, serializeRecords(fromSlot));
                return removed;
            } finally {
                secondSlot.lock.writeLock().unlock();
            }
        } finally {
            firstSlot.lock.writeLock().unlock();
        }
    }

    /** 不加锁版本：从 slot.items 移除匹配 id 的条目，返回是否发生过移除。调用方须已持有该 slot 的写锁。 */
    private boolean removeFromSlot(FileSlot<Record> slot, String id) {
        return slot.items.removeIf(r -> id.equals(r.id()));
    }

    // ============================================================
    // 原子写核心
    // ============================================================

    /** 写某类别记录文件。调用方须已持有对应 slot 的 writeLock。 */
    void writeThroughRecord(Category c) {
        FileSlot<Record> slot = recordSlots.get(c);
        Path target = dataDir.resolve(c.fileName());
        String json = serializeRecords(slot);
        atomicWrite(target, json);
    }

    /** 写 wishlist.json。调用方须已持有 wishSlot 的 writeLock。 */
    void writeThroughWish() {
        Path target = dataDir.resolve(Category.WISHLIST_FILE);
        String json = serializeWishes();
        atomicWrite(target, json);
    }

    private String serializeRecords(FileSlot<Record> slot) {
        JsonObject root = new JsonObject();
        root.addProperty("version", VERSION);
        root.addProperty("updatedAt", nowIso());
        JsonArray arr = new JsonArray();
        for (Record r : slot.items) arr.add(gson.toJsonTree(r));
        root.add("records", arr);
        return gson.toJson(root);
    }

    private String serializeWishes() {
        JsonObject root = new JsonObject();
        root.addProperty("version", VERSION);
        root.addProperty("updatedAt", nowIso());
        JsonArray arr = new JsonArray();
        for (WishItem w : wishSlot.items) arr.add(gson.toJsonTree(w));
        root.add("items", arr);
        return gson.toJson(root);
    }

    /**
     * 备份 → 序列化字节已在内存里 → 写同目录 tmp → force(true) → 原子 rename → 失败则清理 tmp。
     * 调用方须已持有对应 slot 的 writeLock（避免两个并发写各自备份冲突）。
     */
    void atomicWrite(Path target, String content) {
        // 1. 备份（仅当目标存在且非空）
        if (Files.exists(target)) {
            try {
                long len = Files.size(target);
                if (len > 0) {
                    String ts = BACKUP_TS.format(LocalDateTime.now());
                    Path backup = backupDir.resolve(stripJsonExt(target.getFileName().toString()) + "." + ts + ".json");
                    Files.copy(target, backup, StandardCopyOption.REPLACE_EXISTING);
                    pruneBackups(target);
                }
            } catch (IOException e) {
                throw new StoreException(target, "备份失败：" + e.getMessage(), e);
            }
        }
        // 2. 写 tmp（同目录，保证 ATOMIC_MOVE 有效）
        Path tmp = target.resolveSibling(target.getFileName() + ".tmp-" + Instant.now().toEpochMilli() + "-" + Thread.currentThread().getId());
        try {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            Files.write(tmp, bytes, StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING);
            // 3. force(true)
            try (FileChannel ch = FileChannel.open(tmp, StandardOpenOption.READ)) {
                ch.force(true);
            }
            // 4. 原子替换
            try {
                Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException amns) {
                // 极罕见的文件系统（如某些网络盘）不支持 ATOMIC_MOVE；退化为 REPLACE_EXISTING
                Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            try { Files.deleteIfExists(tmp); } catch (IOException ignored) {}
            throw new StoreException(target, "原子写失败：" + e.getMessage(), e);
        }
    }

    /** 备份保留 50 份：超出的删最旧。按 mtime 排序比按文件名更稳（同名冲突时秒级损坏）。 */
    private void pruneBackups(Path target) {
        String base = stripJsonExt(target.getFileName().toString());
        try (Stream<Path> s = Files.list(backupDir)) {
            List<Path> list = s.filter(p -> {
                String f = p.getFileName().toString();
                return f.startsWith(base + ".") && f.endsWith(".json");
            }).collect(Collectors.toList());
            if (list.size() <= BACKUP_KEEP) return;
            list.sort((a, b) -> {
                try {
                    return Long.compare(
                            Files.getLastModifiedTime(a).toMillis(),
                            Files.getLastModifiedTime(b).toMillis());
                } catch (IOException e) { return 0; }
            });
            int toDelete = list.size() - BACKUP_KEEP;
            for (int i = 0; i < toDelete; i++) {
                try { Files.deleteIfExists(list.get(i)); } catch (IOException ignored) {}
            }
        } catch (IOException ignored) {}
    }

    private static String nowIso() {
        return OffsetDateTime.now().format(ISO);
    }
}
