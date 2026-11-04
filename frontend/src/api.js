const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Photos are served by the API server (/uploads/...), not by the website host,
// so they need the API address in front when the two live on different domains.
export function assetUrl(path) {
  if (path && path.startsWith('/uploads/')) return `${BASE}${path}`;
  return path;
}

function authHeaders() {
  const token = localStorage.getItem('cc_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The admin token lasts a fixed time (see backend auth.go). When the server says it is no
// longer valid, drop it and send the admin to the login page instead of showing raw errors.
const TOKEN_ERRORS = new Set(['Invalid or expired token', 'Missing or invalid Authorization header']);

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && TOKEN_ERRORS.has(data.error) && localStorage.getItem('cc_token')) {
    localStorage.removeItem('cc_token');
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login?expired=1');
    throw new Error('Your login has expired. Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Public pages keep the last answer of each GET in localStorage. They paint that straight away
// and swap in the fresh answer when it arrives, so a slow (cold) server never shows an empty page.
const CACHE = 'cc_cache:';

export function cached(path) {
  try {
    return JSON.parse(localStorage.getItem(CACHE + path));
  } catch {
    return null;
  }
}

function getCached(path) {
  return fetch(`${BASE}${path}`, { headers: authHeaders() }).then(handle).then((data) => {
    try { localStorage.setItem(CACHE + path, JSON.stringify(data)); } catch { /* storage full: just skip the cache */ }
    return data;
  });
}

export const api = {
  // Auth
  login: (username, password) =>
    fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ username, password }),
    }).then(handle),

  memberLogin: (name) =>
    fetch(`${BASE}/api/members/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name }),
    }).then(handle),

  // Team
  getTeam: () => getCached('/api/team'),
  updateTeam: (formData) =>
    fetch(`${BASE}/api/team`, { method: 'PUT', headers: { ...authHeaders() }, body: formData }).then(handle),

  // Players
  getPlayers: () => getCached('/api/players'),
  getPlayer: (id) => getCached(`/api/players/${id}`),
  createPlayer: (formData) =>
    fetch(`${BASE}/api/players`, { method: 'POST', headers: { ...authHeaders() }, body: formData }).then(handle),
  updatePlayer: (id, formData) =>
    fetch(`${BASE}/api/players/${id}`, { method: 'PUT', headers: { ...authHeaders() }, body: formData }).then(handle),
  deletePlayer: (id) =>
    fetch(`${BASE}/api/players/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).then(handle),

  setMatchInRecords: (id, inRecords) =>
    fetch(`${BASE}/api/matches/${id}/in-records`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ in_records: inRecords }),
    }).then(handle),

  // Scorer (admin)
  scorerList: () => fetch(`${BASE}/api/scorer/live`, { headers: authHeaders() }).then(handle),
  scorerHistory: (archived = false) =>
    fetch(`${BASE}/api/scorer/history${archived ? '?archived=1' : ''}`, { headers: authHeaders() }).then(handle),
  scorerGet: (id) => fetch(`${BASE}/api/scorer/live/${id}`, { headers: authHeaders() }).then(handle),
  scorerCreate: (payload) =>
    fetch(`${BASE}/api/scorer/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  scorerSave: (id, payload) =>
    fetch(`${BASE}/api/scorer/live/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  scorerArchive: (id, archived) =>
    fetch(`${BASE}/api/scorer/live/${id}/archive`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ archived }),
    }).then(handle),
  scorerDelete: (id) =>
    fetch(`${BASE}/api/scorer/live/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).then(handle),
  scorerFinish: (id, formData) =>
    fetch(`${BASE}/api/scorer/live/${id}/finish`, { method: 'POST', headers: { ...authHeaders() }, body: formData }).then(handle),

  // Tournaments
  getTournaments: () => fetch(`${BASE}/api/tournaments`, { headers: authHeaders() }).then(handle),
  createTournament: (payload) =>
    fetch(`${BASE}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  updateTournament: (id, payload) =>
    fetch(`${BASE}/api/tournaments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteTournament: (id) =>
    fetch(`${BASE}/api/tournaments/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).then(handle),

  // Matches
  getMatches: () => getCached('/api/matches'),
  getMatch: (id) => getCached(`/api/matches/${id}`),
  createMatch: (payload) =>
    fetch(`${BASE}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  updateMatch: (id, payload) =>
    fetch(`${BASE}/api/matches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteMatch: (id) =>
    fetch(`${BASE}/api/matches/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).then(handle),
  saveMatchStats: (id, payload) =>
    fetch(`${BASE}/api/matches/${id}/stats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),

  // Scorecards
  importScorecard: (formData) =>
    fetch(`${BASE}/api/scorecards/upload`, { method: 'POST', headers: { ...authHeaders() }, body: formData }).then(handle),
  uploadScorecard: (matchId, formData) =>
    fetch(`${BASE}/api/scorecards/${matchId}/upload`, { method: 'POST', headers: { ...authHeaders() }, body: formData }).then(handle),

  // Stats
  getLeaderboard: () => getCached('/api/stats/leaderboard'),
  getTeamRecord: () => getCached('/api/stats/team-record'),
};

// Reads the expiry inside the token, so an expired login goes to the login page right away.
export function isLoggedIn() {
  const token = localStorage.getItem('cc_token');
  if (!token) return false;
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (exp && exp * 1000 <= Date.now()) return false;
  } catch { /* not a JWT we can read: let the server decide */ }
  return true;
}
