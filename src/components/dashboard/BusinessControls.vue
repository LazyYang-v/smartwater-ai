<script setup lang="ts">
import {ref,computed} from 'vue'
import type {DashboardData} from '../../composables/useDashboardData'
const props=defineProps<{data:DashboardData}>()
const emit=defineEmits<{toggle:[]}>()
const username=ref('operator'),password=ref(''),busy=ref(false),showLedger=ref(false),note=ref(''),operationError=ref(''),selected=ref('')
const canWrite=computed(()=>props.data.user.value?.roles.some(r=>r==='ROLE_ADMIN'||r==='ROLE_OPERATOR'))
const stateLabel=(s:string)=>({ACTIVE:'触发中',AWAITING_DATA:'缺测 · 未解除',ACKNOWLEDGED:'已确认 · 未恢复',RECOVERED:'已恢复',CLOSED:'已关闭'}[s]??s)
const keys=new Map<string,string>()
async function login(){busy.value=true;try{await props.data.login(username.value,password.value)}finally{password.value='';busy.value=false}}
async function action(id:string,action:'acknowledge'|'close'){
 if(!note.value.trim()){operationError.value='请填写操作说明';return}
 busy.value=true;operationError.value='';const fingerprint=JSON.stringify([id,action,note.value]);if(!keys.has(fingerprint))keys.set(fingerprint,crypto.randomUUID())
 try{await props.data.command(id,action,note.value,keys.get(fingerprint)!);note.value='';selected.value=''}catch(error){operationError.value=(error as Error).message}finally{busy.value=false}
}
const time=(v:string)=>new Date(v).toLocaleString('zh-CN',{hour12:false})
</script>
<template>
 <section class="business-controls" aria-label="业务数据连接">
  <div class="business-source"><strong>业务 API · PostgreSQL</strong><span>SIMULATED · 独立采集器上报</span><small>快照 {{data.snapshot.value.backend?.revision??'—'}} · {{data.status.value==='CONNECTED'?'已连接':data.status.value==='AUTH_REQUIRED'?'待登录':data.status.value==='CONNECTING'?'连接中':'连接异常'}}</small></div>
  <form v-if="!data.user.value" class="business-login" @submit.prevent="login"><label>账户<input v-model="username" autocomplete="username" name="username" required maxlength="80"/></label><label>密码<input v-model="password" type="password" name="password" autocomplete="current-password" required/></label><button class="secondary-button" :disabled="busy">{{busy?'连接中…':'登录业务系统'}}</button><a href="?data=demo">离线演示</a></form>
  <div v-else class="business-actions"><span>{{data.user.value.username}} · {{canWrite?'运维权限':'只读权限'}}</span><button class="secondary-button" @click="data.setPaused(!data.paused.value)">{{data.paused.value?'恢复查询':'暂停查询'}}</button><button class="secondary-button" @click="data.refresh()">刷新</button><button class="secondary-button" @click="showLedger=true">告警台账</button><button class="text-button" @click="data.logout()">退出</button></div>
  <button class="text-button" @click="emit('toggle')">信息面板</button>
  <p v-if="data.error.value" role="alert" class="business-error">{{data.error.value}} · 当前保留数据不代表最新状态</p>
  <p v-if="data.paused.value||data.hidden.value" class="business-error">页面查询已暂停；采集器和服务端独立运行。</p>
 </section>
 <aside v-if="showLedger" class="business-ledger" aria-label="告警台账"><header><div><h2>告警台账</h2><p>触发 → 人工确认 → 数据恢复 → 人工关闭 · 演示规则</p></div><button class="secondary-button" @click="showLedger=false">关闭面板</button></header><p v-if="!data.ledger.value.length">数据库暂无告警记录；不代表设备健康。</p><article v-for="alarm in data.ledger.value" :key="alarm.alarmId"><strong>{{stateLabel(alarm.status)}} · {{alarm.deviceId}}</strong><p>{{alarm.rule}} · 触发值 {{alarm.valueAtEvent}} mg/L</p><code>{{alarm.alarmId}}</code><p>发生 {{time(alarm.occurredAt)}} · 规则 {{alarm.ruleVersion}} · 连续样本 {{alarm.occurrenceCount}}</p><p v-if="alarm.acknowledgedAt">确认 {{alarm.acknowledgedBy}} · {{time(alarm.acknowledgedAt)}}</p><p v-if="alarm.recoveredAt">恢复 {{time(alarm.recoveredAt)}}</p><p v-if="alarm.closedAt">关闭 {{time(alarm.closedAt)}}</p><button v-if="canWrite&&alarm.status!=='CLOSED'" class="text-button" @click="selected=selected===alarm.alarmId?'':alarm.alarmId">处理此记录</button><div v-if="selected===alarm.alarmId"><label>操作说明<textarea v-model="note" maxlength="500" placeholder="填写核对依据或关闭说明"/></label><button class="secondary-button" :disabled="busy||!!alarm.acknowledgedAt" @click="action(alarm.alarmId,'acknowledge')">确认告警</button><button class="secondary-button" :disabled="busy||alarm.lifecycleStatus!=='RECOVERED'||!alarm.acknowledgedAt" @click="action(alarm.alarmId,'close')">已恢复，关闭记录</button><p>异常未恢复或未确认时不可关闭；这些人工操作不由 Agent 执行。</p></div></article><p v-if="operationError" role="alert" class="business-error">{{operationError}}</p><p>展示最近 100 条数据库记录。已关闭记录仍保留；SIMULATED，不是现场安全认证。</p></aside>
</template>
<style scoped>
.business-controls{display:flex;align-items:center;flex-wrap:wrap;gap:16px;padding:10px 18px;border:1px solid var(--border,#25435a);background:#0a1c30;color:#c2d9ea;font-size:14px;min-height:68px}.business-source{display:flex;flex-direction:column;gap:3px}.business-source strong{color:#79ddd8}.business-source small{font-size:13px}.business-login,.business-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.business-login label{display:flex;align-items:center;gap:7px}.business-login input{width:140px;padding:8px;background:#10283d;border:1px solid #426075;color:#e1edf7;border-radius:4px;font:inherit}.business-login a{color:#71d5d6}.business-error{color:#ffcf8d;margin:0;flex-basis:100%}.business-ledger{position:fixed;z-index:90;inset:8vh 5vw 5vh auto;width:min(680px,90vw);background:#0b2137;border:1px solid #41728e;box-shadow:0 12px 90px #000a;padding:24px;overflow:auto;font-size:15px;color:#dbeaf4}.business-ledger header{display:flex;justify-content:space-between;gap:12px}.business-ledger h2{margin-top:0}.business-ledger article{border-top:1px solid #31516a;padding:18px 0}.business-ledger p{line-height:1.6}.business-ledger code{overflow-wrap:anywhere}.business-ledger textarea{display:block;width:100%;min-height:60px;margin:8px 0;background:#10283d;border:1px solid #426075;color:white;font:inherit}.business-ledger button{margin-right:10px}
</style>
