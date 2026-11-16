#!/usr/bin/env python3
"""Acceptance against the project's running API, without exposing local credentials."""
from pathlib import Path
from datetime import datetime,timezone,timedelta
import json,hashlib,uuid,urllib.request,urllib.parse,http.cookiejar,sys
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/acceptance/v02-business'
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def describe(s):return {'snapshotId':s['snapshotId'],'canonical_sha256':digest(s),'revision':s['backend']['revision'],'as_of':s['demoTime'],'readings':s['readings'],'alarms':s['alarms'],'history_counts':{k:len(v) for k,v in s['history'].items()}}
settings=dict(line.split('=',1) for line in (ROOT/'.env.business.local').read_text().splitlines() if line and not line.startswith('#') and '=' in line)
jar=http.cookiejar.CookieJar();http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));csrf=''
def api(path,body=None,headers=None):
 h=dict(headers or {});payload=None
 if body is not None:
  if isinstance(body,str):payload=body.encode();h['Content-Type']='application/x-www-form-urlencoded'
  else:payload=json.dumps(body).encode();h['Content-Type']='application/json'
  if csrf:h['X-XSRF-TOKEN']=csrf
 req=urllib.request.Request('http://127.0.0.1:8080/api/business'+path,payload,h)
 with http.open(req,timeout=20) as response:return json.load(response)
def login():
 global csrf
 csrf=api('/auth/csrf')['token'];api('/auth/login',urllib.parse.urlencode({'username':'operator','password':settings['SW_OPERATOR_PASSWORD']}));csrf=api('/auth/csrf')['token']
def iso(t):return t.isoformat(timespec='milliseconds').replace('+00:00','Z')
login()
if len(sys.argv)>1 and sys.argv[1]=='after-restart':
 checkpoint=json.loads((OUT/'business-journey.json').read_text());old=checkpoint['frozen_snapshot'];view=api('/snapshots/'+old['snapshotId']);assert digest(view)==old['canonical_sha256']
 current={a['alarmId']:a for a in api('/alarms')};assert current[checkpoint['alarm_id']]['status']=='CLOSED'
 evidence=api('/evidence/'+checkpoint['query_evidence']['evidence_id']);assert evidence==checkpoint['query_evidence']
 result={'at':iso(datetime.now(timezone.utc)),'snapshot_unchanged':True,'same_alarm_still_closed':True,'same_query_evidence_unchanged':True,'snapshot_id':old['snapshotId'],'alarm_id':checkpoint['alarm_id']}
 (OUT/'restart-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result));raise SystemExit()
base=datetime.now(timezone.utc)-timedelta(seconds=20)
def collect(value,quality,second,scenario):
 point={'sampleId':'accept-'+str(uuid.uuid4()),'deviceId':'SW_BIO_AERATION_001','metricKey':'do','value':value,'unit':'mg/L','quality':quality,'source':'SIMULATED','observedAt':iso(base+timedelta(seconds=second))}
 body={'scenario':scenario,'readings':[point]};headers={'Authorization':'Bearer '+settings['SW_COLLECTOR_TOKEN'],'Idempotency-Key':'accept-'+str(uuid.uuid4())};result=api('/telemetry',body,headers);assert api('/telemetry',body,headers)==result;return result
collect(2.8,'GOOD',0,'NORMAL');collect(1.6,'GOOD',1,'LOW_DO');collect(1.7,'GOOD',2,'LOW_DO')
frozen=api('/dashboard');active=frozen['alarms'];assert len(active)==1;alarm=active[0];assert alarm['valueAtEvent']==1.6 and alarm['occurrenceCount']==2
query=api('/snapshots/'+frozen['snapshotId']+'/devices/SW_BIO_AERATION_001/metrics?metricKeys=do&hours=6');inspect=api('/snapshots/'+frozen['snapshotId']+'/alarms/'+alarm['alarmId']);assert inspect['data']['event_quality']=='GOOD'
collect(None,'MISSING',3,'MISSING_DATA');missing=api('/dashboard');assert missing['readings']['do']['value'] is None;assert missing['alarms'][0]['status']=='AWAITING_DATA'
assert api('/snapshots/'+frozen['snapshotId'])==frozen
ackkey='accept-'+str(uuid.uuid4());ack=api('/alarms/'+alarm['alarmId']+'/acknowledge',{'note':'核对数据库触发样本和演示规则'},{'Idempotency-Key':ackkey});assert ack==api('/alarms/'+alarm['alarmId']+'/acknowledge',{'note':'核对数据库触发样本和演示规则'},{'Idempotency-Key':ackkey})
collect(2.8,'GOOD',4,'NORMAL');recovered=next(a for a in api('/alarms') if a['alarmId']==alarm['alarmId']);assert recovered['status']=='RECOVERED'
closed=api('/alarms/'+alarm['alarmId']+'/close',{'note':'数据已恢复且已人工确认，本次演示归档'},{'Idempotency-Key':'accept-'+str(uuid.uuid4())});assert closed['status']=='CLOSED'
OUT.mkdir(parents=True,exist_ok=True)
result={'at':iso(datetime.now(timezone.utc)),'source':'SIMULATED','alarm_id':alarm['alarmId'],'frozen_snapshot':describe(frozen),'query_evidence':query,'trigger_evidence':inspect,'missing_snapshot':describe(missing),'acknowledged':ack,'recovered':recovered,'closed':closed,'checks':['repeat ingestion receipt identical','continuous low samples one alarm','missing null and active alarm retained','acknowledge idempotent','valid recovery then manual close','frozen snapshot unchanged after later writes']}
(OUT/'business-journey.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'checks':result['checks'],'alarm_id':alarm['alarmId'],'snapshot_id':frozen['snapshotId']}))
