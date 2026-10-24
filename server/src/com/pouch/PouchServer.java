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
package com.pouch;

import com.pouch.handler.Handler;
import com.pouch.handler.MetaHandler;
import com.pouch.handler.StaticHandler;
import com.pouch.model.Category;
import com.pouch.store.JsonStore;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.Executors;
import com.pouch.handler.RecordsHandler;
import com.pouch.handler.RecordsNoteHandler;
import com.pouch.handler.StorageHandler;
import com.pouch.handler.StatsHandler;
import com.pouch.handler.WishlistHandler;
import com.pouch.handler.StatsHandler;
import com.pouch.Requests;


/**
 * 服务入口（阶段 0 骨架）。
 *
 * 阶段 0 只实现"能跑"的最小集合：启动参数、数据目录初始化、静态托管、/api/health、
 * 其余 /api/* 尚不存在（404 未知端点，各页面"加载失败"属预期）。
 */
public class PouchServer {

    /** --data= / --web= / --port= 参数解析，缺省为默认值（dataDir=仓库根/data，webDir=仓库根/web，port=8787）。 */
    static final class Args {
        public String data;
        public String web;
        public int port = 8787;
        public boolean help = false;

        static Args parse(String[] args) {
            Args a = new Args();
            for (String arg : args) {
                if (arg.startsWith("--data="))      a.data = arg.substring("--data=".length());
                else if (arg.startsWith("--web="))  a.web = arg.substring("--web=".length());
                else if (arg.startsWith("--port=")) a.port = Integer.parseInt(arg.substring("--port=".length()));
                else if (arg.equals("--help") || arg.equals("-h")) a.help = true;
            }
            return a;
        }
    }

