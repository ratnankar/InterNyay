import logging
import threading
from collections import Counter
from typing import List, Optional

import cv2
import ddddocr
import numpy as np

logger = logging.getLogger(__name__)


def _encode(image: np.ndarray) -> bytes:
    ok, buffer = cv2.imencode(".png", image)
    return buffer.tobytes() if ok else b""


def _binarize(gray: np.ndarray) -> np.ndarray:
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if np.mean(binary) < 127:
        binary = cv2.bitwise_not(binary)
    return binary


def variants_of(image: bytes) -> List[bytes]:
    result = [image]
    decoded = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        return result

    gray = cv2.cvtColor(decoded, cv2.COLOR_BGR2GRAY)
    large = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    smooth = cv2.medianBlur(large, 3)

    result.append(_encode(large))
    result.append(_encode(_binarize(large)))
    result.append(_encode(_binarize(smooth)))

    cleaned = cv2.morphologyEx(_binarize(smooth), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)))
    result.append(_encode(cleaned))

    return [v for v in result if v]


class CaptchaSolver:
    def __init__(self, length: int, min_votes: int = 1):
        self._length = length
        self._min_votes = max(1, min_votes)
        self._engines = [
            ddddocr.DdddOcr(show_ad=False),
            ddddocr.DdddOcr(show_ad=False, beta=True),
        ]
        self._lock = threading.Lock()

    def _read(self, engine, image: bytes, seen: List[str], length: int) -> Optional[str]:
        try:
            raw = engine.classification(image)
        except Exception:
            return None
        text = raw.strip() if isinstance(raw, str) else ""
        if text and text not in seen:
            seen.append(text)
        if len(text) != length or not text.isalnum():
            return None
        return text

    def solve(self, image: bytes, length: Optional[int] = None) -> Optional[str]:
        length = length or self._length
        votes: Counter = Counter()
        order: List[str] = []
        seen: List[str] = []

        with self._lock:
            for variant in variants_of(image):
                for engine in self._engines:
                    text = self._read(engine, variant, seen, length)
                    if text is None:
                        continue
                    if text not in votes:
                        order.append(text)
                    votes[text] += 1

        if not votes:
            logger.info("No reading of the expected length %d, the engines read: %s", length, seen[:8])
            return None

        best = max(order, key=lambda t: (votes[t], -order.index(t)))
        if votes[best] < self._min_votes:
            logger.info("Best reading has %d vote(s), %d needed", votes[best], self._min_votes)
            return None
        return best
