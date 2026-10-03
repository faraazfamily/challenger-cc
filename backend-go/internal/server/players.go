package server

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// scanner is satisfied by both *sql.Row and *sql.Rows, so scanPlayerRow
// can be reused for a single row (QueryRow) or while looping (Query).
type scanner interface {
	Scan(dest ...interface{}) error
}

func scanPlayerRow(row scanner) (gin.H, error) {
	var id int
	var name, role string
	var battingStyle, bowlingStyle, bio, fieldingNotes, photoURL sql.NullString
	var jerseyNumber sql.NullInt32
	var isCaptain, isViceCaptain, isWicketkeeper bool
	var joinedDate sql.NullTime

	err := row.Scan(&id, &name, &role, &battingStyle, &bowlingStyle, &jerseyNumber,
		&bio, &fieldingNotes, &photoURL, &isCaptain, &isViceCaptain, &isWicketkeeper, &joinedDate)
	if err != nil {
		return nil, err
	}

	return gin.H{
		"id": id, "name": name, "role": role,
		"batting_style":   nullableString(battingStyle),
		"bowling_style":   nullableString(bowlingStyle),
		"jersey_number":   nullableInt(jerseyNumber),
		"bio":             nullableString(bio),
		"fielding_notes":  nullableString(fieldingNotes),
		"photo_url":       nullableString(photoURL),
		"is_captain":       isCaptain,
		"is_vice_captain":  isViceCaptain,
		"is_wicketkeeper":  isWicketkeeper,
		"joined_date":     nullableDate(joinedDate),
	}, nil
}

const playerColumns = `id, name, role, batting_style, bowling_style, jersey_number, bio, fielding_notes, photo_url, is_captain, is_vice_captain, is_wicketkeeper, joined_date`

