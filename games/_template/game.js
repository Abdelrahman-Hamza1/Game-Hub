/* Tap Test: the starter template, and a quick way to check that rooms work.
 * Copy this folder to games/<your-game-id>/ to begin a new game.
 *
 * Solo: tap as many times as you can in 10 seconds. Best score is saved.
 * Room: everyone's taps show up live for everyone. The host can reset or finish.
 */
(async function () {
  'use strict';
  const { room } = await GameNight.ready();

  const $ = id => document.getElementById(id);
  const countEl = $('count');
  const statusEl = $('status');
  const tapBtn = $('tap-btn');

  // A tiny click sound that respects the bar's mute button.
  let audio = null;
  function blip() {
    if (!GameNight.sound.on) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 660 + Math.random() * 120;
      g.gain.setValueAtTime(0.08, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.08);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.08);
    } catch (e) { /* no audio */ }
  }

  if (room) online(room);
  else solo();

  // ---------- Solo ----------
  function solo() {
    const ROUND_MS = 10000;
    let count = 0, running = false, endsAt = 0, timer = null;
    const showBest = () => {
      const best = GameNight.load('best', 0);
      $('best').textContent = best ? `Best: ${best} taps` : '';
    };
    showBest();

    tapBtn.addEventListener('click', () => {
      if (!running) {
        running = true; count = 0; endsAt = performance.now() + ROUND_MS;
        timer = setInterval(tick, 100);
      }
      count++;
      countEl.textContent = count;
      blip();
    });

    function tick() {
      const left = Math.max(0, endsAt - performance.now());
      statusEl.textContent = `${(left / 1000).toFixed(1)}s left`;
      if (left > 0) return;
      clearInterval(timer);
      running = false;
      const best = GameNight.load('best', 0);
      if (count > best) GameNight.save('best', count);
      statusEl.textContent = count > best ? `New best: ${count} taps!` : `${count} taps. Tap to go again.`;
      tapBtn.disabled = true;
      setTimeout(() => { tapBtn.disabled = false; }, 800); // stop accidental restarts
      showBest();
    }
  }

  // ---------- Room ----------
  function online(room) {
    $('mode-label').textContent = 'Room ' + room.code;
    statusEl.textContent = 'Everyone taps together. Counts update live.';
    $('board').hidden = false;
    const counts = new Map(); // player id -> taps

    const render = () => {
      countEl.textContent = counts.get(room.me.id) || 0;
      const rows = room.players
        .map(p => ({ p, n: counts.get(p.id) || 0 }))
        .sort((a, b) => b.n - a.n);
      $('board').replaceChildren(...rows.map(({ p, n }) => {
        const li = document.createElement('li');
        li.className = 'c-' + p.color;
        const dot = document.createElement('i'); dot.className = 'dot';
        const nm = document.createElement('span'); nm.className = 'nm';
        nm.textContent = p.name + (p.id === room.me.id ? ' (you)' : '');
        const num = document.createElement('span'); num.className = 'n'; num.textContent = n;
        li.append(dot, nm, num);
        return li;
      }));
      $('host-row').hidden = !room.isHost;
    };

    tapBtn.addEventListener('click', () => {
      counts.set(room.me.id, (counts.get(room.me.id) || 0) + 1);
      room.send('tap');
      blip();
      render();
    });

    room.on('tap', (data, from) => { counts.set(from, (counts.get(from) || 0) + 1); render(); });
    room.on('reset', () => { counts.clear(); render(); });
    room.onPlayers(render);

    $('reset-btn').addEventListener('click', () => { counts.clear(); room.send('reset'); render(); });
    $('finish-btn').addEventListener('click', () => {
      let top = null;
      for (const p of room.players) if (!top || (counts.get(p.id) || 0) > (counts.get(top.id) || 0)) top = p;
      const n = top ? counts.get(top.id) || 0 : 0;
      room.end(n ? `${top.name} tapped the most (${n})` : 'Nobody tapped');
    });

    render();
  }
})();
