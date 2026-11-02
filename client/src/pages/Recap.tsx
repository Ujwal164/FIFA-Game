import { Link } from 'react-router-dom';
import { formatNumber, matchDay, stageName, useApi, winnerOf, type MatchSummary, type TeamSummary, type Tournament } from '../api';
import { ErrorBox, Flag, Loading, MatchLine, Section, Stat } from '../components/ui';
import styles from './Recap.module.css';

/**
 * Orders the knockout games like a real bracket. Start at the final and walk
 * backwards: its teams came from "W101" and "W102" (winners of matches 101
 * and 102), theirs from four quarter-finals, and so on. Each round then lists
 * its games in the order they feed the next one.
 */
function bracketRounds(knockout: MatchSummary[], final: MatchSummary): MatchSummary[][] {
  const byNumber = new Map(knockout.map((m) => [m.matchNo, m]));
  const feeders = (m: MatchSummary) =>
    [m.homeRef, m.awayRef]
      .map((ref) => /^W(\d+)$/.exec(ref)?.[1])
      .map((n) => (n ? byNumber.get(Number(n)) : undefined))
      .filter((x): x is MatchSummary => !!x);

  const rounds = [[final]];
  for (let round = [final]; ; ) {
    round = round.flatMap(feeders);
    if (!round.length) break;
    rounds.unshift(round);
  }
  return rounds;
}

export function Recap() {
  const state = useApi<Tournament>('/api/tournament');
  if (state.status === 'loading') return <Loading what="the tournament" />;
  if (state.status === 'error') return <ErrorBox message={state.message} />;

  const { info, awards, teams, knockout, final } = state.data;
  const flagOf = new Map(teams.map((t) => [t.name, t]));
  const champion = flagOf.get(info.champion);

  return (
    <>
      {final && (
        <section className={styles.hero} aria-labelledby="hero-title">
          <p className={styles.kicker}>
            Final · {matchDay(final)} · {final.city}
          </p>
          <h1 id="hero-title" className={styles.headline}>
            {info.champion} are <em>world champions</em>
          </h1>

          <Link to={`/matches/${final.id}`} className={styles.board}>
            <span className={styles.boardTeam}>
              <Flag url={champion?.flagUrl} name={final.homeTeam} />
              {final.homeTeam}
            </span>
            <span className={`${styles.boardScore} num`}>
              {final.homeScore}
              <span aria-hidden="true">–</span>
              <span className={styles.srOnly}> to </span>
              {final.awayScore}
            </span>
            <span className={`${styles.boardTeam} ${styles.boardAway}`}>
              {final.awayTeam}
              <Flag url={flagOf.get(final.awayTeam)?.flagUrl} name={final.awayTeam} />
            </span>
            <span className={styles.boardNote}>
              {final.extraTime ? 'After extra time' : 'Full time'}
              {final.goals.map((g) => ` · ${g.scorer} ${g.minute}′`)}
            </span>
          </Link>

          <dl className={styles.podium}>
            <div>
              <dt>Runners-up</dt>
              <dd>
                <TeamLink team={flagOf.get(info.runnerUp)} name={info.runnerUp} />
              </dd>
            </div>
            <div>
              <dt>Third place</dt>
              <dd>
                <TeamLink team={flagOf.get(info.thirdPlace)} name={info.thirdPlace} />
              </dd>
            </div>
            <div>
              <dt>Hosts</dt>
              <dd>{info.host.join(', ')}</dd>
            </div>
          </dl>
        </section>
      )}

      <div className={styles.numbers}>
        <Stat value={info.teamsCount} label="teams, the first 48-team World Cup" />
        <Stat value={info.matchesCount} label="matches in 39 days" />
        <Stat value={info.totalGoals} label={`goals, ${(info.totalGoals / info.matchesCount).toFixed(2)} per match`} />
        <Stat value={`${(info.totalAttendance / 1e6).toFixed(2)}M`} label={`fans (${formatNumber(info.totalAttendance)})`} />
      </div>

      <Section eyebrow="Awards" title="The tournament’s best">
        <ul className={styles.awards}>
          {awards.map((a) => (
            <li key={a.title}>
              <span className={styles.awardTitle}>{a.title}</span>
              {a.playerId ? (
                <Link to={`/players/${a.playerId}`} className={styles.awardName}>
                  {a.name}
                </Link>
              ) : (
                <span className={styles.awardName}>{a.name}</span>
              )}
              {a.detail && <span className={styles.awardDetail}>{a.detail}</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Knockout stage" title="Road to New Jersey" aside={<p className={styles.hint}>Scroll sideways · winners in bold</p>}>
        <div className={styles.bracketScroll} tabIndex={0} aria-label="Knockout bracket">
          <ol className={styles.bracket}>
            {(final ? bracketRounds(knockout, final) : []).map((games) => {
              const round = games[0]!.stage;
              return (
                <li key={round} className={styles.round}>
                  <h3>
                    {stageName(round)} <span className="num">{games.length}</span>
                  </h3>
                  <div className={styles.roundGames}>
                    {games.map((m) => (
                      <BracketGame key={m.id} match={m} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        {knockout
          .filter((m) => m.stage === 'thirdPlace')
          .map((m) => (
            <div key={m.id} className={styles.thirdPlace}>
              <MatchLine match={m} meta="Third-place play-off" />
            </div>
          ))}
      </Section>

      <Section eyebrow="Group stage" title="Twelve groups, final tables" aside={<p className={styles.hint}>Top two plus the eight best third-placed teams went through</p>}>
        <div className={styles.groups}>
          {groupTables(teams).map(([group, rows]) => (
            <table key={group} className={styles.group}>
              <caption>Group {group}</caption>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col" title="Played">P</th>
                  <th scope="col" title="Goal difference">GD</th>
                  <th scope="col" title="Points">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.code} className={t.finalPosition <= 32 ? styles.through : undefined}>
                    <th scope="row">
                      <Link to={`/teams/${t.code}`}>
                        <Flag url={t.flagUrl} name={t.name} size="sm" />
                        {t.name}
                      </Link>
                      {t.finalPosition <= 32 && <span className={styles.srOnly}> (reached the knockouts)</span>}
                    </th>
                    <td className="num">{t.group.played}</td>
                    <td className="num">{signed(t.group.gf - t.group.ga)}</td>
                    <td className="num">
                      <strong>{t.group.pts}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </Section>
    </>
  );
}

function TeamLink({ team, name }: { team?: TeamSummary; name: string }) {
  if (!team) return <>{name}</>;
  return (
    <Link to={`/teams/${team.code}`} className={styles.teamLink}>
      <Flag url={team.flagUrl} name={name} size="sm" />
      {name}
    </Link>
  );
}

function BracketGame({ match }: { match: MatchSummary }) {
  const winner = winnerOf(match);
  const row = (team: string, goals: number, pens?: number) => (
    <span className={team === winner ? styles.won : undefined}>
      <span>{team}</span>
      <span className="num">
        {goals}
        {pens !== undefined && <sup>({pens})</sup>}
      </span>
    </span>
  );
  return (
    <Link to={`/matches/${match.id}`} className={styles.game}>
      {row(match.homeTeam, match.homeScore, match.penalties?.home)}
      {row(match.awayTeam, match.awayScore, match.penalties?.away)}
    </Link>
  );
}

function groupTables(teams: TeamSummary[]): [string, TeamSummary[]][] {
  const groups = new Map<string, TeamSummary[]>();
  teams.forEach((t) => groups.set(t.group.group, [...(groups.get(t.group.group) ?? []), t]));
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g, rows]) => [g, rows.sort((a, b) => a.group.position - b.group.position)]);
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
