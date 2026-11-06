package server

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GET /api/matches
func (s *Server) GetMatches(c *gin.Context) {
	rows, err := s.DB.Query(`SELECT * FROM fn_matches()`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch matches"})
		return
	}
	defer rows.Close()

	matches := []gin.H{}
	for rows.Next() {
		var id int
		var tournamentID sql.NullInt32
		var opponent, result string
		var inRecords bool
		var matchDate sql.NullTime
		var venue, ourScore, oppScore, tournamentName sql.NullString
		if err := rows.Scan(&id, &tournamentID, &opponent, &matchDate, &venue, &ourScore, &oppScore, &result, &tournamentName, &inRecords); err != nil {
			continue
		}
		matches = append(matches, gin.H{
			"id": id, "tournament_id": nullableInt(tournamentID), "opponent": opponent,
			"match_date": nullableDate(matchDate), "venue": nullableString(venue),
			"our_score": nullableString(ourScore), "opponent_score": nullableString(oppScore),
			"result": result, "tournament_name": nullableString(tournamentName), "in_records": inRecords,
		})
	}
	c.JSON(http.StatusOK, matches)
}

// GET /api/matches/:id — includes its batting/bowling scorecard rows.
func (s *Server) GetMatch(c *gin.Context) {
	id := c.Param("id")

	var mid int
	var tournamentID sql.NullInt32
	var opponent, result string
	var matchDate sql.NullTime
	var venue, ourScore, oppScore, tournamentName, noteVal sql.NullString
	var inRecords bool

	err := s.DB.QueryRow(`SELECT * FROM fn_match($1)`, id).
		Scan(&mid, &tournamentID, &opponent, &matchDate, &venue, &ourScore, &oppScore, &result, &tournamentName, &noteVal, &inRecords)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch match"})
		return
	}

	battingRows, err := s.DB.Query(`SELECT * FROM fn_match_batting($1)`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch batting stats"})
		return
	}
	defer battingRows.Close()

	batting := []gin.H{}
	for battingRows.Next() {
		var bid, playerID, runs, balls, fours, sixes, inningsNo int
		var name string
		var isOut bool
		var dismissal sql.NullString
		if err := battingRows.Scan(&bid, &playerID, &name, &runs, &balls, &fours, &sixes, &isOut, &dismissal, &inningsNo); err != nil {
			continue
		}
		batting = append(batting, gin.H{
			"id": bid, "player_id": playerID, "player_name": name, "runs": runs, "balls_faced": balls,
			"fours": fours, "sixes": sixes, "is_out": isOut, "dismissal_type": nullableString(dismissal), "innings_no": inningsNo,
		})
	}

	bowlingRows, err := s.DB.Query(`SELECT * FROM fn_match_bowling($1)`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bowling stats"})
		return
	}
	defer bowlingRows.Close()

	bowling := []gin.H{}
	for bowlingRows.Next() {
		var bid, playerID, maidens, runsConceded, wickets, inningsNo int
		var overs float64
		var name string
		if err := bowlingRows.Scan(&bid, &playerID, &name, &overs, &maidens, &runsConceded, &wickets, &inningsNo); err != nil {
			continue
		}
		bowling = append(bowling, gin.H{
			"id": bid, "player_id": playerID, "player_name": name, "overs": overs,
			"maidens": maidens, "runs_conceded": runsConceded, "wickets": wickets, "innings_no": inningsNo,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"id": mid, "tournament_id": nullableInt(tournamentID), "opponent": opponent,
		"match_date": nullableDate(matchDate), "venue": nullableString(venue),
		"our_score": nullableString(ourScore), "opponent_score": nullableString(oppScore),
		"result": result, "tournament_name": nullableString(tournamentName),
		"batting": batting, "bowling": bowling, "result_note": nullableString(noteVal), "in_records": inRecords,
	})
}

type matchRequest struct {
	TournamentID  *int   `json:"tournament_id"`
	Opponent      string `json:"opponent"`
	MatchDate     string `json:"match_date"`
	Venue         string `json:"venue"`
	OurScore      string `json:"our_score"`
	OpponentScore string `json:"opponent_score"`
	Result        string `json:"result"`
}

