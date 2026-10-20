package com.internyay.repository;

import com.internyay.entity.JudgeCourtNoRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface JudgeCourtNoRecordRepository extends JpaRepository<JudgeCourtNoRecord, Long> {

    List<JudgeCourtNoRecord> findByJudgeIdIn(Collection<Long> judgeIds);

    List<JudgeCourtNoRecord> findByJudgeId(Long judgeId);

    Optional<JudgeCourtNoRecord> findFirstByJudgeIdAndTillDateIsNullOrderByFromDateDesc(Long judgeId);

    // True when a judge sat in any court period (history that must be kept)
    boolean existsByProfileId(Long profileId);
}
