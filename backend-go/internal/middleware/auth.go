package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// RequireAuth protects admin-only routes (create/update/delete). Public GET routes never use
// this. Tokens must be HS256 and signed with JWT_SECRET; sessionValid then checks the token's
// session version, so changing the password logs out every other device at once.
func RequireAuth(jwtSecret string, sessionValid func(adminID int, version string) bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid Authorization header"})
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")

		claims := jwt.MapClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			return
		}
		adminID, okID := claims["admin_id"].(float64)
		version, okSV := claims["sv"].(string)
		if !okID || !okSV || !sessionValid(int(adminID), version) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			return
		}

		c.Set("admin_id", claims["admin_id"])
		c.Set("username", claims["username"])
		c.Next()
	}
}
