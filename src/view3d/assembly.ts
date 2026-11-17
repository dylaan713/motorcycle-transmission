import { Box3, Group, InstancedBufferGeometry, InstancedMesh, LineSegments, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import type { BufferGeometry, Mesh, Object3D } from 'three';
import { FACE_WIDTH, GEAR_ORDER, GEAR_PITCH, MODULE, PRIMARY_MODULE, gearAxialPosition, gearKind, sliderOfGear } from '../model/geometry';
import { PARTS } from '../model/parts';
import type { GearNo, PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import { PARAMS } from '../sim/params';
import { createSimulation } from '../sim/simulation';
import type { DogSide, SliderId } from '../sim/types';
import { DIM } from '../geo/dimensions';
import { deg } from '../sim/units';
import { collaredGear, dogRing, meshPhase, spurGear } from '../geo/gear';
import { crankshaft, plainShaft, sleeve } from '../geo/shaft';
import { sprocket } from '../geo/sprocket';
import {
  CLUTCH, basketBush, clutchBasket, clutchHub, clutchSpring, frictionPlate, plateStackOffsets, pressurePlate, releaseArm, releaseRod,
  springLength, steelPlate,
} from '../geo/clutch';
import { detentArm, pedalLever, shiftArm, shiftDrum, shiftFork, shiftPawl, shiftPins, starWheel } from '../geo/shift';
import { chainLink, chainLinkCount, chainPath, rearWheel } from '../geo/finalDrive';
import { edgeMaterial, edgesOf, partMaterial, setGhost, withEdges } from './materials';
import type { Tone } from './materials';
import {
  CARRIER, CLAW_THICKNESS, CRANK_GHOST, CRANK_STUB_X1, CLUTCH_X0, COLLAR_CLEARANCE, COLLAR_FLANGE_RADIUS, COLLAR_GROOVE_WIDTH, COLLAR_RADIUS,
  COLLAR_SIDE, CRANK, CRANK_AXIS, DETENT_PIVOT, DRUM_AXIS, DRUM_LENGTH, FOLLOWER_OFFSETS, FORK_ROD, FORK_RODS,
  FORK_ROD_X, FORK_THIN_REACH, FORK_X, FRONT_PITCH_RADIUS, GEARBOX_PSI, INPUT_AXIS, INPUT_SHAFT_X, OUTPUT_AXIS,
  ARM_X, LIFTER_BOSS, OUTPUT_SHAFT_X, PAWL_X, PEDAL_REST, PEDAL_X, PIN_X, PRIMARY_PSI, PRIMARY_X, REAR_AXIS, REAR_PITCH_RADIUS,
  RELEASE_PIVOT, ROD_END_X, ROD_ORIGIN_X,
  SHIFT_SHAFT_AXIS, SHIFT_SHAFT_RADIUS, SHIFT_SHAFT_X, SLIDER_AXIS, SLIDER_SHOULDER_WIDTH, SLIDER_TOOTH_WIDTH,
  DRUM_TURN, SPROCKET_THICKNESS, SPROCKET_X, STAR_X, WHEEL_X, clutchX, directionOf, forkReach,
} from './layout3d';
import type { Axis } from './layout3d';
import { buildDetentTable, poseAssembly } from './pose';
import { ARM_PATH, PAWLS, PAWL_LENGTH, PIN_ANGLES } from './ratchet';
import type { PawlId } from './ratchet';

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
    /**
     * The chain loop in chainPath's own frame, which is the chain node's: front sprocket at the
     * origin and rear sprocket at z = -centreDistance, behind it. s runs rear to front along the top run.
     */
    path: ReturnType<typeof chainPath>;
    count: number;
    /** Link spacing along the path: its length over the link count, so the loop closes. */
    spacing: number;
    /** Chain travel per radian of the front sprocket: one link per tooth, so rollers stay seated. */
    travelPerRadian: number;
  };
  /** Detent arm angle over the drum's travel, built once (see buildDetentTable in pose.ts). */
  detentTable: Float64Array;
  /** Clutch capacity at the last pose; the plate stack is moved only when it changes. */
  posedCapacity: number;
  /** The release pushrod and lifter (moved along x), and the release arm (turned about z). */
  release: { rod: Object3D; arm: Object3D };
  /** The two pawls on the shift arm, each tilted about its pivot; their holders sit at their rest direction. */
  pawls: Record<PawlId, { holder: Object3D; rest: number }>;
}

