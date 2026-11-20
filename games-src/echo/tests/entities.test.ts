import { describe, expect, it } from 'vitest';
import { LISTENER_SEARCH_TIME, SIM_DT } from '../src/game/constants';
import { resultOf } from '../src/game/scoring';
import { mergeBest } from '../src/storage';
import { game, idx, lvl, press, run } from './helpers';

const OPEN = [
  '########################',
  '#S.....................#',
  '#......................#',
  '#......................#',
  '#...................C..#',
  '#.....................E#',
  '########################',
];

describe('Listener states', () => {
  it('patrol → hunt on a sound → search on arrival → patrol', () => {
    const g = game(lvl(...OPEN), { seed: 5 });
    const L = g.listeners[0];
    expect(L.state).toBe('patrol');
    g.player.x = 12.5;
    g.player.y = 2.5;
    press(g, { clap: true });
    expect(L.state).toBe('hunt');
    expect(g.stats.alerts).toBe(1);
    // Get out of the way so it doesn't catch us, then let it arrive.
    g.player.x = 1.5;
    g.player.y = 1.5;
    let searched = false;
    let searchStart = 0;
    for (let i = 0; i < 60 * 10; i++) {
      press(g, {});
      if (L.state === 'search' && !searched) {
        searched = true;
        searchStart = g.t;
        expect(L.at).toBe(idx(g.level, 12, 2));
      }
      if (searched && L.state === 'patrol') break;
    }
    expect(searched).toBe(true);
    expect(L.state).toBe('patrol');
    expect(g.t - searchStart).toBeGreaterThanOrEqual(LISTENER_SEARCH_TIME - SIM_DT);
    expect(g.t - searchStart).toBeLessThan(LISTENER_SEARCH_TIME + 1.5);
    expect(g.stats.alerts).toBe(1);
  });

  it('a new sound while hunting retargets it without a new alert', () => {
    const g = game(lvl(...OPEN), { seed: 2 });
    const L = g.listeners[0];
    g.player.x = 14.5; g.player.y = 3.5;
    press(g, { clap: true });
    const first = L.huntSource;
    run(g, 0.8);
    g.player.x = 18.5; g.player.y = 1.5;
    run(g, 0.05);
    press(g, { clap: true });
    expect(L.state).toBe('hunt');
    expect(L.huntSource).not.toBe(first);
    expect(g.stats.alerts).toBe(1);
  });

  it('growls every 5–9 s', () => {
    const g = game(lvl(...OPEN), { seed: 9 });
    g.player.x = 1.5; g.player.y = 5.5; // stay far and silent
    let growls = 0;
    for (let i = 0; i < 60 * 60; i++) {
      press(g, {});
      for (const e of g.drainEvents()) if (e.type === 'sound' && e.pulse.kind === 'growl') growls++;
      if (g.status !== 'playing') break;
    }
    expect(growls).toBeGreaterThanOrEqual(6);
    expect(growls).toBeLessThanOrEqual(13);
  });

  it('catches Mira within 0.75 tiles', () => {
    const g = game(lvl(...OPEN));
    const L = g.listeners[0];
    g.player.x = L.x + 0.7;
    g.player.y = L.y;
    press(g, {});
    expect(g.status).toBe('failed');
    expect(g.failReason).toBe('Heard.');
  });
});

const TOUR = [
  '##############',
  '#S.P.........#',
  '#...........E#',
  '##############',
];

