#!/usr/bin/env python3
"""Project-local business launcher; never prints configuration secrets."""
from pathlib import Path
import os,secrets,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
def config():
 p=ROOT/'.env.business.local'
 if not p.exists():
  p.write_text(''.join(k+'='+secrets.token_urlsafe(30)+'\n' for k in ['SW_DB_PASSWORD','SW_ADMIN_PASSWORD','SW_OPERATOR_PASSWORD','SW_VIEWER_PASSWORD','SW_COLLECTOR_TOKEN']));p.chmod(0o600)
 values={line.split('=',1)[0]:line.split('=',1)[1] for line in p.read_text().splitlines() if line and not line.startswith('#') and '=' in line}
 missing=[k for k in ['SW_DB_PASSWORD','SW_ADMIN_PASSWORD','SW_OPERATOR_PASSWORD','SW_VIEWER_PASSWORD','SW_COLLECTOR_TOKEN'] if not values.get(k)]
 if missing:raise SystemExit('Missing local configuration: '+', '.join(missing)+'; edit .env.business.local locally (values must not be shared).')
 return dict(os.environ,**values)
def run(args,cwd=ROOT):return subprocess.run(args,cwd=cwd,env=config(),check=True)
command=sys.argv[1] if len(sys.argv)>1 else 'help'
if command=='init':config();print('Private configuration ready: .env.business.local (values not printed)')
elif command=='db':run(['docker','compose','--env-file','.env.business.local','up','-d','--wait','db'])
elif command=='test-db':
 exists=subprocess.run(['docker','compose','--env-file','.env.business.local','exec','-T','db','psql','-U','smartwater','-d','postgres','-tAc',"SELECT 1 FROM pg_database WHERE datname='smartwater_test'"],cwd=ROOT,env=config(),capture_output=True,check=True).stdout.strip()
 if not exists:run(['docker','compose','--env-file','.env.business.local','exec','-T','db','createdb','-U','smartwater','smartwater_test'])
elif command=='collect':run(['node','--experimental-strip-types','collector/simulator.mjs',*sys.argv[2:]])
elif command in ['run','test','package','serve']:
 env=config()
 if sys.platform=='darwin':
  j=subprocess.run(['/usr/libexec/java_home','-v','17'],capture_output=True,text=True)
  if j.returncode==0:env['JAVA_HOME']=j.stdout.strip()
 if command=='serve':
  jar=ROOT/'backend/target/smartwater-business-0.2.0.jar'
  if not jar.exists():raise SystemExit('Run python3 scripts/business.py package first')
  args=[str(Path(env['JAVA_HOME'])/'bin/java') if env.get('JAVA_HOME') else 'java','-jar',str(jar)]
 else:
  args=['mvn','-B','-Dmaven.repo.local='+str(ROOT/'.cache/maven')]
  args+=['spring-boot:run'] if command=='run' else ['test'] if command=='test' else ['-DskipTests','package']
 raise SystemExit(subprocess.run(args,cwd=ROOT/'backend',env=env).returncode)
else:print('Usage: python3 scripts/business.py init|db|test-db|run|test|package|serve|collect [NORMAL|LOW_DO|MISSING_DATA] [--seed] [--continuous]')
