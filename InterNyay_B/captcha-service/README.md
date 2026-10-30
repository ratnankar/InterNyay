# InterNyay CAPTCHA service

Reads the CAPTCHA image of the eCourts portal so the advocate does not have to type it when adding a case by CNR.
The backend sends the image, this service answers with the text, and the backend falls back to the typed CAPTCHA when
the text is refused or the service is down. Setup and deployment: `../docs/CAPTCHA_SETUP.md`.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

## API

`POST /solve` with the raw image as the body (PNG, JPEG, GIF or BMP, 200 KB at most).

```json
{"text": "a1b2c3"}
```

`text` is `null` when the recognised text does not have the expected length (`CAPTCHA_LENGTH`, 6 for eCourts).
When `CAPTCHA_SOLVER_KEY` is set the request must carry it in the `X-Solver-Key` header.

`GET /health` answers `{"status": "ok"}`.
