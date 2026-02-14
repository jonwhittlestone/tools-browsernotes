# Stage 1: Build frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY tsconfig.web.json webpack.config.js ./
COPY src/ ./src/
COPY web/ ./web/
RUN npx webpack --config webpack.config.js --mode production

# Stage 2: Python runtime
FROM python:3.12-slim

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install Python dependencies
COPY server/requirements.txt ./server/requirements.txt
RUN uv pip install --system -r server/requirements.txt

# Copy backend code
COPY server/ ./server/

# Copy frontend build artifacts
COPY --from=frontend-builder /app/dist/ ./dist/

# Copy web static files (HTML, CSS)
COPY web/index.html web/login.html web/styles.css web/manifest.webmanifest web/sw.js web/icon.svg web/icon-192.png web/icon-512.png ./web/

# Create data directory
RUN mkdir -p /app/data

# Cache Hugging Face model downloads in the persistent data volume
ENV TRANSFORMERS_CACHE=/app/data/models

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3004/health')" || exit 1

CMD ["python", "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "3004"]
