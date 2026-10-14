# MADINE Frontend

Frontend application for MADINE — Jaipur's premier café discovery and social connection platform.

## Configuration

All backend API connections are configured in `js/config.js`.

### Connecting to Live Backend:
Open `js/config.js` and set your live backend server URL:
```javascript
const DEFAULT_BACKEND_URL = "https://your-madine-backend.onrender.com";
```

## Running Locally

Run with any static HTTP server:
```bash
npm run dev
```
Runs at `http://localhost:3000` and automatically connects to local backend at `http://localhost:4000`.

## Production Deployment

### Option 1: Vercel (Recommended)
1. Push this repository to GitHub as `madine-frontend`.
2. Go to [vercel.com](https://vercel.com) → **Add New Project**.
3. Select `madine-frontend`.
4. Deploy!

### Option 2: Netlify
1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**.
2. Select `madine-frontend`.
3. Deploy!
