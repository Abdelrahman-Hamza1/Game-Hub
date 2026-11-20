/* Game Night SDK — include this one script in every game:
 *
 *   <script src="../../shared/gamenight.js"></script>
 *
 * It adds the "back to Game Night" bar, saves progress, remembers the last game played,
 * and connects the game to a room when it runs inside one.
 *
 *   const { meta, room } = await GameNight.ready();
 *   if (room) { ...online play... } else { ...solo / same screen... }
 *
 * GameNight
 *   .id                      this game's id (its folder name)
 *   .inRoom                  true when running inside a room
 *   .ready()                 Promise<{ meta, room }>. meta is this game's entry from games.json.
 *   .save(key, value)        store JSON-able data for this game (in this browser)
 *   .load(key, fallback)     read it back
 *   .playerName()            the player's name
 *   .sound.on                whether sound is on (toggle lives in the bar)
 *   .sound.onChange(fn)      called with true/false when the player toggles sound
 *
 * room (null outside a room)
 *   .code, .me {id,name,color,host}, .players [...], .hostId, .isHost
 *   .send(type, data)        to every other player
 *   .sendTo(playerId, type, data)
 *   .sendToHost(type, data)  (if you are the host, it's delivered to you)
 *   .on(type, (data, fromId) => {})   returns an unsubscribe function
 *   .onPlayers(players => {})         someone joined, left, or renamed
 *   .end(resultText)         host only: back to the lobby for everyone, showing resultText
 *
 * Messages must be plain data (JSON-like). Keep them small; they go over the network.
 */
