/** Just enough of a DOM for the small UI mounts: elements with attributes, text, children and listeners. */
export class FakeElement {
  className = '';
  hidden = false;
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  style = { props: new Map<string, string>(), setProperty(k: string, v: string) { this.props.set(k, v); } };
  listeners = new Map<string, Array<(e: unknown) => void>>();
  private text = '';
  constructor(readonly tagName: string) {}
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  removeAttribute(k: string): void { this.attrs.delete(k); }
  append(...nodes: Array<FakeElement | string>): void {
    for (const n of nodes) {
      if (typeof n === 'string') { this.text += n; continue; }
      n.parent = this; this.children.push(n);
    }
  }
  remove(): void { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(t: string) { this.text = t; this.children = []; }
  addEventListener(type: string, fn: (e: unknown) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener(type: string, fn: (e: unknown) => void): void { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn)); }
  fire(type: string, e: unknown = {}): void { for (const fn of this.listeners.get(type) ?? []) fn(e); }
  /** Every element under this one, depth first. */
  all(): FakeElement[] { return this.children.flatMap((c) => [c, ...c.all()]); }
}

/** Installs a fake `document` for the duration of `run`. */
export async function withFakeDocument<T>(run: () => Promise<T> | T): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const saved = g.document;
  g.document = { createElement: (tag: string) => new FakeElement(tag.toUpperCase()) };
  try { return await run(); } finally { g.document = saved; }
}
