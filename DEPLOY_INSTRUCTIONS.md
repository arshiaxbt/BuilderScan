# 🚀 BuilderScan Deployment Instructions

## ✅ Step 1: Push to GitHub

Your code is ready in the `BuilderScan` folder. Push it to GitHub:

```bash
cd /root/BuilderScan
git push origin master
```

**If you get authentication errors:**
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Create a token with `repo` permissions
3. Run:
   ```bash
   git remote set-url origin https://YOUR_TOKEN@github.com/arshiaxbt/BuilderScan.git
   git push origin master
   ```

---

## 🌐 Step 2: Deploy Frontend on Vercel

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
cd /root/BuilderScan
vercel
```

Follow the prompts. The `vercel.json` is already configured.

---

## 🖥️ Step 3: Deploy Backend Server (Optional for now)

The frontend can work standalone, but if you want the API server:

### Render.com (Free Tier Available)

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

**Note**: If you deploy the backend, update your frontend to use it by adding `VITE_API_URL` environment variable in Vercel.

---

## 📱 Step 4: Submit as Base Mini App

After your app is deployed on Vercel (e.g., `https://builderscan.vercel.app`):

1. **Verify Meta Tags** (Already configured in `apps/web/index.html`):
   - ✅ `<meta name="base:mini-app" content="true" />`
   - ✅ Viewport optimized for Base app
   - ✅ Base Blue theme (#0000FF)

2. **Submit to Base Mini App Directory**:
   - Go to [Base Mini Apps Documentation](https://docs.base.org/mini-apps/)
   - Look for the submission form or contact Base team
   - Provide:
     - **App Name**: BuilderScan
     - **App URL**: `https://builderscan.vercel.app` (or your Vercel URL)
     - **Description**: Live explorer + leaderboard for ERC-8021 builder codes on Base
     - **Icon**: `https://builderscan.vercel.app/logo.png`
     - **Category**: Tools / Analytics
     - **Builder Code**: `builderscan`

3. **Test in Base App**:
   - Open Base app
   - Navigate to Mini Apps section
   - Search for "BuilderScan" or use direct link
   - Test wallet connection, likes, donations

---

## 🖼️ Step 5: Create Farcaster Frame

After your app is deployed on Vercel:

1. **Verify Frame Meta Tags** (Already configured in `apps/web/index.html`):
   - ✅ Frame v2 meta tags (`fc:frame`)
   - ✅ Frame image: `logo-with-bg.png`
   - ✅ Frame button: "View Leaderboard"
   - ✅ Post URL configured

2. **Create a Farcaster Cast with Frame**:
   - Go to [Warpcast](https://warpcast.com) or your Farcaster client
   - Create a new cast
   - Add the Frame URL: `https://builderscan.vercel.app`
   - The Frame will render with your logo and "View Leaderboard" button

3. **Test Your Frame**:
   - Use [Farcaster Frame Validator](https://warpcast.com/~/developers/frames)
   - Enter your URL: `https://builderscan.vercel.app`
   - Verify all meta tags are correct

---

## ✅ Verification Checklist

- [ ] Code pushed to GitHub
- [ ] Frontend deployed on Vercel
- [ ] App URL accessible (test in browser)
- [ ] Wallet connection works
- [ ] Base Mini App meta tags present
- [ ] Farcaster Frame meta tags present
- [ ] Logo images load correctly
- [ ] Submitted to Base Mini App directory
- [ ] Created Farcaster cast with Frame

---

## 🎉 You're Done!

Your BuilderScan app is now:
- ✅ Live on Vercel
- ✅ Ready for Base Mini App submission
- ✅ Ready for Farcaster Frame

Share your app URL and watch the leaderboard grow! 🚀

---

## 📚 Resources

- [Base Mini Apps Docs](https://docs.base.org/mini-apps/)
- [Farcaster Frames Docs](https://docs.farcaster.xyz/reference/frames)
- [Vercel Deployment Docs](https://vercel.com/docs)
- [ERC-8021 Specification](https://eip.tools/eip/8021)

