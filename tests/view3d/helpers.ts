import * as THREE from 'three';

export const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** A node's rotation about its own x axis, relative to its parent. */
export const relAngle = (node: THREE.Object3D): number => {
  const e = new THREE.Vector3(0, 1, 0).applyQuaternion(node.quaternion);
  return Math.atan2(e.z, e.y);
};

/** The torque amount setTorque last stored on a node. */
export const torqueAmount = (node: THREE.Object3D): number => node.userData.torque as number;

/** Every mesh under a node, in traversal order. */
export const meshesOf = (node: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  node.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
};

/** World angle about the x axis of a mesh's local +y, the direction of its tooth 0 or lug 0. */
export const worldAngle = (mesh: THREE.Object3D): number => {
  const e = new THREE.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
  return Math.atan2(e.z, e.y);
};

/** A local point of a mesh in world space. */
export const toWorld = (mesh: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld);

/** Every vertex of a mesh in world space. */
export function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const p = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mesh.matrixWorld));
  return out;
}

export const triangles = (g: THREE.BufferGeometry): number =>
  (g.index ? g.index.count : g.getAttribute('position').count) / 3;
