import logging
import threading
from typing import Optional

import ddddocr

logger = logging.getLogger(__name__)


class CaptchaSolver:
    def __init__(self, length: int):
        self._length = length
        self._ocr = ddddocr.DdddOcr(show_ad=False)
        self._lock = threading.Lock()

    def solve(self, image: bytes) -> Optional[str]:
        with self._lock:
            raw = self._ocr.classification(image)
        text = raw.strip() if isinstance(raw, str) else ""
        if len(text) != self._length or not text.isalnum():
            logger.info("Rejected OCR output of %d characters", len(text))
            return None
        return text
