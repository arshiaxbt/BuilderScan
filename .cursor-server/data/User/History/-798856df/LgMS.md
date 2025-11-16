# Valshi-X 🐋

**Whale Trade Detector & X Poster Bot**

A Python bot that monitors [Kalshi](https://kalshi.com) for large trades (>$100K) and automatically posts them to X (Twitter) with user-friendly formatting.

## Features

- ⚡ **WebSocket Real-time**: Instant trade detection with 0-second latency (no polling!)
- 🔍 **Real-time Monitoring**: Catches every trade as it happens on Kalshi
- 🐋 **Whale Detection**: Automatically detects trades over $100K (configurable)
- 🐦 **Auto-posting**: Posts formatted tweets to X with market details
- 📊 **User-friendly Format**: Clean, readable tweets with market info and links
- 🔄 **Deduplication**: Tracks posted trades to avoid duplicates
- 🔁 **Auto-reconnect**: Resilient WebSocket connection with automatic reconnection
- ⚡ **Efficient**: Caches market data to minimize API calls

## Requirements

- Python 3.8+
- Kalshi API credentials (API Key ID + Private Key)
- X (Twitter) API credentials (API Key, Secret, Access Token, Access Token Secret)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/arshiaxbt/valshi-x.git
cd valshi-x
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure credentials

Create a `credentials.py` file:

```python
import os

# Kalshi API Credentials
os.environ["KALSHI_API_KEY_ID"] = "your_api_key_id"
os.environ["KALSHI_PRIVATE_KEY"] = """-----BEGIN RSA PRIVATE KEY-----
your_private_key_here
-----END RSA PRIVATE KEY-----"""

# X (Twitter) API Credentials
os.environ["X_API_KEY"] = "your_api_key"
os.environ["X_API_SECRET"] = "your_api_secret"
os.environ["X_ACCESS_TOKEN"] = "your_access_token"
os.environ["X_ACCESS_TOKEN_SECRET"] = "your_access_token_secret"

# Bot Configuration
os.environ["CHECK_INTERVAL_SECONDS"] = "60"
os.environ["WHALE_THRESHOLD_DOLLARS"] = "100000"
```

### 4. Run the bot

**WebSocket Mode (Recommended - Real-time):**
```bash
python bot_websocket.py
```

**Legacy Polling Mode:**
```bash
python bot.py
```

> ⚡ **WebSocket mode is recommended** for instant trade detection with 0-second latency!

## Configuration

Edit `credentials.py` to adjust settings:

- `WHALE_THRESHOLD_DOLLARS`: Minimum trade value (default: 100000)
- `CHECK_INTERVAL_SECONDS`: Seconds between checks (default: 60)

## Running as a Service

### Systemd (Linux)

```bash
sudo cp valshi-x.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable valshi-x
sudo systemctl start valshi-x
```

View logs:
```bash
journalctl -u valshi-x -f
```

## Tweet Format

```
🐋 Whale Alert!

$125K trade on Will Trump win 2024?

📊 50,000 YES contracts @ 25¢ (25%)

@Kalshi @KalshiEco

https://kalshi.com/?search=TRUMPWIN-2024
```

## Project Structure

```
valshi-x/
├── bot.py                 # Main bot script
├── config.py              # Configuration management
├── credentials.py         # API credentials (not in repo)
├── kalshi_client.py       # Kalshi API client
├── x_client.py            # X (Twitter) API client
├── trade_monitor.py       # Trade monitoring logic
├── tweet_formatter.py     # Tweet formatting
├── requirements.txt       # Python dependencies
└── test_connection.py     # API connection tester
```

## API Information

### Kalshi API
- **Documentation**: https://docs.kalshi.com/
- **Authentication**: RSA-PSS signature
- **Base URL**: `https://api.elections.kalshi.com`

### X API
- **Documentation**: https://docs.x.com/
- **Authentication**: OAuth 1.0a
- **Tier**: Free tier supported

## Commands

```bash
# Test API connections
python test_connection.py

# Run bot
python bot.py

# Run in background
nohup python bot.py > bot.log 2>&1 &

# Stop bot
pkill -f bot.py
```

## Troubleshooting

### API Connection Issues
Run the test script:
```bash
python test_connection.py
```

### No Trades Detected
This is normal! Whale trades over $100K are relatively rare. To test:
1. Edit `credentials.py`
2. Change `WHALE_THRESHOLD_DOLLARS` to `"1000"` 
3. Restart the bot

### X API Rate Limits
The bot respects rate limits with 2-second delays between tweets. Free tier limitations may apply.

## Security

⚠️ **Never commit `credentials.py` to git!**

The `.gitignore` file is configured to protect your credentials.

## License

MIT

## Author

Created by [@arshiaxbt](https://github.com/arshiaxbt)

## Links

- **Live Bot**: [@ValshiBot](https://x.com/ValshiBot)
- **Kalshi**: https://kalshi.com
- **Issues**: https://github.com/arshiaxbt/valshi-x/issues
