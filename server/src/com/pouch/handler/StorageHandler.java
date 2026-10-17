package com.pouch.handler;

import com.pouch.Respond;
import com.pouch.HttpError;
import com.pouch.model.Category;
import com.pouch.store.JsonStore;
import com.sun.net.httpserver.HttpExchange;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * /api/storage/* —— 存储与备份管理（用户故事：设置页）。
 *
 * - GET    /api/storage/info        返回 dataSize / backupSize / dataDir
 * - POST   /api/storage/open-folder  在系统资源管理器中打开数据目录
 * - POST   /api/storage/clear-backups 清除 .backup/ 下全部备份文件
 */
public class StorageHandler implements Handler {

    private final JsonStore store;
    public StorageHandler(JsonStore store) { this.store = store; }

    @Override
    public void handle(HttpExchange ex, Map<String, String> pp) throws IOException {
        String m = ex.getRequestMethod();
        if ("GET".equals(m)) {
            handleInfo(ex);
            return;
        }
        if ("POST".equals(m)) {
            String action = pp.get("action");
            if ("open-folder".equals(action)) {
                handleOpenFolder(ex);
                return;
            }
            if ("clear-backups".equals(action)) {
                handleClearBackups(ex);
                return;
            }
        }
        Respond.error(ex, 405, "method_not_allowed", "unsupported " + m);
    }

    private void handleInfo(HttpExchange ex) throws IOException {
        Path dataDir = store.dataDir();
        Path backupDir = dataDir.resolve(".backup");

        long backupSize = dirSize(backupDir);
        long dataSize = dirSize(dataDir) - backupSize;  // 数据文件不包含备份

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("dataSize", dataSize);
        body.put("backupSize", backupSize);
        body.put("dataDir", dataDir.toString());
        Respond.json(ex, 200, body);
    }

    private void handleOpenFolder(HttpExchange ex) throws IOException {
        Path dataDir = store.dataDir();
        if (!Files.isDirectory(dataDir)) {
            throw new HttpError(404, "not_found", "数据目录不存在：" + dataDir);
        }
        if (!Desktop.isDesktopSupported() || !Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
            throw new HttpError(500, "unsupported", "当前环境不支持打开文件夹");
        }
        Desktop.getDesktop().open(dataDir.toFile());
        Respond.json(ex, 200, Map.of("opened", dataDir.toString()));
    }

    private void handleClearBackups(HttpExchange ex) throws IOException {
        Path backupDir = store.dataDir().resolve(".backup");
        if (!Files.isDirectory(backupDir)) {
            Respond.json(ex, 200, Map.of("cleared", 0, "freedBytes", 0L));
            return;
        }
        long freed = 0;
        int count = 0;
        List<Path> files;
        try (Stream<Path> s = Files.list(backupDir)) {
            files = s.filter(Files::isRegularFile).collect(Collectors.toList());
        }
        for (Path f : files) {
            try {
                freed += Files.size(f);
                Files.delete(f);
                count++;
            } catch (IOException ignored) {
                // 单个文件删除失败不中断整体
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("cleared", count);
        body.put("freedBytes", freed);
        Respond.json(ex, 200, body);
    }

    /** 递归计算目录总大小（不存在则返回 0）。 */
    private long dirSize(Path dir) {
        if (!Files.isDirectory(dir)) return 0L;
        try (Stream<Path> s = Files.walk(dir)) {
            return s.filter(Files::isRegularFile)
                    .mapToLong(p -> {
                        try { return Files.size(p); }
                        catch (IOException e) { return 0L; }
                    })
                    .sum();
        } catch (IOException e) {
            return 0L;
        }
    }
}
