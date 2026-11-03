package com.internyay.service.chat;

final class ThinkFilter {

    private static final String OPEN = "<think>";
    private static final String CLOSE = "</think>";

    private final StringBuilder pending = new StringBuilder();
    private boolean inside;

    String accept(String chunk) {
        pending.append(chunk);
        StringBuilder out = new StringBuilder();
        while (true) {
            if (inside) {
                int end = pending.indexOf(CLOSE);
                if (end < 0) {
                    int keep = CLOSE.length() - 1;
                    if (pending.length() > keep) pending.delete(0, pending.length() - keep);
                    break;
                }
                pending.delete(0, end + CLOSE.length());
                inside = false;
            } else {
                int start = pending.indexOf(OPEN);
                if (start < 0) {
                    int hold = partialSuffix();
                    int emit = pending.length() - hold;
                    out.append(pending, 0, emit);
                    pending.delete(0, emit);
                    break;
                }
                out.append(pending, 0, start);
                pending.delete(0, start + OPEN.length());
                inside = true;
            }
        }
        return out.toString();
    }

    String finish() {
        String rest = inside ? "" : pending.toString();
        pending.setLength(0);
        inside = false;
        return rest;
    }

    private int partialSuffix() {
        int max = Math.min(OPEN.length() - 1, pending.length());
        for (int k = max; k > 0; k--) {
            if (pending.substring(pending.length() - k).equals(OPEN.substring(0, k))) return k;
        }
        return 0;
    }
}
