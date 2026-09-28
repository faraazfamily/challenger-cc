# Laptop band ho tab bhi website chalane ka setup

Teen alag jagah chalti hain (teeno free):

| Kya | Kahan | Status |
|---|---|---|
| Website (React) | Vercel | ✅ already hai |
| Database (Postgres) | Neon | ✅ already bana hai (bas abhi backend use nahi kar raha) |
| API (Go) | Render | ⬅ ye abhi laptop pe hai — isko cloud pe daalna hai |

## Step 1 — Patch apply karo
Is zip ke saare files apne `challenger-cc` folder me copy/overwrite karo, phir GitHub pe push.

## Step 2 — Neon ka connection string lo (aur password rotate karo)
Neon dashboard → apna project → **Connect** → *Pooled connection* string copy karo.
(Pehle Roles me password reset kar do — purana `.env` files me share ho chuka hai.)

## Step 3 — Laptop ka data Neon me copy karo (PowerShell, `backend-go` folder me)
```powershell
$env:SOURCE_DATABASE_URL="postgresql://postgres:APNA_PASSWORD@localhost:5432/challenger_cc?sslmode=disable"
$env:DATABASE_URL="NEON_CONNECTION_STRING"
$env:CONFIRM="yes"
go run ./cmd/copydata
```
Ye Neon ke tables khaali karke laptop ka poora data (players, matches, stats, photos) copy karta hai.
Pehle dono "host" line dekh lena: FROM = localhost, TO = neon.tech.

## Step 4 — Admin password badlo (public site pe `admin123` mat rakhna)
```powershell
$env:DATABASE_URL="NEON_CONNECTION_STRING"
go run ./cmd/setadmin admin "TumharaNayaStrongPassword"
```

## Step 5 — Render pe API deploy
1. render.com → GitHub se sign in → **New → Blueprint** → apna repo select karo (`render.yaml` apne aap mil jayegi).
2. Jab `DATABASE_URL` maange → Neon connection string paste karo. Deploy dabao.
3. Deploy ke baad URL milega jaisa `https://challenger-cc-api-xxxx.onrender.com`.
   Browser me `<URL>/api/health` kholo → `{"status":"ok"}` aana chahiye.

## Step 6 — Vercel ko naya API address batao
1. Vercel → frontend project → Settings → Environment Variables → `VITE_API_URL` = Render URL (no `/` at end).
   (Agar pehle se koi tunnel/localhost wali value hai to usko replace karo.)
2. `frontend/.env.production` me bhi wahi URL daalo → push.
3. Vercel me **Redeploy** karo (env change ke baad redeploy zaroori hai).

## Step 7 — Render ko sone se roko (optional, free)
Render free service 15 min idle ke baad so jaati hai; pehla request ~1 minute leta hai.
cron-job.org ya UptimeRobot pe free monitor banao: `https://<render-url>/api/health` har 5 minute.
(`/api/health` database ko touch nahi karta, isliye Neon ke free hours nahi khaate.)
Ya Render ka paid plan lo (~$7/mo) — phir sona band.

## Purani cheezein
- Vercel pe `challenger-cc-api` project delete kar sakte ho — Go server wahan nahi chalta.
- `.env`, `.env.vercel.local` kabhi git me commit / kisi ko share mat karo.
