// Loads the snapshot from server/data/ once at startup and builds the
// lookups the routes need. Everything here is plain functions over JSON,
// which makes it easy to unit-test.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPlayer, normalizeName } from './names.js';
import { lineupSlots, type Slot } from './pitch.js';
import type { MatchDetail, SquadPlayer, Team, TournamentResponse } from './zafronix-types.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export interface Snapshot {
  tournament: TournamentResponse;
  matches: MatchDetail[];
}

// Matches use FIFA's official names, the team list uses common English ones.
// We fix this once, at load time, so no other code has to know about it.
const TEAM_ALIASES: Record<string, string> = {
  'Korea Republic': 'South Korea',
  Czechia: 'Czech Republic',
  USA: 'United States',
  Türkiye: 'Turkey',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cabo Verde': 'Cape Verde',
  'IR Iran': 'Iran',
};
const canonicalTeam = (name: string) => TEAM_ALIASES[name] ?? name;

export function loadSnapshot(dir = DATA_DIR): Snapshot {
  const tournamentFile = path.join(dir, 'tournament.json');
  if (!existsSync(tournamentFile)) {
    throw new Error(`No snapshot in ${dir}. Run "npm run snapshot" first (ticket R-02).`);
  }
  const tournament = JSON.parse(readFileSync(tournamentFile, 'utf8')) as TournamentResponse;
  const matchDir = path.join(dir, 'matches');
  const matches = readdirSync(matchDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(path.join(matchDir, file), 'utf8')) as MatchDetail)
    .map((m) => ({ ...m, homeTeam: canonicalTeam(m.homeTeam), awayTeam: canonicalTeam(m.awayTeam) }))
    .sort((a, b) => a.matchNo - b.matchNo);
  return { tournament, matches };
}

// --- ids -----------------------------------------------------------------

/** Stable, URL-safe player id: "ESP-pau-cubarsi". Jerseys can be null, names can't. */
export function playerId(team: Team, player: SquadPlayer): string {
  return `${team.code}-${normalizeName(player.name).replace(/ /g, '-')}`;
}

// --- summaries sent to the client ------------------------------------------

export function matchSummary(m: MatchDetail) {
  return {
    id: m.id,
    matchNo: m.matchNo,
    stage: m.stage,
    date: m.date, // the stadium's local date -- use for date-only labels
    kickoffUtc: m.kickoffUtc,
    homeRef: m.homeRef, // knockout feeders, e.g. "W74" = winner of match 74
    awayRef: m.awayRef,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    extraTime: m.extraTime,
    penalties: m.penalties,
    city: m.city,
  };
}

// Zafronix has no flag for the home nations and points at a placeholder
// that browsers refuse to load from another site.
const FLAG_FIXES: Record<string, string> = {
  England: 'https://flagcdn.com/w160/gb-eng.png',
  Scotland: 'https://flagcdn.com/w160/gb-sct.png',
};

export function teamSummary(t: Team) {
  return {
    name: t.name,
    code: t.code,
    flagUrl: FLAG_FIXES[t.name] ?? t.flag.flagUrl,
    confederation: t.confederation,
    group: t.groupStage,
    finalPosition: t.finalPosition,
  };
}

// --- player position history ----------------------------------------------

export interface HistoryEntry {
  match: ReturnType<typeof matchSummary>;
  side: 'home' | 'away';
  formation: string | null;
  /** 'started' | 'sub' (came on) | 'unused' (on the bench or not selected) */
  role: 'started' | 'sub' | 'unused';
  /** Shirt number in this match (squads sometimes lack numbers, lineups don't) */
  number: number | null;
  position: string | null;
  slot: Slot | null;
  onMinute: number | null;
  offMinute: number | null;
  goals: number[];
  assists: number[];
  cards: { minute: number; color: string }[];
}

export function playerHistory(snapshot: Snapshot, team: Team, player: SquadPlayer): HistoryEntry[] {
  return snapshot.matches
    .filter((m) => m.homeTeam === team.name || m.awayTeam === team.name)
    .map((m) => {
      const side = m.homeTeam === team.name ? 'home' : 'away';
      const lineup = m.lineups?.[side] ?? [];
      // "Does this name from the match feed refer to OUR player?"
      // Resolve it against the whole squad first, so a shared surname can't
      // be credited to the wrong teammate.
      const isMe = (raw: string | null | undefined) => !!raw && findPlayer(raw, team.squad, (p) => p.name) === player;
      const mine = <T extends { team: string }>(list: T[] | undefined) => (list ?? []).filter((e) => e.team === side);

      const entry = lineup.find((p) => isMe(p.player));
      const subOn = mine(m.substitutions).find((s) => isMe(s.on));
      const subOff = mine(m.substitutions).find((s) => isMe(s.off));
      // Own goals are listed under the team that benefits, with the
      // opponent's name, so they never count as this player's goals.
      const goals = mine(m.goals).filter((g) => g.type !== 'own_goal' && isMe(g.scorer)).map((g) => g.minute);
      const assists = mine(m.goals).filter((g) => isMe(g.assist)).map((g) => g.minute);
      const cards = mine(m.cards)
        .filter((c) => isMe(c.player))
        .map((c) => ({ minute: c.minute, color: c.color }));
      // The final has no substitution list, so a bench player who scored
      // (Ferran Torres, 106') clearly came on -- we just don't know when.
      const playedOffBench = !!subOn || (!!entry && (goals.length > 0 || assists.length > 0 || cards.length > 0));
      const role: HistoryEntry['role'] = entry?.starter ? 'started' : playedOffBench ? 'sub' : 'unused';

      return {
        match: matchSummary(m),
        side,
        formation: m.formations?.[side] ?? null,
        role,
        number: entry?.number ?? null,
        position: entry?.position ?? null,
        slot: entry?.starter ? (lineupSlots(lineup, m.formations?.[side]).get(entry.number) ?? null) : null,
        onMinute: subOn?.minute ?? null,
        offMinute: subOff?.minute ?? null,
        goals,
        assists,
        cards,
      };
    });
}
