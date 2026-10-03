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
// live_matches, so a half-scored match survives refreshes and can be resumed
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
	rows, err := s.DB.Query(`SELECT id, title, format, status, updated_at FROM live_matches WHERE status = 'live' ORDER BY updated_at DESC`)
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

// GET /api/scorer/live/:id
func (s *Server) GetLiveMatch(c *gin.Context) {
	var state []byte
	var status string
	err := s.DB.QueryRow(`SELECT state, status FROM live_matches WHERE id = $1`, c.Param("id")).Scan(&state, &status)
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
	err := s.DB.QueryRow(
		`INSERT INTO live_matches (title, format, state) VALUES ($1,$2,$3::jsonb) RETURNING id`,
		req.Title, req.Format, string(req.State),
	).Scan(&id)
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
	res, err := s.DB.Exec(
		`UPDATE live_matches SET title=$1, format=$2, state=$3::jsonb, updated_at=NOW() WHERE id=$4 AND status='live'`,
		req.Title, req.Format, string(req.State), c.Param("id"),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save the match"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Live match not found (or already finished)"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DELETE /api/scorer/live/:id — throw away a match that was never finished.
func (s *Server) DeleteLiveMatch(c *gin.Context) {
	if _, err := s.DB.Exec(`DELETE FROM live_matches WHERE id = $1 AND status = 'live'`, c.Param("id")); err != nil {
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
	if err := s.DB.QueryRow(`SELECT status FROM live_matches WHERE id = $1`, liveID).Scan(&status); err != nil {
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
		`INSERT INTO matches (tournament_id, opponent, match_date, venue, our_score, opponent_score, result, result_note, in_records)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
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
		if _, err := tx.Exec(
			`INSERT INTO batting_stats (match_id, player_id, innings_no, runs, balls_faced, fours, sixes, is_out, dismissal_type)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			matchID, b.PlayerID, b.InningsNo, b.Runs, b.BallsFaced, b.Fours, b.Sixes, b.IsOut, nullify(b.DismissalType),
		); err != nil {
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
		if _, err := tx.Exec(
			`INSERT INTO bowling_stats (match_id, player_id, innings_no, overs, maidens, runs_conceded, wickets)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			matchID, b.PlayerID, b.InningsNo, b.Overs, b.Maidens, b.RunsConceded, b.Wickets,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save bowling stats"})
			return
		}
	}

	if pdfURL != "" {
		if _, err := tx.Exec(
			`INSERT INTO scorecards (match_id, pdf_url, is_reviewed, content_hash) VALUES ($1,$2,true,$3)`,
			matchID, pdfURL, hash,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to attach the scorecard PDF"})
			return
		}
	}
	if _, err := tx.Exec(`UPDATE live_matches SET status='finished', match_id=$1, updated_at=NOW() WHERE id=$2`, matchID, liveID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to close the live match"})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit the match"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"match_id": matchID, "pdf_url": pdfURL})
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
	res, err := s.DB.Exec(`UPDATE matches SET in_records = $1 WHERE id = $2`, req.InRecords, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update the match"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "in_records": req.InRecords})
}
