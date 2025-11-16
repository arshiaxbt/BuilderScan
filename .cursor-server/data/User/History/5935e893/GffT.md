# Frequently Asked Questions (FAQ)

## General Questions

### Q: Is the bot ready to use?
**A:** ✅ Yes! The bot has been tested and is fully operational. Just run `python3 bot.py` to start.

### Q: What does the bot do?
**A:** The bot monitors Kalshi for large trades (>$100K by default) and automatically posts them to X (Twitter) with user-friendly formatting.

### Q: Where can I see the posted tweets?
**A:** Check https://x.com/ValshiBot - The bot successfully posted 7 test tweets during setup.

---

## Configuration

### Q: How do I change the whale threshold?
**A:** Edit `/root/kalshi_whale_bot/credentials.py`:

```python
os.environ["WHALE_THRESHOLD_DOLLARS"] = "50000"  # Change to $50K
```

Then restart the bot.

### Q: How do I change how often it checks?
**A:** Edit `/root/kalshi_whale_bot/credentials.py`:

```python
os.environ["CHECK_INTERVAL_SECONDS"] = "30"  # Check every 30 seconds
```

Note: More frequent checks = more API calls.

### Q: Can I use a different X account?
**A:** Yes, just replace the X API credentials in `credentials.py` with your other account's keys.

---

## Running the Bot

### Q: How do I run the bot?
**A:** 
```bash
cd /root/kalshi_whale_bot
python3 bot.py
```

### Q: How do I run it 24/7?
**A:** Use one of these methods:

**Option 1 - nohup (simplest):**
```bash
nohup python3 bot.py > bot.log 2>&1 &
```

**Option 2 - screen (recommended):**
```bash
screen -S kalshi_bot
python3 bot.py
# Press Ctrl+A then D to detach
```

**Option 3 - systemd (production):**
See `DEPLOYMENT.md` for full setup.

### Q: How do I stop the bot?
**A:** 
- If running in foreground: Press `Ctrl+C`
- If using nohup: `pkill -f bot.py`
- If using screen: `screen -r kalshi_bot` then `Ctrl+C`
- If using systemd: `sudo systemctl stop kalshi-whale-bot`

### Q: How do I check if the bot is running?
**A:**
```bash
ps aux | grep bot.py
```

### Q: How do I view the logs?
**A:**
- If using nohup: `tail -f bot.log`
- If using screen: `screen -r kalshi_bot`
- If using systemd: `sudo journalctl -u kalshi-whale-bot -f`

---

## Troubleshooting

### Q: The bot isn't detecting any trades
**A:** This is normal! Whale trades over $100K are relatively rare. To test:
1. Lower the threshold to $1,000 or $10,000
2. Edit `credentials.py` line 44
3. Restart the bot
4. You should see more activity

### Q: API connection failed
**A:** Run the test script:
```bash
python3 test_connection.py
```

If Kalshi fails:
- Check internet connection
- Verify API key ID in `credentials.py`
- Verify private key is correct

If X fails:
- Verify all 4 API credentials are correct
- Check if your X app has write permissions
- Ensure not rate-limited

### Q: Tweet posting failed
**A:** Possible causes:
- X API rate limits (free tier)
- Invalid credentials
- App suspended

Check your X developer portal for issues.

### Q: Bot crashed
**A:** Check the logs for error messages. Common causes:
- Network connectivity issues
- API rate limits
- Invalid responses from APIs

The bot will auto-recover on the next check cycle in most cases.

### Q: I get "externally-managed environment" error
**A:** This happened during setup but was fixed. If you see it again:
```bash
pip3 install --break-system-packages -r requirements.txt
```

---

## Features

### Q: Does the bot avoid posting duplicate trades?
**A:** Yes! It tracks the last 10,000 trade IDs and won't post the same trade twice.

### Q: What information is included in tweets?
**A:** Each tweet includes:
- 🐋 Whale emoji
- Trade value ($XXX format)
- Market title
- Number of contracts
- Contract side (YES/NO)
- Price in cents and percentage
- @Kalshi @KalshiEco mentions
- Direct link to the market

### Q: Does it respect API rate limits?
**A:** Yes! The bot:
- Waits 2 seconds between multiple tweets
- Uses efficient API calls
- Handles rate limit errors gracefully

### Q: Can it post multiple whales at once?
**A:** Yes! If multiple whale trades are detected, it posts them all with 2-second delays between tweets.

---

## Technical

### Q: What Python version is required?
**A:** Python 3.8 or higher. Check with: `python3 --version`

### Q: What dependencies does it use?
**A:** 
- `requests` - HTTP requests
- `tweepy` - X (Twitter) API
- `cryptography` - RSA signing for Kalshi
- `python-dotenv` - Environment variables

### Q: How does Kalshi authentication work?
**A:** The bot uses RSA-PSS signature authentication:
1. Generates timestamp
2. Signs `timestamp + method + path` with private key
3. Sends signature in request headers
4. No tokens or sessions needed

