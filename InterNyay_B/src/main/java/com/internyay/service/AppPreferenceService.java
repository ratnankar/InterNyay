package com.internyay.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.dto.AppPreferenceDto;
import com.internyay.dto.AppPreferenceRequest;
import com.internyay.entity.AppPreference;
import com.internyay.repository.AppPreferenceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Preferences of the Calendar app. Every call is scoped to one account. When two phones save, the newest change
// (updatedAt) wins
@Service
@RequiredArgsConstructor
public class AppPreferenceService {

    private static final int MAX_CHARS = 20000;
    private static final AppPreferenceDto NONE = new AppPreferenceDto(null, 0);

    private final AppPreferenceRepository repo;
    private final ObjectMapper mapper;

    @Transactional(readOnly = true)
    public AppPreferenceDto get(Long accountId) {
        return repo.findByAccountId(accountId).map(this::toDto).orElse(NONE);
    }

    // An older change than the stored one is ignored and the stored preferences are returned,
    // so the app can see it lost and take the server's copy
    @Transactional
    public AppPreferenceDto save(Long accountId, AppPreferenceRequest req) {
        JsonNode data = req.data();
        if (data == null || !data.isObject()) {
            throw new IllegalArgumentException("Preferences must be a JSON object");
        }
        String json;
        try {
            json = mapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Preferences could not be read");
        }
        if (json.length() > MAX_CHARS) {
            throw new IllegalArgumentException("Preferences are too large");
        }
        AppPreference pref = repo.findByAccountId(accountId).orElse(null);
        if (pref == null) {
            pref = AppPreference.builder().accountId(accountId).build();
        } else if (pref.getUpdatedAt() > req.updatedAt()) {
            return toDto(pref);
        }
        pref.setData(json);
        pref.setUpdatedAt(req.updatedAt());
        return toDto(repo.save(pref));
    }

    private AppPreferenceDto toDto(AppPreference p) {
        try {
            return new AppPreferenceDto(mapper.readTree(p.getData()), p.getUpdatedAt());
        } catch (JsonProcessingException e) {
            return NONE;
        }
    }
}
