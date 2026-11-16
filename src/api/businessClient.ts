export class BusinessApiError extends Error {
 code:string;status:number
 constructor(code:string,message:string,status:number){super(message);this.code=code;this.status=status}
}
let csrf:string|undefined
export async function businessRequest<T>(path:string,options:{method?:'GET'|'POST';body?:unknown;signal?:AbortSignal;key?:string}={}):Promise<T>{
 const method=options.method??'GET',headers:Record<string,string>={}
 if(method==='POST'){
  if(!csrf){const reply=await businessRequest<{token:string}>('/auth/csrf',{signal:options.signal});csrf=reply.token}
  headers['X-XSRF-TOKEN']=csrf!
 }
 let body:string|undefined
 if(options.body instanceof URLSearchParams){headers['Content-Type']='application/x-www-form-urlencoded';body=options.body.toString()}
 else if(options.body!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(options.body)}
 if(options.key)headers['Idempotency-Key']=options.key
 let response:Response
 try{response=await fetch('/api/business'+path,{method,headers,body,credentials:'same-origin',signal:options.signal??AbortSignal.timeout(15000)})}catch(error){if(options.signal?.aborted)throw error;throw new BusinessApiError('API_UNAVAILABLE','业务服务无法连接，未切换到离线数据',0)}
 let result:any;try{result=await response.json()}catch{throw new BusinessApiError('INVALID_RESPONSE','业务 API 返回格式错误',response.status)}
 if(!response.ok){if(response.status===401||response.status===403)csrf=undefined;throw new BusinessApiError(result.error?.code??'API_ERROR',result.error?.message??'业务请求失败',response.status)}
 return result as T
}
export async function businessLogin(username:string,password:string){csrf=undefined;await businessRequest('/auth/login',{method:'POST',body:new URLSearchParams({username,password})});csrf=undefined;return businessRequest<BusinessUser>('/auth/me')}
export type BusinessUser={username:string;roles:string[]}
export async function businessLogout(){await businessRequest('/auth/logout',{method:'POST'});csrf=undefined}
