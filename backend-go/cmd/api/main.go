package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"challenger-cc-backend/internal/db"
	"challenger-cc-backend/internal/server"
	"challenger-cc-backend/migrations"
)

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

	// Self-heal: add any missing tables/columns (e.g. matches.in_records) so the
	// leaderboard / matches pages never break because a migration was skipped.
	if err := migrations.Apply(db.Pool); err != nil {
		log.Fatalf("failed to apply schema: %v", err)
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is not set")
	}

	uploadDir := "uploads"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		uploadDir = filepath.Join(os.TempDir(), "uploads")
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			log.Fatalf("failed to create uploads dir: %v", err)
		}
	}

	srv := &server.Server{
		DB:        db.Pool,
		JWTSecret: jwtSecret,
		UploadDir: uploadDir,
	}

	r := gin.Default()
	r.Use(server.CORSMiddleware(os.Getenv("CLIENT_URL")))

	srv.RegisterRoutes(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}
	log.Printf("🏏 The Challengers API (Go) running on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
