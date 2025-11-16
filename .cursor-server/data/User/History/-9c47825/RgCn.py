"""Kalshi WebSocket client for real-time trade updates."""
import json
import time
import threading
from typing import Optional, Callable, Dict
import websocket
from kalshi_client import KalshiClient


class KalshiWebSocket:
    """WebSocket client for real-time Kalshi data."""
    
    def __init__(self, kalshi_client: KalshiClient, on_trade: Optional[Callable] = None):
        """Initialize WebSocket client.
        
        Args:
            kalshi_client: Authenticated Kalshi REST client (for auth)
            on_trade: Callback function for trade events
        """
        self.kalshi_client = kalshi_client
        self.on_trade_callback = on_trade
        self.ws = None
        self.ws_url = "wss://api.elections.kalshi.com/trade-api/ws/v2"
        self.is_connected = False
        self.should_reconnect = True
        self.reconnect_delay = 1
        self.max_reconnect_delay = 60
        self.subscribed_channels = set()
        self.heartbeat_thread = None
        self.last_pong = time.time()
        
    def connect(self):
        """Connect to Kalshi WebSocket."""
        print("Connecting to Kalshi WebSocket...")
        
        # Create WebSocket connection
        self.ws = websocket.WebSocketApp(
            self.ws_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close
        )
        
        # Run WebSocket in a separate thread
        ws_thread = threading.Thread(target=self._run_forever, daemon=True)
        ws_thread.start()
        
        # Wait for connection
        max_wait = 10
        waited = 0
        while not self.is_connected and waited < max_wait:
            time.sleep(0.1)
            waited += 0.1
        
        if not self.is_connected:
            print("⚠ WebSocket connection timeout")
            return False
        
        print("✓ Connected to Kalshi WebSocket")
        return True
    
    def _run_forever(self):
        """Run WebSocket connection with automatic reconnection."""
        while self.should_reconnect:
            try:
                self.ws.run_forever(ping_interval=20, ping_timeout=10)
            except Exception as e:
                print(f"WebSocket run error: {e}")
            
            if self.should_reconnect:
                print(f"Reconnecting in {self.reconnect_delay}s...")
                time.sleep(self.reconnect_delay)
                self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)
    
    def _on_open(self, ws):
        """Handle WebSocket connection open."""
        print("WebSocket connection opened")
        self.is_connected = True
        self.reconnect_delay = 1  # Reset reconnect delay
        
        # Subscribe to trade channel
        self.subscribe_trades()
        
        # Start heartbeat
        if self.heartbeat_thread is None or not self.heartbeat_thread.is_alive():
            self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
            self.heartbeat_thread.start()
    
    def _on_message(self, ws, message):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(message)
            msg_type = data.get('type')
            
            # Handle different message types
            if msg_type == 'trade':
                self._handle_trade(data)
            elif msg_type == 'pong':
                self.last_pong = time.time()
            elif msg_type == 'subscribed':
                channel = data.get('channel')
                print(f"✓ Subscribed to channel: {channel}")
                self.subscribed_channels.add(channel)
            elif msg_type == 'error':
                print(f"WebSocket error message: {data.get('message')}")
            else:
                # Log unknown message types for debugging
                if msg_type not in ['heartbeat', 'pong']:
                    print(f"Received message type: {msg_type}")
                    
        except json.JSONDecodeError as e:
            print(f"Failed to parse WebSocket message: {e}")
        except Exception as e:
            print(f"Error handling WebSocket message: {e}")
    
    def _handle_trade(self, data):
        """Handle trade message from WebSocket.
        
        Args:
            data: Trade message data
        """
        try:
            # Extract trade data
            trade_data = data.get('msg', {})
            
            if self.on_trade_callback:
                self.on_trade_callback(trade_data)
                
        except Exception as e:
            print(f"Error handling trade: {e}")
    
    def _on_error(self, ws, error):
        """Handle WebSocket errors."""
        print(f"WebSocket error: {error}")
    
    def _on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket connection close."""
        print(f"WebSocket connection closed (code: {close_status_code}, msg: {close_msg})")
        self.is_connected = False
        self.subscribed_channels.clear()
    
    def subscribe_trades(self):
        """Subscribe to all trades channel."""
        if not self.ws or not self.is_connected:
            print("Cannot subscribe: WebSocket not connected")
            return False
        
        try:
            # Subscribe to trade channel (all markets)
            subscribe_msg = {
                "cmd": "subscribe",
                "params": {
                    "channels": ["trade"]
                }
            }
            
            self.ws.send(json.dumps(subscribe_msg))
            print("Subscribing to trade channel...")
            return True
            
        except Exception as e:
            print(f"Failed to subscribe to trades: {e}")
            return False
    
    def subscribe_market_trades(self, ticker: str):
        """Subscribe to trades for a specific market.
        
        Args:
            ticker: Market ticker to subscribe to
        """
        if not self.ws or not self.is_connected:
            print("Cannot subscribe: WebSocket not connected")
            return False
        
        try:
            subscribe_msg = {
                "cmd": "subscribe",
                "params": {
                    "channels": [f"trade:{ticker}"]
                }
            }
            
            self.ws.send(json.dumps(subscribe_msg))
            print(f"Subscribing to market trades: {ticker}")
            return True
            
        except Exception as e:
            print(f"Failed to subscribe to market {ticker}: {e}")
            return False
    
    def _heartbeat_loop(self):
        """Send periodic ping messages to keep connection alive."""
        while self.is_connected:
            try:
                if self.ws and self.is_connected:
                    # Send ping
                    ping_msg = {"cmd": "ping"}
                    self.ws.send(json.dumps(ping_msg))
                    
                    # Check if we received pong recently
                    if time.time() - self.last_pong > 60:
                        print("No pong received in 60s, connection may be dead")
                        self.ws.close()
                        break
                
                time.sleep(20)  # Ping every 20 seconds
                
            except Exception as e:
                print(f"Heartbeat error: {e}")
                break
    
    def disconnect(self):
        """Disconnect from WebSocket."""
        print("Disconnecting WebSocket...")
        self.should_reconnect = False
        self.is_connected = False
        
        if self.ws:
            self.ws.close()
        
        print("WebSocket disconnected")

