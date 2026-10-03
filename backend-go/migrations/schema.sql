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
-- Live, in-app ball-by-ball scorer. A "live match" starts here; once finished,
-- our team's totals get copied into matches/batting_stats/bowling_stats so the
-- rest of the site (leaderboard, player profiles) treats it like any other match.
CREATE TABLE IF NOT EXISTS live_matches (
    id SERIAL PRIMARY KEY,
    tournament_id INT REFERENCES tournaments(id) ON DELETE SET NULL,
    match_id INT REFERENCES matches(id) ON DELETE SET NULL,
    format VARCHAR(10) NOT NULL CHECK (format IN ('T10','T20','ODI','TEST','CUSTOM')),
    overs_per_innings INT,
    team_b_name VARCHAR(100) NOT NULL,
    toss_winner VARCHAR(1) CHECK (toss_winner IN ('A','B')),
    toss_decision VARCHAR(6) CHECK (toss_decision IN ('Bat','Bowl')),
    venue VARCHAR(150),
    match_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(12) NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','in_progress','completed','abandoned')),
    current_innings INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Our own squad members are linked via player_id (so their career stats
-- update); the opponent is typed on the fly, like KDM's Cricket Scorer.
CREATE TABLE IF NOT EXISTS live_players (
    id SERIAL PRIMARY KEY,
    live_match_id INT NOT NULL REFERENCES live_matches(id) ON DELETE CASCADE,
    team VARCHAR(1) NOT NULL CHECK (team IN ('A','B')),
    player_id INT REFERENCES players(id) ON DELETE SET NULL,
    display_name VARCHAR(100) NOT NULL,
    batting_order INT,
    is_captain BOOLEAN DEFAULT FALSE,
    is_keeper BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS live_innings (
    id SERIAL PRIMARY KEY,
    live_match_id INT NOT NULL REFERENCES live_matches(id) ON DELETE CASCADE,
    innings_number INT NOT NULL,
    batting_team VARCHAR(1) NOT NULL CHECK (batting_team IN ('A','B')),
    is_follow_on BOOLEAN DEFAULT FALSE,
    total_runs INT NOT NULL DEFAULT 0,
    total_wickets INT NOT NULL DEFAULT 0,
    overs_completed NUMERIC(5,1) NOT NULL DEFAULT 0,
    wide_runs INT NOT NULL DEFAULT 0,
    noball_runs INT NOT NULL DEFAULT 0,
    bye_runs INT NOT NULL DEFAULT 0,
    legbye_runs INT NOT NULL DEFAULT 0,
    declared BOOLEAN DEFAULT FALSE,
    status VARCHAR(12) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
    UNIQUE(live_match_id, innings_number)
);

-- One row per ball. Deleting the latest row here IS the "undo" feature (Step 2).
CREATE TABLE IF NOT EXISTS live_balls (
    id SERIAL PRIMARY KEY,
    innings_id INT NOT NULL REFERENCES live_innings(id) ON DELETE CASCADE,
    over_number INT NOT NULL,
    ball_in_over INT NOT NULL,
    striker_id INT NOT NULL REFERENCES live_players(id),
    non_striker_id INT NOT NULL REFERENCES live_players(id),
    bowler_id INT NOT NULL REFERENCES live_players(id),
    runs_off_bat INT NOT NULL DEFAULT 0,
    extra_type VARCHAR(7) CHECK (extra_type IN ('wide','noball','bye','legbye')),
    extra_runs INT NOT NULL DEFAULT 0,
    is_wicket BOOLEAN NOT NULL DEFAULT FALSE,
    wicket_type VARCHAR(20),
    dismissed_player_id INT REFERENCES live_players(id),
    fielder_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_balls_innings ON live_balls(innings_id);
CREATE INDEX IF NOT EXISTS idx_live_players_match ON live_players(live_match_id);