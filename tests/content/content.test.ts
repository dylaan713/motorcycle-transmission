import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { PARAMS } from '../../src/sim/params';
import { clutchCapacityMax } from '../../src/sim/clutch';
import { DERIVED, howItWorks, howItWorksPlain, type Section } from '../../src/content/howItWorks';
import { GLOSSARY } from '../../src/content/glossary';
import { LESSONS } from '../../src/lessons/lessons';
import { PARTS } from '../../src/model/parts';

const MODEL = readFileSync(new URL('../../docs/MODEL.md', import.meta.url), 'utf8');

/** Every sentence of copy a section shows, joined. */
const sectionText = (s: Section): string => [s.heading, ...s.blocks.flatMap((b) => {
  switch (b.kind) {
    case 'p': return [b.text];
    case 'list': return b.items;
    case 'formula': return [b.label, b.expr, b.where];
    case 'table': return [...b.head, ...b.rows.flat()];
  }
})].join('\n');
const lessonText = (): string => LESSONS.flatMap((l) => [
  l.title, l.summary, ...l.steps.flatMap((s) => [s.title, s.text, s.tryIt ?? '']),
]).join('\n');
const partText = (): string => Object.values(PARTS).flatMap((p) => [p.name, p.role]).join('\n');
const contentText = (): string => [
  ...howItWorks().map(sectionText), ...GLOSSARY.flatMap((t) => [t.term, t.definition]),
].join('\n');

// ---- The brief's tests ------------------------------------------------------------------------

test('the nine sections are present, in order, and say it is a simplified model', () => {
  const s = howItWorks();
  expect(s.map((x) => x.id)).toEqual(['what', 'parts', 'constant-mesh', 'one-shift', 'clutch', 'computes', 'simplified', 'numbers', 'checked']);
  expect(JSON.stringify(s[0])).toMatch(/simplified model/i);
  expect(JSON.stringify(s[7])).toMatch(/not been checked|None of these are measurements/);
});

test('figures in the copy come from PARAMS', () => {
  const text = JSON.stringify(howItWorks());
  expect(text).toContain(clutchCapacityMax.toFixed(0));
  expect(text).toContain(String(PARAMS.engine.limiterRpm.toLocaleString('en-US')));
  for (const [a, b] of Object.values(PARAMS.gears)) expect(text).toContain(`${a}:${b}`);
});

test('the numbers table labels every tuned drum value as tuned', () => {
  const rows = (howItWorks()[7].blocks.find((b) => b.kind === 'table') as { rows: string[][] }).rows;
  for (const name of ['Drum sliding friction', 'Drum static friction', 'Detent strength']) {
    expect(rows.find((r) => r[0] === name)![2]).toMatch(/^Tuned/);
  }
});

test('every source in the numbers table is one of the three kinds', () => {
  const rows = (howItWorks()[7].blocks.find((b) => b.kind === 'table') as { rows: string[][] }).rows;
  for (const r of rows) {
    expect(r[2], r[0]).toMatch(/^(Chosen as representative of a middleweight sport bike|Derived from the values above|Tuned so the modeled )/);
  }
});

test('glossary covers the terms the page uses, one sentence each, no brands', () => {
  const terms = GLOSSARY.map((t) => t.term.toLowerCase());
  for (const need of ['constant mesh', 'dog', 'shift drum', 'shift fork', 'detent', 'false neutral', 'clutch slip', 'primary drive', 'final drive', 'torque', 'gear ratio', 'involute', 'spline', 'rev limiter', 'engine braking']) {
    expect(terms).toContain(need);
  }
  for (const t of GLOSSARY) expect(t.definition.trim().endsWith('.')).toBe(true);
});

test('no hype and no brand names anywhere in the content or the lessons', () => {
  const all = JSON.stringify([howItWorks(), GLOSSARY, LESSONS.map((l) => [l.title, l.summary, l.steps.map((s) => [s.title, s.text, s.tryIt])])]);
  expect(all).not.toMatch(/\b(revolutionary|cutting-edge|seamless|state-of-the-art)\b/i);
});

// ---- Honesty, voice and spelling ----------------------------------------------------------------

