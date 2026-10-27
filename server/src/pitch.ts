// Turns a lineup into dots on a pitch.
// Coordinates are percentages from the team's own point of view:
//   x: 0 = left touchline, 100 = right touchline
//   y: 0 = own goal line,  100 = opponent's goal line

import type { LineupEntry } from './zafronix-types.js';

export interface Slot {
  x: number;
  y: number;
  /** false when we had to guess from the formation string alone */
  exact: boolean;
}

// Where each specific role usually stands.
const ROLE_SPOTS: Record<string, { x: number; y: number }> = {
  GK: { x: 50, y: 6 },
  RB: { x: 86, y: 30 }, LB: { x: 14, y: 30 }, CB: { x: 50, y: 18 },
  RWB: { x: 88, y: 42 }, LWB: { x: 12, y: 42 },
  DM: { x: 50, y: 36 }, CM: { x: 50, y: 50 }, AM: { x: 50, y: 66 },
  RM: { x: 86, y: 56 }, LM: { x: 14, y: 56 },
  RW: { x: 84, y: 76 }, LW: { x: 16, y: 76 },
  RF: { x: 66, y: 84 }, LF: { x: 34, y: 84 }, CF: { x: 50, y: 88 },
};

/** Spread n players evenly around a centre x (e.g. 3 CBs -> 28, 50, 72). */
function spread(n: number, centre: number, width: number): number[] {
  if (n === 1) return [centre];
  return Array.from({ length: n }, (_, i) => centre - width / 2 + (width * i) / (n - 1));
}

/**
 * Returns shirt number -> slot for the 11 starters.
 * If every starter has a specific role (RB, CM, LW...) we use it.
 * Otherwise (only G/D/M/F or GK/DF/MF/FW) we fall back to the formation
 * string, e.g. "4-1-2-3", and fill the lines in lineup order.
 */
export function lineupSlots(lineup: LineupEntry[], formation: string | undefined): Map<number, Slot> {
  const starters = lineup.filter((p) => p.starter);
  const slots = new Map<number, Slot>();

  if (starters.every((p) => p.position in ROLE_SPOTS)) {
    const byRole = new Map<string, LineupEntry[]>();
    starters.forEach((p) => byRole.set(p.position, [...(byRole.get(p.position) ?? []), p]));
    byRole.forEach((players, role) => {
      const spot = ROLE_SPOTS[role]!;
      // Central roles share the middle (2 CBs -> 37.5 and 62.5), leaving the
      // flanks to the full-backs and wide players; wide roles barely repeat.
      const width = spot.x === 50 ? Math.min(60, 25 * (players.length - 1)) : 10 * (players.length - 1);
      // Lineups list players right-to-left, so reverse to read left-to-right.
      spread(players.length, spot.x, width)
        .reverse()
        .forEach((x, i) => slots.set(players[i]!.number, { x, y: spot.y, exact: true }));
    });
    return slots;
  }

  const lines = [1, ...(formation ?? '4-4-2').split('-').map(Number)];
  let next = 0;
  lines.forEach((count, lineIndex) => {
    const y = lineIndex === 0 ? 6 : 20 + (66 * (lineIndex - 1)) / Math.max(1, lines.length - 2);
    spread(count, 50, count === 1 ? 0 : Math.min(76, 19 * count))
      .reverse()
      .forEach((x) => {
        const player = starters[next++];
        if (player) slots.set(player.number, { x, y, exact: false });
      });
  });
  return slots;
}
