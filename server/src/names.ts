// The same player is spelled differently across endpoints:
//   squad "Pau Cubarsí"   vs lineup "Pau Cubarsí Paredes"
//   lineup "Ferran Torres" vs goals "Ferrán Torres"
//   lineup "Kai Havertz"   vs goals "Havertz" or "Havertz 45+5' pen"
//   squad "Lautaro Martínez" vs goals "La. Martínez"
// So we never compare raw strings. We clean, normalise, then compare word by word.

/** "Ferrán  Torres-Ruiz" -> "ferran torres ruiz" */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD') // split "á" into "a" + accent mark...
    .replace(/[̀-ͯ]/g, '') // ...and drop the accent marks
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips notes the goal feed glues onto names: "Kane 12' pen" -> "Kane", "Bounou 10' og" -> "Bounou". */
export function cleanEventName(raw: string): string {
  return raw
    .replace(/\s+\d.*$/, '') // everything from the first minute onwards
    .replace(/\s+(o\.?g\.?|pen)$/i, '')
    .trim();
}

const words = (name: string) => normalizeName(name).split(' ').filter(Boolean);

/**
 * True when every word of the shorter name matches a word in the longer one.
 * Words of one or two letters are treated as abbreviations: "g" matches
 * "gerardo", "la" matches "lautaro".
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = words(a);
  const tb = words(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((word) =>
    long.some((other) => (word.length <= 2 ? other.startsWith(word) : other === word)),
  );
}

/**
 * Picks the ONE candidate a name refers to, or null if none or it's ambiguous.
 * Ranking: identical name > same surname > loose match. "Isak" in Sweden's
 * squad matches both "Alexander Isak" and "Isak Hien", but only Alexander
 * Isak has it as a surname, so he wins.
 * Only search within one team: across all 1,254 players "Silva" is hopeless.
 */
export function findPlayer<T>(raw: string, candidates: T[], nameOf: (c: T) => string): T | null {
  const name = cleanEventName(raw);
  const target = normalizeName(name);
  const lastWord = words(name).at(-1);
  const score = (c: T) => {
    const n = nameOf(c);
    if (normalizeName(n) === target) return 3;
    if (!namesMatch(name, n)) return 0;
    return words(n).at(-1) === lastWord ? 2 : 1;
  };
  const ranked = candidates.map((c) => ({ c, s: score(c) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
  const [best, second] = ranked;
  if (!best || (second && second.s === best.s)) return null;
  return best.c;
}
