package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"

	"challenger-cc-backend/internal/db"
)

// Clears players, their stats, matches, and scorecards.
// Tournaments are left in place. Run migrate afterwards to seed the squad.
func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set")
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
