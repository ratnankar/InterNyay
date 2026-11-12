package com.internyay.service;

import com.internyay.dto.QuickLinkDto;
import com.internyay.dto.QuickLinkRequests;
import com.internyay.entity.QuickLink;
import com.internyay.entity.QuickLinkGroup;
import com.internyay.repository.QuickLinkGroupRepository;
import com.internyay.repository.QuickLinkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class QuickLinkService {

    private final QuickLinkGroupRepository groups;
    private final QuickLinkRepository links;

    @Transactional(readOnly = true)
    public QuickLinkDto.Directory publicDirectory() {
        return directory(false);
    }

    @Transactional(readOnly = true)
    public QuickLinkDto.Directory adminDirectory() {
        return directory(true);
    }

    @Transactional
    public QuickLinkDto.Directory createGroup(QuickLinkRequests.GroupRequest req) {
        int next = groups.findAll().stream().map(QuickLinkGroup::getSortOrder).max(Integer::compare).orElse(-1) + 1;
        groups.save(QuickLinkGroup.builder().title(req.getTitle().trim()).sortOrder(next).build());
        return directory(true);
    }

    @Transactional
    public QuickLinkDto.Directory updateGroup(Long id, QuickLinkRequests.GroupRequest req) {
        QuickLinkGroup g = findGroup(id);
        g.setTitle(req.getTitle().trim());
        groups.save(g);
        return directory(true);
    }

    @Transactional
    public QuickLinkDto.Directory deleteGroup(Long id) {
        QuickLinkGroup g = findGroup(id);
        links.deleteByGroup_Id(id);
        groups.delete(g);
        return directory(true);
    }

    @Transactional
    public QuickLinkDto.Directory reorderGroups(List<Long> ids) {
        List<QuickLinkGroup> all = groups.findAllByOrderBySortOrderAscIdAsc();
        Map<Long, QuickLinkGroup> byId = all.stream().collect(Collectors.toMap(QuickLinkGroup::getId, g -> g));
        requireSameSet(byId.keySet(), ids);
        int i = 0;
        for (Long id : ids) {
            QuickLinkGroup g = byId.get(id);
            g.setSortOrder(i++);
        }
        groups.saveAll(byId.values());
        return directory(true);
    }

    @Transactional
    public QuickLinkDto.Directory createLink(QuickLinkRequests.LinkRequest req) {
        QuickLinkGroup g = findGroup(req.getGroupId());
        int next = links.findAllByGroup_IdOrderBySortOrderAscIdAsc(g.getId()).stream()
                .map(QuickLink::getSortOrder).max(Integer::compare).orElse(-1) + 1;
        QuickLink l = new QuickLink();
        l.setGroup(g);
        l.setSortOrder(next);
        apply(l, req);
        links.save(l);
        return directory(true);
    }

    @Transactional
    public QuickLinkDto.Directory updateLink(Long id, QuickLinkRequests.LinkRequest req) {
        QuickLink l = links.findById(id).orElseThrow(() -> new NoSuchElementException("Link not found"));
        if (!l.getGroup().getId().equals(req.getGroupId())) {
            QuickLinkGroup g = findGroup(req.getGroupId());
            l.setGroup(g);
            l.setSortOrder(links.findAllByGroup_IdOrderBySortOrderAscIdAsc(g.getId()).stream()
                    .map(QuickLink::getSortOrder).max(Integer::compare).orElse(-1) + 1);
        }
        apply(l, req);
        links.save(l);
        return directory(true);
    }

    @Transactional
    public QuickLinkDto.Directory deleteLink(Long id) {
        QuickLink l = links.findById(id).orElseThrow(() -> new NoSuchElementException("Link not found"));
        links.delete(l);
        return directory(true);
    }

    @Transactional
    public QuickLinkDto.Directory reorderLinks(Long groupId, List<Long> ids) {
        findGroup(groupId);
        List<QuickLink> inGroup = links.findAllByGroup_IdOrderBySortOrderAscIdAsc(groupId);
        Map<Long, QuickLink> byId = inGroup.stream().collect(Collectors.toMap(QuickLink::getId, l -> l));
        requireSameSet(byId.keySet(), ids);
        int i = 0;
        for (Long id : ids) {
            byId.get(id).setSortOrder(i++);
        }
        links.saveAll(byId.values());
        return directory(true);
    }

    private QuickLinkDto.Directory directory(boolean includeDisabled) {
        Map<Long, List<QuickLink>> byGroup = links.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(l -> includeDisabled || Boolean.TRUE.equals(l.getEnabled()))
                .collect(Collectors.groupingBy(l -> l.getGroup().getId(), LinkedHashMap::new, Collectors.toList()));

        List<QuickLinkDto.Group> out = groups.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(g -> QuickLinkDto.Group.builder()
                        .id(g.getId())
                        .title(g.getTitle())
                        .links(byGroup.getOrDefault(g.getId(), List.of()).stream().map(this::toDto).toList())
                        .build())
                .filter(g -> includeDisabled || !g.getLinks().isEmpty())
                .toList();

        return QuickLinkDto.Directory.builder().groups(out).build();
    }

    private QuickLinkDto.Link toDto(QuickLink l) {
        return QuickLinkDto.Link.builder()
                .id(l.getId())
                .groupId(l.getGroup().getId())
                .label(l.getLabel())
                .description(l.getDescription())
                .url(l.getUrl())
                .icon(l.getIcon())
                .enabled(l.getEnabled())
                .build();
    }

    private void apply(QuickLink l, QuickLinkRequests.LinkRequest req) {
        l.setLabel(req.getLabel().trim());
        String desc = req.getDescription() == null ? "" : req.getDescription().trim();
        l.setDescription(desc.isEmpty() ? null : desc);
        l.setUrl(req.getUrl().trim());
        l.setIcon(req.getIcon());
        l.setEnabled(req.getEnabled() == null || req.getEnabled());
    }

    private QuickLinkGroup findGroup(Long id) {
        return groups.findById(id).orElseThrow(() -> new NoSuchElementException("Group not found"));
    }

    private void requireSameSet(Set<Long> existing, List<Long> ids) {
        if (ids.size() != existing.size() || !existing.equals(new HashSet<>(ids))) {
            throw new IllegalArgumentException("The order must list every item exactly once");
        }
    }
}
