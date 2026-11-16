<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {UNITS} from '../scene/units'
import {useSceneWorkspace} from '../composables/useSceneWorkspace'
const query=new URLSearchParams(location.search),unit=UNITS.find(u=>u.modelKey===query.get('model'))??UNITS[0]!,clarifier=unit.modelKey==='clarifier'
const id=unit.id,name=unit.name
const scene=useSceneWorkspace({deviceId:id,modelUrl:unit.url})
const {runtime,records}=scene,host=ref<HTMLElement>()
function focus(){return scene.dispatchUser({tool_name:'scene.focus_device',arguments:{device_id:id}},'独立资产查看器')}
function reset(){return scene.dispatchUser({tool_name:'scene.reset_view',arguments:{}},'独立资产查看器')}
function bridgePose(){const pivot=runtime.value?.getRoot()?.getObjectByName('MECH_ScraperBridgePivot');if(pivot){pivot.rotation.y+=Math.PI/4;runtime.value?.invalidate()}}
onMounted(()=>{
 scene.attach(host.value!)
 if(query.has('qa'))Object.assign(window,{__SW_VIEWER__:{snapshot:()=>runtime.value!.snapshot(),focus,reset,cancel:scene.cancel,records:()=>structuredClone(scene.dispatcher.records),mode:(v:'interactive'|'full')=>runtime.value!.setRenderMode(v),measure:(s:number)=>runtime.value!.measurePerformance(s),load:()=>runtime.value!.load(),water:(v:boolean)=>runtime.value!.setWater(v),roof:(v:boolean)=>runtime.value!.setRoof(v),bridgePose}})
})
</script>
<template>
 <main class="asset-viewer" :class="{benchmark:query.has('benchmark')}"><header><div><p>SMARTWATER / INDEPENDENT ASSET VIEWER</p><h1>{{name}} · 独立 GLB</h1><span>{{id}} · 米制演示资产 · 非施工设计</span></div><a href="/">返回大屏</a></header>
 <nav><label>绘制模式 <select :value="runtime?.state.renderMode" @change="runtime?.setRenderMode(($event.target as HTMLSelectElement).value as 'interactive'|'full')"><option value="interactive">交互优先</option><option value="full">完整效果 · 未验证稳定</option></select></label><button @click="focus" :disabled="runtime?.state.status!=='ready'">定位当前设备</button><button @click="reset" :disabled="runtime?.state.status!=='ready'">恢复总览</button><button @click="scene.cancel" :disabled="!['PENDING','RUNNING'].includes(scene.taskState.value)">取消</button><button v-if="unit.water" @click="runtime?.setWater(!runtime.state.waterVisible)">{{runtime?.state.waterVisible?'隐藏水面':'显示水面'}}</button><button v-if="unit.roof" @click="runtime?.setRoof(!runtime.state.roofStates[id])">{{runtime?.state.roofStates[id]?'隐藏屋顶':'显示屋顶'}}</button><button v-if="clarifier" @click="bridgePose">桥架姿态 +45° · 模型预览</button></nav>
 <p class="note">{{runtime?.state.renderMode==='interactive'?'交互优先：静止按需绘制，水纹动画暂停。拖动和镜头动作持续绘制。':'完整效果：持续绘制与水纹动画；未标为稳定模式。'}} 模拟资产，不连接工业设备。</p>
 <section class="stage"><div ref="host" class="canvas-host"/><div v-if="runtime?.state.status!=='ready'" class="loading"><h2>{{runtime?.state.status==='loading'?'载入模型中':'资产不可用'}}</h2><p>{{runtime?.state.error}}</p><button v-if="runtime?.state.status!=='loading'" @click="runtime?.load()">重试</button></div></section>
 <footer><span>{{runtime?.state.status}} · {{runtime?.state.assetTriangles.toLocaleString()}} 模型三角面 · {{runtime?.state.calls}} 最近 draw calls（含阴影） · Three DPR 1</span><span v-if="clarifier">Ø24m · 池顶+1.2m / 水面+0.5m · 源Z向上，GLB轴向转换一次</span></footer><details v-if="records.length" open><summary>真实工具执行记录 · {{scene.taskState.value}}</summary><pre>{{JSON.stringify(records.at(-1),null,2)}}</pre></details>
 </main>
</template>
<style scoped>
*{box-sizing:border-box}:global(body:has(.asset-viewer)){margin:0;background:#081724;color:#dce9f1;font:14px 'PingFang SC',sans-serif}main{padding:24px 32px;max-width:1800px;margin:auto}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #29495f;padding-bottom:18px}header p{font-size:12px;letter-spacing:.16em;color:#6cd0dd;margin:0 0 9px}h1{font-size:25px;margin:0 0 8px}header span,.note,footer{color:#a4bdcd}a{color:#7ed8e3}nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}button,select{font:inherit;color:#dce9f1;background:#133044;border:1px solid #3d6278;border-radius:4px;padding:8px 12px;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.note{line-height:1.6}.stage{height:min(66vh,720px);position:relative;background:#d8e3e6}.canvas-host{width:100%;height:100%}.canvas-host :deep(canvas){display:block}.loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#122d40dd}footer{display:flex;justify-content:space-between;gap:16px;font-size:12px;margin:12px 0}details{background:#0f2637;border:1px solid #284b63;padding:10px}pre{white-space:pre-wrap;max-height:180px;overflow:auto}.benchmark .stage{width:1218px;height:427px}
</style>
