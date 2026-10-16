package com.internyay.service;

import com.internyay.dto.OptionItemDto;
import com.internyay.dto.OptionItemRequest;
import com.internyay.entity.Client;
import com.internyay.entity.OptionItem;
import com.internyay.repository.OptionItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

// Dropdown choices that the admin manages from the Admin panel
@Service
@RequiredArgsConstructor
public class OptionService {

    // Separates nature and relief in the parent of a case type
    public static final String SEP = "||";

    // Lists the admin can edit. "keyed" lists have a fixed saved value (the code or the data depends on it), so only the label changes
    // and no choices are added or deleted. "cascade" lists belong under a parent choice.
    public record ListInfo(String key, String title, boolean keyed, boolean cascade, boolean deletable) {}

    public static final List<ListInfo> LISTS = List.of(
            new ListInfo("CASE_RELIEF",          "Case relief / category",        false, true, true),
            new ListInfo("CASE_TYPE",            "Case type",                     false, true, true),
            new ListInfo("CLIENT_TYPE",          "Client type",                   true,  false, true),
            new ListInfo("CLIENT_LABEL",         "Client label",                  false, false, true),
            new ListInfo("CLIENT_SUBTYPE",       "Client role in a case",         false, false, true),
            new ListInfo("DOCUMENT_TYPE",        "Case document type",            false, false, true),
            new ListInfo("CLIENT_DOCUMENT_TYPE", "Client document type",          false, false, true),
            new ListInfo("SPECIALIZATION",       "Advocate specialization",       false, false, true),
            new ListInfo("CONTACT_CATEGORY",     "Contact Us topic",              false, false, true),
            new ListInfo("CONSUMER_PECUNIARY",   "Consumer claim value range",    true,  false, false),
            new ListInfo("DRT_AMOUNT",           "DRT claim amount range",        true,  false, false));

    private static final Map<String, ListInfo> BY_KEY = new LinkedHashMap<>();
    static { LISTS.forEach(l -> BY_KEY.put(l.key(), l)); }

    private final OptionItemRepository repo;

    // Choices offered in the app: hidden ones left out, grouped by list
    @Transactional(readOnly = true)
    public Map<String, List<OptionItemDto>> publicOptions() {
        Map<String, List<OptionItemDto>> out = new LinkedHashMap<>();
        LISTS.forEach(l -> out.put(l.key(), new ArrayList<>()));

        repo.findAllByOrderByListKeyAscParentAscSortOrderAscIdAsc().stream()
                .filter(OptionItem::isEnabled)
                .forEach(o -> out.computeIfAbsent(o.getListKey(), k -> new ArrayList<>()).add(toDto(o)));
        return out;
    }

    // Everything for the admin screen, hidden choices included
    @Transactional(readOnly = true)
    public List<OptionItemDto> all() {
        return repo.findAllByOrderByListKeyAscParentAscSortOrderAscIdAsc().stream().map(this::toDto).toList();
    }

    // Lists the admin screen can show
    public List<ListInfo> lists() { return LISTS; }

    // Adds a choice at the end of its list
    @Transactional
    public OptionItemDto create(OptionItemRequest req) {
        ListInfo info = BY_KEY.get(req.listKey);
        if (info == null) throw new IllegalArgumentException("Unknown list");
        boolean clientType = info.key().equals("CLIENT_TYPE");
        if (info.keyed() && !clientType) throw new IllegalArgumentException("Choices cannot be added to this list, only renamed");

        String label = req.label.trim();
        String value;
        if (clientType) {
            // The app only understands the built-in client types, so only a deleted one can be added back
            try { value = Client.ClientType.fromValue(label).getValue(); }
            catch (IllegalArgumentException e) { throw new IllegalArgumentException("Only the built-in client types can be added back"); }
        } else {
            value = blank(req.value) ? label : req.value.trim();
        }
        String parent = parentFor(info, req.parent);

        if (repo.existsByListKeyAndParentAndValueIgnoreCase(info.key(), parent, value)) {
            throw new IllegalArgumentException("\"" + value + "\" is already in this list");
        }

        int next = repo.findByListKeyAndParentOrderBySortOrderAscIdAsc(info.key(), parent).stream()
                .mapToInt(OptionItem::getSortOrder).max().orElse(-1) + 1;

        return toDto(repo.save(OptionItem.builder()
                .listKey(info.key()).parent(parent).value(value).label(label).sortOrder(next).build()));
    }

    // Renames a choice and/or hides or shows it. Existing cases keep the text they were saved with.
    @Transactional
    public OptionItemDto update(Long id, OptionItemRequest req) {
        OptionItem item = find(id);
        ListInfo info = BY_KEY.get(item.getListKey());

        String label = req.label.trim();
        item.setLabel(label);

        // Lists with a fixed value only change the label; the others keep value and label together unless a value is sent
        if (!info.keyed()) {
            String value = blank(req.value) ? label : req.value.trim();
            if (!value.equals(item.getValue())) rename(item, info, value);
        }

        if (req.enabled != null && req.enabled != item.isEnabled()) {
            if (!req.enabled && item.isLocked()) throw new IllegalArgumentException("\"" + item.getLabel() + "\" is used by the app and cannot be hidden");
            item.setEnabled(req.enabled);
        }
        return toDto(repo.save(item));
    }

