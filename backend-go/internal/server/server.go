package server

import (
	"database/sql"
)

// Server holds shared dependencies that every handler needs.
// Handlers are defined as methods on *Server across this package's files
// (players.go, matches.go, tournaments.go, scorecards.go, stats.go, team.go, auth.go).
type Server struct {
	DB        *sql.DB
	JWTSecret string
	UploadDir string
}