    public static void main(String[] args) throws Exception {
        // 默认值兜底：从本类 .class 文件所在的磁盘位置推导仓库根，
        // 不依赖 user.dir（Java 进程起点由 start.ps1 控制，但 PowerShell 里
        // -WorkingDirectory 可能不生效——一次实验就撞到过，见阶段 0 踩坑记录）。
        // out/ 永远在 server/out，父目录 server，父目录的父 = 仓库根。
        Path repoRoot = defaultRepoRoot();
        Args a = Args.parse(args);
        if (a.help) { printUsage(); return; }

        // 缺省兜底：不传参数时使用默认值（ticket 验收项：不传时不报 NPE）
        if (a.data == null) a.data = repoRoot.resolve("data").toString();
        if (a.web  == null) a.web  = repoRoot.resolve("web").toString();

        Path dataDir = Path.of(a.data).toAbsolutePath().normalize();
        Path webDir  = Path.of(a.web).toAbsolutePath().normalize();

        System.out.println("Pouch 学习看板");
        System.out.println("  数据目录 : " + dataDir);
        System.out.println("  静态目录 : " + webDir);
        System.out.println("  端口     : " + a.port);

        if (!Files.isDirectory(webDir)) {
            System.err.println("[FATAL] 静态目录不存在：" + webDir);
            System.err.println("        请用 --web=<路径> 指定，或确认目录结构完整。");
            System.exit(1);
        }

        // ---- 加载数据（5 个文件，缺失则建种子） ----
        JsonStore store = new JsonStore(dataDir);
        try {
            store.load();
        } catch (Exception e) {
            System.err.println("[FATAL] 数据加载失败：" + e.getMessage());
            System.exit(1);
        }

        StringBuilder sb = new StringBuilder("  已载入   : ");
        for (Category c : Category.values()) {
            sb.append(c.label()).append(' ').append(store.count(c)).append("  ");
        }
        sb.append("心愿单 ").append(store.countWishes());
        System.out.println(sb);

                // ---- 组装路由（阶段 0+1 全部端点）----
        StaticHandler staticHandler = new StaticHandler(webDir);
        Router router = new Router(staticHandler);
        MetaHandler           meta = new MetaHandler(store);
        RecordsHandler        rh   = new RecordsHandler(store);
        RecordsNoteHandler    rnh  = new RecordsNoteHandler(store);
        StorageHandler        sh   = new StorageHandler(store);
        WishlistHandler       wh   = new WishlistHandler(store);
        StatsHandler          st   = new StatsHandler(store);

        router.register("GET",    "/api/health",                 meta)
               .register("GET",    "/api/meta/categories",       (ex, pp) -> meta.handleCategories(ex))
               .register("GET",    "/api/meta/tags",             (ex, pp) -> meta.handleTags(ex, Requests.query(ex)))
               .register("POST",   "/api/records",               rh)
               .register("GET",    "/api/records",               rh)
               .register("GET",    "/api/records/{id}",          rh)
               .register("PATCH",  "/api/records/{id}",          rh)
               .register("DELETE", "/api/records/{id}",          rh)
               .register("POST",   "/api/records/{id}/notes",    rnh)
               .register("PATCH",  "/api/records/{id}/notes/{noteId}", rnh)
               .register("DELETE", "/api/records/{id}/notes/{noteId}", rnh)
               .register("GET",    "/api/wishlist",              wh)
               .register("POST",   "/api/wishlist",              wh)
               .register("GET",    "/api/wishlist/{id}",         wh)
               .register("PATCH",  "/api/wishlist/{id}",         wh)
               .register("DELETE", "/api/wishlist/{id}",         wh)
               .register("GET",    "/api/stats/overview",        (ex, pp) -> st.handle(ex, pp))
               .register("GET",    "/api/stats/random",          (ex, pp) -> st.handle(ex, pp))
               .register("GET",    "/api/stats/stale",           (ex, pp) -> st.handle(ex, pp))
               .register("GET",    "/api/storage/info",          sh)
               .register("POST",   "/api/storage/{action}",      sh);

        // ---- 启动 ----
        HttpServer server;
        try {
            // ★ 只绑定回环地址，不对外暴露
            server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), a.port), 0);
        } catch (IOException e) {
            System.err.println("[FATAL] 无法绑定端口 " + a.port + "：" + e.getMessage());
            System.err.println("        端口可能已被占用。用 --port=<其他端口> 换一个，");
            System.err.println("        或执行 netstat -ano | findstr :" + a.port + " 查看占用进程。");
            System.exit(1);
            return;
        }

        server.createContext("/", router::handle);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        System.out.println();
        System.out.println("  ✓ 已启动 → http://127.0.0.1:" + a.port + "   启动时间 "
                + OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        System.out.println("  按 Ctrl+C 停止");
        System.out.println();

        // ---- 优雅关闭 ----
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\n正在停止…");
            server.stop(2);
            System.out.println("已停止。");
        }));
    }

    /**
     * 从本类文件所在磁盘位置推导仓库根。
     *
     * 用 classfile URL 而非 user.dir：classfile 的位置是 `javac -d server/out` 写死的
     * 绝对物理路径，不随调度系统 / IDE / 脚本的工作目录切换而变化。
     * 异常链（落在 jar 里、不在磁盘上）时回落到 user.dir —— 那只是最后保证能跑，
     * 不是推荐路径，日志上额外提一句"运行目录不确定"。
     */
    private static Path defaultRepoRoot() {
        try {
            Path classDir = Path.of(PouchServer.class
                    .getProtectionDomain().getCodeSource().getLocation().toURI());
            // classDir = .../server/out（目录形式，因为我们用 javac -d 目录编译）
            Path serverDir = classDir.toAbsolutePath().normalize().getParent();   // .../server
            Path repoRoot  = serverDir.getParent();                               // 仓库根
            return repoRoot;
        } catch (Exception e) {
            System.err.println("[WARN] 无法从 class 位置推导仓库根（" + e.getMessage()
                    + "），回落使用 user.dir；建议改走 start.ps1 启动以锁定路径。");
            return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        }
    }

    private static void printUsage() {
        System.out.println("""
                Pouch 学习看板 · 本地服务器

                用法：java -cp <classpath> com.pouch.PouchServer [选项]

                选项：
                  --data=<目录>   数据目录，默认 <repoRoot>/data
                  --web=<目录>    静态资源目录，默认 <repoRoot>/web
                  --port=<端口>   监听端口，默认 8787（只监听 127.0.0.1）
                  --help          显示本帮助
                """);
    }
}
