"""Format whale trades into user-friendly tweets."""
from typing import Dict
from trade_monitor import Trade


class TweetFormatter:
    """Formats whale trades for posting on X."""
    
    @staticmethod
    def format_currency(amount: float) -> str:
        """Format dollar amount with K/M suffix.
        
        Args:
            amount: Dollar amount
            
        Returns:
            Formatted string (e.g., "$125K", "$1.2M")
        """
        if amount >= 1_000_000:
            return f"${amount / 1_000_000:.1f}M"
        elif amount >= 1_000:
            return f"${amount / 1_000:.0f}K"
        else:
            return f"${amount:.0f}"
    
    @staticmethod
    def get_market_url(ticker: str) -> str:
        """Get URL for a market on Kalshi.
        
        Args:
            ticker: Market ticker
            
        Returns:
            Market URL
        """
        return f"https://kalshi.com/?search={ticker}"
    
    @staticmethod
    def format_whale_tweet(trade: Trade, market: Dict) -> str:
        """Format a whale trade into a tweet.
        
        Args:
            trade: Trade object
            market: Market details from Kalshi API
            
        Returns:
            Formatted tweet text
        """
        # Extract market information
        title = market.get('title', 'Unknown Market')
        ticker = trade.ticker
        
        # Format the trade details
        side = trade.side.upper()
        value = TweetFormatter.format_currency(trade.value_dollars)
        contracts = f"{trade.count:,}"
        
        # Calculate the price percentage
        if trade.side == 'yes':
            price_cents = trade.yes_price
        else:
            price_cents = trade.no_price
        price_pct = price_cents / 100  # Convert cents to percentage
        
        # Build the tweet
        # Format: 🐋 Whale Alert! [Value] trade on [Market]
        # Details: [Contracts] contracts at [Price]¢ ([Side])
        # @Kalshi @KalshiEco
        # [Link]
        
        tweet_parts = [
            f"🐋 Whale Alert!",
            f"",
            f"{value} trade on {title}",
            f"",
            f"📊 {contracts} {side} contracts @ {price_cents}¢ ({price_pct:.0f}%)",
            f"",
            f"@Kalshi @KalshiEco",
            f"",
            TweetFormatter.get_market_url(ticker)
        ]
        
        tweet = "\n".join(tweet_parts)
        
        # Check length and truncate title if needed
        if len(tweet) > 280:
            # Truncate title to make it fit
            max_title_len = len(title) - (len(tweet) - 280) - 3  # -3 for "..."
            if max_title_len > 20:
                truncated_title = title[:max_title_len] + "..."
                tweet = tweet.replace(title, truncated_title)
            else:
                # If still too long, use a more compact format
                tweet_parts = [
                    f"🐋 {value} whale trade",
                    f"{contracts} {side} contracts @ {price_cents}¢",
                    f"@Kalshi @KalshiEco",
                    TweetFormatter.get_market_url(ticker)
                ]
                tweet = "\n".join(tweet_parts)
        
        return tweet
    
    @staticmethod
    def format_summary_tweet(whale_count: int, total_value: float) -> str:
        """Format a summary tweet for multiple whales.
        
        Args:
            whale_count: Number of whale trades
            total_value: Total value of all trades
            
        Returns:
            Formatted summary tweet
        """
        value = TweetFormatter.format_currency(total_value)
        
        tweet = (
            f"🐋 {whale_count} whale trade{'s' if whale_count > 1 else ''} detected!\n"
            f"\n"
            f"Total volume: {value}\n"
            f"\n"
            f"Big money moving on @Kalshi @KalshiEco 💰"
        )
        
        return tweet

