import { Link, useParams } from 'react-router-dom';
import { matchDay, stageName, useApi, type SquadRow, type TeamDetail } from '../api';
import { ErrorBox, Flag, Loading, MatchLine, ResultChip, Section } from '../components/ui';
import styles from './Team.module.css';

const LINES: [SquadRow['position'], string][] = [
  ['GK', 'Goalkeepers'],
  ['DF', 'Defenders'],
  ['MF', 'Midfielders'],
  ['FW', 'Forwards'],
];

export function Team() {
  const { code } = useParams();
  const state = useApi<TeamDetail>(`/api/teams/${code}`);
  if (state.status === 'loading') return <Loading what="the team" />;
  if (state.status === 'error') return <ErrorBox message={state.message} />;
  const t = state.data;

  const lastRound = t.knockoutPath.at(-1);
  const finish = !lastRound
    ? 'Out in the group stage'
    : lastRound.stage === 'final'
      ? lastRound.won
        ? 'World champions'
        : 'Runners-up'
      : lastRound.stage === 'thirdPlace'
        ? lastRound.won
          ? 'Third place'
          : 'Fourth place'
        : `Out in the ${stageName(lastRound.stage).toLowerCase()}`;

  return (
    <>
      <header className={styles.head}>
        <Flag url={t.flagUrl} name={t.name} size="lg" />
        <div>
          <p className={styles.kicker}>
            {t.confederation} · Group {t.group.group} · Coach {t.coach}
          </p>
          <h1>{t.name}</h1>
          <p className={styles.finish}>{finish}</p>
        </div>
      </header>

      <Section eyebrow={`${t.matches.length} matches`} title="Their tournament">
        <ol className={styles.matches}>
          {t.matches.map((m) => (
            <li key={m.id}>
              <ResultChip match={m} team={t.name} />
              <MatchLine match={m} meta={`${stageName(m.stage)} · ${matchDay(m)}`} />
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow={`${t.squad.length} players`} title="The squad" aside={<p className={styles.hint}>Click a name to see where they played</p>}>
        <div className={styles.tableScroll}>
          <table className={styles.squad}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Club</th>
                <th scope="col">Age</th>
                <th scope="col" title="Matches started">Starts</th>
                <th scope="col" title="Came on as a substitute">Sub</th>
                <th scope="col">Goals</th>
              </tr>
            </thead>
            {LINES.map(([pos, label]) => (
              <tbody key={pos}>
                <tr className={styles.lineRow}>
                  <th colSpan={7} scope="rowgroup">
                    {label}
                  </th>
                </tr>
                {t.squad
                  .filter((p) => p.position === pos)
                  .sort((a, b) => b.starts - a.starts || b.subApps - a.subApps)
                  .map((p) => (
                    <tr key={p.id} className={p.starts + p.subApps === 0 ? styles.unused : undefined}>
                      <td className="num">{p.jersey ?? '–'}</td>
                      <th scope="row">
                        <Link to={`/players/${p.id}`}>{p.name}</Link>
                        {p.captain && <abbr title="Captain"> (C)</abbr>}
                      </th>
                      <td>{p.club ?? '–'}</td>
                      <td className="num">{p.age}</td>
                      <td className="num">{p.starts}</td>
                      <td className="num">{p.subApps}</td>
                      <td className="num">{p.goals || '–'}</td>
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      </Section>
    </>
  );
}
