/** On-screen buttons for touch: Clap, Click, Cane, Sneak (toggle), Hand (brief §8). */
import type { Input } from '../engine/input';
import { el } from './dom';

export class TouchControls {
  private sneak: HTMLButtonElement;

  constructor(private readonly root: HTMLElement, private readonly input: Input) {
    const btn = (label: string, cls: string, act: () => void, title: string) => {
      const b = el('button', { class: 'tbtn ' + cls, type: 'button', 'aria-label': title, text: label });
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        act();
      });
      return b;
    };
    this.sneak = btn('Sneak', '', () => this.toggleSneak(), 'Sneak (toggle)');
    this.sneak.setAttribute('aria-pressed', 'false');
    root.replaceChildren(
      el('div', { class: 'pad left' },
        this.sneak,
        btn('Cane', '', () => input.press('cane'), 'Cane tap')),
      el('div', { class: 'pad right' },
        btn('Hand', '', () => input.press('hand'), 'Hold hand / pick up'),
        btn('Click', '', () => input.press('click'), 'Tongue click'),
        el('span'),
        btn('Clap', 'big', () => input.press('clap'), 'Clap')),
    );
  }

  private toggleSneak(): void {
    this.input.sneakToggle = !this.input.sneakToggle;
    this.sneak.setAttribute('aria-pressed', String(this.input.sneakToggle));
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    document.getElementById('app')?.classList.toggle('touch-on', on);
  }

  reset(): void {
    this.input.sneakToggle = false;
    this.sneak.setAttribute('aria-pressed', 'false');
  }
}
