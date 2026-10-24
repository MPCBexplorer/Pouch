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
package com.pouch.service;

import com.pouch.model.Category;
import com.pouch.model.Record;
import com.pouch.store.JsonStore;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;

public class StatsService {
    private final JsonStore store;
    public StatsService(JsonStore store) { this.store = store; }

    public Map<String, Object> overview() {
        Map<String, Object> out = new LinkedHashMap<>();
        int total = 0;
        Map<String, Integer> cnts = new LinkedHashMap<>();
        for (Category c : Category.values()) {
            int n = store.count(c);
            cnts.put(c.wire(), n);
            total += n;
        }
        out.put("total", total);
        out.put("counts", cnts);

        for (Category c : Category.values()) {
            Map<String, Integer> st = new LinkedHashMap<>();
            for (String s : c.allowedStatuses()) st.put(s, 0);
            for (Record r : store.snapshot(c)) st.merge(r.status(), 1, Integer::sum);
            out.put(c.wire() + "Status", st);
        }

        int done = 0, open = 0, cancelled = 0;
        for (Record r : store.snapshot(Category.TODO)) {
            switch (r.status()) {
                case "done" -> done++;
                case "open" -> open++;
                case "cancelled" -> cancelled++;
            }
        }
        Map<String, Object> tc = new LinkedHashMap<>();
        tc.put("done", done);
        tc.put("open", open);
        int denom = done + open;
        tc.put("denominator", denom);
        tc.put("rate", denom == 0 ? null : ((double) done) / denom);
        out.put("todoCompletion", tc);
        out.put("todoCancelled", cancelled);

        out.put("staleCount", staleByType());
        return out;
    }

    public Map<String, Integer> staleByType() {
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put("question", 0); m.put("todo", 0); m.put("inspiration", 0);
        OffsetDateTime now = OffsetDateTime.now();
        LocalDate today = now.toLocalDate();
        for (Record r : store.snapshot(Category.QUESTION))
            if ("open".equals(r.status()) && idleDays(r, now) >= 15) m.merge("question", 1, Integer::sum);
        for (Record r : store.snapshot(Category.TODO)) {
            if ("open".equals(r.status())) {
                String due = r.dueDate();
                boolean overdue = false;
                if (due != null && !due.isEmpty()) {
                    try {
                        LocalDate dueDate = LocalDate.parse(due);
                        if (dueDate.isBefore(today)) overdue = true;
                    } catch (Exception e) {
                        // 解析失败忽略
                    }
                }
                if (overdue) m.merge("todo", 1, Integer::sum);
                else if (idleDays(r, now) >= 10) m.merge("todo", 1, Integer::sum);
            }
        }
        for (Record r : store.snapshot(Category.INSPIRATION))
            if ("active".equals(r.status()) && idleDays(r, now) >= 30) m.merge("inspiration", 1, Integer::sum);
        return m;
    }

    public List<Map<String, Object>> staleItems(int limit) {
        final int upper = Math.max(1, Math.min(50, limit));
        OffsetDateTime now = OffsetDateTime.now();
        LocalDate today = now.toLocalDate();
        List<Map<String, Object>> items = new ArrayList<>();
        for (Record r : store.snapshot(Category.QUESTION)) {
            int d = idleDays(r, now);
            if ("open".equals(r.status()) && d >= 15 && d > 0) items.add(entry(r, d, "question"));
        }
        for (Record r : store.snapshot(Category.TODO)) {
            int d = idleDays(r, now);
            if ("open".equals(r.status())) {
                String due = r.dueDate();
                boolean overdue = false;
                if (due != null && !due.isEmpty()) {
                    try {
                        LocalDate dueDate = LocalDate.parse(due);
                        if (dueDate.isBefore(today)) overdue = true;
                    } catch (Exception e) {
                        // 解析失败忽略
                    }
                }
                if (overdue) items.add(entry(r, d, "todo"));
                else if (d >= 10 && d > 0) items.add(entry(r, d, "todo"));
            }
        }
        for (Record r : store.snapshot(Category.INSPIRATION)) {
            int d = idleDays(r, now);
            if ("active".equals(r.status()) && d >= 30 && d > 0) items.add(entry(r, d, "inspiration"));
        }
        items.sort((a, b) -> Integer.compare((Integer) b.get("idleDays"), (Integer) a.get("idleDays")));
        return items.size() > upper ? new ArrayList<>(items.subList(0, upper)) : items;
    }

    static Map<String, Object> entry(Record r, int d, String type) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.id()); m.put("type", type); m.put("title", r.title());
        m.put("status", r.status()); m.put("updatedAt", r.updatedAt()); m.put("idleDays", d);
        return m;
    }

    static int idleDays(Record r, OffsetDateTime now) {
        try { return (int) ChronoUnit.DAYS.between(OffsetDateTime.parse(r.updatedAt(), DateTimeFormatter.ISO_OFFSET_DATE_TIME).toLocalDate(), now.toLocalDate()); }
        catch (Exception e) { return 0; }
    }
}
