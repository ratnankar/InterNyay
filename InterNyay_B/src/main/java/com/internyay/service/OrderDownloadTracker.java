package com.internyay.service;

import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

// Cases whose orders, read from eCourts when the case was added, are still being downloaded and attached.
// Their hearings show "Downloading order" instead of the "Get order from eCourts" button
@Component
public class OrderDownloadTracker {

    private final Set<Long> running = ConcurrentHashMap.newKeySet();

    public void begin(Long caseId) { running.add(caseId); }

    public void end(Long caseId) { running.remove(caseId); }

    public boolean isRunning(Long caseId) { return caseId != null && running.contains(caseId); }
}
