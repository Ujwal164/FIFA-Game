// Shapes of the Zafronix World Cup API (v1), written from real responses
// fetched on 2026-10-27. If the API changes, TypeScript will point at every
// place that needs updating -- that's the point of writing these down.

export type Position = 'GK' | 'DF' | 'MF' | 'FW';

// GET /tournaments/{year} -------------------------------------------------

export interface TournamentResponse {
  schemaVersion: number;
  tournament: TournamentInfo;
  teams: Team[];
}

export interface TournamentInfo {
  year: number;
  edition: number;
  host: string[];
  datesIso: { start: string; end: string };
  teamsCount: number;
  matchesCount: number;
  champion: string;
  runnerUp: string;
  thirdPlace: string;
  topScorer: { player: string; goals: number };
  bestPlayer: string;
  bestYoungPlayer: string;
  bestGoalkeeper: string;
  totalGoals: number;
  totalAttendance: number;
}

export interface Team {
  name: string;
  code: string; // "MEX"
  confederation: string;
  groupStage: {
    group: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    pts: number;
    position: number;
  };
  knockoutPath: { stage: string; opponent: string; result: string; won: boolean }[];
  finalPosition: number;
  coach: { name: string; country: string | null };
  /** The squad lives here -- NOT `roster` or `players` (bug BUG-03 in the old app). */
  squad: SquadPlayer[];
  flag: { flagUrl: string };
}

export interface SquadPlayer {
  jersey: number | null; // null for some teams (e.g. Spain)
  name: string;
  position: Position;
  born: string;
  ageAtTournament: number;
  club: { name: string; country: string };
  goals: number;
  captain: boolean;
  // Only present when non-zero:
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  // Note: there is NO caps / nationalGoals / starter field (bug DATA-02).
}

// GET /matches/{id} -------------------------------------------------------

export interface MatchDetail {
  id: string; // "2026-104"
  matchNo: number;
  date: string; // local date
  kickoff: string; // LOCAL stadium time, e.g. "15:00" (bug BUG-04)
  kickoffUtc: string; // ISO timestamp -- use this one
  stage: string;
  homeTeam: string;
  awayTeam: string;
  /** Group slot ("1E") or knockout feeder ("W74" = winner of match 74) */
  homeRef: string;
  awayRef: string;
  homeScore: number;
  awayScore: number;
  extraTime: boolean;
  penalties: { home: number; away: number } | null;
  stadium: string;
  city: string;
  attendance: number;
  status: 'finished' | string;
  formations: { home: string; away: string }; // "4-1-2-3"
  /** Starters + the WHOLE bench. `starter: false` does not mean they came on. */
  lineups: { home: LineupEntry[]; away: LineupEntry[] };
  goals: Goal[];
  cards: Card[];
  /** Present on 103 of 104 matches -- this tells us who really came on. */
  substitutions?: Substitution[];
  managers?: { home: string; away: string };
  referee?: { name: string; country: string | null };
  statistics: { home: TeamStats; away: TeamStats };
  events: unknown[]; // always empty on the free tier
}

export interface LineupEntry {
  player: string; // spelling can differ from SquadPlayer.name!
  number: number;
  /**
   * Starters usually have a specific role (GK, RB, CB, LB, DM, CM, AM, RM, LM,
   * RW, LW, RF, LF, CF, RWB, LWB). Bench players -- and both teams in the
   * final -- only get a generic one (GK/DF/MF/FW or G/D/M/F).
   */
  position: string;
  starter: boolean;
  captain?: boolean;
}

export interface Substitution {
  minute: number;
  team: 'home' | 'away';
  on: string;
  off: string;
}

export interface Goal {
  minute: number;
  team: 'home' | 'away';
  scorer: string; // sometimes just a surname: "Havertz"
  assist?: string | null;
  type?: string;
}

export interface Card {
  minute: number;
  team: 'home' | 'away';
  player: string;
  color: 'yellow' | 'red';
}

export interface TeamStats {
  possessionPct: number;
  shotsTotal: number;
  shotsOnGoal: number;
  corners: number;
  fouls: number;
  passesTotal: number;
  passesAccurate: number;
  expectedGoals?: number;
}
