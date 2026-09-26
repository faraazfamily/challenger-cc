package pdfparser

import (
	"bytes"
	"regexp"
	"strconv"
	"strings"

	"github.com/ledongthuc/pdf"
)

type BattingRow struct {
	Name       string
	Runs       int
	BallsFaced int
	Fours      int
	Sixes      int
}

type BowlingRow struct {
	Name         string
	Overs        float64
	Maidens      int
	RunsConceded int
	Wickets      int
}

type Fixture struct {
	SideA    string
	SideB    string
	ScoreA   string
	ScoreB   string
	Winner   string
}

type ParseResult struct {
	RawText          string
	SuggestedBatting []BattingRow
	SuggestedBowling []BowlingRow
	Fixture          Fixture
}

var versusRe = regexp.MustCompile(`([A-Za-z][A-Za-z]*)\s+v/s\s+([A-Za-z][A-Za-z]*)`)
var teamScoreRe = regexp.MustCompile(`([A-Za-z]+)(\d+-\d+)\s*\(([^)]+)\)`)
var chaseWinRe = regexp.MustCompile(`([A-Za-z][A-Za-z]*)\s+need\s+0\s+runs`)

// Bowling first: "Name 4.0 0 28 2" or "Name 4 0 28 2 7.00"
var bowlingLine = regexp.MustCompile(`(?i)^([A-Za-z][A-Za-z .'\-]{1,40}?)\s+(\d{1,2}(?:\.\d)?)\s+(\d{1,2})\s+(\d{1,3})\s+(\d{1,2})(?:\s+\d+(?:\.\d+)?){0,3}\s*$`)

// Batting: "Name 45 (32) 4 2" or "Name c Fielder b Bowler 45 32 4 2 140.62"
var battingLine = regexp.MustCompile(`(?i)^([A-Za-z][A-Za-z .'\-]{1,40}?)(?:\s+(?:not out|retired(?: hurt)?|run out|lbw|stumped|st|caught|c|b)\b.*?)?\s+(\d{1,3})\s+\(?(\d{1,3})\)?\s+(\d{1,2})\s+(\d{1,2})(?:\s+\d+(?:\.\d+)?)?\s*$`)

var dismissalCut = regexp.MustCompile(`(?i)\s+(not out|retired(?: hurt)?|run out|lbw|stumped|st|caught|c|b)\b.*$`)

// Parse is a best-effort scorecard reader. Scorer apps (CricHeroes, CricClubs,
// manual scorers) all format PDFs differently, so this does NOT try to be
// 100% automatic — it extracts text and suggests rows that the admin reviews
// and corrects in the UI before anything is saved to the database.
func Parse(fileBytes []byte, size int64) (*ParseResult, error) {
	reader := bytes.NewReader(fileBytes)
	r, err := pdf.NewReader(reader, size)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	for i := 1; i <= r.NumPage(); i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			continue
		}
		buf.WriteString(text)
		buf.WriteString("\n")
	}

	rawText := buf.String()
	battingRows, bowlingRows := parseGlued(rawText)
	if len(battingRows) == 0 && len(bowlingRows) == 0 {
		battingRows, bowlingRows = parseSpacedLines(rawText)
	}

	return &ParseResult{
		RawText: rawText, SuggestedBatting: battingRows, SuggestedBowling: bowlingRows,
		Fixture: ExtractFixture(rawText),
	}, nil
}

// ExtractFixture reads "Ubaidullah v/s Asad" plus each side's total from glued scorecard text.
func ExtractFixture(raw string) Fixture {
	var fix Fixture
	if m := versusRe.FindStringSubmatch(raw); m != nil {
		fix.SideA, fix.SideB = undouble(m[1]), undouble(m[2])
	}
	scores := map[string]string{}
	for _, m := range teamScoreRe.FindAllStringSubmatch(raw, -1) {
		scores[lastCapitalWord(m[1])] = m[2] + " (" + m[3] + ")"
	}
	fix.ScoreA = scores[fix.SideA]
	fix.ScoreB = scores[fix.SideB]
	if m := chaseWinRe.FindStringSubmatch(raw); m != nil {
		fix.Winner = undouble(m[1])
	}
	return fix
}

// undouble turns "AsadAsad" into "Asad" when a PDF glues the team name to itself.
func lastCapitalWord(letters string) string {
	start := 0
	for i := 0; i < len(letters); i++ {
		if letters[i] >= 'A' && letters[i] <= 'Z' {
			start = i
		}
	}
	if start == 0 && (len(letters) == 0 || letters[0] < 'A' || letters[0] > 'Z') {
		return letters
	}
	return letters[start:]
}

func undouble(name string) string {
	if len(name)%2 == 0 {
		half := len(name) / 2
		if name[:half] == name[half:] {
			return name[:half]
		}
	}
	return name
}

// SquadName returns the squad spelling when the scorecard name matches exactly, ignoring case.
func SquadName(name string, squad []string) (string, bool) {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return "", false
	}
	for _, s := range squad {
		if strings.ToLower(strings.TrimSpace(s)) == n {
			return s, true
		}
	}
	return "", false
}

