package server

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------- CORS

// The site's own Vercel address and its preview deployments.
var vercelOrigin = regexp.MustCompile(`^https://challenger-cc(-[a-z0-9-]+)?\.vercel\.app$`)

// CORSMiddleware lets only the club's own website call this API from a browser. CLIENT_URL
// (comma separated) adds more origins, such as a custom domain or the local dev server.
func CORSMiddleware(clientURL string) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, o := range strings.Split(clientURL, ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			allowed[o] = true
		}
	}
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("Vary", "Origin")
		if origin := c.GetHeader("Origin"); allowed[origin] || vercelOrigin.MatchString(origin) {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			h.Set("Access-Control-Max-Age", "600")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// ---------------------------------------------------------------- headers and limits

const (
	maxJSONBody      = 4 << 20  // a Test match's full ball-by-ball state fits well inside this
	maxMultipartBody = 40 << 20 // intro clip / PDF plus the form fields
)

// SecurityHeaders hardens every response and caps how much a client can send. The API only
// serves JSON and uploaded media, so the CSP forbids everything; "sandbox" also means an
// uploaded file opened directly can never run script on this origin.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; sandbox")
		h.Set("Cross-Origin-Resource-Policy", "cross-origin") // photos and clips load on the Vercel site

		limit := int64(maxJSONBody)
		if strings.HasPrefix(c.ContentType(), "multipart/") {
			limit = maxMultipartBody
		}
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		}
		c.Next()
	}
}

var numericID = regexp.MustCompile(`^[0-9]{1,9}$`)

// ValidIDs turns a malformed :id (letters, SQL, a number too big for INT) into a clean 404
// before it reaches the database.
func ValidIDs() gin.HandlerFunc {
	return func(c *gin.Context) {
		for _, p := range c.Params {
			if (p.Key == "id" || p.Key == "matchId") && !numericID.MatchString(p.Value) {
				c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "Not found"})
				return
			}
		}
		c.Next()
	}
}

// ---------------------------------------------------------------- login throttling

const (
	maxFailsPerIP   = 8
	maxFailsPerUser = 10
	failWindow      = 15 * time.Minute
)

type failCount struct {
	n     int
	first time.Time
}

// loginGuard counts failed logins in memory. The per-username count is what stops a real
// attack (it cannot be dodged by changing IP); the per-IP count stops one client trying many
// usernames. It resets on a server restart, which is fine on this scale.
type loginGuard struct {
	mu    sync.Mutex
	fails map[string]*failCount
}

var guard = &loginGuard{fails: map[string]*failCount{}}

func guardKeys(ip, username string) (string, string) {
	return "ip:" + ip, "user:" + strings.ToLower(strings.TrimSpace(username))
}

func (g *loginGuard) blocked(ip, username string) bool {
	ipKey, userKey := guardKeys(ip, username)
	g.mu.Lock()
	defer g.mu.Unlock()
	over := func(key string, max int) bool {
		f := g.fails[key]
		if f == nil {
			return false
		}
		if time.Since(f.first) > failWindow {
			delete(g.fails, key)
			return false
		}
		return f.n >= max
	}
	return over(ipKey, maxFailsPerIP) || over(userKey, maxFailsPerUser)
}

func (g *loginGuard) fail(ip, username string) {
	ipKey, userKey := guardKeys(ip, username)
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, key := range []string{ipKey, userKey} {
		f := g.fails[key]
		if f == nil || time.Since(f.first) > failWindow {
			g.fails[key] = &failCount{n: 1, first: time.Now()}
		} else {
			f.n++
		}
	}
	if len(g.fails) > 10000 { // an attacker cycling usernames must not grow this forever
		g.fails = map[string]*failCount{}
	}
}

func (g *loginGuard) clear(ip, username string) {
	ipKey, userKey := guardKeys(ip, username)
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.fails, ipKey)
	delete(g.fails, userKey)
}

// ---------------------------------------------------------------- sessions

// sessionVersion goes into every admin token. It changes whenever the username or password
// changes, so all older tokens stop working at once (a stolen token dies with a password change).
func sessionVersion(username, passwordHash string) string {
	sum := sha256.Sum256([]byte(username + "\x00" + passwordHash))
	return hex.EncodeToString(sum[:8])
}

// SessionValid is the check the auth middleware runs on each admin request.
func (s *Server) SessionValid(adminID int, version string) bool {
	var id int
	var username, hash string
	if err := s.DB.QueryRow(`SELECT * FROM fn_admin_by_id($1)`, adminID).Scan(&id, &username, &hash); err != nil {
		return false
	}
	return sessionVersion(username, hash) == version
}

// ---------------------------------------------------------------- startup

// InsecureConfigWarnings lists settings that weaken the site, for the startup log.
func InsecureConfigWarnings() []string {
	var out []string
	if len(os.Getenv("JWT_SECRET")) < 32 {
		out = append(out, "JWT_SECRET is shorter than 32 characters: use a long random value")
	}
	return out
}