(function () {
  'use strict';
  if (window.GameNight) return;

  const script = document.currentScript;
  const ROOT = new URL('../', script.src).href; // this file lives in <root>/shared/
  const here = new URL('.', location.href).href;
  const rel = here.startsWith(ROOT) ? here.slice(ROOT.length) : '';
  const parts = rel.split('/').filter(Boolean);
  const ID = (script.dataset.game) || (parts[0] === 'games' && parts[1]) || parts[parts.length - 1] || 'game';
  const params = new URLSearchParams(location.search);
  const IN_ROOM = window.parent !== window && params.has('room');

  const COLORS = { red: '#e0452b', gold: '#f2b01e', mint: '#17936f', sky: '#3466e8', plum: '#8048d0', slate: '#3a4570' };

  // ---------- Storage ----------
  function get(key, fallback) {
    try { const raw = localStorage.getItem('gn:' + key); return raw === null ? fallback : JSON.parse(raw); }
    catch (e) { return fallback; }
  }
  function set(key, value) {
    try { localStorage.setItem('gn:' + key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }

  // Match the site's theme choice
  const theme = get('theme', null);
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

  if (!IN_ROOM) set('last', { id: ID, at: Date.now() });

  // ---------- Sound ----------
  const soundListeners = new Set();
  const sound = {
    get on() { return get('sound', true) !== false; },
    set(on) { set('sound', !!on); soundListeners.forEach(fn => { try { fn(!!on); } catch (e) { console.error(e); } }); },
    onChange(fn) { soundListeners.add(fn); return () => soundListeners.delete(fn); },
  };

  // ---------- Game info from games.json ----------
  const metaPromise = fetch(ROOT + 'games.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : []))
    .then(list => (Array.isArray(list) && list.find(g => g && g.id === ID)) || { id: ID, title: ID })
    .catch(() => ({ id: ID, title: ID }));

  // ---------- Room client (talks to room.html, which owns the connection) ----------
  let room = null;
  let roomPromise = Promise.resolve(null);

  if (IN_ROOM) {
    const handlers = new Map();       // type -> Set(fn)
    const playerHandlers = new Set();
    const buffered = [];              // messages that arrived before a handler for their type
    const post = msg => window.parent.postMessage(msg, location.origin);

    function emit(from, type, data) {
      const fns = handlers.get(type);
      if (!fns || !fns.size) {
        if (buffered.length < 500) buffered.push({ from, type, data });
        return;
      }
      fns.forEach(fn => { try { fn(data, from); } catch (e) { console.error(e); } });
    }

    room = {
      code: params.get('room'),
      me: null,
      players: [],
      hostId: null,
      get isHost() { return !!this.me && this.me.id === this.hostId; },
      send(type, data) { post({ gn: 'send', type: String(type), data }); },
      sendTo(to, type, data) {
        if (this.me && to === this.me.id) { setTimeout(() => emit(this.me.id, String(type), data)); return; }
        post({ gn: 'send', to: String(to), type: String(type), data });
      },
      sendToHost(type, data) { this.sendTo(this.hostId, type, data); },
      on(type, fn) {
        type = String(type);
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(fn);
        // hand over anything that arrived before this handler existed
        for (let i = 0; i < buffered.length;) {
          if (buffered[i].type === type) { const m = buffered.splice(i, 1)[0]; try { fn(m.data, m.from); } catch (e) { console.error(e); } }
          else i++;
        }
        return () => handlers.get(type).delete(fn);
      },
      onPlayers(fn) { playerHandlers.add(fn); return () => playerHandlers.delete(fn); },
      end(result) { post({ gn: 'end', result: result == null ? null : String(result).slice(0, 140) }); },
      playerName(id) { const p = this.players.find(x => x.id === id); return p ? p.name : 'Someone'; },
    };

    roomPromise = new Promise(resolve => {
      window.addEventListener('message', e => {
        if (e.source !== window.parent || e.origin !== location.origin) return;
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.gn === 'init') {
          room.code = m.code;
          room.me = m.me;
          room.players = m.players || [];
          room.hostId = m.hostId;
          resolve(room);
        } else if (m.gn === 'players') {
          room.players = m.players || [];
          room.hostId = m.hostId || room.hostId;
          const me = room.players.find(p => room.me && p.id === room.me.id);
          if (me) room.me = me;
          playerHandlers.forEach(fn => { try { fn(room.players); } catch (err) { console.error(err); } });
        } else if (m.gn === 'msg') {
          emit(m.from, m.type, m.data);
        }
      });
      post({ gn: 'ready' });
    });
  }

  // ---------- Bar (only outside a room; the room page has its own) ----------
  const ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  };

  const CSS = `
  .gn-bar{position:sticky;top:0;z-index:1000;display:flex;align-items:center;gap:8px;
    padding:8px max(12px,env(safe-area-inset-right,0px)) 8px max(12px,env(safe-area-inset-left,0px));
    padding-top:calc(8px + env(safe-area-inset-top,0px));
    background:var(--surface,#fff);color:var(--ink,#141a2e);border-bottom:3px solid var(--gn-c,#3a4570);
    font:500 14px/1.2 var(--f-body,system-ui,-apple-system,"Segoe UI",sans-serif);box-sizing:border-box}
  .gn-bar *{box-sizing:border-box}
  .gn-bar a,.gn-bar button{appearance:none;font:inherit;color:inherit;background:none;border:1px solid transparent;border-radius:8px;
    display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 10px;text-decoration:none;cursor:pointer}
  .gn-bar a:hover,.gn-bar button:hover{background:var(--bg,#eef1f6)}
  .gn-bar :focus-visible{outline:3px solid var(--focus,#3466e8);outline-offset:1px}
  .gn-bar svg{width:18px;height:18px;flex:none}
  .gn-back{font-family:var(--f-logo,Impact,system-ui,sans-serif)!important;font-size:13px!important;letter-spacing:.02em}
  .gn-title{display:inline-flex;align-items:center;gap:8px;font-weight:700;min-width:0;padding-left:6px;border-left:1px solid var(--line,#d6dbe7)}
  .gn-title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gn-dot{width:10px;height:10px;border-radius:50%;background:var(--gn-c,#3a4570);flex:none}
  .gn-spacer{flex:1}
  @media (max-width:560px){.gn-bar .gn-lbl{display:none}.gn-bar a,.gn-bar button{padding:0 8px}}
  .gn-dialog{border:1px solid var(--line,#d6dbe7);border-radius:12px;background:var(--surface,#fff);color:var(--ink,#141a2e);
    padding:22px;width:min(460px,calc(100% - 32px));font:400 15px/1.55 var(--f-body,system-ui,sans-serif)}
  .gn-dialog::backdrop{background:rgba(10,13,28,.55)}
  .gn-dialog h2{margin:0 0 10px;font:800 1.2rem/1.2 var(--f-head,system-ui,sans-serif)}
  .gn-dialog p{margin:0 0 8px;white-space:pre-line;color:var(--muted,#5a6380)}
  .gn-dialog .gn-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}
  .gn-dialog .gn-actions a,.gn-dialog .gn-actions button{font:700 14px/1 var(--f-body,system-ui,sans-serif);border-radius:8px;padding:10px 16px;
    border:1.5px solid var(--line,#d6dbe7);background:transparent;color:inherit;text-decoration:none;cursor:pointer}
  .gn-dialog .gn-actions .gn-primary{background:var(--accent,#e0452b);border-color:transparent;color:var(--on-accent,#fff)}
  `;

  function h(tag, attrs, html) {
    const n = document.createElement(tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }

  function dialog(title, text, actions) {
    const d = h('dialog', { class: 'gn-dialog' });
    const h2 = h('h2'); h2.textContent = title;
    const p = h('p'); p.textContent = text;
    const row = h('div', { class: 'gn-actions' });
    actions.forEach(a => row.append(a));
    d.append(h2, p, row);
    document.body.append(d);
    return d;
  }

  function buildBar(meta) {
    const style = h('style'); style.textContent = CSS; document.head.append(style);
    const bar = h('header', { class: 'gn-bar', role: 'banner' });
    bar.style.setProperty('--gn-c', COLORS[meta.color] || COLORS.slate);

    const back = h('a', { class: 'gn-back', href: ROOT, title: 'Back to Game Night' }, ICONS.back + '<span class="gn-lbl">Game Night</span>');
    const title = h('span', { class: 'gn-title' }, '<i class="gn-dot"></i><span></span>');
    title.querySelector('span').textContent = meta.title || ID;
    bar.append(back, title, h('span', { class: 'gn-spacer' }));

    if (meta.howTo) {
      const btn = h('button', { type: 'button', title: 'How to play' }, ICONS.help + '<span class="gn-lbl">How to play</span>');
      const close = h('button', { class: 'gn-primary', type: 'button' }); close.textContent = 'Got it';
      const d = dialog('How to play ' + (meta.title || ''), String(meta.howTo), [close]);
      close.addEventListener('click', () => d.close());
      btn.addEventListener('click', () => d.showModal());
      bar.append(btn);
    }

    const sBtn = h('button', { type: 'button' });
    const paintSound = () => {
      sBtn.innerHTML = sound.on ? ICONS.soundOn : ICONS.soundOff;
      sBtn.setAttribute('aria-label', sound.on ? 'Mute sound' : 'Turn sound on');
      sBtn.setAttribute('aria-pressed', String(!sound.on));
      sBtn.title = sBtn.getAttribute('aria-label');
    };
    paintSound();
    sBtn.addEventListener('click', () => { sound.set(!sound.on); paintSound(); });
    bar.append(sBtn);

    if (document.fullscreenEnabled) {
      const fBtn = h('button', { type: 'button', 'aria-label': 'Fullscreen', title: 'Fullscreen' }, ICONS.full);
      fBtn.addEventListener('click', () => {
        const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      });
      bar.append(fBtn);
    }

    document.body.prepend(bar);
  }

  /** An online-only game opened directly: offer to host a room with it. */
  function needsRoomNotice(meta) {
    const host = h('a', { class: 'gn-primary', href: ROOT + 'room.html?game=' + encodeURIComponent(ID) }); host.textContent = 'Host a room';
    const back = h('a', { href: ROOT }); back.textContent = 'Back to Game Night';
    const d = dialog((meta.title || 'This game') + ' is played in a room',
      'Start a room, share the code with friends, and pick this game in the lobby. Have a code already? Join from the Game Night home page.',
      [back, host]);
    d.addEventListener('cancel', e => e.preventDefault());
    d.showModal();
  }

  function onDom(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  if (!IN_ROOM) {
    metaPromise.then(meta => onDom(() => {
      buildBar(meta);
      const modes = Array.isArray(meta.modes) ? meta.modes : ['solo'];
      if (!modes.includes('solo') && !modes.includes('same-screen') && script.dataset.roomNotice !== 'off') needsRoomNotice(meta);
    }));
  }

  // ---------- Public API ----------
  window.GameNight = {
    id: ID,
    root: ROOT,
    inRoom: IN_ROOM,
    sound,
    ready() {
      return Promise.all([metaPromise, roomPromise]).then(([meta, r]) => ({ meta, room: r }));
    },
    save(key, value) { set('game:' + ID + ':' + key, value); },
    load(key, fallback) { return get('game:' + ID + ':' + key, fallback); },
    playerName() {
      if (room && room.me) return room.me.name;
      const n = get('name', null);
      return typeof n === 'string' && n.trim() ? n : 'Player';
    },
  };
})();
