package server

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"challenger-cc-backend/internal/pdfparser"
)

// POST /api/scorecards/:matchId/upload (admin only, multipart "scorecard" PDF)
// Extracts text, suggests batting/bowling rows, and tries to match player names.
// Nothing is saved to batting_stats/bowling_stats here — the admin reviews the
// suggestions in the UI and confirms via PUT /api/matches/:id/stats.
func (s *Server) UploadScorecard(c *gin.Context) {
	matchID := c.Param("matchId")

	file, _, err := c.Request.FormFile("scorecard")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No PDF file uploaded"})
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read uploaded file"})
		return
	}

	pdfURL, err := s.storePDF(fileBytes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file: " + err.Error()})
		return
	}

	result, err := pdfparser.Parse(fileBytes, int64(len(fileBytes)))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse scorecard PDF. You can enter stats manually instead."})
		return
	}

	if _, err := s.DB.Exec(
		`INSERT INTO scorecards (match_id, pdf_url, raw_text, is_reviewed) VALUES ($1,$2,$3,false)`,
		matchID, pdfURL, result.RawText,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save scorecard record"})
		return
	}

	// Fuzzy-match suggested names to existing players (case-insensitive substring match).
	rows, err := s.DB.Query(`SELECT id, name FROM players`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load players for matching"})
		return
	}
	defer rows.Close()

	type playerRef struct {
		ID   int
		Name string
	}
	var players []playerRef
	for rows.Next() {
		var p playerRef
		if err := rows.Scan(&p.ID, &p.Name); err == nil {
			players = append(players, p)
		}
	}

	matchPlayer := func(name string) *playerRef {
		lower := strings.ToLower(name)
		for _, p := range players {
			pl := strings.ToLower(p.Name)
			if pl == lower || strings.Contains(pl, lower) || strings.Contains(lower, pl) {
				return &p
			}
		}
		return nil
	}

	batting := make([]gin.H, 0, len(result.SuggestedBatting))
	for _, row := range result.SuggestedBatting {
		match := matchPlayer(row.Name)
		var playerID, matchedName interface{}
		if match != nil {
			playerID, matchedName = match.ID, match.Name
		}
		batting = append(batting, gin.H{
			"name": row.Name, "runs": row.Runs, "balls_faced": row.BallsFaced,
			"fours": row.Fours, "sixes": row.Sixes,
			"player_id": playerID, "matched_name": matchedName,
		})
	}

	bowling := make([]gin.H, 0, len(result.SuggestedBowling))
	for _, row := range result.SuggestedBowling {
		match := matchPlayer(row.Name)
		var playerID, matchedName interface{}
		if match != nil {
			playerID, matchedName = match.ID, match.Name
		}
		bowling = append(bowling, gin.H{
			"name": row.Name, "overs": row.Overs, "maidens": row.Maidens,
			"runs_conceded": row.RunsConceded, "wickets": row.Wickets,
			"player_id": playerID, "matched_name": matchedName,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"pdf_url":          pdfURL,
		"message":          "PDF parsed. Please review the suggested stats below and correct any unmatched players before saving.",
		"suggestedBatting": batting,
		"suggestedBowling": bowling,
	})
}

