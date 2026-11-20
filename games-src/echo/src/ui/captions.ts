/**
 * Captions (brief §5.2): important sounds show a short label at the screen edge in their direction,
 * e.g. "Growl ←", "Drip ↑", "Tourist calling →".
 */
import type { HeardSound } from '../audio/audio';
import { arrowFor } from '../audio/mix';
import type { Renderer } from '../render/renderer';
import type { Game } from '../game/game';
import type { SoundKind } from '../sound/pulses';
import { el } from './dom';

const LABEL: Partial<Record<SoundKind, string>> = {
  growl: 'Growl',
  drip: 'Drip',
  wind: 'Wind',
  call: 'Tourist calling',
  breath: 'Breathing',
  swarm: 'Swarm!',
  rumble: 'Cart rumbling',
  crash: 'Crash',
  stone: 'Stone lands',
};

const STYLE: Partial<Record<SoundKind, string>> = { growl: 'threat', swarm: 'threat', call: 'warm', breath: 'warm' };

interface Live {
  node: HTMLElement;
  until: number;
}

export class Captions {
  enabled = true;
  private live = new Map<string, Live>();

  constructor(private readonly root: HTMLElement, private readonly renderer: Renderer) {}

  clear(): void {
    this.root.replaceChildren();
    this.live.clear();
  }

  show(game: Game, heard: HeardSound[]): void {
    if (!this.enabled) return;
    const now = performance.now();
    for (const h of heard) {
      const p = h.pulse;
      let label = LABEL[p.kind];
      if (p.fake) label = (p.kind === 'clap' ? 'Clap' : 'Click') + ' (off-key)';
      if (!label) continue;
      if (p.kind === 'breath' && h.gain < 0.05) continue;
      const dx = p.x - game.player.x;
      const dy = p.y - game.player.y;
      const text = `${label} ${arrowFor(dx, dy)}`;
      const key = p.kind + (p.fake ? '*' : '') + Math.round(p.x / 3) + ',' + Math.round(p.y / 3);
      let c = this.live.get(key);
      if (!c) {
        const node = el('div', { class: 'caption ' + (STYLE[p.kind] ?? '') });
        this.root.append(node);
        c = { node, until: 0 };
        this.live.set(key, c);
      }
      c.node.textContent = text;
      c.node.classList.remove('fading');
      c.until = now + 1800;
      this.place(c.node, p.x, p.y);
    }
  }

  /** Place on the ray from the screen centre toward the source, clamped inside the edges. */
  private place(node: HTMLElement, wx: number, wy: number): void {
    const r = this.renderer;
    const s = r.worldToScreen(wx, wy);
    const cx = r.width / 2;
    const cy = r.height / 2;
    const mx = Math.min(140, r.width * 0.22);
    const my = 70;
    const inside = s.x > mx && s.x < r.width - mx && s.y > my + 30 && s.y < r.height - my;
    let x = s.x;
    let y = s.y - r.scale * 0.9;
    if (!inside) {
      const dx = s.x - cx;
      const dy = s.y - cy;
      const kx = dx !== 0 ? (cx - mx) / Math.abs(dx) : Infinity;
      const ky = dy !== 0 ? (cy - my) / Math.abs(dy) : Infinity;
      const k = Math.min(kx, ky, 1);
      x = cx + dx * k;
      y = cy + dy * k;
    }
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  }

  tick(): void {
    const now = performance.now();
    for (const [key, c] of this.live) {
      if (now > c.until + 500) {
        c.node.remove();
        this.live.delete(key);
      } else if (now > c.until) {
        c.node.classList.add('fading');
      }
    }
  }
}
