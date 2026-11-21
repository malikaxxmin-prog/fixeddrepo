import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function MyIdeas() {
  const [ideas, setIdeas] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/ideas/mine')
      .then((data) => setIdeas(data.ideas))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function togglePublish(idea) {
    try {
      const status = idea.status === 'published' ? 'draft' : 'published';
      await api(`/ideas/${idea.id}/status`, { method: 'PATCH', body: { status } });
      setIdeas((list) => list.map((i) => (i.id === idea.id ? { ...i, status } : i)));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <p>Loading your ideas…</p>;

  return (
    <section>
      <h1>My ideas</h1>
      <Link to="/ideas/new">+ Submit new idea</Link>
      {error && <p role="alert">{error}</p>}
      {ideas.length === 0 && !error && <p>You have not submitted any ideas yet.</p>}

      {ideas.map((idea) => (
        <article key={idea.id}>
          <h3>{idea.title} <small>({idea.status})</small></h3>
          <p>{idea.industry} · {idea.funding_needed.toLocaleString()} {idea.currency} · {idea.idea_stage.replace('_', ' ')}</p>
          <p>{idea.interest_count} interested investor{idea.interest_count === 1 ? '' : 's'}</p>
          <Link to={`/ideas/${idea.id}/edit`}>Edit</Link>
          {idea.status !== 'closed' && (
            <button onClick={() => togglePublish(idea)}>
              {idea.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
