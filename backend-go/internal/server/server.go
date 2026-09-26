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
	origin := clientURL
	if origin == "" {
		origin = "*"
	}
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
