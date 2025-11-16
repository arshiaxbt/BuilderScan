#!/usr/bin/env python3
"""Test script to verify API connections for Valshi-X."""
import sys

# Import credentials to set environment variables
import credentials

from config import Config
from kalshi_client import KalshiClient
from x_client import XClient


def test_kalshi_connection():
    """Test Kalshi API connection."""
    print("Testing Kalshi API connection...")
    
    try:
        Config.load_from_env()
        
        client = KalshiClient(
            api_key_id=Config.KALSHI_API_KEY_ID,
            private_key_pem=Config.KALSHI_PRIVATE_KEY,
            base_url=Config.KALSHI_API_BASE
        )
        
        if client.login():
            print("✓ Kalshi API: Connected successfully!")
            
            # Try fetching markets
            markets = client.get_markets(limit=5)
            if markets:
                print(f"✓ Fetched {len(markets)} markets")
                print(f"  Example: {markets[0].get('ticker', 'N/A')}")
            
            return True
        else:
            print("✗ Kalshi API: Login failed")
            return False
            
    except Exception as e:
        print(f"✗ Kalshi API: Error - {str(e)}")
        return False


def test_x_connection():
    """Test X API connection."""
    print("\nTesting X API connection...")
    
    try:
        Config.load_from_env()
        
        client = XClient(
            api_key=Config.X_API_KEY,
            api_secret=Config.X_API_SECRET,
            access_token=Config.X_ACCESS_TOKEN,
            access_token_secret=Config.X_ACCESS_TOKEN_SECRET
        )
        
        if client.test_connection():
            print("✓ X API: Connected successfully!")
            return True
        else:
            print("✗ X API: Connection test failed")
            return False
            
    except Exception as e:
        print(f"✗ X API: Error - {str(e)}")
        return False


def main():
    """Run all connection tests."""
    print("=" * 60)
    print("Valshi-X - Connection Test")
    print("=" * 60)
    print()
    
    # Validate config
    Config.load_from_env()
    is_valid, error = Config.validate()
    
    if not is_valid:
        print(f"✗ Configuration error: {error}")
        sys.exit(1)
    
    print("✓ Configuration loaded")
    print()
    
    # Test connections
    kalshi_ok = test_kalshi_connection()
    x_ok = test_x_connection()
    
    print()
    print("=" * 60)
    
    if kalshi_ok and x_ok:
        print("✓ All tests passed! Bot is ready to run.")
        print()
        print("To start the bot, run:")
        print("  python bot.py")
        sys.exit(0)
    else:
        print("✗ Some tests failed. Please check your credentials.")
        sys.exit(1)


if __name__ == "__main__":
    main()

