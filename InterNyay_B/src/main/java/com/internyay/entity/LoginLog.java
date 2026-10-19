package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// One sign-in, failed sign-in or sign-out, shown to admins under Login Activity
@Entity
@Table(name = "login_log")
@Getter @Setter @NoArgsConstructor
public class LoginLog {

    // What happened and how the person signed in
    public enum EventType { LOGIN, LOGIN_FAILED, LOGOUT }
    public enum Method    { PASSWORD, GOOGLE }

    // Which app the request came from: the website or the Calendar mobile app
    public enum App       { WEB, CALENDAR }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Empty for a failed attempt on an email that has no account
    private Long userId;

    private String email;

    // ADVOCATE, ASSOCIATE or ADMIN, or the account type the person chose when it failed
    private String role;

    @Enumerated(EnumType.STRING)
    private EventType eventType;

    @Enumerated(EnumType.STRING)
    private Method method;

    @Enumerated(EnumType.STRING)
    private App app = App.WEB;

    // Why a sign-in failed
    private String failureReason;

    private String ipAddress;

    // Browser text, cut to fit
    private String userAgent;

    private LocalDateTime createdAt = LocalDateTime.now();
}
