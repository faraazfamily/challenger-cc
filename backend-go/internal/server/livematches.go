package server

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type livePlayerInput struct {
	PlayerID    *int   `json:"player_id"`
	DisplayName string `json:"display_name"`
	IsCaptain   bool   `json:"is_captain"`
	IsKeeper    bool   `json:"is_keeper"`
}

type createLiveMatchRequest struct {
	TournamentID    *int              `json:"tournament_id"`
	Format          string            `json:"format"`
	OversPerInnings *int              `json:"overs_per_innings"`
	TeamBName       string            `json:"team_b_name"`
	Venue           string            `json:"venue"`
	MatchDate       string            `json:"match_date"`
	TeamAPlayers    []livePlayerInput `json:"team_a_players"`
	TeamBPlayers    []livePlayerInput `json:"team_b_players"`
}

var validFormats = map[string]bool{"T10": true, "T20": true, "ODI": true, "TEST": true, "CUSTOM": true}

// POST /api/live/matches (admin only) — creates the match shell plus both
// playing XIs. Our side must already exist in the squad (player_id); the
// opponent is free-typed, exactly like KDM's Cricket Scorer.
func (s *Server) CreateLiveMatch(c *gin.Context) {
	var req createLiveMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	req.Format = strings.ToUpper(strings.TrimSpace(req.Format))
	if !validFormats[req.Format] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "format must be T10, T20, ODI, TEST or CUSTOM"})
		return
	}
	if req.Format == "TEST" {
		req.OversPerInnings = nil
	} else if req.OversPerInnings == nil || *req.OversPerInnings < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "overs_per_innings is required for this format"})
		return
	}
	if strings.TrimSpace(req.TeamBName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Opponent team name is required"})
		return
	}
	if len(req.TeamAPlayers) < 2 || len(req.TeamBPlayers) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Both teams need at least 2 players"})
		return
	}
	if req.MatchDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "match_date is required"})
		return
	}

	tx, err := s.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start match"})
		return
	}
	fail := func(msg string) {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
	}

	var matchID int
	err = tx.QueryRow(
		`INSERT INTO live_matches (tournament_id, format, overs_per_innings, team_b_name, venue, match_date)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		req.TournamentID, req.Format, req.OversPerInnings, strings.TrimSpace(req.TeamBName), nullify(req.Venue), req.MatchDate,
	).Scan(&matchID)
	if err != nil {
		fail("Failed to create match")
		return
	}

	insertPlayers := func(team string, players []livePlayerInput) bool {
		for i, p := range players {
			name := strings.TrimSpace(p.DisplayName)
			if name == "" {
				continue
			}
			if _, err := tx.Exec(
				`INSERT INTO live_players (live_match_id, team, player_id, display_name, batting_order, is_captain, is_keeper)
				 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
				matchID, team, p.PlayerID, name, i+1, p.IsCaptain, p.IsKeeper,
			); err != nil {
				fail("Failed to add players")
				return false
			}
		}
		return true
	}
	if !insertPlayers("A", req.TeamAPlayers) {
		return
	}
	if !insertPlayers("B", req.TeamBPlayers) {
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit match"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": matchID})
}

type tossRequest struct {
	TossWinner   string `json:"toss_winner"`
	TossDecision string `json:"toss_decision"`
}

