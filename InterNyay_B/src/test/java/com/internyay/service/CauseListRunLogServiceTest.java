package com.internyay.service;

import com.internyay.entity.CauseListRunLog;
import com.internyay.entity.CauseListRunLog.Origin;
import com.internyay.entity.CauseListRunLog.Status;
import com.internyay.repository.CauseListRunLogRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CauseListRunLogServiceTest {

    private static CauseListRunLog running(Origin origin) {
        CauseListRunLog row = new CauseListRunLog();
        row.setOrigin(origin);
        row.setStatus(Status.RUNNING);
        return row;
    }

    @Test
    void runsLeftByAnEarlierProcessAreClosed() {
        CauseListRunLogRepository repo = mock(CauseListRunLogRepository.class);
        CauseListRunLog manual = running(Origin.MANUAL);
        CauseListRunLog auto = running(Origin.AUTO);
        when(repo.findByStatus(Status.RUNNING)).thenReturn(List.of(manual, auto));

        new CauseListRunLogService(repo).closeRunsLeftByEarlierProcess();

        assertEquals(Status.ABANDONED, manual.getStatus());
        assertEquals(Status.FAILED, auto.getStatus());
        assertNotNull(manual.getFinishedAt());
        assertNotNull(auto.getFinishedAt());
    }
}
