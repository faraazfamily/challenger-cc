package server

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GET /api/team
func (s *Server) GetTeam(c *gin.Context) {
	row := s.DB.QueryRow(`SELECT id, name, tagline, founded_year, logo_url, about FROM team_info LIMIT 1`)

	var id int
	var name string
	var tagline, logoURL, about sql.NullString
	var foundedYear sql.NullInt32

	err := row.Scan(&id, &name, &tagline, &foundedYear, &logoURL, &about)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusOK, gin.H{})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch team info"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id": id, "name": name,
		"tagline": nullableString(tagline), "founded_year": nullableInt(foundedYear),
		"logo_url": nullableString(logoURL), "about": nullableString(about),
	})
}

// PUT /api/team (admin only, multipart form with optional "logo" file)
func (s *Server) UpdateTeam(c *gin.Context) {
	name := c.PostForm("name")
	tagline := c.PostForm("tagline")
	about := c.PostForm("about")
	foundedYearStr := c.PostForm("founded_year")

	var foundedYear *int
	if foundedYearStr != "" {
		if v, err := strconv.Atoi(foundedYearStr); err == nil {
			foundedYear = &v
		}
	}

	logoURL := c.PostForm("existing_logo_url")
	if file, err := c.FormFile("logo"); err == nil && file != nil {
		if url, err := s.storeImage(file); err == nil {
			logoURL = url
		} else {
			_ = c.Error(err)
		}
	}

	var existingID int
	err := s.DB.QueryRow(`SELECT id FROM team_info LIMIT 1`).Scan(&existingID)
	if err == sql.ErrNoRows {
		_, err = s.DB.Exec(
			`INSERT INTO team_info (name, tagline, founded_year, logo_url, about) VALUES ($1,$2,$3,$4,$5)`,
			name, nullify(tagline), foundedYear, nullify(logoURL), nullify(about),
		)
	} else if err == nil {
		_, err = s.DB.Exec(
			`UPDATE team_info SET name=$1, tagline=$2, founded_year=$3, logo_url=$4, about=$5 WHERE id=$6`,
			name, nullify(tagline), foundedYear, nullify(logoURL), nullify(about), existingID,
		)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update team info"})
		return
	}
	s.GetTeam(c)
}
