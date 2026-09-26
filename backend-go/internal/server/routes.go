package server

import (
	"github.com/gin-gonic/gin"
	"net/http"

	"challenger-cc-backend/internal/middleware"
)

// RegisterRoutes wires every endpoint to its handler. Route paths match the
// React frontend's api.js exactly, so the frontend needs zero changes.
func (s *Server) RegisterRoutes(r *gin.Engine) {
	auth := middleware.RequireAuth(s.JWTSecret)

	r.GET("/api/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	r.POST("/api/auth/login", s.Login)
	r.POST("/api/members/login", s.MemberLogin)

	r.GET("/api/team", s.GetTeam)
	r.PUT("/api/team", auth, s.UpdateTeam)

	r.GET("/api/players", s.GetPlayers)
	r.GET("/api/players/:id", s.GetPlayer)
	r.POST("/api/players", auth, s.CreatePlayer)
	r.PUT("/api/players/:id", auth, s.UpdatePlayer)
	r.DELETE("/api/players/:id", auth, s.DeletePlayer)

	r.GET("/api/tournaments", s.GetTournaments)
	r.POST("/api/tournaments", auth, s.CreateTournament)
	r.PUT("/api/tournaments/:id", auth, s.UpdateTournament)
	r.DELETE("/api/tournaments/:id", auth, s.DeleteTournament)

	r.GET("/api/matches", s.GetMatches)
	r.GET("/api/matches/:id", s.GetMatch)
	r.POST("/api/matches", auth, s.CreateMatch)
	r.PUT("/api/matches/:id", auth, s.UpdateMatch)
	r.DELETE("/api/matches/:id", auth, s.DeleteMatch)
	r.PUT("/api/matches/:id/stats", auth, s.SaveMatchStats)

	r.POST("/api/scorecards/upload", auth, s.ImportScorecard)
	r.POST("/api/scorecards/:matchId/upload", auth, s.UploadScorecard)
	r.GET("/api/scorecards/:matchId", s.GetScorecards)

	r.GET("/api/stats/leaderboard", s.GetLeaderboard)
	r.GET("/api/stats/team-record", s.GetTeamRecord)
}
