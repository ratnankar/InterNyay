package com.internyay.dto;

import lombok.*;

import java.util.List;

// One page of the log plus the numbers shown above it
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class LoginLogPageDto {

    public List<LoginLogDto> items;
    public int page;
    public int totalPages;
    public long totalElements;

    // Last 24 hours
    public long logins24h;
    public long failed24h;
}
