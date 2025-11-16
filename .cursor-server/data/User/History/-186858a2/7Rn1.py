"""WebSocket client for real-time Kalshi trade data."""
import asyncio
import json
import time
import websockets
from typing import Callable, Optional
from kalshi_client import KalshiClient


class KalshiWebSocketClient:
    """WebSocket client for real-time Kalshi data."""
    
    def __init__(self, kalshi_client: KalshiClient):
        """Initialize WebSocket client.
        
        Args:
            kalshi_client: Authenticated Kalshi client for auth token
        """
        self.kalshi_client = kalshi_client
        self.ws_url = "wss://trading-api.kalshi.com/trade-api/ws/v2"
        self.websocket = None
        self.running = False
        self.trade_callback: Optional[Callable] = None
        self.reconnect_delay = 1  # Start with 1 second
        self.max_reconnect_delay = 60  # Max 60 seconds
        
    def on_trade(self, callback: Callable):
        """Set callback for trade events.
        
        Args:
            callback: Function to call with trade data
        """
        self.trade_callback = callback
    
    async def connect(self):
        """Connect to Kalshi WebSocket."""
        try:
            # Connect to WebSocket
            print("Connecting to Kalshi WebSocket...")
            self.websocket = await websockets.connect(
                self.ws_url,
                extra_headers={
                    'Authorization': f'Bearer {self.kalshi_client.api_key_id}'
                }
            )
            print("✓ Connected to WebSocket")
            
            # Subscribe to trade channel
            await self.subscribe_to_trades()
            
            # Reset reconnect delay on successful connection
            self.reconnect_delay = 1
            
            return True
            
        except Exception as e:
            print(f"Failed to connect to WebSocket: {str(e)}")
            return False
    
    async def subscribe_to_trades(self):
        """Subscribe to trade updates."""
        subscribe_msg = {
            "id": 1,
            "cmd": "subscribe",
            "params": {
                "channels": ["trade"]
            }
        }
        
        try:
            await self.websocket.send(json.dumps(subscribe_msg))
            print("✓ Subscribed to trade channel")
        except Exception as e:
            print(f"Failed to subscribe: {str(e)}")
    
    async def listen(self):
        """Listen for WebSocket messages."""
        self.running = True
        
        while self.running:
            try:
                if not self.websocket:
                    if not await self.connect():
                        # Exponential backoff
                        print(f"Reconnecting in {self.reconnect_delay}s...")
                        await asyncio.sleep(self.reconnect_delay)
                        self.reconnect_delay = min(
                            self.reconnect_delay * 2,
                            self.max_reconnect_delay
                        )
                        continue
                
                # Receive message
                message = await asyncio.wait_for(
                    self.websocket.recv(),
                    timeout=30.0
                )
                
                # Parse and handle message
                data = json.loads(message)
                await self.handle_message(data)
                
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                try:
                    await self.websocket.ping()
                except:
                    print("Connection lost, reconnecting...")
                    self.websocket = None
                    
            except websockets.exceptions.ConnectionClosed:
                print("WebSocket connection closed, reconnecting...")
                self.websocket = None
                
            except Exception as e:
                print(f"WebSocket error: {str(e)}")
                await asyncio.sleep(1)
    
    async def handle_message(self, data: dict):
        """Handle incoming WebSocket message.
        
        Args:
            data: Parsed JSON message
        """
        msg_type = data.get('type')
        
        if msg_type == 'trade':
            # Trade update
            trade_data = data.get('msg', {})
            if self.trade_callback:
                # Run callback in thread pool to avoid blocking
                asyncio.create_task(self._run_callback(trade_data))
                
        elif msg_type == 'subscribed':
            print(f"✓ Subscription confirmed: {data.get('msg', {}).get('channels', [])}")
            
        elif msg_type == 'error':
            print(f"WebSocket error: {data.get('msg')}")
    
    async def _run_callback(self, trade_data: dict):
        """Run trade callback in async context.
        
        Args:
            trade_data: Trade data from WebSocket
        """
        try:
            if asyncio.iscoroutinefunction(self.trade_callback):
                await self.trade_callback(trade_data)
            else:
                self.trade_callback(trade_data)
        except Exception as e:
            print(f"Error in trade callback: {str(e)}")
    
    async def close(self):
        """Close WebSocket connection."""
        self.running = False
        if self.websocket:
            await self.websocket.close()
            print("WebSocket connection closed")
    
    def run_forever(self):
        """Run WebSocket client (blocking)."""
        try:
            asyncio.run(self.listen())
        except KeyboardInterrupt:
            print("\nStopping WebSocket client...")

