package db

import (
	"database/sql"
	"log"
	"net/url"
	"time"

	_ "github.com/lib/pq"
)

// Pool is the shared PostgreSQL connection pool used by the whole app.
var Pool *sql.DB

// CleanDSN removes connection-string options that lib/pq does not understand.
// Neon's copy-paste connection string ends with "channel_binding=require", which
// lib/pq would forward to the server as an (invalid) runtime parameter.
func CleanDSN(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return dsn
	}
	q := u.Query()
	q.Del("channel_binding")
	u.RawQuery = q.Encode()
	return u.String()
}

// Connect opens the pool and verifies the connection is alive.
func Connect(dsn string) {
	var err error
	Pool, err = sql.Open("postgres", CleanDSN(dsn))
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}

	// Serverless Postgres (Neon) suspends idle compute and drops idle connections,
	// so don't hold on to old connections for long.
	Pool.SetMaxOpenConns(10)
	Pool.SetMaxIdleConns(2)
	Pool.SetConnMaxIdleTime(time.Minute)
	Pool.SetConnMaxLifetime(5 * time.Minute)

	if err = Pool.Ping(); err != nil {
		log.Fatalf("failed to ping db: %v", err)
	}
}
