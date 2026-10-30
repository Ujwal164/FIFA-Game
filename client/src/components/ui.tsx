// Small shared pieces used by several pages.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { scoreNote, type MatchSummary, winnerOf } from '../api';
import styles from './ui.module.css';

export function Flag({ url, name, size = 'md' }: { url?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  if (!url) return null;
  // Decorative: the team name is always printed next to it.
  return <img className={`${styles.flag} ${styles[size]}`} src={url} alt="" title={name} loading="lazy" />;
}

export function Section({ eyebrow, title, children, aside }: { eyebrow?: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <div>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <div className={styles.status} role="status">
      <span className={styles.ball} aria-hidden="true" />
      Loading {what}…
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className={`${styles.status} ${styles.error}`} role="alert">
      <strong>Something went wrong.</strong> {message}
    </div>
  );
}

/** W / D / L chip from one team's point of view. Shape + letter, not colour alone. */
export function ResultChip({ match, team }: { match: MatchSummary; team: string }) {
  const winner = winnerOf(match);
  const result = winner === null ? 'D' : winner === team ? 'W' : 'L';
  const label = { W: 'Won', D: 'Drew', L: 'Lost' }[result];
  return (
    <span className={`${styles.chip} ${styles[`chip${result}`]}`} title={label}>
      <span aria-hidden="true">{result}</span>
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}

/** One fixture as a compact, clickable row. */
export function MatchLine({ match, meta }: { match: MatchSummary; meta?: ReactNode }) {
  const winner = winnerOf(match);
  const note = scoreNote(match);
  return (
    <Link to={`/matches/${match.id}`} className={styles.matchLine}>
      {meta && <span className={styles.matchMeta}>{meta}</span>}
      <span className={`${styles.team} ${winner === match.homeTeam ? styles.winner : ''}`}>{match.homeTeam}</span>
      <span className={`${styles.score} num`}>
        {match.homeScore}–{match.awayScore}
      </span>
      <span className={`${styles.team} ${styles.away} ${winner === match.awayTeam ? styles.winner : ''}`}>
        {match.awayTeam}
      </span>
      {note && <span className={styles.note}>{note}</span>}
    </Link>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} num`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
