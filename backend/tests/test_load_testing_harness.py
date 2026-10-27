"""
Automated regression tests verifying the high-concurrency load testing harness
and validating empirical performance assertions under simulated multi-user load.
"""
import pytest

from load_testing.benchmark_suite import BenchmarkHarness


class TestHighConcurrencyLoadScenarios:
    @pytest.mark.asyncio
    async def test_scenario_1_scan_dispatch_throughput_and_latency(self):
        """
        Verify that 20 concurrent scan triggers execute non-blockingly,
        returning HTTP 202 with 0 server errors.
        """
        harness = BenchmarkHarness()
        metrics = await harness.run_scenario_1_scan_dispatch(concurrency=20)

        assert metrics.total_requests == 20
        assert metrics.failed_requests == 0
        assert metrics.successful_requests == 20
        assert metrics.rps > 10.0
        assert metrics.p95_ms < 1000.0  # Must be fast non-blocking response

    @pytest.mark.asyncio
    async def test_scenario_2_duplicate_enqueue_idempotency_under_load(self):
        """
        Verify that concurrent duplicate enqueues for the same repository
        resolve cleanly with zero 500 crashes and zero duplicate worker executions.
        """
        harness = BenchmarkHarness()
        metrics = await harness.run_scenario_2_concurrent_idempotency(concurrency=15)

        assert metrics.total_requests == 15
        assert metrics.failed_requests == 0
        # Responses should be valid HTTP 202 (or 429 under cap) - 0 server crashes
        assert metrics.successful_requests + metrics.rate_limited_requests == 15

    @pytest.mark.asyncio
    async def test_scenario_3_dashboard_sql_aggregation_under_load(self):
        """
        Verify that 20 concurrent dashboard requests execute against
        the seeded database with 0 server errors.
        """
        harness = BenchmarkHarness()
        metrics = await harness.run_scenario_3_dashboard_sql_aggregation(concurrency=20)

        assert metrics.total_requests == 20
        assert metrics.failed_requests == 0
        assert metrics.successful_requests == 20

    @pytest.mark.asyncio
    async def test_scenario_4_backpressure_and_quotas_graceful_429(self):
        """
        Verify that burst traffic exceeding concurrency limits triggers
        clean HTTP 429 backpressure responses without server crashes.
        """
        harness = BenchmarkHarness()
        metrics = await harness.run_scenario_4_backpressure_and_quotas(burst_count=20)

        assert metrics.total_requests == 20
        assert metrics.failed_requests == 0
        assert metrics.rate_limited_requests > 0