// POST /api/scorecards/upload (admin only)
// Reads both teams from the PDF ("X v/s Y"), creates the match, and saves
// stats only for names that exactly match the squad. Nothing is left to edit.
func (s *Server) ImportScorecard(c *gin.Context) {
	file, _, err := c.Request.FormFile("scorecard")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No PDF file uploaded"})
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read uploaded file"})
		return
	}
	result, err := pdfparser.Parse(fileBytes, int64(len(fileBytes)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not read this PDF."})
		return
	}
	sum := sha256.Sum256(fileBytes)
	contentHash := hex.EncodeToString(sum[:])
	var already int
	if err := s.DB.QueryRow(`SELECT COUNT(*) FROM scorecards WHERE content_hash = $1`, contentHash).Scan(&already); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for a duplicate scorecard"})
		return
	}
	if already > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "This scorecard PDF was already uploaded. It was not saved again."})
		return
	}

	prows, err := s.DB.Query(`SELECT id, name FROM players`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load players"})
		return
	}
	defer prows.Close()

	type playerRef struct {
		ID   int
		Name string
	}
	var squad []playerRef
	var squadNames []string
	for prows.Next() {
		var p playerRef
		if err := prows.Scan(&p.ID, &p.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read players"})
			return
		}
		squad = append(squad, p)
		squadNames = append(squadNames, p.Name)
	}
	if err := prows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read players"})
		return
	}

	ours, opponent, ok := pdfparser.OurSide(result.Fixture, squadNames)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not read both teams from this PDF."})
		return
	}
	ourScore, oppScore := result.Fixture.ScoreB, result.Fixture.ScoreA
	if ours == result.Fixture.SideA {
		ourScore, oppScore = result.Fixture.ScoreA, result.Fixture.ScoreB
	}
	matchResult := "No Result"
	switch result.Fixture.Winner {
	case ours:
		matchResult = "Won"
	case opponent:
		matchResult = "Lost"
	}

	idByName := map[string]int{}
	for _, p := range squad {
		if canonical, matched := pdfparser.SquadName(p.Name, squadNames); matched {
			idByName[strings.ToLower(canonical)] = p.ID
		}
	}

	type bat = pdfparser.BattingRow
	battingSaved := map[int]bat{}
	var saved []gin.H
	for _, row := range result.SuggestedBatting {
		canonical, matched := pdfparser.SquadName(row.Name, squadNames)
		if !matched {
			continue
		}
		id := idByName[strings.ToLower(canonical)]
		prev := battingSaved[id]
		prev.Name = canonical
		prev.Runs += row.Runs
		prev.BallsFaced += row.BallsFaced
		prev.Fours += row.Fours
		prev.Sixes += row.Sixes
		battingSaved[id] = prev
	}
	type bowl = pdfparser.BowlingRow
	bowlingSaved := map[int]bowl{}
	for _, row := range result.SuggestedBowling {
		canonical, matched := pdfparser.SquadName(row.Name, squadNames)
		if !matched {
			continue
		}
		id := idByName[strings.ToLower(canonical)]
		prev := bowlingSaved[id]
		prev.Name = canonical
		prev.Overs += row.Overs
		prev.Maidens += row.Maidens
		prev.RunsConceded += row.RunsConceded
		prev.Wickets += row.Wickets
		bowlingSaved[id] = prev
	}
	if len(battingSaved) == 0 && len(bowlingSaved) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "None of the names on this scorecard are on the squad."})
		return
	}

	pdfURL, err := s.storePDF(fileBytes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file: " + err.Error()})
		return
	}

	tx, err := s.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback()

	var matchID int
	err = tx.QueryRow(
		`INSERT INTO matches (opponent, match_date, our_score, opponent_score, result)
		 VALUES ($1, CURRENT_DATE, $2, $3, $4) RETURNING id`,
		opponent, nullify(ourScore), nullify(oppScore), matchResult,
	).Scan(&matchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create match from the PDF"})
		return
	}
	if _, err := tx.Exec(
		`INSERT INTO scorecards (match_id, pdf_url, raw_text, is_reviewed, content_hash) VALUES ($1,$2,$3,true,$4)`,
		matchID, pdfURL, result.RawText, contentHash,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save scorecard record"})
		return
	}
	for id, row := range battingSaved {
		if _, err := tx.Exec(
			`INSERT INTO batting_stats (match_id, player_id, runs, balls_faced, fours, sixes, is_out)
			 VALUES ($1,$2,$3,$4,$5,$6,true)`,
			matchID, id, row.Runs, row.BallsFaced, row.Fours, row.Sixes,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save batting stats"})
			return
		}
		saved = append(saved, gin.H{"name": row.Name, "kind": "batting", "runs": row.Runs, "balls": row.BallsFaced})
	}
	for id, row := range bowlingSaved {
		if _, err := tx.Exec(
			`INSERT INTO bowling_stats (match_id, player_id, overs, maidens, runs_conceded, wickets)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			matchID, id, row.Overs, row.Maidens, row.RunsConceded, row.Wickets,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save bowling stats"})
			return
		}
		saved = append(saved, gin.H{"name": row.Name, "kind": "bowling", "overs": row.Overs, "wickets": row.Wickets})
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit scorecard"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"match_id":       matchID,
		"our_team":       ours,
		"opponent":       opponent,
		"result":         matchResult,
		"our_score":      ourScore,
		"opponent_score": oppScore,
		"match_date":     time.Now().Format("2006-01-02"),
		"saved":          saved,
	})
}

// GET /api/scorecards/:matchId
func (s *Server) GetScorecards(c *gin.Context) {
	rows, err := s.DB.Query(
		`SELECT id, match_id, pdf_url, is_reviewed, uploaded_at FROM scorecards WHERE match_id = $1 ORDER BY uploaded_at DESC`,
		c.Param("matchId"),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch scorecards"})
		return
	}
	defer rows.Close()

	result := []gin.H{}
	for rows.Next() {
		var id, matchID int
		var pdfURL string
		var isReviewed bool
		var uploadedAt time.Time
		if err := rows.Scan(&id, &matchID, &pdfURL, &isReviewed, &uploadedAt); err != nil {
			continue
		}
		result = append(result, gin.H{
			"id": id, "match_id": matchID, "pdf_url": pdfURL,
			"is_reviewed": isReviewed, "uploaded_at": uploadedAt,
		})
	}
	c.JSON(http.StatusOK, result)
}
