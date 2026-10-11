# UP Board API / worker image (ADR-001: Python + FastAPI). Same image runs both processes:
#   api:    uvicorn app.main:app --host 0.0.0.0 --port 8000
#   worker: python -m app.worker
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
COPY database/ /app/database/

RUN useradd --system --uid 10001 --home /app upboard \
    && mkdir -p /app/uploads /app/pythainlp-data \
    && chown -R upboard /app/uploads /app/pythainlp-data
USER upboard

# PyThaiNLP needs a writable data directory; warm the tokenizer so the first request is fast.
ENV UPLOAD_DIR=/app/uploads \
    PYTHAINLP_DATA_DIR=/app/pythainlp-data
RUN python -c "from pythainlp.tokenize import word_tokenize; word_tokenize('ทดสอบ')"
# Render / reverse proxy sets X-Forwarded-For; trust it so rate limits see real client IPs.
# Override FORWARDED_ALLOW_IPS if the API is ever exposed without a trusted proxy in front.
ENV FORWARDED_ALLOW_IPS="*"
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').status==200 else 1)"

# keep-alive longer than the platform proxy's idle timeout (uvicorn default 5 s) — otherwise the
# proxy can reuse a connection uvicorn just closed → sporadic 502 / ECONNRESET (seen in E2E).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--timeout-keep-alive", "75"]
