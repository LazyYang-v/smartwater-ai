import { init,use,type EChartsType } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent,TooltipComponent,LegendComponent,MarkLineComponent,AriaComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
use([LineChart,GridComponent,TooltipComponent,LegendComponent,MarkLineComponent,AriaComponent,SVGRenderer])
export const chartStats={created:0,disposed:0,updates:0,resizes:0,active:0}
export function createChart(host:HTMLElement):EChartsType {chartStats.created++;chartStats.active++;return init(host,undefined,{renderer:'svg'})}
export function disposeChart(chart:EChartsType) {chart.dispose();chartStats.disposed++;chartStats.active--}
