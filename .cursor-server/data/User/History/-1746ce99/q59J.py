#!/usr/bin/env python3
"""Test WebSocket connection to Kalshi."""
import asyncio
import websockets
import json
import time
import credentials
from config import Config
from kalshi_client import KalshiClient

Config.load_from_env()

async def test_websocket():
    """Test WebSocket connection."""
    # Create Kalshi client
    client = KalshiClient(
        api_key_id=Config.KALSHI_API_KEY_ID,
        private_key_pem=Config.KALSHI_PRIVATE_KEY,
        base_url=Config.KALSHI_API_BASE
    )
    
    if not client.login():
        print("Failed to login")
        return
    
    print("✓ Kalshi API authenticated")
    
    # Get auth token
    auth_token = client.get_auth_token()
    print(f"✓ Auth token generated: {auth_token[:50]}...")
    
    # Connect to WebSocket
    # Try different WebSocket URLs
    ws_urls = [
        "wss://trading-api.kalshi.com/trade-api/ws/v2",
        "wss://api.elections.kalshi.com/trade-api/ws/v2",
        "wss://demo-api.kalshi.co/trade-api/ws/v2"
    ]
    
    for ws_url in ws_urls:
        print(f"\nTrying: {ws_url}")
        
        try:
            # Try with KALSHI-ACCESS-* headers like REST API
            timestamp = str(int(time.time() * 1000))
            msg_string = timestamp + "GET" + "/trade-api/ws/v2"
            signature = client._sign_message(msg_string)
            
            headers = {
                'KALSHI-ACCESS-KEY': Config.KALSHI_API_KEY_ID,
                'KALSHI-ACCESS-SIGNATURE': signature,
                'KALSHI-ACCESS-TIMESTAMP': timestamp
            }
            
            print(f"  Headers: {list(headers.keys())}")
            
            async with websockets.connect(ws_url, additional_headers=headers) as websocket:
                print("✓ WebSocket connected!")
                
                # Subscribe to trade channel
                subscribe_msg = {
                    "id": 1,
                    "cmd": "subscribe",
                    "params": {
                        "channels": ["trade"]
                    }
                }
                
                print(f"\nSending subscription: {json.dumps(subscribe_msg, indent=2)}")
                await websocket.send(json.dumps(subscribe_msg))
                
                # Listen for messages
                print("\nListening for messages (30 seconds)...")
                for i in range(30):
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        data = json.loads(message)
                        print(f"\n[Message {i+1}]")
                        print(json.dumps(data, indent=2)[:500])
                        
                        if data.get('type') == 'trade':
                            trade = data.get('msg', {})
                            count = trade.get('count', 0)
                            yes_price = trade.get('yes_price', 0)
                            value = count * yes_price / 100
                            print(f"  -> Trade value: ${value:,.2f}")
                            
                    except asyncio.TimeoutError:
                        print(".", end="", flush=True)
                        
                print("\n\n✓ Test complete")
                return
                
        except Exception as e:
            print(f"  ✗ Error: {str(e)}")
            continue
    
    print("\n✗ All WebSocket URLs failed")

if __name__ == "__main__":
    asyncio.run(test_websocket())

