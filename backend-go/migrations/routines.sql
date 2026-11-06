-- The Challengers Cricket Club — database routines
--
-- Every read the API does is a function here (fn_*), every write a stored procedure (sp_*).
-- The Go handlers only call these; no table is queried directly from Go. The file is applied
-- after schema.sql on every start (CREATE OR REPLACE, so it is safe to run again and again).
-- Column casts are explicit so the function row types stay stable even if a column type changes.

-- ===================================================================== admins
CREATE OR REPLACE FUNCTION fn_admin_by_username(p_username TEXT)
RETURNS TABLE(id INT, password_hash TEXT) LANGUAGE sql STABLE AS $$
    SELECT id, password_hash::text FROM admins WHERE username = p_username
$$;

CREATE OR REPLACE FUNCTION fn_admin_by_id(p_id INT)
RETURNS TABLE(id INT, username TEXT, password_hash TEXT) LANGUAGE sql STABLE AS $$
    SELECT id, username::text, password_hash::text FROM admins WHERE id = p_id
$$;

-- Change the login name and/or password hash of one admin.
CREATE OR REPLACE PROCEDURE sp_admin_set_credentials(p_id INT, p_username TEXT, p_hash TEXT, INOUT p_affected INT DEFAULT 0)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE admins SET username = p_username, password_hash = p_hash WHERE id = p_id;
    GET DIAGNOSTICS p_affected = ROW_COUNT;
END $$;

-- ===================================================================== files (uploads)
CREATE OR REPLACE FUNCTION fn_file(p_name TEXT)
RETURNS TABLE(content_type TEXT, data BYTEA) LANGUAGE sql STABLE AS $$
    SELECT content_type::text, data FROM files WHERE name = p_name
$$;

CREATE OR REPLACE PROCEDURE sp_file_insert(p_name TEXT, p_content_type TEXT, p_data BYTEA, p_ignore_existing BOOLEAN DEFAULT FALSE)
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ignore_existing THEN
        INSERT INTO files (name, content_type, data) VALUES (p_name, p_content_type, p_data) ON CONFLICT (name) DO NOTHING;
    ELSE
        INSERT INTO files (name, content_type, data) VALUES (p_name, p_content_type, p_data);
    END IF;
END $$;

-- ===================================================================== team
CREATE OR REPLACE FUNCTION fn_team()
RETURNS TABLE(id INT, name TEXT, tagline TEXT, founded_year INT, logo_url TEXT, about TEXT) LANGUAGE sql STABLE AS $$
    SELECT id, name::text, tagline::text, founded_year, logo_url::text, about::text FROM team_info ORDER BY id LIMIT 1
$$;

-- One row only: update it if it exists, otherwise create it.
CREATE OR REPLACE PROCEDURE sp_team_upsert(p_name TEXT, p_tagline TEXT, p_founded_year INT, p_logo_url TEXT, p_about TEXT)
LANGUAGE plpgsql AS $$
DECLARE v_id INT;
BEGIN
    SELECT id INTO v_id FROM team_info ORDER BY id LIMIT 1;
    IF v_id IS NULL THEN
        INSERT INTO team_info (name, tagline, founded_year, logo_url, about) VALUES (p_name, p_tagline, p_founded_year, p_logo_url, p_about);
    ELSE
        UPDATE team_info SET name = p_name, tagline = p_tagline, founded_year = p_founded_year, logo_url = p_logo_url, about = p_about WHERE id = v_id;
    END IF;
END $$;

-- ===================================================================== players
CREATE OR REPLACE FUNCTION fn_players()
RETURNS TABLE(id INT, name TEXT, role TEXT, batting_style TEXT, bowling_style TEXT, jersey_number INT, bio TEXT, fielding_notes TEXT,
              photo_url TEXT, is_captain BOOLEAN, is_vice_captain BOOLEAN, is_wicketkeeper BOOLEAN, joined_date DATE, intro_video_url TEXT)
