# Developer Notes & Considerations

## Important Information

### API Endpoints

**Kalshi API**
- Production: `https://api.elections.kalshi.com/trade-api/v2`
- Demo: `https://demo-api.kalshi.co/trade-api/v2`
- Currently using: Production (elections API)

**X API**
- Using OAuth 1.0a (API Key + Secret + Access Token + Access Token Secret)
- Free tier limitations: Write access only, rate limits apply
- Tweet character limit: 280 characters

### Authentication

**Kalshi**
- Uses RSA-256 signature authentication
- Signs timestamp with private key
- Token expires after ~30 minutes, automatically refreshes
- Authentication header: `X-KALSHI-KEYID`, `X-KALSHI-TIMESTAMP`, `X-KALSHI-SIGNATURE`

**X (Twitter)**
- OAuth 1.0a with consumer keys and access tokens
- Using Tweepy library for authentication
- Free tier: Limited to write-only operations

### Trade Value Calculation

Kalshi contracts are binary (Yes/No) with these characteristics:
- Each contract pays $1 if correct, $0 if incorrect
- Prices are in cents (0-100)
- Trade value = `count * price / 100`

Example:
- 50,000 YES contracts at 25¢ = 50,000 * 25 / 100 = $12,500

### Whale Detection Logic

1. Fetch recent trades (up to 100)
2. Calculate trade value for each
3. Filter trades above threshold ($100K default)
4. Check against seen trade IDs (deduplication)
5. Fetch market details for context
6. Format and post to X

### Edge Cases & Limitations

**1. Rate Limits**
- Kalshi: Token-based, handles automatically
- X: Free tier has strict rate limits
  - Solution: Bot adds 2-second delay between multiple tweets

**2. Duplicate Detection**
- Tracks last 10,000 trade IDs in memory
- Automatically prunes to 5,000 when limit reached
- Trade IDs are unique per trade on Kalshi

**3. Tweet Length**
- Hard limit: 280 characters
- Long market titles are truncated automatically
- Fallback to compact format if needed

**4. Market Data Caching**
- Markets are cached after first lookup
- Reduces API calls
- Cache persists for bot lifetime (until restart)

**5. Network Failures**
- Bot continues running even if API calls fail
- Errors are logged to console
- Will retry on next check cycle

**6. Token Expiry**
- Kalshi tokens refresh automatically at 25 minutes
- No user intervention needed

**7. Missing Market Details**
- If market details can't be fetched, trade is skipped
- Ensures tweets always have complete information

### Data Freshness

- Bot checks every 60 seconds (configurable)
- Kalshi `/markets/trades` endpoint returns recent trades
- Some trades might be delayed in appearing
- No guarantee of real-time detection (depends on API)

### Tweet Format

Standard format:
```
🐋 Whale Alert!

[Value] trade on [Market Title]

📊 [Count] [SIDE] contracts @ [Price]¢ ([Percentage]%)

@Kalshi @KalshiEco

[Market URL]
```

Compact format (for long titles):
```
🐋 [Value] whale trade
[Count] [SIDE] contracts @ [Price]¢
@Kalshi @KalshiEco
[Market URL]
```

### Known Issues & Limitations

1. **X Free Tier**: Limited write operations, may hit rate limits with many whales
2. **No Historical Scanning**: Only detects new trades, doesn't scan history on startup
3. **Single Instance**: Running multiple instances will post duplicate tweets
4. **Memory Usage**: Seen trade IDs kept in memory, grows over time (with pruning)
5. **No Database**: State is lost on restart, might re-post recent trades
6. **Market URL Format**: Assumes standard Kalshi URL format, might change

### Potential Improvements

1. **Database Integration**: Store seen trades in SQLite for persistence
2. **Webhook Support**: Real-time detection via Kalshi webhooks (if available)
3. **Better Error Recovery**: Exponential backoff for API failures
4. **Logging**: Structured logging to file for debugging
5. **Metrics**: Track posted tweets, errors, API latency
6. **Multi-threshold**: Different emoji/formatting for different trade sizes
7. **Volume Tracking**: Daily/weekly volume summaries
8. **Market Categories**: Tag tweets by market category

### Security Considerations

**Credentials Storage**
- ⚠️ `credentials.py` contains sensitive API keys in plain text
- Included in `.gitignore` to prevent accidental commits
- For production: Use environment variables or secret management service

**Private Key**
- RSA private key stored in plain text
- Should be kept secure
- Rotate if ever exposed

**X API Keys**
- Write-only access (can post tweets)
- Cannot read DMs or perform other actions
- Rotate if compromised

### Monitoring & Debugging

**Console Output**
- All operations logged to stdout
- Includes cycle numbers, trade details, API responses
- Use for monitoring and debugging

**Testing**
- Run `python test_connection.py` to verify API connections
- Lower `WHALE_THRESHOLD_DOLLARS` to test with smaller trades
- Monitor bot for first few cycles to ensure working correctly

### Deployment Considerations

**Running 24/7**
- Use `screen`, `tmux`, or `nohup` for persistent sessions
- Consider systemd service for auto-restart
- Monitor for crashes or API changes

**Log Rotation**
- Console output can be redirected to file: `python bot.py > bot.log 2>&1`
- Implement log rotation to prevent disk filling

**Updates**
- Kalshi API might change, monitor their changelog
- X API updates might break compatibility
- Keep dependencies updated: `pip install --upgrade -r requirements.txt`

### Testing Checklist

- [ ] API credentials are correct
- [ ] Both APIs connect successfully (`python test_connection.py`)
- [ ] Bot starts without errors
- [ ] Trades are detected (use lower threshold for testing)
- [ ] Tweets are posted correctly
- [ ] Format looks good on X
- [ ] Links work
- [ ] Mentions are properly tagged (@Kalshi @KalshiEco)

### Useful Commands

```bash
# Test API connections
python test_connection.py

# Run bot normally
python bot.py

# Run with output to file
python bot.py > bot.log 2>&1

# Run in background (nohup)
nohup python bot.py > bot.log 2>&1 &

# Check if bot is running
ps aux | grep bot.py

# Stop bot (if running in background)
pkill -f bot.py
```

### Resources

- [Kalshi API Docs](https://docs.kalshi.com/)
- [Kalshi Python Starter Code](https://github.com/Kalshi/kalshi-starter-code-python)
- [X API Docs](https://docs.x.com/)
- [Tweepy Documentation](https://docs.tweepy.org/)

---

**Last Updated**: November 2025

