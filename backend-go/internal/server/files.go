package server

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	maxImageBytes = 5 << 20  // player photos / team logo
	maxPDFBytes   = 10 << 20 // scorecard PDFs
	maxVideoBytes = 15 << 20 // player intro clips (a few seconds of MP4)
)

// Uploaded files are stored inside Postgres (table "files") instead of on disk.
// Free hosts such as Render wipe the local disk on every restart/redeploy, which
// would make every player photo disappear. The public URL stays "/uploads/<name>".

// A file extension from the client is only kept if it looks like one ("a.b/c" would not).
var safeExt = regexp.MustCompile(`^\.[a-z0-9]{1,5}$`)

func (s *Server) storeFile(ext, contentType string, data []byte) (string, error) {
	ext = strings.ToLower(ext)
	if !safeExt.MatchString(ext) {
		ext = ""
	}
	name := strconv.FormatInt(time.Now().UnixNano(), 10) + ext
	if _, err := s.DB.Exec(`CALL sp_file_insert($1, $2, $3, false)`, name, contentType, data); err != nil {
		log.Printf("storeFile: %v", err)
		return "", errors.New("could not save the file")
	}
	return "/uploads/" + name, nil
}

// imageKind works out what a photo really is from its first bytes. The file name and the type
// the browser reports are both chosen by the sender, so neither is trusted. SVG is left out on
// purpose: it can carry scripts.
func imageKind(data []byte) (contentType, ext string, ok bool) {
	switch http.DetectContentType(data) {
	case "image/jpeg":
		return "image/jpeg", ".jpg", true
	case "image/png":
		return "image/png", ".png", true
	case "image/gif":
		return "image/gif", ".gif", true
	case "image/webp":
		return "image/webp", ".webp", true
	case "image/bmp":
		return "image/bmp", ".bmp", true
	}
	// Formats Go's sniffer does not know: iPhone HEIC photos and TIFF.
	if len(data) >= 12 && string(data[4:8]) == "ftyp" {
		switch string(data[8:12]) {
		case "heic", "heix", "hevc", "heif", "mif1", "msf1":
			return "image/heic", ".heic", true
		}
	}
	if len(data) >= 4 && (string(data[:4]) == "II*\x00" || string(data[:4]) == "MM\x00*") {
		return "image/tiff", ".tiff", true
	}
	return "", "", false
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

	contentType, ext, ok := imageKind(data)
	if !ok {
		return "", errors.New("that file doesn't look like a photo")
	}
	// Phone photos are huge; keep a sensible size (see images.go).
	if shrunk, ct, ok := shrinkImage(data, maxUploadSide); ok {
		return s.storeFile(".jpg", ct, shrunk)
	}
	return s.storeFile(ext, contentType, data)
}

// storePDF saves an already-read scorecard PDF.
func (s *Server) storePDF(data []byte) (string, error) {
	if len(data) > maxPDFBytes {
		return "", fmt.Errorf("PDF is too large (max %d MB)", maxPDFBytes>>20)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		return "", errors.New("that file doesn't look like a PDF")
	}
	return s.storeFile(".pdf", "application/pdf", data)
}

// videoExtTypes are the clip formats a phone or an AI video tool exports.
var videoExtTypes = map[string]string{".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime"}

// looksLikeVideo checks the first bytes: an MP4/MOV box header, or the WebM signature.
func looksLikeVideo(data []byte) bool {
	if len(data) < 12 {
		return false
	}
	if bytes.HasPrefix(data, []byte{0x1A, 0x45, 0xDF, 0xA3}) {
		return true
	}
	switch string(data[4:8]) {
	case "ftyp", "moov", "mdat", "wide", "free", "skip":
		return true
	}
	return false
}

// storeVideo saves a short player intro clip (the "walks in and folds arms" moment).
func (s *Server) storeVideo(fh *multipart.FileHeader) (string, error) {
	if fh.Size > maxVideoBytes {
		return "", fmt.Errorf("clip is too large (max %d MB): keep it to a few seconds", maxVideoBytes>>20)
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	contentType, ok := videoExtTypes[ext]
	if !ok {
		return "", errors.New("the intro clip must be an MP4, WebM or MOV video")
	}
	f, err := fh.Open()
	if err != nil {
		return "", err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxVideoBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxVideoBytes {
		return "", fmt.Errorf("clip is too large (max %d MB): keep it to a few seconds", maxVideoBytes>>20)
	}
	if !looksLikeVideo(data) {
		return "", errors.New("the intro clip must be an MP4, WebM or MOV video")
	}
	return s.storeFile(ext, contentType, data)
}

// Every stored name is digits, dashes and an extension: nothing with a path in it can match.
var uploadName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9]{1,5})?$`)

// ServeUpload handles GET /uploads/:name.
func (s *Server) ServeUpload(c *gin.Context) {
	name := c.Param("name")
	if !uploadName.MatchString(name) {
		c.Status(http.StatusNotFound)
		return
	}

	var contentType string
	var data []byte
	err := s.DB.QueryRow(`SELECT * FROM fn_file($1)`, name).Scan(&contentType, &data)
	if err == nil {
		// ?w=200 etc.: a small JPEG for avatars and cards instead of the full photo
		if w, _ := strconv.Atoi(c.Query("w")); allowedWidths[w] && strings.HasPrefix(contentType, "image/") && !isVariantName(name) {
			if small, ct, vErr := s.resizedVariant(name, w, data); vErr == nil {
				data, contentType = small, ct
			}
		}
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Type", contentType)
		// ServeContent answers Range requests, which iPhone Safari needs to play a video.
		http.ServeContent(c.Writer, c.Request, name, time.Time{}, bytes.NewReader(data))
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