### Q: How does X authentication work?
**A:** OAuth 1.0a using consumer keys and access tokens via Tweepy library.

### Q: Where is data stored?
**A:** In memory only. The bot tracks seen trade IDs in RAM. If restarted, it might re-post recent trades (but will then remember them).

### Q: Can I add a database?
**A:** Yes! You can modify `trade_monitor.py` to use SQLite or another database for persistence.

---

## Performance

### Q: How much CPU does it use?
**A:** < 1% - The bot is mostly idle, waiting between checks.

### Q: How much memory?
**A:** 20-50 MB typically.

### Q: How much bandwidth?
**A:** ~1-5 MB/day for API calls (varies with activity).

### Q: Will logs fill up my disk?
**A:** Logs grow ~1-10 MB/day. Set up log rotation if running long-term (see DEPLOYMENT.md).

---

## Security

### Q: Are my API keys safe?
**A:** Your `credentials.py` file is:
- Protected by `.gitignore` (won't be committed to git)
- Only readable by you (set permissions with `chmod 600`)
- Not logged or displayed

However, it's stored in plain text, so keep your system secure.

### Q: Should I rotate my API keys?
**A:** Yes, good practice is to rotate every 90 days.

### Q: Can someone steal my keys?
**A:** Only if they have access to your server. Use:
- Strong passwords
- SSH key authentication
- Firewall rules
- Regular security updates

---

## Customization

### Q: Can I change the tweet format?
**A:** Yes! Edit `tweet_formatter.py` - the `format_whale_tweet()` method.

### Q: Can I add more information to tweets?
**A:** Yes! The bot has access to full market and trade data. Modify `tweet_formatter.py` to include additional fields.

### Q: Can I post to multiple X accounts?
**A:** Not currently, but you can modify the code to support multiple `XClient` instances.

### Q: Can I filter by market category?
**A:** Yes! Modify `trade_monitor.py` to filter based on ticker patterns or market titles.

### Q: Can I add Discord/Telegram support?
**A:** Yes! You'd need to:
1. Add Discord/Telegram client libraries
2. Create new client modules similar to `x_client.py`
3. Modify `bot.py` to post to multiple platforms

---

## Best Practices

### Q: What's the best whale threshold?
**A:** 
- **$100K+** - Very rare, true whales
- **$50K-$100K** - Occasional large trades
- **$10K-$50K** - Regular significant trades
- **$1K-$10K** - Frequent, for testing

### Q: What's the best check interval?
**A:** 
- **60 seconds** - Good balance (default)
- **30 seconds** - More responsive, more API calls
- **120 seconds** - Less API load, slower detection

### Q: Should I run it 24/7?
**A:** Yes, if you want to catch all whale trades. Use systemd or screen for persistence.

### Q: How do I monitor it remotely?
**A:** 
- SSH into your server
- Check logs: `tail -f bot.log`
- Check X account: https://x.com/ValshiBot
- Set up systemd for auto-restart on crashes

---

## Advanced

### Q: Can I run multiple bots with different thresholds?
**A:** Yes! Copy the directory and modify credentials in each:
```bash
cp -r /root/kalshi_whale_bot /root/kalshi_whale_bot_50k
# Edit thresholds and use different X accounts
```

### Q: Can I use the demo Kalshi API?
**A:** Yes! Change in `config.py`:
```python
KALSHI_API_BASE: str = "https://demo-api.kalshi.co"
```

### Q: Can I add alerts for specific markets?
**A:** Yes! Modify `trade_monitor.py` to check ticker patterns and send special alerts.

### Q: Can I integrate with webhooks?
**A:** Yes! Modify `bot.py` to send HTTP POST requests when whales are detected.

---

## Support

### Q: Something's not working, what should I do?
**A:** 
1. Check logs for errors
2. Run `python3 test_connection.py`
3. Review `TROUBLESHOOTING` section in README.md
4. Check this FAQ
5. Review the code (it's well-commented!)

### Q: Can I modify the code?
**A:** Absolutely! The code is clean, documented, and designed to be modified.

### Q: Where can I find more documentation?
**A:** Check these files:
- `README.md` - Complete guide
- `QUICKSTART.md` - Quick start
- `DEPLOYMENT.md` - 24/7 deployment
- `ARCHITECTURE.md` - System design
- `NOTES.md` - Developer notes
- `TEST_RESULTS.md` - Test report

---

## Quick Commands

```bash
# Start bot
python3 bot.py

# Start in background
nohup python3 bot.py > bot.log 2>&1 &

# Test APIs
python3 test_connection.py

# View logs
tail -f bot.log

# Check if running
ps aux | grep bot.py

# Stop bot
pkill -f bot.py

# Check posted tweets
# Visit: https://x.com/ValshiBot
```

---

**Last Updated**: November 7, 2025  
**Status**: All systems operational ✅

