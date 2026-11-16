import { Box3, PerspectiveCamera, Vector3 } from 'three'

export function projectedBounds(box: Box3, camera: PerspectiveCamera) {
  camera.updateMatrixWorld()
  const points: Vector3[] = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(new Vector3(x, y, z).project(camera))
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y)) }
}

// Fit and center projected corners inside the actual canvas, including perspective asymmetry.
export function fitBox(box: Box3, camera: PerspectiveCamera, direction: Vector3, limit = 0.86) {
  const target = box.getCenter(new Vector3()), dir = direction.clone().normalize()
  const probe = camera.clone(); probe.zoom = 1
  probe.position.copy(target).add(dir); probe.lookAt(target); probe.updateMatrixWorld()
  const right = new Vector3().setFromMatrixColumn(probe.matrixWorld, 0), up = new Vector3().setFromMatrixColumn(probe.matrixWorld, 1)
  const tanV = Math.tan(camera.fov * Math.PI / 360), tanH = tanV * camera.aspect
  let distance = 1
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new Vector3(x, y, z).sub(target), depth = p.dot(dir)
    distance = Math.max(distance, Math.abs(p.dot(up)) / (tanV * limit) + depth, Math.abs(p.dot(right)) / (tanH * limit) + depth)
  }
  for (let i = 0; i < 10; i++) {
    probe.position.copy(target).addScaledVector(dir, distance); probe.lookAt(target); probe.updateMatrixWorld()
    const b = projectedBounds(box, probe)
    target.addScaledVector(right, (b.left + b.right) * .5 * distance * tanH)
    target.addScaledVector(up, (b.bottom + b.top) * .5 * distance * tanV)
    const span = Math.max((b.right - b.left) * .5, (b.top - b.bottom) * .5)
    distance *= Math.max(.75,Math.min(1.35,span / limit))
  }
  return { position: target.clone().addScaledVector(dir, distance), target }
}