// PUT /api/live/matches/:id/toss (admin only) — records the toss and opens
// innings 1 for whichever team is batting first.
func (s *Server) SetLiveMatchToss(c *gin.Context) {
	id := c.Param("id")
	var req tossRequest
	if err := c.ShouldBindJSON(&req); err != nil || (req.TossWinner != "A" && req.TossWinner != "B") || (req.TossDecision != "Bat" && req.TossDecision != "Bowl") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "toss_winner (A/B) and toss_decision (Bat/Bowl) are required"})
		return
	}

	battingTeam := req.TossWinner
	if req.TossDecision == "Bowl" {
		if battingTeam == "A" {
			battingTeam = "B"
		} else {
			battingTeam = "A"
		}
	}

	tx, err := s.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record toss"})
		return
	}
	fail := func(msg string) {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
	}

	res, err := tx.Exec(
		`UPDATE live_matches SET toss_winner=$1, toss_decision=$2, status='in_progress' WHERE id=$3 AND status='setup'`,
		req.TossWinner, req.TossDecision, id,
	)
	if err != nil {
		fail("Failed to record toss")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		tx.Rollback()
		c.JSON(http.StatusConflict, gin.H{"error": "Toss already recorded for this match"})
		return
	}

	if _, err := tx.Exec(
		`INSERT INTO live_innings (live_match_id, innings_number, batting_team) VALUES ($1,1,$2)`,
		id, battingTeam,
	); err != nil {
		fail("Failed to start first innings")
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit toss"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/live/matches (admin only) — matches still being scored, so the
// admin can resume one from the dashboard.
func (s *Server) GetLiveMatches(c *gin.Context) {
	rows, err := s.DB.Query(
		`SELECT id, format, team_b_name, status, match_date FROM live_matches
		 WHERE status IN ('setup','in_progress') ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch live matches"})
		return
	}
	defer rows.Close()

	out := []gin.H{}
	for rows.Next() {
		var id int
		var format, teamB, status string
		var matchDate sql.NullTime
		if err := rows.Scan(&id, &format, &teamB, &status, &matchDate); err != nil {
			continue
		}
		out = append(out, gin.H{
			"id": id, "format": format, "team_b_name": teamB, "status": status,
			"match_date": nullableDate(matchDate),
		})
	}
	c.JSON(http.StatusOK, out)
}

// GET /api/live/matches/:id (admin only) — full state: match info, both
// playing XIs, and every innings so far. Step 2's scoring screen builds on this.
func (s *Server) GetLiveMatch(c *gin.Context) {
	id := c.Param("id")

	var m struct {
		ID              int
		TournamentID    sql.NullInt32
		Format          string
		OversPerInnings sql.NullInt32
		TeamBName       string
		TossWinner      sql.NullString
		TossDecision    sql.NullString
		Venue           sql.NullString
		MatchDate       sql.NullTime
		Status          string
		CurrentInnings  int
	}
	err := s.DB.QueryRow(
		`SELECT id, tournament_id, format, overs_per_innings, team_b_name, toss_winner, toss_decision, venue, match_date, status, current_innings
		 FROM live_matches WHERE id=$1`, id,
	).Scan(&m.ID, &m.TournamentID, &m.Format, &m.OversPerInnings, &m.TeamBName, &m.TossWinner, &m.TossDecision, &m.Venue, &m.MatchDate, &m.Status, &m.CurrentInnings)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Live match not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch match"})
		return
	}

	playerRows, err := s.DB.Query(
		`SELECT id, team, player_id, display_name, batting_order, is_captain, is_keeper
		 FROM live_players WHERE live_match_id=$1 ORDER BY team, batting_order`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch players"})
		return
	}
	defer playerRows.Close()
	players := []gin.H{}
	for playerRows.Next() {
		var pid, battingOrder int
		var team, name string
		var playerID sql.NullInt32
		var isCaptain, isKeeper bool
		if err := playerRows.Scan(&pid, &team, &playerID, &name, &battingOrder, &isCaptain, &isKeeper); err != nil {
			continue
		}
		players = append(players, gin.H{
			"id": pid, "team": team, "player_id": nullableInt(playerID), "display_name": name,
			"batting_order": battingOrder, "is_captain": isCaptain, "is_keeper": isKeeper,
		})
	}

	inningsRows, err := s.DB.Query(
		`SELECT id, innings_number, batting_team, is_follow_on, total_runs, total_wickets, overs_completed, declared, status
		 FROM live_innings WHERE live_match_id=$1 ORDER BY innings_number`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch innings"})
		return
	}
	defer inningsRows.Close()
	innings := []gin.H{}
	for inningsRows.Next() {
		var iid, inningsNumber, runs, wickets int
		var team, status string
		var overs float64
		var followOn, declared bool
		if err := inningsRows.Scan(&iid, &inningsNumber, &team, &followOn, &runs, &wickets, &overs, &declared, &status); err != nil {
			continue
		}
		innings = append(innings, gin.H{
			"id": iid, "innings_number": inningsNumber, "batting_team": team, "is_follow_on": followOn,
			"total_runs": runs, "total_wickets": wickets, "overs_completed": overs, "declared": declared, "status": status,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"id": m.ID, "tournament_id": nullableInt(m.TournamentID), "format": m.Format,
		"overs_per_innings": nullableInt(m.OversPerInnings), "team_a_name": "The Challengers", "team_b_name": m.TeamBName,
		"toss_winner": nullableString(m.TossWinner), "toss_decision": nullableString(m.TossDecision),
		"venue": nullableString(m.Venue), "match_date": nullableDate(m.MatchDate), "status": m.Status,
		"current_innings": m.CurrentInnings, "players": players, "innings": innings,
	})
}