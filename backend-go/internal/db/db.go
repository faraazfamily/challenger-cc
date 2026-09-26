package db

import (
	"database/sql"
	"log"

	_ "github.com/lib/pq"
)

// Pool is the shared PostgreSQL connection pool used by the whole app.
var Pool *sql.DB

// Connect opens the pool and verifies the connection is alive.
func Connect(dsn string) {
	var err error
	Pool, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	if err = Pool.Ping(); err != nil {
		log.Fatalf("failed to ping db: %v", err)
	}
}