export interface Assembly {
  root: Group;
  /** The moving node for a part; throws if missing. */
  node(id: PartId): Object3D;
  /**
   * Parts drawn as context, not mechanism (ghosted wholly or in part): their faces never light; on
   * the torque path only their edges carry the signal.
   */
  contextParts: PartId[];
  /** World-space callout anchors, each on a surface of its group that the default camera sees. */
  anchors: Record<AnchorId, Vector3>;
  /**
   * Chain links: inner links in one InstancedMesh, outer links in another, alternating along the
   * loop, each with instanced edge lines sharing its instance matrices.
   */
  chain: { inner: InstancedMesh; outer: InstancedMesh };
  /** Sphere round the gearbox, clutch and shift mechanism, excluding the chain's long run and the rear wheel. */
  framing: { centre: Vector3; radius: number };
  /** Sphere round the subject the default camera looks at: the six gear pairs, the forks and the drum. */
  subject: { centre: Vector3; radius: number };
  /** Internal: what poseAssembly drives. */
  rig: Rig;
}

const TONE = {
  shaft: 'steel5', fixedGear: 'steel4', freeGear: 'steel3', basket: 'steel3', friction: 'steel2', steel: 'steel5',
  clutchPart: 'steel4', spring: 'steel5', drum: 'steel3', lever: 'steel4', chain: 'steel4', tyre: 'steel1', rim: 'steel3',
  // inner links darker than outer ones, so the chain reads as links from any side, lit or not
  innerLink: 'steel3', outerLink: 'steel5', bush: 'steel5',
} as const satisfies Record<string, Tone>;

