package com.internyay.scraper;

public class CauseListUnavailableException extends RuntimeException {

    public CauseListUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }

    public CauseListUnavailableException(String message) {
        super(message);
    }
}