LANGUAGE sql STABLE AS $$
    SELECT id, name::text, role::text, batting_style::text, bowling_style::text, jersey_number, bio::text, fielding_notes::text,
           photo_url::text, is_captain, is_vice_captain, is_wicketkeeper, joined_date, intro_video_url::text
    FROM players ORDER BY is_captain DESC, is_vice_captain DESC, name ASC
$$;

CREATE OR REPLACE FUNCTION fn_player(p_id INT)
RETURNS TABLE(id INT, name TEXT, role TEXT, batting_style TEXT, bowling_style TEXT, jersey_number INT, bio TEXT, fielding_notes TEXT,
              photo_url TEXT, is_captain BOOLEAN, is_vice_captain BOOLEAN, is_wicketkeeper BOOLEAN, joined_date DATE, intro_video_url TEXT)
LANGUAGE sql STABLE AS $$
    SELECT id, name::text, role::text, batting_style::text, bowling_style::text, jersey_number, bio::text, fielding_notes::text,
           photo_url::text, is_captain, is_vice_captain, is_wicketkeeper, joined_date, intro_video_url::text
    FROM players WHERE id = p_id
$$;

-- id + name of everyone, for matching names on scorecards.
CREATE OR REPLACE FUNCTION fn_player_names()
RETURNS TABLE(id INT, name TEXT) LANGUAGE sql STABLE AS $$
    SELECT id, name::text FROM players ORDER BY name
$$;

-- Career totals, counting only matches that are in the club records.
CREATE OR REPLACE FUNCTION fn_player_career_batting(p_id INT)
RETURNS TABLE(innings INT, runs INT, balls INT, highest INT, times_out INT, fours INT, sixes INT) LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)::int, COALESCE(SUM(runs),0)::int, COALESCE(SUM(balls_faced),0)::int, COALESCE(MAX(runs),0)::int,
           (COUNT(*) FILTER (WHERE is_out = true))::int, COALESCE(SUM(fours),0)::int, COALESCE(SUM(sixes),0)::int
    FROM batting_stats WHERE player_id = p_id AND match_id IN (SELECT id FROM matches WHERE in_records)
$$;

CREATE OR REPLACE FUNCTION fn_player_career_bowling(p_id INT)
RETURNS TABLE(innings INT, overs DOUBLE PRECISION, runs_conceded DOUBLE PRECISION, wickets INT, maidens INT) LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)::int, COALESCE(SUM(overs),0)::double precision, COALESCE(SUM(runs_conceded),0)::double precision,
           COALESCE(SUM(wickets),0)::int, COALESCE(SUM(maidens),0)::int
    FROM bowling_stats WHERE player_id = p_id AND match_id IN (SELECT id FROM matches WHERE in_records)
$$;

