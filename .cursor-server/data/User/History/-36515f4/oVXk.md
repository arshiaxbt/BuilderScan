# Quick Start Guide 🚀

Get the Kalshi Whale Bot up and running in 5 minutes!

## Prerequisites

- Python 3.8 or higher installed
- Internet connection

## Installation Steps

### 1. Navigate to the bot directory

```bash
cd /root/kalshi_whale_bot
```

### 2. Install dependencies

**Option A - Using the setup script (recommended)**:
```bash
./setup.sh
```

**Option B - Manual installation**:
```bash
pip install -r requirements.txt
```

### 3. Run the bot

```bash
python bot.py
```

Or with Python 3 explicitly:
```bash
python3 bot.py
```

## What Happens Next?

1. The bot connects to Kalshi API ✓
2. The bot connects to X (Twitter) API ✓
3. Bot starts monitoring for trades over $100K
4. Every 60 seconds, it checks for new whale trades
5. When a whale is detected, it automatically posts to X!

## Expected Output

```
Initializing Kalshi Whale Bot...
Connecting to Kalshi API...
✓ Connected to Kalshi API
Connecting to X API...
✓ Connected to X API
✓ Bot initialized successfully!

Starting monitoring...
Whale threshold: $100,000
Check interval: 60s
Press Ctrl+C to stop

[Cycle 1] Checking for whale trades...
No new whale trades found
Waiting 60s until next check...
```

## Stopping the Bot

Press `Ctrl+C` to gracefully stop the bot.

## Testing

To test with a lower threshold (e.g., $1,000 instead of $100K), edit `credentials.py`:

```python
os.environ["WHALE_THRESHOLD_DOLLARS"] = "1000"  # Change this value
```

Then restart the bot.

## Troubleshooting

### Import errors
Make sure you're in the correct directory:
```bash
cd /root/kalshi_whale_bot
python bot.py
```

### API connection errors
- Check that your credentials in `credentials.py` are correct
- Ensure you have internet connection
- For Kalshi: Verify API key is valid
- For X: Verify all 4 credentials are correct (API Key, Secret, Access Token, Access Token Secret)

### No trades detected
- Whale trades over $100K are relatively rare
- Try lowering the threshold for testing (see Testing section above)
- Check [kalshi.com](https://kalshi.com) to see if there's active trading

## Next Steps

- Monitor the bot output to see when whales are detected
- Check your X profile to see posted tweets
- Adjust `CHECK_INTERVAL_SECONDS` in `credentials.py` if needed
- Adjust `WHALE_THRESHOLD_DOLLARS` to catch more or fewer trades

## Need Help?

- Read the full [README.md](README.md) for detailed information
- Check the code comments in each Python file
- Review [Kalshi API docs](https://docs.kalshi.com/)
- Review [X API docs](https://docs.x.com/)

---

**Happy whale hunting! 🐋**

