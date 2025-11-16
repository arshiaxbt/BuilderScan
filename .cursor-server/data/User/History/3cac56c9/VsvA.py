#!/usr/bin/env python3
"""Test if there's a public trades feed or different endpoint."""
import credentials
import json
import requests
from kalshi_client import KalshiClient
from config import Config

Config.load_from_env()

# Try accessing trades WITHOUT authentication (public endpoint)
print("Testing public (unauthenticated) access to trades...")

base_url = "https://api.elections.kalshi.com"

# Try to get public trades
tickers = [
    "KXNCAAFGAME-25NOV07NWUSC-USC",
    "KXNBAGAME-25NOV07GSWDEN-DEN"
]

for ticker in tickers:
    print(f"\n{'='*80}")
    print(f"Ticker: {ticker}")
    print(f"{'='*80}")
    
    # Try public endpoint without auth
    url = f"{base_url}/trade-api/v2/markets/trades?ticker={ticker}&limit=10"
    print(f"\nTrying: {url}")
    
    response = requests.get(url)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)[:500]}")
    else:
        print(f"Response: {response.text[:200]}")

# Now try with authentication
print("\n\n" + "="*80)
print("Testing WITH authentication (what our bot uses)")
print("="*80)

client = KalshiClient(
    api_key_id=Config.KALSHI_API_KEY_ID,
    private_key_pem=Config.KALSHI_PRIVATE_KEY,
    base_url=Config.KALSHI_API_BASE
)

if client.login():
    for ticker in tickers[:1]:  # Just test first one
        print(f"\nGetting trades for {ticker} with auth...")
        trades = client.get_trades(ticker=ticker, limit=5)
        if trades:
            print(f"Got {len(trades)} trades")
            for i, trade in enumerate(trades[:2]):
                print(f"\nTrade {i+1}:")
                print(f"  Count: {trade.get('count', 0):,}")
                print(f"  Price: {trade.get('yes_price', 0) / 100}")
                print(f"  Side: {trade.get('taker_side', '')}")
                value = trade.get('count', 0) * (trade.get('yes_price', 0) if trade.get('taker_side') == 'yes' else trade.get('no_price', 0)) / 100
                print(f"  Value: ${value:,.2f}")

