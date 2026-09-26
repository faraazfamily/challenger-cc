package server

import (
	"database/sql"
	"os"
)

// Small helpers to convert Postgres NULL-able scan targets into clean JSON
// values (nil instead of {"Valid": false, "String": ""}).

func nullableString(s sql.NullString) interface{} {
	if s.Valid {
		return s.String
	}
	return nil
}

func nullableInt(i sql.NullInt32) interface{} {
	if i.Valid {
		return i.Int32
	}
	return nil
}

func nullableDate(t sql.NullTime) interface{} {
	if t.Valid {
		return t.Time.Format("2006-01-02")
	}
	return nil
}

// nullify converts an empty form/JSON string into a real SQL NULL on insert/update.
func nullify(s string) interface{} {
	if s == "" || s == "null" || s == "undefined" {
		return nil
	}
	return s
}

func writeFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0644)
}
