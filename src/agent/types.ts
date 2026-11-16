import type {AgentToolName} from './contracts.ts'
export type ToolName = AgentToolName
export type ToolCall = { tool_name: ToolName; arguments: Record<string, unknown> }
export type ActionRecord = ToolCall & {
  action_id: string; status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  started_at: string; finished_at: string | null; result?: unknown; error?: { code: string; message: string }
  source?: 'DEMO_AGENT' | 'LLM' | 'USER' | 'TEST'; trigger?: string;task_id?:string;snapshot_id?:string;as_of?:string;model_call_id?:string;model_request_id?:string;model_request_index?:string
}
export type ToolHandler = (args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
