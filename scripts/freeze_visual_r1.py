"""One local frozen production-build identity, not a separate evidence service."""
from pathlib import Path
import datetime,hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/acceptance/m0-visual-r1'
dist=ROOT/'dist'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
baseline=json.loads((OUT/'baseline/state.json').read_text())
assert all(sha(ROOT/p)==v for p,v in baseline['protected_old_evidence'].items()),'Old evidence changed'
assert all(sha(ROOT/p)==baseline['files'][p]['sha256'] for p in ['package.json','pnpm-lock.yaml']),'Dependency versions changed'
for part in ['basin','access','air','site']:
    assert json.loads((ROOT/'config/aeration.json').read_text())[part]==json.loads((ROOT/'docs/acceptance/model-final.json').read_text())['dimensions'][part]
(dist/'qa-assets').mkdir(exist_ok=True)
shutil.copy2(OUT/'baseline/site/models/aeration-tank.glb',dist/'qa-assets/m0-before.glb')
files={str(p.relative_to(dist)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(dist.rglob('*')) if p.is_file() and p.name!='build-id.json'}
build_id=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
identity={'build_id':build_id,'frozen_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files,'blend_sha256':sha(ROOT/'assets/source/aeration-tank.blend'),'public_glb_sha256':sha(ROOT/'public/models/aeration-tank.glb'),'baseline_glb_sha256':baseline['files']['public/models/aeration-tank.glb']['sha256'],'dependencies_unchanged':True,'dimensions_preserved':True,'snapshot_policy':'No dist modifications after this identity until capture, regression and performance are complete.'}
assert files['models/aeration-tank.glb']['sha256']==identity['public_glb_sha256']
(OUT/'build-identity.json').write_text(json.dumps(identity,indent=2)+'\n')
(dist/'build-id.json').write_text(json.dumps(identity,indent=2)+'\n')
print(json.dumps({'build_id':build_id,'glb_sha256':identity['public_glb_sha256'],'files':len(files)}))
