import { jsPDF } from 'jspdf';
import { summarize, matchResult, matchTitle, situation } from './engine';

const NAVY = [18, 20, 28];
const SKY = [59, 182, 220];
const INK = [26, 26, 26];
const MUTED = [107, 114, 128];

// Builds the scorecard PDF (same navy + sky-blue look as the website).
export function buildPdf(match) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const title = matchTitle(match);
  doc.setProperties({ title: `Scorecard of ${title}`, subject: `${title} match summary`, author: 'The Challengers', creator: 'The Challengers Scorer' });
  const W = 210;
  const M = 12;
  let y = 0;

  const room = (h) => { if (y + h > 284) { doc.addPage(); y = 14; } };
  const text = (t, x, opts = {}) => doc.text(String(t), x, y, opts);
  const bandRow = (label, right) => {
    room(9);
    doc.setFillColor(...NAVY); doc.rect(M, y - 5, W - 2 * M, 7.5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    text(label, M + 2); text(right, W - M - 2, { align: 'right' });
    y += 6.5;
  };
  const head = (cols, xs) => {
    room(7);
    doc.setFillColor(...SKY); doc.rect(M, y - 4.2, W - 2 * M, 5.6, 'F');
    doc.setTextColor(7, 16, 24); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    cols.forEach((c, k) => text(c, xs[k], k === 0 || k === 1 ? {} : { align: 'right' }));
    y += 5.2;
  };
  const line = (cells, xs, bold) => {
    room(6);
    doc.setTextColor(...INK); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9);
    cells.forEach((c, k) => text(c, xs[k], k === 0 || (k === 1 && cells.length === 7) ? {} : { align: 'right' }));
    doc.setDrawColor(225, 225, 225); doc.line(M, y + 1.4, W - M, y + 1.4);
    y += 5.6;
  };

  // ---- title block
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 34, 'F');
  doc.setFillColor(...SKY); doc.rect(0, 34, W, 1.6, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('times', 'bold'); doc.setFontSize(20);
  y = 15; text(title, W / 2, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(200, 225, 240);
  y = 22; text(`${match.config.format}${match.config.overs ? ` · ${match.config.overs} overs` : ''} · ${match.meta.date}${match.meta.venue ? ` · ${match.meta.venue}` : ''}`, W / 2, { align: 'center' });
  const res = matchResult(match);
  y = 29; doc.setFont('helvetica', 'bold'); doc.setTextColor(...SKY);
  text(res.done ? res.text : situation(match) || 'Match in progress', W / 2, { align: 'center' });
  y = 46;

  match.innings.forEach((inn, i) => {
    const s = summarize(match, i);
    let nth = 0;
    for (let k = 0; k <= i; k++) if (match.innings[k].team === inn.team) nth += 1;
    const two = (match.config.inningsPerSide || 1) === 2;
    bandRow(`${s.teamName}${two ? (nth === 1 ? ' - 1st innings' : ' - 2nd innings') : ''}`, `${s.runs}/${s.wickets}${s.declared ? ' d' : ''} (${s.overs} ov)`);

    const bx = [M + 2, 62, 140, 152, 164, 176, 198];
    head(['Batter', 'How out', 'R', 'B', '4s', '6s', 'SR'], bx);
    s.batters.forEach((b) => {
      const how = b.status === 'out' || b.status === 'retired' ? b.how : 'not out';
      line([b.name, doc.splitTextToSize(how, 70)[0], b.runs, b.balls, b.fours, b.sixes, b.sr.toFixed(2)], bx, false);
    });
    const e = s.extras;
    line(['Extras', `(${s.extrasTotal}) b ${e.b}, lb ${e.lb}, wd ${e.wd}, nb ${e.nb}, pen ${e.pen}`.slice(0, 60), '', '', '', '', ''], bx, false);
    line(['Total', `${s.runs}/${s.wickets} in ${s.overs} overs (RR ${s.crr.toFixed(2)})`, '', '', '', '', ''], bx, true);
    if (s.didNotBat.length && s.batters.length) {
      room(6); doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
      text(`Did not bat: ${s.didNotBat.map((p) => p.name).join(', ')}`, M + 2); y += 5;
    }
    y += 2;

    const ox = [M + 2, 110, 124, 138, 152, 166, 180, 198];
    head(['Bowler', 'O', 'M', 'R', 'W', 'Wd', 'Nb', 'ER'], [ox[0], ox[1], ox[2], ox[3], ox[4], ox[5], ox[6], ox[7]]);
    s.bowlers.forEach((b) => {
      room(6);
      doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      text(b.name, ox[0]);
      [b.overs, b.maidens, b.runs, b.wk, b.wd, b.nb, b.econ.toFixed(2)].forEach((v, k) => text(v, ox[k + 1], { align: 'right' }));
      doc.setDrawColor(225, 225, 225); doc.line(M, y + 1.4, W - M, y + 1.4);
      y += 5.6;
    });

    if (s.fow.length) {
      y += 1; room(10);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK);
      text('Fall of wickets', M + 2); y += 4.2;
      doc.setFont('helvetica', 'normal');
      const fowText = s.fow.map((f) => `${f.score}/${f.wkt} (${f.name}, ${f.over})`).join('   ');
      doc.splitTextToSize(fowText, W - 2 * M - 4).forEach((ln) => { room(5); text(ln, M + 2); y += 4.2; });
    }
    y += 7;
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`The Challengers Cricket Club  -  page ${p} of ${pages}`, W / 2, 291, { align: 'center' });
  }
  return doc;
}