-- Who else already holds a role (captain / vice-captain / wicketkeeper)? NULL when nobody.
CREATE OR REPLACE FUNCTION fn_player_role_holder(p_role TEXT, p_except_id INT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT name::text FROM players
    WHERE ((p_role = 'captain' AND is_captain) OR (p_role = 'vice' AND is_vice_captain) OR (p_role = 'keeper' AND is_wicketkeeper))
      AND (p_except_id IS NULL OR id <> p_except_id)
    ORDER BY id LIMIT 1
$$;

CREATE OR REPLACE PROCEDURE sp_player_create(
    p_name TEXT, p_role TEXT, p_batting_style TEXT, p_bowling_style TEXT, p_jersey_number INT, p_bio TEXT, p_fielding_notes TEXT,
    p_photo_url TEXT, p_is_captain BOOLEAN, p_is_vice_captain BOOLEAN, p_is_wicketkeeper BOOLEAN, p_joined_date DATE, p_intro_video_url TEXT,
    INOUT p_id INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO players (name, role, batting_style, bowling_style, jersey_number, bio, fielding_notes, photo_url, is_captain, is_vice_captain, is_wicketkeeper, joined_date, intro_video_url)
    VALUES (p_name, p_role, p_batting_style, p_bowling_style, p_jersey_number, p_bio, p_fielding_notes, p_photo_url, p_is_captain, p_is_vice_captain, p_is_wicketkeeper,
            COALESCE(p_joined_date, CURRENT_DATE), p_intro_video_url)
    RETURNING id INTO p_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_player_update(
    p_id INT, p_name TEXT, p_role TEXT, p_batting_style TEXT, p_bowling_style TEXT, p_jersey_number INT, p_bio TEXT, p_fielding_notes TEXT,
    p_photo_url TEXT, p_is_captain BOOLEAN, p_is_vice_captain BOOLEAN, p_is_wicketkeeper BOOLEAN, p_joined_date DATE, p_intro_video_url TEXT,
    INOUT p_affected INT DEFAULT 0)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE players SET name = p_name, role = p_role, batting_style = p_batting_style, bowling_style = p_bowling_style, jersey_number = p_jersey_number,
        bio = p_bio, fielding_notes = p_fielding_notes, photo_url = p_photo_url, is_captain = p_is_captain, is_vice_captain = p_is_vice_captain,
        is_wicketkeeper = p_is_wicketkeeper, joined_date = COALESCE(p_joined_date, joined_date), intro_video_url = p_intro_video_url
    WHERE id = p_id;
    GET DIAGNOSTICS p_affected = ROW_COUNT;
END $$;

CREATE OR REPLACE PROCEDURE sp_player_delete(p_id INT, INOUT p_affected INT DEFAULT 0)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM players WHERE id = p_id;
    GET DIAGNOSTICS p_affected = ROW_COUNT;
END $$;

-- ===================================================================== tournaments
CREATE OR REPLACE FUNCTION fn_tournaments()
RETURNS TABLE(id INT, name TEXT, year INT, start_date DATE, end_date DATE) LANGUAGE sql STABLE AS $$
    SELECT id, name::text, year, start_date, end_date FROM tournaments ORDER BY start_date DESC NULLS LAST
$$;

CREATE OR REPLACE PROCEDURE sp_tournament_create(p_name TEXT, p_year INT, p_start_date TEXT, p_end_date TEXT, INOUT p_id INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO tournaments (name, year, start_date, end_date)
    VALUES (p_name, p_year, NULLIF(p_start_date, '')::date, NULLIF(p_end_date, '')::date) RETURNING id INTO p_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_tournament_update(p_id INT, p_name TEXT, p_year INT, p_start_date TEXT, p_end_date TEXT, INOUT p_affected INT DEFAULT 0)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE tournaments SET name = p_name, year = p_year, start_date = NULLIF(p_start_date, '')::date, end_date = NULLIF(p_end_date, '')::date WHERE id = p_id;
    GET DIAGNOSTICS p_affected = ROW_COUNT;
END $$;

CREATE OR REPLACE PROCEDURE sp_tournament_delete(p_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM tournaments WHERE id = p_id;
END $$;

-- ===================================================================== matches
CREATE OR REPLACE FUNCTION fn_matches()
RETURNS TABLE(id INT, tournament_id INT, opponent TEXT, match_date DATE, venue TEXT, our_score TEXT, opponent_score TEXT, result TEXT, tournament_name TEXT, in_records BOOLEAN)
LANGUAGE sql STABLE AS $$
    SELECT m.id, m.tournament_id, m.opponent::text, m.match_date, m.venue::text, m.our_score::text, m.opponent_score::text, m.result::text, t.name::text, m.in_records
    FROM matches m LEFT JOIN tournaments t ON m.tournament_id = t.id
    ORDER BY m.match_date DESC, m.id DESC
$$;

CREATE OR REPLACE FUNCTION fn_match(p_id INT)
RETURNS TABLE(id INT, tournament_id INT, opponent TEXT, match_date DATE, venue TEXT, our_score TEXT, opponent_score TEXT, result TEXT, tournament_name TEXT, result_note TEXT, in_records BOOLEAN)
LANGUAGE sql STABLE AS $$
    SELECT m.id, m.tournament_id, m.opponent::text, m.match_date, m.venue::text, m.our_score::text, m.opponent_score::text, m.result::text, t.name::text, m.result_note::text, m.in_records
    FROM matches m LEFT JOIN tournaments t ON m.tournament_id = t.id WHERE m.id = p_id
$$;

CREATE OR REPLACE FUNCTION fn_match_batting(p_match_id INT)
RETURNS TABLE(id INT, player_id INT, player_name TEXT, runs INT, balls_faced INT, fours INT, sixes INT, is_out BOOLEAN, dismissal_type TEXT, innings_no INT)
LANGUAGE sql STABLE AS $$
    SELECT bs.id, bs.player_id, p.name::text, bs.runs, bs.balls_faced, bs.fours, bs.sixes, bs.is_out, bs.dismissal_type::text, bs.innings_no
    FROM batting_stats bs JOIN players p ON bs.player_id = p.id WHERE bs.match_id = p_match_id ORDER BY bs.innings_no, bs.runs DESC
$$;

CREATE OR REPLACE FUNCTION fn_match_bowling(p_match_id INT)
RETURNS TABLE(id INT, player_id INT, player_name TEXT, overs DOUBLE PRECISION, maidens INT, runs_conceded INT, wickets INT, innings_no INT)
LANGUAGE sql STABLE AS $$
    SELECT bw.id, bw.player_id, p.name::text, bw.overs::double precision, bw.maidens, bw.runs_conceded, bw.wickets, bw.innings_no
    FROM bowling_stats bw JOIN players p ON bw.player_id = p.id WHERE bw.match_id = p_match_id ORDER BY bw.innings_no, bw.wickets DESC
$$;

CREATE OR REPLACE PROCEDURE sp_match_create(
    p_tournament_id INT, p_opponent TEXT, p_match_date DATE, p_venue TEXT, p_our_score TEXT, p_opponent_score TEXT,
    p_result TEXT, p_result_note TEXT, p_in_records BOOLEAN, INOUT p_id INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO matches (tournament_id, opponent, match_date, venue, our_score, opponent_score, result, result_note, in_records)
    VALUES (p_tournament_id, p_opponent, COALESCE(p_match_date, CURRENT_DATE), p_venue, p_our_score, p_opponent_score, p_result, p_result_note, COALESCE(p_in_records, TRUE))
    RETURNING id INTO p_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_match_update(
    p_id INT, p_tournament_id INT, p_opponent TEXT, p_match_date DATE, p_venue TEXT, p_our_score TEXT, p_opponent_score TEXT, p_result TEXT,
    INOUT p_affected INT DEFAULT 0)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE matches SET tournament_id = p_tournament_id, opponent = p_opponent, match_date = p_match_date, venue = p_venue,
        our_score = p_our_score, opponent_score = p_opponent_score, result = p_result WHERE id = p_id;
    GET DIAGNOSTICS p_affected = ROW_COUNT;
END $$;

CREATE OR REPLACE PROCEDURE sp_match_delete(p_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM matches WHERE id = p_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_match_set_in_records(p_id INT, p_in_records BOOLEAN, INOUT p_affected INT DEFAULT 0)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE matches SET in_records = p_in_records WHERE id = p_id;
    GET DIAGNOSTICS p_affected = ROW_COUNT;
END $$;

-- Wipe a match's batting / bowling rows before they are re-entered.
CREATE OR REPLACE PROCEDURE sp_match_stats_clear(p_match_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM batting_stats WHERE match_id = p_match_id;
    DELETE FROM bowling_stats WHERE match_id = p_match_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_batting_insert(p_match_id INT, p_player_id INT, p_innings_no INT, p_runs INT, p_balls_faced INT, p_fours INT, p_sixes INT, p_is_out BOOLEAN, p_dismissal_type TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO batting_stats (match_id, player_id, innings_no, runs, balls_faced, fours, sixes, is_out, dismissal_type)
    VALUES (p_match_id, p_player_id, COALESCE(p_innings_no, 1), p_runs, p_balls_faced, p_fours, p_sixes, p_is_out, p_dismissal_type);
END $$;

CREATE OR REPLACE PROCEDURE sp_bowling_insert(p_match_id INT, p_player_id INT, p_innings_no INT, p_overs DOUBLE PRECISION, p_maidens INT, p_runs_conceded INT, p_wickets INT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO bowling_stats (match_id, player_id, innings_no, overs, maidens, runs_conceded, wickets)
    VALUES (p_match_id, p_player_id, COALESCE(p_innings_no, 1), p_overs, p_maidens, p_runs_conceded, p_wickets);
END $$;

-- ===================================================================== scorecards
CREATE OR REPLACE FUNCTION fn_scorecards(p_match_id INT)
RETURNS TABLE(id INT, match_id INT, pdf_url TEXT, is_reviewed BOOLEAN, uploaded_at TIMESTAMP) LANGUAGE sql STABLE AS $$
    SELECT id, match_id, pdf_url::text, is_reviewed, uploaded_at::timestamp FROM scorecards WHERE match_id = p_match_id ORDER BY uploaded_at DESC
$$;

CREATE OR REPLACE FUNCTION fn_scorecard_hash_count(p_hash TEXT)
RETURNS INT LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)::int FROM scorecards WHERE content_hash = p_hash
$$;

CREATE OR REPLACE PROCEDURE sp_scorecard_insert(p_match_id INT, p_pdf_url TEXT, p_raw_text TEXT, p_is_reviewed BOOLEAN, p_content_hash TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO scorecards (match_id, pdf_url, raw_text, is_reviewed, content_hash) VALUES (p_match_id, p_pdf_url, p_raw_text, p_is_reviewed, p_content_hash);
END $$;

CREATE OR REPLACE PROCEDURE sp_scorecard_mark_reviewed(p_match_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE scorecards SET is_reviewed = true WHERE match_id = p_match_id;
END $$;

-- ===================================================================== stats
CREATE OR REPLACE FUNCTION fn_leaderboard_runs()
RETURNS TABLE(id INT, name TEXT, photo_url TEXT, runs INT, innings INT) LANGUAGE sql STABLE AS $$
    SELECT p.id, p.name::text, p.photo_url::text, SUM(bs.runs)::int, COUNT(*)::int
    FROM batting_stats bs JOIN players p ON bs.player_id = p.id
    WHERE bs.match_id IN (SELECT id FROM matches WHERE in_records)
    GROUP BY p.id, p.name, p.photo_url ORDER BY SUM(bs.runs) DESC LIMIT 10
$$;

CREATE OR REPLACE FUNCTION fn_leaderboard_wickets()
RETURNS TABLE(id INT, name TEXT, photo_url TEXT, wickets INT, innings INT) LANGUAGE sql STABLE AS $$
    SELECT p.id, p.name::text, p.photo_url::text, SUM(bw.wickets)::int, COUNT(*)::int
    FROM bowling_stats bw JOIN players p ON bw.player_id = p.id
    WHERE bw.match_id IN (SELECT id FROM matches WHERE in_records)
    GROUP BY p.id, p.name, p.photo_url ORDER BY SUM(bw.wickets) DESC LIMIT 10
$$;

CREATE OR REPLACE FUNCTION fn_leaderboard_strike_rate()
RETURNS TABLE(id INT, name TEXT, photo_url TEXT, runs INT, balls INT, strike_rate DOUBLE PRECISION) LANGUAGE sql STABLE AS $$
    SELECT p.id, p.name::text, p.photo_url::text, SUM(bs.runs)::int, SUM(bs.balls_faced)::int,
           ROUND((SUM(bs.runs)::numeric / NULLIF(SUM(bs.balls_faced), 0)) * 100, 2)::double precision
    FROM batting_stats bs JOIN players p ON bs.player_id = p.id
    WHERE bs.match_id IN (SELECT id FROM matches WHERE in_records)
    GROUP BY p.id, p.name, p.photo_url HAVING SUM(bs.balls_faced) > 0
    ORDER BY 6 DESC NULLS LAST LIMIT 10
$$;

CREATE OR REPLACE FUNCTION fn_leaderboard_economy()
RETURNS TABLE(id INT, name TEXT, photo_url TEXT, runs_conceded INT, overs DOUBLE PRECISION, economy DOUBLE PRECISION) LANGUAGE sql STABLE AS $$
    SELECT p.id, p.name::text, p.photo_url::text, SUM(bw.runs_conceded)::int, SUM(bw.overs)::double precision,
           ROUND((SUM(bw.runs_conceded)::numeric / NULLIF(SUM(bw.overs), 0)), 2)::double precision
    FROM bowling_stats bw JOIN players p ON bw.player_id = p.id
    WHERE bw.match_id IN (SELECT id FROM matches WHERE in_records)
    GROUP BY p.id, p.name, p.photo_url HAVING SUM(bw.overs) > 0
    ORDER BY 6 ASC NULLS LAST LIMIT 10
$$;

CREATE OR REPLACE FUNCTION fn_team_record()
RETURNS TABLE(result TEXT, count INT) LANGUAGE sql STABLE AS $$
    SELECT result::text, COUNT(*)::int FROM matches WHERE result != 'Upcoming' AND in_records GROUP BY result
$$;

-- ===================================================================== scorer (ball-by-ball)
CREATE OR REPLACE FUNCTION fn_scorer_live()
RETURNS TABLE(id INT, title TEXT, format TEXT, status TEXT, updated_at TIMESTAMP) LANGUAGE sql STABLE AS $$
    SELECT id, title::text, format::text, status::text, updated_at::timestamp FROM scorer_matches
    WHERE status = 'live' AND NOT archived ORDER BY updated_at DESC
$$;

CREATE OR REPLACE FUNCTION fn_scorer_history(p_archived BOOLEAN)
RETURNS TABLE(id INT, title TEXT, format TEXT, status TEXT, archived BOOLEAN, match_id INT, state JSONB, created_at TIMESTAMP, updated_at TIMESTAMP)
LANGUAGE sql STABLE AS $$
    SELECT id, title::text, format::text, status::text, archived, match_id, state, created_at::timestamp, updated_at::timestamp
    FROM scorer_matches WHERE archived = p_archived ORDER BY created_at DESC
$$;

CREATE OR REPLACE FUNCTION fn_scorer_match(p_id INT)
RETURNS TABLE(state JSONB, status TEXT) LANGUAGE sql STABLE AS $$
    SELECT state, status::text FROM scorer_matches WHERE id = p_id
$$;

CREATE OR REPLACE PROCEDURE sp_scorer_create(p_title TEXT, p_format TEXT, p_state JSONB, INOUT p_id INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO scorer_matches (title, format, state) VALUES (p_title, p_format, p_state) RETURNING id INTO p_id;
END $$;

-- Autosave; only a match that is still live can be saved.
CREATE OR REPLACE PROCEDURE sp_scorer_save(p_id INT, p_title TEXT, p_format TEXT, p_state JSONB, INOUT p_affected INT DEFAULT 0)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE scorer_matches SET title = p_title, format = p_format, state = p_state, updated_at = NOW() WHERE id = p_id AND status = 'live';
    GET DIAGNOSTICS p_affected = ROW_COUNT;
END $$;

CREATE OR REPLACE PROCEDURE sp_scorer_archive(p_id INT, p_archived BOOLEAN, INOUT p_affected INT DEFAULT 0)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE scorer_matches SET archived = p_archived WHERE id = p_id;
    GET DIAGNOSTICS p_affected = ROW_COUNT;
END $$;

CREATE OR REPLACE PROCEDURE sp_scorer_delete(p_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM scorer_matches WHERE id = p_id AND status = 'live';
END $$;

-- Close a live match once its result and stats are saved as a normal match.
CREATE OR REPLACE PROCEDURE sp_scorer_finish(p_id INT, p_match_id INT, p_final_state JSONB)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE scorer_matches
    SET status = 'finished', match_id = p_match_id, updated_at = NOW(), state = COALESCE(p_final_state, state)
    WHERE id = p_id;
END $$;
