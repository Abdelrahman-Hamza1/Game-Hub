/** Behind the logo: a tiny heist (1-1's solution) plays on repeat with every copy at once. */
import { levelById } from '../levels';
import { Renderer } from '../render/renderer';
import { HZ } from '../sim/constants';
import { Preview } from '../sim/scrub';
import { runSolution } from '../solutions/run';
import sol from '../solutions/1-01';
import { h } from './dom';

export class TitleDemo {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private preview: Preview | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private hold = 0;
  private running = false;

  constructor(host: HTMLElement) {
    this.canvas = h('canvas', { class: 'title-demo', 'aria-hidden': 'true' });
    host.prepend(this.canvas);
    this.renderer = new Renderer(this.canvas);
    this.renderer.padTop = 0;
    const lv = levelById('1-1');
    if (!lv) return;
    this.renderer.setLevel(lv);
    const r = runSolution(lv, sol);
    this.preview = new Preview(lv);
    this.preview.setPlan([...r.session.lanes, r.session.rec], r.loopTicks);
    this.preview.seek(0);
  }

  start(): void {
    if (!this.preview) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.renderer.resize();
      const w = this.preview!.world;
      this.renderer.draw(w, { alpha: Math.min(1, this.acc * HZ), now: now / 1000, lanes: [], showPaths: false, selected: -1, colorblind: false, reduced: false, debug: false, rewind: -1, caught: null, zoom: 0.9 });
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private step(dt: number): void {
    const w = this.preview!.world;
    if (w.status !== 'running') {
      this.hold += dt;
      if (this.hold > 1.6) {
        this.hold = 0;
        this.preview!.seek(0);
      }
      return;
    }
    this.acc += dt * 0.8;
    while (this.acc >= 1 / HZ && w.status === 'running') {
      this.acc -= 1 / HZ;
      w.tick(null);
      w.events = [];
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }
}
