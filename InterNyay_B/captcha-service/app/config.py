import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    key: str
    length: int
    max_image_bytes: int
    log_level: str


def load_settings() -> Settings:
    return Settings(
        key=os.getenv("CAPTCHA_SOLVER_KEY", "").strip(),
        length=int(os.getenv("CAPTCHA_LENGTH", "6")),
        max_image_bytes=int(os.getenv("CAPTCHA_MAX_IMAGE_BYTES", "200000")),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )
