package server

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// POST /api/members/login — name-only lookup for regular team members.
// No password and no JWT. Exact case-insensitive match first, then the same
// substring match used when pairing scorecard names to players.
func (s *Server) MemberLogin(c *gin.Context) {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
		return
	}
	query := strings.TrimSpace(body.Name)

	var id int
	err := s.DB.QueryRow(`SELECT id FROM players WHERE LOWER(name) = LOWER($1) LIMIT 1`, query).Scan(&id)
	if err == sql.ErrNoRows {
		id, err = s.fuzzyMatchPlayer(query)
	}
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "You're not listed as a team member yet. Ask the admin to add you first."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to look up member"})
		return
	}

	row := s.DB.QueryRow(`SELECT `+playerColumns+` FROM players WHERE id = $1`, id)
	player, err := scanPlayerRow(row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch player"})
		return
	}
	if err := s.attachCareer(player, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch career stats"})
		return
	}
	c.JSON(http.StatusOK, player)
}

func (s *Server) fuzzyMatchPlayer(name string) (int, error) {
	rows, err := s.DB.Query(`SELECT id, name FROM players`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	lower := strings.ToLower(name)
	for rows.Next() {
		var id int
		var playerName string
		if err := rows.Scan(&id, &playerName); err != nil {
			continue
		}
		pl := strings.ToLower(playerName)
		if pl == lower || strings.Contains(pl, lower) || strings.Contains(lower, pl) {
			return id, nil
		}
	}
	return 0, sql.ErrNoRows
}
