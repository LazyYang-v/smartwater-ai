from pathlib import Path
import json,hashlib,shutil,difflib
root=Path(__file__).resolve().parents[1];out=root/'docs/acceptance/m1-stability-r1/batch-experiment'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
identity=json.loads((out/'build-identity.json').read_text())
assert all(h(root/p)==v for p,v in identity['source_files'].items()),'Concurrent source changes; do not overwrite'
patch=[]
for f in identity['source_files']:
 p=root/f;archive=out/'implementation'/f;archive.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,archive)
 before=out/'before'/f;previous=before.read_text() if before.exists() else ''
 patch.extend(difflib.unified_diff(previous.splitlines(True),p.read_text().splitlines(True),fromfile='fixed65/'+f,tofile='experiment/'+f))
(out/'implementation.patch').write_text(''.join(patch))
for f in ['src/scene/runtime.ts','src/qa/exposeDashboardQA.ts']:shutil.copyfile(out/'before'/f,root/f)
(root/'src/scene/staticBatches.ts').unlink() # Only this script's archived, hash-checked experimental file.
fixed=json.loads((out.parent/'build-identity.json').read_text())
assert all(h(root/p)==v for p,v in fixed['source_files'].items()),'Restored source differs from frozen delivery'
(out/'restored.json').write_text(json.dumps({'restored_to_build':fixed['build_id'],'source_byte_identical':True,'experimental_implementation_and_all_results_preserved':True},indent=2)+'\n')
print('Restored exactly to frozen source; experiment and results preserved.')
