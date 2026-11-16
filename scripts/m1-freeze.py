from pathlib import Path
import json,hashlib,datetime
root=Path(__file__).resolve().parents[1];out=root/'docs/acceptance/m1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((out/'baseline.json').read_text())
assert all(sha(root/p)==h for p,h in baseline['protected'].items()),'A protected M0/M0.1 file changed'
assert not (out/'build-identity.json').exists(),'Frozen M1 identity exists; do not silently replace it'
files={str(p.relative_to(root/'dist')):{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted((root/'dist').rglob('*')) if p.is_file() and p.name!='build-id.json'}
identity={'build_id':hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest(),'frozen_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files,'glb_sha256':sha(root/'public/models/aeration-tank.glb'),'blend_sha256':sha(root/'assets/source/aeration-tank.blend'),'source_files':{str(p.relative_to(root)):sha(p) for directory in ['src','tests'] for p in sorted((root/directory).rglob('*')) if p.is_file()},'protected_assets_unchanged':True,'policy':'Do not modify dist during production regressions, captures, restart and performance tests.'}
assert files['models/aeration-tank.glb']['sha256']==identity['glb_sha256']
(out/'build-identity.json').write_text(json.dumps(identity,indent=2)+'\n');(root/'dist/build-id.json').write_text(json.dumps(identity,indent=2)+'\n')
print(json.dumps({'build_id':identity['build_id'],'glb_sha256':identity['glb_sha256'],'files':len(files)}))