const BRANDS = /\b(honda|yamaha|kawasaki|suzuki|ducati|triumph|bmw|ktm|aprilia|harley|davidson|agusta|husqvarna|benelli|enfield|cbr|gsx|ninja|daytona|panigale|hayabusa|yzf|zx-?\d+r?|r1|r6|mt-?\d+)\b/i;
const HYPE = /\b(revolutionary|cutting-edge|seamless|state-of-the-art|powerful|world-class|stunning|simply)\b/i;
const BRITISH = /\b(tyres?|centre[sd]?|colours?|behaviours?|modelled|modelling|travelled|metres?|neighbour\w*|analys(e|ing)|optimis\w+|recognis\w+|labelled|favour\w*|grey|programme|realis(e|ed)|afterwards|bush(es)?|circlips?|comes? round|round (the|a|an|it|to))\b/i;

test('no brands, hype or British spellings in the content, the lessons, the part roles or the model document', () => {
  for (const [name, text] of [['content', contentText()], ['lessons', lessonText()], ['part roles', partText()], ['MODEL.md', MODEL]] as const) {
    expect(text, name).not.toMatch(BRANDS);
    expect(text, name).not.toMatch(HYPE);
    expect(text, name).not.toMatch(BRITISH);
  }
});

test('the site and the model document both carry the honest summary', () => {
  const site = howItWorks().map(sectionText).join('\n');
  for (const text of [site, MODEL].map((t) => t.replace(/\s+/g, ' '))) {
    expect(text).toMatch(/simplified model/i);
    expect(text).toMatch(/representative of a middleweight sport bike/i);
    expect(text).toMatch(/not measurements of any real gearbox/i);
    expect(text).toMatch(/tuned/i);
    expect(text).toMatch(/written by the same AI (coding )?agent/i);
    expect(text).toMatch(/reviewed by other AI agents/i);
    expect(text).toMatch(/no person who rebuilds gearboxes/i);
    expect(text).toMatch(/clutch torque capacity/i); // what a validation would measure
  }
});

test('the plain fallback renders sections one to four as paragraphs, nothing more', () => {
  const plain = howItWorksPlain();
  const [what, parts, mesh, shift, clutch] = howItWorks();
  for (const s of [what, parts, mesh, shift]) expect(plain).toContain(s.heading);
  expect(plain.split('\n\n')).not.toContain(clutch.heading);
  expect(plain).not.toMatch(/[<>]/); // plain text, no markup
  expect(plain).toContain('This is a simplified model.');
  for (const item of (shift.blocks.find((b) => b.kind === 'list') as { items: string[] }).items) {
    expect(plain).toContain(item);
  }
  expect(plain.split(/\n\n+/).length).toBeGreaterThan(10);
});

test('the parts section names every part on the torque path, crank to rear wheel, in order', () => {
  const text = sectionText(howItWorks()[1]);
  const order = ['crank', 'primaryDrive', 'clutchBasket', 'frictionPlates', 'steelPlates', 'clutchHub', 'inputShaft', 'outputShaft', 'sprocket', 'chain', 'rearSprocket', 'rearWheel'] as const;
  const at = order.map((id) => text.indexOf(PARTS[id].name));
  for (const i of at) expect(i).toBeGreaterThanOrEqual(0);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
});

test('every formula has a where line naming its symbols', () => {
  const formulas = howItWorks().flatMap((s) => s.blocks).filter((b) => b.kind === 'formula');
  expect(formulas.length).toBeGreaterThanOrEqual(7);
  for (const f of formulas) {
    expect(f.where.length, f.label).toBeGreaterThan(20);
    expect(f.where.trim().endsWith('.'), f.label).toBe(true);
  }
});

test('every subscripted or Greek symbol in a formula is named in its where line', () => {
  const formulas = howItWorks().flatMap((s) => s.blocks).filter((b) => b.kind === 'formula');
  const SYMBOL = /[A-Z]_[a-z]+|Δω|[ωθφμρ](?:_[a-z]+)?/g;
  const missing: string[] = [];
  for (const f of formulas) {
    for (const sym of new Set(f.expr.match(SYMBOL) ?? [])) {
      if (!f.where.includes(sym)) missing.push(`${f.label}: ${sym}`);
    }
    if (f.expr.includes('′') && !f.where.includes('′')) missing.push(`${f.label}: ′`);
  }
  expect(missing).toEqual([]);
});

