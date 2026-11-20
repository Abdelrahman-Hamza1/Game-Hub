/* Game Night — rooms.
 *
 * How it works
 * - Rooms are peer-to-peer (PeerJS / WebRTC). The host's browser *is* the room:
 *   its peer id is "gamenight-room-<CODE>", and everyone else connects to it.
 * - Star layout: players only talk to the host; the host relays messages.
 * - This page stays open for the whole session. Games run inside an <iframe>, so the
 *   connection survives switching games. Games talk to this page with postMessage
 *   through shared/gamenight.js (see GameNight.room there).
 *
 * Peer messages (over the data connection)
 *   player -> host: hello{name} · rename{name} · game{to,type,data} · bye
 *   host -> player: welcome{you,players,selected,game,lastResult} · players{players}
 *                   select{game} · start{game} · lobby{result} · game{from,type,data} · full · bye
 *
 * Frame messages (postMessage, same origin only)
 *   game -> room: ready · send{to,type,data} · end{result}
 *   room -> game: init{code,me,players,hostId,game} · players{players,hostId} · msg{from,type,data}
 */
(function () {
  'use strict';
  const { el } = GN;
  GN.initPage();

  const PEER_PREFIX = 'gamenight-room-';
  const MAX_PLAYERS = 8;
  const JOIN_TIMEOUT_MS = 15000;
  const PEER_OPTS = { debug: 1 };

  const params = new URLSearchParams(location.search);
  const rawCode = params.get('code');
  const isHost = rawCode === null;
  const joinCode = GN.normalizeCode(rawCode);
  const preselect = params.get('game');
  const dev = GN.devMode();

  const S = {
    phase: 'connecting',     // connecting | lobby | playing | error
    code: null,
    me: null,                // {id, name, color, host}
    players: [],
    selected: null,          // game id picked in the lobby
    game: null,              // game id being played
    lastResult: null,
    allGames: [],            // every game in games.json (for titles, how-to)
    pickable: [],            // games the host can start
    peer: null,
    hostConn: null,          // player side: connection to the host
    conns: new Map(),        // host side: player id -> connection
    frameReady: false,
    frameQueue: [],
    leaving: false,
  };

  const $ = id => document.getElementById(id);
  const frame = $('game-frame');

  // ---------- Small helpers ----------
  function cleanText(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f‪-‮]/g, '').trim().slice(0, max);
  }
  function gameById(id) { return S.allGames.find(g => g.id === id) || null; }
  function hostId() { const h = S.players.find(p => p.host); return h ? h.id : null; }
  function validGameId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id); }
  function sanitizePlayers(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_PLAYERS).map(p => ({
      id: String(p && p.id),
      name: GN.cleanName(p && p.name),
      color: GN.COLORS.includes(p && p.color) ? p.color : 'slate',
      host: !!(p && p.host),
    }));
  }
  function uniqueName(name, selfId) {
    const taken = new Set(S.players.filter(p => p.id !== selfId).map(p => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 20; i++) {
      const n = name.slice(0, 17) + ' ' + i;
      if (!taken.has(n.toLowerCase())) return n;
    }
    return name;
  }
  function nextColor() {
    const used = new Set(S.players.map(p => p.color));
    return GN.COLORS.find(c => !used.has(c)) || GN.COLORS[S.players.length % GN.COLORS.length];
  }
  function roomLink() {
    return location.origin + location.pathname + '?code=' + S.code;
  }

  // ---------- Errors ----------
  function describeError(err) {
    switch (err && err.type) {
      case 'browser-incompatible':
        return "This browser can't make direct connections. Try a recent Chrome, Firefox, Safari or Edge.";
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
        return "Couldn't reach the connection server. Check your internet connection and try again.";
      case 'peer-unavailable':
        return `No open room has the code ${joinCode}. Check the code with your host.`;
      default:
        return 'Something went wrong while connecting' + (err && err.type ? ` (${err.type})` : '') + '. Try again.';
    }
  }

  function fail(message, opts) {
    opts = opts || {};
    if (S.phase === 'error') return;
    S.phase = 'error';
    unloadFrame();
    $('error-title').textContent = opts.title || "Couldn't connect";
    $('error-text').textContent = message;
    const retry = $('error-retry');
    if (isHost || opts.newRoom) { retry.href = 'room.html'; retry.textContent = 'Start a new room'; }
    else { retry.href = 'room.html?code=' + joinCode; retry.textContent = 'Try again'; }
    try { if (S.peer && !S.peer.destroyed) S.peer.destroy(); } catch (e) { /* ignore */ }
    render();
  }

  // ---------- Host ----------
  function startHost(attempt) {
    const code = GN.randomCode();
    $('status-text').textContent = 'Opening a room…';
    const peer = new Peer(PEER_PREFIX + code, PEER_OPTS);
    S.peer = peer;

    peer.on('open', () => {
      S.code = code;
      S.me = { id: peer.id, name: GN.playerName(), color: 'red', host: true };
      S.players = [S.me];
      if (preselect && S.pickable.some(g => g.id === preselect)) S.selected = preselect;
      else if (S.pickable.length === 1) S.selected = S.pickable[0].id;
      S.phase = 'lobby';
      render();
    });

    peer.on('connection', conn => {
      conn.on('data', msg => onPlayerMessage(conn, msg));
      conn.on('close', () => dropPlayer(conn.peer));
      conn.on('error', () => dropPlayer(conn.peer));
    });

    peer.on('error', err => {
      if (err.type === 'unavailable-id' && attempt < 5 && S.phase === 'connecting') {
        peer.destroy();
        startHost(attempt + 1); // code already in use: roll a new one
        return;
      }
      if (S.phase === 'connecting') fail(describeError(err));
      else console.warn('[room]', err.type, err);
    });

    // Lost the signaling server. Existing players stay connected; reconnect so new ones can join.
    peer.on('disconnected', () => {
      if (S.leaving || S.phase === 'error' || peer.destroyed) return;
      setTimeout(() => { try { if (!peer.destroyed && peer.disconnected) peer.reconnect(); } catch (e) { /* ignore */ } }, 1500);
    });
  }

  function onPlayerMessage(conn, msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    const id = conn.peer;
    switch (msg.t) {
      case 'hello': {
        if (S.conns.has(id)) return;
        if (S.players.length >= MAX_PLAYERS) {
          conn.send({ t: 'full' });
          setTimeout(() => conn.close(), 500);
          return;
        }
        const p = { id, name: uniqueName(GN.cleanName(msg.name), id), color: nextColor(), host: false };
        S.conns.set(id, conn);
        S.players.push(p);
        conn.send({
          t: 'welcome', you: id, players: S.players, selected: S.selected,
          game: S.phase === 'playing' ? S.game : null, lastResult: S.lastResult,
        });
        broadcast({ t: 'players', players: S.players }, id);
        GN.toast(p.name + ' joined');
        playersChanged();
        break;
      }
      case 'rename': {
        const p = S.players.find(x => x.id === id);
        if (!p) return;
        p.name = uniqueName(GN.cleanName(msg.name, p.name), id);
        broadcast({ t: 'players', players: S.players });
        playersChanged();
        break;
      }
      case 'game':
        if (!S.conns.has(id)) return;
        route(id, typeof msg.to === 'string' ? msg.to : null, msg.type, msg.data);
        break;
      case 'bye':
        dropPlayer(id);
        break;
    }
  }

  function dropPlayer(id) {
    if (!S.conns.has(id)) return;
    const conn = S.conns.get(id);
    S.conns.delete(id);
    try { conn.close(); } catch (e) { /* ignore */ }
    const p = S.players.find(x => x.id === id);
    S.players = S.players.filter(x => x.id !== id);
    broadcast({ t: 'players', players: S.players });
    if (p) GN.toast(p.name + ' left');
    playersChanged();
  }

  function broadcast(msg, exceptId) {
    for (const [id, c] of S.conns) {
      if (id !== exceptId && c.open) c.send(msg);
    }
  }

  /** Host only: deliver a game message to one player (to) or to everyone except the sender. */
  function route(from, to, type, data) {
    if (typeof type !== 'string' || !type) return;
    const targets = to ? [to] : S.players.map(p => p.id).filter(id => id !== from);
    for (const id of targets) {
      if (id === S.me.id) deliverToFrame(from, type, data);
      else {
        const c = S.conns.get(id);
        if (c && c.open) c.send({ t: 'game', from, type, data });
      }
    }
  }

  function selectGame(id) {
    if (!isHost || S.phase !== 'lobby') return;
    S.selected = id;
    broadcast({ t: 'select', game: id });
    render();
  }

  function startCheck() {
    const g = gameById(S.selected);
    if (!g) return { ok: false, why: 'Pick a game to start.' };
    const n = S.players.length;
    const [min, max] = g.players;
    if (n < min) return { ok: false, why: `${g.title} needs at least ${min} players. Waiting for ${min - n} more.` };
    if (n > max) return { ok: false, why: `${g.title} fits up to ${max} players. There are ${n} in the room.` };
    return { ok: true, why: `${n} ${n === 1 ? 'player' : 'players'} ready.` };
  }

  function startGame() {
    if (!isHost || !startCheck().ok) return;
    S.lastResult = null;
    broadcast({ t: 'start', game: S.selected });
    loadGame(S.selected);
  }

  function endGame(result) {
    if (!isHost || S.phase !== 'playing') return;
    S.lastResult = result ? cleanText(result, 140) : null;
    broadcast({ t: 'lobby', result: S.lastResult });
    backToLobby();
  }

  // ---------- Player ----------
  function startClient() {
    S.code = joinCode;
    $('status-text').textContent = `Joining room ${joinCode}…`;
    const peer = new Peer(PEER_OPTS);
    S.peer = peer;
    const timer = setTimeout(() => {
      if (S.phase === 'connecting') {
        fail("Couldn't reach the room. The host may have closed it, or your network may be blocking direct connections.");
      }
    }, JOIN_TIMEOUT_MS);

    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + joinCode, { reliable: true });
      S.hostConn = conn;
      conn.on('open', () => conn.send({ t: 'hello', name: GN.playerName() }));
      conn.on('data', msg => { if (msg && msg.t === 'welcome') clearTimeout(timer); onHostMessage(msg); });
      conn.on('close', () => {
        if (S.leaving || S.phase === 'error') return;
        fail('The host left, so the room has closed.', { title: 'Room closed', newRoom: true });
      });
    });

    peer.on('error', err => {
      if (S.leaving) return;
      if (err.type === 'peer-unavailable' || S.phase === 'connecting') fail(describeError(err));
      else console.warn('[room]', err.type, err);
    });
  }

  function onHostMessage(msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    switch (msg.t) {
      case 'welcome': {
        S.players = sanitizePlayers(msg.players);
        S.me = S.players.find(p => p.id === String(msg.you)) || { id: String(msg.you), name: GN.playerName(), color: 'slate', host: false };
        S.selected = validGameId(msg.selected) ? msg.selected : null;
        S.lastResult = msg.lastResult ? cleanText(msg.lastResult, 140) : null;
        S.phase = 'lobby';
        if (validGameId(msg.game)) loadGame(msg.game);
        else render();
        break;
      }
      case 'players': {
        const before = new Map(S.players.map(p => [p.id, p.name]));
        S.players = sanitizePlayers(msg.players);
        const now = new Set(S.players.map(p => p.id));
        for (const p of S.players) if (!before.has(p.id)) GN.toast(p.name + ' joined');
        for (const [id, name] of before) if (!now.has(id)) GN.toast(name + ' left');
        if (S.me) S.me = S.players.find(p => p.id === S.me.id) || S.me;
        playersChanged();
        break;
      }
      case 'select':
        S.selected = validGameId(msg.game) ? msg.game : null;
        render();
        break;
      case 'start':
        if (validGameId(msg.game)) { S.lastResult = null; loadGame(msg.game); }
        break;
      case 'lobby':
        S.lastResult = msg.result ? cleanText(msg.result, 140) : null;
        backToLobby();
        break;
      case 'game':
        deliverToFrame(String(msg.from), msg.type, msg.data);
        break;
      case 'full':
        fail(`This room is full. Rooms hold up to ${MAX_PLAYERS} players.`, { title: 'Room is full', newRoom: true });
        break;
      case 'bye':
        fail('The host closed the room.', { title: 'Room closed', newRoom: true });
        break;
    }
  }

  // ---------- Game frame ----------
  function loadGame(id) {
    S.game = id;
    S.phase = 'playing';
    S.frameReady = false;
    S.frameQueue = [];
    frame.src = 'games/' + encodeURIComponent(id) + '/?room=' + encodeURIComponent(S.code);
    render();
    frame.focus();
  }

  function unloadFrame() {
    S.frameReady = false;
    S.frameQueue = [];
    if (frame.getAttribute('src') !== 'about:blank') frame.src = 'about:blank';
  }

  function backToLobby() {
    S.game = null;
    S.phase = 'lobby';
    unloadFrame();
    render();
  }

  function postToFrame(msg) {
    if (S.phase !== 'playing') return;
    if (!S.frameReady) { S.frameQueue.push(msg); return; }
    if (frame.contentWindow) frame.contentWindow.postMessage(msg, location.origin);
  }
  function deliverToFrame(from, type, data) {
    if (typeof type !== 'string') return;
    postToFrame({ gn: 'msg', from, type, data });
  }

  window.addEventListener('message', e => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || typeof m.gn !== 'string' || S.phase !== 'playing') return;
    switch (m.gn) {
      case 'ready': {
        S.frameReady = true;
        frame.contentWindow.postMessage({
          gn: 'init', code: S.code, me: S.me, players: S.players, hostId: hostId(), game: S.game,
        }, location.origin);
        const queued = S.frameQueue.splice(0);
        queued.forEach(postToFrame);
        break;
      }
      case 'send': {
        const to = typeof m.to === 'string' ? m.to : null;
        if (isHost) route(S.me.id, to, m.type, m.data);
        else if (S.hostConn && S.hostConn.open) S.hostConn.send({ t: 'game', to, type: m.type, data: m.data });
        break;
      }
      case 'end':
        endGame(m.result);
        break;
    }
  });

  function playersChanged() {
    if (S.phase === 'playing') postToFrame({ gn: 'players', players: S.players, hostId: hostId() });
    render();
  }

  // ---------- Leaving ----------
  function leave() {
    S.leaving = true;
    try {
      if (isHost) broadcast({ t: 'bye' });
      else if (S.hostConn && S.hostConn.open) S.hostConn.send({ t: 'bye' });
    } catch (e) { /* ignore */ }
    setTimeout(() => {
      try { if (S.peer) S.peer.destroy(); } catch (e) { /* ignore */ }
      location.href = './';
    }, 150);
  }

  function askLeave() {
    const inRoom = S.phase === 'lobby' || S.phase === 'playing';
    if (!inRoom) { location.href = './'; return; }
    $('confirm-leave-text').textContent = isHost
      ? 'You are the host. Leaving closes the room for everyone.'
      : 'You can rejoin with the code while the room is open.';
    const dlg = $('confirm-leave');
    dlg.returnValue = '';
    dlg.showModal();
  }
  $('confirm-leave').addEventListener('close', e => { if (e.target.returnValue === 'leave') leave(); });
  $('leave-btn').addEventListener('click', askLeave);
  $('play-leave').addEventListener('click', askLeave);
  $('logo-link').addEventListener('click', e => {
    if (S.phase === 'lobby' || S.phase === 'playing') { e.preventDefault(); askLeave(); }
  });

  window.addEventListener('beforeunload', e => {
    if (S.leaving || !(S.phase === 'lobby' || S.phase === 'playing')) return;
    if (isHost && S.conns.size > 0) { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('pagehide', () => {
    if (S.leaving) return;
    try {
      if (isHost) broadcast({ t: 'bye' });
      else if (S.hostConn && S.hostConn.open) S.hostConn.send({ t: 'bye' });
    } catch (e) { /* ignore */ }
  });

  // ---------- Lobby controls ----------
  $('copy-link').addEventListener('click', async () => {
    const ok = await GN.copyText(roomLink(), $('share-link'));
    GN.toast(ok ? 'Link copied' : 'Press Ctrl+C (or ⌘C) to copy the link');
  });

  $('name-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('my-name');
    const name = GN.setPlayerName(input.value);
    if (isHost) {
      S.me.name = uniqueName(name, S.me.id);
      broadcast({ t: 'players', players: S.players });
      playersChanged();
    } else if (S.hostConn && S.hostConn.open) {
      S.hostConn.send({ t: 'rename', name });
    }
    input.blur();
    GN.toast('Name saved');
  });

  $('start-btn').addEventListener('click', startGame);
  $('end-btn').addEventListener('click', () => endGame(null));
  $('howto-btn').addEventListener('click', () => {
    const g = gameById(S.game);
    if (!g) return;
    $('howto-title').textContent = 'How to play ' + g.title;
    $('howto-text').textContent = g.howTo;
    $('howto').showModal();
  });

  // ---------- Rendering ----------
  function render() {
    const inRoom = S.phase === 'lobby' || S.phase === 'playing';
    $('view-connecting').hidden = S.phase !== 'connecting';
    $('view-error').hidden = S.phase !== 'error';
    $('view-lobby').hidden = S.phase !== 'lobby';
    $('view-play').hidden = S.phase !== 'playing';
    $('leave-btn').hidden = !inRoom;
    $('room-tag').hidden = !inRoom;
    if (S.code) $('room-tag-code').textContent = S.code;
    document.title = inRoom ? `Room ${S.code} · Game Night` : 'Room · Game Night';

    if (S.phase === 'lobby') renderLobby();
    if (S.phase === 'playing') renderPlayBar();
  }

  function renderLobby() {
    $('code-text').replaceChildren(...S.code.split('').map(ch => el('span', { text: ch })));
    $('code-text').setAttribute('aria-label', 'Room code ' + S.code.split('').join(' '));
    $('share-link').value = roomLink();

    const list = $('player-list');
    list.replaceChildren(...S.players.map(p => el('li', { class: 'c-' + p.color },
      el('span', { class: 'avatar', 'aria-hidden': 'true', text: p.name.charAt(0).toUpperCase() }),
      el('span', { class: 'nm', text: p.name }),
      el('span', { class: 'tags' },
        p.host && el('span', { class: 'badge', text: 'Host' }),
        S.me && p.id === S.me.id && el('span', { class: 'badge', text: 'You' })))));
    if (S.players.length === 1) {
      list.append(el('li', { class: 'empty-slot' },
        el('span', { class: 'avatar', 'aria-hidden': 'true' }),
        el('span', { class: 'nm', text: 'Waiting for friends to join…' })));
    }
    $('player-count').textContent = `${S.players.length} / ${MAX_PLAYERS}`;

    const nameInput = $('my-name');
    if (document.activeElement !== nameInput && S.me) nameInput.value = S.me.name;

    const last = $('last-result');
    last.hidden = !S.lastResult;
    last.textContent = S.lastResult ? 'Last game: ' + S.lastResult : '';

    renderPicker();

    const startBtn = $('start-btn');
    const hint = $('start-hint');
    if (isHost) {
      const check = startCheck();
      const g = gameById(S.selected);
      startBtn.hidden = false;
      startBtn.disabled = !check.ok;
      startBtn.textContent = g ? 'Start ' + g.title : 'Start';
      hint.textContent = check.why;
    } else {
      startBtn.hidden = true;
      hint.textContent = "The host starts the game when everyone's in.";
    }
  }

  function pickCard(g, interactive) {
    const n = S.players.length;
    const [min, max] = g.players;
    const warn = n < min ? `Needs ${min - n} more ${min - n === 1 ? 'player' : 'players'}` : n > max ? `Up to ${max} players` : null;
    return el('button', {
      class: 'pick c-' + g.color, type: 'button', role: 'radio',
      'aria-checked': String(S.selected === g.id),
      disabled: !interactive,
      onclick: interactive ? () => selectGame(g.id) : null,
    },
      el('span', { class: 't', text: g.title }),
      g.blurb && el('span', { class: 'd', text: g.blurb }),
      el('span', { class: 'badges' },
        el('span', { class: 'badge p', text: GN.playersLabel(g.players) }),
        g.dev && el('span', { class: 'badge', text: 'Dev' })),
      warn && el('span', { class: 'warn', text: warn }));
  }

  function renderPicker() {
    const picker = $('game-picker');
    if (isHost) {
      $('pick-title').textContent = 'Pick a game';
      if (!S.pickable.length) {
        picker.replaceChildren(el('p', { class: 'picker-empty', text: 'No multiplayer games yet. Games with "online" in their modes in games.json will show up here.' }));
        return;
      }
      picker.replaceChildren(...S.pickable.map(g => pickCard(g, true)));
    } else {
      $('pick-title').textContent = 'Up next';
      const g = gameById(S.selected);
      picker.replaceChildren(g ? pickCard(g, false) : el('p', { class: 'picker-empty', text: 'The host is choosing a game.' }));
    }
  }

  function renderPlayBar() {
    const g = gameById(S.game);
    const play = $('view-play');
    play.className = 'play c-' + (g ? g.color : 'slate');
    $('play-title').querySelector('span').textContent = g ? g.title : S.game;
    $('play-code').textContent = 'ROOM ' + S.code;
    $('play-players').textContent = S.players.map(p => p.name).join(', ');
    $('end-btn').hidden = !isHost;
    $('howto-btn').hidden = !(g && g.howTo);
    document.title = (g ? g.title : 'Playing') + ` · Room ${S.code}`;
  }

  // ---------- Boot ----------
  (async function boot() {
    try {
      S.allGames = await GN.loadGames({ includeDev: true });
    } catch (err) {
      console.error(err);
      S.allGames = [];
    }
    S.pickable = S.allGames.filter(g => GN.playableOnline(g) && (!g.dev || dev));

    if (typeof Peer === 'undefined') {
      fail("Couldn't load the connection library. Check your internet connection and reload the page.");
      return;
    }
    if (!isHost && !GN.isValidCode(joinCode)) {
      fail(`"${cleanText(rawCode, 12)}" isn't a room code. Codes are 4 letters or numbers, like KQ7P.`, { title: 'Check the code', newRoom: true });
      return;
    }
    if (isHost) startHost(0);
    else startClient();
  })();
})();