describe('tourists', () => {
  it('breathe softly while sitting (radius 2, not heard by Listeners)', () => {
    const g = game(lvl(...TOUR));
    const breaths: number[] = [];
    for (let i = 0; i < 60 * 7; i++) {
      press(g, {});
      for (const e of g.drainEvents()) if (e.type === 'sound' && e.pulse.kind === 'breath') {
        breaths.push(g.t);
        expect(e.pulse.radius).toBe(2);
        expect(e.pulse.hear).toBe(0);
      }
    }
    expect(breaths.length).toBe(2);
    expect(breaths[1] - breaths[0]).toBeCloseTo(3, 1);
  });

  it('follow one tile behind when held, silently', () => {
    const g = game(lvl(...TOUR));
    g.player.x = 3.0;
    press(g, { hand: true });
    const T = g.tourists[0];
    expect(T.state).toBe('held');
    run(g, 2.5, () => ({ moveX: 1 }));
    const gap = Math.hypot(T.x - g.player.x, T.y - g.player.y);
    expect(gap).toBeGreaterThan(0.6);
    expect(gap).toBeLessThan(1.5);
  });

  it('panic 2 s after being let go, calling out every 2 s (radius 8, heard)', () => {
    const g = game(lvl(...TOUR));
    g.player.x = 3.0;
    press(g, { hand: true });
    run(g, 0.5);
    press(g, { hand: true }); // let go
    const T = g.tourists[0];
    const released = g.t;
    expect(T.state).toBe('waiting');
    const calls: number[] = [];
    for (let i = 0; i < 60 * 7; i++) {
      press(g, {});
      for (const e of g.drainEvents()) if (e.type === 'sound' && e.pulse.kind === 'call') {
        calls.push(g.t - released);
        expect(e.pulse.radius).toBe(8);
        expect(e.pulse.hear).toBe(8);
      }
    }
    expect(T.state).toBe('panic');
    expect(calls[0]).toBeGreaterThan(2);
    expect(calls[0]).toBeLessThan(2.1);
    expect(calls[1] - calls[0]).toBeCloseTo(2, 1);
    expect(calls.length).toBe(3);
    // Taking their hand again calms them.
    g.player.x = T.x + 0.5;
    g.player.y = T.y;
    press(g, { hand: true });
    expect(T.state).toBe('held');
  });

  it('clapping frees the hand for 0.5 s without panic', () => {
    const g = game(lvl(...TOUR));
    g.player.x = 3.0;
    press(g, { hand: true });
    const T = g.tourists[0];
    press(g, { clap: true });
    expect(g.player.handBusy(g.t)).toBe(false);
    run(g, 0.6);
    expect(T.state).toBe('held');
    expect(g.player.handBusy(g.t)).toBe(true);
    run(g, 3);
    expect(T.state).toBe('held');
  });

  it('bringing every tourist out ends the level with the Guide rank', () => {
    const g = game(lvl(...TOUR));
    g.player.x = 3.0;
    press(g, { hand: true });
    run(g, 6, () => ({ moveX: 1, moveY: 0.4 }));
    expect(g.status).toBe('won');
    expect(g.stats.rescued).toBe(1);
    const r = resultOf(g);
    expect(r.ranks).toContain('guide');
    expect(r.ranks).toContain('survivor');
  });

  it('stepping onto the exit without them asks first; E leaves without Guide', () => {
    const g = game(lvl(...TOUR));
    run(g, 6, () => ({ moveX: 1, moveY: 0.4, sneak: false }));
    expect(g.status).toBe('playing');
    expect(g.player.onExit).toBe(true);
    expect(g.drainEvents().some((e) => e.type === 'message' && /still down here/.test(e.text))).toBe(true);
    press(g, { hand: true });
    expect(g.status).toBe('won');
    expect(resultOf(g).ranks).not.toContain('guide');
  });

  it('E grabs a tourist even right next to a minecart', () => {
    const L = lvl(
      '##############',
      '#S.PH=====...#',
      '#...........E#',
      '##############',
    );
    const g = game(L);
    g.player.x = 3.0;
    press(g, { hand: true });
    expect(g.tourists[0].state).toBe('held');
    expect(g.carts[0].rolling).toBe(false);
  });
});

describe('Guide checkpoints', () => {
  it('records a checkpoint at the first hand-hold on Guide only', () => {
    const guide = game(lvl(...TOUR), { difficulty: 'guide' });
    const blind = game(lvl(...TOUR), { difficulty: 'blind' });
    for (const g of [guide, blind]) {
      g.player.x = 3.0;
      press(g, { hand: true });
    }
    expect(guide.checkpoint).not.toBeNull();
    expect(guide.checkpoint!.held).toBe(0);
    expect(blind.checkpoint).toBeNull();
  });
});

describe('best results', () => {
  it('keeps the best of each field and the union of ranks', () => {
    const a = { time: 80, sounds: 30, alerts: 2, rescued: 1, total: 2, ranks: ['survivor' as const] };
    const b = { time: 95, sounds: 12, alerts: 0, rescued: 2, total: 2, ranks: ['ghost' as const, 'guide' as const, 'survivor' as const] };
    const m = mergeBest(a, b);
    expect(m).toEqual({ time: 80, sounds: 12, alerts: 0, rescued: 2, total: 2, ranks: ['ghost', 'guide', 'survivor'] });
  });
});

describe('device wording', () => {
  it('rewords keyboard hints for touch and gamepad', async () => {
    const { wordFor } = await import('../src/ui/wording');
    expect(wordFor('Hold Shift to sneak. Quiet steps carry only a tile.', 'touch')).toBe('Turn on Sneak. Quiet steps carry only a tile.');
    expect(wordFor('Press E beside a minecart to push it.', 'gamepad')).toBe('Press Y beside a minecart to push it.');
    expect(wordFor('stand on rubble and press E to pick one up.', 'touch')).toBe('stand on rubble and tap Hand to pick one up.');
    expect(wordFor('Clap to see. Follow the wind.', 'keyboard')).toBe('Clap to see. Follow the wind.');
  });
});
