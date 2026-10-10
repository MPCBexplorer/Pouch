package com.pouch;

import com.google.gson.Gson;
import com.google.gson.JsonElement;

import java.util.ArrayList;
import java.util.List;

/** Gson 反序列化 + 序列化统一入口。 */
public final class GsonUtil {
    private static final Gson GSON = new Gson();
    private GsonUtil() {}

    public static String toJson(Object o) { return GSON.toJson(o); }

    public static com.pouch.model.Record    recordFrom(JsonElement e) { return GSON.fromJson(e, com.pouch.model.Record.class); }
    public static com.pouch.model.Note      noteFrom(JsonElement e)   { return GSON.fromJson(e, com.pouch.model.Note.class); }
    public static com.pouch.model.WishItem  wishFrom(JsonElement e)   { return GSON.fromJson(e, com.pouch.model.WishItem.class); }

    /** 期望 JSON 字符串数组；非数组或非字符串项 → 抛 invalid_tags。 */
    public static List<String> strList(JsonElement e, String field) {
        if (e == null || e.isJsonNull()) return new ArrayList<>();
        if (!e.isJsonArray()) throw new HttpError(400, "invalid_tags", field + " 必须是数组");
        List<String> out = new ArrayList<>();
        for (JsonElement el : e.getAsJsonArray()) {
            if (el == null || !el.isJsonPrimitive()) {
                throw new HttpError(400, "invalid_tags", field + " 项必须是字符串");
            }
            out.add(el.getAsString());
        }
        return out;
    }
}