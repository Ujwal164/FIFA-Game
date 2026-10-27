import express from 'express';
import { loadSnapshot, matchSummary, playerHistory, playerId, teamSummary } from './data.js';
import { lineupSlots } from './pitch.js';
import { findPlayer, normalizeName } from './names.js';
import type { SquadPlayer, Team } from './zafronix-types.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

// Load once. The tournament is over, so the data never changes while we run.
const snapshot = loadSnapshot();
const { tournament, matches } = snapshot;

const teamsByCode = new Map(tournament.teams.map((t) => [t.code, t]));
const teamsByName = new Map(tournament.teams.map((t) => [t.name, t]));
const players = new Map<string, { team: Team; player: SquadPlayer }>();
tournament.teams.forEach((team) =>
  team.squad.forEach((player) => players.set(playerId(team, player), { team, player })),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, matches: matches.length, players: players.size });
});

// Award winners come as bare names; link them to player pages when the name is unambiguous.
const allPlayers = [...players.entries()].map(([id, { player }]) => ({ id, name: player.name }));
const award = (title: string, name: string, detail?: string) => ({
  title,
  name,
  detail: detail ?? null,
  playerId: findPlayer(name, allPlayers, (p) => p.name)?.id ?? null,
});

app.get('/api/tournament', (_req, res) => {
  const final = matches.find((m) => m.stage === 'final');
  const info = tournament.tournament;
  res.json({
    info,
    awards: [
      award('Best player', info.bestPlayer),
      award('Top scorer', info.topScorer.player, `${info.topScorer.goals} goals`),
      award('Best young player', info.bestYoungPlayer),
      award('Best goalkeeper', info.bestGoalkeeper),
    ],
    teams: tournament.teams.map(teamSummary),
    knockout: matches.filter((m) => !m.stage.startsWith('group')).map(matchSummary),
    final: final && { ...matchSummary(final), goals: final.goals },
  });
});

app.get('/api/matches', (_req, res) => {
  res.json(matches.map(matchSummary));
});

app.get('/api/matches/:id', (req, res) => {
  const m = matches.find((x) => x.id === req.params.id);
  if (!m) {
    res.status(404).json({ error: `No match with id ${req.params.id}` });
    return;
  }
  const side = (s: 'home' | 'away') => {
    const team = teamsByName.get(s === 'home' ? m.homeTeam : m.awayTeam);
    const lineup = m.lineups?.[s] ?? [];
    const slots = lineupSlots(lineup, m.formations?.[s]);
    return {
      team: team ? teamSummary(team) : null,
      formation: m.formations?.[s] ?? null,
      manager: m.managers?.[s] ?? null,
      lineup: lineup.map((p) => {
        const squadPlayer = team && findPlayer(p.player, team.squad, (sp) => sp.name);
        return {
          ...p,
          id: team && squadPlayer ? playerId(team, squadPlayer) : null,
          slot: slots.get(p.number) ?? null,
        };
      }),
      stats: m.statistics?.[s] ?? null,
    };
  };
  res.json({
    ...matchSummary(m),
    stadium: m.stadium,
    attendance: m.attendance,
    referee: m.referee?.name ?? null,
    goals: m.goals ?? [],
    cards: m.cards ?? [],
    substitutions: m.substitutions ?? [],
    home: side('home'),
    away: side('away'),
  });
});

app.get('/api/teams/:code', (req, res) => {
  const team = teamsByCode.get(req.params.code.toUpperCase());
  if (!team) {
    res.status(404).json({ error: `No team with code ${req.params.code}` });
    return;
  }
  res.json({
    ...teamSummary(team),
    coach: team.coach.name,
    knockoutPath: team.knockoutPath,
    matches: matches.filter((m) => m.homeTeam === team.name || m.awayTeam === team.name).map(matchSummary),
    squad: team.squad.map((p) => {
      const history = playerHistory(snapshot, team, p);
      return {
        id: playerId(team, p),
        name: p.name,
        jersey: p.jersey ?? history.find((h) => h.number != null)?.number ?? null,
        position: p.position,
        club: p.club?.name ?? null,
        age: p.ageAtTournament,
        captain: p.captain,
        goals: p.goals,
        starts: history.filter((h) => h.role === 'started').length,
        subApps: history.filter((h) => h.role === 'sub').length,
      };
    }),
  });
});

// Search: /api/players?q=messi
app.get('/api/players', (req, res) => {
  const q = normalizeName(String(req.query.q ?? ''));
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const hits = [...players.entries()]
    .filter(([, { player }]) => normalizeName(player.name).includes(q))
    .slice(0, 12)
    .map(([id, { team, player }]) => ({ id, name: player.name, team: team.name, code: team.code, position: player.position }));
  res.json(hits);
});

app.get('/api/players/:id', (req, res) => {
  const found = players.get(req.params.id);
  if (!found) {
    res.status(404).json({ error: `No player with id ${req.params.id}` });
    return;
  }
  const { team, player } = found;
  const history = playerHistory(snapshot, team, player);
  res.json({
    id: req.params.id,
    name: player.name,
    jersey: player.jersey ?? history.find((h) => h.number != null)?.number ?? null,
    position: player.position,
    club: player.club?.name ?? null,
    born: player.born,
    age: player.ageAtTournament,
    captain: player.captain,
    team: teamSummary(team),
    history,
  });
});

app.listen(port, () => {
  console.log(`API on http://localhost:${port} - ${matches.length} matches, ${players.size} players`);
});
