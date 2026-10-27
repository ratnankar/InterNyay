import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .config import load_settings
from .solver import CaptchaSolver

settings = load_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("captcha-service")

IMAGE_SIGNATURES = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"GIF8", b"BM")


class SolveResponse(BaseModel):
    text: str | None


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.solver = CaptchaSolver(settings.length)
    logger.info("Solver ready, expecting %d characters", settings.length)
    yield


app = FastAPI(title="InterNyay CAPTCHA service", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse)
async def solve(request: Request):
    if settings.key:
        sent = request.headers.get("x-solver-key", "")
        if not hmac.compare_digest(sent, settings.key):
            raise HTTPException(status_code=401, detail="Invalid key")

    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.max_image_bytes:
        raise HTTPException(status_code=413, detail="Image too large")

    image = await request.body()
    if not image:
        raise HTTPException(status_code=400, detail="Empty body")
    if len(image) > settings.max_image_bytes:
        raise HTTPException(status_code=413, detail="Image too large")
    if not image.startswith(IMAGE_SIGNATURES):
        raise HTTPException(status_code=415, detail="Not an image")

    try:
        text = await run_in_threadpool(request.app.state.solver.solve, image)
    except Exception:
        logger.exception("Solver failed")
        raise HTTPException(status_code=500, detail="Solver failed")
    return SolveResponse(text=text)
