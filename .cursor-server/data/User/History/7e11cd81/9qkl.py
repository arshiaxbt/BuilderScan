"""X (Twitter) API client for posting tweets."""
import tweepy
from typing import Optional


class XClient:
    """Client for interacting with X API."""
    
    def __init__(self, api_key: str, api_secret: str, access_token: str, access_token_secret: str):
        """Initialize X client with credentials.
        
        Args:
            api_key: X API key
            api_secret: X API secret
            access_token: X access token
            access_token_secret: X access token secret
        """
        self.api_key = api_key
        self.api_secret = api_secret
        self.access_token = access_token
        self.access_token_secret = access_token_secret
        
        # Initialize Tweepy client
        self.client = tweepy.Client(
            consumer_key=api_key,
            consumer_secret=api_secret,
            access_token=access_token,
            access_token_secret=access_token_secret
        )
    
    def post_tweet(self, text: str) -> Optional[str]:
        """Post a tweet.
        
        Args:
            text: Tweet text (max 280 characters)
            
        Returns:
            Tweet ID if successful, None otherwise
        """
        try:
            # Ensure tweet is within character limit
            if len(text) > 280:
                print(f"Warning: Tweet truncated from {len(text)} to 280 characters")
                text = text[:277] + "..."
            
            response = self.client.create_tweet(text=text)
            
            if response and response.data:
                tweet_id = response.data['id']
                print(f"Tweet posted successfully: ID {tweet_id}")
                return tweet_id
            else:
                print("Tweet posted but no ID returned")
                return None
                
        except tweepy.TweepyException as e:
            print(f"Error posting tweet: {str(e)}")
            return None
        except Exception as e:
            print(f"Unexpected error posting tweet: {str(e)}")
            return None
    
    def test_connection(self) -> bool:
        """Test connection to X API.
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            me = self.client.get_me()
            if me and me.data:
                print(f"Connected to X as: @{me.data.username}")
                return True
            return False
        except Exception as e:
            print(f"Connection test failed: {str(e)}")
            return False

