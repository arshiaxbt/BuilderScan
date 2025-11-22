## BuilderScan – Base Mini App

Live explorer + leaderboard for ERC-8021 builder codes on Base.

### 🚀 Quick Start

1. **Install dependencies**
```bash
npm i
```

2. **Configure environment (server)**

Create a `.env` file in `apps/server`:

```bash
BASE_RPC_URL=https://base.llamarpc.com
START_BLOCK=17000000
REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
DATABASE_PATH=builderscan.db
PORT=4000
```

Set `REGISTRY_ADDRESS` to the canonical ERC-8021 Code Registry address on Base.
According to ERC-8021 spec:
- Chain ID 8453 (Base mainnet): **TBD** (To Be Determined)
- Chain ID 84532 (Base Sepolia testnet): **TBD**

The registry implements `ICodeRegistry` interface with:
- `payoutAddress(string code)` - address to receive rewards
- `codeURI(string code)` - metadata URI
- `isValidCode(string code)` - format validation
- `isRegistered(string code)` - registration check

3. **Run development server**

```bash
npm run dev
```

This starts both the API server (port 4000) and web app (Vite dev server).

4. **Index blockchain data**

The app automatically scans Base blockchain for ERC-8021 transactions:
- **Netlify**: Scheduled function runs `/api/index` every 5 minutes
- **Manual**: Call `GET /api/index` to trigger indexing
- **Local**: Run `npm -w apps/server run index:attrib` in a separate terminal

The indexer:
- Scans Base blocks for transactions with ERC-8021 suffixes
- Extracts builder codes from transaction calldata
- Aggregates stats (volume, fees, transaction count)
- Auto-registers discovered codes

**Note**: The leaderboard only shows codes with real on-chain activity. No demo data is used.

### 📦 Deployment

See **[NETLIFY_SETUP.md](./NETLIFY_SETUP.md)** for complete deployment instructions:
- Deploy frontend on Netlify
- Deploy backend on Render/Railway (optional)
- Submit as Base Mini App
- Create Farcaster Frame

### 🎯 Features

- **Live Leaderboard**: Top builder codes ranked by volume and transactions
- **On-chain Interactions**: Like and donate ETH to favorite builders
- **Wallet Integration**: Connect Base or Farcaster wallet
- **Direct App Links**: Open apps with builder code attribution
- **Base Mini App**: Optimized for Base app experience
- **Farcaster Frame**: Interactive Frame support

### 🔗 How it uses ERC-8021

- Reads Schema 0 canonical registry to map `code → owner + metadata + appUrl`
- Parses transaction suffixes to attribute volume to codes
- Leaderboard "Open" buttons append our builder code (`builderscan`) to target app URLs for monetized traffic
- All outbound links include ERC-8021 attribution

### 📝 Notes

- The attribution parser is a heuristic; replace with the official ERC-8021 Schema 0 decoding once confirmed
- Fee estimates are illustrative (0.05% of value). Update with the correct formula if specified by the standard
- For production, use a higher-capacity RPC (Alchemy/Infura/QuickNode) instead of the public RPC

### 🛠️ Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Express + SQLite + TypeScript
- **Blockchain**: Ethers.js, Base Chain (ID 8453)
- **Deployment**: Netlify (frontend), Render/Railway (backend, optional)

### 📄 License

MIT

### 👤 Built by

[arshiags.eth](https://farcaster.xyz/arshiags) | [X](https://x.com/ArshiaXBT) | [GitHub](https://github.com/arshiaxbt/BuilderScan)


