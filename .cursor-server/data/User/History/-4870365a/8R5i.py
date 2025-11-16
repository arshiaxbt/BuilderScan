#!/usr/bin/env python3
"""Debug script to check what trades the API is returning."""
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
print("\nFetching recent trades...")

# Get recent trades
trades_data = client.get_trades(limit=100)

if not trades_data:
    print("No trades returned")
    exit(1)

print(f"\nReceived {len(trades_data)} trades")
print("\n" + "="*80)

# Show first 5 trades
for i, trade in enumerate(trades_data[:10]):
    print(f"\nTrade {i+1}:")
    print(json.dumps(trade, indent=2))
    
    # Calculate value
    count = trade.get('count', 0)
    yes_price = trade.get('yes_price', 0)
    no_price = trade.get('no_price', 0)
    taker_side = trade.get('taker_side', '')
    ticker = trade.get('ticker', '')
    
    if taker_side == 'yes':
        value_cents = count * yes_price
    else:
        value_cents = count * no_price
    
    value_dollars = value_cents / 100
    
    print(f"\nCalculated:")
    print(f"  Ticker: {ticker}")
    print(f"  Side: {taker_side}")
    print(f"  Count: {count:,}")
    print(f"  Price (cents): {yes_price if taker_side == 'yes' else no_price}")
    print(f"  Value: ${value_dollars:,.2f}")
    print(f"  Whale (>$100k): {'YES' if value_dollars >= 100000 else 'NO'}")
    print("="*80)

