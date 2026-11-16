import { BufferGeometry, Float32BufferAttribute, Matrix4, ShapeUtils, Vector2, Vector3 } from 'three';

/**
 * Solid builders. A solid is a flat list of triangles, 9 numbers each (x, y, z of three corners),
 * every one closed and wound counter-clockwise seen from outside. `toGeometry` turns solids into one
 * non-indexed BufferGeometry whose normals are split at creases, so flat faces shade flat and
 * curved faces shade smooth.
 */
export type Solid = number[];

/** Default crease angle: faces meeting at more than this keep separate normals, rad. */
const CREASE = (40 * Math.PI) / 180;
/** Vertices closer than this are the same vertex, m. */
const WELD = 1e-9;

const signedArea = (pts: Vector2[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

/** Drop repeated points and points that lie on the straight line between their neighbours. */
function cleanRing(pts: Vector2[]): Vector2[] {
  let ring = pts.filter((p, i) => p.distanceTo(pts[(i + 1) % pts.length]) > WELD);
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    const next = ring.filter((p, i) => {
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
      const u = p.clone().sub(a), v = b.clone().sub(p);
      const straight = Math.abs(u.cross(v)) <= 1e-12 * u.length() * v.length() && u.dot(v) > 0;
      return !straight;
    });
    changed = next.length !== ring.length;
    ring = next;
  }
  return ring;
}

const orient = (pts: Vector2[], ccw: boolean): Vector2[] => {
  const ring = cleanRing(pts);
  return (signedArea(ring) > 0) === ccw ? ring : ring.reverse();
};

/**
 * Extrude an outline in the y-z plane along x from x0 to x1, with holes. Outline Vector2 (u, v) is
 * the world point (x, u, v).
 */
export function prism(outline: Vector2[], holes: Vector2[][], x0: number, x1: number): Solid {
  const outer = orient(outline, true);
  const inner = holes.map((h) => orient(h, false));
  const all = [...outer, ...inner.flat()];
  const faces = ShapeUtils.triangulateShape(outer.slice(), inner.map((h) => h.slice()));
  const out: Solid = [];
  const put = (p: Vector2, x: number): void => { out.push(x, p.x, p.y); };
  for (const f of faces) {
    let [a, b, c] = f.map((i) => all[i]);
    if (signedArea([a, b, c]) < 0) [b, c] = [c, b];
    put(a, x1); put(b, x1); put(c, x1);
    put(a, x0); put(c, x0); put(b, x0);
  }
  for (const ring of [outer, ...inner]) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      put(p, x0); put(q, x0); put(q, x1);
      put(p, x0); put(q, x1); put(p, x1);
    }
  }
  return out;
}

/**
 * A flat cap at x over a simple polygon in the y-z plane, facing +x or -x. It uses only the
 * polygon's own points, so it closes a surface whose rim is exactly that ring.
 */
export function polygonCap(ring: Vector2[], x: number, facesPlusX: boolean): Solid {
  const out: Solid = [];
  for (const f of ShapeUtils.triangulateShape(ring.slice(), [])) {
    let [a, b, c] = f.map((i) => ring[i]);
    if ((signedArea([a, b, c]) > 0) !== facesPlusX) [b, c] = [c, b];
    out.push(x, a.x, a.y, x, b.x, b.y, x, c.x, c.y);
  }
  return out;
}

/**
 * Revolve a closed profile of (x, r) points about the x axis in `segments` steps, the first at
 * angle a0. Points on the axis (r = 0) close the solid there.
 */
export function lathe(profile: [number, number][], segments: number, a0 = 0): Solid {
  // walking the profile clockwise in the (x, r) plane puts the outside on the left
  const pts = orient(profile.map(([x, r]) => new Vector2(x, r)), false);
  const cos: number[] = [], sin: number[] = [];
  for (let j = 0; j < segments; j++) {
    cos.push(Math.cos(a0 + (2 * Math.PI * j) / segments));
    sin.push(Math.sin(a0 + (2 * Math.PI * j) / segments));
  }
  const out: Solid = [];
  const put = (p: Vector2, j: number): void => { out.push(p.x, p.y * cos[j % segments], p.y * sin[j % segments]); };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let j = 0; j < segments; j++) {
      put(a, j); put(a, j + 1); put(b, j + 1);
      put(a, j); put(b, j + 1); put(b, j);
    }
  }
  return out;
}

