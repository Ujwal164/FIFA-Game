import { useEffect, useId, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { SearchHit } from '../api';
import styles from './Layout.module.css';

export function Layout() {
  const { pathname } = useLocation();

  // Start each new page at the top, like a normal website would.
  // Braces matter: newer browsers make scrollTo() return a Promise, and an
  // effect may only return a cleanup function -- returning the Promise crashes React.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.wordmark} aria-label="Pulse '26, tournament recap">
            Pulse <span>’26</span>
          </Link>
          <span className={styles.tagline}>World Cup recap · USA · Canada · Mexico</span>
          <PlayerSearch />
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        Data: Zafronix World Cup API, saved locally for personal use. Positions come from official lineups, not
        tracking data.
      </footer>
    </div>
  );
}

function PlayerSearch() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const navigate = useNavigate();
  const listId = useId();

  // Wait until typing pauses for 150 ms before asking the server.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/players?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then(setHits)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const go = (hit: SearchHit) => {
    setQuery('');
    setHits([]);
    navigate(`/players/${hit.id}`);
  };

  return (
    <form
      className={styles.search}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (hits[0]) go(hits[0]);
      }}
    >
      <label htmlFor="player-search" className={styles.srOnly}>
        Find a player
      </label>
      <input
        id="player-search"
        type="search"
        placeholder="Find a player…"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-controls={listId}
      />
      {hits.length > 0 && (
        <ul id={listId} className={styles.results}>
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" onClick={() => go(hit)}>
                <strong>{hit.name}</strong>
                <span>
                  {hit.code} · {hit.position}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
