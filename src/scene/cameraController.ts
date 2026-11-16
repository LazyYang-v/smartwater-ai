import { PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export class SceneError extends Error {
  code: string
  constructor(code: string, message: string) { super(message); this.code = code; this.name = 'SceneError' }
}

type Pose = { position: number[]; target: number[]; zoom: number }
type Motion = {
  from: Vector3; fromTarget: Vector3; to: Vector3; target: Vector3; fromZoom: number; zoom: number
  start: number; deadline: number; duration: number; selectedId: string | null; signal?: AbortSignal
  resolve: (value: unknown) => void; reject: (reason: unknown) => void
  cleanup: () => void; arrived: boolean
}

export class CameraController {
  private motion: Motion | null = null
  private camera: PerspectiveCamera
  private controls: OrbitControls
  private selected: () => string | null
  private visible: () => boolean
  readonly events: {event:string;at:number;code?:string}[] = []
  diagnosticsEnabled = false
  constructor(camera: PerspectiveCamera, controls: OrbitControls, selected: () => string | null, visible = () => typeof document === 'undefined' || document.visibilityState === 'visible') {
    this.camera=camera;this.controls=controls;this.selected=selected;this.visible=visible
  }
  private trace(event:string,code?:string) {if(this.diagnosticsEnabled){this.events.push({event,at:performance.now(),code});if(this.events.length>300)this.events.shift()}}
  cancel(reason = '相机操作被中断', code = 'CANCELLED') {
    const motion = this.motion
    if (!motion) return
    this.motion = null; motion.cleanup(); this.trace('camera_stopped',code); motion.reject(new SceneError(code, reason))
  }
  private valid(now:number) {
    const motion=this.motion
    if(!motion)return false
    if(!this.visible()){this.cancel('页面隐藏，镜头动作已取消','PAGE_HIDDEN');return false}
    if(motion.signal?.aborted){this.cancel(String(motion.signal.reason));return false}
    if(now>=motion.deadline){this.cancel('相机未在限定时间内完成渲染','TIMEOUT');return false}
    return true
  }
  move(position: Vector3, target: Vector3, selectedId: string | null, signal?: AbortSignal, timeoutMs = 5000, zoom = 1): Promise<unknown> {
    if (signal?.aborted) return Promise.reject(new SceneError('CANCELLED', String(signal.reason)))
    if (!this.visible()) return Promise.reject(new SceneError('PAGE_HIDDEN', '页面隐藏，不能启动镜头动作'))
    this.cancel('新动作已接管相机')
    return new Promise((resolve, reject) => {
      const abort = () => this.cancel(String(signal?.reason ?? '操作取消'))
      const timer = setTimeout(() => {
        const motion = this.motion
        if (motion?.resolve === resolve) this.cancel('相机未在限定时间内完成渲染','TIMEOUT')
      }, timeoutMs)
      const start=performance.now()
      this.motion = { from: this.camera.position.clone(), fromTarget: this.controls.target.clone(), fromZoom: this.camera.zoom, zoom, to: position.clone(), target: target.clone(), selectedId, start, deadline:start+timeoutMs, signal, duration: 900, resolve, reject, arrived: false, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) } }
      this.trace('camera_started')
      signal?.addEventListener('abort', abort, { once: true })
    })
  }
  update(now: number) {
    if(!this.valid(now))return
    const motion = this.motion
    if (!motion) return
    const t = Math.min(1, Math.max(0, (now - motion.start) / motion.duration))
    const eased = t * t * (3 - 2 * t)
    this.camera.position.lerpVectors(motion.from, motion.to, eased)
    this.controls.target.lerpVectors(motion.fromTarget, motion.target, eased)
    this.camera.zoom = motion.fromZoom + (motion.zoom - motion.fromZoom) * eased
    this.camera.updateProjectionMatrix()
    motion.arrived = t === 1
  }
  afterRender(frame: number) {
    if(!this.valid(performance.now()))return
    const motion = this.motion
    if (!motion?.arrived) return
    if (this.camera.position.distanceTo(motion.to) > 0.00001 || this.controls.target.distanceTo(motion.target) > 0.00001 || this.selected() !== motion.selectedId || Math.abs(this.camera.zoom - motion.zoom) > 0.00001) return
    this.motion = null; motion.cleanup()
    this.trace('camera_succeeded')
    motion.resolve({ camera: this.pose(), selected_id: motion.selectedId, rendered_frame: frame, arrival_verified: true })
  }
  pose(): Pose { return { position: this.camera.position.toArray(), target: this.controls.target.toArray(), zoom: this.camera.zoom } }
  get busy() { return !!this.motion }
}
