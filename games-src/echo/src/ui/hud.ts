/** HUD: time, stones, tourists, heartbeat (brief §5.2). */
import type { Game } from '../game/game';
import { formatTime } from '../game/scoring';
import { ICON, el } from './dom';

export type HeartLevel = 'none' | 'calm' | 'fast' | 'pounding';

/** Heartbeat band by path distance to the nearest Listener: > 8, 4–8, < 4 tiles. */
export function heartLevel(game: Game): HeartLevel {
  if (!game.listeners.length) return 'none';
  const d = game.nearestThreat;
  if (d < 4) return 'pounding';
  if (d <= 8) return 'fast';
  return 'calm';
}

export class Hud {
  private time: HTMLElement;
  private stones: HTMLElement;
  private stonesChip: HTMLElement;
  private tourists: HTMLElement;
  private touristsChip: HTMLElement;
  private heart: HTMLElement;
  private heartLabel: HTMLElement;
  private hint: HTMLElement;
  private hintTimer = 0;
  private last = '';

  constructor(private readonly root: HTMLElement, onPause: () => void) {
    this.time = el('b', { text: '0:00.0' });
    this.stones = el('b', { text: '0' });
    this.stonesChip = el('span', { class: 'hud-chip', title: 'Stones' }, el('span', { class: 'lbl', text: 'Stones' }), this.stones);
    this.tourists = el('b', { text: '0/0' });
    this.touristsChip = el('span', { class: 'hud-chip', title: 'Tourists rescued' }, el('span', { class: 'lbl', text: 'Tourists' }), this.tourists);
    this.heartLabel = el('span', { class: 'lbl', text: 'Calm' });
    this.heart = el('span', { class: 'hud-chip heart', 'data-level': 'calm', title: 'Heartbeat: how close the nearest Listener is' });
    this.heart.innerHTML = ICON.heart;
    this.heart.append(this.heartLabel);
    const pause = el('button', { class: 'hud-btn', type: 'button', 'aria-label': 'Pause (Esc)', title: 'Pause (Esc)', onclick: () => onPause() });
    pause.innerHTML = ICON.pause;
    this.hint = el('div', { class: 'hint gone' });
    root.replaceChildren(
      el('div', { class: 'hud-group' },
        el('span', { class: 'hud-chip', title: 'Time' }, el('span', { class: 'lbl', text: 'Time' }), this.time),
        this.stonesChip, this.touristsChip, this.heart),
      el('div', { class: 'hud-group' }, pause),
    );
    root.parentElement?.append(this.hint);
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    if (!on) this.hint.classList.add('gone');
  }

  showHint(text: string, seconds = 7): void {
    if (!text) return;
    this.hint.textContent = text;
    this.hint.classList.remove('gone');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.add('gone'), seconds * 1000);
  }

  hideHint(): void {
    clearTimeout(this.hintTimer);
    this.hint.classList.add('gone');
  }

  update(game: Game): void {
    const p = game.player;
    const h = heartLevel(game);
    const key = `${Math.floor(game.t * 10)}|${p.stones}|${game.stats.rescued}|${h}`;
    if (key === this.last) return;
    this.last = key;
    this.time.textContent = formatTime(game.t);
    this.stones.textContent = String(p.stones);
    this.stonesChip.classList.toggle('dim', p.stones === 0);
    this.touristsChip.hidden = game.stats.total === 0;
    this.tourists.textContent = `${game.stats.rescued}/${game.stats.total}`;
    this.heart.hidden = h === 'none';
    this.heart.dataset.level = h;
    this.heartLabel.textContent = h === 'pounding' ? 'Pounding' : h === 'fast' ? 'Fast' : 'Calm';
  }
}
