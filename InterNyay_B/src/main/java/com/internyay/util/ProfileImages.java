package com.internyay.util;

// Checks a profile picture sent by the browser before it is saved.
// The app sends photos as "data:image/..." text, so accept only that, and only up to a size limit.
public final class ProfileImages {

    // Same limit the judge photo already uses (characters of base64 text, about 1.5 MB of image)
    private static final int MAX_LENGTH = 2_000_000;

    private ProfileImages() {
    }

    // null and blank pass through unchanged (null keeps the old picture, blank removes it).
    // Anything else must be an image data URL under the size limit, otherwise the request is rejected.
    public static String check(String picture) {
        if (picture == null || picture.isBlank()) {
            return picture;
        }
        if (!picture.startsWith("data:image/") || picture.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("Photo must be an image smaller than 2MB");
        }
        return picture;
    }
}
