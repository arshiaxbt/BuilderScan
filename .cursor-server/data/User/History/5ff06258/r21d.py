#!/usr/bin/env python3
"""Check if large trades exist in paginated data."""
import credentials
from kalshi_client import KalshiClient
from config import Config

Config.load_from_env()

client = KalshiClient(
    api_key_id=Config.KALSHI_API_KEY_ID,
    private_key_pem=Config.KALSHI_PRIVATE_KEY,
    base_url=Config.KALSHI_API_BASE
)

if not client.login():
    print("Failed to login")
    exit(1)

ticker = "KXNCAAFGAME-25NOV07NWUSC-USC"
print(f"Searching ALL trades for {ticker} for values > $100k...")

# Try to get more trades with pagination
all_trades = []
max_pages = 10  # Check up to 1000 trades (10 pages x 100 each)

for page in range(max_pages):
    print(f"\nFetching page {page + 1}...")
    trades = client.get_trades(ticker=ticker, limit=100)
    
    if not trades:
        print("No more trades")
        break
    
    all_trades.extend(trades)
    
    # Check if any are whales
    for trade in trades:
        count = trade.get('count', 0)
        yes_price = trade.get('yes_price', 0)
        no_price = trade.get('no_price', 0)
        taker_side = trade.get('taker_side', '')
        
        if taker_side == 'yes':
            value = count * yes_price / 100
        else:
            value = count * no_price / 100
        
        if value >= 100000:
            print(f"\n*** WHALE FOUND! ***")
            print(f"  Time: {trade.get('created_time')}")
            print(f"  Shares: {count:,}")
            print(f"  Price: ${(yes_price if taker_side == 'yes' else no_price)/100:.2f}")
            print(f"  Side: {taker_side.upper()}")
            print(f"  Value: ${value:,.2f}")
    
    # The API doesn't support cursor pagination in our current implementation
    # so we're getting the same 100 trades each time
    break

print(f"\nTotal trades checked: {len(all_trades)}")

# Find the largest trade
if all_trades:
    largest_value = 0
    largest_trade = None
    
    for trade in all_trades:
        count = trade.get('count', 0)
        yes_price = trade.get('yes_price', 0)
        no_price = trade.get('no_price', 0)
        taker_side = trade.get('taker_side', '')
        
        if taker_side == 'yes':
            value = count * yes_price / 100
        else:
            value = count * no_price / 100
        
        if value > largest_value:
            largest_value = value
            largest_trade = trade
    
    print(f"\nLargest trade found:")
    print(f"  Value: ${largest_value:,.2f}")
    print(f"  Shares: {largest_trade.get('count', 0):,}")
    print(f"  Side: {largest_trade.get('taker_side', '').upper()}")
    print(f"  Time: {largest_trade.get('created_time')}")

