# Vercel Setup Instructions

## Step-by-Step Guide to Deploy BuilderScan on Vercel

### Prerequisites
- GitHub account with BuilderScan repository
- Vercel account (sign up at https://vercel.com)

---

## 1. Create New Vercel Project

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Import your Git repository:
   - Select **GitHub** as your Git provider
   - Find and select **`arshiaxbt/BuilderScan`**
   - Click **"Import"**

---

## 2. Configure Project Settings

### Root Directory
**IMPORTANT:** Set the Root Directory to `apps/web`

1. In the project configuration screen, find **"Root Directory"**
2. Click **"Edit"**
3. Enter: `apps/web`
4. Click **"Continue"**

### Framework Preset
- Select: **"Other"** or leave as **"No Framework"**
- Vercel will use the `vercel.json` configuration

### Build Settings
Vercel should auto-detect from `apps/web/vercel.json`:
- **Build Command:** `npm install && npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

If not auto-detected, manually set:
- Build Command: `npm install && npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

---

## 3. Environment Variables (Optional)

Add these if needed:

1. Go to **Settings** → **Environment Variables**
2. Add variables:
   - `VITE_BUILDER_CODE` = `builderscan` (already in vercel.json)
   - `BASE_RPC_URL` = `https://mainnet.base.org` (optional, for indexer)
   - `SCAN_DAYS_BACK` = `1` (optional, default is 1 day)

---

## 4. Deploy

1. Click **"Deploy"**
2. Wait for the build to complete (2-3 minutes)
3. Your app will be live at: `https://your-project-name.vercel.app`

---

## 5. Verify Deployment

### Check these endpoints:

1. **Main App:**
   ```
   https://your-project-name.vercel.app/
   ```
   Should show the leaderboard UI

2. **Farcaster.json (for Base.dev):**
   ```
   https://your-project-name.vercel.app/.well-known/farcaster.json
   ```
   Should return JSON (not HTML)

3. **API Endpoints:**
   ```
   https://your-project-name.vercel.app/api/leaderboard
   https://your-project-name.vercel.app/api/index
   ```

---

## 6. Configure Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain
3. Follow DNS configuration instructions

---

## 7. Verify Cron Job

The indexer runs automatically every 5 minutes via Vercel Cron:

1. Go to **Settings** → **Cron Jobs**
2. You should see: `/api/index` scheduled for `*/5 * * * *`
3. Check **Deployments** → **Functions** to see cron execution logs

---

## 8. Manual Indexer Trigger

To manually trigger the indexer:

1. Visit: `https://your-project-name.vercel.app/api/index`
2. Or use the "Trigger Indexer Now" button on the app (when leaderboard is empty)

---

## Troubleshooting

### Build Fails
- Check **Deployments** → **Build Logs** for errors
- Verify Root Directory is set to `apps/web`
- Ensure `apps/web/package.json` exists

### API Routes Not Working
- Verify `apps/web/api/` folder exists
- Check `vercel.json` rewrite rules
- Ensure serverless functions are in `apps/web/api/`

### Farcaster.json Returns HTML
- Check `apps/web/api/.well-known/farcaster.ts` exists
- Verify `vercel.json` rewrite rule for `/.well-known/farcaster.json`

### Auto-Deploy Not Working
- Go to **Settings** → **Git**
- Verify repository is connected
- Check **"Ignored Build Step"** is set to **"Automatic"**
- Ensure Production Branch is `master`

---

## Project Structure

```
BuilderScan/
├── apps/
│   └── web/              ← Root Directory for Vercel
│       ├── api/          ← Serverless functions
│       │   ├── index/
│       │   ├── leaderboard/
│       │   ├── interactions/
│       │   └── .well-known/
│       ├── src/          ← React app source
│       ├── public/       ← Static assets
│       ├── vercel.json   ← Vercel configuration
│       └── package.json  ← Dependencies
└── README.md
```

---

## Important Notes

- **Root Directory MUST be `apps/web`** - This is critical!
- All API routes are in `apps/web/api/`
- The `vercel.json` file is in `apps/web/`
- Build output goes to `apps/web/dist/`

---

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify file structure matches above
3. Ensure Root Directory is correctly set
4. Check GitHub repository has latest commits

