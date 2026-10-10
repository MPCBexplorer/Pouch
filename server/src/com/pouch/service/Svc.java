package com.pouch.service;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;

public final class Svc {
    private static final DateTimeFormatter F = DateTimeFormatter.ISO_OFFSET_DATE_TIME;
    private Svc() {}
    public static String now() { return OffsetDateTime.now().format(F); }
}
