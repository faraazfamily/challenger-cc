package server

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Server holds shared dependencies that every handler needs.
// Handlers are defined as methods on *Server across this package's files
// (players.go, matches.go, tournaments.go, scorecards.go, stats.go, team.go, auth.go).
type Server struct {
	DB        *sql.DB
	JWTSecret string
	UploadDir string
}

// CORSMiddleware allows the React frontend (on a different port in dev) to call this API.
func CORSMiddleware(clientURL string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			origin = clientURL
		}
		if origin == "" {
			origin = "*"
		}
		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Vary", "Origin")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Bypass-Tunnel-Reminder")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