// OurSide is the versus name that is also a squad member. The other name is the opponent.
func OurSide(fix Fixture, squad []string) (ours, opponent string, ok bool) {
	if _, matched := SquadName(fix.SideA, squad); matched {
		return fix.SideA, fix.SideB, fix.SideA != "" && fix.SideB != ""
	}
	if _, matched := SquadName(fix.SideB, squad); matched {
		return fix.SideB, fix.SideA, fix.SideA != "" && fix.SideB != ""
	}
	return "", "", false
}

func parseSpacedLines(rawText string) ([]BattingRow, []BowlingRow) {
	lines := strings.Split(rawText, "\n")
	var battingRows []BattingRow
	var bowlingRows []BowlingRow

	for _, raw := range lines {
		line := strings.Join(strings.Fields(raw), " ")
		if line == "" {
			continue
		}
		if m := bowlingLine.FindStringSubmatch(line); m != nil && strings.Contains(m[2], ".") {
			overs, _ := strconv.ParseFloat(m[2], 64)
			maidens, _ := strconv.Atoi(m[3])
			conceded, _ := strconv.Atoi(m[4])
			wickets, _ := strconv.Atoi(m[5])
			bowlingRows = append(bowlingRows, BowlingRow{
				Name: cleanName(m[1]), Overs: overs, Maidens: maidens, RunsConceded: conceded, Wickets: wickets,
			})
			continue
		}
		if m := battingLine.FindStringSubmatch(line); m != nil {
			runs, _ := strconv.Atoi(m[2])
			balls, _ := strconv.Atoi(m[3])
			fours, _ := strconv.Atoi(m[4])
			sixes, _ := strconv.Atoi(m[5])
			if balls > 0 && runs > balls*8 {
				continue
			}
			battingRows = append(battingRows, BattingRow{
				Name: cleanName(m[1]), Runs: runs, BallsFaced: balls, Fours: fours, Sixes: sixes,
			})
			continue
		}
		if m := bowlingLine.FindStringSubmatch(line); m != nil {
			overs, _ := strconv.ParseFloat(m[2], 64)
			maidens, _ := strconv.Atoi(m[3])
			conceded, _ := strconv.Atoi(m[4])
			wickets, _ := strconv.Atoi(m[5])
			bowlingRows = append(bowlingRows, BowlingRow{
				Name: cleanName(m[1]), Overs: overs, Maidens: maidens, RunsConceded: conceded, Wickets: wickets,
			})
		}
	}
	return battingRows, bowlingRows
}

// CricHeroes-style PDFs (TCPDF) glue each cell to the next: "Raziullahb Sahil10190152.63".
func parseGlued(raw string) ([]BattingRow, []BowlingRow) {
	text := strings.ReplaceAll(raw, "\n", "")
	var batting []BattingRow
	var bowling []BowlingRow
	for _, chunk := range sections(text, "BatsmanRB4s6sSR", []string{"Extras", "BowlerOMRWER"}) {
		batting = append(batting, parseBattingChunk(chunk)...)
	}
	for _, chunk := range sections(text, "BowlerOMRWER", []string{"Fall of wickets", "Powered by", "BatsmanRB4s6sSR"}) {
		bowling = append(bowling, parseBowlingChunk(chunk)...)
	}
	return batting, bowling
}

func sections(s, start string, ends []string) []string {
	var out []string
	rest := s
	for {
		i := strings.Index(rest, start)
		if i < 0 {
			break
		}
		rest = rest[i+len(start):]
		end := len(rest)
		for _, e := range ends {
			if j := strings.Index(rest, e); j >= 0 && j < end {
				end = j
			}
		}
		out = append(out, rest[:end])
		rest = rest[end:]
	}
	return out
}

var batRowRe = regexp.MustCompile(`([A-Z][A-Za-z]+?)(not out|c [A-Z][A-Za-z]+ b [A-Z][A-Za-z]+|lbw b [A-Z][A-Za-z]+|run out|st [A-Z][A-Za-z]+ b [A-Z][A-Za-z]+|b [A-Z][A-Za-z]+)`)

func parseBattingChunk(chunk string) []BattingRow {
	locs := batRowRe.FindAllStringSubmatchIndex(chunk, -1)
	var rows []BattingRow
	for i, loc := range locs {
		name := chunk[loc[2]:loc[3]]
		end := len(chunk)
		if i+1 < len(locs) {
			end = locs[i+1][0]
		}
		tail := chunk[loc[1]:end]
		runs, balls, fours, sixes, ok := bestBatting(tail)
		if !ok || name == "" {
			continue
		}
		rows = append(rows, BattingRow{Name: name, Runs: runs, BallsFaced: balls, Fours: fours, Sixes: sixes})
	}
	return rows
}

var bowlStartRe = regexp.MustCompile(`([A-Z][A-Za-z]+?)(\d{1,2}\.\d)`)
var srRe = regexp.MustCompile(`\d+\.\d{2}`)

