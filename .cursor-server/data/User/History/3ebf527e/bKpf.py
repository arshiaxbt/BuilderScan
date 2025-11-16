#!/usr/bin/env python3
"""Valshi-X with WebSocket - Real-time whale trade alerts."""
import sys
import asyncio
from typing import Dict

# Import credentials to set environment variables
import credentials

from config import Config
from kalshi_client import KalshiClient
from x_client import XClient
from trade_monitor import Trade
from tweet_formatter import TweetFormatter
from websocket_client import KalshiWebSocketClient


class ValshiXWebSocket:
    """Main bot class with WebSocket support."""
    
    def __init__(self):
        """Initialize the bot with all necessary clients."""
        print("Initializing Valshi-X (WebSocket Mode)...")
        
        # Load configuration
        Config.load_from_env()
        is_valid, error = Config.validate()
        
        if not is_valid:
            print(f"Configuration error: {error}")
            sys.exit(1)
        
        # Initialize Kalshi client
        print("Connecting to Kalshi API...")
        self.kalshi_client = KalshiClient(
            api_key_id=Config.KALSHI_API_KEY_ID,
            private_key_pem=Config.KALSHI_PRIVATE_KEY,
            base_url=Config.KALSHI_API_BASE
        )
        
        # Test Kalshi connection
        if not self.kalshi_client.login():
            print("Failed to authenticate with Kalshi API")
            sys.exit(1)
        print("✓ Connected to Kalshi API")
        
        # Initialize X client
        print("Connecting to X API...")
        self.x_client = XClient(
            api_key=Config.X_API_KEY,
            api_secret=Config.X_API_SECRET,
            access_token=Config.X_ACCESS_TOKEN,
            access_token_secret=Config.X_ACCESS_TOKEN_SECRET
        )
        
        # Test X connection
        if not self.x_client.test_connection():
            print("Failed to connect to X API")
            sys.exit(1)
        print("✓ Connected to X API")
        
        # Initialize WebSocket client
        print("Initializing WebSocket client...")
        self.ws_client = KalshiWebSocketClient(self.kalshi_client)
        self.ws_client.on_trade(self.handle_trade)
        
        # Initialize tweet formatter
        self.tweet_formatter = TweetFormatter()
        
        # Track seen trades to avoid duplicates
        self.seen_trade_ids = set()
        
        # Market details cache
        self.market_cache = {}
        
        print("✓ Bot initialized successfully!\n")
    
    def handle_trade(self, trade_data: dict):
        """Handle incoming trade from WebSocket.
        
        Args:
            trade_data: Trade data from WebSocket
        """
        try:
            # Skip if we've seen this trade
            trade_id = trade_data.get('trade_id', '')
            if trade_id in self.seen_trade_ids:
                return
            
            self.seen_trade_ids.add(trade_id)
            
            # Create Trade object
            trade = Trade(trade_data)
            
            # Check if it's a whale trade
            if trade.is_whale(Config.WHALE_THRESHOLD_DOLLARS):
                print(f"\n🐋 WHALE DETECTED: {trade}")
                
                # Get market details
                market = self.get_market_details(trade.ticker)
                
                if market:
                    # Post to X
                    self.post_whale_trade(trade, market)
                else:
                    print(f"Could not fetch market details for {trade.ticker}")
            
            # Prevent memory leak
            if len(self.seen_trade_ids) > 10000:
                self.seen_trade_ids = set(list(self.seen_trade_ids)[-5000:])
                
        except Exception as e:
            print(f"Error handling trade: {str(e)}")
    
    def get_market_details(self, ticker: str) -> Dict:
        """Get market details with caching.
        
        Args:
            ticker: Market ticker
            
        Returns:
            Market details or None
        """
        if ticker not in self.market_cache:
            market = self.kalshi_client.get_market(ticker)
            if market:
                self.market_cache[ticker] = market
        
        return self.market_cache.get(ticker)
    
    def post_whale_trade(self, trade: Trade, market: Dict):
        """Post whale trade to X.
        
        Args:
            trade: Trade object
            market: Market details
        """
        try:
            # Format the tweet
            tweet_text = self.tweet_formatter.format_whale_tweet(trade, market)
            
            print(f"\nPosting tweet for {trade.ticker}:")
            print("-" * 60)
            print(tweet_text)
            print("-" * 60)
            
            # Post to X
            tweet_id = self.x_client.post_tweet(tweet_text)
            
            if tweet_id:
                print(f"✓ Tweet posted successfully (ID: {tweet_id})")
            else:
                print("✗ Failed to post tweet")
                
        except Exception as e:
            print(f"Error posting whale trade: {str(e)}")
    
    async def run(self):
        """Run the bot with WebSocket."""
        print(f"Starting WebSocket monitoring...")
        print(f"Whale threshold: ${Config.WHALE_THRESHOLD_DOLLARS:,}")
        print(f"Press Ctrl+C to stop\n")
        
        try:
            await self.ws_client.listen()
        except KeyboardInterrupt:
            print("\n\nStopping bot...")
            await self.ws_client.close()
            print("Bot stopped. Goodbye! 👋")
        except Exception as e:
            print(f"\nFatal error: {str(e)}")
            sys.exit(1)


def main():
    """Main entry point."""
    bot = ValshiXWebSocket()
    asyncio.run(bot.run())


if __name__ == "__main__":
    main()

