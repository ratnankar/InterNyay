package com.internyay.storage;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Collection;
import java.util.List;

// A database transaction and a file store can't commit together. This keeps them consistent:
// files are deleted only after the database change that removes them has committed,
// and a freshly uploaded file is removed again if its transaction rolls back
@Component
@RequiredArgsConstructor
public class StorageCleaner {

    private final FileStorage storage;

    // Delete files once the surrounding transaction commits (or right away when there is none)
    public void deleteAfterCommit(Collection<String> keys) {
        List<String> list = keys.stream().filter(k -> k != null && !k.isBlank()).toList();
        if (list.isEmpty()) return;

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    list.forEach(storage::delete);
                }
            });
        } else {
            list.forEach(storage::delete);
        }
    }

    // Delete a just uploaded file if the surrounding transaction does not commit
    public void deleteOnRollback(String key) {
        if (key == null || key.isBlank()) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return;

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    storage.delete(key);
                }
            }
        });
    }
}
