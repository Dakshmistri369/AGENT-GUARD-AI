"""
AgentGuard AI — GitHub Connection Service.
Integrates with the official GitHub REST API (v2022-11-28).
Provides repository metadata, commit SHA pinning, git tree inspection,
and rate-limit aware error handling for public and private repositories.
Never logs tokens or private credentials.
"""
from __future__ import annotations

import logging
from typing import Any
import httpx

from app.config import Settings, get_settings

logger = logging.getLogger("agentguard.services.github")

GITHUB_API_BASE = "https://api.github.com"
GITHUB_API_VERSION = "2022-11-28"
USER_AGENT = "AgentGuard-AI/0.1.0"


class GitHubAPIError(Exception):
    """Base exception for GitHub API failures."""
    def __init__(self, message: str, status_code: int | None = None, is_rate_limit: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.is_rate_limit = is_rate_limit


class GitHubService:
    def __init__(self, settings: Settings | None = None, http_client: httpx.AsyncClient | None = None):
        self._settings = settings or get_settings()
        self._client = http_client

    def _get_headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
            "User-Agent": USER_AGENT,
        }
        # Optional server-side token; never log or reveal
        if self._settings.github_token:
            headers["Authorization"] = f"Bearer {self._settings.github_token.strip()}"
        return headers

    def _handle_response_error(self, response: httpx.Response, owner: str, repo: str) -> None:
        status = response.status_code
        remaining = response.headers.get("x-ratelimit-remaining")
        reset_time = response.headers.get("x-ratelimit-reset")

        if status == 403 and remaining == "0":
            logger.warning("GitHub API rate limit exceeded. Reset timestamp: %s", reset_time)
            msg = (
                "GitHub API rate limit exceeded for public requests. "
                "Consider setting a fine-grained GITHUB_TOKEN in backend environment for higher limits."
            )
            raise GitHubAPIError(msg, status_code=403, is_rate_limit=True)

        if status == 404:
            # Safe response: public repos require no token; private repos require configured token/app
            msg = (
                f"Repository '{owner}/{repo}' could not be accessed. "
                "Either the repository does not exist, or it is a private repository requiring authorization."
            )
            raise GitHubAPIError(msg, status_code=404)

        if status == 401:
            msg = "Configured GitHub authentication token is invalid or expired."
            raise GitHubAPIError(msg, status_code=401)

        if status == 403:
            msg = f"GitHub API access denied for '{owner}/{repo}'. Please check repository access permissions."
            raise GitHubAPIError(msg, status_code=403)

        msg = f"GitHub API error (HTTP {status}) while accessing '{owner}/{repo}'."
        raise GitHubAPIError(msg, status_code=status)

    async def get_repository_info(self, owner: str, repo: str) -> dict[str, Any]:
        """Fetch repository summary, default branch, size, and visibility."""
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}"
        headers = self._get_headers()

        async def _fetch(client: httpx.AsyncClient) -> dict[str, Any]:
            try:
                resp = await client.get(url, headers=headers, timeout=15.0)
            except httpx.TimeoutException as exc:
                raise GitHubAPIError(f"Connection timeout while reaching GitHub API for '{owner}/{repo}'.", status_code=504) from exc
            except httpx.RequestError as exc:
                raise GitHubAPIError(f"Network error while reaching GitHub API: {exc}", status_code=502) from exc

            if resp.is_error:
                self._handle_response_error(resp, owner, repo)

            data = resp.json()
            return {
                "owner": data.get("owner", {}).get("login", owner),
                "name": data.get("name", repo),
                "full_name": data.get("full_name", f"{owner}/{repo}"),
                "description": data.get("description"),
                "default_branch": data.get("default_branch", "main"),
                "is_private": data.get("private", False),
                "size_kb": data.get("size", 0),
                "html_url": data.get("html_url", f"https://github.com/{owner}/{repo}"),
            }

        if self._client:
            return await _fetch(self._client)
        async with httpx.AsyncClient() as client:
            return await _fetch(client)

    async def get_commit_sha(self, owner: str, repo: str, ref: str = "HEAD") -> str:
        """Fetch the exact commit SHA for a reference to pin the scan."""
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{ref}"
        headers = self._get_headers()

        async def _fetch(client: httpx.AsyncClient) -> str:
            try:
                resp = await client.get(url, headers=headers, timeout=15.0)
            except httpx.TimeoutException as exc:
                raise GitHubAPIError(f"Timeout resolving commit SHA for '{owner}/{repo}'.", status_code=504) from exc
            except httpx.RequestError as exc:
                raise GitHubAPIError(f"Network error resolving commit SHA: {exc}", status_code=502) from exc

            if resp.is_error:
                self._handle_response_error(resp, owner, repo)

            data = resp.json()
            sha = data.get("sha")
            if not sha:
                raise GitHubAPIError("GitHub API did not return a valid commit SHA.", status_code=502)
            return sha

        if self._client:
            return await _fetch(self._client)
        async with httpx.AsyncClient() as client:
            return await _fetch(client)

    async def get_languages(self, owner: str, repo: str) -> dict[str, int]:
        """Fetch detected programming languages and bytes count."""
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/languages"
        headers = self._get_headers()

        async def _fetch(client: httpx.AsyncClient) -> dict[str, int]:
            try:
                resp = await client.get(url, headers=headers, timeout=15.0)
            except Exception:
                return {}

            if resp.is_error:
                return {}
            return resp.json()

        if self._client:
            return await _fetch(self._client)
        async with httpx.AsyncClient() as client:
            return await _fetch(client)

    async def get_git_tree(self, owner: str, repo: str, sha: str) -> tuple[list[dict[str, Any]], bool]:
        """
        Fetch recursive git tree without downloading file contents.
        Returns (tree_items, is_truncated).
        """
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{sha}?recursive=1"
        headers = self._get_headers()

        async def _fetch(client: httpx.AsyncClient) -> tuple[list[dict[str, Any]], bool]:
            try:
                resp = await client.get(url, headers=headers, timeout=20.0)
            except httpx.TimeoutException as exc:
                raise GitHubAPIError(f"Timeout fetching tree for '{owner}/{repo}'.", status_code=504) from exc
            except httpx.RequestError as exc:
                raise GitHubAPIError(f"Network error fetching tree: {exc}", status_code=502) from exc

            if resp.is_error:
                self._handle_response_error(resp, owner, repo)

            data = resp.json()
            tree = data.get("tree", [])
            truncated = data.get("truncated", False)
            return tree, truncated

        if self._client:
            return await _fetch(self._client)
        async with httpx.AsyncClient() as client:
            return await _fetch(client)
