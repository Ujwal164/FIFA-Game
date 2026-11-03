import { Link, useParams } from 'react-router-dom';
import { formatNumber, kickoff, scoreNote, stageName, useApi, type MatchDetail, type MatchSide } from '../api';
import { Pitch, type PitchMarker } from '../components/Pitch';
import { ErrorBox, Flag, Loading, Section } from '../components/ui';
import styles from './Match.module.css';

export function Match() {
  const { id } = useParams();
  const state = useApi<MatchDetail>(`/api/matches/${id}`);
  if (state.status === 'loading') return <Loading what="the match" />;
  if (state.status === 'error') return <ErrorBox message={state.message} />;
  const m = state.data;

  const markers: PitchMarker[] = (['home', 'away'] as const).flatMap((side) =>
    m[side].lineup
      .filter((p) => p.slot)
      .map((p) => ({
        key: `${side}-${p.number}`,
        x: p.slot!.x,
        y: p.slot!.y,
        side,
        label: String(p.number),
        caption: surname(p.player),
        href: p.id ? `/players/${p.id}` : undefined,
        title: `${p.player} · ${p.position}${p.captain ? ' · captain' : ''}`,
        approximate: !p.slot!.exact,
      })),
  );
  const approximate = markers.some((mk) => mk.approximate);
  const note = scoreNote(m);

  return (
    <>
      <p className={styles.kicker}>
        Match {m.matchNo} · {stageName(m.stage)} · {kickoff(m.kickoffUtc)} your time
      </p>

      <div className={styles.board}>
        <TeamName side={m.home} name={m.homeTeam} />
        <div className={styles.score}>
          <span className="num">
            {m.homeScore}–{m.awayScore}
          </span>
          {note && <small>{note}</small>}
        </div>
        <TeamName side={m.away} name={m.awayTeam} away />
      </div>

      <dl className={styles.facts}>
        <Fact label="Stadium" value={`${m.stadium}, ${m.city}`} />
        <Fact label="Attendance" value={formatNumber(m.attendance)} />
        {m.referee && <Fact label="Referee" value={m.referee} />}
        <Fact label="Formations" value={`${m.home.formation ?? '?'} v ${m.away.formation ?? '?'}`} />
      </dl>

      <Section eyebrow="Starting line-ups" title="Who stood where">
        <figure className={styles.pitchFigure}>
          <div className={styles.pitchLegend} aria-hidden="true">
            <span>
              <i className={styles.keyHome} /> {m.homeTeam} →
            </span>
            <span>
              ← {m.awayTeam} <i className={styles.keyAway} />
            </span>
          </div>
          <Pitch orientation="horizontal" markers={markers} label={`Starting positions of ${m.homeTeam} and ${m.awayTeam}`} />
          <figcaption>
            Tap a player for their tournament history.
            {approximate && ' Dashed dots are placed from the formation, because this line-up only lists broad positions.'}
          </figcaption>
        </figure>
      </Section>

      <div className={styles.twoCol}>
        <Section eyebrow="Timeline" title="Key moments">
          <Timeline match={m} />
        </Section>
        <Section eyebrow="Numbers" title="Match stats">
          <StatBars home={m.home} away={m.away} />
        </Section>
      </div>
    </>
  );
}

function TeamName({ side, name, away }: { side: MatchSide; name: string; away?: boolean }) {
  return (
    <div className={`${styles.team} ${away ? styles.away : ''}`}>
      <Flag url={side.team?.flagUrl} name={name} size="lg" />
      <h1>{side.team ? <Link to={`/teams/${side.team.code}`}>{name}</Link> : name}</h1>
      {side.manager && <span className={styles.manager}>Coach: {side.manager}</span>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type Moment = { minute: number; side: 'home' | 'away'; kind: 'goal' | 'yellow' | 'red' | 'sub'; text: string; sub?: string };

function Timeline({ match }: { match: MatchDetail }) {
  const moments: Moment[] = [
    ...match.goals.map((g) => ({
      minute: g.minute,
      side: g.team,
      kind: 'goal' as const,
      text: g.scorer + (g.type === 'own_goal' ? ' (own goal)' : g.type === 'penalty' ? ' (pen)' : ''),
      sub: g.assist ? `Assist: ${g.assist}` : undefined,
    })),
    ...match.cards.map((c) => ({ minute: c.minute, side: c.team, kind: c.color, text: c.player })),
    ...match.substitutions.map((s) => ({ minute: s.minute, side: s.team, kind: 'sub' as const, text: s.on, sub: `for ${s.off}` })),
  ].sort((a, b) => a.minute - b.minute);

  if (!moments.length) return <p className={styles.empty}>No events recorded for this match.</p>;

  const kindLabel = { goal: 'Goal', yellow: 'Yellow card', red: 'Red card', sub: 'Substitution' };
  return (
    <ol className={styles.timeline}>
      {moments.map((mo, i) => (
        <li key={i} className={`${styles.moment} ${mo.side === 'away' ? styles.momentAway : ''}`}>
          <span className={`${styles.minute} num`}>{mo.minute}′</span>
          <span className={`${styles.icon} ${styles[mo.kind]}`} title={kindLabel[mo.kind]} aria-label={kindLabel[mo.kind]} />
          <span className={styles.momentText}>
            <strong>{mo.text}</strong>
            {mo.sub && <small>{mo.sub}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const STAT_ROWS: [key: string, label: string, suffix?: string][] = [
  ['possessionPct', 'Possession', '%'],
  ['expectedGoals', 'Expected goals (xG)'],
  ['shotsTotal', 'Shots'],
  ['shotsOnGoal', 'On target'],
  ['passesTotal', 'Passes'],
  ['corners', 'Corners'],
  ['fouls', 'Fouls'],
];

function StatBars({ home, away }: { home: MatchSide; away: MatchSide }) {
  const rows = STAT_ROWS.filter(([key]) => home.stats?.[key] != null && away.stats?.[key] != null);
  if (!rows.length) return <p className={styles.empty}>No stats recorded for this match.</p>;
  return (
    <dl className={styles.stats}>
      {rows.map(([key, label, suffix = '']) => {
        const h = Number(home.stats![key]);
        const a = Number(away.stats![key]);
        const share = h + a === 0 ? 50 : (h / (h + a)) * 100;
        return (
          <div key={key} className={styles.statRow}>
            <dt>{label}</dt>
            <dd className="num">
              <span>
                {h}
                {suffix}
              </span>
              <span className={styles.bar} aria-hidden="true">
                <span style={{ width: `${share}%` }} />
              </span>
              <span>
                {a}
                {suffix}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

const surname = (name: string) => name.split(' ').slice(-1)[0] ?? name;
