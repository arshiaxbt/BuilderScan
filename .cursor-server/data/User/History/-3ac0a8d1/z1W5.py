"""Kalshi API client with authentication."""
import base64
import time
from typing import Dict, List, Optional
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend


class KalshiClient:
    """Client for interacting with Kalshi API."""
    
    def __init__(self, api_key_id: str, private_key_pem: str, base_url: str):
        """Initialize Kalshi client with credentials.
        
        Args:
            api_key_id: Kalshi API key ID
            private_key_pem: RSA private key in PEM format
            base_url: Base URL for Kalshi API
        """
        self.api_key_id = api_key_id
        self.base_url = base_url
        self.session = requests.Session()
        
        # Load private key
        self.private_key = serialization.load_pem_private_key(
            private_key_pem.encode('utf-8'),
            password=None,
            backend=default_backend()
        )
        
        self.token = None
        self.token_expiry = 0
    
    def _sign_message(self, message: str) -> str:
        """Sign a message using RSA private key.
        
        Args:
            message: Message to sign
            
        Returns:
            Base64 encoded signature
        """
        signature = self.private_key.sign(
            message.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        return base64.b64encode(signature).decode('utf-8')
    
    def login(self) -> bool:
        """Authenticate with Kalshi API.
        
        Returns:
            True if login successful, False otherwise
        """
        try:
            timestamp = str(int(time.time() * 1000))
            message = timestamp
            signature = self._sign_message(message)
            
            headers = {
                'Content-Type': 'application/json',
                'X-KALSHI-KEYID': self.api_key_id,
                'X-KALSHI-TIMESTAMP': timestamp,
                'X-KALSHI-SIGNATURE': signature
            }
            
            response = self.session.post(
                f"{self.base_url}/login",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('token')
                # Tokens typically expire in 30 minutes, refresh at 25 minutes
                self.token_expiry = time.time() + (25 * 60)
                return True
            else:
                print(f"Login failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"Login error: {str(e)}")
            return False
    
    def _ensure_authenticated(self):
        """Ensure we have a valid authentication token."""
        if not self.token or time.time() >= self.token_expiry:
            self.login()
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict]:
        """Make authenticated request to Kalshi API.
        
        Args:
            method: HTTP method
            endpoint: API endpoint (without base URL)
            **kwargs: Additional request parameters
            
        Returns:
            Response JSON or None on error
        """
        self._ensure_authenticated()
        
        headers = kwargs.pop('headers', {})
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        url = f"{self.base_url}{endpoint}"
        
        try:
            response = self.session.request(
                method,
                url,
                headers=headers,
                **kwargs
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Request failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"Request error: {str(e)}")
            return None
    
    def get_markets(self, limit: int = 100, status: str = "open") -> Optional[List[Dict]]:
        """Get list of markets.
        
        Args:
            limit: Maximum number of markets to return
            status: Market status filter (open, closed, settled)
            
        Returns:
            List of market objects or None on error
        """
        params = {
            'limit': limit,
            'status': status
        }
        
        result = self._make_request('GET', '/markets', params=params)
        return result.get('markets', []) if result else None
    
    def get_market(self, ticker: str) -> Optional[Dict]:
        """Get details for a specific market.
        
        Args:
            ticker: Market ticker symbol
            
        Returns:
            Market object or None on error
        """
        result = self._make_request('GET', f'/markets/{ticker}')
        return result.get('market') if result else None
    
    def get_trades(self, ticker: Optional[str] = None, limit: int = 100) -> Optional[List[Dict]]:
        """Get recent trades.
        
        Args:
            ticker: Optional market ticker to filter by
            limit: Maximum number of trades to return
            
        Returns:
            List of trade objects or None on error
        """
        params = {'limit': limit}
        if ticker:
            params['ticker'] = ticker
        
        result = self._make_request('GET', '/markets/trades', params=params)
        return result.get('trades', []) if result else None
    
    def get_orderbook(self, ticker: str) -> Optional[Dict]:
        """Get orderbook for a market.
        
        Args:
            ticker: Market ticker symbol
            
        Returns:
            Orderbook data or None on error
        """
        result = self._make_request('GET', f'/markets/{ticker}/orderbook')
        return result if result else None

