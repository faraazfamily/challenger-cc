package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"

	"challenger-cc-backend/internal/db"
)

// Run this once to set up the database: go run ./cmd/migrate
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

	schema, err := os.ReadFile("migrations/schema.sql")
	if err != nil {
		log.Fatalf("failed to read migrations/schema.sql (run this from the backend-go/ folder): %v", err)
	}

	if _, err := db.Pool.Exec(string(schema)); err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	log.Println("✅ Schema created successfully.")

	var teamCount int
	if err := db.Pool.QueryRow(`SELECT COUNT(*) FROM team_info`).Scan(&teamCount); err != nil {
		log.Fatalf("failed to check team_info: %v", err)
	}
	if teamCount == 0 {
		_, err := db.Pool.Exec(
			`INSERT INTO team_info (name, tagline, founded_year, about) VALUES ($1,$2,$3,$4)`,
			"The Challengers", "Play Hard. Play Fair. Challenge Everything.", 2020,
			"A local cricket club built on grit and teamwork.",
		)
		if err != nil {
			log.Fatalf("failed to seed team_info: %v", err)
		}
		log.Println("✅ Default team_info row inserted.")
	}

	var adminCount int
	if err := db.Pool.QueryRow(`SELECT COUNT(*) FROM admins`).Scan(&adminCount); err != nil {
		log.Fatalf("failed to check admins: %v", err)
	}
	if adminCount == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("failed to hash default password: %v", err)
		}
		if _, err := db.Pool.Exec(`INSERT INTO admins (username, password_hash) VALUES ($1,$2)`, "admin", string(hash)); err != nil {
			log.Fatalf("failed to seed admin: %v", err)
		}
		log.Println("✅ Default admin created — username: admin / password: admin123 (CHANGE THIS after first login).")
	}

	seedPlayer("Faraaz", "Batsman", "Right-hand bat", "Part-time medium pacer", "Poor fielder", "", 25, false, false)
	seedPlayer("Asad", "All-rounder", "Right-hand bat", "Spinner", "One of the best fielders in the team", "Captain of the team", 0, true, false)
	seedPlayer("Gaus", "Batsman", "Right-hand bat", "", "Poor fielder", "", 0, false, false)
	seedPlayer("Farhan", "All-rounder", "Right-hand bat", "Right-arm fast", "Very good fielder", "", 0, false, false)
	seedPlayer("Abuzaid", "All-rounder", "Right-hand bat", "Right-arm fast", "One of the best fielders in the team", "", 0, false, false)
	seedPlayer("Sufyian", "Batsman", "Right-hand bat", "", "Good fielder", "", 0, false, false)
	seedPlayer("Sahil", "All-rounder", "Right-hand bat", "Right-arm fast", "Good fielder", "Best bowling all-rounder", 0, false, true)
	seedPlayer("Kamran", "Batsman", "Left-hand bat", "", "Average fielder", "", 0, false, false)
	seedPlayer("Gufran", "Batsman", "", "Part-time spin", "", "The best batsman of the team", 0, false, false)
	var keepers int
	if err := db.Pool.QueryRow(`SELECT COUNT(*) FROM players WHERE is_wicketkeeper = true`).Scan(&keepers); err != nil {
		log.Fatalf("failed to check wicketkeeper: %v", err)
	}
	if keepers == 0 {
		if _, err := db.Pool.Exec(`UPDATE players SET role = 'Batsman', is_wicketkeeper = true WHERE LOWER(name) = 'gufran'`); err != nil {
			log.Fatalf("failed to set Gufran as wicketkeeper: %v", err)
		}
	}
}

// seedPlayer inserts a squad member when that name is not already present.
// jerseyNumber 0 means leave the column NULL.
func seedPlayer(name, role, batting, bowling, fielding, bio string, jerseyNumber int, captain, vice bool) {
	var count int
	if err := db.Pool.QueryRow(`SELECT COUNT(*) FROM players WHERE LOWER(name) = LOWER($1)`, name).Scan(&count); err != nil {
		log.Fatalf("failed to check player %s: %v", name, err)
	}
	if count > 0 {
		log.Printf("player %s already present, skipping", name)
		return
	}

	var jersey interface{}
	if jerseyNumber > 0 {
		jersey = jerseyNumber
	}
	var bowlingVal, bioVal interface{}
	if bowling != "" {
		bowlingVal = bowling
	}
	if bio != "" {
		bioVal = bio
	}

	_, err := db.Pool.Exec(
		`INSERT INTO players (name, role, batting_style, bowling_style, jersey_number, bio, fielding_notes, is_captain, is_vice_captain)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		name, role, batting, bowlingVal, jersey, bioVal, fielding, captain, vice,
	)
	if err != nil {
		log.Fatalf("failed to seed player %s: %v", name, err)
	}
	log.Printf("✅ Seeded player %s", name)
}
