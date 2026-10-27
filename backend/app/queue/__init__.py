"""
AgentGuard AI — Asynchronous Job Queue Module (arq + Redis).
Provides background worker orchestration, job deduplication, retry with backoff,
dead-letter queue tracking, and worker heartbeat liveness signals.
"""
from app.queue.client import ScanQueueClient, get_queue_client

__all__ = ["ScanQueueClient", "get_queue_client"]
