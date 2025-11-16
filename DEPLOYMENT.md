# BuilderScan Deployment Guide

Complete guide to deploy BuilderScan on Vercel, Base Mini App, and Farcaster Frame.

## 📦 Step 1: Push to GitHub

If you haven't pushed yet, run:

```bash
git add .
git commit -m "Ready for deployment"
git push origin master
```

If you get authentication errors, use SSH or set up a Personal Access Token:
- Go to GitHub Settings → Developer settings → Personal access tokens
- Create a token with `repo` permissions
- Use: `git remote set-url origin https://YOUR_TOKEN@github.com/arshiaxbt/BuilderScan.git`

---

## 🚀 Step 2: Deploy Frontend on Vercel

### Option A: Via Vercel Dashboard (Recommended)

1. **Go to [vercel.com](https://vercel.com)** and sign in with GitHub
2. **Click "Add New Project"**
3. **Import your repository**: `arshiaxbt/BuilderScan`
4. **Configure Project Settings**:
   - **Framework Preset**: Other
   - **Root Directory**: Leave as is (root)
   - **Build Command**: `npm ci && npm run -w apps/web build`
   - **Output Directory**: `apps/web/dist`
   - **Install Command**: `npm ci`

5. **Add Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add: `VITE_BUILDER_CODE` = `builderscan`

6. **Deploy**: Click "Deploy"
7. **Get your URL**: Vercel will give you a URL like `builderscan.vercel.app`

### Option B: Via Vercel CLI

```bash
npm i -g vercel
vercel login
cd /root
vercel
```

Follow the prompts. The `vercel.json` is already configured.

---

## 🖥️ Step 3: Deploy Backend Server

The frontend needs the API server running. Deploy the server separately:

### Option A: Render.com (Free Tier Available)

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click "New +" → "Web Service"
3. Connect your `arshiaxbt/BuilderScan` repository
4. **Configure**:
   - **Name**: `builderscan-api`
   - **Environment**: Node
   - **Build Command**: `npm ci && npm run -w apps/server build`
   - **Start Command**: `npm run -w apps/server start`
   - **Root Directory**: Leave as is

5. **Add Environment Variables**:
   ```
   BASE_RPC_URL=https://base.llamarpc.com
   START_BLOCK=17000000
   REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
   DATABASE_PATH=builderscan.db
   PORT=4000
   NODE_ENV=production
   ```

6. **Deploy**: Click "Create Web Service"
7. **Get your API URL**: `https://builderscan-api.onrender.com`

### Option B: Railway.app

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select `arshiaxbt/BuilderScan`
4. **Configure**:
   - **Root Directory**: Leave as is
   - **Build Command**: `npm ci && npm run -w apps/server build`
   - **Start Command**: `npm run -w apps/server start`

5. **Add Environment Variables** (same as Render above)
6. **Deploy**: Railway auto-deploys on push

### Update Frontend API URL

After deploying the backend, update your frontend to point to it:

1. In Vercel, go to your project → Settings → Environment Variables
2. Add: `VITE_API_URL` = `https://your-backend-url.com`
3. Update `apps/web/src/main.tsx` or create a config file to use this URL for API calls

**OR** use a proxy in `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://your-backend-url.com/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## 📱 Step 4: Deploy as Base Mini App

### Prerequisites

- Your app deployed on Vercel (e.g., `https://builderscan.vercel.app`)
- Base Wallet or Base app installed

### Steps

1. **Verify Meta Tags** (Already configured in `apps/web/index.html`):
   ```html
   <meta name="base:mini-app" content="true" />
   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
   ```

2. **Submit to Base Mini App Directory**:
   - Go to [Base Mini Apps Documentation](https://docs.base.org/mini-apps/)
   - Look for the submission form or contact Base team
   - Provide:
     - **App Name**: BuilderScan
     - **App URL**: `https://builderscan.vercel.app`
     - **Description**: Live explorer + leaderboard for ERC-8021 builder codes on Base
     - **Icon**: Use your logo URL: `https://builderscan.vercel.app/logo.png`
     - **Category**: Tools / Analytics
     - **Builder Code**: `builderscan`

3. **Test in Base App**:
   - Open Base app
   - Navigate to Mini Apps section
   - Search for "BuilderScan" or use direct link
   - Test wallet connection, likes, donations

### Base Mini App Features Already Implemented

✅ Viewport optimization (`viewport-fit=cover`)  
✅ Safe area insets for notched devices  
✅ Base Blue theme (#0000FF)  
✅ Wallet connection (EIP-1193)  
✅ Base chain switching (Chain ID 8453)  
✅ `window.BaseMiniApp.openURL()` for outbound links  
✅ ERC-8021 attribution on all outbound links  

---

## 🖼️ Step 5: Deploy as Farcaster Frame

### Prerequisites

- Your app deployed on Vercel
- Farcaster account

### Steps

1. **Verify Frame Meta Tags** (Already configured in `apps/web/index.html`):
   ```html
   <meta property="fc:frame" content="vNext" />
   <meta property="fc:frame:image" content="https://builderscan.vercel.app/logo-with-bg.png" />
   <meta property="fc:frame:button:1" content="View Leaderboard" />
   <meta property="fc:frame:post_url" content="https://builderscan.vercel.app" />
   ```

2. **Create a Farcaster Cast with Frame**:
   - Go to [Warpcast](https://warpcast.com) or your Farcaster client
   - Create a new cast
   - Add the Frame URL: `https://builderscan.vercel.app`
   - The Frame will render with your logo and "View Leaderboard" button

3. **Frame Interaction Flow**:
   - Users click "View Leaderboard" → Opens your app
   - Users can connect wallet, like, donate, open apps
   - All interactions work within the Frame context

### Farcaster Frame Features Already Implemented

✅ Frame v2 meta tags (`fc:frame`)  
✅ Frame image (logo with background)  
✅ Frame button ("View Leaderboard")  
✅ Post URL for interactions  
✅ Responsive design for Frame viewport  
✅ Wallet connection (Farcaster wallet compatible)  

### Testing Your Frame

1. **Use Frame Validator**:
   - Go to [Farcaster Frame Validator](https://warpcast.com/~/developers/frames)
   - Enter your URL: `https://builderscan.vercel.app`
   - Verify all meta tags are correct

2. **Test in Warpcast**:
   - Create a cast with your Frame URL
   - Click the Frame button
   - Verify it opens your app correctly

---

## 🔧 Step 6: Environment Variables Summary

### Frontend (Vercel)
```
VITE_BUILDER_CODE=builderscan
VITE_API_URL=https://your-backend-url.com (optional, if using proxy)
```

### Backend (Render/Railway)
```
BASE_RPC_URL=https://base.llamarpc.com
START_BLOCK=17000000
REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
DATABASE_PATH=builderscan.db
PORT=4000
NODE_ENV=production
```

---

## ✅ Verification Checklist

- [ ] Frontend deployed on Vercel
- [ ] Backend deployed on Render/Railway
- [ ] API endpoints accessible (test `/api/leaderboard`)
- [ ] Frontend loads without errors
- [ ] Wallet connection works
- [ ] Base Mini App meta tags present
- [ ] Farcaster Frame meta tags present
- [ ] Logo images load correctly
- [ ] Submitted to Base Mini App directory
- [ ] Created Farcaster cast with Frame

---

## 🐛 Troubleshooting

### Frontend shows "Cannot GET /"
- Check `vercel.json` rewrites are correct
- Ensure `outputDirectory` is `apps/web/dist`
- Verify build completed successfully

### API calls fail
- Check backend is running and accessible
- Verify CORS is enabled on backend
- Check `VITE_API_URL` or proxy configuration

### Base Mini App not opening
- Verify meta tag: `<meta name="base:mini-app" content="true" />`
- Check URL is accessible
- Test in Base app directly

### Farcaster Frame not rendering
- Use Frame Validator to check meta tags
- Ensure image URL is absolute and accessible
- Verify `fc:frame` version is `vNext`

---

## 📚 Resources

- [Base Mini Apps Docs](https://docs.base.org/mini-apps/)
- [Farcaster Frames Docs](https://docs.farcaster.xyz/reference/frames)
- [Vercel Deployment Docs](https://vercel.com/docs)
- [Render Deployment Docs](https://render.com/docs)
- [ERC-8021 Specification](https://eip.tools/eip/8021)

---

## 🎉 You're Done!

Your BuilderScan app is now:
- ✅ Live on Vercel
- ✅ Accessible as Base Mini App
- ✅ Available as Farcaster Frame
- ✅ Ready for users to explore builder codes!

Share your app URL and watch the leaderboard grow! 🚀

