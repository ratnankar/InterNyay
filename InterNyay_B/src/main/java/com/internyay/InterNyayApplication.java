package com.internyay;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.web.config.EnableSpringDataWebSupport;
import org.springframework.scheduling.annotation.EnableScheduling;

import static org.springframework.data.web.config.EnableSpringDataWebSupport.PageSerializationMode.VIA_DTO;

// Entry point of the InterNyay backend
@SpringBootApplication
@EnableScheduling
@EnableSpringDataWebSupport(pageSerializationMode = VIA_DTO)
public class InterNyayApplication {
    // All dates and times in the app use Indian time
    public static final String APP_ZONE = "Asia/Kolkata";

    // Sets the default time zone before the app starts
    public static void main(String[] args) {
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone(APP_ZONE));
        SpringApplication.run(InterNyayApplication.class, args);
    }
}
