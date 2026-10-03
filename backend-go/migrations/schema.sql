-- The Challengers Cricket Club — Database Schema

CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_info (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL DEFAULT 'The Challengers',
    tagline VARCHAR(255),
    founded_year INT,
    logo_url TEXT,
    about TEXT
);

CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('Batsman','Bowler','All-rounder','Wicketkeeper')),
    batting_style VARCHAR(50),      -- e.g. 'Right-hand bat', 'Left-hand bat'
    bowling_style VARCHAR(50),      -- e.g. 'Right-arm fast', 'Left-arm spin', or NULL
    jersey_number INT,
    bio TEXT,                       -- e.g. "Captain, aggressive top-order batsman"
    fielding_notes TEXT,            -- e.g. "Poor fielder"
    photo_url TEXT,
    is_captain BOOLEAN DEFAULT FALSE,
    is_vice_captain BOOLEAN DEFAULT FALSE,
    is_wicketkeeper BOOLEAN DEFAULT FALSE,
    joined_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    year INT,
    start_date DATE,
    end_date DATE
);

CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    tournament_id INT REFERENCES tournaments(id) ON DELETE SET NULL,
    opponent VARCHAR(150) NOT NULL,
    match_date DATE NOT NULL,
    venue VARCHAR(150),
    our_score VARCHAR(50),          -- e.g. "182/6 (20)"
    opponent_score VARCHAR(50),
    result VARCHAR(20) CHECK (result IN ('Won','Lost','Tied','No Result','Upcoming')) DEFAULT 'Upcoming',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scorecards (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    pdf_url TEXT,
    raw_text TEXT,                  -- extracted text from the PDF, kept for reference/debugging
    is_reviewed BOOLEAN DEFAULT FALSE, -- true once admin confirms parsed stats below
    content_hash TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE scorecards ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scorecards_hash ON scorecards(content_hash);

CREATE TABLE IF NOT EXISTS batting_stats (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    player_id INT REFERENCES players(id) ON DELETE CASCADE,
    runs INT DEFAULT 0,
    balls_faced INT DEFAULT 0,
    fours INT DEFAULT 0,
    sixes INT DEFAULT 0,
    is_out BOOLEAN DEFAULT TRUE,
    dismissal_type VARCHAR(50),     -- e.g. 'Caught', 'Bowled', 'Not Out', 'Run Out'
    UNIQUE(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS bowling_stats (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    player_id INT REFERENCES players(id) ON DELETE CASCADE,
    overs NUMERIC(4,1) DEFAULT 0,   -- e.g. 4.0 overs
    maidens INT DEFAULT 0,
    runs_conceded INT DEFAULT 0,
    wickets INT DEFAULT 0,
    UNIQUE(match_id, player_id)
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS fielding_notes TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_wicketkeeper BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_batting_player ON batting_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_bowling_player ON bowling_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);

-- Uploaded photos / scorecard PDFs live in Postgres so they survive redeploys
-- on hosts with an ephemeral disk (served at /uploads/<name>).
CREATE TABLE IF NOT EXISTS files (
    name TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===== Live scorer (Cricket-Scorer section) =====
-- A player can bat / bowl in more than one innings of the same match (Test = 2 innings each),
-- so stats are now unique per (match, player, innings) instead of per (match, player).
ALTER TABLE batting_stats ADD COLUMN IF NOT EXISTS innings_no INT NOT NULL DEFAULT 1;
ALTER TABLE bowling_stats ADD COLUMN IF NOT EXISTS innings_no INT NOT NULL DEFAULT 1;
ALTER TABLE batting_stats DROP CONSTRAINT IF EXISTS batting_stats_match_id_player_id_key;
ALTER TABLE bowling_stats DROP CONSTRAINT IF EXISTS bowling_stats_match_id_player_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_batting_unique ON batting_stats(match_id, player_id, innings_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bowling_unique ON bowling_stats(match_id, player_id, innings_no);

-- Test matches can be drawn; keep the human-readable result ("Asad won by 5 wickets").
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_result_check;
ALTER TABLE matches ADD CONSTRAINT matches_result_check
    CHECK (result IN ('Won','Lost','Tied','No Result','Upcoming','Draw'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS result_note TEXT;

-- The match being scored right now (whole match as JSON, saved after every ball).
CREATE TABLE IF NOT EXISTS live_matches (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT '',
    state JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','finished')),
    match_id INT REFERENCES matches(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Switch a match in/out of player stats, leaderboard and team record without deleting it.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS in_records BOOLEAN NOT NULL DEFAULT TRUE;