    // Deletes a choice (and, for a relief, the case types under it). Existing cases keep their saved text.
    @Transactional
    public void delete(Long id) {
        OptionItem item = find(id);
        ListInfo info = BY_KEY.get(item.getListKey());

        if (!info.deletable()) throw new IllegalArgumentException("Choices of this list cannot be deleted, only renamed");
        if (info.key().equals("CLIENT_TYPE") && item.getValue().equalsIgnoreCase(Client.ClientType.INDIVIDUAL.getValue())) {
            throw new IllegalArgumentException("\"" + item.getLabel() + "\" is the default client type and cannot be deleted");
        }
        if (item.isLocked()) throw new IllegalArgumentException("\"" + item.getLabel() + "\" is used by the app and cannot be deleted");

        if (item.getListKey().equals("CASE_RELIEF")) {
            List<OptionItem> types = repo.findByListKeyAndParent("CASE_TYPE", item.getParent() + SEP + item.getValue());
            if (types.stream().anyMatch(OptionItem::isLocked)) {
                throw new IllegalArgumentException("\"" + item.getLabel() + "\" has a case type the app depends on, so it cannot be deleted");
            }
            repo.deleteAll(types);
        }
        repo.delete(item);
    }

    // Moves a choice one place up or down within its list
    @Transactional
    public void move(Long id, boolean up) {
        OptionItem item = find(id);
        List<OptionItem> siblings = new ArrayList<>(
                repo.findByListKeyAndParentOrderBySortOrderAscIdAsc(item.getListKey(), item.getParent()));

        int i = -1;
        for (int k = 0; k < siblings.size(); k++) if (siblings.get(k).getId().equals(id)) i = k;
        int j = up ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= siblings.size()) return;

        Collections.swap(siblings, i, j);
        for (int k = 0; k < siblings.size(); k++) siblings.get(k).setSortOrder(k);
        repo.saveAll(siblings);
    }

    // Moves a choice straight to a place in its list (0 = first) in one step, for drag-and-drop reordering
    @Transactional
    public void moveTo(Long id, int position) {
        OptionItem item = find(id);
        List<OptionItem> siblings = new ArrayList<>(
                repo.findByListKeyAndParentOrderBySortOrderAscIdAsc(item.getListKey(), item.getParent()));

        int i = -1;
        for (int k = 0; k < siblings.size(); k++) if (siblings.get(k).getId().equals(id)) i = k;
        if (i < 0) return;

        int j = Math.max(0, Math.min(position, siblings.size() - 1));
        if (i == j) return;

        siblings.add(j, siblings.remove(i));
        for (int k = 0; k < siblings.size(); k++) siblings.get(k).setSortOrder(k);
        repo.saveAll(siblings);
    }

    // True when the value is a choice of the list that is still offered
    public boolean isOffered(String listKey, String value) {
        return value != null && repo.existsByListKeyAndValueIgnoreCaseAndEnabledTrue(listKey, value.trim());
    }

    // Returns the choice in its saved spelling when it is on the list (hidden ones included), otherwise null
    public String canonical(String listKey, String value) {
        if (value == null || value.isBlank()) return null;

        String wanted = value.trim();
        return repo.findByListKey(listKey).stream()
                .map(OptionItem::getValue)
                .filter(v -> v.equalsIgnoreCase(wanted))
                .findFirst().orElse(null);
    }

    // Changes a choice's saved value; its case types follow when it is a relief
    private void rename(OptionItem item, ListInfo info, String value) {
        if (item.isLocked()) throw new IllegalArgumentException("\"" + item.getValue() + "\" is used by the app and its name cannot be changed");
        if (repo.existsByListKeyAndParentAndValueIgnoreCase(info.key(), item.getParent(), value)
                && !value.equalsIgnoreCase(item.getValue())) {
            throw new IllegalArgumentException("\"" + value + "\" is already in this list");
        }

        if (item.getListKey().equals("CASE_RELIEF")) {
            String from = item.getParent() + SEP + item.getValue();
            String to = item.getParent() + SEP + value;
            List<OptionItem> types = repo.findByListKeyAndParent("CASE_TYPE", from);
            types.forEach(t -> t.setParent(to));
            repo.saveAll(types);
        }
        item.setValue(value);
    }

    // Parent text for a new choice: relief needs a nature, case type needs "nature||relief"
    private String parentFor(ListInfo info, String parent) {
        if (!info.cascade()) return "";
        if (blank(parent)) throw new IllegalArgumentException("Choose where this belongs");

        String p = parent.trim();
        if (info.key().equals("CASE_RELIEF") && !(p.equals("Civil") || p.equals("Criminal"))) {
            throw new IllegalArgumentException("Choose Civil or Criminal");
        }
        if (info.key().equals("CASE_TYPE")) {
            int cut = p.indexOf(SEP);
            if (cut < 0 || !repo.existsByListKeyAndParentAndValueIgnoreCase("CASE_RELIEF", p.substring(0, cut), p.substring(cut + SEP.length()))) {
                throw new IllegalArgumentException("Choose an existing relief");
            }
        }
        return p;
    }

    private OptionItem find(Long id) {
        return repo.findById(id).orElseThrow(() -> new IllegalArgumentException("Choice not found"));
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }

    private OptionItemDto toDto(OptionItem o) {
        return new OptionItemDto(o.getId(), o.getListKey(), o.getParent(), o.getValue(), o.getLabel(),
                o.getSortOrder(), o.isEnabled(), o.isLocked());
    }
}