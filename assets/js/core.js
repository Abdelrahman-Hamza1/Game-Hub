/* Game Night — helpers shared by the site pages (hub, room, about).
   Games don't include this file; they use shared/gamenight.js instead. */
(function () {
  'use strict';

  // ---------- Storage (every key is prefixed "gn:" and JSON-encoded) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('gn:' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('gn:' + key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    },
    remove(key) {
      try { localStorage.removeItem('gn:' + key); } catch (e) { /* storage blocked */ }
    },
  };

  // ---------- DOM ----------
  /** el('a', {class: 'x', href: '/', text: 'Hi', onclick: fn}, child, child) */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function toast(text, ms) {
    let region = document.querySelector('.toasts');
    if (!region) {
      region = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.append(region);
    }
    const t = el('div', { class: 'toast', text });
    region.append(t);
    setTimeout(() => t.remove(), ms || 3200);
  }

  async function copyText(text, fallbackInput) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      if (fallbackInput) { fallbackInput.focus(); fallbackInput.select(); }
      return false;
    }
  }

  // ---------- Theme ----------
  function effectiveTheme() {
    const set = document.documentElement.dataset.theme;
    if (set === 'light' || set === 'dark') return set;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    store.set('theme', theme);
  }

  // ---------- Dev mode: ?dev turns it on (and remembers), ?dev=off turns it off ----------
  function devMode() {
    const p = new URLSearchParams(location.search);
    if (p.has('dev')) store.set('dev', p.get('dev') !== 'off');
    return store.get('dev', false) === true;
  }

  // ---------- Player names ----------
  const ADJ = ['Lucky', 'Sneaky', 'Brave', 'Sleepy', 'Cosmic', 'Jolly', 'Swift', 'Fuzzy', 'Mighty', 'Quiet', 'Wild', 'Clever', 'Spicy', 'Tiny'];
  const ANIMAL = ['Fox', 'Otter', 'Panda', 'Moose', 'Gecko', 'Owl', 'Badger', 'Llama', 'Koala', 'Raven', 'Yak', 'Crab', 'Walrus', 'Lynx'];
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function cleanName(name, fallback) {
    const s = String(name == null ? '' : name)
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20);
    return s || fallback || 'Player';
  }
  function playerName() {
    let n = store.get('name', null);
    if (typeof n !== 'string' || !n.trim()) {
      n = pick(ADJ) + ' ' + pick(ANIMAL);
      store.set('name', n);
    }
    return cleanName(n);
  }
  function setPlayerName(n) {
    const clean = cleanName(n, playerName());
    store.set('name', clean);
    return clean;
  }

  // ---------- Room codes: 4 characters, no look-alikes (0/O, 1/I/L) ----------
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function randomCode() {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  }
  function normalizeCode(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function isValidCode(s) {
    return /^[A-HJKMNP-Z2-9]{4}$/.test(s);
  }

  // ---------- Games list ----------
  const COLORS = ['red', 'sky', 'mint', 'gold', 'plum', 'slate'];
  const PATTERNS = ['dots', 'grid', 'checker', 'stripes', 'rings', 'ladder'];
  const MODES = ['solo', 'same-screen', 'online'];
  const MODE_LABEL = { solo: 'Solo', 'same-screen': 'Same screen', online: 'Online' };
  const NEW_FOR_DAYS = 21;

  function normalizeGame(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw.id)) return null;
    let players = Array.isArray(raw.players) ? raw.players.map(Number) : [1, 1];
    if (players.length === 1) players = [players[0], players[0]];
    let [min, max] = players;
    if (!Number.isFinite(min) || min < 1) min = 1;
    if (!Number.isFinite(max) || max < min) max = min;
    const modes = (Array.isArray(raw.modes) ? raw.modes : ['solo']).filter(m => MODES.includes(m));
    const added = raw.added ? new Date(raw.added) : null;
    const ageDays = added && !isNaN(added) ? (Date.now() - added.getTime()) / 864e5 : Infinity;
    return {
      id: raw.id,
      no: index + 1,
      title: String(raw.title || raw.id),
      blurb: String(raw.blurb || ''),
      howTo: raw.howTo ? String(raw.howTo) : '',
      players: [min, max],
      modes: modes.length ? modes : ['solo'],
      color: COLORS.includes(raw.color) ? raw.color : COLORS[index % COLORS.length],
      pattern: PATTERNS.includes(raw.pattern) ? raw.pattern : PATTERNS[index % PATTERNS.length],
      thumb: typeof raw.thumb === 'string' ? raw.thumb : null,
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      added: raw.added || null,
      isNew: ageDays >= 0 && ageDays <= NEW_FOR_DAYS,
      dev: raw.dev === true,
      href: 'games/' + raw.id + '/',
    };
  }

  /** Loads games.json. Dev-only games are left out unless includeDev is true. */
  async function loadGames(opts) {
    const includeDev = !!(opts && opts.includeDev);
    const res = await fetch('games.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('games.json returned ' + res.status);
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error('games.json must be a list');
    return list.map(normalizeGame).filter(g => g && (includeDev || !g.dev));
  }

  function playersLabel(players) {
    const [a, b] = players;
    return a === b ? a + 'P' : a + '–' + b + 'P';
  }
  function playableAlone(g) { return g.modes.includes('solo'); }
  function playableTogether(g) { return g.players[1] > 1 && (g.modes.includes('online') || g.modes.includes('same-screen')); }
  function playableOnline(g) { return g.modes.includes('online') && g.players[1] > 1; }

  function timeAgo(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = s / 60; if (m < 60) return Math.round(m) + ' min ago';
    const h = m / 60; if (h < 24) return Math.round(h) + (Math.round(h) === 1 ? ' hour ago' : ' hours ago');
    const d = h / 24; if (d < 30) return Math.round(d) + (Math.round(d) === 1 ? ' day ago' : ' days ago');
    return new Date(ts).toLocaleDateString();
  }

  // ---------- Shared page setup: theme toggle, dev chip ----------
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

  function initPage() {
    const btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      const paint = () => {
        const dark = effectiveTheme() === 'dark';
        btn.innerHTML = dark ? SUN : MOON;
        btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
        btn.title = btn.getAttribute('aria-label');
      };
      paint();
      btn.addEventListener('click', () => { setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'); paint(); });
    }
    if (devMode()) {
      const end = document.querySelector('.topbar .end');
      if (end) end.prepend(el('a', { class: 'dev-chip', href: '?dev=off', title: 'Dev mode shows games marked "dev" in games.json. Click to turn it off.', text: 'DEV' }));
    }
  }

  window.GN = {
    store, el, toast, copyText,
    effectiveTheme, setTheme, devMode, initPage,
    cleanName, playerName, setPlayerName,
    randomCode, normalizeCode, isValidCode,
    loadGames, normalizeGame, playersLabel, playableAlone, playableTogether, playableOnline,
    timeAgo, COLORS, MODE_LABEL,
  };
})();
