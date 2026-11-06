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
	var battingStyle, bowlingStyle, bio, fieldingNotes, photoURL, introVideoURL sql.NullString
	var jerseyNumber sql.NullInt32
	var isCaptain, isViceCaptain, isWicketkeeper bool
	var joinedDate sql.NullTime

	err := row.Scan(&id, &name, &role, &battingStyle, &bowlingStyle, &jerseyNumber,
		&bio, &fieldingNotes, &photoURL, &isCaptain, &isViceCaptain, &isWicketkeeper, &joinedDate, &introVideoURL)
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
		"intro_video_url": nullableString(introVideoURL),
		"is_captain":      isCaptain,
		"is_vice_captain": isViceCaptain,
		"is_wicketkeeper": isWicketkeeper,
		"joined_date":     nullableDate(joinedDate),
	}, nil
}

// GET /api/players
func (s *Server) GetPlayers(c *gin.Context) {
	rows, err := s.DB.Query(`SELECT * FROM fn_players()`)
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

	row := s.DB.QueryRow(`SELECT * FROM fn_player($1)`, id)
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
	err := s.DB.QueryRow(`SELECT * FROM fn_player_career_batting($1)`, id).Scan(&innings, &totalRuns, &totalBalls, &highestScore, &timesOut, &totalFours, &totalSixes)
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
	err = s.DB.QueryRow(`SELECT * FROM fn_player_career_bowling($1)`, id).Scan(&inningsBowled, &totalOvers, &totalRunsConceded, &totalWickets, &totalMaidens)
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

// saveUploadedVideo is saveUploadedPhoto for the optional intro clip.
func saveUploadedVideo(c *gin.Context, s *Server, field string) (string, bool, error) {
	file, err := c.FormFile(field)
	if err != nil {
		return "", false, nil
	}
	url, err := s.storeVideo(file)
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
	role, message := "vice", "%s is already vice-captain. Remove that role first."
	if wantCaptain {
		role, message = "captain", "%s is already captain. Remove that role first."
	}
	name, err := s.roleHolder(role, exceptID)
	if err != nil || name == "" {
		return "", err
	}
	return fmt.Sprintf(message, name), nil
}

func (s *Server) otherKeeper(want bool, exceptID string) (string, error) {
	if !want {
		return "", nil
	}
	name, err := s.roleHolder("keeper", exceptID)
	if err != nil || name == "" {
		return "", err
	}
	return fmt.Sprintf("%s is already wicketkeeper. Remove that role first.", name), nil
}

// roleHolder asks the database who holds a role ("captain" / "vice" / "keeper"); "" when nobody.
func (s *Server) roleHolder(role, exceptID string) (string, error) {
	var name sql.NullString
	if err := s.DB.QueryRow(`SELECT fn_player_role_holder($1, $2)`, role, nullify(exceptID)).Scan(&name); err != nil {
		return "", err
	}
	return name.String, nil
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
	videoURL, _, videoErr := saveUploadedVideo(c, s, "intro_video")
	if videoErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": videoErr.Error()})
		return
	}

	var joinedParam interface{}
	if v := c.PostForm("joined_date"); v != "" {
		joinedParam = v
	}

	var id int
	err := s.DB.QueryRow(
		`CALL sp_player_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NULL)`,
		name, role, nullify(c.PostForm("batting_style")), nullify(c.PostForm("bowling_style")),
		jerseyNumber, nullify(c.PostForm("bio")), nullify(c.PostForm("fielding_notes")), nullify(photoURL),
		isCaptain, isVice, isKeeper, joinedParam, nullify(videoURL),
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create player"})
		return
	}
	player, err := scanPlayerRow(s.DB.QueryRow(`SELECT * FROM fn_player($1)`, id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read the new player"})
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
	videoURL := c.PostForm("existing_intro_video_url")
	if uploaded, ok, videoErr := saveUploadedVideo(c, s, "intro_video"); videoErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": videoErr.Error()})
		return
	} else if ok {
		videoURL = uploaded
	}

	var joinedParam interface{}
	if v := c.PostForm("joined_date"); v != "" {
		joinedParam = v
	}

	var affected int
	err := s.DB.QueryRow(
		`CALL sp_player_update($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, 0)`,
		id, name, role, nullify(c.PostForm("batting_style")), nullify(c.PostForm("bowling_style")),
		jerseyNumber, nullify(c.PostForm("bio")), nullify(c.PostForm("fielding_notes")), nullify(photoURL),
		isCaptain, isVice, isKeeper, joinedParam, nullify(videoURL),
	).Scan(&affected)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update player"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}
	player, err := scanPlayerRow(s.DB.QueryRow(`SELECT * FROM fn_player($1)`, id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read the player"})
		return
	}
	c.JSON(http.StatusOK, player)
}

// DELETE /api/players/:id (admin only)
func (s *Server) DeletePlayer(c *gin.Context) {
	var n int
	if err := s.DB.QueryRow(`CALL sp_player_delete($1, 0)`, c.Param("id")).Scan(&n); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete player"})
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
