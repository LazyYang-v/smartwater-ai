import type { ToolCall } from './types.ts'

export function parseCommand(text: string): ToolCall | null {
  const normalized = text.trim().replace(/[。！!？?]+$/u, '')
  if (normalized === '定位一号曝气池') return { tool_name: 'scene.focus_device', arguments: { device_id: 'SW_BIO_AERATION_001' } }
  if (normalized === '定位一号二沉池') return { tool_name: 'scene.focus_device', arguments: { device_id: 'SW_CLR_TANK_001' } }
  if (normalized === '定位一号鼓风机') return { tool_name: 'scene.focus_device', arguments: { device_id: 'SW_AIR_BLOWER_001' } }
  if (normalized === '定位一号提升泵') return { tool_name: 'scene.focus_device', arguments: { device_id: 'SW_PRE_PUMP_001' } }
  if (normalized === '回到总览') return { tool_name: 'scene.reset_view', arguments: {} }
  return null
}
