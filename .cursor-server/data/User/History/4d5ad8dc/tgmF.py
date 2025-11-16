"""Trade monitoring and whale detection logic."""
import time
from typing import Dict, List, Optional, Set
from kalshi_client import KalshiClient


class Trade:
    """Represents a trade on Kalshi."""
    
    def __init__(self, data: Dict):
        """Initialize trade from API data.
        
        Args:
            data: Trade data from Kalshi API
        """
        self.trade_id = data.get('trade_id', '')
        self.ticker = data.get('ticker', '')
        self.side = data.get('side', '')  # 'yes' or 'no'
        self.count = data.get('count', 0)  # Number of contracts
        self.yes_price = data.get('yes_price', 0)  # Price in cents
        self.no_price = data.get('no_price', 0)  # Price in cents
        self.created_time = data.get('created_time', '')
        
        # Calculate trade value in dollars
        # Contracts are typically $1 each, price is in cents
        if self.side == 'yes':
            self.value_cents = self.count * self.yes_price
        else:
            self.value_cents = self.count * self.no_price
        
        self.value_dollars = self.value_cents / 100
    
    def is_whale(self, threshold_dollars: int) -> bool:
        """Check if trade is a whale trade.
        
        Args:
            threshold_dollars: Minimum trade value to be considered whale
            
        Returns:
            True if trade value exceeds threshold
        """
        return self.value_dollars >= threshold_dollars
    
    def __repr__(self) -> str:
        return f"Trade({self.ticker}, {self.side}, ${self.value_dollars:,.2f})"


class TradeMonitor:
    """Monitors Kalshi for whale trades."""
    
    def __init__(self, kalshi_client: KalshiClient, threshold_dollars: int = 100000):
        """Initialize trade monitor.
        
        Args:
            kalshi_client: Authenticated Kalshi client
            threshold_dollars: Minimum trade value for whale detection
        """
        self.kalshi_client = kalshi_client
        self.threshold_dollars = threshold_dollars
        self.seen_trade_ids: Set[str] = set()
        self.market_cache: Dict[str, Dict] = {}
    
    def get_market_details(self, ticker: str) -> Optional[Dict]:
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
    
    def fetch_recent_trades(self, limit: int = 100) -> List[Trade]:
        """Fetch recent trades from Kalshi.
        
        Args:
            limit: Maximum number of trades to fetch
            
        Returns:
            List of Trade objects
        """
        trades_data = self.kalshi_client.get_trades(limit=limit)
        
        if not trades_data:
            return []
        
        trades = []
        for trade_data in trades_data:
            try:
                trade = Trade(trade_data)
                trades.append(trade)
            except Exception as e:
                print(f"Error parsing trade: {str(e)}")
        
        return trades
    
    def find_new_whale_trades(self) -> List[tuple[Trade, Dict]]:
        """Find new whale trades that haven't been seen before.
        
        Returns:
            List of tuples (Trade, market_details) for new whale trades
        """
        trades = self.fetch_recent_trades()
        new_whales = []
        
        for trade in trades:
            # Skip if we've already seen this trade
            if trade.trade_id in self.seen_trade_ids:
                continue
            
            # Mark as seen
            self.seen_trade_ids.add(trade.trade_id)
            
            # Check if it's a whale trade
            if trade.is_whale(self.threshold_dollars):
                market_details = self.get_market_details(trade.ticker)
                if market_details:
                    new_whales.append((trade, market_details))
                    print(f"Found whale trade: {trade}")
        
        # Prevent memory leak by limiting seen trades to last 10000
        if len(self.seen_trade_ids) > 10000:
            # Convert to list, keep last 5000, convert back to set
            self.seen_trade_ids = set(list(self.seen_trade_ids)[-5000:])
        
        return new_whales
    
    def start_monitoring(self, check_interval: int = 60):
        """Start continuous monitoring (blocking).
        
        Args:
            check_interval: Seconds between checks
        """
        print(f"Starting trade monitoring (checking every {check_interval}s)")
        print(f"Whale threshold: ${self.threshold_dollars:,}")
        
        while True:
            try:
                whale_trades = self.find_new_whale_trades()
                
                if whale_trades:
                    print(f"Found {len(whale_trades)} new whale trade(s)")
                    # Caller will handle posting to X
                    return whale_trades
                
                time.sleep(check_interval)
                
            except KeyboardInterrupt:
                print("\nMonitoring stopped by user")
                break
            except Exception as e:
                print(f"Error during monitoring: {str(e)}")
                time.sleep(check_interval)

