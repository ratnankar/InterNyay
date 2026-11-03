package com.internyay.service.chat;

import java.util.Map;

public interface ChatStreamListener {

    ChatStreamListener NONE = new ChatStreamListener() {
        public void status(String text) {}
        public void delta(String text) {}
        public void reset() {}
        public void action(Map<String, Object> card) {}
        public boolean cancelled() { return false; }
    };

    void status(String text);

    void delta(String text);

    void reset();

    void action(Map<String, Object> card);

    boolean cancelled();
}
