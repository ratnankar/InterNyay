package com.internyay.dto;

// A dropdown choice as sent to the app
public record OptionItemDto(Long id, String listKey, String parent, String value, String label,
                            int sortOrder, boolean enabled, boolean locked) {}
