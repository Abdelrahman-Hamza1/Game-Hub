/** Tiny DOM helpers. */
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener> & { html?: string };
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Focus the first focusable element in a container (for keyboard and gamepad players). */
export function focusFirst(el: Element): void {
  const f = el.querySelector<HTMLElement>('[autofocus], button:not([disabled]), [href], input, select');
  f?.focus({ preventScroll: true });
}
