# Netlify Setup Instructions

## Step-by-Step Guide to Deploy BuilderScan on Netlify

### Prerequisites
- GitHub account with BuilderScan repository
- Netlify account (sign up at https://netlify.com - free)

---

## 1. Create New Netlify Site

1. Go to https://app.netlify.com
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **"Deploy with GitHub"**
4. Authorize Netlify to access your GitHub account
5. Select repository: **`arshiaxbt/BuilderScan`**
6. Click **"Next"**

---

## 2. Configure Build Settings

### IMPORTANT: Set Base Directory

1. In the build configuration screen, find **"Base directory"**
2. Enter: `apps/web`
3. Click **"Show advanced"** to expand options

### Build Settings

Netlify should auto-detect from `netlify.toml`, but verify:

- **Base directory:** `apps/web`
- **Build command:** `npm install && npm run build` (auto-detected)
- **Publish directory:** `dist` (auto-detected)
- **Functions directory:** `netlify/functions` (auto-detected)

### Environment Variables (Optional)

Click **"New variable"** to add:

- `VITE_BUILDER_CODE` = `builderscan` (already in netlify.toml)
- `BASE_RPC_URL` = `https://mainnet.base.org` (optional, for indexer)
- `SCAN_DAYS_BACK` = `1` (optional, default is 1 day)

---

## 3. Deploy

1. Click **"Deploy site"**
2. Wait for the build to complete (2-3 minutes)
3. Your app will be live at: `https://random-name.netlify.app`

---

## 4. Configure Scheduled Function (Cron Job)

The indexer needs to run every 5 minutes. Set it up:

1. Go to **Site settings** → **Functions** → **Scheduled Functions**
2. Click **"Add scheduled function"**
3. Configure:
   - **Function:** `index`
   - **Schedule:** `*/5 * * * *` (every 5 minutes)
   - **Event:** `scheduled`
4. Click **"Save"**

**Alternative:** You can also trigger manually by visiting:
```
https://your-site.netlify.app/api/index
```

---

## 5. Verify Deployment

### Check these endpoints:

1. **Main App:**
   ```
   https://your-site.netlify.app/
   ```
   Should show the leaderboard UI

2. **Farcaster.json (for Base.dev):**
   ```
   https://your-site.netlify.app/.well-known/farcaster.json
   ```
   Should return JSON (not HTML)

3. **API Endpoints:**
   ```
   https://your-site.netlify.app/api/leaderboard
   https://your-site.netlify.app/api/index
   https://your-site.netlify.app/api/interactions/:code/like
   ```

---

## 6. Configure Custom Domain (Optional)

1. Go to **Site settings** → **Domain management**
2. Click **"Add custom domain"**
3. Follow DNS configuration instructions

---

## 7. Enable Auto-Deploy

Auto-deploy is enabled by default. Every push to `master` branch will trigger a new deployment.

To verify:
1. Go to **Site settings** → **Build & deploy** → **Continuous Deployment**
2. Ensure **"Deploy only when the build passes"** is enabled

---

## Project Structure

```
BuilderScan/
├── apps/
│   └── web/                    ← Base Directory for Netlify
│       ├── netlify/
│       │   └── functions/      ← Netlify serverless functions
│       │       ├── index.ts
│       │       ├── leaderboard.ts
│       │       ├── farcaster.ts
│       │       └── interactions-like.ts
│       ├── src/                ← React app source
│       ├── public/             ← Static assets
│       ├── netlify.toml        ← Netlify configuration
│       └── package.json        ← Dependencies
└── README.md
```

---

## Troubleshooting

### Build Fails
- Check **Deploy logs** for errors
- Verify Base directory is set to `apps/web`
- Ensure `apps/web/package.json` exists
- Check that `@netlify/functions` is in dependencies

### API Routes Not Working
- Verify `netlify/functions/` folder exists
- Check `netlify.toml` redirect rules
- Ensure functions are exported as `handler`

### Farcaster.json Returns HTML
- Check `netlify/functions/farcaster.ts` exists
- Verify `netlify.toml` redirect rule for `/.well-known/farcaster.json`

### Scheduled Function Not Running
- Go to **Functions** → **Scheduled Functions**
- Verify function name is `index` (matches file name)
- Check schedule is `*/5 * * * *`
- View function logs to see execution

### Auto-Deploy Not Working
- Go to **Site settings** → **Build & deploy** → **Continuous Deployment**
- Verify repository is connected
- Check branch is `master`
- Ensure "Deploy only when the build passes" is enabled

---

## Function Endpoints

After deployment, your functions are available at:

- `/api/leaderboard` → `netlify/functions/leaderboard.ts`
- `/api/index` → `netlify/functions/index.ts`
- `/api/interactions/:code/like` → `netlify/functions/interactions-like.ts`
- `/.well-known/farcaster.json` → `netlify/functions/farcaster.ts`

---

## Important Notes

- **Base Directory MUST be `apps/web`** - This is critical!
- All functions are in `netlify/functions/`
- The `netlify.toml` file is in `apps/web/`
- Build output goes to `apps/web/dist/`
- Functions use `/tmp` for SQLite (ephemeral)

---

## Netlify vs Vercel Differences

| Feature | Vercel | Netlify |
|---------|--------|---------|
| Functions location | `api/` | `netlify/functions/` |
| Config file | `vercel.json` | `netlify.toml` |
| Function format | `(req, res)` | `(event, context)` |
| Cron jobs | `crons` in config | Dashboard configuration |
| Dynamic routes | `[param]` folders | Path parsing in function |

---

## Support

If you encounter issues:
1. Check Netlify deployment logs
2. Verify file structure matches above
3. Ensure Base directory is correctly set
4. Check GitHub repository has latest commits
5. Review function logs in Netlify dashboard

---

## Next Steps

After successful deployment:
1. ✅ Test all API endpoints
2. ✅ Configure scheduled function for indexer
3. ✅ Verify farcaster.json for Base.dev
4. ✅ Set up custom domain (optional)
5. ✅ Monitor function logs

Your app is now live on Netlify! 🚀

