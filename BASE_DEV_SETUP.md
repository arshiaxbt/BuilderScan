# Base.dev Mini App Submission Guide

## Step 1: Sign Your Manifest

Before submitting to Base.dev, you **must** sign your manifest to prove ownership.

1. Go to https://base.dev and sign in with your Base account
2. Navigate to **Preview** → **Account Association**
3. Enter your Mini App URL: `https://builder-scan.netlify.app`
4. Click **Submit**
5. Follow the on-screen instructions to verify ownership
6. Sign the message using your wallet
7. Copy the generated `accountAssociation` object

## Step 2: Add accountAssociation to Manifest

After signing, you'll get an `accountAssociation` object like:
```json
{
  "header": "...",
  "payload": "...",
  "signature": "..."
}
```

Update `apps/web/netlify/functions/farcaster.ts`:
- Replace `accountAssociation: null` with the signed object
- Commit and push to deploy

## Step 3: Verify Manifest

1. Visit: `https://builder-scan.netlify.app/.well-known/farcaster.json`
2. Should return JSON with:
   - `accountAssociation` (signed object)
   - `miniapp` object with all required fields

## Step 4: Submit to Base.dev

1. Go to https://base.dev
2. Navigate to Mini Apps section
3. Submit your app URL: `https://builder-scan.netlify.app`
4. Base.dev will validate the manifest automatically

## Required Manifest Fields

Your `farcaster.json` must include:

```json
{
  "accountAssociation": {
    "header": "...",
    "payload": "...",
    "signature": "..."
  },
  "miniapp": {
    "version": "1",
    "name": "BuilderScan",
    "description": "ERC-8021 Builder Code Leaderboard on Base",
    "iconUrl": "https://...",
    "homeUrl": "https://builder-scan.netlify.app",
    "canonicalDomain": "builder-scan.netlify.app",
    "requiredChains": ["eip155:8453"],
    "tags": ["leaderboard", "erc-8021", "base"],
    "requiredCapabilities": ["actions.ready", "actions.signIn"]
  }
}
```

## Troubleshooting

**"Invalid manifest format" error:**
- Ensure `accountAssociation` is signed and included
- Verify all required fields in `miniapp` are present
- Check that `canonicalDomain` matches your actual domain
- Ensure `requiredChains` includes `"eip155:8453"` for Base

**Manifest not accessible:**
- Verify `.well-known/farcaster.json` is publicly accessible
- Check HTTPS is enabled
- Test the URL in a browser

## Reference

- [Base Mini Apps Documentation](https://docs.base.org/mini-apps/)
- [Sign Your Manifest Guide](https://docs.base.org/mini-apps/features/sign-manifest)

