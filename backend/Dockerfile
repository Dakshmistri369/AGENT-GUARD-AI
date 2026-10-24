FROM python:3.11-slim

WORKDIR /app

# Install system utilities (git for repository cloning, curl for healthchecks and downloads)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install OSV-Scanner CLI binary (v2.7.0) for dependency vulnerability scanning
RUN curl -fsSL -o /usr/local/bin/osv-scanner https://github.com/google/osv-scanner/releases/download/v2.7.0/osv-scanner_linux_amd64 && \
    chmod +x /usr/local/bin/osv-scanner

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY . .

# Expose port (Render injects $PORT at runtime)
ENV PORT=8000
EXPOSE 8000

# Start Uvicorn bound to dynamic Render port
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
