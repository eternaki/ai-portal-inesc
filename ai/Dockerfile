FROM python:3.11-slim

WORKDIR /srv

# Cache the HF model inside the image dir so it persists on read-only rootfs hosts.
ENV HF_HOME=/srv/.hf_cache \
    EMBEDDING_DEVICE=cpu \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Honor $PORT so this runs on Hugging Face Spaces / Render / Railway (which inject
# a port) and locally (defaults to 8000). Shell form so ${PORT} is expanded.
EXPOSE 8000
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
