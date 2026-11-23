import './style.css';
import { App } from './app';
import { hub } from './hub';
import { levelById } from './levels';
import { solutionFor } from './solutions';
import { Driver } from './solutions/run';

const app = new App(document.getElementById('app')!);
const gn = hub();
if (gn?.inRoom) void gn.ready().then(({ room }) => (room ? app.startOnline(room) : app.title()));
else app.title();

/**
 * Browser test hook: `__allHands.autoplay('2-4')` starts a level with four placeholder players and
 * lets the scripted solution drive them through the real game loop.
 */
(window as unknown as { __allHands: unknown }).__allHands = {
  app,
  /** run the game faster than real time (for automated playthroughs) */
  set speed(v: number) {
    app.speed = v;
  },
  autoplay(id: string) {
    const lv = levelById(id);
    const sol = lv && solutionFor(id);
    if (!lv || !sol) return false;
    (app as unknown as { slots: unknown[] }).slots = [0, 1, 2, 3].map((i) => ({ name: `Bot ${i + 1}`, device: null, peer: null }));
    app.startLevel(id);
    app.autopilot = new Driver(sol);
    return true;
  },
  /** let a solution drive the current players without changing who is in which slot */
  botsKeepSlots(id: string) {
    const sol = solutionFor(id);
    if (!sol || !app.session || app.session.lv.id !== id) return false;
    app.autopilot = new Driver(sol);
    return true;
  },
  get status() {
    const s = app.session;
    return s ? { level: s.lv.id, status: s.world.status, t: s.time, pops: s.world.pops } : null;
  },
};
