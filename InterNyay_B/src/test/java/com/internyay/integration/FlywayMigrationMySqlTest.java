package com.internyay.integration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

// The database schema through Flyway on a real, empty MySQL, with the settings of application.properties as they are
// (ddl-auto=validate, nothing overridden). Hibernate checks every entity against the tables the migrations built, so if this
// class starts at all, the migrations match the entities. Skipped automatically when Docker is not running.
@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class FlywayMigrationMySqlTest {

    @Container
    @ServiceConnection
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.4");

    @Autowired JdbcTemplate jdbc;
    @Autowired Flyway flyway;

    @Test
    void everyMigrationRanOnTheEmptyDatabaseAndNothingIsPending() {
        Long applied = jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1", Long.class);
        // One history row per migration file (V1 to V11 today, more as files are added)
        assertThat(applied).isEqualTo((long) flyway.info().all().length).isGreaterThanOrEqualTo(11);
        assertThat(flyway.info().pending()).isEmpty();
        // Starting again must change nothing and must not complain about a changed file
        flyway.validate();
    }

    @Test
    void referenceDataIsLoaded() {
        Map<String, Long> expected = Map.ofEntries(
                Map.entry("courts", 14L),
                Map.entry("police_districts", 15L),
                Map.entry("police_sub_divisions", 67L),
                Map.entry("police_stations", 179L),
                Map.entry("drt_tribunals", 4L),
                Map.entry("drt_stations", 87L),
                Map.entry("consumer_commissions", 12L),
                Map.entry("consumer_stations", 101L),
                Map.entry("plans", 4L),
                Map.entry("option_items", 211L));
        expected.forEach((table, rows) ->
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class))
                        .as(table).isEqualTo(rows));
    }

    @Test
    void theNamedForeignKeysAreInTheSchema() {
        // The 22 named keys of V1, plus fk_cases_court, fk_hearing_limit_user and the four of the misc. application tables (V21, V24)
        Long found = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'
                  AND CONSTRAINT_NAME IN ('fk_users_plan','fk_court_no_judge','fk_duty_judge','fk_bail_link_one','fk_bail_link_two',
                      'fk_reply_message','fk_message_account','fk_email_otp_account','fk_no_hearing_user','fk_dismissal_user',
                      'fk_dismissal_notice','fk_wa_log_user','fk_wa_log_case','fk_wa_log_client','fk_documents_case',
                      'fk_documents_client','fk_documents_user','fk_qr_user','fk_judges_court','fk_cases_police_station',
                      'fk_bail_judges_roster','fk_bail_judges_judge','fk_cases_court','fk_hearing_limit_user',
                      'fk_misc_apps_case','fk_misc_apps_user','fk_documents_misc_app','fk_misc_app_hearing_app')
                """, Long.class);
        assertThat(found).isEqualTo(28);
    }
}
