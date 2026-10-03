package server

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GET /api/stats/leaderboard
func (s *Server) GetLeaderboard(c *gin.Context) {
	mostRuns := []gin.H{}
	rows, err := s.DB.Query(`
		SELECT p.id, p.name, p.photo_url, SUM(bs.runs) AS runs, COUNT(*) AS innings
		FROM batting_stats bs JOIN players p ON bs.player_id = p.id
		WHERE bs.match_id IN (SELECT id FROM matches WHERE in_records)
		GROUP BY p.id, p.name, p.photo_url ORDER BY runs DESC LIMIT 10`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build leaderboard"})
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
	rows, err = s.DB.Query(`
		SELECT p.id, p.name, p.photo_url, SUM(bw.wickets) AS wickets, COUNT(*) AS innings
		FROM bowling_stats bw JOIN players p ON bw.player_id = p.id
		WHERE bw.match_id IN (SELECT id FROM matches WHERE in_records)
		GROUP BY p.id, p.name, p.photo_url ORDER BY wickets DESC LIMIT 10`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build leaderboard"})
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
	rows, err = s.DB.Query(`
		SELECT p.id, p.name, p.photo_url,
		       SUM(bs.runs) AS runs, SUM(bs.balls_faced) AS balls,
		       ROUND((SUM(bs.runs)::NUMERIC / NULLIF(SUM(bs.balls_faced),0)) * 100, 2) AS strike_rate
		FROM batting_stats bs JOIN players p ON bs.player_id = p.id
		WHERE bs.match_id IN (SELECT id FROM matches WHERE in_records)
		GROUP BY p.id, p.name, p.photo_url HAVING SUM(bs.balls_faced) > 0
		ORDER BY strike_rate DESC NULLS LAST LIMIT 10`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build leaderboard"})
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
	rows, err = s.DB.Query(`
		SELECT p.id, p.name, p.photo_url,
		       SUM(bw.runs_conceded) AS runs_conceded, SUM(bw.overs) AS overs,
		       ROUND((SUM(bw.runs_conceded)::NUMERIC / NULLIF(SUM(bw.overs),0)), 2) AS economy
		FROM bowling_stats bw JOIN players p ON bw.player_id = p.id
		WHERE bw.match_id IN (SELECT id FROM matches WHERE in_records)
		GROUP BY p.id, p.name, p.photo_url HAVING SUM(bw.overs) > 0
		ORDER BY economy ASC NULLS LAST LIMIT 10`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build leaderboard"})
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
	rows, err := s.DB.Query(`SELECT result, COUNT(*) AS count FROM matches WHERE result != 'Upcoming' AND in_records GROUP BY result`)
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