const CONTEXT_PARTS: readonly PartId[] = ['rearWheel', 'crank'];
const SHAFT_RADIUS: Record<Shaft, number> = { input: DIM.inputShaftRadius, output: DIM.outputShaftRadius };
const SHAFT_AXIS: Record<Shaft, Axis> = { input: INPUT_AXIS, output: OUTPUT_AXIS };
const SLIDERS = Object.keys(PARAMS.sliders) as SliderId[];
const GROUP_LABELS = ['shafts', 'input gears', 'output gears', 'clutch', 'shift mechanism', 'final drive'] as const;
/** How many progress steps buildAssembly reports. */
export const BUILD_STEPS = GROUP_LABELS.length;
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
    chain: chainRig(), detentTable: new Float64Array(0), posedCapacity: Number.NaN, // the table is built in the shift step
    release: { rod: new Group(), arm: new Group() }, pawls: { up: { holder: new Group(), rest: 0 }, down: { holder: new Group(), rest: 0 } },
  };

  // ---- shafts and crank ----
  const shafts = (): void => {
    // hollow: the clutch pushrod runs through it
    solid(partNode('inputShaft', mid(INPUT_SHAFT_X), INPUT_AXIS),
      sleeve({ boreRadius: DIM.release.shaftBore, radius: DIM.inputShaftRadius, length: span(INPUT_SHAFT_X) }), TONE.shaft);
    solid(partNode('outputShaft', mid(OUTPUT_SHAFT_X), OUTPUT_AXIS),
      plainShaft({ radius: DIM.outputShaftRadius, length: span(OUTPUT_SHAFT_X) }), TONE.shaft);
    // the crank is context: a solid stub through the primary drive gear, one throw as a ghost
    const crank = partNode('crank', 0, CRANK_AXIS);
    solid(crank, plainShaft({ radius: CRANK.journalRadius, length: CRANK_STUB_X1 - CRANK.x0 }), TONE.shaft, { x: (CRANK.x0 + CRANK_STUB_X1) / 2 });
    setGhost(solid(crank, crankshaft(CRANK_GHOST), TONE.shaft), true);
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
      // output sliders carry their fork in a collar beside narrowed teeth
      const geometry = slider !== null && slider !== 'C' && shaft === 'output'
        ? collaredGear({
          ...base, shoulderWidth: SLIDER_SHOULDER_WIDTH, toothWidth: SLIDER_TOOTH_WIDTH, grooveWidth: COLLAR_GROOVE_WIDTH,
          grooveRadius: COLLAR_RADIUS[slider] - COLLAR_CLEARANCE, flangeRadius: COLLAR_FLANGE_RADIUS, collarSide: COLLAR_SIDE[slider],
        })
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
      spurGear({ teeth: PARAMS.primary.drive, module: PRIMARY_MODULE, faceWidth: DIM.primary.faceWidth, boreRadius: CRANK.journalRadius }), TONE.fixedGear);
    const basketPhase = meshPhase(PARAMS.primary.drive, PARAMS.primary.driven, PRIMARY_PSI);
    const basket = partNode('clutchBasket', CLUTCH_X0, INPUT_AXIS);
    solid(basket, clutchBasket(), TONE.basket, { phase: basketPhase, flip: true });
    solid(basket, basketBush(), TONE.bush, { flip: true }); // the basket runs on the shaft on this bush
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
    // release: pushrod and lifter, moved with the pressure plate, and the arm that pushes the rod
    const release = partNode('clutchRelease', 0, INPUT_AXIS);
    rig.release.rod = solid(release, releaseRod(ROD_END_X - ROD_ORIGIN_X, LIFTER_BOSS), TONE.steel, { x: ROD_ORIGIN_X });
    const arm = new Group();
    arm.position.set(RELEASE_PIVOT.x, RELEASE_PIVOT.y - INPUT_AXIS.y, RELEASE_PIVOT.z - INPUT_AXIS.z);
    arm.add(withEdges(releaseArm(), TONE.lever));
    release.add(arm);
    rig.release.arm = arm;
  };

  // ---- shift mechanism ----
  const shift = (): void => {
    rig.detentTable = buildDetentTable(); // ~200 ms, so inside a reported step, after a yield
    const drum = partNode('shiftDrum', 0, DRUM_AXIS);
    solid(drum, shiftDrum(DRUM_LENGTH, FORK_X, FOLLOWER_OFFSETS, DRUM_TURN), TONE.drum);
    const axle = [DRUM_LENGTH / 2 - 0.002, STAR_X + DIM.starWheel.thickness / 2 + 0.002] as const;
    solid(drum, plainShaft({ radius: DIM.starWheelMount.boreRadius, length: span(axle) }), TONE.shaft, { x: mid(axle) });
    solid(drum, shiftPins(PIN_ANGLES, PIN_X[0], PIN_X[1]), TONE.drum); // on the star wheel's outer face
    solid(partNode('starWheel', STAR_X, DRUM_AXIS), starWheel(DRUM_TURN), TONE.drum);
    const forkGeometry = new Map<string, BufferGeometry>();
    for (const s of SLIDERS) {
      const key = `${forkReach(s)}|${COLLAR_RADIUS[s]}|${CLAW_THICKNESS[s]}`;
      // A and B: thin where the claw rides the narrow collar groove, full thickness clear of their gears
      const thin = CLAW_THICKNESS[s] < DIM.fork.thickness ? { clawThickness: CLAW_THICKNESS[s], clawReach: FORK_THIN_REACH } : {};
      if (!forkGeometry.has(key)) forkGeometry.set(key, shiftFork({ reach: forkReach(s), collarRadius: COLLAR_RADIUS[s], ...thin }));
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
    // shift shaft, its arm across the drum's end and the two pawls pivoted on it (see ratchet.ts)
    const shaft = partNode('shiftShaft', 0, SHIFT_SHAFT_AXIS);
    solid(shaft, plainShaft({ radius: SHIFT_SHAFT_RADIUS, length: span(SHIFT_SHAFT_X) }), TONE.shaft, { x: mid(SHIFT_SHAFT_X) });
    const rel = (p: Axis): Vector2 => new Vector2(p.y - SHIFT_SHAFT_AXIS.y, p.z - SHIFT_SHAFT_AXIS.z);
    solid(shaft, shiftArm(ARM_PATH.map(rel), ARM_X[0], ARM_X[1], PAWL_X[0]), TONE.lever);
    const pawlGeometry = shiftPawl(PAWL_LENGTH);
    for (const id of ['up', 'down'] as const) {
      const p = PAWLS[id], rest = directionOf(p.pivot, p.nose);
      const holder = solid(shaft, pawlGeometry, TONE.lever, { x: mid(PAWL_X), phase: rest });
      holder.position.y = p.pivot.y - SHIFT_SHAFT_AXIS.y; holder.position.z = p.pivot.z - SHIFT_SHAFT_AXIS.z;
      rig.pawls[id] = { holder, rest };
    }
    solid(partNode('pedal', PEDAL_X, SHIFT_SHAFT_AXIS), pedalLever(), TONE.lever, { phase: PEDAL_REST });
  };

  // ---- final drive ----
  let chainMeshes: Assembly['chain'] | undefined;
  const finalDrive = (): void => {
    const { path, count, spacing } = rig.chain;
    // static sprocket phases: at rest a roller near the middle of each wrap sits in a seat
    const b = Math.asin((REAR_PITCH_RADIUS - FRONT_PITCH_RADIUS) / DIM.chain.centreDistance);
    const frontWrap = FRONT_PITCH_RADIUS * (Math.PI - 2 * b);
    const rearStart = frontWrap + Math.sqrt(DIM.chain.centreDistance ** 2 - (REAR_PITCH_RADIUS - FRONT_PITCH_RADIUS) ** 2);
    const seatPhase = (s: number, centreZ: number, teeth: number): number => {
      const p = placed(path, Math.round(s / spacing) * spacing);
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
    const inner = new InstancedMesh(chainLink(true), partMaterial(TONE.innerLink), count / 2);
    const outer = new InstancedMesh(chainLink(false), partMaterial(TONE.outerLink), count / 2);
    inner.name = 'inner links'; outer.name = 'outer links';
    chain.add(inner, outer);
    // edge lines for every link: a link's edges drawn once per instance, from the links' own matrices
    for (const links of [inner, outer]) {
      const g = new InstancedBufferGeometry();
      g.setAttribute('position', edgesOf(links.geometry).getAttribute('position'));
      g.setAttribute('instanceMatrix', links.instanceMatrix);
      g.instanceCount = links.count;
      const m = edgeMaterial();
      m.defines = { USE_INSTANCING: '' }; // three's line shader then applies instanceMatrix
      const lines = new LineSegments(g, m);
      lines.frustumCulled = false; // its bounds are one link's; the links span the loop
      chain.add(lines);
    }
    chainMeshes = { inner, outer };
    const wheel = partNode('rearWheel', WHEEL_X, REAR_AXIS);
    const [tyre, rim, hub] = rearWheel();
    for (const [g, tone] of [[tyre, TONE.tyre], [rim, TONE.rim], [hub, TONE.rim]] as const) setGhost(solid(wheel, g, tone), true); // context
  };

  const steps = [shafts, gears('input'), gears('output'), clutch, shift, finalDrive];
  await yieldToEventLoop(); // let the loader paint before the first step's work
  for (let i = 0; i < steps.length; i++) {
    steps[i]();
    onProgress(i + 1, steps.length, GROUP_LABELS[i]);
    if (i + 1 < steps.length) await yieldToEventLoop();
  }

  for (const [id, n] of nodes) n.traverse((o) => { o.userData.partId = id; });
  for (const id of CONTEXT_PARTS) nodes.get(id)!.userData.context = true;
  for (const id of Object.keys(PARTS) as PartId[]) if (!nodes.has(id)) throw new Error(`no node built for ${id}`);

  const assembly: Assembly = {
    root,
    node(id) {
      const n = nodes.get(id);
      if (!n) throw new Error(`no node for part ${id}`);
      return n;
    },
    anchors: anchors(nodes.get('forkC')!),
    contextParts: [...CONTEXT_PARTS],
    chain: chainMeshes!,
    framing: { centre: new Vector3(), radius: 0 },
    subject: { centre: new Vector3(), radius: 0 },
    rig,
  };
  const empty: TorquePath = { parts: [], torque: 0, slipping: false, reach: 'none' };
  poseAssembly(assembly, createSimulation().getState(), empty);
  for (const m of [assembly.chain.inner, assembly.chain.outer]) m.computeBoundingSphere();
  assembly.framing = framing(root, [...nodes].filter(([id]) => id !== 'chain' && id !== 'rearSprocket' && id !== 'rearWheel').map(([, n]) => n), statics);
  assembly.subject = framing(root, [...rig.gears.map((g) => g.node), ...rig.forks.map((f) => f.node), nodes.get('shiftDrum')!]);
  return assembly;
}

/** The chain loop: its path, link count and spacing, and how far it runs per radian of the front sprocket. */
function chainRig(): Rig['chain'] {
  const path = chainPath({ frontRadius: FRONT_PITCH_RADIUS, rearRadius: REAR_PITCH_RADIUS, centreDistance: DIM.chain.centreDistance });
  const count = chainLinkCount(path.length, DIM.chain.pitch);
  const spacing = path.length / count;
  return { path, count, spacing, travelPerRadian: (PARAMS.final.front * spacing) / (2 * Math.PI) };
}

/** A point of the chain loop, relative to the chain node. */
export const placed = (path: Rig['chain']['path'], s: number): { y: number; z: number } => path.pointAt(s);

/** About the shafts, the direction (from +y toward +z) of a surface facing the default camera: in front, above. */
const FACING = deg(50);
/** Inset from an exposed end or face, so an anchor sits on the surface, not its edge, m. */
const ON_FACE = 0.002;

function anchors(fork: Object3D): Record<AnchorId, Vector3> {
  const on = (x: number, axis: Axis, angle: number, r: number): Vector3 =>
    new Vector3(x, axis.y + r * Math.cos(angle), axis.z + r * Math.sin(angle));
  const ringFace = PRIMARY_X + DIM.primary.faceWidth / 2; // the basket's primary ring, gearbox side
  const sprocketFace = SPROCKET_X + SPROCKET_THICKNESS / 2;
  const out = {
    // the basket's rim: its primary ring, in front, where the crank does not reach
    clutch: on(ringFace, INPUT_AXIS, ANCHOR_ANGLE.clutch, PARAMS.primary.driven * PRIMARY_MODULE / 2 - 2 * PRIMARY_MODULE),
    // the shafts' exposed sprocket-side ends
    inputShaft: on(INPUT_SHAFT_X[1] - ON_FACE, INPUT_AXIS, FACING, DIM.inputShaftRadius),
    outputShaft: on(OUTPUT_SHAFT_X[1] - ON_FACE, OUTPUT_AXIS, FACING, DIM.outputShaftRadius),
    // fork C's arm, part way out (moved onto its sprocket-side face once the fork is built)
    forks: on(FORK_X.C, FORK_ROD.C, directionOf(FORK_ROD.C, SLIDER_AXIS.C), forkReach('C') * ANCHOR_ANGLE.forkReach),
    shiftDrum: on(ANCHOR_ANGLE.drumX, DRUM_AXIS, FACING, DIM.drum.radius),
    // the front sprocket's outer face, between hub and teeth
    finalDrive: on(sprocketFace, OUTPUT_AXIS, ANCHOR_ANGLE.sprocket, FRONT_PITCH_RADIUS * 0.7),
  };
  // the fork's arm is shaped, not a plain plate: find its sprocket-side face at the anchor
  fork.updateWorldMatrix(true, true);
  const p = out.forks;
  const hit = new Raycaster(new Vector3(p.x + 1, p.y, p.z), new Vector3(-1, 0, 0)).intersectObject(fork, true).find((h) => (h.object as Mesh).isMesh);
  if (hit) p.x = hit.point.x - ON_FACE / 4;
  return out;
}
/** Anchor placements tuned against the default camera (a test checks each one is seen). */
const ANCHOR_ANGLE = { clutch: deg(100), forkReach: 0.4, drumX: -0.03, sprocket: deg(60) } as const;

function framing(root: Object3D, parts: Object3D[], statics?: Object3D): { centre: Vector3; radius: number } {
  root.updateMatrixWorld(true);
  const box = new Box3();
  for (const p of statics ? [...parts, statics] : parts) box.expandByObject(p);
  const sphere = box.getBoundingSphere(new Sphere());
  return { centre: sphere.center, radius: sphere.radius };
}
