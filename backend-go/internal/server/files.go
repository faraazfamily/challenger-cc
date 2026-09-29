package server

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	maxImageBytes = 5 << 20  // player photos / team logo
	maxPDFBytes   = 10 << 20 // scorecard PDFs
)

// Uploaded files are stored inside Postgres (table "files") instead of on disk.
// Free hosts such as Render wipe the local disk on every restart/redeploy, which
// would make every player photo disappear. The public URL stays "/uploads/<name>".

func (s *Server) storeFile(ext, contentType string, data []byte) (string, error) {
	name := strconv.FormatInt(time.Now().UnixNano(), 10) + strings.ToLower(ext)
	if _, err := s.DB.Exec(
		`INSERT INTO files (name, content_type, data) VALUES ($1,$2,$3)`,
		name, contentType, data,
	); err != nil {
		return "", err
	}
	return "/uploads/" + name, nil
}

// imageExtTypes lets us recognize photo formats that Go's built-in sniffer
// (http.DetectContentType) doesn't know, like the HEIC/HEIF photos an iPhone
// saves by default.
var imageExtTypes = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
	".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
	".heic": "image/heic", ".heif": "image/heif",
	".tif": "image/tiff", ".tiff": "image/tiff",
}

// storeImage validates that the multipart file really is a photo and saves it.
// It accepts any common photo format up to maxImageBytes.
func (s *Server) storeImage(fh *multipart.FileHeader) (string, error) {
	if fh.Size > maxImageBytes {
		return "", fmt.Errorf("image is too large (max %d MB)", maxImageBytes>>20)
	}
	f, err := fh.Open()
	if err != nil {
		return "", err
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, maxImageBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxImageBytes {
		return "", fmt.Errorf("image is too large (max %d MB)", maxImageBytes>>20)
	}

	contentType := http.DetectContentType(data)
	if !strings.HasPrefix(contentType, "image/") {
		// Sniffing only recognizes a handful of formats — fall back to the
		// file extension, then to whatever the browser reported.
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if guessed, ok := imageExtTypes[ext]; ok {
			contentType = guessed
		} else if browserType := fh.Header.Get("Content-Type"); strings.HasPrefix(browserType, "image/") {
			contentType = browserType
		} else {
			return "", errors.New("that file doesn't look like a photo")
		}
	}
	return s.storeFile(filepath.Ext(fh.Filename), contentType, data)
}

// storePDF saves an already-read scorecard PDF.
func (s *Server) storePDF(data []byte) (string, error) {
	if len(data) > maxPDFBytes {
		return "", fmt.Errorf("PDF is too large (max %d MB)", maxPDFBytes>>20)
	}
	return s.storeFile(".pdf", "application/pdf", data)
}

// ServeUpload handles GET /uploads/:name.
func (s *Server) ServeUpload(c *gin.Context) {
	name := filepath.Base(c.Param("name"))

	var contentType string
	var data []byte
	err := s.DB.QueryRow(`SELECT content_type, data FROM files WHERE name = $1`, name).Scan(&contentType, &data)
	if err == nil {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(http.StatusOK, contentType, data)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		c.Status(http.StatusInternalServerError)
		return
	}

	// Local-development fallback: files saved on disk before uploads moved into the database.
	path := filepath.Join(s.UploadDir, name)
	if _, statErr := os.Stat(path); statErr == nil {
		c.File(path)
		return
	}
	c.Status(http.StatusNotFound)
}
