package com.internyay.scan;

public final class ImageSniffer {

    private ImageSniffer() {
    }

    public static boolean isJpeg(byte[] b) {
        return b != null && b.length > 3
                && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    public static boolean isPng(byte[] b) {
        return b != null && b.length > 8
                && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A;
    }

    public static boolean isSupported(byte[] b) {
        return isJpeg(b) || isPng(b);
    }
}
