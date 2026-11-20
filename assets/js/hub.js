/* Game Night — home page: game grid, filters, search, continue card, join form. */
(function () {
  'use strict';
  const { el, store } = GN;
  GN.initPage();

  const grid = document.getElementById('grid');
  const noMatch = document.getElementById('no-match');
  const summary = document.getElementById('summary');
  const search = document.getElementById('search');
  const chips = Array.from(document.querySelectorAll('#chips .chip'));
  let games = [];
  let filter = 'all';
  let loadFailed = false;

  const FILTERS = {
    all: () => true,
    solo: GN.playableAlone,
    friends: GN.playableTogether,
    new: g => g.isNew,
  };

  // ---------- Join a room ----------
  const joinForm = document.getElementById('join-form');
  const joinInput = document.getElementById('join-code');
  const joinError = document.getElementById('join-error');
  joinInput.addEventListener('input', () => {
    joinInput.value = GN.normalizeCode(joinInput.value).slice(0, 4);
    joinError.hidden = true;
  });
  joinForm.addEventListener('submit', e => {
    e.preventDefault();
    const code = GN.normalizeCode(joinInput.value);
    if (!GN.isValidCode(code)) {
      joinError.textContent = 'Room codes are 4 letters or numbers, like KQ7P.';
      joinError.hidden = false;
      joinInput.focus();
      return;
    }
    location.href = 'room.html?code=' + code;
  });

  // ---------- Search: "/" focuses it ----------
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t && t.isContentEditable)) return;
    e.preventDefault();
    search.focus();
  });
  search.addEventListener('input', render);
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; render(); search.blur(); } });

  chips.forEach(chip => chip.addEventListener('click', () => {
    filter = chip.dataset.f;
    chips.forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    render();
  }));

  // ---------- Rendering ----------
  function pad(n) { return String(n).padStart(3, '0'); }

  function ticket(g) {
    const badges = [el('span', { class: 'badge p', text: GN.playersLabel(g.players) })];
    for (const m of g.modes) badges.push(el('span', { class: 'badge', text: GN.MODE_LABEL[m] }));
    if (g.dev) badges.push(el('span', { class: 'badge', text: 'Dev' }));
    return el('article', { class: 'ticket c-' + g.color },
      g.isNew && el('span', { class: 'new-flag', text: 'NEW' }),
      el('div', { class: 'thumb pat-' + g.pattern },
        g.thumb && el('img', { src: g.href + g.thumb, alt: '', loading: 'lazy' }),
        el('span', { class: 'no', text: 'No. ' + pad(g.no) })),
      el('div', { class: 'body' },
        el('a', { class: 'title', href: g.href, text: g.title }),
        g.blurb && el('p', { class: 'desc', text: g.blurb }),
        el('div', { class: 'badges' }, badges),
        GN.playableOnline(g) && el('a', { class: 'host-link', href: 'room.html?game=' + encodeURIComponent(g.id), text: 'Host a room' })));
  }

  function ghostTickets() {
    return [1, 2, 3].map(n => el('div', { class: 'ticket ghost', 'aria-hidden': 'true' },
      el('div', { class: 'thumb' }, el('span', { class: 'no', text: 'No. ' + pad(n) })),
      el('div', { class: 'body' },
        el('span', { class: 'title', text: 'Coming soon' }),
        el('span', { class: 'desc', text: 'A new game will take this spot.' }))));
  }

  function matches(g, q) {
    if (!q) return true;
    return (g.title + ' ' + g.blurb + ' ' + g.tags.join(' ')).toLowerCase().includes(q);
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const shown = games.filter(g => FILTERS[filter](g) && matches(g, q));
    grid.replaceChildren();
    noMatch.hidden = true;

    if (!games.length) {
      grid.append(...ghostTickets(), el('p', { class: 'empty-note', text: 'No games yet. The first ones are on their way.' }));
      return;
    }
    if (!shown.length) {
      noMatch.textContent = q ? `No games match "${search.value.trim()}".` : 'No games in this list yet.';
      noMatch.hidden = false;
      return;
    }
    grid.append(...shown.map(ticket));
  }

  function renderCounts() {
    for (const chip of chips) {
      const n = games.filter(FILTERS[chip.dataset.f]).length;
      chip.querySelector('.n').textContent = n;
      chip.disabled = chip.dataset.f !== 'all' && n === 0;
    }
    const together = games.filter(GN.playableTogether).length;
    if (loadFailed) summary.textContent = "Couldn't load the games list. Reload the page to try again.";
    else if (!games.length) summary.textContent = 'New games are coming soon. You can already open a room with friends.';
    else summary.textContent = `${games.length} ${games.length === 1 ? 'game' : 'games'} · ${together} you can play with friends`;
  }

  function renderContinue() {
    const box = document.getElementById('continue');
    const last = store.get('last', null);
    const g = last && games.find(x => x.id === last.id);
    if (!g) return; // keep the welcome card from the HTML
    box.className = 'continue c-' + g.color;
    box.replaceChildren(
      el('div', { class: 'art', 'aria-hidden': 'true' }),
      el('span', { class: 'k', text: 'Pick up where you left off' }),
      el('span', { class: 't', text: g.title }),
      el('span', { class: 'meta', text: 'Played ' + GN.timeAgo(last.at) + ' · ' + GN.playersLabel(g.players) }),
      el('a', { class: 'btn', href: g.href, text: 'Continue' }));
  }

  (async function load() {
    try {
      games = await GN.loadGames({ includeDev: GN.devMode() });
    } catch (err) {
      console.error(err);
      loadFailed = true;
      games = [];
    }
    renderCounts();
    renderContinue();
    render();
  })();
})();
