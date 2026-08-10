FROM python:3.11-slim

WORKDIR /srv

# Cache the HF model inside the image dir so it persists on read-only rootfs hosts.
ENV HF_HOME=/srv/.hf_cache \
    EMBEDDING_DEVICE=cpu \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
# Install the CPU-only build of torch first. Plain `pip install` pulls the CUDA
# build (torch + ~2.9 GB of nvidia-* libs + triton) which this service can never
# use — it runs embeddings on CPU by design (EMBEDDING_DEVICE above). Pinning the
# CPU wheel here means the later requirements install finds torch satisfied.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch
RUN pip install --no-cache-dir -r requirements.txt

# Bake the embedding model into the image. It costs image size (~0.5 GB), but the
# container then starts with no Hugging Face download: no first-request stall, no
# runtime dependency on HF being reachable or rate-limiting us. Keep the default
# in sync with Settings.embedding_model; override with --build-arg to pin another.
ARG EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL}
RUN python -c "import os; from sentence_transformers import SentenceTransformer; SentenceTransformer(os.environ['EMBEDDING_MODEL'])"

COPY app ./app

# Honor $PORT so this runs on Hugging Face Spaces / Render / Railway (which inject
# a port) and locally (defaults to 8000). Shell form so ${PORT} is expanded.
EXPOSE 8000
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
