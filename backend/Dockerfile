FROM python:3.11-slim

WORKDIR /app

# Install system utilities (git for repository cloning, curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

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
