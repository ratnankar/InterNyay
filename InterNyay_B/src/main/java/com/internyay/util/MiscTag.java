package com.internyay.util;

import java.util.regex.Pattern;

public final class MiscTag {

    private static final Pattern TAG = Pattern.compile("(^|[^A-Za-z])MISC([^A-Za-z]|$)", Pattern.CASE_INSENSITIVE);

    private MiscTag() {}

    public static boolean in(String caseNo) {
        return caseNo != null && TAG.matcher(caseNo).find();
    }
}