test('the site table and MODEL.md give the same source for oil drag and idle', () => {
  const rows = (howItWorks()[7].blocks.find((b) => b.kind === 'table') as { rows: string[][] }).rows;
  const site = (name: string): string => rows.find((r) => r[0] === name)![2];
  const doc = (key: string): string => {
    const row = MODEL.split('\n').find((l) => l.startsWith(`| \`${key}\` |`));
    expect(row, key).toBeDefined();
    return row!.split('|')[4].trim();
  };
  expect(site('Oil drag in the clutch')).toMatch(/^Chosen as representative/);
  expect(doc('clutch.dragCoeff')).toMatch(/^Chosen as representative/);
  expect(doc('clutch.dragMax')).toMatch(/^Chosen as representative/);
  expect(site('Idle speed')).toMatch(/^Chosen as representative/);
  expect(doc('engine.idleRpm')).toMatch(/^Chosen as representative/);
  // the records disagree about the idle throttle limit: both places report that, neither resolves it
  expect(site('Idle throttle authority')).toMatch(/^Tuned .*build notes.*unchanged/);
  expect(doc('engine.idleMaxThrottle')).toMatch(/^Tuned according to HANDOFF\.md; git shows no change/);
});

// ---- Glossary ---------------------------------------------------------------------------------

test('glossary terms are unique, defined in one plain sentence, never by themselves', () => {
  const seen = new Set<string>();
  for (const { term, definition } of GLOSSARY) {
    const key = term.toLowerCase();
    expect(seen.has(key), `duplicate ${term}`).toBe(false);
    seen.add(key);
    const d = definition.trim();
    expect(d, term).toMatch(/^[A-Z]/);
    expect(d.endsWith('.'), term).toBe(true);
    // one sentence: no full stop followed by a new sentence (decimal points and "e.g." aside)
    expect(d.slice(0, -1), term).not.toMatch(/[.!?]\s+[A-Z]/);
    expect(d.length, term).toBeLessThanOrEqual(240);
    expect(d.toLowerCase(), `${term} is defined by itself`).not.toContain(key);
  }
});

/**
 * Technical words the page uses, each with the glossary entry that explains it. A word found
 * anywhere in the lesson copy, the part roles or this content must have its entry.
 */
