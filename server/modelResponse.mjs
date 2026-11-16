// Only expose bounded protocol metadata, never authorization headers or reasoning.
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_.:/-]{1,160}$/.test(value)?value:null
const count=value=>Number.isFinite(value)&&value>=0?value:undefined
export function modelReceipt(response,body,model,started){
 const usage=body?.usage,details=usage?.completion_tokens_details,prompt=usage?.prompt_tokens_details
 return {provider:'OpenAI',model:identifier(body?.model)??model,request_id:identifier(response.headers.get('x-request-id')),response_id:identifier(body?.id),http_status:response.status,elapsed_ms:Date.now()-started,usage:usage?{prompt_tokens:count(usage.prompt_tokens),completion_tokens:count(usage.completion_tokens),total_tokens:count(usage.total_tokens),cached_tokens:count(prompt?.cached_tokens),reasoning_tokens:count(details?.reasoning_tokens)}:'UNKNOWN'}
}
export function classifyUpstream(http,body){
 const code=identifier(body?.error?.code),type=identifier(body?.error?.type),param=identifier(body?.error?.param)
 let classified='MODEL_REQUEST_FAILED'
 if(['insufficient_quota','billing_hard_limit_reached','billing_not_active'].includes(code)||type==='insufficient_quota')classified='MODEL_QUOTA_EXCEEDED'
 else if(http===401||code==='invalid_api_key')classified='MODEL_AUTH_FAILED'
 else if(code==='model_not_found'||code==='model_not_available'||type==='not_found_error'||http===404)classified='MODEL_NOT_AVAILABLE'
 else if(code==='rate_limit_exceeded'||type==='rate_limit_error'||http===429)classified='MODEL_RATE_LIMITED'
 else if(http===403)classified='MODEL_ACCESS_DENIED'
 else if(http===400||http===422||type==='invalid_request_error')classified='MODEL_INVALID_REQUEST'
 else if(http>=500)classified='MODEL_UPSTREAM_ERROR'
 return {code:classified,upstream_error:{code,type,param}}
}
export const MODEL_ERRORS={MODEL_QUOTA_EXCEEDED:'模型额度不足；未自动重试或切换供应商',MODEL_AUTH_FAILED:'模型认证失败，请检查服务端凭据',MODEL_NOT_AVAILABLE:'模型不存在或当前账号无访问权限',MODEL_RATE_LIMITED:'上游模型限流；未自动重试',MODEL_ACCESS_DENIED:'上游拒绝访问，请检查账号或区域权限',MODEL_INVALID_REQUEST:'模型请求参数或协议不兼容',MODEL_UPSTREAM_ERROR:'上游模型服务暂时异常',MODEL_REQUEST_FAILED:'模型服务拒绝请求',MODEL_NETWORK_TIMEOUT:'连接模型服务超时，请检查本项目进程的网络代理',MODEL_UNAVAILABLE:'模型服务网络不可达；未回退Demo'}
