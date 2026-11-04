import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { matchDay, stageName, useApi, type HistoryEntry, type PlayerDetail } from '../api';
import { Pitch, type PitchMarker } from '../components/Pitch';
import { ErrorBox, Flag, Loading, ResultChip, Section, Stat } from '../components/ui';
import styles from './Player.module.css';

const ROLE_NAMES: Record<string, string> = {
  GK: 'goalkeeper', G: 'goalkeeper',
  RB: 'right-back', LB: 'left-back', CB: 'centre-back', RWB: 'right wing-back', LWB: 'left wing-back',
  DM: 'defensive midfield', CM: 'central midfield', AM: 'attacking midfield', RM: 'right midfield', LM: 'left midfield',
  RW: 'right wing', LW: 'left wing', RF: 'right forward', LF: 'left forward', CF: 'centre-forward',
  DF: 'defence', D: 'defence', MF: 'midfield', M: 'midfield', FW: 'attack', F: 'attack',
};
const roleName = (code: string | null) => (code ? (ROLE_NAMES[code] ?? code) : 'unknown position');

export function Player() {
  const { id } = useParams();
  const state = useApi<PlayerDetail>(`/api/players/${id}`);
  // Which match row is hovered/focused, so its dot lights up on the pitch.
  const [active, setActive] = useState<string | null>(null);

  if (state.status === 'loading') return <Loading what="the player" />;
  if (state.status === 'error') return <ErrorBox message={state.message} />;
  const p = state.data;

  const played = p.history.filter((h) => h.role !== 'unused');
  const starts = p.history.filter((h) => h.role === 'started' && h.slot);
  const totals = {
    goals: p.history.reduce((n, h) => n + h.goals.length, 0),
    assists: p.history.reduce((n, h) => n + h.assists.length, 0),
    cards: p.history.reduce((n, h) => n + h.cards.length, 0),
  };

  return (
    <>
      <header className={styles.head}>
        <span className={`${styles.shirt} num`} aria-label={p.jersey ? `Shirt number ${p.jersey}` : undefined}>
          {p.jersey ?? '–'}
        </span>
        <div>
          <p className={styles.kicker}>
            <Link to={`/teams/${p.team.code}`} className={styles.teamLink}>
              <Flag url={p.team.flagUrl} name={p.team.name} size="sm" />
              {p.team.name}
            </Link>
            {' · '}
            {p.club ?? 'No club listed'} · Age {p.age}
            {p.captain && ' · Captain'}
          </p>
          <h1>{p.name}</h1>
        </div>
      </header>

      <div className={styles.numbers}>
        <Stat value={played.length} label={`appearances (${p.history.length} team matches)`} />
        <Stat value={starts.length} label="starts" />
        <Stat value={totals.goals} label="goals" />
        <Stat value={totals.assists} label="assists" />
        <Stat value={totals.cards} label="cards" />
      </div>

      <div className={styles.layout}>
        <Section eyebrow="Position history" title="Where they started">
          {starts.length ? (
            <figure className={styles.figure}>
              <Pitch
                orientation="vertical"
                markers={positionMarkers(starts, active)}
                label={`Pitch map of ${p.name}'s starting positions`}
              />
              <figcaption>
                One dot per position; bigger dots mean more starts. {p.team.name} attack upwards.
                Hover a match to find it on the pitch.
              </figcaption>
            </figure>
          ) : (
            <p className={styles.empty}>{p.name} didn’t start a match, so there’s no position to plot.</p>
          )}
        </Section>

        <Section eyebrow={`${p.history.length} matches`} title="Match by match">
          <ol className={styles.history}>
            {p.history.map((h) => (
              <HistoryRow key={h.match.id} entry={h} team={p.team.name} active={active === h.match.id} onFocus={setActive} />
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}

/** Groups starts by role so 5 starts at right-back become one big "RB" dot. */
function positionMarkers(starts: HistoryEntry[], active: string | null): PitchMarker[] {
  const groups = new Map<string, HistoryEntry[]>();
  starts.forEach((h) => {
    const key = `${h.position}-${Math.round(h.slot!.x / 10)}-${Math.round(h.slot!.y / 10)}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  });

  const markers: PitchMarker[] = [...groups.entries()].map(([key, list]) => {
    const first = list[0]!;
    return {
      key,
      x: first.slot!.x,
      y: first.slot!.y,
      label: first.position ?? '?',
      caption: `${list.length} start${list.length > 1 ? 's' : ''}`,
      size: Math.min(1.8, 1 + (list.length - 1) * 0.18),
      approximate: !first.slot!.exact,
      title: `${roleName(first.position)}: ${list.map((h) => opponentOf(h)).join(', ')}`,
    };
  });

  const focused = starts.find((h) => h.match.id === active);
  if (focused) {
    markers.push({
      key: 'active',
      x: focused.slot!.x,
      y: focused.slot!.y,
      label: focused.position ?? '?',
      highlight: true,
      size: 1.1,
      title: `v ${opponentOf(focused)}`,
    });
  }
  return markers;
}

function HistoryRow({
  entry: h,
  team,
  active,
  onFocus,
}: {
  entry: HistoryEntry;
  team: string;
  active: boolean;
  onFocus: (id: string | null) => void;
}) {
  const role =
    h.role === 'started'
      ? `Started at ${roleName(h.position)}${h.formation ? ` in a ${h.formation}` : ''}${h.offMinute ? `, off ${h.offMinute}′` : ''}`
      : h.role === 'sub'
        ? h.onMinute
          ? `Came on ${h.onMinute}′${h.offMinute ? `, off ${h.offMinute}′` : ''}`
          : 'Came off the bench'
        : 'Didn’t play';

  return (
    <li
      className={`${styles.row} ${h.role === 'unused' ? styles.unused : ''} ${active ? styles.active : ''}`}
      onMouseEnter={() => onFocus(h.match.id)}
      onMouseLeave={() => onFocus(null)}
    >
      <ResultChip match={h.match} team={team} />
      <div className={styles.rowMain}>
        <span className={styles.rowMeta}>
          {stageName(h.match.stage)} · {matchDay(h.match)}
        </span>
        <Link
          to={`/matches/${h.match.id}`}
          className={styles.opponent}
          onFocus={() => onFocus(h.match.id)}
          onBlur={() => onFocus(null)}
        >
          v {opponentOf(h)}{' '}
          <span className="num">
            {h.side === 'home' ? `${h.match.homeScore}–${h.match.awayScore}` : `${h.match.awayScore}–${h.match.homeScore}`}
          </span>
        </Link>
        <span className={styles.role}>{role}</span>
      </div>
      <ul className={styles.events} aria-label="Contributions">
        {h.goals.map((m) => (
          <li key={`g${m}`} className={styles.goal}>
            Goal {m}′
          </li>
        ))}
        {h.assists.map((m) => (
          <li key={`a${m}`} className={styles.assist}>
            Assist {m}′
          </li>
        ))}
        {h.cards.map((c) => (
          <li key={`c${c.minute}`} className={c.color === 'red' ? styles.red : styles.yellow}>
            {c.color === 'red' ? 'Red' : 'Yellow'} {c.minute}′
          </li>
        ))}
      </ul>
    </li>
  );
}

const opponentOf = (h: HistoryEntry) => (h.side === 'home' ? h.match.awayTeam : h.match.homeTeam);