const CANDIDATES: Array<[RegExp, string]> = [
  [/\bconstant[- ]mesh\b/i, 'constant mesh'], [/\bmesh(ed|es)?\b/i, 'mesh'],
  [/\bdogs?\b/i, 'dog'], [/\bshift drum\b/i, 'shift drum'], [/\bdrum\b/i, 'shift drum'],
  [/\b(shift )?forks?\b/i, 'shift fork'], [/\bdetents?\b/i, 'detent'], [/\bdetent arm\b/i, 'detent arm'],
  [/\bnotch(es)?\b/i, 'notch'], [/\bhump\b/i, 'hump'], [/\bstar wheel\b/i, 'star wheel'],
  [/\bfalse neutral\b/i, 'false neutral'], [/\bneutral\b/i, 'neutral'],
  [/\bslip(s|ping)?\b/i, 'clutch slip'], [/\bprimary drive\b/i, 'primary drive'], [/\bfinal drive\b/i, 'final drive'],
  [/\btorque\b/i, 'torque'], [/\bratios?\b/i, 'gear ratio'], [/\binvolute\b/i, 'involute'], [/\bsplined?\b/i, 'spline'],
  [/\b(rev )?limiter\b/i, 'rev limiter'], [/\bengine braking\b/i, 'engine braking'],
  [/\bclutch basket\b|\bbasket\b/i, 'clutch basket'], [/\bclutch hub\b|\bhub\b/i, 'clutch hub'],
  [/\bfriction plates?\b/i, 'friction plate'], [/\bsteel plates?\b/i, 'steel plate'], [/\bpressure plate\b/i, 'pressure plate'],
  [/\binput shaft\b/i, 'input shaft'], [/\boutput shaft\b/i, 'output shaft'], [/\bcrank(shaft)?\b/i, 'crankshaft'],
  [/\bsprockets?\b/i, 'sprocket'], [/\bchain\b/i, 'chain'], [/\bgear pairs?\b|\bpairs?\b/i, 'gear pair'],
  [/\bfree gears?\b|\bspins? free(ly)?\b/i, 'free gear'], [/\bslid(ing|er)s?\b/i, 'sliding gear'],
  [/\bgrooves?\b/i, 'groove'], [/\bpawl\b/i, 'pawl'], [/\bratchet(s|ing)?\b/i, 'ratchet'], [/\bshift shaft\b/i, 'shift shaft'],
  [/\bidl(e|es|ing)\b/i, 'idle'], [/\bstall(s|ed|ing)?\b/i, 'stall'], [/\bstarter\b/i, 'starter'], [/\bthrottle\b/i, 'throttle'],
  [/\bupshifts?\b/i, 'upshift'], [/\bdownshifts?\b/i, 'downshift'], [/\bclutchless\b/i, 'clutchless upshift'],
  [/\blocked\b/i, 'locked'], [/\bcapacity\b/i, 'clutch capacity'], [/\bclamp force\b/i, 'clamp force'],
  [/\bcoefficient of friction\b|\bfriction coefficient\b/i, 'coefficient of friction'],
  [/\bstatic friction\b|\bstiction\b/i, 'static friction'], [/\bsliding friction\b/i, 'sliding friction'],
  [/\bstick-slip\b/i, 'stick-slip'], [/\bviscous\b|\boil drag\b/i, 'viscous drag'], [/\bdamping\b/i, 'damping'],
  [/\binertia\b/i, 'inertia'], [/\bmomentum\b/i, 'angular momentum'], [/\bbacklash\b/i, 'backlash'],
  [/\bprofile shift\b/i, 'profile shift'], [/\btimestep\b/i, 'timestep'], [/\brpm\b/i, 'rpm'], [/\bN·m\b/, 'N·m'],
  [/\brad\/s\b/, 'rad/s'], [/\brolling resistance\b/i, 'rolling resistance'], [/\bair resistance\b|\baerodynamic drag\b/i, 'air resistance'],
  [/\broad load\b/i, 'road load'], [/\brev-match(ing)?\b|\bblip\b/i, 'rev-matching'], [/\bsequential\b/i, 'sequential gearbox'],
  [/\bwet multi-plate\b|\bwet clutch\b/i, 'wet multi-plate clutch'], [/\btorque map\b/i, 'torque map'],
  [/\btorque path\b|\bdrive path\b/i, 'torque path'], [/\bstroke\b/i, 'pedal stroke'], [/\bgear pedal\b|\bpedal\b/i, 'gear pedal'],
  [/\bclutch lever\b|\blever\b/i, 'clutch lever'], [/\bclunk\b/i, 'clunk'], [/\bdetent strength\b/i, 'detent'],
  [/\bfork compliance\b|\bcompliance\b/i, 'compliance'], [/\bbush(es|ings?)?\b/i, 'bushing'], [/\bbearings?\b/i, 'bearing'],
  [/\bcirclips?\b|\bsnap rings?\b/i, 'snap ring'], [/\bshift pins?\b/i, 'shift pin'], [/\bpushrod\b/i, 'pushrod'], [/\bthrust washers?\b/i, 'thrust washer'], [/\bchain lash\b/i, 'chain lash'],
  [/\bcoast-down\b/i, 'coast-down test'], [/\bcrankpin\b/i, 'crankpin'], [/\bpistons?\b/i, 'piston'],
  [/\blugs?\b/i, 'dog'], [/\bkeyed\b|\btabs?\b/i, 'spline'], [/\bmiddleweight\b/i, 'middleweight sport bike'],
];

