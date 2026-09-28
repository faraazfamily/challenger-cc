package main

import (
	"log"
	"net/url"
	"os"

	"golang.org/x/crypto/bcrypt"

	"challenger-cc-backend/internal/db"
)

// Creates the admin user, or resets its password if it already exists.
//
//	DATABASE_URL=<your cloud db url> go run ./cmd/setadmin admin "MyNewStrongPassword"
//
// Reads DATABASE_URL from the environment only (never from .env), so it can't
// accidentally touch your local database.
func main() {
	if len(os.Args) != 3 {
		log.Fatal(`usage: go run ./cmd/setadmin <username> "<new password>"`)
	}
	username, password := os.Args[1], os.Args[2]
	if len(password) < 8 {
		log.Fatal("password must be at least 8 characters")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	if u, err := url.Parse(dsn); err == nil {
		log.Printf("Using database host: %s", u.Host)
	}
	db.Connect(dsn)
	defer db.Pool.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("failed to hash password: %v", err)
	}
	if _, err := db.Pool.Exec(
		`INSERT INTO admins (username, password_hash) VALUES ($1,$2)
		 ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
		username, string(hash),
	); err != nil {
		log.Fatalf("failed to save admin: %v", err)
	}
	log.Printf("✅ Admin %q saved. Log in with the new password.", username)
}
