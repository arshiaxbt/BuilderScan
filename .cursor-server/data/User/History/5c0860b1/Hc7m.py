"""Configuration management for Kalshi Whale Bot."""
import os
from typing import Optional


class Config:
    """Bot configuration from environment variables."""
    
    # Kalshi API
    KALSHI_API_KEY_ID: str = ""
    KALSHI_PRIVATE_KEY: str = ""
    KALSHI_API_BASE: str = "https://api.elections.kalshi.com/trade-api/v2"
    
    # X API
    X_API_KEY: str = ""
    X_API_SECRET: str = ""
    X_ACCESS_TOKEN: str = ""
    X_ACCESS_TOKEN_SECRET: str = ""
    
    # Bot Settings
    CHECK_INTERVAL_SECONDS: int = 60
    WHALE_THRESHOLD_DOLLARS: int = 100000
    
    @classmethod
    def load_from_env(cls):
        """Load configuration from environment variables."""
        cls.KALSHI_API_KEY_ID = os.getenv("KALSHI_API_KEY_ID", "")
        cls.KALSHI_PRIVATE_KEY = os.getenv("KALSHI_PRIVATE_KEY", "")
        
        cls.X_API_KEY = os.getenv("X_API_KEY", "")
        cls.X_API_SECRET = os.getenv("X_API_SECRET", "")
        cls.X_ACCESS_TOKEN = os.getenv("X_ACCESS_TOKEN", "")
        cls.X_ACCESS_TOKEN_SECRET = os.getenv("X_ACCESS_TOKEN_SECRET", "")
        
        cls.CHECK_INTERVAL_SECONDS = int(os.getenv("CHECK_INTERVAL_SECONDS", "60"))
        cls.WHALE_THRESHOLD_DOLLARS = int(os.getenv("WHALE_THRESHOLD_DOLLARS", "100000"))
    
    @classmethod
    def validate(cls) -> tuple[bool, Optional[str]]:
        """Validate that all required configuration is present."""
        if not cls.KALSHI_API_KEY_ID:
            return False, "KALSHI_API_KEY_ID is required"
        if not cls.KALSHI_PRIVATE_KEY:
            return False, "KALSHI_PRIVATE_KEY is required"
        if not cls.X_API_KEY:
            return False, "X_API_KEY is required"
        if not cls.X_API_SECRET:
            return False, "X_API_SECRET is required"
        if not cls.X_ACCESS_TOKEN:
            return False, "X_ACCESS_TOKEN is required"
        if not cls.X_ACCESS_TOKEN_SECRET:
            return False, "X_ACCESS_TOKEN_SECRET is required"
        
        return True, None

