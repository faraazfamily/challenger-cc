import { useEffect, useState } from 'react';
import { api } from '../api';

const BLANK = { name: '', year: '', start_date: '', end_date: '' };

function toPayload(form) {
  return {
    name: form.name,
    year: form.year === '' ? null : Number(form.year),
    start_date: form.start_date || '',
    end_date: form.end_date || '',
  };
}

export default function AdminTournaments() {
  const [tournaments, setTournaments] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nameFilter, setNameFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [error, setError] = useState('');

  function load() { api.getTournaments().then(setTournaments).catch(() => {}); }
  useEffect(load, []);

  function startAdd() {
    setEditingId(null);
    setForm(BLANK);
    setShowForm(true);
    setError('');
  }

  function startEdit(t) {
    setEditingId(t.id);
    setForm({
      name: t.name || '',
      year: t.year || '',
      start_date: t.start_date || '',
      end_date: t.end_date || '',
    });
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await api.updateTournament(editingId, toPayload(form));
      else await api.createTournament(toPayload(form));
      setForm(BLANK);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this tournament?')) return;
    await api.deleteTournament(id);
    load();
  }

  const years = [...new Set(tournaments.map((t) => t.year).filter(Boolean))].sort((a, b) => b - a);
  const filtered = tournaments.filter((t) => {
    const nameOk = t.name.toLowerCase().includes(nameFilter.trim().toLowerCase());
    const yearOk = !yearFilter || String(t.year) === String(yearFilter);
    return nameOk && yearOk;
  });

  return (
    <div>
      <div className="filter-bar">
        <div className="form-group">
          <label>Name</label>
          <input placeholder="Search by name" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Year</label>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" type="button" onClick={startAdd}>Add</button>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 28 }}>
          <h3>{editingId ? 'Edit Tournament' : 'Add Tournament'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Year</label>
                <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Start Date</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" type="submit">{editingId ? 'Save' : 'Add Tournament'}</button>
            <button type="button" className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
          </form>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">{tournaments.length === 0 ? 'No tournaments yet. Use Add to create one.' : 'No tournaments match this filter.'}</div>
      ) : (
        <div className="tournament-grid">
          {filtered.map((t) => (
            <div className="card tournament-card" key={t.id}>
              <h3>{t.name}</h3>
              <div style={{ color: '#0b6e8c', fontWeight: 700, marginBottom: 8 }}>{t.year || 'Year not set'}</div>
              <div style={{ fontSize: '0.88rem', color: '#6b7280', marginBottom: 14 }}>
                {t.start_date || '—'} → {t.end_date || '—'}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>Edit</button>{' '}
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
