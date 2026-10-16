package com.internyay.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.internyay.entity.FeeCalculatorConfig;
import com.internyay.repository.FeeCalculatorConfigRepository;
import com.internyay.service.FeeCalculatorService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

// Fee calculator rules against a real MySQL: the LONGTEXT column keeps the whole JSON and the defaults seed once.
// Skipped automatically when Docker is not running.
@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {"spring.jpa.hibernate.ddl-auto=create-drop", "spring.flyway.enabled=false"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(JacksonAutoConfiguration.class)
@Import(FeeCalculatorService.class)
class FeeCalculatorMySqlTest {

    @Container
    @ServiceConnection
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.4");

    @Autowired FeeCalculatorService service;
    @Autowired FeeCalculatorConfigRepository repo;

    @Test
    void seedDefaultsFillsTheEmptyTableOnce() {
        // The app may already have seeded the table when the test context started, so start from an empty one
        repo.deleteAll();
        repo.flush();
        assertThat(repo.existsById(FeeCalculatorConfig.ROW_ID)).isFalse();

        service.seedDefaults();

        assertThat(repo.count()).isEqualTo(1);
        FeeCalculatorConfig row = repo.findById(FeeCalculatorConfig.ROW_ID).orElseThrow();
        assertThat(row.getConfig()).contains("\"filings\"");
        assertThat(row.getUpdatedAt()).isNotNull();

        // A second start must not touch the saved row
        String before = row.getConfig();
        service.seedDefaults();
        assertThat(repo.count()).isEqualTo(1);
        assertThat(repo.findById(FeeCalculatorConfig.ROW_ID).orElseThrow().getConfig()).isEqualTo(before);
    }

    @Test
    void savedRulesComeBackUnchangedFromTheDatabase() {
        JsonNode rules = service.current().deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) rules).put("savedByTest", true);

        service.save(rules);
        repo.flush();

        assertThat(service.current().get("savedByTest").asBoolean()).isTrue();
        assertThat(service.current().get("filings")).hasSameSizeAs(rules.get("filings"));
    }
}
