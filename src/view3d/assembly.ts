import { Box3, Group, InstancedMesh, Sphere, Vector3 } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { FACE_WIDTH, GEAR_ORDER, GEAR_PITCH, MODULE, gearAxialPosition, gearKind, sliderOfGear } from '../model/geometry';
import { PARTS } from '../model/parts';
import type { GearNo, PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import { PARAMS } from '../sim/params';
import { createSimulation } from '../sim/simulation';
import type { DogSide, SliderId } from '../sim/types';
import { DIM } from '../geo/dimensions';
import { dogRing, forkGroovedGear, meshPhase, spurGear } from '../geo/gear';
import { crankshaft, plainShaft, sleeve } from '../geo/shaft';
import { sprocket } from '../geo/sprocket';
import { CLUTCH, clutchBasket, clutchHub, clutchSpring, frictionPlate, plateStackOffsets, pressurePlate, springLength, steelPlate } from '../geo/clutch';
import { detentArm, pedalLever, shiftDrum, shiftFork, shiftPawl, starWheel } from '../geo/shift';
import { chainLink, chainLinkCount, chainPath, rearWheel } from '../geo/finalDrive';
import { partMaterial, withEdges } from './materials';
import type { Tone } from './materials';
import {
  CARRIER, CLUTCH_X0, COLLAR_CLEARANCE, COLLAR_RADIUS, CRANK, CRANK_AXIS, DETENT_PIVOT, DRUM_AXIS, DRUM_LENGTH,
  FOLLOWER_OFFSETS, FORK_GROOVE_WIDTH, FORK_ROD, FORK_RODS, FORK_ROD_X, FORK_X, FRONT_PITCH_RADIUS, GEARBOX_PSI,
  INPUT_AXIS, INPUT_SHAFT_X, OUTPUT_AXIS, OUTPUT_SHAFT_X, PAWL_ANGLE, PAWL_X, PEDAL_REST, PEDAL_X, PRIMARY_PSI,
  PRIMARY_X, REAR_AXIS, REAR_PITCH_RADIUS, SHIFT_SHAFT_AXIS, SHIFT_SHAFT_RADIUS, SHIFT_SHAFT_X, SLIDER_AXIS,
  SPROCKET_THICKNESS, SPROCKET_X, STAR_X, WHEEL_X, clutchX, directionOf, forkReach,
} from './layout3d';
import type { Axis } from './layout3d';
import { poseAssembly } from './pose';

type Shaft = 'input' | 'output';
type AnchorId = 'clutch' | 'inputShaft' | 'outputShaft' | 'shiftDrum' | 'forks' | 'finalDrive';

/** What poseAssembly moves, found once at build time. */
export interface Rig {
  gears: { node: Object3D; shaft: Shaft; g: GearNo; slider: SliderId | null; restX: number }[];
  /** Each free gear's dog ring, turned each pose so it faces its slider's dogs at drawnDogPhase. */
  freeDogs: { ring: Object3D; slider: SliderId; side: DogSide; shaft: Shaft; free: GearNo; sliderGear: GearNo }[];
  forks: { slider: SliderId; node: Object3D }[];
  frictionPlates: Object3D[];
  steelPlates: Object3D[];
  springs: Object3D[];
  /** Length each spring geometry was built at; a pose scales it along its axis. */
  springBuiltLength: number;
  chain: {
    path: ReturnType<typeof chainPath>; count: number;
    /** Link spacing along the path: its length over the link count, so the loop closes. */
    spacing: number;
    /** Chain travel per radian of the front sprocket: one link per tooth, so rollers stay seated. */
    travelPerRadian: number;
  };
}

export interface Assembly {
  root: Group;
  /** The moving node for a part; throws if missing. */
  node(id: PartId): Object3D;
  /** World-space callout anchors. */
  anchors: Record<AnchorId, Vector3>;
  /** Chain links: inner links in one InstancedMesh, outer links in another, alternating along the loop. */
  chain: { inner: InstancedMesh; outer: InstancedMesh };
  /** Sphere round the gearbox, clutch and shift mechanism, excluding the chain's long run and the rear wheel. */
  framing: { centre: Vector3; radius: number };
  /** Internal: what poseAssembly drives. */
  rig: Rig;
}

const TONE = {
  shaft: 'steel5', fixedGear: 'steel4', freeGear: 'steel3', basket: 'steel3', friction: 'steel2', steel: 'steel5',
  clutchPart: 'steel4', spring: 'steel5', drum: 'steel3', lever: 'steel4', chain: 'steel4', tyre: 'steel1', rim: 'steel3',
} as const satisfies Record<string, Tone>;

const SHAFT_RADIUS: Record<Shaft, number> = { input: DIM.inputShaftRadius, output: DIM.outputShaftRadius };
const SHAFT_AXIS: Record<Shaft, Axis> = { input: INPUT_AXIS, output: OUTPUT_AXIS };
const SLIDERS = Object.keys(PARAMS.sliders) as SliderId[];
const GROUP_LABELS = ['shafts', 'input gears', 'output gears', 'clutch', 'shift mechanism', 'final drive'] as const;
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;
const span = (r: readonly [number, number]): number => r[1] - r[0];
const toothCount = (shaft: Shaft, g: GearNo): number => PARAMS.gears[g][shaft === 'input' ? 0 : 1];

/**
 * A holder for one solid: `rotation` about x (a static phase), optionally turned half a turn about
 * y (`flip`: its +x faces world -x, angles about x mirror, which leaves every symmetric part the
 * same), at local `x`.
 */
function solid(parent: Object3D, geometry: BufferGeometry, tone: Tone, o: { x?: number; phase?: number; flip?: boolean } = {}): Group {
  const holder = new Group();
  holder.position.x = o.x ?? 0;
  holder.rotation.x = o.phase ?? 0;
  const body = withEdges(geometry, tone);
  if (o.flip) body.rotation.y = Math.PI;
  holder.add(body);
  parent.add(holder);
  return holder;
}

export async function buildAssembly(onProgress: (done: number, total: number, label: string) => void): Promise<Assembly> {
  const root = new Group();
  root.name = 'transmission';
  const statics = new Group();
  statics.name = 'static parts';
  root.add(statics);
  const nodes = new Map<PartId, Group>();
  const partNode = (id: PartId, x: number, axis: Axis): Group => {
    const g = new Group();
    g.name = id;
    g.position.set(x, axis.y, axis.z);
    root.add(g);
    nodes.set(id, g);
    return g;
  };
  const rig: Rig = {
    gears: [], freeDogs: [], forks: [], frictionPlates: [], steelPlates: [], springs: [], springBuiltLength: 0,
    chain: undefined as unknown as Rig['chain'],
  };

  // ---- shafts and crank ----
  const shafts = (): void => {
    solid(partNode('inputShaft', mid(INPUT_SHAFT_X), INPUT_AXIS),
      plainShaft({ radius: DIM.inputShaftRadius, length: span(INPUT_SHAFT_X) }), TONE.shaft);
    solid(partNode('outputShaft', mid(OUTPUT_SHAFT_X), OUTPUT_AXIS),
      plainShaft({ radius: DIM.outputShaftRadius, length: span(OUTPUT_SHAFT_X) }), TONE.shaft);
    solid(partNode('crank', 0, CRANK_AXIS), crankshaft(CRANK), TONE.shaft);
  };

  // ---- gears ----
  const dogGeometry = dogRing({
    count: PARAMS.dogs.count, widthDeg: DIM.dogWidthDeg, innerRadius: DIM.dogInnerRadius,
    outerRadius: DIM.dogOuterRadius, height: DIM.dogHeight,
  });
  /** A dog ring on gear `node`'s +x face (side +1) or -x face (side -1), lugs pointing away from it. */
  const dogsOn = (node: Object3D, face: 1 | -1, tone: Tone): Group =>
    solid(node, dogGeometry, tone, { x: (face * FACE_WIDTH) / 2, flip: face < 0 });
  // which face of which gear carries each slider's dogs, and the free gear's facing ring
  const dogFaces: { slider: SliderId; side: DogSide; sliderGear: GearNo; free: GearNo; shaft: Shaft }[] = SLIDERS.flatMap((s) => {
    const { shaft } = PARAMS.sliders[s];
    const piece = GEAR_ORDER.filter((g) => sliderOfGear(shaft, g) === s); // in axial order
    return (['neg', 'pos'] as const).map((side) => ({
      slider: s, side, shaft, free: PARAMS.sliders[s][side] as GearNo,
      sliderGear: side === 'neg' ? piece[0] : piece[piece.length - 1],
    }));
  });
  const gears = (shaft: Shaft) => (): void => {
    for (const g of GEAR_ORDER) {
      const id = `gear${g}${shaft === 'input' ? 'in' : 'out'}` as PartId;
      const kind = gearKind(shaft, g);
      const slider = sliderOfGear(shaft, g);
      const restX = gearAxialPosition(g);
      const node = partNode(id, restX, SHAFT_AXIS[shaft]);
      const tone = kind === 'free' ? TONE.freeGear : TONE.fixedGear;
      const base = { teeth: toothCount(shaft, g), module: MODULE, faceWidth: FACE_WIDTH, boreRadius: SHAFT_RADIUS[shaft] };
      // output sliders carry their fork in a groove cut through the middle of the teeth
      const geometry = slider !== null && shaft === 'output'
        ? forkGroovedGear({ ...base, grooveWidth: FORK_GROOVE_WIDTH, grooveRadius: COLLAR_RADIUS[slider] - COLLAR_CLEARANCE })
        : spurGear(base);
      // input gears are gear A of meshPhase, at phase 0; output gears take B's phase
      const phase = shaft === 'input' ? 0 : meshPhase(toothCount('input', g), toothCount('output', g), GEARBOX_PSI);
      solid(node, geometry, tone, { phase });
      rig.gears.push({ node, shaft, g, slider, restX });
      for (const f of dogFaces) {
        if (f.shaft !== shaft) continue;
        const face = f.side === 'neg' ? 1 : -1; // the free gear on the neg side faces +x, toward its slider
        if (f.sliderGear === g) dogsOn(node, (-face) as 1 | -1, tone);
        if (f.free === g) rig.freeDogs.push({ ring: dogsOn(node, face, tone), slider: f.slider, side: f.side, shaft, free: g, sliderGear: f.sliderGear });
      }
    }
    if (shaft === 'input') {
      // the collar joining third and fourth, in whose gap fork C's claw rides
      const third = nodes.get('gear3in')!;
      solid(third, sleeve({ boreRadius: DIM.inputShaftRadius, radius: COLLAR_RADIUS.C - COLLAR_CLEARANCE, length: GEAR_PITCH - FACE_WIDTH }),
        TONE.fixedGear, { x: FORK_X.C - gearAxialPosition(3) });
    }
  };

  // ---- clutch, in its frame turned half a turn about y ----
  const clutch = (): void => {
    solid(partNode('primaryDrive', PRIMARY_X, CRANK_AXIS),
      spurGear({ teeth: PARAMS.primary.drive, module: MODULE, faceWidth: DIM.primary.faceWidth, boreRadius: CRANK.journalRadius }), TONE.fixedGear);
    const basketPhase = meshPhase(PARAMS.primary.drive, PARAMS.primary.driven, PRIMARY_PSI);
    solid(partNode('clutchBasket', CLUTCH_X0, INPUT_AXIS), clutchBasket(), TONE.basket, { phase: basketPhase, flip: true });
    // plates: each in a holder at its clutch frame x inside the flipped frame
    const plateFrame = (id: PartId, phase: number): Group => {
      const frame = new Group();
      frame.rotation.y = Math.PI;
      const phased = new Group();
      phased.rotation.x = phase;
      phased.add(frame);
      partNode(id, CLUTCH_X0, INPUT_AXIS).add(phased);
      return frame;
    };
    const rest = plateStackOffsets(0);
    const friction = plateFrame('frictionPlates', basketPhase), fGeo = frictionPlate();
    for (const x of rest.friction) rig.frictionPlates.push(solid(friction, fGeo, TONE.friction, { x }));
    const steel = plateFrame('steelPlates', 0), sGeo = steelPlate();
    for (const x of rest.steel) rig.steelPlates.push(solid(steel, sGeo, TONE.steel, { x }));
    solid(partNode('clutchHub', CLUTCH_X0, INPUT_AXIS), clutchHub(), TONE.clutchPart, { flip: true });
    // the pressure plate node moves with the plate; springs run from its spring face to the hub's seats
    const pp = partNode('pressurePlate', clutchX(rest.pressurePlate), INPUT_AXIS);
    const ppFrame = new Group();
    ppFrame.rotation.y = Math.PI;
    pp.add(ppFrame);
    solid(ppFrame, pressurePlate(), TONE.clutchPart);
    rig.springBuiltLength = springLength(rest.pressurePlate);
    const spring = clutchSpring(rig.springBuiltLength);
    for (let k = 0; k < DIM.clutch.springCount; k++) {
      const a = (2 * Math.PI * k) / DIM.clutch.springCount;
      const s = solid(ppFrame, spring, TONE.spring, { x: CLUTCH.springFace });
      s.position.y = CLUTCH.springPitchRadius * Math.cos(a);
      s.position.z = CLUTCH.springPitchRadius * Math.sin(a);
      rig.springs.push(s);
    }
  };

  // ---- shift mechanism ----
  const shift = (): void => {
    const drum = partNode('shiftDrum', 0, DRUM_AXIS);
    solid(drum, shiftDrum(DRUM_LENGTH, FORK_X, FOLLOWER_OFFSETS), TONE.drum);
    const axle = [DRUM_LENGTH / 2 - 0.002, STAR_X + DIM.starWheel.thickness / 2 + 0.002] as const;
    solid(drum, plainShaft({ radius: DIM.starWheelMount.boreRadius, length: span(axle) }), TONE.shaft, { x: mid(axle) });
    solid(partNode('starWheel', STAR_X, DRUM_AXIS), starWheel(), TONE.drum);
    const forkGeometry = new Map<string, BufferGeometry>();
    for (const s of SLIDERS) {
      const key = `${forkReach(s)}|${COLLAR_RADIUS[s]}`;
      if (!forkGeometry.has(key)) forkGeometry.set(key, shiftFork({ reach: forkReach(s), collarRadius: COLLAR_RADIUS[s] }));
      const node = partNode(`fork${s}` as PartId, FORK_X[s], FORK_ROD[s]);
      solid(node, forkGeometry.get(key)!, TONE.lever, { phase: directionOf(FORK_ROD[s], SLIDER_AXIS[s]) });
      rig.forks.push({ slider: s, node });
    }
    // fork rods are fixed: pickable as the forks they carry
    const rod = plainShaft({ radius: DIM.fork.rodRadius, length: span(FORK_ROD_X) });
    for (const [axis, id] of [[FORK_RODS.AB, 'forkA'], [FORK_RODS.C, 'forkC']] as const) {
      const r = solid(statics, rod, TONE.shaft, { x: mid(FORK_ROD_X) });
      r.position.y = axis.y; r.position.z = axis.z;
      r.traverse((o) => { o.userData.partId = id; });
    }
    solid(partNode('detentArm', STAR_X, DETENT_PIVOT), detentArm(), TONE.lever);
    const shaft = partNode('shiftShaft', PAWL_X, SHIFT_SHAFT_AXIS);
    solid(shaft, plainShaft({ radius: SHIFT_SHAFT_RADIUS, length: span(SHIFT_SHAFT_X) }), TONE.shaft, { x: mid(SHIFT_SHAFT_X) - PAWL_X });
    solid(shaft, shiftPawl(), TONE.lever, { phase: PAWL_ANGLE });
    solid(partNode('pedal', PEDAL_X, SHIFT_SHAFT_AXIS), pedalLever(), TONE.lever, { phase: PEDAL_REST });
  };

  // ---- final drive ----
  let chainMeshes: Assembly['chain'] | undefined;
  const finalDrive = (): void => {
    const path = chainPath({ frontRadius: FRONT_PITCH_RADIUS, rearRadius: REAR_PITCH_RADIUS, centreDistance: DIM.chain.centreDistance });
    const count = chainLinkCount(path.length, DIM.chain.pitch);
    const spacing = path.length / count;
    rig.chain = { path, count, spacing, travelPerRadian: (PARAMS.final.front * spacing) / (2 * Math.PI) };
    // static sprocket phases: at rest a roller near the middle of each wrap sits in a seat
    const b = Math.asin((REAR_PITCH_RADIUS - FRONT_PITCH_RADIUS) / DIM.chain.centreDistance);
    const frontWrap = FRONT_PITCH_RADIUS * (Math.PI - 2 * b);
    const rearStart = frontWrap + Math.sqrt(DIM.chain.centreDistance ** 2 - (REAR_PITCH_RADIUS - FRONT_PITCH_RADIUS) ** 2);
    const seatPhase = (s: number, centreZ: number, teeth: number): number => {
      const p = path.pointAt(Math.round(s / spacing) * spacing);
      return Math.atan2(p.z - centreZ, p.y) - Math.PI / teeth; // seats sit half a tooth off tooth 0
    };
    const sprocketOf = (teeth: number, bore: number): BufferGeometry => sprocket({
      teeth, pitch: DIM.chain.pitch, rollerRadius: DIM.chain.rollerRadius, thickness: SPROCKET_THICKNESS, boreRadius: bore,
    });
    solid(partNode('sprocket', SPROCKET_X, OUTPUT_AXIS), sprocketOf(PARAMS.final.front, DIM.outputShaftRadius), TONE.chain,
      { phase: seatPhase(frontWrap / 2, 0, PARAMS.final.front) });
    const rear = partNode('rearSprocket', SPROCKET_X, REAR_AXIS);
    solid(rear, sprocketOf(PARAMS.final.rear, DIM.wheelParts.axleRadius), TONE.chain,
      { phase: seatPhase(rearStart + (REAR_PITCH_RADIUS * (Math.PI + 2 * b)) / 2, -DIM.chain.centreDistance, PARAMS.final.rear) });
    solid(rear, sleeve({ boreRadius: DIM.wheelParts.axleRadius, radius: CARRIER.radius, length: CARRIER.x1 - CARRIER.x0 }), TONE.chain,
      { x: (CARRIER.x0 + CARRIER.x1) / 2 - SPROCKET_X });
    const chain = partNode('chain', SPROCKET_X, OUTPUT_AXIS);
    const inner = new InstancedMesh(chainLink(true), partMaterial(TONE.chain), count / 2);
    const outer = new InstancedMesh(chainLink(false), partMaterial(TONE.chain), count / 2);
    inner.name = 'inner links'; outer.name = 'outer links';
    chain.add(inner, outer);
    chainMeshes = { inner, outer };
    const wheel = partNode('rearWheel', WHEEL_X, REAR_AXIS);
    const [tyre, rim, hub] = rearWheel();
    solid(wheel, tyre, TONE.tyre); solid(wheel, rim, TONE.rim); solid(wheel, hub, TONE.rim);
  };

  const steps = [shafts, gears('input'), gears('output'), clutch, shift, finalDrive];
  for (let i = 0; i < steps.length; i++) {
    steps[i]();
    onProgress(i + 1, steps.length, GROUP_LABELS[i]);
    if (i + 1 < steps.length) await yieldToEventLoop();
  }

  for (const [id, n] of nodes) n.traverse((o) => { o.userData.partId = id; });
  for (const id of Object.keys(PARTS) as PartId[]) if (!nodes.has(id)) throw new Error(`no node built for ${id}`);

  const assembly: Assembly = {
    root,
    node(id) {
      const n = nodes.get(id);
      if (!n) throw new Error(`no node for part ${id}`);
      return n;
    },
    anchors: anchors(rig),
    chain: chainMeshes!,
    framing: { centre: new Vector3(), radius: 0 },
    rig,
  };
  const empty: TorquePath = { parts: [], torque: 0, slipping: false, reach: 'none' };
  poseAssembly(assembly, createSimulation().getState(), empty);
  for (const m of [assembly.chain.inner, assembly.chain.outer]) m.computeBoundingSphere();
  assembly.framing = framing(root, [...nodes].filter(([id]) => id !== 'chain' && id !== 'rearSprocket' && id !== 'rearWheel').map(([, n]) => n), statics);
  return assembly;
}

function anchors(rig: Rig): Record<AnchorId, Vector3> {
  const on = (x: number, axis: Axis, angle: number, r: number): Vector3 =>
    new Vector3(x, axis.y + r * Math.cos(angle), axis.z + r * Math.sin(angle));
  const firstFace = gearAxialPosition(GEAR_ORDER[0]) - FACE_WIDTH / 2;
  const lastFace = gearAxialPosition(GEAR_ORDER[GEAR_ORDER.length - 1]) + FACE_WIDTH / 2;
  const top = rig.chain.path.pointAt(-0.05); // on the top run, 5 cm behind the front sprocket
  const forkC = FORK_ROD.C;
  const toInput = directionOf(forkC, INPUT_AXIS);
  return {
    clutch: on(clutchX(DIM.basket.floor + DIM.clutch.basketDepth / 2), INPUT_AXIS, 0, DIM.clutch.basketOuterRadius),
    inputShaft: on((clutchX(-DIM.primary.faceWidth) + firstFace) / 2, INPUT_AXIS, 0, DIM.inputShaftRadius),
    outputShaft: on((lastFace + SPROCKET_X - SPROCKET_THICKNESS / 2) / 2, OUTPUT_AXIS, 0, DIM.outputShaftRadius),
    shiftDrum: on((FORK_X.A + FORK_X.C) / 2, DRUM_AXIS, directionOf(INPUT_AXIS, DRUM_AXIS), DIM.drum.radius),
    forks: on(FORK_X.C, forkC, toInput, forkReach('C') / 2),
    finalDrive: new Vector3(SPROCKET_X, OUTPUT_AXIS.y + top.y, OUTPUT_AXIS.z + top.z),
  };
}

function framing(root: Object3D, parts: Object3D[], statics: Object3D): { centre: Vector3; radius: number } {
  root.updateMatrixWorld(true);
  const box = new Box3();
  for (const p of [...parts, statics]) box.expandByObject(p);
  const sphere = box.getBoundingSphere(new Sphere());
  return { centre: sphere.center, radius: sphere.radius };
}
