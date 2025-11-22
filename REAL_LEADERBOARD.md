# Real Leaderboard Implementation

## Overview

The app now uses **real on-chain data** from Base blockchain instead of demo data. The leaderboard is populated by scanning Base blocks for ERC-8021 transactions.

## How It Works

### 1. Attribution Indexer (`/api/index`)

The indexer serverless function:
- Scans Base blockchain blocks sequentially
- Extracts ERC-8021 builder codes from transaction calldata
- Stores attributions in SQLite database (`/tmp/builderscan.db`)
- Aggregates stats per code (volume, fees, transaction count)
- Tracks last scanned block to resume on next run

### 2. Automatic Scanning

**Netlify Scheduled Function**: Runs every 5 minutes
- Configuration: Netlify Dashboard → Functions → Scheduled Functions
- Function: `index`
- Schedule: `*/5 * * * *`
- Scans up to 2000 blocks per run

**Manual Trigger**: 
- Call `GET /api/index` to scan immediately
- Useful for testing or catching up after deployment

### 3. Leaderboard Query

The leaderboard (`/api/leaderboard`) only shows:
- Codes with `tx_count > 0` (real on-chain activity)
- Ranked by `fee_estimate_eth` DESC, then `volume_eth` DESC
- Includes likes from `code_likes` table

### 4. Database Schema

All data is stored in SQLite at `/tmp/builderscan.db`:

- `builder_codes`: Registered codes with owner addresses
- `code_stats`: Aggregated stats (tx_count, volume_eth, fee_estimate_eth)
- `tx_attributions`: Individual transaction attributions
- `code_likes`: User likes (on-chain interactions)
- `indexer_state`: Tracks last scanned block

## Environment Variables

Required for the indexer:

```bash
BASE_RPC_URL=https://mainnet.base.org  # Base RPC endpoint
```

Default: `https://mainnet.base.org` (public RPC)

**For production**, use a higher-capacity RPC:
- Alchemy: `https://base-mainnet.g.alchemy.com/v2/YOUR_KEY`
- Infura: `https://base-mainnet.infura.io/v3/YOUR_KEY`
- QuickNode: Your QuickNode Base endpoint

## Limitations

### Ephemeral Database

SQLite in `/tmp` is ephemeral:
- ✅ Persists during warm starts (same serverless function instance)
- ❌ Lost on cold starts (new instance)
- ❌ Lost on Netlify deployment

**Solutions for Production**:
1. **Netlify Postgres** (via addon, recommended)
2. **Turso** (serverless SQLite)
3. **PlanetScale** (MySQL)
4. **Supabase** (PostgreSQL)

### Block Scanning

- Scans 50 blocks per cron run (every 5 minutes)
- If Base produces >50 blocks in 5 minutes, will catch up over time
- On first run, starts from `currentBlock - 1000` (last 1000 blocks)

## Seed Endpoint

The `/api/seed` endpoint is **disabled in production**:
- Only works if `ENABLE_SEED=true` in environment
- Used for development/testing only
- Real leaderboard uses on-chain data only

## Monitoring

Check indexer status:
```bash
curl https://your-app.netlify.app/api/index
```

Response includes:
- `scannedBlocks`: Number of blocks scanned
- `attributions`: Number of ERC-8021 transactions found
- `fromBlock` / `toBlock`: Block range scanned
- `statsUpdated`: Number of codes with updated stats

## Next Steps

1. **Deploy to Netlify** - Configure scheduled function in dashboard
2. **Set BASE_RPC_URL** - Use a production RPC endpoint
3. **Monitor first run** - Check `/api/index` after deployment
4. **Wait for data** - Leaderboard populates as ERC-8021 transactions are found
5. **Upgrade database** - Consider Netlify Postgres or external database for persistence

## Troubleshooting

**Empty leaderboard?**
- Wait 5-10 minutes for first cron run
- Manually trigger: `GET /api/index`
- Check Netlify function logs for errors
- Verify `BASE_RPC_URL` is correct

**Missing transactions?**
- ERC-8021 is new - there may not be many transactions yet
- Check if transactions actually have ERC-8021 suffixes
- Verify indexer is scanning recent blocks

**Database resets?**
- Normal for `/tmp` on cold starts
- Consider upgrading to persistent database
- Indexer will re-scan and rebuild stats

