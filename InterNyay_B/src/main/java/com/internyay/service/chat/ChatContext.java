package com.internyay.service.chat;

import java.util.List;

// Who is asking: data owner id, logged in account, whether it is an associate, and whether fee data must stay hidden
// (associates, and advocates whose plan has no transactions feature). courts are the courts the advocate works at,
// most cases first, so answers about judges, rosters and hearings can start with them
public record ChatContext(Long userId, Long accountId, String accountName, boolean associate, boolean feesHidden,
                          List<String> courts) {

    public ChatContext {
        courts = courts == null ? List.of() : List.copyOf(courts);
    }
}
