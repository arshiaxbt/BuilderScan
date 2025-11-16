# Architecture Overview

## System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         KALSHI WHALE BOT                        │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   bot.py     │  Main Entry Point
    │ (Main Loop)  │  - Initializes all components
    └──────┬───────┘  - Coordinates monitoring & posting
           │
           ├─────────────────────────────────────────────────┐
           │                                                   │
    ┌──────▼───────┐                                  ┌───────▼──────┐
    │  config.py   │                                  │ credentials  │
    │              │                                  │    .py       │
    │ • Environment│◄─────────────────────────────────┤              │
    │   Variables  │                                  │ • API Keys   │
    │ • Settings   │                                  │ • Secrets    │
    └──────┬───────┘                                  └──────────────┘
           │
           ├────────────────────────────┬─────────────────────────┐
           │                            │                         │
    ┌──────▼────────┐           ┌──────▼─────────┐       ┌───────▼────────┐
    │ kalshi_client │           │   x_client.py  │       │trade_monitor.py│
    │     .py       │           │                │       │                │
    │               │           │ • Tweepy       │       │ • Trade class  │
    │ • RSA Auth    │           │ • OAuth 1.0a   │       │ • Monitoring   │
    │ • API Calls   │           │ • Post Tweets  │       │ • Filtering    │
    │ • Token Mgmt  │           │                │       │ • Dedup Logic  │
    └───────┬───────┘           └───────┬────────┘       └────────┬───────┘
            │                           │                         │
            │                           │                         │
            │                   ┌───────▼────────┐                │
            │                   │ tweet_formatter│                │
            │                   │     .py        │                │
            │                   │                │                │
            └───────────────────┤ • Format Tweet │◄───────────────┘
                                │ • Length Check │
                                │ • URL Builder  │
                                └────────────────┘
```

## Data Flow

```
┌───────────┐
│  Kalshi   │
│    API    │
└─────┬─────┘
      │ 1. Fetch Trades
      ▼
┌─────────────────────┐
│  Trade Monitor      │
│  • Get recent trades│
│  • Filter >$100K    │──► 2. Check against seen IDs
│  • Deduplicate      │
└──────────┬──────────┘
           │ 3. New whale trades found
           ▼
┌─────────────────────┐
│  Trade Monitor      │
│  • Fetch market     │◄── 4. Get market details from Kalshi
│    details          │
└──────────┬──────────┘
           │ 5. (Trade, Market) pairs
           ▼
┌─────────────────────┐
│  Tweet Formatter    │
│  • Build tweet text │
│  • Add emojis       │──► 6. Format user-friendly tweet
│  • Add mentions     │
│  • Add URL          │
└──────────┬──────────┘
           │ 7. Formatted tweet text
           ▼
┌─────────────────────┐
│     X Client        │
│  • Authenticate     │──► 8. Post to X (Twitter)
│  • Post tweet       │
└──────────┬──────────┘
           │ 9. Success/Failure
           ▼
      ┌────────┐
      │   X    │
      │ Twitter│
      └────────┘
```

## Component Responsibilities

### bot.py
**Role**: Main orchestrator
- Initializes all components
- Runs main monitoring loop
- Coordinates between monitor and poster
- Handles graceful shutdown

**Key Methods**:
- `__init__()`: Setup all clients
- `run()`: Main loop
- `post_whale_trades()`: Post formatting and posting

### config.py
**Role**: Configuration management
- Loads environment variables
- Validates required settings
- Provides configuration to all components

**Key Settings**:
- API credentials (Kalshi, X)
- Whale threshold ($100K)
- Check interval (60s)

### credentials.py
**Role**: Credential storage
- Sets environment variables
- Contains API keys and secrets
- **Security**: Must not be committed to git

### kalshi_client.py
**Role**: Kalshi API interaction
- RSA signature authentication
- Token management (auto-refresh)
- Market and trade data fetching

**Key Methods**:
- `login()`: Authenticate with RSA signature
- `get_markets()`: Fetch market list
- `get_market()`: Get specific market details
- `get_trades()`: Fetch recent trades

**Authentication Flow**:
1. Generate timestamp
2. Sign timestamp with RSA private key
3. Send signature in headers
4. Receive JWT token
5. Use token for subsequent requests
6. Auto-refresh before expiry

### x_client.py
**Role**: X (Twitter) API interaction
- OAuth 1.0a authentication
- Tweet posting

**Key Methods**:
- `__init__()`: Setup Tweepy client
- `post_tweet()`: Post a tweet
- `test_connection()`: Verify credentials

### trade_monitor.py
**Role**: Trade monitoring and whale detection
- Fetches trades from Kalshi
- Calculates trade values
- Filters for whales (>$100K)
- Deduplicates seen trades
- Caches market data

**Key Classes**:
- `Trade`: Represents a single trade
  - Parses trade data
  - Calculates value
  - Whale detection
- `TradeMonitor`: Monitoring logic
  - Fetches and filters trades
  - Manages seen trades set
  - Market detail caching

**Deduplication**:
- Maintains set of seen trade IDs
- Prevents re-posting same trade
- Auto-prunes when >10,000 IDs

### tweet_formatter.py
**Role**: Tweet formatting
- Formats whale trades for X
- Handles character limits
- Generates market URLs

**Key Methods**:
- `format_currency()`: $125K format
- `format_whale_tweet()`: Full tweet
- `get_market_url()`: Kalshi market link

**Tweet Structure**:
- Emoji header (🐋)
- Trade value
- Market title
- Trade details (contracts, price)
- Mentions (@Kalshi @KalshiEco)
- Market URL

## API Integration

### Kalshi API
```
Base URL: https://api.elections.kalshi.com/trade-api/v2

