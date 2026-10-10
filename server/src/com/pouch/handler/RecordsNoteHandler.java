package com.pouch.handler;

import com.pouch.*;
import com.pouch.model.Record;
import com.pouch.service.RecordService;
import com.pouch.store.JsonStore;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.util.Map;

/** POST /api/records/{id}/notes + PATCH/DELETE /api/records/{id}/notes/{noteId} */
public class RecordsNoteHandler implements Handler {
    private final RecordService svc;
    public RecordsNoteHandler(JsonStore s) { this.svc = new RecordService(s); }

    @Override
    public void handle(HttpExchange ex, Map<String, String> pp) throws IOException {
        String id = pp.get("id");
        String m = ex.getRequestMethod();

        // POST /api/records/{id}/notes——追加笔记，返回父记录
        if ("POST".equals(m)) {
            Record r = svc.appendNote(id, Requests.readBody(ex));
            Respond.json(ex, 201, r);
            return;
        }
        // PATCH / DELETE /api/records/{id}/notes/{noteId}
        if (pp.containsKey("noteId")) {
            String noteId = pp.get("noteId");
            if ("PATCH".equals(m)) {
                Record r = svc.editNote(id, noteId, Requests.readBody(ex));
                Respond.json(ex, 200, r);
                return;
            }
            if ("DELETE".equals(m)) {
                Record r = svc.deleteNote(id, noteId);
                Respond.json(ex, 200, r);
                return;
            }
        }
        Respond.error(ex, 405, "method_not_allowed", "unsupported " + m);
    }
}