# Automatic CAPTCHA reading — setup

When an advocate adds a case by CNR, the eCourts portal asks for a CAPTCHA. The backend now sends that image to a small
Python service (`captcha-service/`), gets the text back and submits it itself, so the case fills in without the advocate
typing anything. If the service is off, down, or cannot read the image after a few tries, the CAPTCHA picture is shown
to the advocate exactly as before. Nothing else in the app depends on the service.

```
Browser ── POST /api/cases/cnr/start ──> Spring Boot ── image ──> captcha-service (127.0.0.1:8001)
                                              │ <── text ──────────┘
                                              └── CNR + text ──> eCourts portal
```

## 1. Run the service on the server

The service listens on `127.0.0.1` only, so nginx needs no change and it is never reachable from outside the server.

```bash
sudo mkdir -p /opt/internyay
sudo cp -r captcha-service /opt/internyay/
cd /opt/internyay/captcha-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Put a long random value in `CAPTCHA_SOLVER_KEY` in that `.env` (for example `openssl rand -hex 24`), then install the unit.
Change `User=` in `internyay-captcha.service` if the server user is not `ubuntu`.

```bash
sudo cp internyay-captcha.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now internyay-captcha
curl http://127.0.0.1:8001/health
```

It uses about 135 MB of memory and answers in well under a second. With Docker instead:
`docker build -t internyay-captcha captcha-service && docker run -d --restart always -p 127.0.0.1:8001:8001 --env-file captcha-service/.env internyay-captcha`.

## 2. Point the backend at it

| Variable | Value |
|---|---|
| `CAPTCHA_SOLVER_ENABLED` | `true` (default). `false` switches automatic reading off |
| `CAPTCHA_SOLVER_URL` | `http://127.0.0.1:8001` (default) |
| `CAPTCHA_SOLVER_KEY` | The same value as in the service's `.env` |

Restart the backend (`sudo systemctl restart internyay`). Tries per lookup and the timeout are
`captcha.solver.max-attempts` (4) and `captcha.solver.timeout-ms` (4000) in `application.properties`.

## 3. Check it works

Add a case by CNR. In the backend log a lookup shows one of:

- `CNR ...: CAPTCHA read automatically on attempt N`
- `CNR ...: CAPTCHA not read automatically, asking the advocate` (the advocate types it)
- `CAPTCHA service not reachable ... pausing it for 60 seconds` (service down; lookups go straight to typing meanwhile)

## Admin cause list

The admin Cause List relay (district courts) uses the same service: it reads each court room's CAPTCHA itself and the admin
types one only when it cannot be read. One request reads for `causelist.district.auto-budget-seconds` (20) seconds, then the
page asks again, so a long run never hits the nginx timeout. Log line: `District cause list ...: CAPTCHA read automatically`.

## Notes

- The reading is a statistical guess. Expect some images to need a second or third try, and a few to fall back to typing.
  Watch the log lines above for a week to see the real rate.
- A wrong guess costs one extra request to the portal, never a failed case. At most `max-attempts` guesses are made per lookup.
- Local development needs nothing: with no service running, the first lookup notices it is unreachable, pauses it for a
  minute and the CAPTCHA is typed. To run it locally see `captcha-service/README.md`.
- Tests: `cd captcha-service && python -m pytest` (service), `mvn test` (backend client, `CaptchaSolverClientTest`).
