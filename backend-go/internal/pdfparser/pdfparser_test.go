package pdfparser

import "testing"

const sample = `Ubaidullah v/s AsadAsad need 0 runs to win.Ubaidullah50-10 (11.8)BatsmanRB4s6sSRRaziullahb Sahil10190152.63Faraazb Hamid26291289.66Extras(26)Total50-10 (11.8)BowlerOMRWERAsad3.00822.67Fall of wicketsAsad50-6 (10.3)BatsmanRB4s6sSRAbuzaidb Shaad180012.50`

func TestExtractFixture(t *testing.T) {
	fix := ExtractFixture(sample)
	if fix.SideA != "Ubaidullah" || fix.SideB != "Asad" {
		t.Fatalf("sides = %q v %q", fix.SideA, fix.SideB)
	}
	if fix.ScoreA != "50-10 (11.8)" || fix.ScoreB != "50-6 (10.3)" {
		t.Fatalf("scores = %q / %q", fix.ScoreA, fix.ScoreB)
	}
	if fix.Winner != "Asad" {
		t.Fatalf("winner = %q", fix.Winner)
	}
}

func TestSquadNameDoesNotMatchSubstring(t *testing.T) {
	squad := []string{"Asad", "Faraaz"}
	if _, ok := SquadName("Abuzaid", squad); ok {
		t.Fatal("Abuzaid must not match Asad")
	}
	got, ok := SquadName("faraaz", squad)
	if !ok || got != "Faraaz" {
		t.Fatalf("faraaz match = %q %v", got, ok)
	}
}

func TestOurSide(t *testing.T) {
	fix := ExtractFixture(sample)
	ours, opp, ok := OurSide(fix, []string{"Faraaz", "Asad"})
	if !ok || ours != "Asad" || opp != "Ubaidullah" {
		t.Fatalf("ours=%q opp=%q ok=%v", ours, opp, ok)
	}
}

func TestExtractFixtureMissingVersus(t *testing.T) {
	fix := ExtractFixture("no teams here")
	if _, _, ok := OurSide(fix, []string{"Asad"}); ok {
		t.Fatal("expected no fixture")
	}
}