/** A closed tube of radius `radius` and `sides` sides along a path, capped flat at both ends. */
export function tube(path: Vector3[], radius: number, sides: number): Solid {
  const rings: Vector3[][] = path.map((p, i) => {
    const t = path[Math.min(i + 1, path.length - 1)].clone().sub(path[Math.max(i - 1, 0)]).normalize();
    // a fixed reference gives a continuous frame for any path that never turns parallel to it
    const ref = Math.abs(t.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const n = ref.clone().cross(t).normalize();
    const b = t.clone().cross(n);
    return Array.from({ length: sides }, (_, k) => {
      const a = Math.PI / 2 + (2 * Math.PI * k) / sides; // with an even count, vertices sit at ±b
      return p.clone().addScaledVector(n, radius * Math.cos(a)).addScaledVector(b, radius * Math.sin(a));
    });
  });
  const out: Solid = [];
  const put = (v: Vector3): void => { out.push(v.x, v.y, v.z); };
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < sides; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][(k + 1) % sides], d = rings[i + 1][k];
      put(a); put(b); put(c); put(a); put(c); put(d);
    }
  }
  const first = rings[0], last = rings[rings.length - 1];
  for (let k = 0; k < sides; k++) {
    put(path[0]); put(first[(k + 1) % sides]); put(first[k]);
    put(path[path.length - 1]); put(last[k]); put(last[(k + 1) % sides]);
  }
  return out;
}

export function transform(s: Solid, m: Matrix4): Solid {
  const v = new Vector3();
  const out: Solid = new Array(s.length);
  for (let i = 0; i < s.length; i += 3) {
    v.set(s[i], s[i + 1], s[i + 2]).applyMatrix4(m);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
  }
  return out;
}

export const translate = (s: Solid, x: number, y: number, z: number): Solid =>
  transform(s, new Matrix4().makeTranslation(x, y, z));
export const rotateX = (s: Solid, a: number): Solid => transform(s, new Matrix4().makeRotationX(a));

const key = (x: number, y: number, z: number): string =>
  `${Math.round(x / WELD)},${Math.round(y / WELD)},${Math.round(z / WELD)}`;

const volume = (s: Solid): number => {
  let v = 0;
  for (let i = 0; i < s.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = s.slice(i, i + 9);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
};

/**
 * One geometry from closed solids. Each solid is turned outward if it was built inside out,
 * triangles with a repeated corner are dropped, and each corner's normal averages (by area) the
 * faces round that vertex within `creaseRad` of its own face.
 */
export function toGeometry(solids: Solid[], creaseRad = CREASE): BufferGeometry {
  const pos: number[] = [];
  const keys: string[] = [];
  for (const s of solids) {
    const flip = volume(s) < 0;
    for (let i = 0; i < s.length; i += 9) {
      const corners = flip ? [0, 6, 3] : [0, 3, 6];
      const ks = corners.map((c) => key(s[i + c], s[i + c + 1], s[i + c + 2]));
      if (ks[0] === ks[1] || ks[1] === ks[2] || ks[2] === ks[0]) continue;
      for (const c of corners) pos.push(s[i + c], s[i + c + 1], s[i + c + 2]);
      keys.push(...ks);
    }
  }
  const nTri = pos.length / 9;
  const area = new Float64Array(nTri * 3); // cross product: area-weighted face normal
  const unit = new Float64Array(nTri * 3);
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const l = Math.hypot(cx, cy, cz) || 1;
    area.set([cx, cy, cz], t * 3);
    unit.set([cx / l, cy / l, cz / l], t * 3);
  }
  const around = new Map<string, number[]>();
  keys.forEach((k, c) => { const list = around.get(k); if (list) list.push((c / 3) | 0); else around.set(k, [(c / 3) | 0]); });
  const cosCrease = Math.cos(creaseRad);
  const normals = new Float32Array(pos.length);
  for (let c = 0; c < keys.length; c++) {
    const t = (c / 3) | 0;
    let nx = 0, ny = 0, nz = 0;
    for (const f of around.get(keys[c])!) {
      const d = unit[t * 3] * unit[f * 3] + unit[t * 3 + 1] * unit[f * 3 + 1] + unit[t * 3 + 2] * unit[f * 3 + 2];
      if (d >= cosCrease) { nx += area[f * 3]; ny += area[f * 3 + 1]; nz += area[f * 3 + 2]; }
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    normals.set([nx / l, ny / l, nz / l], c * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  return g;
}
