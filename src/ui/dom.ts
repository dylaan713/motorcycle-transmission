/** Creates an element with a class, attributes and children; touches the DOM only when called. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls: string, attrs: Record<string, string> = {}, ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

/** Text for screen readers only. */
export const srOnly = (text: string): HTMLElement => el('span', 'sr-only', {}, text);

/** Writes an element's text only when it changed. */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}
