// Ticket R-02 -- YOU write this one. Run it with: npm run snapshot
//
// Goal: download the finished 2026 tournament ONCE and save it to
// server/data/ so the app never calls Zafronix at runtime.
//
// Steps:
//   1. Read the key from process.env.ZAFRONIX_API_KEY (stop with a clear
//      error if it's missing).
//   2. GET /tournaments/2026            -> save as data/tournament.json
//   3. GET /matches?year=2026           -> gives you the 104 match ids
//   4. GET /matches/{id} for every id   -> save as data/matches/{id}.json
//      Don't fire all 104 at once: do them one by one or a few at a time,
//      and wait a little between requests (free tier = fair use).
//   5. Skip files that already exist, so a crashed run can resume.
//
// Things to look up while you build it: fetch(), node:fs/promises
// (mkdir, writeFile, access), and why you'd await inside a for...of loop.

import type { TournamentResponse, MatchDetail } from '../src/zafronix-types.js';

const API_BASE = 'https://api.zafronix.com/fifa/worldcup/v1';

// TODO(R-02): your code here
