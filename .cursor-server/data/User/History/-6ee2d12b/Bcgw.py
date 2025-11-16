#!/usr/bin/env python3
"""Test different API endpoints to find where large trades appear."""
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

# Test different endpoints
ticker = "KXNCAAFGAME-25NOV07NWUSC-USC"

print(f"\n{'='*80}")
print(f"Testing endpoints for ticker: {ticker}")
print(f"{'='*80}")

# 1. Try market/trades endpoint
print("\n1. Testing /trade-api/v2/markets/trades")
result = client._make_request('GET', '/trade-api/v2/markets/trades', params={'ticker': ticker, 'limit': 10})
if result and 'trades' in result:
    print(f"   Returned {len(result['trades'])} trades")
    if result['trades']:
        print(f"   Sample trade: {json.dumps(result['trades'][0], indent=6)}")
else:
    print(f"   Result: {result}")

# 2. Try markets/{ticker}/trades endpoint
print(f"\n2. Testing /trade-api/v2/markets/{ticker}/trades")
result = client._make_request('GET', f'/trade-api/v2/markets/{ticker}/trades', params={'limit': 10})
if result:
    print(f"   Result: {json.dumps(result, indent=3)}")
else:
    print("   No result")

# 3. Try trades endpoint (without market filter)
print("\n3. Testing /trade-api/v2/portfolio/trades")
result = client._make_request('GET', '/trade-api/v2/portfolio/trades', params={'limit': 10})
if result:
    if 'trades' in result:
        print(f"   Returned {len(result['trades'])} trades")
    else:
        print(f"   Result: {json.dumps(result, indent=3)}")
else:
    print("   No result")

# 4. Try getting market history/events
print(f"\n4. Testing /trade-api/v2/markets/{ticker}/history")
result = client._make_request('GET', f'/trade-api/v2/markets/{ticker}/history')
if result:
    print(f"   Result keys: {result.keys() if isinstance(result, dict) else 'not a dict'}")
    print(f"   Result: {json.dumps(result, indent=3)[:500]}...")
else:
    print("   No result")

# 5. Get market details
print(f"\n5. Testing /trade-api/v2/markets/{ticker}")
result = client._make_request('GET', f'/trade-api/v2/markets/{ticker}')
if result and 'market' in result:
    market = result['market']
    print(f"   Market status: {market.get('status')}")
    print(f"   Volume: {market.get('volume')}")
    print(f"   Open interest: {market.get('open_interest')}")
    print(f"   Last price: {market.get('last_price')}")
else:
    print("   No result")

