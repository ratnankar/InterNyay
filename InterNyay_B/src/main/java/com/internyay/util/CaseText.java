package com.internyay.util;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Tidies the free text of a case (title, case number, acts and sections, stage, police station name) so that the
// same thing is always written the same way, whether it was typed by hand or read from eCourts
public final class CaseText {

    private CaseText() {}

    // " vs ", " Vs. ", " v ", " v. " between the two sides of a title (a capital "V" alone is left, it can be an initial)
    private static final Pattern VERSUS = Pattern.compile("\\s+(?:v\\.?|[vV][sS]\\.?)\\s+");

    // Words that stay in capitals when a title that was all capitals is changed to normal case
    private static final Set<String> KEEP_UPPER = Set.of(
            "M/S", "LLP", "LLC", "HUF", "UOI", "NCT", "DDA", "MCD", "CBI", "NIA", "ED",
            "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "NDPS", "POCSO", "SBI", "PNB", "HDFC", "ICICI", "&");

    // "ORS", "ORS.", "ors" at the end of a party name all become "Ors."; the same for ANR and ETC
    private static final Pattern ET_AL = Pattern.compile("\\b(ors|anr|etc)\\b\\.?", Pattern.CASE_INSENSITIVE);

    // Text of a section list that the eCourts page puts after the acts (tables that are not acts)
    private static final Pattern PAGE_JUNK = Pattern.compile(
            ";?\\s*(?:Processes|IA Status|Main Matters|Process ID|IA Number)\\b.*$", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    // Case number as eCourts writes it: type, number, year
    private static final Pattern SLASHED_TYPE = Pattern.compile("^(.*?[A-Za-z.])\\s*/\\s*(\\d+)\\s*/\\s*(\\d{4})$");
    private static final Pattern SPACED = Pattern.compile("^(.*?[A-Za-z.])\\s+(\\d+)\\s*/\\s*(\\d{4})$");

    // Title: single spaces, "v." between the sides, "Ors." for others, normal case when everything was in capitals
    public static String normalizeTitle(String title) {
        if (title == null) return null;
        String t = title.replaceAll("\\s+", " ").strip();
        if (t.isEmpty()) return t;

        t = VERSUS.matcher(t).replaceFirst(" v. ");

        // Everything in capitals apart from the "v." between the sides
        String letters = ET_AL.matcher(t.replace(" v. ", " ")).replaceAll("");
        if (letters.equals(letters.toUpperCase(Locale.ROOT))) t = titleCase(t);

        t = ET_AL.matcher(t).replaceAll(m -> capitalize(m.group(1)) + ".");
        return t.replaceAll("\\s+", " ").strip();
    }

    private static String titleCase(String s) {
        StringBuilder out = new StringBuilder();
        for (String word : s.split(" ")) {
            if (out.length() > 0) out.append(' ');
            if (word.equals("v.")) { out.append(word); continue; }
            if (word.matches("(?i)(pvt|ltd|co)\\.?")) { out.append(capitalize(word.replace(".", ""))).append('.'); continue; }
            boolean initials = word.matches("([A-Z]\\.)+");
            if (KEEP_UPPER.contains(word) || initials || word.length() == 1) out.append(word);
            else out.append(capitalizeParts(word));
        }
        return out.toString();
    }

    // "O'BRIEN-SMITH" -> "O'Brien-Smith"
    private static String capitalizeParts(String word) {
        StringBuilder out = new StringBuilder();
        boolean up = true;
        for (char ch : word.toCharArray()) {
            out.append(up ? Character.toUpperCase(ch) : Character.toLowerCase(ch));
            up = ch == '-' || ch == '\'' || ch == '.' || ch == '(' || ch == '/';
        }
        return out.toString();
    }

    private static String capitalize(String w) {
        return w.isEmpty() ? w : Character.toUpperCase(w.charAt(0)) + w.substring(1).toLowerCase(Locale.ROOT);
    }

    // Case number: "CR Cases/6871/2025" and "CR Cases 6871 / 2025" both become "CR Cases 6871/2025"
    public static String normalizeCaseNo(String caseNo) {
        if (caseNo == null) return null;
        String n = caseNo.replaceAll("\\s+", " ").strip();
        Matcher m = SLASHED_TYPE.matcher(n);
        if (m.matches()) return m.group(1).strip() + " " + m.group(2) + "/" + m.group(3);
        m = SPACED.matcher(n);
        if (m.matches()) return m.group(1).strip() + " " + m.group(2) + "/" + m.group(3);
        return n;
    }

    // A list of sections: "457", "457/380/411/34", "351(2)/115(2)", "498A,406"
    private static final String SEC = "\\d+[A-Za-z]?(?:\\(\\w+\\))*";
    private static final String SEC_LIST = SEC + "(?:\\s*[/,]\\s*" + SEC + ")*";

    // Entry as it is typed by hand: "457/380/411/34 of IPC", "6 POCSO Act", "Sec 138 of NI Act"
    private static final Pattern MANUAL_ENTRY = Pattern.compile(
            "^(?:(?:sections?|secs?\\.?|u/s)\\s+)?(" + SEC_LIST + ")\\s+(?:of\\s+(?:the\\s+)?)?([A-Za-z][A-Za-z .()-]*?)$",
            Pattern.CASE_INSENSITIVE);

    // Entry as the portal writes it: "IPC - Section 457,380", here only to bring "/" in the list to ","
    private static final Pattern PORTAL_ENTRY = Pattern.compile("^(.+? - Section )(" + SEC_LIST + ")$");

    // Short names of acts that are always in capitals
    private static final Set<String> ACT_ABBREVIATIONS = Set.of("IPC", "NDPS", "POCSO", "BNS", "BNSS", "BSA", "CRPC", "CPC", "NI");

    // Letters that follow a list of sections with commas only because "N.I. ACT" was split at its dots: "138,N,I,ACT"
    private static final Pattern STRAY_LETTERS = Pattern.compile("(?<=[0-9)]),(?:[A-Za-z]{1,4},)*[A-Za-z]{1,4}(?=;|$)");

    // Acts and sections (or the FIR section) in one form for every case, whoever wrote them:
    //   "Act - Section 457,380,411,34; Other Act - Section 6"
    // The page text that is not an act, "&amp;", trailing "," or ";" and stray letters are removed, and the form typed by
    // hand ("457/380/411/34 of IPC & 6 POCSO Act") is changed to the portal form
    public static String cleanActs(String text) {
        if (text == null) return null;
        String t = text.replace("&amp;", "&").replace("&nbsp;", " ");
        t = PAGE_JUNK.matcher(t).replaceFirst("");
        t = t.replaceAll("\\s+", " ").strip();
        // Trailing commas inside the list too: "Section 74,; Protection..." -> "Section 74; Protection..."
        t = t.replaceAll("\\s*,\\s*;", ";").replaceAll("[;, ]+$", "");
        t = STRAY_LETTERS.matcher(t).replaceAll("");

        List<String> entries = new ArrayList<>();
        for (String entry : t.split("\\s*;\\s*")) {
            if (!entry.isBlank()) entries.add(canonicalActEntry(entry.strip()));
        }
        return String.join("; ", entries);
    }

    private static String canonicalActEntry(String entry) {
        Matcher portal = PORTAL_ENTRY.matcher(entry);
        if (portal.matches()) return portal.group(1) + sectionList(portal.group(2));

        // Typed by hand, one act or several joined by "&"
        String[] parts = entry.split("\\s+&\\s+");
        List<String> converted = new ArrayList<>();
        for (String part : parts) {
            Matcher m = MANUAL_ENTRY.matcher(part.strip());
            if (!m.matches()) return entry;
            converted.add(actName(m.group(2)) + " - Section " + sectionList(m.group(1)));
        }
        return String.join("; ", converted);
    }

    // "457 / 380/411" -> "457,380,411"
    private static String sectionList(String list) {
        return list.replaceAll("\\s*[/,]\\s*", ",");
    }

    // "ipc" -> "IPC", "POCSo Act" -> "POCSO Act"; other words stay as typed
    private static String actName(String act) {
        StringBuilder out = new StringBuilder();
        for (String word : act.strip().split("\\s+")) {
            if (out.length() > 0) out.append(' ');
            out.append(ACT_ABBREVIATIONS.contains(word.toUpperCase(Locale.ROOT).replace(".", "")) ? word.toUpperCase(Locale.ROOT) : word);
        }
        return out.toString();
    }

    // Words that stay in small letters inside a stage ("Argument on Charge")
    private static final Set<String> SMALL_WORDS = Set.of("on", "of", "and", "the", "to", "for", "in", "at");

    // Stages the portal writes in more than one way. Key: lower case; value: the one wording used here.
    // Add a line to join two stages. (Different stages, like "Arguments" and "Final Arguments", are NOT joined)
    private static final Map<String, String> STAGE_ALIASES = Map.of(
            "argument on charge", "Arguments on Charge",
            "arguments on charge", "Arguments on Charge",
            "misc. case", "Misc. Cases",
            "misc cases", "Misc. Cases");

    // Case stage: the portal adds the kind of court in brackets ("Misc./ Appearance (Criminal)"), writes a space after "/"
    // and is not consistent with capitals ("Misc. cases", "Argument On Charge"). Everything else is the portal's own wording
    public static String normalizeStage(String stage) {
        if (stage == null) return null;
        String s = stage.replaceAll("\\s*\\((?:Criminal|Civil)\\)\\s*$", "")
                .replaceAll("\\s*/\\s*", "/").replaceAll("\\s+", " ").strip();

        StringBuilder out = new StringBuilder();
        String[] words = s.split(" ");
        for (int i = 0; i < words.length; i++) {
            String w = words[i];
            if (w.isEmpty()) continue;
            if (out.length() > 0) out.append(' ');
            if (i > 0 && SMALL_WORDS.contains(w.toLowerCase(Locale.ROOT))) { out.append(w.toLowerCase(Locale.ROOT)); continue; }
            // First letter of the word and of each part after "/" in capitals, the rest as it was
            StringBuilder word = new StringBuilder();
            boolean up = true;
            for (char ch : w.toCharArray()) {
                word.append(up ? Character.toUpperCase(ch) : ch);
                up = ch == '/';
            }
            out.append(word);
        }
        String result = out.toString();
        return STAGE_ALIASES.getOrDefault(result.toLowerCase(Locale.ROOT), result);
    }

    // FIR number: "727 / 2021" and "727/2021" are the same. (Leading zeros and a missing year are left as they are:
    // the police write both "00727/2021" and "727/2021")
    public static String normalizeFirNo(String firNo) {
        if (firNo == null) return null;
        return firNo.replaceAll("\\s*/\\s*", "/").replaceAll("\\s+", " ").strip();
    }

    // Key to compare names that differ in spaces, dots, dashes and case ("Govind Puri" and "Govindpuri")
    public static String nameKey(String name) {
        return name == null ? "" : name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }
}