func parseBowlingChunk(chunk string) []BowlingRow {
	locs := bowlStartRe.FindAllStringSubmatchIndex(chunk, -1)
	var rows []BowlingRow
	for _, loc := range locs {
		name := chunk[loc[2]:loc[3]]
		overs, _ := strconv.ParseFloat(chunk[loc[4]:loc[5]], 64)
		tail := chunk[loc[1]:]
		maidens, runs, wickets, ok := bestBowling(overs, tail)
		if !ok {
			continue
		}
		rows = append(rows, BowlingRow{Name: name, Overs: overs, Maidens: maidens, RunsConceded: runs, Wickets: wickets})
	}
	return rows
}

func bestBatting(tail string) (runs, balls, fours, sixes int, ok bool) {
	best := 1e9
	for _, pair := range rateSplits(tail) {
		r, b, f, s, good := splitBatting(pair.digits, pair.rate)
		if !good {
			continue
		}
		diff := abs(float64(r)/float64(b)*100 - pair.rate)
		if diff < best {
			best = diff
			runs, balls, fours, sixes, ok = r, b, f, s, true
		}
	}
	return
}

func bestBowling(overs float64, tail string) (maidens, runs, wickets int, ok bool) {
	best := 1e9
	for _, pair := range rateSplits(tail) {
		m, r, w, good := splitBowling(overs, pair.digits, pair.rate)
		if !good {
			continue
		}
		perOver := abs(float64(r) - pair.rate*overs)
		balls := int(overs)*6 + int((overs-float64(int(overs)))*10+0.5)
		perBall := perOver
		if balls > 0 {
			perBall = abs(float64(r) - pair.rate*float64(balls)/6)
		}
		diff := perOver
		if perBall < diff {
			diff = perBall
		}
		if diff < best {
			best = diff
			maidens, runs, wickets, ok = m, r, w, true
		}
	}
	return
}

type digitRate struct {
	digits string
	rate   float64
}

func rateSplits(tail string) []digitRate {
	var out []digitRate
	for i := 0; i+2 < len(tail); i++ {
		if tail[i] != '.' || !isDigit(tail[i+1]) || !isDigit(tail[i+2]) {
			continue
		}
		if i+3 < len(tail) && isDigit(tail[i+3]) {
			continue
		}
		for n := 1; n <= 3 && i-n >= 0; n++ {
			if !isDigit(tail[i-n]) {
				break
			}
			prefix := tail[:i-n]
			if !allDigits(prefix) {
				continue
			}
			rate, err := strconv.ParseFloat(tail[i-n:i+3], 64)
			if err != nil {
				continue
			}
			out = append(out, digitRate{digits: prefix, rate: rate})
		}
		break
	}
	return out
}

func isDigit(b byte) bool { return b >= '0' && b <= '9' }

func allDigits(s string) bool {
	if s == "" {
		return true
	}
	for i := 0; i < len(s); i++ {
		if !isDigit(s[i]) {
			return false
		}
	}
	return true
}

func splitBatting(digits string, sr float64) (runs, balls, fours, sixes int, ok bool) {
	for sixLen := 1; sixLen <= 2; sixLen++ {
		for fourLen := 1; fourLen <= 2; fourLen++ {
			if len(digits) < sixLen+fourLen+2 {
				continue
			}
			sixes, _ = strconv.Atoi(digits[len(digits)-sixLen:])
			fours, _ = strconv.Atoi(digits[len(digits)-sixLen-fourLen : len(digits)-sixLen])
			rest := digits[:len(digits)-sixLen-fourLen]
			for i := 1; i < len(rest); i++ {
				runs, _ = strconv.Atoi(rest[:i])
				balls, _ = strconv.Atoi(rest[i:])
				if balls == 0 || balls > 300 || runs > 400 {
					continue
				}
				if abs(float64(runs)/float64(balls)*100 - sr) < 0.75 {
					return runs, balls, fours, sixes, true
				}
			}
		}
	}
	return 0, 0, 0, 0, false
}

func splitBowling(overs float64, digits string, econ float64) (maidens, runs, wickets int, ok bool) {
	if overs <= 0 {
		return 0, 0, 0, false
	}
	expected := econ * overs
	for mLen := 1; mLen <= 2; mLen++ {
		for wLen := 1; wLen <= 2; wLen++ {
			if len(digits) <= mLen+wLen {
				continue
			}
			maidens, _ = strconv.Atoi(digits[:mLen])
			wickets, _ = strconv.Atoi(digits[len(digits)-wLen:])
			runs, _ = strconv.Atoi(digits[mLen : len(digits)-wLen])
			if maidens > 20 || wickets > 10 || runs > 120 {
				continue
			}
			balls := int(overs)*6 + int((overs-float64(int(overs)))*10+0.5)
			perOver := abs(float64(runs) - expected)
			perBall := 1e9
			if balls > 0 {
				perBall = abs(float64(runs) - econ*float64(balls)/6)
			}
			if perOver < 0.75 || perBall < 0.75 {
				return maidens, runs, wickets, true
			}
		}
	}
	return 0, 0, 0, false
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func cleanName(name string) string {
	name = strings.TrimSpace(dismissalCut.ReplaceAllString(name, ""))
	return strings.Trim(name, " .*")
}
