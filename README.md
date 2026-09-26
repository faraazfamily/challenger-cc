# The Challengers — Cricket Team Website

Full-stack app for a local cricket club: player profiles, match records, and
automatic career stats (batting average, strike rate, bowling average, economy)
built from uploaded scorecard PDFs.

## Stack
- **Backend:** Go (Gin) + PostgreSQL + JWT auth — folder: `backend-go/`
  (an earlier Node.js/Express version is kept in `backend/` for reference —
  you can delete that folder, it's not needed)
- **Frontend:** React (Vite) + React Router — unchanged, works with either backend
  since both expose the exact same `/api/...` routes
- **PDF parsing:** `github.com/ledongthuc/pdf` extracts text; a best-effort regex
  parser suggests batting/bowling rows, which the admin reviews and corrects before
  saving (scorer apps format scorecards differently, so full auto-parsing isn't
  reliable — this review step is intentional, not a shortcut).

## Project Structure
```
challenger-cc/
├── backend-go/                        # ← use this one
│   ├── cmd/
│   │   ├── api/main.go                # Server entrypoint (go run ./cmd/api)
│   │   └── migrate/main.go            # DB setup + default admin seed (go run ./cmd/migrate)
│   ├── internal/
│   │   ├── db/db.go                   # PostgreSQL pool
│   │   ├── middleware/auth.go         # JWT auth guard for admin routes
│   │   ├── pdfparser/pdfparser.go     # Scorecard PDF -> suggested stats
│   │   └── server/
│   │       ├── server.go              # Server struct + CORS
│   │       ├── routes.go              # All route registrations
│   │       ├── auth.go, team.go, players.go, tournaments.go,
│   │       │   matches.go, scorecards.go, stats.go   # one file per resource
│   │       └── util.go                # SQL NULL -> JSON helpers
│   ├── migrations/schema.sql          # Full DB schema
│   ├── uploads/                       # Player photos + scorecard PDFs land here
│   ├── go.mod
│   └── .env.example
├── backend/                            # old Node version — safe to delete
└── frontend/
    ├── src/
    │   ├── pages/       # Home, Players, PlayerProfile, Matches, MatchDetail, Leaderboard, Login, Admin
    │   ├── components/  # Navbar, PlayerCard, AdminPlayers, AdminMatches, AdminTournaments, AdminScorecard
    │   ├── api.js        # Fetch wrapper for all backend calls
    │   └── index.css     # Team-branded design (navy + gold)
    └── package.json
```

## Setup

### 1. Database
Create a PostgreSQL database, then:
```bash
cd backend-go
cp .env.example .env
# edit .env: set DATABASE_URL to your real Postgres connection string, and JWT_SECRET to something random
go mod tidy      # downloads gin, jwt, pq, pdf-parsing libs etc.
go run ./cmd/migrate
```
This creates all tables and a default admin login: **username `admin` / password `admin123`**
— log in once and then change this (there's no "change password" UI yet; simplest is
to update the `admins` table directly, or re-hash a new password with `bcrypt.GenerateFromPassword`
in a throwaway `go run` script).

### 2. Backend
```bash
cd backend-go
go run ./cmd/api        # starts on http://localhost:5000
```
Or build a binary: `go build -o challenger-cc-backend ./cmd/api && ./challenger-cc-backend`

### 3. Frontend
```bash
cd frontend
npm install
npm run dev              # starts on http://localhost:5173
```
Vite proxies `/api` and `/uploads` to `localhost:5000` automatically in dev (see `vite.config.js`).
No frontend changes were needed for the Go rewrite — `frontend/src/api.js` just calls
`/api/...` paths, and the Go backend answers the exact same routes with the exact same
JSON shapes as the old Node one did.

## How the scorecard workflow works
1. Add players first (Admin → Players).
2. Add a tournament (optional) and a match (Admin → Matches).
3. Go to Admin → Upload Scorecard, pick the match, upload the PDF.
4. The backend extracts text and suggests batting/bowling rows, trying to match
   player names automatically. **Review the table** — fix any player that wasn't
   matched (dropdown), correct any misread numbers, delete junk rows, or add rows
   manually if a name wasn't picked up.
5. Click "Save Stats to Database" — this locks in the numbers and every player's
   career average/strike rate/economy on their profile page updates automatically
   (it's computed live from all saved matches via SQL aggregation, not stored separately).

## Notes / next steps you may want
- No password-reset UI yet — add one before sharing admin access with teammates.
- The PDF regex parser (`internal/pdfparser/pdfparser.go`) is tuned for a generic
  "Name  Runs  Balls  4s  6s" row layout. If your scorer app's PDF looks very
  different, share a sample and I'll adjust the regex to match it.
- Photo/PDF uploads are stored on local disk (`backend-go/uploads`) — fine for a
  small club site; move to S3/Cloudinary if you deploy somewhere with ephemeral storage.
- This sandbox's network couldn't reach `proxy.golang.org` to fully verify the build
  (every file passed `gofmt` syntax checking, but transitive dependency resolution
  needs the real Go module proxy). Run `go mod tidy && go build ./...` on your own
  machine as the real check — if anything doesn't compile, paste the error here and
  I'll fix it immediately.