// POST /api/matches (admin only)
func (s *Server) CreateMatch(c *gin.Context) {
	var req matchRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Opponent == "" || req.MatchDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Opponent and match_date are required"})
		return
	}
	if req.Result == "" {
		req.Result = "Upcoming"
	}

	var id int
	err := s.DB.QueryRow(
		`CALL sp_match_create($1, $2, $3, $4, $5, $6, $7, NULL, TRUE, NULL)`,
		req.TournamentID, req.Opponent, req.MatchDate, nullify(req.Venue), nullify(req.OurScore), nullify(req.OpponentScore), req.Result,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create match"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// PUT /api/matches/:id (admin only)
func (s *Server) UpdateMatch(c *gin.Context) {
	var req matchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	var affected int
	err := s.DB.QueryRow(
		`CALL sp_match_update($1, $2, $3, $4, $5, $6, $7, $8, 0)`,
		c.Param("id"), req.TournamentID, req.Opponent, req.MatchDate, nullify(req.Venue), nullify(req.OurScore), nullify(req.OpponentScore), req.Result,
	).Scan(&affected)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update match"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DELETE /api/matches/:id (admin only)
func (s *Server) DeleteMatch(c *gin.Context) {
	if _, err := s.DB.Exec(`CALL sp_match_delete($1)`, c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete match"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

type battingStatInput struct {
	PlayerID      int    `json:"player_id"`
	Runs          int    `json:"runs"`
	BallsFaced    int    `json:"balls_faced"`
	Fours         int    `json:"fours"`
	Sixes         int    `json:"sixes"`
	IsOut         *bool  `json:"is_out"`
	DismissalType string `json:"dismissal_type"`
}

type bowlingStatInput struct {
	PlayerID     int     `json:"player_id"`
	Overs        float64 `json:"overs"`
	Maidens      int     `json:"maidens"`
	RunsConceded int     `json:"runs_conceded"`
	Wickets      int     `json:"wickets"`
}

type saveStatsRequest struct {
	Batting []battingStatInput `json:"batting"`
	Bowling []bowlingStatInput `json:"bowling"`
}

// PUT /api/matches/:id/stats (admin only) — overwrites this match's batting/bowling
// rows inside a transaction. Career averages on player profiles are computed live
// from these rows, so saving here is what makes stats show up everywhere else.
func (s *Server) SaveMatchStats(c *gin.Context) {
	matchID := c.Param("id")
	var req saveStatsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	tx, err := s.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}

	fail := func(msg string) {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
	}

	if _, err := tx.Exec(`CALL sp_match_stats_clear($1)`, matchID); err != nil {
		fail("Failed to save match stats")
		return
	}

	for _, b := range req.Batting {
		isOut := true
		if b.IsOut != nil {
			isOut = *b.IsOut
		}
		if _, err := tx.Exec(`CALL sp_batting_insert($1, $2, 1, $3, $4, $5, $6, $7, $8)`,
			matchID, b.PlayerID, b.Runs, b.BallsFaced, b.Fours, b.Sixes, isOut, nullify(b.DismissalType)); err != nil {
			fail("Failed to save match stats")
			return
		}
	}

	for _, bw := range req.Bowling {
		if _, err := tx.Exec(`CALL sp_bowling_insert($1, $2, 1, $3, $4, $5, $6)`,
			matchID, bw.PlayerID, bw.Overs, bw.Maidens, bw.RunsConceded, bw.Wickets); err != nil {
			fail("Failed to save match stats")
			return
		}
	}

	if _, err := tx.Exec(`CALL sp_scorecard_mark_reviewed($1)`, matchID); err != nil {
		fail("Failed to save match stats")
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// PUT /api/matches/:id/in-records
// Switches a saved match in or out of the club records. Nothing is deleted: the match and its
// scorecard stay, but while it is switched off every stat query (player career, leaderboard,
// compare, team record) ignores it. Switch it back on and everything returns.
func (s *Server) SetMatchInRecords(c *gin.Context) {
	var req struct {
		InRecords bool `json:"in_records"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "in_records (true/false) is required"})
		return
	}
	var affected int
	if err := s.DB.QueryRow(`CALL sp_match_set_in_records($1, $2, 0)`, c.Param("id"), req.InRecords).Scan(&affected); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update the match"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "in_records": req.InRecords})
}
