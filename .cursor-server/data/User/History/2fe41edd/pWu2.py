#!/usr/bin/env python3
"""Debug script to search for the specific whale trades."""
import credentials
import json
from kalshi_client import KalshiClient
from config import Config

Config.load_from_env()

# Initialize Kalshi client
client = KalshiClient(
    api_key_id=Config.KALSHI_API_KEY_ID,
    private_key_pem=Config.KALSHI_PRIVATE_KEY,
    base_url=Config.KALSHI_API_BASE
)

# Login
if not client.login():
    print("Failed to login to Kalshi")
    exit(1)

print("✓ Connected to Kalshi API")

# The tickers from the user
target_tickers = [
    "KXNCAAFGAME-25NOV07NWUSC-USC",  # Northwestern at USC
    "KXNBAGAME-25NOV07GSWDEN-DEN"     # Golden State vs Denver
]

print("\nSearching for specific tickers...")
for ticker in target_tickers:
    print(f"\n{'='*80}")
    print(f"Ticker: {ticker}")
    print(f"{'='*80}")
    
    # Get trades for this specific ticker
    trades_data = client.get_trades(ticker=ticker, limit=100)
    
    if not trades_data:
        print("No trades found for this ticker")
        continue
    
    print(f"Found {len(trades_data)} trades")
    
    # Sum up all trades to see total volume
    total_volume = 0
    largest_trade = None
    largest_value = 0
    
    for trade in trades_data:
        count = trade.get('count', 0)
        yes_price = trade.get('yes_price', 0)
        no_price = trade.get('no_price', 0)
        taker_side = trade.get('taker_side', '')
        
        if taker_side == 'yes':
            value_cents = count * yes_price
        else:
            value_cents = count * no_price
        
        value_dollars = value_cents / 100
        total_volume += value_dollars
        
        if value_dollars > largest_value:
            largest_value = value_dollars
            largest_trade = trade
    
    print(f"\nTotal volume from all trades: ${total_volume:,.2f}")
    print(f"\nLargest individual trade: ${largest_value:,.2f}")
    
    if largest_trade:
        print("\nLargest trade details:")
        print(json.dumps(largest_trade, indent=2))
        
        count = largest_trade.get('count', 0)
        yes_price = largest_trade.get('yes_price', 0)
        no_price = largest_trade.get('no_price', 0)
        taker_side = largest_trade.get('taker_side', '')
        
        print(f"\nCount (shares): {count:,}")
        print(f"Price: ${(yes_price if taker_side == 'yes' else no_price) / 100:.2f}")
        print(f"Side: {taker_side.upper()}")
        print(f"Value: ${largest_value:,.2f}")