// GET /api/players
func (s *Server) GetPlayers(c *gin.Context) {
	rows, err := s.DB.Query(`SELECT ` + playerColumns + ` FROM players ORDER BY is_captain DESC, is_vice_captain DESC, name ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch players"})
		return
	}
	defer rows.Close()

	players := []gin.H{}
	for rows.Next() {
		p, err := scanPlayerRow(rows)
		if err != nil {
			continue
		}
		players = append(players, p)
	}
	c.JSON(http.StatusOK, players)
}

// GET /api/players/:id — includes career batting/bowling stats computed live
func (s *Server) GetPlayer(c *gin.Context) {
	id := c.Param("id")

	row := s.DB.QueryRow(`SELECT `+playerColumns+` FROM players WHERE id = $1`, id)
	player, err := scanPlayerRow(row)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch player"})
		return
	}

	if err := s.attachCareer(player, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch career stats"})
		return
	}
	c.JSON(http.StatusOK, player)
}

// attachCareer adds the same live career batting/bowling block used by GET /api/players/:id.
func (s *Server) attachCareer(player gin.H, id interface{}) error {
	var innings, totalBalls, timesOut, totalFours, totalSixes, totalRuns, highestScore int
	err := s.DB.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(runs),0), COALESCE(SUM(balls_faced),0), COALESCE(MAX(runs),0),
		       COUNT(*) FILTER (WHERE is_out = true), COALESCE(SUM(fours),0), COALESCE(SUM(sixes),0)
		FROM batting_stats WHERE player_id = $1
		  AND match_id IN (SELECT id FROM matches WHERE in_records)`, id,
	).Scan(&innings, &totalRuns, &totalBalls, &highestScore, &timesOut, &totalFours, &totalSixes)
	if err != nil {
		return err
	}

	battingAverage := "0.00"
	if timesOut > 0 {
		battingAverage = strconv.FormatFloat(float64(totalRuns)/float64(timesOut), 'f', 2, 64)
	} else if totalRuns > 0 {
		battingAverage = "N/A (Not Out)"
	}
	strikeRate := "0.00"
	if totalBalls > 0 {
		strikeRate = strconv.FormatFloat((float64(totalRuns)/float64(totalBalls))*100, 'f', 2, 64)
	}

	var inningsBowled, totalWickets, totalMaidens int
	var totalOvers, totalRunsConceded float64
	err = s.DB.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(overs),0), COALESCE(SUM(runs_conceded),0),
		       COALESCE(SUM(wickets),0), COALESCE(SUM(maidens),0)
		FROM bowling_stats WHERE player_id = $1
		  AND match_id IN (SELECT id FROM matches WHERE in_records)`, id,
	).Scan(&inningsBowled, &totalOvers, &totalRunsConceded, &totalWickets, &totalMaidens)
	if err != nil {
		return err
	}

	bowlingAverage := "N/A"
	if totalWickets > 0 {
		bowlingAverage = strconv.FormatFloat(totalRunsConceded/float64(totalWickets), 'f', 2, 64)
	}
	economy := "0.00"
	if totalOvers > 0 {
		economy = strconv.FormatFloat(totalRunsConceded/totalOvers, 'f', 2, 64)
	}

	player["career"] = gin.H{
		"batting": gin.H{
			"innings": innings, "runs": totalRuns, "highestScore": highestScore,
			"average": battingAverage, "strikeRate": strikeRate,
			"fours": totalFours, "sixes": totalSixes,
		},
		"bowling": gin.H{
			"innings": inningsBowled, "overs": totalOvers, "wickets": totalWickets,
			"average": bowlingAverage, "economy": economy, "maidens": totalMaidens,
		},
	}
	return nil
}

// saveUploadedPhoto stores a multipart "photo" field in the database, if present.
// Returns ("", false, nil) when no file was uploaded (not an error — photo is optional).
// Returns an error when a file WAS uploaded but couldn't be saved, so the caller
// can show the admin why it failed instead of silently dropping the photo.
func saveUploadedPhoto(c *gin.Context, s *Server, field string) (string, bool, error) {
	file, err := c.FormFile(field)
	if err != nil {
		return "", false, nil
	}
	url, err := s.storeImage(file)
	if err != nil {
		return "", false, err
	}
	return url, true, nil
}

// otherLeader reports who already holds captain or vice-captain, excluding the player being edited.
func (s *Server) otherLeader(wantCaptain, wantVice bool, exceptID string) (string, error) {
	if !wantCaptain && !wantVice {
		return "", nil
	}
	query := `SELECT name FROM players WHERE is_vice_captain = true`
	message := "%s is already vice-captain. Remove that role first."
	if wantCaptain {
		query = `SELECT name FROM players WHERE is_captain = true`
		message = "%s is already captain. Remove that role first."
	}
	var name string
	var err error
	if exceptID != "" {
		err = s.DB.QueryRow(query+` AND id <> $1 LIMIT 1`, exceptID).Scan(&name)
	} else {
		err = s.DB.QueryRow(query + ` LIMIT 1`).Scan(&name)
	}
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(message, name), nil
}

func (s *Server) otherKeeper(want bool, exceptID string) (string, error) {
	if !want {
		return "", nil
	}
	query := `SELECT name FROM players WHERE is_wicketkeeper = true`
	var name string
	var err error
	if exceptID != "" {
		err = s.DB.QueryRow(query+` AND id <> $1 LIMIT 1`, exceptID).Scan(&name)
	} else {
		err = s.DB.QueryRow(query + ` LIMIT 1`).Scan(&name)
	}
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s is already wicketkeeper. Remove that role first.", name), nil
}

// POST /api/players (admin only, multipart form + optional "photo" file)
func (s *Server) CreatePlayer(c *gin.Context) {
	name := c.PostForm("name")
	role := c.PostForm("role")
	if name == "" || role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name and role are required"})
		return
	}

	var jerseyNumber *int
	if v := c.PostForm("jersey_number"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			jerseyNumber = &n
		}
	}

	isCaptain := c.PostForm("is_captain") == "true"
	isVice := c.PostForm("is_vice_captain") == "true"
	if isCaptain && isVice {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A player cannot be both captain and vice-captain."})
		return
	}
	isKeeper := c.PostForm("is_wicketkeeper") == "true"
	if nameTaken, err := s.otherLeader(isCaptain, isVice, ""); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check squad leadership"})
		return
	} else if nameTaken != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": nameTaken})
		return
	}
	if keeper, err := s.otherKeeper(isKeeper, ""); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check wicketkeeper"})
		return
	} else if keeper != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": keeper})
		return
	}

	photoURL, _, photoErr := saveUploadedPhoto(c, s, "photo")
	if photoErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": photoErr.Error()})
		return
	}

	var joinedParam interface{}
	if v := c.PostForm("joined_date"); v != "" {
		joinedParam = v
	}

	row := s.DB.QueryRow(
		`INSERT INTO players (name, role, batting_style, bowling_style, jersey_number, bio, fielding_notes, photo_url, is_captain, is_vice_captain, is_wicketkeeper, joined_date)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::date, CURRENT_DATE))
		 RETURNING `+playerColumns,
		name, role, nullify(c.PostForm("batting_style")), nullify(c.PostForm("bowling_style")),
		jerseyNumber, nullify(c.PostForm("bio")), nullify(c.PostForm("fielding_notes")), nullify(photoURL),
		isCaptain, isVice, isKeeper, joinedParam,
	)
	player, err := scanPlayerRow(row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create player: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, player)
}

// PUT /api/players/:id (admin only)
func (s *Server) UpdatePlayer(c *gin.Context) {
	id := c.Param("id")
	name := c.PostForm("name")
	role := c.PostForm("role")

	var jerseyNumber *int
	if v := c.PostForm("jersey_number"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			jerseyNumber = &n
		}
	}

	isCaptain := c.PostForm("is_captain") == "true"
	isVice := c.PostForm("is_vice_captain") == "true"
	if isCaptain && isVice {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A player cannot be both captain and vice-captain."})
		return
	}
	isKeeper := c.PostForm("is_wicketkeeper") == "true"
	if nameTaken, err := s.otherLeader(isCaptain, isVice, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check squad leadership"})
		return
	} else if nameTaken != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": nameTaken})
		return
	}
	if keeper, err := s.otherKeeper(isKeeper, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check wicketkeeper"})
		return
	} else if keeper != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": keeper})
		return
	}

	// Keep the existing photo unless a new one was uploaded this request.
	photoURL := c.PostForm("existing_photo_url")
	if uploaded, ok, photoErr := saveUploadedPhoto(c, s, "photo"); photoErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": photoErr.Error()})
		return
	} else if ok {
		photoURL = uploaded
	}

	var joinedParam interface{}
	if v := c.PostForm("joined_date"); v != "" {
		joinedParam = v
	}

	row := s.DB.QueryRow(
		`UPDATE players SET name=$1, role=$2, batting_style=$3, bowling_style=$4, jersey_number=$5,
		 bio=$6, fielding_notes=$7, photo_url=$8, is_captain=$9, is_vice_captain=$10, is_wicketkeeper=$11, joined_date=COALESCE($12::date, joined_date)
		 WHERE id=$13
		 RETURNING `+playerColumns,
		name, role, nullify(c.PostForm("batting_style")), nullify(c.PostForm("bowling_style")),
		jerseyNumber, nullify(c.PostForm("bio")), nullify(c.PostForm("fielding_notes")), nullify(photoURL),
		isCaptain, isVice, isKeeper, joinedParam, id,
	)
	player, err := scanPlayerRow(row)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update player"})
		return
	}
	c.JSON(http.StatusOK, player)
}

// DELETE /api/players/:id (admin only)
func (s *Server) DeletePlayer(c *gin.Context) {
	res, err := s.DB.Exec(`DELETE FROM players WHERE id = $1`, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete player"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
