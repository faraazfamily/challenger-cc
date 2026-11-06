package server

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GET /api/stats/leaderboard — four tables, each from its own database function.
func (s *Server) GetLeaderboard(c *gin.Context) {
	fail := func() { c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build leaderboard"}) }

	mostRuns := []gin.H{}
	rows, err := s.DB.Query(`SELECT * FROM fn_leaderboard_runs()`)
	if err != nil {
		fail()
		return
	}
	for rows.Next() {
		var id, runs, innings int
		var name string
		var photoURL sql.NullString
		if err := rows.Scan(&id, &name, &photoURL, &runs, &innings); err != nil {
			continue
		}
		mostRuns = append(mostRuns, gin.H{"id": id, "name": name, "photo_url": nullableString(photoURL), "runs": runs, "innings": innings})
	}
	rows.Close()

	mostWickets := []gin.H{}
	rows, err = s.DB.Query(`SELECT * FROM fn_leaderboard_wickets()`)
	if err != nil {
		fail()
		return
	}
	for rows.Next() {
		var id, wickets, innings int
		var name string
		var photoURL sql.NullString
		if err := rows.Scan(&id, &name, &photoURL, &wickets, &innings); err != nil {
			continue
		}
		mostWickets = append(mostWickets, gin.H{"id": id, "name": name, "photo_url": nullableString(photoURL), "wickets": wickets, "innings": innings})
	}
	rows.Close()

	bestStrikeRate := []gin.H{}
	rows, err = s.DB.Query(`SELECT * FROM fn_leaderboard_strike_rate()`)
	if err != nil {
		fail()
		return
	}
	for rows.Next() {
		var id, runs, balls int
		var name string
		var photoURL sql.NullString
		var strikeRate float64
		if err := rows.Scan(&id, &name, &photoURL, &runs, &balls, &strikeRate); err != nil {
			continue
		}
		bestStrikeRate = append(bestStrikeRate, gin.H{
			"id": id, "name": name, "photo_url": nullableString(photoURL),
			"runs": runs, "balls": balls, "strike_rate": strikeRate,
		})
	}
	rows.Close()

	bestEconomy := []gin.H{}
	rows, err = s.DB.Query(`SELECT * FROM fn_leaderboard_economy()`)
	if err != nil {
		fail()
		return
	}
	for rows.Next() {
		var id, runsConceded int
		var name string
		var photoURL sql.NullString
		var overs, economy float64
		if err := rows.Scan(&id, &name, &photoURL, &runsConceded, &overs, &economy); err != nil {
			continue
		}
		bestEconomy = append(bestEconomy, gin.H{
			"id": id, "name": name, "photo_url": nullableString(photoURL),
			"runs_conceded": runsConceded, "overs": overs, "economy": economy,
		})
	}
	rows.Close()

	c.JSON(http.StatusOK, gin.H{
		"mostRuns": mostRuns, "mostWickets": mostWickets,
		"bestStrikeRate": bestStrikeRate, "bestEconomy": bestEconomy,
	})
}

// GET /api/stats/team-record
func (s *Server) GetTeamRecord(c *gin.Context) {
	rows, err := s.DB.Query(`SELECT * FROM fn_team_record()`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch team record"})
		return
	}
	defer rows.Close()

	record := []gin.H{}
	for rows.Next() {
		var result string
		var count int
		if err := rows.Scan(&result, &count); err != nil {
			continue
		}
		record = append(record, gin.H{"result": result, "count": count})
	}
	c.JSON(http.StatusOK, record)
}
