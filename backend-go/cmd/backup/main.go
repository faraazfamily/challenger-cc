package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	"challenger-cc-backend/internal/db"
)

// Dumps the important tables to one JSON file so a bad command can never
// cost you your career stats again.
//
//	go run ./cmd/backup            -> backups/backup-<timestamp>.json
//
// Admin password hashes and uploaded files (photos/PDFs) are not included.
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

	tables := []string{"team_info", "players", "tournaments", "matches", "scorecards", "batting_stats", "bowling_stats", "live_matches"}

	if err := os.MkdirAll("backups", 0o755); err != nil {
		log.Fatalf("cannot create backups folder: %v", err)
	}
	name := fmt.Sprintf("backups/backup-%s.json", time.Now().Format("20060102-150405"))
	f, err := os.Create(name)
	if err != nil {
		log.Fatalf("cannot create %s: %v", name, err)
	}
	defer f.Close()

	f.WriteString("{\n")
	for i, t := range tables {
		var js string
		q := fmt.Sprintf(`SELECT COALESCE(json_agg(x), '[]'::json)::text FROM %s x`, t)
		if err := db.Pool.QueryRow(q).Scan(&js); err != nil {
			log.Fatalf("backing up %s: %v", t, err)
		}
		sep := ","
		if i == len(tables)-1 {
			sep = ""
		}
		fmt.Fprintf(f, "%q: %s%s\n", t, js, sep)
		log.Printf("✅ %-14s saved", t)
	}
	f.WriteString("}\n")
	log.Printf("Backup written to %s", name)
}
