import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { EmptyState } from '../components/Feedback';

export default function NotFound() {
  return (
    <div className="container section">
      <EmptyState icon={Compass} title="Page not found">
        That link goes nowhere. Try the squad, matches or leaderboard.
      </EmptyState>
      <p style={{ textAlign: 'center', marginTop: 16 }}>
        <Link to="/" className="btn btn-primary btn-icon"><Home size={16} aria-hidden="true" /> Back to home</Link>
      </p>
    </div>
  );
}
