import type { ActionRecord, ToolCall, ToolHandler, ToolName } from './types.ts'
import { traceInput } from '../diagnostics/stability.ts'

export class ActionDispatcher {
  readonly records: ActionRecord[] = []
  private cache = new Map<string, { fingerprint: string; promise: Promise<ActionRecord> }>()
  private active: AbortController | null = null
  private tools: Partial<Record<ToolName, ToolHandler>>
  private changed: () => void
  constructor(tools: Partial<Record<ToolName, ToolHandler>>, changed: () => void = () => {}) { this.tools = tools; this.changed = changed }
  private listeners=new Set<(record:ActionRecord)=>void>()
  subscribe(listener:(record:ActionRecord)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener)}}
  private publish(record:ActionRecord){this.changed();for(const listener of this.listeners){try{listener(record)}catch{/* A history failure is not an execution failure. */}}}
  dispatch(call: ToolCall, actionId: string = crypto.randomUUID(), context: Pick<ActionRecord,'source'|'trigger'|'task_id'|'snapshot_id'|'as_of'|'model_call_id'|'model_request_id'|'model_request_index'> = {},externalSignal?:AbortSignal): Promise<ActionRecord> {
    if (!Object.hasOwn(this.tools, call.tool_name)) return Promise.reject(new Error('TOOL_NOT_ALLOWED'))
    const fingerprint = JSON.stringify([call.tool_name, Object.entries(call.arguments).sort(([a],[b]) => a.localeCompare(b))])
    const existing = this.cache.get(actionId)
    if (existing) {
      if (existing.fingerprint !== fingerprint) return Promise.reject(new Error('ACTION_ID_CONFLICT'))
      return existing.promise
    }
    this.active?.abort('新命令已接管相机')
    const controller = new AbortController(); this.active = controller
    const externalAbort=()=>controller.abort(externalSignal?.reason);if(externalSignal?.aborted)externalAbort();else externalSignal?.addEventListener('abort',externalAbort,{once:true})
    const record: ActionRecord = { ...call, arguments: structuredClone(call.arguments), ...context, action_id: actionId, status: 'PENDING', started_at: new Date().toISOString(), finished_at: null }
    this.records.push(record); traceInput('task_PENDING',{actionId}); this.publish(record)
    // Publish the idempotency entry before invoking the handler.
    const promise = Promise.resolve().then(async () => {
      record.status = 'RUNNING'; traceInput('task_RUNNING',{actionId}); this.publish(record)
      try {
        if (controller.signal.aborted) throw { code: 'CANCELLED', message: String(controller.signal.reason) }
        const result = await this.tools[call.tool_name]!(record.arguments, controller.signal)
        if (controller.signal.aborted) throw { code: 'CANCELLED', message: String(controller.signal.reason) }
        record.result = result; record.status = 'SUCCEEDED'
      } catch (error) {
        const info = error as { code?: string; message?: string }
        const message = info.message ?? String(error)
        const reason=controller.signal.reason as {code?:string;message?:string}|undefined
        const code = controller.signal.aborted ? reason?.code??'CANCELLED' : info.code ?? message.split(':')[0] ?? 'TOOL_FAILED'
        record.status = controller.signal.aborted || code === 'CANCELLED' || code === 'PAGE_HIDDEN' ? 'CANCELLED' : 'FAILED'
        record.error = { code, message:controller.signal.aborted?(reason?.message??String(controller.signal.reason)):message }
      } finally {
        externalSignal?.removeEventListener('abort',externalAbort)
        record.finished_at = new Date().toISOString()
        traceInput('task_'+record.status,{actionId})
        if (this.active === controller) this.active = null
        this.publish(record)
      }
      return record
    })
    this.cache.set(actionId, { fingerprint, promise })
    return promise
  }
  cancel(reason: string) { this.active?.abort(reason) }
}