Endpoints Used:
- POST   /login                    → Authentication
- GET    /markets                  → List markets
- GET    /markets/{ticker}         → Market details
- GET    /markets/trades           → Recent trades

Authentication:
- Type: RSA signature
- Headers:
  • X-KALSHI-KEYID: [API Key ID]
  • X-KALSHI-TIMESTAMP: [Unix timestamp ms]
  • X-KALSHI-SIGNATURE: [Base64 RSA signature]
- Response: JWT token (30 min expiry)
- Subsequent: Authorization: Bearer [token]
```

### X API
```
Authentication: OAuth 1.0a

Credentials Required:
- API Key (Consumer Key)
- API Secret (Consumer Secret)
- Access Token
- Access Token Secret

Endpoints Used (via Tweepy):
- POST /2/tweets                  → Create tweet
- GET  /2/users/me                → Verify credentials

Rate Limits:
- Free tier: Limited write operations
- Bot adds delays between tweets
```

## Memory Management

### Trade ID Storage
- In-memory set of seen trade IDs
- Grows to max 10,000 IDs
- Auto-prunes to 5,000 when limit reached
- Prevents duplicate posting
- Lost on restart (might re-post recent trades)

### Market Cache
- Dictionary: ticker → market details
- Reduces API calls for repeated markets
- Persists for bot lifetime
- Cleared on restart

## Error Handling

### Network Errors
- Logged to console
- Bot continues running
- Retry on next cycle

### API Errors
- Kalshi: Failed requests return None
- X: Tweepy exceptions caught and logged
- No automatic retry within cycle

### Authentication Errors
- Kalshi: Token auto-refreshes
- X: Logged and continues

## Performance Characteristics

### Timing
- Check interval: 60 seconds (configurable)
- API call time: ~1-3 seconds per cycle
- Multiple tweets: 2-second delay between

### API Calls Per Cycle
- 1x get_trades() → 100 trades
- Nx get_market() → Only for new whales
- Nx post_tweet() → One per whale

### Memory Usage
- Minimal: ~10-50 MB typical
- Grows with seen trades (capped at 10K IDs)
- Market cache grows unbounded (typically small)

## Security Model

### Credentials
- Stored in plain text (credentials.py)
- Not committed to git (.gitignore)
- Loaded as environment variables

### API Access
- Kalshi: Read-only market/trade access
- X: Write-only (post tweets)
- No sensitive data exposure

### Best Practices
- Rotate keys if exposed
- Monitor posted tweets
- Review bot output regularly

## Extensibility

### Easy Modifications
1. **Threshold**: Change `WHALE_THRESHOLD_DOLLARS`
2. **Interval**: Change `CHECK_INTERVAL_SECONDS`
3. **Tweet Format**: Edit `tweet_formatter.py`
4. **Detection Logic**: Edit `TradeMonitor.is_whale()`

### Potential Extensions
1. Database for persistence
2. Multiple threshold tiers
3. Volume aggregation/summaries
4. Market category filtering
5. Webhook-based detection
6. Dashboard for monitoring
7. Multiple X accounts
8. Discord/Telegram integration

## Testing Strategy

### Unit Testing
- Test each client independently
- Mock API responses
- Verify formatting logic

### Integration Testing
- `test_connection.py` → API connectivity
- Manual run → End-to-end flow
- Lower threshold → More test data

### Monitoring
- Console output → Real-time status
- Watch X profile → Verify posts
- Check Kalshi → Verify trade data

---

**Architecture Version**: 1.0
**Last Updated**: November 2025

