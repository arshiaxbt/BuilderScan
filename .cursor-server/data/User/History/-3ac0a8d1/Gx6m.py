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
    
    def _sign_message(self, message: str) -> str:
        """Sign a message using RSA private key with PSS padding.
        
        Args:
            message: Message to sign
            
        Returns:
            Base64 encoded signature
        """
        signature = self.private_key.sign(
            message.encode('utf-8'),
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.DIGEST_LENGTH
            ),
            hashes.SHA256()
        )
        return base64.b64encode(signature).decode('utf-8')
    
    def _get_auth_headers(self, method: str, path: str) -> Dict:
        """Generate authentication headers for a request.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            path: API path (e.g., /trade-api/v2/markets)
            
        Returns:
            Dictionary of authentication headers
        """
        timestamp = str(int(time.time() * 1000))
        
        # Remove query params from path for signing
        path_parts = path.split('?')
        msg_string = timestamp + method + path_parts[0]
        
        signature = self._sign_message(msg_string)
        
        headers = {
            'Content-Type': 'application/json',
            'KALSHI-ACCESS-KEY': self.api_key_id,
            'KALSHI-ACCESS-SIGNATURE': signature,
            'KALSHI-ACCESS-TIMESTAMP': timestamp
        }
        
        return headers
    
    def login(self) -> bool:
        """Test connection to Kalshi API.
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            # Test with exchange status endpoint
            result = self.get_exchange_status()
            if result:
                return True
            return False
        except Exception as e:
            print(f"Connection test failed: {str(e)}")
            return False
    
    def get_exchange_status(self) -> Optional[Dict]:
        """Get exchange status."""
        return self._make_request('GET', '/trade-api/v2/exchange/status')
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict]:
        """Make authenticated request to Kalshi API.
        
        Args:
            method: HTTP method
            endpoint: API endpoint (e.g., /trade-api/v2/markets)
            **kwargs: Additional request parameters
            
        Returns:
            Response JSON or None on error
        """
        # Generate authentication headers
        headers = self._get_auth_headers(method, endpoint)
        
        # Merge with any additional headers
        if 'headers' in kwargs:
            headers.update(kwargs.pop('headers'))
        
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
        
        result = self._make_request('GET', '/trade-api/v2/markets', params=params)
        return result.get('markets', []) if result else None
    
    def get_market(self, ticker: str) -> Optional[Dict]:
        """Get details for a specific market.
        
        Args:
            ticker: Market ticker symbol
            
        Returns:
            Market object or None on error
        """
        result = self._make_request('GET', f'/trade-api/v2/markets/{ticker}')
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
        
        result = self._make_request('GET', '/trade-api/v2/markets/trades', params=params)
        return result.get('trades', []) if result else None
    
    def get_orderbook(self, ticker: str) -> Optional[Dict]:
        """Get orderbook for a market.
        
        Args:
            ticker: Market ticker symbol
            
        Returns:
            Orderbook data or None on error
        """
        result = self._make_request('GET', f'/trade-api/v2/markets/{ticker}/orderbook')
        return result if result else None

