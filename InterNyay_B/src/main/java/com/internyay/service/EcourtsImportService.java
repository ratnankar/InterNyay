package com.internyay.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.dto.EcourtsImportDto;
import com.internyay.dto.EcourtsImportRequest;
import com.internyay.entity.EcourtsImport;
import com.internyay.repository.EcourtsImportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.regex.Pattern;

// The "Import from eCourts" list of an account. Every call is scoped to one account. A newer upload replaces the list
// of an older one (updatedAt), so two devices cannot overwrite a fresh upload with a stale one
@Service
@RequiredArgsConstructor
public class EcourtsImportService {

    static final int MAX_CASES = 20000;
    static final int MAX_CHARS = 12_000_000;
    private static final Pattern CNR = Pattern.compile("^[A-Z0-9]{16}$");
    private static final EcourtsImportDto NONE = new EcourtsImportDto(null, 0);

    private final EcourtsImportRepository repo;
    private final ObjectMapper mapper;

    @Transactional(readOnly = true)
    public EcourtsImportDto get(Long accountId) {
        return repo.findByAccountId(accountId).map(this::toDto).orElse(NONE);
    }

    // An older change than the stored one is ignored and the stored list is returned, so the app can take the server's copy
    @Transactional
    public EcourtsImportDto save(Long accountId, EcourtsImportRequest req) {
        JsonNode items = req.items();
        if (items == null || !items.isArray() || items.isEmpty()) {
            throw new IllegalArgumentException("The import list must hold at least one case");
        }
        if (items.size() > MAX_CASES) {
            throw new IllegalArgumentException("The import list has too many cases");
        }
        for (JsonNode item : items) {
            if (!item.isObject() || !CNR.matcher(item.path("cnr").asText("")).matches()) {
                throw new IllegalArgumentException("Every imported case needs a valid CNR number");
            }
        }
        String json;
        try {
            json = mapper.writeValueAsString(items);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("The import list could not be read");
        }
        if (json.length() > MAX_CHARS) {
            throw new IllegalArgumentException("The import list is too large");
        }
        EcourtsImport row = repo.findByAccountId(accountId).orElse(null);
        if (row == null) {
            row = EcourtsImport.builder().accountId(accountId).build();
        } else if (row.getUpdatedAt() > req.updatedAt()) {
            return toDto(row);
        }
        row.setData(json);
        row.setUpdatedAt(req.updatedAt());
        return toDto(repo.save(row));
    }

    // "Clear" in the import window: the list is forgotten on every device
    @Transactional
    public void clear(Long accountId) {
        repo.deleteByAccountId(accountId);
    }

    private EcourtsImportDto toDto(EcourtsImport row) {
        try {
            return new EcourtsImportDto(mapper.readTree(row.getData()), row.getUpdatedAt());
        } catch (JsonProcessingException e) {
            return NONE;
        }
    }
}
