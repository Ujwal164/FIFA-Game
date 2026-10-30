// What the Node server sends back. These mirror server/src/index.ts by hand;
// a later lesson could share one types package between client and server.

import { useEffect, useState } from 'react';

export interface MatchSummary {
  id: string;
  matchNo: number;
  stage: string;
  /** Stadium-local date, "2026-07-19" */
  date: string;
  kickoffUtc: string;
  homeRef: string;
  awayRef: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  extraTime: boolean;
  penalties: { home: number; away: number } | null;
  city: string;
}

export interface TeamSummary {
  name: string;
  code: string;
  flagUrl: string;
  confederation: string;
  group: { group: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; pts: number; position: number };
  finalPosition: number;
}

export interface Award {
  title: string;
  name: string;
  detail: string | null;
  playerId: string | null;
}

export interface Tournament {
  info: {
    year: number;
    host: string[];
    datesIso: { start: string; end: string };
    teamsCount: number;
    matchesCount: number;
    champion: string;
    runnerUp: string;
    thirdPlace: string;
    totalGoals: number;
    totalAttendance: number;
    ballName: string;
  };
  awards: Award[];
  teams: TeamSummary[];
  knockout: MatchSummary[];
  final: (MatchSummary & { goals: GoalEvent[] }) | undefined;
}

export interface Slot {
  x: number;
  y: number;
  exact: boolean;
}

export interface GoalEvent {
  minute: number;
  team: 'home' | 'away';
  scorer: string;
  assist?: string | null;
  type?: string;
}

export interface LineupPlayer {
  player: string;
  number: number;
  position: string;
  starter: boolean;
  captain?: boolean;
  id: string | null;
  slot: Slot | null;
}

export interface MatchSide {
  team: TeamSummary | null;
  formation: string | null;
  manager: string | null;
  lineup: LineupPlayer[];
  stats: Record<string, number | null> | null;
}

export interface MatchDetail extends MatchSummary {
  stadium: string;
  attendance: number;
  referee: string | null;
  goals: GoalEvent[];
  cards: { minute: number; team: 'home' | 'away'; player: string; color: 'yellow' | 'red' }[];
  substitutions: { minute: number; team: 'home' | 'away'; on: string; off: string }[];
  home: MatchSide;
  away: MatchSide;
}

export interface SquadRow {
  id: string;
  name: string;
  jersey: number | null;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  club: string | null;
  age: number;
  captain: boolean;
  goals: number;
  starts: number;
  subApps: number;
}

export interface TeamDetail extends TeamSummary {
  coach: string;
  knockoutPath: { stage: string; opponent: string; result: string; won: boolean }[];
  matches: MatchSummary[];
  squad: SquadRow[];
}

export interface HistoryEntry {
  match: MatchSummary;
  side: 'home' | 'away';
  formation: string | null;
  role: 'started' | 'sub' | 'unused';
  number: number | null;
  position: string | null;
  slot: Slot | null;
  onMinute: number | null;
  offMinute: number | null;
  goals: number[];
  assists: number[];
  cards: { minute: number; color: string }[];
}

export interface PlayerDetail {
  id: string;
  name: string;
  jersey: number | null;
  position: string;
  club: string | null;
  born: string;
  age: number;
  captain: boolean;
  team: TeamSummary;
  history: HistoryEntry[];
}

export interface SearchHit {
  id: string;
  name: string;
  team: string;
  code: string;
  position: string;
}

type State<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/**
 * Fetches JSON from our own server and tracks loading/error/ready.
 * The `cancelled` flag stops a slow old request from overwriting a newer one
 * when you click quickly between pages.
 */
export function useApi<T>(path: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ status: 'loading' });

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(path)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        return body as T;
      })
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((err: Error) => {
        if (cancelled) return;
        const offline = err.message.includes('Failed to fetch') || err.message.includes('JSON');
        setState({
          status: 'error',
          message: offline ? 'Can’t reach the server. Is "npm run dev:server" running?' : err.message,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}

// --- formatting helpers -----------------------------------------------------

export const STAGE_NAMES: Record<string, string> = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  thirdPlace: 'Third place',
  final: 'Final',
};

export function stageName(stage: string): string {
  if (stage.startsWith('group_')) return `Group ${stage.slice(6).toUpperCase()}`;
  return STAGE_NAMES[stage] ?? stage;
}

/** Kickoff date + time in the viewer's own timezone (fixes the old app's UTC bug). */
export function kickoff(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * The day the match was played *at the stadium*. A 15:00 New Jersey kickoff
 * is already the next day in India, but nobody calls the final "the 20 July final".
 */
export function matchDay(m: MatchSummary): string {
  const [y, mo, d] = m.date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y!, mo! - 1, d!)),
  );
}

export function scoreline(m: MatchSummary): string {
  return `${m.homeScore}–${m.awayScore}`;
}

/** "a.e.t." / "4–3 pens" note, or null. */
export function scoreNote(m: MatchSummary): string | null {
  if (m.penalties) return `${m.penalties.home}–${m.penalties.away} on pens`;
  if (m.extraTime) return 'after extra time';
  return null;
}

/** Which team went through (penalties included), or null for a draw. */
export function winnerOf(m: MatchSummary): string | null {
  if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam;
  if (m.penalties) return m.penalties.home > m.penalties.away ? m.homeTeam : m.awayTeam;
  return null;
}

export const formatNumber = (n: number) => new Intl.NumberFormat().format(n);
