package com.internyay.service;

import com.internyay.util.ProfileImages;
import com.internyay.dto.ClientDto;
import com.internyay.dto.ClientRequest;
import com.internyay.entity.Case;
import com.internyay.entity.Client;
import com.internyay.entity.User;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.ClientRepository;
import com.internyay.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Create, update, list and delete clients of an advocate
@Service
@RequiredArgsConstructor
public class ClientService {

    private final ClientRepository clientRepo;
    private final UserRepository userRepo;
    private final CaseRepository caseRepo;
    private final DocumentService documentService;

    public Page<ClientDto> list(
            Long userId,
            String search,
            String type,
            int page,
            int size
    ) {
        Pageable pageable = PageRequest.of(
                page,
                size,
                Sort.by("name").ascending()
        );

        Client.ClientType clientType = parseClientType(type);

        return clientRepo
                .findByFilters(
                        userId,
                        blank(search),
                        clientType,
                        pageable
                )
                .map(ClientDto::from);
    }

    // New client, type and corporate panel label are parsed from the request
    public ClientDto create(ClientRequest req, Long userId) {

        User user = userRepo.getReferenceById(userId);

        Client.ClientType clientType =
                parseClientType(req.getType());

        Client.CustomLabel customLabel =
                parseCustomLabel(req.getCustomLabel());

        Client client = Client.builder()
                .name(req.getName())
                .email(cleanEmail(req.getEmail()))
                .whatsapp_phone(req.getWhatsappPhone())
                .additional_phone(req.getAdditionalPhone())
                .address(req.getAddress())
                .profilePicture(ProfileImages.check(req.getProfilePicture()))
                .type(clientType)
                .customLabel(customLabel)
                .user(user)
                .build();

        return ClientDto.from(clientRepo.save(client));
    }

    @Transactional
    public ClientDto update(
            Long id,
            ClientRequest req,
            Long userId
    ) {
        Client client = findOwned(id, userId);
        String oldName = client.getName();

        if (req.getName() != null && !req.getName().isBlank()) {
            client.setName(req.getName());
        }

        // Email is optional, so an empty value clears it
        if (req.getEmail() != null) {
            client.setEmail(cleanEmail(req.getEmail()));
        }

        if (req.getWhatsappPhone() != null) {
            client.setWhatsapp_phone(req.getWhatsappPhone());
        }

        if (req.getAdditionalPhone() != null) {
            client.setAdditional_phone(req.getAdditionalPhone());
        }

        if (req.getAddress() != null) {
            client.setAddress(req.getAddress());
        }

        if (req.getProfilePicture() != null) {
            client.setProfilePicture(ProfileImages.check(req.getProfilePicture()));
        }

        if (req.getType() != null) {
            client.setType(
                    parseClientType(req.getType())
            );
        }

        if (req.getCustomLabel() != null) {
            client.setCustomLabel(
                    parseCustomLabel(req.getCustomLabel())
            );
        }

        Client saved = clientRepo.save(client);

        // Case titles are built from the client names, so keep them in step with a rename
        renameInCaseTitles(saved, oldName, userId);

        return ClientDto.from(saved);
    }

    // Replaces the old client name with the new one inside the title of every case the client is part of
    private void renameInCaseTitles(Client client, String oldName, Long userId) {
        String newName = client.getName();

        if (oldName == null || oldName.isBlank() || newName == null || oldName.equals(newName)) {
            return;
        }

        // Whole-name match only, so renaming "Ram" does not touch "Shyam"
        Pattern pattern = Pattern.compile(
                "(?<![\\p{L}\\p{N}])" + Pattern.quote(oldName) + "(?![\\p{L}\\p{N}])");

        for (Case c : caseRepo.findAllOfClient(userId, client.getId())) {
            if (c.getTitle() == null) continue;

            String updated = pattern.matcher(c.getTitle())
                    .replaceAll(Matcher.quoteReplacement(newName));

            if (!updated.equals(c.getTitle())) {
                c.setTitle(updated);
                caseRepo.save(c);
            }
        }
    }

    // Email is optional: blank becomes an empty string so the existing NOT NULL column keeps working
    private String cleanEmail(String email) {
        return email == null ? "" : email.trim();
    }

    // Refused while open cases exist; soft deleted cases of the client are really removed first so the client row can go
    @Transactional
    public void delete(Long id, Long userId) {
        Client client = findOwned(id, userId);

        // A client with open cases can't be removed, the advocate deletes or moves those cases first
        long liveCases = caseRepo.countLiveCasesOfClient(id);
        if (liveCases > 0) {
            throw new IllegalArgumentException(
                    "This client still has " + liveCases + " case" + (liveCases == 1 ? "" : "s")
                            + ". Delete those cases first, then delete the client.");
        }

        List<Long> hidden = caseRepo.deletedCaseIdsOfClient(id);
        if (!hidden.isEmpty()) {
            caseRepo.undelete(hidden);
            caseRepo.deleteAllById(hidden);
        }

        // Documents go first, in the same transaction, so their files are cleaned up after the commit
        documentService.deleteAllForClient(id);

        clientRepo.delete(client);
    }

    // Client by id, rejected when it belongs to someone else
    private Client findOwned(Long id, Long userId) {
        Client client = clientRepo
                .findById(id)
                .orElseThrow(() ->
                        new RuntimeException("Client not found")
                );

        if (!client.getUser().getId().equals(userId)) {
            throw new RuntimeException("Forbidden");
        }

        return client;
    }

    // Defaults to INDIVIDUAL
    private Client.ClientType parseClientType(String value) {
        if (value == null || value.isBlank()) {
            return Client.ClientType.INDIVIDUAL;
        }

        return Client.ClientType.fromValue(value);
    }

    // Optional label such as corporate panel
    private Client.CustomLabel parseCustomLabel(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return Client.CustomLabel.fromValue(value);
    }

    // Empty strings become null
    private String blank(String value) {
        return (value == null || value.isBlank())
                ? null
                : value;
    }
}
