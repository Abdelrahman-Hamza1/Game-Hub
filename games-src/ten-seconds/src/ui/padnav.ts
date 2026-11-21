/**
 * Gamepad navigation for menus: D-pad or stick moves focus between buttons and fields, A presses,
 * B goes back (the same as Esc). Only runs while a menu is open.
 */
export function startPadNav(getRoot: () => HTMLElement | null, onBack: () => void): () => void {
  let raf = 0;
  let prev: boolean[] = [];
  let lastMove = 0;
  const focusables = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [href]')].filter((el) => el.offsetParent !== null);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const root = getRoot();
    let pad: Gamepad | null = null;
    try {
      pad = (navigator.getGamepads?.() ?? []).find((p): p is Gamepad => !!p) ?? null;
    } catch {
      pad = null;
    }
    if (!root || !pad) return;
    const b = pad.buttons.map((x) => x.pressed);
    const edge = (i: number) => b[i] && !prev[i];
    const y = pad.axes[1] ?? 0;
    const x = pad.axes[0] ?? 0;
    let dir = 0;
    if (edge(12) || edge(14)) dir = -1;
    if (edge(13) || edge(15)) dir = 1;
    if (!dir && now - lastMove > 220 && (Math.abs(y) > 0.6 || Math.abs(x) > 0.6)) dir = (Math.abs(y) > Math.abs(x) ? y : x) > 0 ? 1 : -1;
    if (dir) {
      lastMove = now;
      const list = focusables(root);
      if (list.length) {
        const i = list.indexOf(document.activeElement as HTMLElement);
        const next = list[(i + dir + list.length) % list.length] ?? list[0];
        next.focus();
        next.scrollIntoView({ block: 'nearest' });
      }
    }
    if (edge(0)) (document.activeElement as HTMLElement | null)?.click();
    if (edge(1) || edge(9)) onBack();
    prev = b;
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
