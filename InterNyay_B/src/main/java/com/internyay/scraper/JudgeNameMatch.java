package com.internyay.scraper;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

// Finds a judge in the portal's court list. The portal lists courts as "49-Sh. Sanjeev Kumar Aggarwal-Principal District
// and Sessions Judge": the leading number is the portal's own id, not the court room number, so the judge's name is
// the only thing that ties an option to one of our court rooms
public final class JudgeNameMatch {

    private static final Set<String> TITLES = Set.of("sh", "shri", "smt", "shrimati", "ms", "mrs", "mr", "miss", "dr",
            "hon", "ble", "honble", "justice", "kumari", "km");

    private static final double MIN_SCORE = 0.75;

    private JudgeNameMatch() {
    }

    public record Hit<T>(T item, double score) {}

    // Best option for the name, or null when none is close enough or two are equally close
    public static <T> T best(List<T> items, java.util.function.Function<T, String> text, String judgeName) {
        List<Hit<T>> hits = ranked(items, text, judgeName);

        if (hits.isEmpty()) {
            return null;
        }
        if (hits.size() > 1 && hits.get(0).score() - hits.get(1).score() < 0.01) {
            return null;
        }
        return hits.get(0).item();
    }

    public static <T> List<Hit<T>> ranked(List<T> items, java.util.function.Function<T, String> text, String judgeName) {
        List<String> wanted = tokens(judgeName);
        List<Hit<T>> hits = new ArrayList<>();

        if (wanted.isEmpty()) {
            return hits;
        }

        for (T item : items) {
            double score = score(wanted, tokens(text.apply(item)));

            if (score >= MIN_SCORE) {
                hits.add(new Hit<>(item, score));
            }
        }
        hits.sort((a, b) -> Double.compare(b.score(), a.score()));
        return hits;
    }

    // Options that share at least one longer word with the name, to show what the portal has when nothing matched
    public static <T> List<T> similar(List<T> items, java.util.function.Function<T, String> text, String judgeName, int limit) {
        List<String> wanted = tokens(judgeName).stream().filter(w -> w.length() >= 4).toList();
        List<T> out = new ArrayList<>();

        for (T item : items) {
            List<String> offered = tokens(text.apply(item));

            if (wanted.stream().anyMatch(w -> offered.stream().anyMatch(o -> sameWord(w, o)))) {
                out.add(item);

                if (out.size() >= limit) {
                    break;
                }
            }
        }
        return out;
    }

    // How well the judge's name words are found in the option text: an exact word or an initial counts 1, a word with one
    // slip 0.9, a longer word with two slips 0.7 (Chayya / Chhaya), so an exact match always ranks above a near one
    static double score(List<String> wanted, List<String> offered) {
        double total = 0;
        int found = 0;

        for (String word : wanted) {
            double best = 0;

            for (String o : offered) {
                best = Math.max(best, weight(word, o));
            }

            if (best > 0) {
                found++;
                total += best;
            }
        }

        // One word alone is too weak to say who the judge is
        if (found < Math.min(2, wanted.size())) {
            return 0;
        }
        return total / wanted.size();
    }

    static List<String> tokens(String text) {
        List<String> out = new ArrayList<>();

        if (text == null) {
            return out;
        }

        String cleaned = text.toLowerCase(Locale.ROOT)
                .replaceFirst("^\\s*\\d+\\s*-\\s*", "")
                .replaceAll("[^a-z0-9]+", " ")
                .trim();

        for (String word : cleaned.split(" ")) {
            if (!word.isEmpty() && !TITLES.contains(word)) {
                out.add(word);
            }
        }
        return out;
    }

    private static boolean sameWord(String a, String b) {
        return weight(a, b) >= 0.9;
    }

    private static double weight(String a, String b) {
        if (a.equals(b)) {
            return 1;
        }
        if (a.length() == 1) {
            return b.startsWith(a) ? 1 : 0;
        }
        if (b.length() == 1) {
            return a.startsWith(b) ? 1 : 0;
        }
        if (a.length() < 5 || b.length() < 5 || Math.abs(a.length() - b.length()) > 2) {
            return 0;
        }

        int distance = distance(a, b);

        if (distance <= 1) {
            return 0.9;
        }
        return distance == 2 && a.length() >= 6 && b.length() >= 6 ? 0.7 : 0;
    }

    private static int distance(String a, String b) {
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];

        for (int j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }

        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;

            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }

            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }

    // Every option tied for the best score (same text counted once)
    public static <T> List<T> topTied(List<T> items, java.util.function.Function<T, String> text, String judgeName) {
        List<Hit<T>> hits = ranked(items, text, judgeName);
        List<T> out = new ArrayList<>();

        if (hits.isEmpty()) {
            return out;
        }

        double top = hits.get(0).score();
        java.util.Set<String> seen = new java.util.HashSet<>();

        for (Hit<T> hit : hits) {
            if (top - hit.score() < 0.01 && seen.add(text.apply(hit.item()))) {
                out.add(hit.item());
            }
        }
        return out;
    }
}
