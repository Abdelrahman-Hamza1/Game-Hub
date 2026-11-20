/**
 * Fixed-timestep loop: the simulation advances in exact 1/60 s steps; rendering runs once per
 * animation frame. A long frame (tab in background) is capped so the sim never spirals.
 */
import { SIM_DT } from '../game/constants';

export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  /** Smoothed frames per second (debug overlay). */
  fps = 60;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 8) {
        this.update(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps === 8) this.acc = 0;
      this.render(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
