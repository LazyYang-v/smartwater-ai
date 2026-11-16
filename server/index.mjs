import {createGateway,configuration,status} from './gateway.mjs'
const config=configuration(),server=createGateway(config)
server.on('error',error=>{console.error('SmartWater模型网关无法启动：'+(error.code==='EADDRINUSE'?'本地8787端口已占用':'本地服务错误'));process.exitCode=1})
server.listen(8787,'127.0.0.1',()=>console.log('SmartWater model gateway http://127.0.0.1:8787 · '+(status(config).ready?'configured':'LLM disabled: missing server-side configuration')))
