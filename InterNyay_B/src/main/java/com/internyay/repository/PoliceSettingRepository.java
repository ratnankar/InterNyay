package com.internyay.repository;

import com.internyay.entity.PoliceSetting;
import org.springframework.data.jpa.repository.JpaRepository;

// Settings of the police directory, saved as key and value
public interface PoliceSettingRepository extends JpaRepository<PoliceSetting, String> {
}
