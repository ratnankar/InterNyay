package com.internyay.service.chat;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

@Component
@Slf4j
public class LegalKnowledge {

    public record Passage(String source, String title, String text, double score) {}

    private record Entry(String source, String title, String text, Map<String, Integer> terms, int length) {}

    private static final Set<String> STOP = Set.of("a", "an", "the", "of", "in", "on", "to", "for", "and", "or", "is", "are",
            "was", "what", "which", "how", "does", "do", "under", "with", "by", "at", "as", "be", "it", "this", "that",
            "me", "my", "tell", "about", "section", "sec", "s", "ka", "ki", "ke", "kya", "hai");
    private static final double K1 = 1.4;
    private static final double B = 0.75;
    private static final double TITLE_WEIGHT = 3;

    private final String directory;
    private volatile List<Entry> entries = List.of();
    private volatile Map<String, Integer> documentFrequency = Map.of();
    private volatile double averageLength = 1;

    public LegalKnowledge(@Value("${internyay.chat.knowledge-dir:}") String directory) {
        this.directory = directory == null ? "" : directory.trim();
    }

    @PostConstruct
    public int reload() {
        List<Entry> loaded = new ArrayList<>();
        try {
            for (Resource resource : new PathMatchingResourcePatternResolver().getResources("classpath*:legal-knowledge/*.md")) {
                String name = resource.getFilename();
                if (name == null || name.equalsIgnoreCase("README.md")) continue;
                loaded.addAll(parse(new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8), name));
            }
        } catch (IOException e) {
            log.warn("Could not read the built-in legal library: {}", e.getMessage());
        }
        if (!directory.isEmpty()) {
            try (Stream<Path> files = Files.list(Path.of(directory))) {
                for (Path file : files.filter(p -> p.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md")).toList()) {
                    loaded.addAll(parse(Files.readString(file, StandardCharsets.UTF_8), file.getFileName().toString()));
                }
            } catch (IOException | RuntimeException e) {
                log.warn("Could not read the legal library folder {}: {}", directory, e.getMessage());
            }
        }
        index(loaded);
        log.info("Legal library loaded with {} passages", loaded.size());
        return loaded.size();
    }

    public int size() {
        return entries.size();
    }

    public List<Passage> search(String query, int limit) {
        List<String> queryTerms = tokens(query);
        if (queryTerms.isEmpty() || entries.isEmpty()) return List.of();

        double total = entries.size();
        List<Passage> hits = new ArrayList<>();
        for (Entry entry : entries) {
            double score = 0;
            for (String term : queryTerms) {
                Integer frequency = entry.terms().get(term);
                if (frequency == null) continue;
                double df = documentFrequency.getOrDefault(term, 0);
                double idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
                double norm = frequency * (K1 + 1) / (frequency + K1 * (1 - B + B * entry.length() / averageLength));
                score += idf * norm;
            }
            if (score > 0) hits.add(new Passage(entry.source(), entry.title(), entry.text(), score));
        }
        hits.sort(Comparator.comparingDouble(Passage::score).reversed());
        return hits.subList(0, Math.min(Math.max(limit, 1), hits.size()));
    }

    static List<Entry> parse(String markdown, String fileName) {
        String source = fileName.replaceFirst("\\.md$", "");
        List<Entry> out = new ArrayList<>();
        String title = null;
        StringBuilder body = new StringBuilder();

        for (String raw : markdown.split("\\R")) {
            String line = raw.stripTrailing();
            if (line.startsWith("## ")) {
                add(out, source, title, body);
                title = line.substring(3).trim();
                body.setLength(0);
            } else if (line.startsWith("# ") && title == null) {
                source = line.substring(2).trim();
            } else if (title != null) {
                body.append(line).append('\n');
            }
        }
        add(out, source, title, body);
        return out;
    }

    private static void add(List<Entry> out, String source, String title, StringBuilder body) {
        if (title == null || body.toString().isBlank()) return;
        String text = body.toString().trim();
        Map<String, Integer> terms = new HashMap<>();
        int length = 0;
        for (String t : tokens(title)) {
            terms.merge(t, (int) TITLE_WEIGHT, Integer::sum);
            length += (int) TITLE_WEIGHT;
        }
        for (String t : tokens(text)) {
            terms.merge(t, 1, Integer::sum);
            length++;
        }
        out.add(new Entry(source, title, text, terms, Math.max(length, 1)));
    }

    private void index(List<Entry> loaded) {
        Map<String, Integer> df = new HashMap<>();
        long totalLength = 0;
        for (Entry entry : loaded) {
            totalLength += entry.length();
            for (String term : entry.terms().keySet()) df.merge(term, 1, Integer::sum);
        }
        this.documentFrequency = df;
        this.averageLength = loaded.isEmpty() ? 1 : (double) totalLength / loaded.size();
        this.entries = List.copyOf(loaded);
    }

    static List<String> tokens(String text) {
        if (text == null) return List.of();
        return Arrays.stream(text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
                .filter(t -> !t.isEmpty() && !STOP.contains(t))
                .map(LegalKnowledge::stem)
                .toList();
    }

    private static String stem(String t) {
        if (t.length() > 4 && t.endsWith("ies")) return t.substring(0, t.length() - 3) + "y";
        if (t.length() > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.substring(0, t.length() - 1);
        return t;
    }
}
