#!/usr/bin/env python3
"""Check trades around the specific times mentioned."""
import credentials
import json
from datetime import datetime
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

# The tickers and times from the user
target_trades = [
    {
        "ticker": "KXNCAAFGAME-25NOV07NWUSC-USC",
        "time": "2025-11-08T05:13:00",  # 00:13 EST = 05:13 UTC
        "expected_shares": 152357,
        "expected_price": 0.84,
        "expected_value": 127980
    },
    {
        "ticker": "KXNBAGAME-25NOV07GSWDEN-DEN",
        "time": "2025-11-08T05:46:00",  # 00:46 EST = 05:46 UTC
        "expected_shares": 291599,
        "expected_price": 0.81,
        "expected_value": 236195
    }
]

for target in target_trades:
    print(f"\n{'='*80}")
    print(f"Searching for: {target['ticker']}")
    print(f"Expected time: {target['time']}")
    print(f"Expected: {target['expected_shares']:,} shares @ ${target['expected_price']} = ${target['expected_value']:,}")
    print(f"{'='*80}")
    
    # Get all recent trades for this ticker
    trades_data = client.get_trades(ticker=target['ticker'], limit=100)
    
    if not trades_data:
        print("No trades found")
        continue
    
    # Parse target time
    target_time = datetime.fromisoformat(target['time'].replace('Z', '+00:00'))
    
    # Look for trades around that time (within 5 minutes)
    print(f"\nLooking for trades near {target['time']}...")
    
    trades_near_time = []
    for trade in trades_data:
        trade_time = datetime.fromisoformat(trade['created_time'].replace('Z', '+00:00'))
        time_diff = abs((trade_time - target_time).total_seconds())
        
        if time_diff < 300:  # Within 5 minutes
            trades_near_time.append((trade, time_diff))
    
    if trades_near_time:
        print(f"\nFound {len(trades_near_time)} trade(s) within 5 minutes:")
        for trade, time_diff in sorted(trades_near_time, key=lambda x: x[1]):
            count = trade.get('count', 0)
            yes_price = trade.get('yes_price', 0)
            no_price = trade.get('no_price', 0)
            taker_side = trade.get('taker_side', '')
            price = yes_price if taker_side == 'yes' else no_price
            value_cents = count * price
            value_dollars = value_cents / 100
            
            print(f"\n  Trade ID: {trade.get('trade_id')}")
            print(f"  Time: {trade.get('created_time')} ({int(time_diff)}s diff)")
            print(f"  Shares: {count:,}")
            print(f"  Price: ${price/100:.2f}")
            print(f"  Side: {taker_side.upper()}")
            print(f"  Value: ${value_dollars:,.2f}")
            
            if count == target['expected_shares']:
                print(f"  *** EXACT MATCH ON SHARES! ***")
    else:
        print("\nNo trades found within 5 minutes of target time")
    
    # Also show the largest trade for this ticker
    print(f"\n\nLargest trade for {target['ticker']}:")
    largest_trade = None
    largest_value = 0
    
    for trade in trades_data:
        count = trade.get('count', 0)
        yes_price = trade.get('yes_price', 0)
        no_price = trade.get('no_price', 0)
        taker_side = trade.get('taker_side', '')
        price = yes_price if taker_side == 'yes' else no_price
        value_cents = count * price
        value_dollars = value_cents / 100
        
        if value_dollars > largest_value:
            largest_value = value_dollars
            largest_trade = trade
    
    if largest_trade:
        count = largest_trade.get('count', 0)
        yes_price = largest_trade.get('yes_price', 0)
        no_price = largest_trade.get('no_price', 0)
        taker_side = largest_trade.get('taker_side', '')
        price = yes_price if taker_side == 'yes' else no_price
        
        print(f"  Shares: {count:,}")
        print(f"  Price: ${price/100:.2f}")
        print(f"  Side: {taker_side.upper()}")
        print(f"  Value: ${largest_value:,.2f}")
        print(f"  Time: {largest_trade.get('created_time')}")

