package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Live scorer. The whole match (teams, every ball) is one JSON document kept in
// scorer_matches, so a half-scored match survives refreshes and can be resumed
// from any phone. When the match is over, /finish turns it into a normal row in
// matches + batting_stats + bowling_stats, so player profiles, the leaderboard
// and the member comparison update exactly as they do for an uploaded scorecard.
// All routes are admin-only (see routes.go).
// ---------------------------------------------------------------------------

type liveMatchRequest struct {
	Title  string          `json:"title"`
	Format string          `json:"format"`
	State  json.RawMessage `json:"state"`
}

// GET /api/scorer/live — matches that are still being scored.
func (s *Server) ListLiveMatches(c *gin.Context) {
	rows, err := s.DB.Query(`SELECT * FROM fn_scorer_live()`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load live matches"})
		return
	}
	defer rows.Close()

	list := []gin.H{}
	for rows.Next() {
		var id int
		var title, format, status string
		var updated time.Time
		if err := rows.Scan(&id, &title, &format, &status, &updated); err != nil {
			continue
		}
		list = append(list, gin.H{"id": id, "title": title, "format": format, "status": status, "updated_at": updated})
	}
	c.JSON(http.StatusOK, list)
}

// GET /api/scorer/history[?archived=1] — every scored match (live and finished) with its full
// state, so the History, Teams and Players screens can be worked out on the phone.
func (s *Server) ListScorerHistory(c *gin.Context) {
	archived := c.Query("archived") == "1"
	rows, err := s.DB.Query(`SELECT * FROM fn_scorer_history($1)`, archived)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load scored matches"})
		return
	}
	defer rows.Close()

	list := []gin.H{}
	for rows.Next() {
		var id int
		var title, format, status string
		var arch bool
		var matchID *int
		var state []byte
		var created, updated time.Time
		if err := rows.Scan(&id, &title, &format, &status, &arch, &matchID, &state, &created, &updated); err != nil {
			continue
		}
		list = append(list, gin.H{
			"id": id, "title": title, "format": format, "status": status, "archived": arch,
			"match_id": matchID, "state": json.RawMessage(state), "created_at": created, "updated_at": updated,
		})
	}
	c.JSON(http.StatusOK, list)
}

