#!/usr/bin/env python3
"""Valshi-X - Monitor and tweet large trades on Kalshi."""
import sys
import time
from typing import List, Tuple

# Import credentials to set environment variables
import credentials

from config import Config
from kalshi_client import KalshiClient
from x_client import XClient
from trade_monitor import TradeMonitor, Trade
from tweet_formatter import TweetFormatter


class ValshiX:
    """Main bot class that coordinates monitoring and posting."""
    
    def __init__(self):
        """Initialize the bot with all necessary clients."""
        print("Initializing Valshi-X...")
        
        # Load configuration
        Config.load_from_env()
        is_valid, error = Config.validate()
        
        if not is_valid:
            print(f"Configuration error: {error}")
            sys.exit(1)
        
        # Initialize clients
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
        
        # Initialize trade monitor
        self.trade_monitor = TradeMonitor(
            kalshi_client=self.kalshi_client,
            threshold_dollars=Config.WHALE_THRESHOLD_DOLLARS
        )
        
        # Initialize tweet formatter
        self.tweet_formatter = TweetFormatter()
        
        print("✓ Bot initialized successfully!\n")
    
    def post_whale_trades(self, whale_trades: List[Tuple[Trade, dict]]):
        """Post whale trades to X.
        
        Args:
            whale_trades: List of (Trade, market_details) tuples
        """
        for trade, market in whale_trades:
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
                
                # Rate limiting: wait a bit between tweets
                if len(whale_trades) > 1:
                    time.sleep(2)
                    
            except Exception as e:
                print(f"Error posting whale trade: {str(e)}")
    
    def run(self):
        """Run the bot's main monitoring loop."""
        print(f"Starting monitoring...")
        print(f"Whale threshold: ${Config.WHALE_THRESHOLD_DOLLARS:,}")
        print(f"Check interval: {Config.CHECK_INTERVAL_SECONDS}s")
        print(f"Press Ctrl+C to stop\n")
        
        cycle_count = 0
        
        try:
            while True:
                cycle_count += 1
                print(f"[Cycle {cycle_count}] Checking for whale trades...")
                
                # Find new whale trades
                whale_trades = self.trade_monitor.find_new_whale_trades()
                
                if whale_trades:
                    print(f"✓ Found {len(whale_trades)} whale trade(s)!")
                    self.post_whale_trades(whale_trades)
                else:
                    print("No new whale trades found")
                
                # Wait before next check
                print(f"Waiting {Config.CHECK_INTERVAL_SECONDS}s until next check...\n")
                time.sleep(Config.CHECK_INTERVAL_SECONDS)
                
        except KeyboardInterrupt:
            print("\n\nBot stopped by user. Goodbye! 👋")
        except Exception as e:
            print(f"\nFatal error: {str(e)}")
            sys.exit(1)


def main():
    """Main entry point."""
    bot = ValshiX()
    bot.run()


if __name__ == "__main__":
    main()

