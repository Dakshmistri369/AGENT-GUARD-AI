"""
AgentGuard AI — Core Configuration Bridge.
Re-exports Settings and get_settings from app.config for modular imports.
"""
from app.config import Settings, get_settings

__all__ = ["Settings", "get_settings"]
