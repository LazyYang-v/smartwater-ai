import { Box3, Object3D } from 'three'

export const DEVICE_ID = 'SW_BIO_AERATION_001'

export class DeviceRegistry {
  private devices = new Map<string, Object3D[]>()
  selectedId: string | null = null

  register(root: Object3D, expectedId: string | string[] = DEVICE_ID) {
    this.clear()
    root.traverse(node => {
      const id = node.userData.device_id
      if (typeof id === 'string') this.devices.set(id, [...(this.devices.get(id) ?? []), node])
    })
    for(const id of typeof expectedId==='string'?[expectedId]:expectedId)this.get(id)
  }
  get(id: string) {
    const matches = this.devices.get(id) ?? []
    if (matches.length !== 1) throw new Error(matches.length ? 'DEVICE_NOT_UNIQUE: 设备 ID 不唯一' : 'DEVICE_NOT_FOUND: 未找到设备 ' + id)
    return matches[0]!
  }
  ids(){return [...this.devices.keys()]}
  bounds(id: string) {const device=this.get(id);device.updateWorldMatrix(true,true);return new Box3().setFromObject(device,true)}
  select(id: string | null) { if (id) this.get(id); this.selectedId = id }
  resolve(node: Object3D): string | null {
    for (let p: Object3D | null = node; p; p = p.parent) {
      if (typeof p.userData.device_id === 'string') { this.get(p.userData.device_id); return p.userData.device_id }
    }
    return null
  }
  clear() { this.devices.clear(); this.selectedId = null }
}