test('every technical word in the lessons, the part roles and the content has a glossary entry', () => {
  const terms = new Set(GLOSSARY.map((t) => t.term.toLowerCase()));
  const corpus = [lessonText(), partText(), contentText()].join('\n');
  const missing = CANDIDATES.filter(([re, term]) => re.test(corpus) && !terms.has(term.toLowerCase())).map(([, t]) => t);
  expect([...new Set(missing)]).toEqual([]);
  expect(GLOSSARY.length).toBeGreaterThanOrEqual(60);
});

test('the model document ends with the same glossary, word for word', () => {
  const at = MODEL.search(/^## 9\. Glossary/m);
  expect(at).toBeGreaterThan(0);
  const glossary = MODEL.slice(at);
  for (const { term, definition } of GLOSSARY) expect(glossary, term).toContain(`**${term}**: ${definition}`);
});

// ---- docs/MODEL.md --------------------------------------------------------------------------

/** A dotted path into PARAMS (array indices and gear numbers as keys), or undefined. */
function fromParams(path: string): number | undefined {
  let v: unknown = PARAMS;
  for (const k of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return typeof v === 'number' ? v : undefined;
}
const resolve = (path: string): number | undefined => fromParams(path) ?? DERIVED[path];

const MARKER = /<!-- param:([\w.]+) -->/g;
const FIGURE = /([−-]?\d[\d,]*(?:\.\d+)?)([^\d<]{0,24})<!-- param:([\w.]+) -->/g;

test('every marked figure in MODEL.md matches PARAMS or a derived value, to the precision written', () => {
  const markers = [...MODEL.matchAll(MARKER)];
  const figures = [...MODEL.matchAll(FIGURE)];
  expect(markers.length).toBeGreaterThan(100);
  expect(figures.length, 'a marker with no number just before it').toBe(markers.length);
  const wrong: string[] = [];
  for (const [, written, , path] of figures) {
    const want = resolve(path);
    if (want === undefined) { wrong.push(`${path}: no such value`); continue; }
    const n = Number(written.replace(/,/g, '').replace('−', '-'));
    const decimals = written.includes('.') ? written.split('.')[1].length : 0;
    if (Math.abs(n - want) > 0.5 * 10 ** -decimals + 1e-12) wrong.push(`${path}: wrote ${written}, value ${want}`);
  }
  expect(wrong).toEqual([]);
});

test('the parameter table in MODEL.md marks every number in PARAMS', () => {
  const marked = new Set([...MODEL.matchAll(MARKER)].map((m) => m[1]));
  const leaves: string[] = [];
  const walk = (v: unknown, path: string[]): void => {
    if (typeof v === 'number') leaves.push(path.join('.'));
    else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
  };
  walk(PARAMS, []);
  const missing = leaves.filter((p) => !p.startsWith('sliders.') && !marked.has(p));
  expect(missing).toEqual([]);
});

test('every derived value is used in MODEL.md', () => {
  const marked = new Set([...MODEL.matchAll(MARKER)].map((m) => m[1]));
  expect(Object.keys(DERIVED).filter((k) => !marked.has(k))).toEqual([]);
});

test('MODEL.md has its nine parts and fifteen questions, with no unconfirmed owner markers', () => {
  const heads = [...MODEL.matchAll(/^## (\d)\. /gm)].map((m) => Number(m[1]));
  expect(heads).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const qa = MODEL.slice(MODEL.search(/^## 8\. /m), MODEL.search(/^## 9\. /m)).replace(MARKER, '');
  expect([...qa.matchAll(/^### /gm)].length).toBeGreaterThanOrEqual(15);
  for (const q of ['Did you write this code?', 'How do you know it is right?', 'Why is neutral between first and second?', 'What is the timestep', 'Where do the numbers come from?', 'What would you measure to validate it?', 'Why are the dogs given a 16° window?']) {
    expect(qa).toContain(q);
  }
  // the owner confirmed the sentences that speak for him on 2026-11-18, so no marker may remain
  expect(MODEL).not.toContain('[owner: confirm or edit]');
  // a part-by-part table drawn from the part registry
  for (const p of Object.values(PARTS)) expect(MODEL, p.name).toContain(p.name);
});
