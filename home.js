(function () {
  // ---------------------------------------------------------------------
  // Zafronix Sports API config
  // Free-tier key -> no /matches/live or /matches/stream access (402).
  // No endpoint in this API returns player x/y positional data, so a real
  // 2D live-tracking pitch view isn't possible here; we show confirmed
  // results + kickoff times instead and say so plainly in the UI.
  // ---------------------------------------------------------------------
  const API_BASE = 'https://api.zafronix.com/fifa/worldcup/v1';
  const API_KEY = 'zwc_free_72db277a68f044d34ca8f98b';
  const YEAR = 2026;

  const quizQuestions = [
    {
      question: 'Which country won the FIFA World Cup in 2022?',
      choices: ['France', 'Argentina', 'Brazil', 'Croatia'],
      answer: 'Argentina'
    },
    {
      question: 'How many players start for one team on the field?',
      choices: ['9', '10', '11', '12'],
      answer: '11'
    },
    {
      question: 'Which three countries are co-hosting the 2026 World Cup?',
      choices: [
        'USA, Canada, Mexico',
        'Spain, Portugal, Morocco',
        'Brazil, Argentina, Uruguay',
        'Germany, France, Belgium'
      ],
      answer: 'USA, Canada, Mexico'
    },
    {
      question: 'What does VAR stand for?',
      choices: ['Video Assistant Referee', 'Virtual Action Replay', 'Verified Attack Review', 'Visible Action Rule'],
      answer: 'Video Assistant Referee'
    }
  ];

  const state = {
    apiReady: false,
    apiError: null,
    query: '',
    team: 'All',
    roleFilter: 'all', // all | captains | starters
    aiWins: 0,
    challengeResultCounted: false,
    selectedQuizAnswers: new Map(),
    quizIndex: 0,
    quizScore: 0,
    quizLocked: false,
    players: [],
    teams: ['All'],
    matches: [],
    featuredMatch: null,
    standings: {},
    groupNames: [],
    selectedGroup: null,
    trivia: [],
    feed: []
  };

  const elements = {};

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // ---------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------
  async function fetchJson(path) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'X-API-Key': API_KEY },
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`Zafronix request failed (${response.status}): ${path}`);
    }
    return response.json();
  }

  function flattenPlayers(teams) {
    const players = [];
    teams.forEach((team) => {
      (team.roster || team.players || []).forEach((player) => {
        players.push({
          name: player.name,
          team: team.name,
          position: player.position || '—',
          club: player.club && player.club.name ? player.club.name : '—',
          jersey: player.jersey ?? null,
          goals: player.goals ?? 0,
          caps: player.caps ?? null,
          nationalGoals: player.nationalGoals ?? null,
          captain: !!player.captain,
          starter: !!player.starter
        });
      });
    });
    return players;
  }

  async function loadTournamentData() {
    const tournament = await fetchJson(`/tournaments/${YEAR}`);
    const teamsRaw = tournament.teams || [];

    // Some team entries carry the squad as `roster`, others as `players` --
    // handle both, and fall back to a per-team roster call if neither exists.
    const teamsNeedingRoster = teamsRaw.filter((team) => !team.roster && !team.players);
    if (teamsNeedingRoster.length) {
      const rosterResults = await Promise.allSettled(
        teamsNeedingRoster.map((team) =>
          fetchJson(`/teams/${encodeURIComponent(team.name)}/roster?year=${YEAR}`)
        )
      );
      rosterResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          teamsNeedingRoster[index].roster = result.value;
        }
      });
    }

    const players = flattenPlayers(teamsRaw);
    const teamNames = ['All', ...new Set(teamsRaw.map((team) => team.name))];

    const [matchesData, standingsData, triviaData] = await Promise.all([
      fetchJson(`/matches?year=${YEAR}&denormalize=true`).catch(() => ({ data: [] })),
      fetchJson(`/standings?year=${YEAR}`).catch(() => ({ groups: {} })),
      fetchJson(`/trivia?year=${YEAR}`).catch(() => [])
    ]);

    return {
      players,
      teamNames,
      matches: matchesData.data || [],
      standings: standingsData.groups || {},
      trivia: Array.isArray(triviaData) ? triviaData : (triviaData.facts || [])
    };
  }

  // ---------------------------------------------------------------------
  // Derived data helpers
  // ---------------------------------------------------------------------
  function ratingFor(player) {
    const goals = player.goals || 0;
    const caps = player.caps || 0;
    const nationalGoals = player.nationalGoals || 0;
    const raw =
      5.4 +
      goals * 0.5 +
      nationalGoals * 0.03 +
      caps * 0.01 +
      (player.captain ? 0.3 : 0) +
      (player.starter ? 0.2 : 0);
    return clamp(raw, 0, 10).toFixed(1);
  }

  function currentAverageRating() {
    if (!state.players.length) return '0.0';
    return (state.players.reduce((sum, player) => sum + Number(ratingFor(player)), 0) / state.players.length).toFixed(1);
  }

  function teamAverageRating(teamName) {
    const squad = state.players.filter((player) => player.team === teamName);
    if (!squad.length) return 6.0;
    return squad.reduce((sum, player) => sum + Number(ratingFor(player)), 0) / squad.length;
  }

  function matchDate(match) {
    // Combine `date` + `kickoff` when both exist; fall back to date only.
    if (!match.date) return null;
    const time = match.kickoff ? match.kickoff : '00:00';
    const parsed = new Date(`${match.date}T${time}:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function pickFeaturedMatch(matches) {
    const now = new Date();
    const withDates = matches
      .map((match) => ({ match, when: matchDate(match) }))
      .filter((entry) => entry.when);

    if (!withDates.length) return matches[0] || null;

    const today = withDates.find((entry) => {
      const d = entry.when;
      return d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth() &&
        d.getUTCDate() === now.getUTCDate();
    });
    if (today) return today.match;

    const upcoming = withDates
      .filter((entry) => entry.when > now)
      .sort((a, b) => a.when - b.when)[0];
    if (upcoming) return upcoming.match;

    const past = withDates
      .filter((entry) => entry.when <= now)
      .sort((a, b) => b.when - a.when)[0];
    return past ? past.match : matches[0];
  }

  function buildFeedFromMatches(matches) {
    const finished = matches
      .filter((match) => match.homeScore !== null && match.homeScore !== undefined)
      .map((match) => ({ match, when: matchDate(match) }))
      .filter((entry) => entry.when)
      .sort((a, b) => b.when - a.when)
      .slice(0, 8);

    if (!finished.length) {
      return [{ time: '—', title: 'No results yet', body: 'Fixtures for this tournament haven\u2019t been played yet.' }];
    }

    return finished.map(({ match }) => ({
      time: match.stage ? match.stage.toUpperCase() : 'RESULT',
      title: `${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`,
      body: `${match.stadium || 'Venue TBC'}${match.city ? `, ${match.city}` : ''}${match.date ? ` \u00b7 ${match.date}` : ''}`
    }));
  }

  function forecastForMatch() {
    if (!state.featuredMatch) return { home: 1, away: 1 };
    const homeEdge = teamAverageRating(state.featuredMatch.homeTeam);
    const awayEdge = teamAverageRating(state.featuredMatch.awayTeam);
    const diff = homeEdge - awayEdge;
    const projectedHome = clamp(Math.round(1.4 + diff * 0.5), 0, 6);
    const projectedAway = clamp(Math.round(1.1 - diff * 0.4), 0, 5);
    return { home: projectedHome, away: projectedAway };
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function visiblePlayers() {
    return state.players.filter((player) => {
      const searchMatch = [player.name, player.team, player.position, player.club]
        .join(' ')
        .toLowerCase()
        .includes(state.query.toLowerCase());
      const teamMatch = state.team === 'All' || player.team === state.team;
      const roleMatch =
        state.roleFilter === 'all' ||
        (state.roleFilter === 'captains' && player.captain) ||
        (state.roleFilter === 'starters' && player.starter);
      return searchMatch && teamMatch && roleMatch;
    });
  }

  function renderPlayerList() {
    const list = visiblePlayers();
    const rows = [
      '<div class="player-row header"><div>Player</div><div>Pos</div><div>Goals</div><div>Caps</div><div>Club</div><div>Rating</div></div>'
    ];

    if (!list.length) {
      rows.push('<div class="feed-item">No players match the current filters.</div>');
    } else {
      list.slice(0, 200).forEach((player) => {
        rows.push(`
          <div class="player-row">
            <div class="name-block">
              <strong>${player.name}${player.captain ? ' (C)' : ''}</strong>
              <span>${player.team}${player.jersey ? ` \u00b7 #${player.jersey}` : ''}</span>
            </div>
            <div>${player.position}</div>
            <div>${player.goals}</div>
            <div>${player.caps ?? '—'}</div>
            <div>${player.club}</div>
            <div class="rating">${ratingFor(player)}</div>
          </div>
        `);
      });
    }

    elements.playerList.innerHTML = rows.join('');
  }

  function renderFeed() {
    elements.liveFeed.innerHTML = state.feed.map((item) => `
      <div class="feed-item">
        <small>${item.time}</small>
        <strong>${item.title}</strong>
        <div>${item.body}</div>
      </div>
    `).join('');
  }

  function renderQuiz() {
    const question = quizQuestions[state.quizIndex];
    const locked = state.quizLocked;
    const selected = state.selectedQuizAnswers.get(state.quizIndex);

    const choices = question.choices.map((choice) => {
      const isSelected = selected === choice;
      const isCorrect = locked && choice === question.answer;
      const isWrong = locked && isSelected && choice !== question.answer;
      const classNames = ['choice'];
      if (isSelected) classNames.push('selected');
      if (isCorrect) classNames.push('correct');
      if (isWrong) classNames.push('wrong');
      return `<div class="${classNames.join(' ')}" data-choice="${choice}">${choice}</div>`;
    }).join('');

    elements.quizArea.innerHTML = `
      <div class="stat" style="margin-bottom: 14px;">
        <div class="label">Question ${state.quizIndex + 1} of ${quizQuestions.length}</div>
        <div class="hint">${question.question}</div>
      </div>
      <div class="quiz-choices">${choices}</div>
      <div class="challenge-row">
        <button id="quizPrev" type="button">Previous</button>
        <button id="quizCheck" type="button">${locked ? 'Next question' : 'Check answer'}</button>
        <button id="quizSkip" type="button">Skip</button>
      </div>
      <div class="result" style="margin-top: 14px;">Score: ${state.quizScore}/${quizQuestions.length}</div>
    `;

    elements.quizArea.querySelectorAll('.choice').forEach((choiceEl) => {
      choiceEl.addEventListener('click', () => {
        if (state.quizLocked) return;
        state.selectedQuizAnswers.set(state.quizIndex, choiceEl.dataset.choice);
        renderQuiz();
      });
    });

    elements.quizArea.querySelector('#quizPrev').onclick = () => {
      if (state.quizIndex === 0) return;
      state.quizIndex -= 1;
      state.quizLocked = false;
      renderQuiz();
    };

    elements.quizArea.querySelector('#quizCheck').onclick = () => {
      if (!state.quizLocked) {
        const answer = state.selectedQuizAnswers.get(state.quizIndex);
        if (answer === question.answer) {
          state.quizScore += 1;
        }
        state.quizLocked = true;
        updateStats();
        renderQuiz();
        return;
      }

      if (state.quizIndex < quizQuestions.length - 1) {
        state.quizIndex += 1;
        state.quizLocked = false;
        renderQuiz();
      }
    };

    elements.quizArea.querySelector('#quizSkip').onclick = () => {
      if (state.quizIndex < quizQuestions.length - 1) {
        state.quizIndex += 1;
        state.quizLocked = false;
        renderQuiz();
      }
    };
  }

  function renderGroupSelect() {
    const groups = state.groupNames;
    if (!groups.length) {
      elements.groupSelect.innerHTML = '<option value="">No groups yet</option>';
      return;
    }
    elements.groupSelect.innerHTML = groups.map((g) => `<option value="${g}">Group ${g}</option>`).join('');
    elements.groupSelect.value = state.selectedGroup || groups[0];
  }

  function renderStandings() {
    const group = state.selectedGroup;
    const rows = (state.standings[group] || []);
    if (!rows.length) {
      elements.standingsTable.innerHTML = '<div class="feed-item">Standings for this group aren\u2019t available yet.</div>';
      return;
    }

    const header = `
      <div class="player-row header">
        <div>Team</div><div>P</div><div>W-D-L</div><div>GD</div><div>Pts</div><div>Status</div>
      </div>`;

    const body = rows.map((row) => `
      <div class="player-row">
        <div class="name-block"><strong>${row.team}</strong></div>
        <div>${row.played}</div>
        <div>${row.won}-${row.drawn}-${row.lost}</div>
        <div>${row.goalDifference > 0 ? '+' : ''}${row.goalDifference}</div>
        <div class="rating">${row.points}</div>
        <div>${row.advanced ? 'Advancing' : '—'}</div>
      </div>
    `).join('');

    elements.standingsTable.innerHTML = header + body;
  }

  function renderTrivia() {
    if (!state.trivia.length) {
      elements.triviaList.innerHTML = '<div class="hint">No curated trivia loaded for this tournament yet.</div>';
      return;
    }
    elements.triviaList.innerHTML = state.trivia.slice(0, 3).map((fact) => {
      const text = typeof fact === 'string' ? fact : (fact.fact || fact.text || JSON.stringify(fact));
      return `<div class="feed-item">${text}</div>`;
    }).join('');
  }

  function renderFeaturedMatch() {
    const match = state.featuredMatch;
    if (!match) {
      elements.homeTeam.textContent = 'TBD';
      elements.awayTeam.textContent = 'TBD';
      elements.liveScore.textContent = '— - —';
      elements.liveStatus.textContent = 'No fixture loaded';
      return;
    }

    elements.homeTeam.textContent = match.homeTeam || 'TBD';
    elements.awayTeam.textContent = match.awayTeam || 'TBD';

    const played = match.homeScore !== null && match.homeScore !== undefined;
    if (played) {
      elements.liveScore.textContent = `${match.homeScore} - ${match.awayScore}`;
      elements.liveStatus.textContent = `Final \u00b7 ${match.stage || ''}`.trim();
      elements.clockValue.textContent = 'FT';
    } else {
      elements.liveScore.textContent = '— - —';
      const when = matchDate(match);
      elements.liveStatus.textContent = when ? `Kicks off ${when.toUTCString().slice(0, 22)}` : 'Scheduled';
      elements.clockValue.textContent = match.kickoff || '--:--';
    }

    elements.homeForm.textContent = `Squad rating: ${teamAverageRating(match.homeTeam).toFixed(1)}`;
    elements.awayForm.textContent = `Squad rating: ${teamAverageRating(match.awayTeam).toFixed(1)}`;
  }

  function updateStats() {
    elements.trackedCount.textContent = state.players.length;
    elements.aiWins.textContent = state.aiWins;
    elements.quizScore.textContent = `${state.quizScore}/${quizQuestions.length}`;

    if (state.players.length) {
      const top = state.players.slice().sort((left, right) => Number(ratingFor(right)) - Number(ratingFor(left)))[0];
      elements.topPerformer.textContent = top.name;
      elements.topPerformerHint.textContent = `${top.team} \u00b7 ${top.goals} goals \u00b7 Avg squad rating ${currentAverageRating()}`;
    }
  }

  function updateChallengeResult(countResult = false) {
    const yourHome = Number(elements.yourHomeScore.value || 0);
    const yourAway = Number(elements.yourAwayScore.value || 0);
    const ai = forecastForMatch();
    const match = state.featuredMatch;
    const played = match && match.homeScore !== null && match.homeScore !== undefined;

    if (!played) {
      elements.challengeResult.innerHTML = `
        <strong>AI forecast:</strong> ${ai.home} - ${ai.away}<br />
        <strong>Your pick:</strong> ${yourHome} - ${yourAway}<br />
        <span style="color: #a9b7cc;">This fixture hasn\u2019t been played yet, so there\u2019s no result to compare against \u2014 check back after kickoff.</span>
      `;
      return;
    }

    const userDistance = Math.abs(yourHome - match.homeScore) + Math.abs(yourAway - match.awayScore);
    const aiDistance = Math.abs(ai.home - match.homeScore) + Math.abs(ai.away - match.awayScore);
    const winner = userDistance <= aiDistance ? 'You' : 'AI';
    if (countResult && winner === 'AI' && !state.challengeResultCounted) {
      state.aiWins += 1;
      elements.aiWins.textContent = state.aiWins;
      state.challengeResultCounted = true;
    }

    elements.challengeResult.innerHTML = `
      <strong>AI forecast:</strong> ${ai.home} - ${ai.away}<br />
      <strong>Your pick:</strong> ${yourHome} - ${yourAway}<br />
      <strong>Closer to the actual result:</strong> ${winner}<br />
      <span style="color: #a9b7cc;">Final score was ${match.homeScore} - ${match.awayScore}.</span>
    `;
  }

  function renderTeamFilter() {
    const currentValue = elements.teamFilter.value || 'All';
    elements.teamFilter.innerHTML = '';
    state.teams.forEach((team) => {
      const option = document.createElement('option');
      option.value = team;
      option.textContent = team;
      elements.teamFilter.appendChild(option);
    });
    elements.teamFilter.value = state.teams.includes(currentValue) ? currentValue : 'All';
    if (state.team !== 'All' && !state.teams.includes(state.team)) {
      state.team = 'All';
    }
  }

  function renderAll() {
    renderTeamFilter();
    renderPlayerList();
    renderFeed();
    renderGroupSelect();
    renderStandings();
    renderTrivia();
    renderFeaturedMatch();
    updateStats();
    updateChallengeResult();
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------
  function wireEvents() {
    elements.searchInput.addEventListener('input', (event) => {
      state.query = event.target.value;
      renderPlayerList();
    });

    elements.teamFilter.addEventListener('change', (event) => {
      state.team = event.target.value;
      renderPlayerList();
    });

    elements.liveFilter.addEventListener('change', (event) => {
      state.roleFilter = event.target.value;
      renderPlayerList();
    });

    elements.resetFilters.addEventListener('click', () => {
      state.query = '';
      state.team = 'All';
      state.roleFilter = 'all';
      elements.searchInput.value = '';
      elements.teamFilter.value = 'All';
      elements.liveFilter.value = 'all';
      renderPlayerList();
    });

    elements.groupSelect.addEventListener('change', (event) => {
      state.selectedGroup = event.target.value;
      renderStandings();
    });

    elements.challengeButton.addEventListener('click', () => {
      state.challengeResultCounted = false;
      updateChallengeResult(true);
    });
    elements.yourHomeScore.addEventListener('input', () => updateChallengeResult(false));
    elements.yourAwayScore.addEventListener('input', () => updateChallengeResult(false));
  }

  function cacheElements() {
    elements.trackedCount = document.getElementById('trackedCount');
    elements.clockValue = document.getElementById('clockValue');
    elements.aiWins = document.getElementById('aiWins');
    elements.quizScore = document.getElementById('quizScore');
    elements.homeTeam = document.getElementById('homeTeam');
    elements.awayTeam = document.getElementById('awayTeam');
    elements.liveScore = document.getElementById('liveScore');
    elements.liveStatus = document.getElementById('liveStatus');
    elements.homeForm = document.getElementById('homeForm');
    elements.awayForm = document.getElementById('awayForm');
    elements.topPerformer = document.getElementById('topPerformer');
    elements.topPerformerHint = document.getElementById('topPerformerHint');
    elements.playerList = document.getElementById('playerList');
    elements.liveFeed = document.getElementById('liveFeed');
    elements.challengeResult = document.getElementById('challengeResult');
    elements.yourHomeScore = document.getElementById('yourHomeScore');
    elements.yourAwayScore = document.getElementById('yourAwayScore');
    elements.challengeButton = document.getElementById('challengeButton');
    elements.searchInput = document.getElementById('searchInput');
    elements.teamFilter = document.getElementById('teamFilter');
    elements.liveFilter = document.getElementById('liveFilter');
    elements.resetFilters = document.getElementById('resetFilters');
    elements.quizArea = document.getElementById('quizArea');
    elements.groupSelect = document.getElementById('groupSelect');
    elements.standingsTable = document.getElementById('standingsTable');
    elements.triviaList = document.getElementById('triviaList');
    elements.apiStatusNote = document.getElementById('apiStatusNote');
  }

  async function init() {
    cacheElements();
    wireEvents();
    renderQuiz();

    elements.apiStatusNote.textContent = 'Loading live tournament data from the Zafronix API\u2026';

    try {
      const data = await loadTournamentData();
      state.players = data.players;
      state.teams = data.teamNames;
      state.matches = data.matches;
      state.standings = data.standings;
      state.groupNames = Object.keys(data.standings).sort();
      state.selectedGroup = state.groupNames[0] || null;
      state.trivia = data.trivia;
      state.featuredMatch = pickFeaturedMatch(data.matches);
      state.feed = buildFeedFromMatches(data.matches);
      state.apiReady = true;

      elements.apiStatusNote.textContent =
        'Live squads, fixtures, and standings loaded from the Zafronix World Cup API. Real-time in-play tracking (live minute, live positions) isn\u2019t available on the free tier and no Zafronix endpoint exposes on-pitch player coordinates, so this dashboard shows confirmed results and kickoff times instead of a simulated live feed.';
    } catch (error) {
      state.apiReady = false;
      state.apiError = error.message;
      elements.apiStatusNote.textContent =
        `Couldn\u2019t reach the Zafronix API (${error.message}). Check your API key and network settings; showing an empty dashboard until data loads.`;
    }

    renderAll();

    // Re-poll matches/standings periodically to reflect newly finalized
    // results -- respects the API's own 60s cache, no fake data generated.
    setInterval(async () => {
      try {
        const [matchesData, standingsData] = await Promise.all([
          fetchJson(`/matches?year=${YEAR}&denormalize=true`),
          fetchJson(`/standings?year=${YEAR}`)
        ]);
        state.matches = matchesData.data || [];
        state.standings = standingsData.groups || {};
        state.groupNames = Object.keys(state.standings).sort();
        if (!state.selectedGroup) state.selectedGroup = state.groupNames[0] || null;
        state.featuredMatch = pickFeaturedMatch(state.matches);
        state.feed = buildFeedFromMatches(state.matches);
        renderFeed();
        renderGroupSelect();
        renderStandings();
        renderFeaturedMatch();
        updateChallengeResult();
      } catch (error) {
        // Silent retry on next interval; keep last known good data on screen.
      }
    }, 90000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