// PUT /api/scorer/live/:id/archive {"archived": true|false} — hide a match from History
// (and from the scorer's team / player stats) without deleting anything.
func (s *Server) ArchiveLiveMatch(c *gin.Context) {
	var req struct {
		Archived bool `json:"archived"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "archived (true/false) is required"})
		return
	}
	var n int
	if err := s.DB.QueryRow(`CALL sp_scorer_archive($1, $2, 0)`, c.Param("id"), req.Archived).Scan(&n); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update the match"})
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Scored match not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "archived": req.Archived})
}

// GET /api/scorer/live/:id
func (s *Server) GetLiveMatch(c *gin.Context) {
	var state []byte
	var status string
	err := s.DB.QueryRow(`SELECT * FROM fn_scorer_match($1)`, c.Param("id")).Scan(&state, &status)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Live match not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": c.Param("id"), "status": status, "state": json.RawMessage(state)})
}

// POST /api/scorer/live
func (s *Server) CreateLiveMatch(c *gin.Context) {
	var req liveMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.State) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A match state is required"})
		return
	}
	var id int
	err := s.DB.QueryRow(`CALL sp_scorer_create($1, $2, $3::jsonb, NULL)`, req.Title, req.Format, string(req.State)).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start the match"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// PUT /api/scorer/live/:id — autosave after every ball.
func (s *Server) SaveLiveMatch(c *gin.Context) {
	var req liveMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.State) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A match state is required"})
		return
	}
	var n int
	if err := s.DB.QueryRow(`CALL sp_scorer_save($1, $2, $3, $4::jsonb, 0)`,
		c.Param("id"), req.Title, req.Format, string(req.State)).Scan(&n); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save the match"})
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Live match not found (or already finished)"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DELETE /api/scorer/live/:id — throw away a match that was never finished.
func (s *Server) DeleteLiveMatch(c *gin.Context) {
	if _, err := s.DB.Exec(`CALL sp_scorer_delete($1)`, c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete the live match"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

type finishBat struct {
	PlayerID      int    `json:"player_id"`
	InningsNo     int    `json:"innings_no"`
	Runs          int    `json:"runs"`
	BallsFaced    int    `json:"balls_faced"`
	Fours         int    `json:"fours"`
	Sixes         int    `json:"sixes"`
	IsOut         bool   `json:"is_out"`
	DismissalType string `json:"dismissal_type"`
}

type finishBowl struct {
	PlayerID     int     `json:"player_id"`
	InningsNo    int     `json:"innings_no"`
	Overs        float64 `json:"overs"`
	Maidens      int     `json:"maidens"`
	RunsConceded int     `json:"runs_conceded"`
	Wickets      int     `json:"wickets"`
}

type finishPayload struct {
	Opponent      string       `json:"opponent"`
	MatchDate     string       `json:"match_date"`
	Venue         string       `json:"venue"`
	OurScore      string       `json:"our_score"`
	OpponentScore string       `json:"opponent_score"`
	Result        string       `json:"result"`
	ResultNote    string       `json:"result_note"`
	InRecords     *bool        `json:"in_records"`
	TournamentID  *int         `json:"tournament_id"`
	Batting       []finishBat  `json:"batting"`
	Bowling       []finishBowl `json:"bowling"`
}

// POST /api/scorer/live/:id/finish (multipart: "payload" JSON + optional "pdf" file)
// Creates the match + all stats in ONE transaction and attaches the generated PDF.
func (s *Server) FinishLiveMatch(c *gin.Context) {
	liveID := c.Param("id")

	var p finishPayload
	if err := json.Unmarshal([]byte(c.PostForm("payload")), &p); err != nil || p.Opponent == "" || p.MatchDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Match details are missing"})
		return
	}
	switch p.Result {
	case "Won", "Lost", "Tied", "No Result", "Draw":
	default:
		p.Result = "No Result"
	}

	inRecords := p.InRecords == nil || *p.InRecords

	var pdfBytes []byte
	if fh, err := c.FormFile("pdf"); err == nil {
		f, err := fh.Open()
		if err == nil {
			pdfBytes, _ = io.ReadAll(io.LimitReader(f, maxPDFBytes+1))
			f.Close()
		}
	}

	var status string
	if err := s.DB.QueryRow(`SELECT status FROM fn_scorer_match($1)`, liveID).Scan(&status); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Live match not found"})
		return
	}
	if status != "live" {
		c.JSON(http.StatusConflict, gin.H{"error": "This match was already saved."})
		return
	}

	pdfURL := ""
	hash := ""
	if len(pdfBytes) > 0 {
		url, err := s.storePDF(pdfBytes)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		pdfURL = url
		sum := sha256.Sum256(pdfBytes)
		hash = hex.EncodeToString(sum[:])
	}

	tx, err := s.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback()

	var matchID int
	err = tx.QueryRow(
		`CALL sp_match_create($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)`,
		p.TournamentID, p.Opponent, p.MatchDate, nullify(p.Venue), nullify(p.OurScore), nullify(p.OpponentScore), p.Result, nullify(p.ResultNote), inRecords,
	).Scan(&matchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create the match"})
		return
	}

	for _, b := range p.Batting {
		if b.PlayerID == 0 {
			continue
		}
		if b.InningsNo < 1 {
			b.InningsNo = 1
		}
		if _, err := tx.Exec(`CALL sp_batting_insert($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			matchID, b.PlayerID, b.InningsNo, b.Runs, b.BallsFaced, b.Fours, b.Sixes, b.IsOut, nullify(b.DismissalType)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save batting stats"})
			return
		}
	}
	for _, b := range p.Bowling {
		if b.PlayerID == 0 {
			continue
		}
		if b.InningsNo < 1 {
			b.InningsNo = 1
		}
		if _, err := tx.Exec(`CALL sp_bowling_insert($1, $2, $3, $4, $5, $6, $7)`,
			matchID, b.PlayerID, b.InningsNo, b.Overs, b.Maidens, b.RunsConceded, b.Wickets); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save bowling stats"})
			return
		}
	}

	if pdfURL != "" {
		if _, err := tx.Exec(`CALL sp_scorecard_insert($1, $2, NULL, true, $3)`, matchID, pdfURL, hash); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to attach the scorecard PDF"})
			return
		}
	}
	// The autosave runs a moment after each ball, so the final state comes with the finish
	// request too; History then always shows the complete match.
	var finalState interface{}
	if st := c.PostForm("state"); st != "" && json.Valid([]byte(st)) {
		finalState = st
	}
	if _, err := tx.Exec(`CALL sp_scorer_finish($1, $2, $3::jsonb)`, liveID, matchID, finalState); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to close the live match"})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit the match"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"match_id": matchID, "pdf_url": pdfURL})
}
