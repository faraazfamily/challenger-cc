package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"challenger-cc-backend/internal/db"
)

// One-off tool: copies everything from your LOCAL Postgres into the CLOUD database
// (players, matches, stats, scorecards, admin login, photos...).
//
//	SOURCE_DATABASE_URL = your local database   (where your data is today)
//	DATABASE_URL        = the cloud (Neon) database  (where the data should go)
//	CONFIRM=yes         = required, because the cloud tables are emptied first
//
// Run from the backend-go/ folder. Environment variables only — .env is not read.
func main() {
	srcDSN := os.Getenv("SOURCE_DATABASE_URL")
	dstDSN := os.Getenv("DATABASE_URL")
	if srcDSN == "" || dstDSN == "" {
		log.Fatal("set both SOURCE_DATABASE_URL (local) and DATABASE_URL (cloud)")
	}
	log.Printf("FROM host: %s", host(srcDSN))
	log.Printf("TO   host: %s", host(dstDSN))
	if host(srcDSN) == host(dstDSN) {
		log.Fatal("source and destination look identical — refusing to continue")
	}
	if os.Getenv("CONFIRM") != "yes" {
		log.Fatal("This EMPTIES the destination tables first. Re-run with CONFIRM=yes if host names above are right.")
	}

	src, err := open(srcDSN)
	if err != nil {
		log.Fatalf("source: %v", err)
	}
	defer src.Close()
	dst, err := open(dstDSN)
	if err != nil {
		log.Fatalf("destination: %v", err)
	}
	defer dst.Close()

	schema, err := os.ReadFile("migrations/schema.sql")
	if err != nil {
		log.Fatalf("run this from the backend-go/ folder: %v", err)
	}
	// schema.sql is idempotent: it only adds tables/columns that are missing.
	for name, d := range map[string]*sql.DB{"source": src, "destination": dst} {
		if _, err := d.Exec(string(schema)); err != nil {
			log.Fatalf("applying schema to %s: %v", name, err)
		}
	}

	tables := []string{"admins", "team_info", "players", "tournaments", "matches", "scorecards", "batting_stats", "bowling_stats"}

	if _, err := dst.Exec(`TRUNCATE files, batting_stats, bowling_stats, scorecards, matches, tournaments, players, team_info, admins RESTART IDENTITY CASCADE`); err != nil {
		log.Fatalf("emptying destination: %v", err)
	}

	for _, t := range tables {
		n, err := copyTable(src, dst, t)
		if err != nil {
			log.Fatalf("copying %s: %v", t, err)
		}
		if _, err := dst.Exec(fmt.Sprintf(
			`SELECT setval(pg_get_serial_sequence('%s','id'), COALESCE((SELECT MAX(id) FROM %s), 1), (SELECT MAX(id) IS NOT NULL FROM %s))`,
			t, t, t)); err != nil {
			log.Fatalf("resetting id counter of %s: %v", t, err)
		}
		log.Printf("✅ %-14s %d rows", t, n)
	}

	copyUploads(src, dst)
	log.Println("Done. Your cloud database now has all the data from your laptop.")
}

func host(dsn string) string {
	if u, err := url.Parse(dsn); err == nil {
		return u.Host
	}
	return "?"
}

func open(dsn string) (*sql.DB, error) {
	d, err := sql.Open("postgres", db.CleanDSN(dsn))
	if err != nil {
		return nil, err
	}
	return d, d.Ping()
}

func copyTable(src, dst *sql.DB, table string) (int, error) {
	rows, err := src.Query(`SELECT * FROM ` + table)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return 0, err
	}
	types, err := rows.ColumnTypes()
	if err != nil {
		return 0, err
	}

	quoted := make([]string, len(cols))
	holders := make([]string, len(cols))
	for i, c := range cols {
		quoted[i] = `"` + c + `"`
		holders[i] = fmt.Sprintf("$%d", i+1)
	}
	insert := fmt.Sprintf(`INSERT INTO %s (%s) VALUES (%s)`, table, strings.Join(quoted, ","), strings.Join(holders, ","))

	count := 0
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return count, err
		}
		for i, v := range vals {
			// lib/pq hands numeric/other columns back as []byte; only real bytea stays binary.
			if b, ok := v.([]byte); ok && types[i].DatabaseTypeName() != "BYTEA" {
				vals[i] = string(b)
			}
		}
		if _, err := dst.Exec(insert, vals...); err != nil {
			return count, err
		}
		count++
	}
	return count, rows.Err()
}

// copyUploads makes sure every photo / PDF that the data points at exists in the
// destination "files" table, taking it from the source database or from ./uploads.
func copyUploads(src, dst *sql.DB) {
	queries := []string{
		`SELECT photo_url FROM players WHERE photo_url LIKE '/uploads/%'`,
		`SELECT logo_url FROM team_info WHERE logo_url LIKE '/uploads/%'`,
		`SELECT pdf_url FROM scorecards WHERE pdf_url LIKE '/uploads/%'`,
	}
	seen := map[string]bool{}
	copied, missing := 0, 0
	for _, q := range queries {
		rows, err := dst.Query(q)
		if err != nil {
			log.Printf("warning: %v", err)
			continue
		}
		var urls []string
		for rows.Next() {
			var u string
			if rows.Scan(&u) == nil {
				urls = append(urls, u)
			}
		}
		rows.Close()

		for _, u := range urls {
			name := filepath.Base(u)
			if seen[name] {
				continue
			}
			seen[name] = true

			var ct string
			var data []byte
			if err := src.QueryRow(`SELECT content_type, data FROM files WHERE name = $1`, name).Scan(&ct, &data); err != nil {
				disk, readErr := os.ReadFile(filepath.Join("uploads", name))
				if readErr != nil {
					missing++
					continue
				}
				data = disk
				ct = "application/octet-stream"
				switch strings.ToLower(filepath.Ext(name)) {
				case ".pdf":
					ct = "application/pdf"
				case ".png":
					ct = "image/png"
				case ".jpg", ".jpeg":
					ct = "image/jpeg"
				case ".webp":
					ct = "image/webp"
				case ".gif":
					ct = "image/gif"
				}
			}
			if _, err := dst.Exec(`INSERT INTO files (name, content_type, data) VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`, name, ct, data); err == nil {
				copied++
			}
		}
	}
	log.Printf("✅ uploads        %d files copied, %d not found on this laptop (those photos/PDFs must be re-uploaded)", copied, missing)
}
