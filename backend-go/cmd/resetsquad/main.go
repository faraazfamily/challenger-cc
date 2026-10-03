package main

import (
	"log"
	"net/url"
	"os"

	"github.com/joho/godotenv"

	"challenger-cc-backend/internal/db"
)

// DANGER: clears players, their stats, matches, and scorecards.
// Tournaments are left in place. Run migrate afterwards to seed the squad.
//
// Safety: it refuses to run unless CONFIRM=yes is set, and it always prints
// which database host it is about to wipe. Run `go run ./cmd/backup` first.
func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	host := "?"
	if u, err := url.Parse(dsn); err == nil {
		host = u.Host
	}
	log.Printf("This will DELETE all players, stats, matches and scorecards on host: %s", host)
	if os.Getenv("CONFIRM") != "yes" {
		log.Fatal("Refusing to run. Take a backup (go run ./cmd/backup) and re-run with CONFIRM=yes if the host above is correct.")
	}

	db.Connect(dsn)
	defer db.Pool.Close()

	statements := []string{
		`DELETE FROM batting_stats`,
		`DELETE FROM bowling_stats`,
		`DELETE FROM scorecards`,
		`DELETE FROM matches`,
		`DELETE FROM players`,
	}
	for _, stmt := range statements {
		if _, err := db.Pool.Exec(stmt); err != nil {
			log.Fatalf("%s: %v", stmt, err)
		}
	}
	log.Println("Players, stats, matches, and scorecards removed. Tournaments were kept.")
}
