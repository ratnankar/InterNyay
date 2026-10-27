import io
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import main


@pytest.fixture()
def client():
    with TestClient(main.app) as c:
        yield c


def png(text: str = "ab12cd") -> bytes:
    image = Image.new("RGB", (200, 60), "white")
    ImageDraw.Draw(image).text((20, 20), text, fill="black")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_solve_returns_valid_text_or_null(client):
    response = client.post("/solve", content=png(), headers={"content-type": "image/png"})
    assert response.status_code == 200
    text = response.json()["text"]
    assert text is None or (len(text) == main.settings.length and text.isalnum())


def test_empty_body_rejected(client):
    assert client.post("/solve", content=b"").status_code == 400


def test_non_image_rejected(client):
    assert client.post("/solve", content=b"not an image").status_code == 415


def test_oversized_rejected(client):
    big = b"\x89PNG\r\n\x1a\n" + b"0" * main.settings.max_image_bytes
    assert client.post("/solve", content=big).status_code == 413


def test_key_enforced(client, monkeypatch):
    monkeypatch.setattr(main, "settings", replace(main.settings, key="secret"))
    assert client.post("/solve", content=png()).status_code == 401
    assert client.post("/solve", content=png(), headers={"x-solver-key": "wrong"}).status_code == 401
    assert client.post("/solve", content=png(), headers={"x-solver-key": "secret"}).status_code == 200
