// Package migrations embeds schema.sql into the API binary so the server can
// bring any database (laptop, Neon, fresh or old) up to date on startup.
package migrations

import (
	"database/sql"
	_ "embed"
)

//go:embed schema.sql
var schema string

// Apply runs schema.sql. It is idempotent: it only creates tables / columns /
// indexes that are missing and never deletes or rewrites existing rows.
func Apply(d *sql.DB) error {
	_, err := d.Exec(schema)
	return err
}
