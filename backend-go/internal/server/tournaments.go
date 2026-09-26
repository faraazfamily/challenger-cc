package server

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

type tournamentRequest struct {
	Name      string `json:"name"`
	Year      *int   `json:"year"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
}

// GET /api/tournaments
func (s *Server) GetTournaments(c *gin.Context) {
	rows, err := s.DB.Query(`SELECT id, name, year, start_date, end_date FROM tournaments ORDER BY start_date DESC NULLS LAST`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tournaments"})
		return
	}
	defer rows.Close()

	tournaments := []gin.H{}
	for rows.Next() {
		var id int
		var name string
		var year sql.NullInt32
		var start, end sql.NullTime
		if err := rows.Scan(&id, &name, &year, &start, &end); err != nil {
			continue
		}
		tournaments = append(tournaments, gin.H{
			"id": id, "name": name, "year": nullableInt(year),
			"start_date": nullableDate(start), "end_date": nullableDate(end),
		})
	}
	c.JSON(http.StatusOK, tournaments)
}

// POST /api/tournaments (admin only)
func (s *Server) CreateTournament(c *gin.Context) {
	var req tournamentRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
		return
	}

	var id int
	err := s.DB.QueryRow(
		`INSERT INTO tournaments (name, year, start_date, end_date)
		 VALUES ($1,$2,NULLIF($3,'')::date,NULLIF($4,'')::date) RETURNING id`,
		req.Name, req.Year, req.StartDate, req.EndDate,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create tournament"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"id": id, "name": req.Name, "year": req.Year, "start_date": req.StartDate, "end_date": req.EndDate,
	})
}

// PUT /api/tournaments/:id (admin only)
func (s *Server) UpdateTournament(c *gin.Context) {
	var req tournamentRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
		return
	}

	res, err := s.DB.Exec(
		`UPDATE tournaments SET name=$1, year=$2, start_date=NULLIF($3,'')::date, end_date=NULLIF($4,'')::date WHERE id=$5`,
		req.Name, req.Year, req.StartDate, req.EndDate, c.Param("id"),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update tournament"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tournament not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id": c.Param("id"), "name": req.Name, "year": req.Year,
		"start_date": req.StartDate, "end_date": req.EndDate,
	})
}

// DELETE /api/tournaments/:id (admin only)
func (s *Server) DeleteTournament(c *gin.Context) {
	if _, err := s.DB.Exec(`DELETE FROM tournaments WHERE id = $1`, c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete tournament"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
