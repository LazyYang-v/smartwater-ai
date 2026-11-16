from pathlib import Path
import subprocess,os,signal,time,json,datetime,urllib.request
root=Path(__file__).resolve().parents[1];out=root/'docs/acceptance/m1-stability-r1';pid=29866
cmd=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True).strip()
assert str(root) in cmd and 'vite.js preview' in cmd,'Refuse to stop an unverified project process'
record={'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'old_pid':pid,'verified_old_command':cmd,'stop_signal':'SIGTERM','command':'pnpm preview','cwd':str(root)}
os.kill(pid,signal.SIGTERM)
for i in range(20):
 if subprocess.run(['ps','-p',str(pid)],stdout=subprocess.DEVNULL).returncode!=0:break
 time.sleep(.25)
else:raise RuntimeError('Project server did not exit; do not force kill')
log=(out/'restart-server.log').open('w');proc=subprocess.Popen(['pnpm','preview'],cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);record['new_pnpm_pid']=proc.pid
for i in range(40):
 if proc.poll() is not None:raise RuntimeError('Project preview failed to start; inspect restart-server.log')
 try:
  with urllib.request.urlopen('http://127.0.0.1:4173/build-id.json',timeout=2) as r:d=json.load(r)
  assert d['build_id']==json.loads((out/'build-identity.json').read_text())['build_id']
  record['build_id']=d['build_id'];record['http_ready_at_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();record['restarted']=True;break
 except Exception:time.sleep(.25)
else:raise RuntimeError('New preview did not become ready')
(out/'restart-process.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
