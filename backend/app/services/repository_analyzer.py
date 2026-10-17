"""
AgentGuard AI — Safe Repository Inspection and Tree Analyzer.
Inspects file tree, detects programming languages, extensions, manifests,
test directories, configuration files, and frameworks without reading file contents.
Enforces strict file count, depth, and folder exclusions.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.schemas.repository import RepositoryMetadata

EXCLUDED_DIR_NAMES = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    "dist",
    "build",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".mypy_cache",
    "target",  # Rust build dir
    "vendor",  # Go/PHP vendor
}

KNOWN_MANIFEST_NAMES = {
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
    "Pipfile.lock",
    "poetry.lock",
    "Cargo.toml",
    "Cargo.lock",
    "go.mod",
    "go.sum",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Gemfile",
    "Gemfile.lock",
    "composer.json",
    "composer.lock",
}

TEST_DIR_NAMES = {
    "test",
    "tests",
    "__tests__",
    "spec",
    "specs",
    "testing",
    "e2e",
    "cypress",
}

CONFIG_FILE_PATTERNS = {
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "webpack.config.js",
    ".env.example",
    "alembic.ini",
    "pytest.ini",
    "ruff.toml",
    ".eslintrc.json",
    ".eslintrc.js",
}

EXTENSION_TO_LANGUAGE = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript (React)",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (React)",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".c": "C",
    ".cpp": "C++",
    ".cs": "C#",
    ".rb": "Ruby",
    ".php": "PHP",
    ".html": "HTML",
    ".css": "CSS",
    ".sql": "SQL",
    ".sh": "Shell",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".json": "JSON",
    ".md": "Markdown",
}


class RepositoryAnalyzer:
    """Performs metadata-only inspection on a repository file tree."""

    @staticmethod
    def analyze_tree(
        tree_items: list[dict[str, Any]],
        owner: str,
        name: str,
        default_branch: str,
        pinned_sha: str | None = None,
        is_truncated: bool = False,
        max_files: int = 5000,
        max_depth: int = 20,
    ) -> RepositoryMetadata:
        """
        Analyze a GitHub recursive tree structure without downloading file contents.
        Enforces path safety, directory exclusion, and resource limits.
        """
        file_count = 0
        dir_count = 0
        extensions: set[str] = set()
        languages: set[str] = set()
        manifests: list[str] = []
        test_directories: set[str] = set()
        config_files: list[str] = []
        workflow_files: list[str] = []
        total_size_bytes = 0
        is_incomplete = is_truncated

        for item in tree_items:
            path_str = item.get("path", "")
            if not path_str:
                continue

            # Check nesting depth
            parts = [p for p in path_str.split("/") if p]
            if len(parts) > max_depth:
                continue

            # Check if any part is in excluded directories
            if any(part in EXCLUDED_DIR_NAMES for part in parts[:-1]):
                continue

            item_type = item.get("type")
            filename = parts[-1]

            if item_type == "tree":
                dir_count += 1
                if filename.lower() in TEST_DIR_NAMES:
                    test_directories.add(path_str)
                continue

            if item_type == "blob":
                if file_count >= max_files:
                    is_incomplete = True
                    break

                file_count += 1
                size = item.get("size", 0)
                total_size_bytes += size

                # Extension & Language
                ext = Path(filename).suffix.lower()
                if ext:
                    extensions.add(ext)
                    if ext in EXTENSION_TO_LANGUAGE:
                        languages.add(EXTENSION_TO_LANGUAGE[ext])

                # Manifest check
                if filename in KNOWN_MANIFEST_NAMES:
                    manifests.append(path_str)

                # Config check
                if filename in CONFIG_FILE_PATTERNS or filename.startswith(".env."):
                    config_files.append(path_str)

                # GitHub Workflows check
                if path_str.startswith(".github/workflows/") and (filename.endswith(".yml") or filename.endswith(".yaml")):
                    workflow_files.append(path_str)

                # Test dir check for files located in test paths
                if any(part.lower() in TEST_DIR_NAMES for part in parts[:-1]):
                    # Add parent test directory
                    for part in parts[:-1]:
                        if part.lower() in TEST_DIR_NAMES:
                            test_directories.add(part)

        return RepositoryMetadata(
            owner=owner,
            name=name,
            default_branch=default_branch,
            pinned_sha=pinned_sha,
            file_count=file_count,
            directory_count=dir_count,
            languages=sorted(list(languages)),
            extensions=sorted(list(extensions)),
            manifests=sorted(manifests),
            test_directories=sorted(list(test_directories)),
            config_files=sorted(config_files),
            workflow_files=sorted(workflow_files),
            size_kb=round(total_size_bytes / 1024),
            is_incomplete=is_incomplete,
        )

    @staticmethod
    def analyze_local_dir(
        root_dir: Path,
        owner: str,
        name: str,
        default_branch: str,
        pinned_sha: str | None = None,
        max_files: int = 5000,
        max_depth: int = 20,
    ) -> RepositoryMetadata:
        """
        Metadata-only analysis of a locally cloned repository workspace.
        Never reads file contents during metadata analysis.
        """
        tree_items = []
        resolved_root = root_dir.resolve()

        for dirpath, dirnames, filenames in os.walk(resolved_root):
            # Prune excluded directories in-place
            dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIR_NAMES]

            rel_dir = os.path.relpath(dirpath, resolved_root)
            if rel_dir != ".":
                tree_items.append({"path": rel_dir.replace("\\", "/"), "type": "tree"})

            for filename in filenames:
                file_path = Path(dirpath) / filename
                # Safely check symlinks
                try:
                    if file_path.is_symlink():
                        # Verify target is inside
                        target = file_path.resolve()
                        if not target.is_relative_to(resolved_root):
                            continue
                    size = file_path.stat().st_size
                except Exception:
                    size = 0

                rel_file = os.path.relpath(file_path, resolved_root).replace("\\", "/")
                tree_items.append({"path": rel_file, "type": "blob", "size": size})

        return RepositoryAnalyzer.analyze_tree(
            tree_items=tree_items,
            owner=owner,
            name=name,
            default_branch=default_branch,
            pinned_sha=pinned_sha,
            is_truncated=False,
            max_files=max_files,
            max_depth=max_depth,
        )
