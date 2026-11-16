from pathlib import Path
import json,time,subprocess
root=Path(__file__).resolve().parents[1];out=root/'docs/acceptance/m1-stability-r1'
while True:
 try:
  if len(json.loads((out/'baseline-replay/summary.json').read_text()))==9:break
 except (ValueError,FileNotFoundError):pass
 time.sleep(5)
time.sleep(2)
with (out/'baseline-normal-profile.log').open('w') as log:
 with (root/'scripts/m11-baseline-profile.mjs').open() as script:
  subprocess.run(['ego-browser','nodejs'],stdin=script,stdout=log,stderr=subprocess.STDOUT,check=True,cwd=root)
for name,command in [('unit-tests',['pnpm','test']),('build',['pnpm','build'])]:
 with (out/(name+'.log')).open('w') as log:subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True)
subprocess.run(['python3','scripts/m11-freeze.py'],cwd=root,check=True)
