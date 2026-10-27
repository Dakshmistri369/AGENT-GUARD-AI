"""
AgentGuard AI — Locust High-Concurrency Load Testing Suite.
Simulates realistic multi-tenant traffic patterns across:
1. Asynchronous scan enqueueing (POST /api/repositories/{id}/analyze)
2. High-frequency polling loops (GET /api/scans/{id}/status)
3. Heavy dashboard aggregation analytics (GET /api/dashboard/summary)
4. Queue depth, worker health, and dead-letter monitoring (GET /api/scans/queue/status)

Usage:
  locust -f backend/load_testing/locustfile.py --host=http://localhost:8000
  locust -f backend/load_testing/locustfile.py --headless -u 50 -r 10 -t 60s --host=http://localhost:8000 --html benchmark_report.html
"""
import random
from locust import HttpUser, between, task


class DashboardViewerUser(HttpUser):
    """Simulates security engineers and managers monitoring the security posture."""
    wait_time = between(1.0, 3.0)
    weight = 4

    @task(5)
    def view_dashboard_summary(self):
        """Monitor dashboard aggregated metrics and severity distributions."""
        with self.client.get(
            "/api/dashboard/summary",
            name="/api/dashboard/summary",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Unexpected status: {resp.status_code}")

    @task(5)
    def view_dashboard_metrics_cte(self):
        """Monitor high-performance PostgreSQL CTE metrics endpoint."""
        with self.client.get(
            "/api/dashboard/metrics",
            name="/api/dashboard/metrics",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Unexpected status: {resp.status_code}")

    @task(3)
    def view_queue_and_fleet_status(self):
        """Monitor background worker liveness and queue depth."""
        with self.client.get(
            "/api/scans/queue/status",
            name="/api/scans/queue/status",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Unexpected status: {resp.status_code}")

    @task(2)
    def check_health(self):
        """Check system health and database connectivity."""
        self.client.get("/health", name="/health")


class ScanExecutionUser(HttpUser):
    """Simulates developers or CI/CD pipelines enqueueing scans and polling status."""
    wait_time = between(0.5, 2.0)
    weight = 1

    def on_start(self):
        self.active_scan_id = None
        self.repo_id = 1

    @task(3)
    def enqueue_scan(self):
        """Enqueue scan — must return HTTP 202 Accepted without blocking."""
        with self.client.post(
            f"/api/repositories/{self.repo_id}/analyze",
            json={"metadata_only": True},
            name="/api/repositories/{id}/analyze",
            catch_response=True,
        ) as resp:
            if resp.status_code == 202:
                data = resp.json()
                self.active_scan_id = data.get("id")
                resp.success()
            elif resp.status_code == 429:
                # 429 is expected and valid under backpressure / user concurrency caps
                resp.success()
            elif resp.status_code in [404, 403]:
                resp.failure(f"Access error: {resp.status_code}")
            else:
                resp.failure(f"Scan enqueue failed with status {resp.status_code}: {resp.text}")

    @task(5)
    def poll_scan_status(self):
        """Poll scan status if an active scan exists."""
        if not self.active_scan_id:
            return
        with self.client.get(
            f"/api/scans/{self.active_scan_id}/status",
            name="/api/scans/{id}/status",
            catch_response=True,
        ) as resp:
            if resp.status_code in [200, 404]:
                resp.success()
            else:
                resp.failure(f"Status poll failed: {resp.status_code}")

    @task(2)
    def fetch_scan_results(self):
        """Fetch findings and coverage breakdown."""
        if not self.active_scan_id:
            return
        with self.client.get(
            f"/api/scans/{self.active_scan_id}/results",
            name="/api/scans/{id}/results",
            catch_response=True,
        ) as resp:
            if resp.status_code in [200, 404]:
                resp.success()
            else:
                resp.failure(f"Results fetch failed: {resp.status_code}")
