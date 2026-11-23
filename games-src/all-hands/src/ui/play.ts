/** The play screen: the canvas, the HUD pills, and the touch controls. */
import { Renderer, type Chat } from '../render/renderer';
import { PLAYER, PLAYER_TEXT } from '../render/palette';
import type { World } from '../sim/world';
import { In } from '../sim/types';
import type { Input } from '../input/input';
import { fmtTime, h } from './dom';

export interface PlayHud {
  names: string[];
  /** players driven from another computer */
  remote: boolean[];
  practice: number | null;
}

export class PlayView {
  readonly el: HTMLElement;
  readonly renderer: Renderer;
  private timer: HTMLElement;
  private keyPill: HTMLElement;
  private home: HTMLElement[] = [];
  private strip: HTMLElement;
  private hint: HTMLElement;
  private hintUntil = 0;
  private touch: HTMLElement | null = null;
  private lastKey = '';
  private lastStrip = '';

  constructor(
    w: World,
    private readonly hud: PlayHud,
    input: Input,
    on: { pause(): void; swap(): void },
    touch: boolean,
  ) {
    const canvas = h('canvas', { class: 'map', 'aria-label': `${w.lv.name}: the level` });
    this.timer = h('span', { class: 'hud-pill hud-timer', role: 'timer' }, '0:00');
    this.keyPill = h('span', { class: 'hud-pill hud-key' });
    const homes = h('span', { class: 'home-pips', 'aria-label': 'Who is home' });
    for (let i = 0; i < 4; i++) {
      const pip = h('span', { class: 'pip', style: { borderColor: PLAYER[i] } });
      this.home.push(pip);
      homes.append(pip);
    }
    this.strip = h('div', { class: 'hud-strip' });
    this.hint = h('div', { class: 'hud-hint', role: 'status' }, w.lv.hint);
    this.hintUntil = performance.now() / 1000 + 6;
    this.el = h(
      'div',
      { class: 'play' },
      canvas,
      h(
        'div',
        { class: 'hud-top' },
        h(
          'div',
          { class: 'hud-left' },
          h('button', { class: 'hud-btn', 'aria-label': 'Pause', onclick: on.pause }, pauseIcon()),
          h('span', { class: 'hud-pill' }, h('b', { class: 'lvl-id' }, w.lv.id), ' ', w.lv.name),
        ),
        this.timer,
        h('div', { class: 'hud-right' }, this.keyPill, h('span', { class: 'hud-pill' }, 'Home ', homes)),
      ),
      this.hint,
      this.strip,
    );
    if (touch) {
      this.touch = touchControls(input, on);
      this.el.append(this.touch);
    }
    this.renderer = new Renderer(canvas);
  }

  showHint(text: string, now: number): void {
    this.hint.textContent = text;
    this.hintUntil = now + 4;
  }

  update(w: World, time: number, now: number): void {
    this.timer.textContent = fmtTime(time);
    const carrier = w.key.carrier;
    const k = w.doorOpen ? 'open' : carrier ? `p${carrier.p?.n ?? -1}` : 'none';
    if (k !== this.lastKey) {
      this.lastKey = k;
      this.keyPill.replaceChildren(keyIcon());
      if (w.doorOpen) this.keyPill.append('Door open: press Down at it');
      else if (carrier && carrier.p) this.keyPill.append(h('b', { style: { color: PLAYER_TEXT[carrier.p.n] } }, this.hud.names[carrier.p.n]), ' has the key');
      else if (carrier) this.keyPill.append('Someone is carrying a friend with the key');
      else this.keyPill.append('Find the key');
    }
    w.players.forEach((p, i) => this.home[i].classList.toggle('in', p.p!.inside));
    this.home.forEach((pip, i) => (pip.style.background = w.players[i].p!.inside ? PLAYER[i] : 'transparent'));
    const sk = this.hud.names.join('|') + this.hud.practice;
    if (sk !== this.lastStrip) {
      this.lastStrip = sk;
      this.strip.replaceChildren(
        ...this.hud.names.map((n, i) =>
          h(
            'span',
            { class: 'hud-pill chip' + (this.hud.practice === i ? ' active' : '') },
            h('span', { class: 'chip-n', style: { background: PLAYER[i], color: i === 3 ? '#3d3d5c' : '#fff' } }, String(i + 1)),
            n,
            this.hud.remote[i] ? h('span', { class: 'chip-net', title: 'online' }, ' · online') : null,
          ),
        ),
      );
      if (this.hud.practice !== null) this.strip.append(h('span', { class: 'hud-pill' }, 'Tab: switch player'));
    }
    this.hint.classList.toggle('show', now < this.hintUntil);
    void time;
  }

