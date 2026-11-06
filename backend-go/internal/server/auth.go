package server

import (
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Compared against when the username does not exist, so a wrong username takes as long as a
// wrong password and login timing does not reveal which usernames are real.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("no-such-admin-placeholder"), 12) // same cost as real hashes, or the time difference gives usernames away

const tooManyAttempts = "Too many failed attempts. Try again in 15 minutes."

func (s *Server) issueToken(id int, username, passwordHash string) (string, error) {
	claims := jwt.MapClaims{
		"admin_id": id,
		"username": username,
		"sv":       sessionVersion(username, passwordHash),
		"exp":      time.Now().Add(30 * 24 * time.Hour).Unix(), // long enough that it rarely runs out mid-match
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.JWTSecret))
}

// POST /api/auth/login
func (s *Server) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username and password are required"})
		return
	}
	ip := c.ClientIP()
	if guard.blocked(ip, req.Username) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": tooManyAttempts})
		return
	}

	var id int
	var passwordHash string
	err := s.DB.QueryRow(`SELECT * FROM fn_admin_by_username($1)`, req.Username).Scan(&id, &passwordHash)
	if err != nil {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		guard.fail(ip, req.Username)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		guard.fail(ip, req.Username)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	guard.clear(ip, req.Username)

	signed, err := s.issueToken(id, req.Username, passwordHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": signed, "username": req.Username})
}

var validUsername = regexp.MustCompile(`^[A-Za-z0-9._-]{3,50}$`)

// passwordProblem returns why a new password is not acceptable, or "".
func passwordProblem(password, username string) string {
	if len(password) < 8 {
		return "Password must be at least 8 characters."
	}
	if len(password) > 72 { // bcrypt only uses the first 72 bytes
		return "Password must be at most 72 characters."
	}
	var lower, upper, digit bool
	for _, r := range password {
		lower = lower || unicode.IsLower(r)
		upper = upper || unicode.IsUpper(r)
		digit = digit || unicode.IsDigit(r)
	}
	if !lower || !upper || !digit {
		return "Password needs a capital letter, a small letter and a number."
	}
	if strings.EqualFold(password, username) {
		return "Password cannot be the same as the username."
	}
	return ""
}

// PUT /api/auth/credentials (admin only) — change the login name and/or password. The current
// password is always required, so a stolen token alone cannot take over the account. Every
// older token stops working; the response carries a fresh one for this device.
func (s *Server) ChangeCredentials(c *gin.Context) {
	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewUsername     string `json:"new_username"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Your current password is required"})
		return
	}
	adminID, ok := c.Get("admin_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
		return
	}
	idFloat, _ := adminID.(float64)
	id := int(idFloat)

	var dbID int
	var username, hash string
	if err := s.DB.QueryRow(`SELECT * FROM fn_admin_by_id($1)`, id).Scan(&dbID, &username, &hash); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
		return
	}
	ip := c.ClientIP()
	if guard.blocked(ip, username) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": tooManyAttempts})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.CurrentPassword)); err != nil {
		guard.fail(ip, username)
		// 403, not 401: the session is fine, and the site logs out on a 401
		c.JSON(http.StatusForbidden, gin.H{"error": "Your current password is not correct."})
		return
	}

	newUsername := strings.TrimSpace(req.NewUsername)
	if newUsername == "" {
		newUsername = username
	}
	if !validUsername.MatchString(newUsername) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username must be 3-50 letters, numbers, dots, dashes or underscores."})
		return
	}
	newHash := hash
	if req.NewPassword != "" {
		if problem := passwordProblem(req.NewPassword, newUsername); problem != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": problem})
			return
		}
		generated, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save the new password"})
			return
		}
		newHash = string(generated)
	}
	if newUsername == username && newHash == hash {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nothing to change."})
		return
	}

	var affected int
	if err := s.DB.QueryRow(`CALL sp_admin_set_credentials($1, $2, $3, 0)`, id, newUsername, newHash).Scan(&affected); err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": "That username is already taken."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save the changes"})
		return
	}
	guard.clear(ip, username)

	signed, err := s.issueToken(id, newUsername, newHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Saved, but please log in again"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": signed, "username": newUsername})
}
