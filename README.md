## BuilderScan – Base Mini App

Live explorer + leaderboard for ERC-8021 builder codes on Base.

### Quick start

1) Install

```bash
npm i
```

2) Configure environment (server)

Create a `.env` file in `apps/server`:

```bash
BASE_RPC_URL=https://mainnet.base.org
START_BLOCK=17000000
REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
DATABASE_PATH=builderscan.db
PORT=4000
```

Set `REGISTRY_ADDRESS` to the canonical ERC-8021 Schema 0 registry address (TBD).

3) Run dev (API + Web)

```bash
npm run dev
```

4) Index data

In a separate terminal, run:

```bash
npm -w apps/server run index:registry
npm -w apps/server run index:attrib
```

### How it uses ERC-8021

- Reads Schema 0 canonical registry to map `code → owner + metadata + appUrl` (replace ABI/address accordingly).
- Parses transaction suffixes to attribute volume to codes (placeholder parser in `attributionIndexer.ts`; replace with canonical parser).
- Leaderboard “Open” buttons append our builder code to the target app URL for monetized jumps inside Base Mini Apps.

### Notes

- The attribution parser is a heuristic; replace with the official ERC-8021 Schema 0 decoding once confirmed.
- Fee estimates are illustrative (0.05% of value). Update with the correct formula if specified by the standard.