  draw(w: World, alpha: number, now: number, chats: Chat[], smooth: boolean, reduced: boolean): void {
    this.renderer.draw(w, { alpha, now, chats, smooth, reduced });
  }

  resize(): void {
    this.renderer.resize();
  }
}

function pauseIcon(): SVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 18');
  s.setAttribute('width', '16');
  s.setAttribute('height', '18');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect x="1" y="1" width="5" height="16" rx="2" fill="currentColor"/><rect x="10" y="1" width="5" height="16" rx="2" fill="currentColor"/>';
  return s;
}

function keyIcon(): SVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 9 6');
  s.setAttribute('width', '27');
  s.setAttribute('height', '18');
  s.setAttribute('shape-rendering', 'crispEdges');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M0 1h3v1h-3zM0 2h1v2h-1zM2 2h1v2h-1zM0 4h3v1h-3zM3 2h6v1h-6zM6 3h1v2h-1zM8 3h1v1h-1z" fill="#ffb703"/>';
  return s;
}

/** Left: a move pad (left, right, and down for the door). Right: Jump and Grab. */
function touchControls(input: Input, on: { pause(): void; swap(): void }): HTMLElement {
  const knob = h('div', { class: 't-knob' });
  const pad = h('div', { class: 't-pad', role: 'group', 'aria-label': 'Move pad' }, knob);
  let padId: number | null = null;
  const setPad = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    let b = input.touchBits & ~(In.Left | In.Right | In.Down);
    if (dx < -0.25) b |= In.Left;
    if (dx > 0.25) b |= In.Right;
    if (dy > 0.55) b |= In.Down;
    input.touchBits = b;
    knob.style.transform = `translate(${Math.max(-1, Math.min(1, dx)) * 34}px, ${Math.max(-1, Math.min(1, dy)) * 34}px)`;
  };
  pad.addEventListener('pointerdown', (e) => {
    padId = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    input.last = 'touch';
    setPad(e);
  });
  pad.addEventListener('pointermove', (e) => e.pointerId === padId && setPad(e));
  const endPad = (e: PointerEvent) => {
    if (e.pointerId !== padId) return;
    padId = null;
    input.touchBits &= ~(In.Left | In.Right | In.Down);
    knob.style.transform = '';
  };
  pad.addEventListener('pointerup', endPad);
  pad.addEventListener('pointercancel', endPad);
  const hold = (label: string, bit: number, cls: string) => {
    const b = h('button', { class: `t-btn ${cls}` }, label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      input.touchBits |= bit;
      input.last = 'touch';
    });
    const up = () => (input.touchBits &= ~bit);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  };
  const chat = h('button', { class: 't-small', 'aria-label': 'Quick chat', onpointerdown: (e: Event) => (e.preventDefault(), (input.touchChat = true)) }, '💬');
  chat.textContent = '';
  chat.append(chatIcon());
  return h('div', { class: 'touch' }, pad, h('div', { class: 't-right' }, chat, hold('Grab', In.Grab, 't-grab'), hold('Jump', In.Jump, 't-jump')));
  void on;
}

function chatIcon(): SVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', '22');
  s.setAttribute('height', '22');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>';
  return s;
}
