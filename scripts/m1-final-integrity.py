from pathlib import Path
import datetime,hashlib,json,math,re,tarfile
from PIL import Image
root=Path(__file__).resolve().parents[1];out=root/'docs/acceptance/m1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads((out/p).read_text())
baseline=load('baseline.json');identity=load('build-identity.json');shots=load('screenshots-manifest.json')
assert all(sha(root/p)==h for p,h in baseline['protected'].items()),'Protected file changed'
assert all(sha(root/'dist'/p)==d['sha256'] for p,d in identity['files'].items()),'Frozen build changed'
assert all(sha(root/p)==h for p,h in identity['source_files'].items()),'Source changed after fixed build'
assert json.loads((root/'dist/build-id.json').read_text())==identity
for p in ['src/scene/cameraController.ts','src/scene/deviceRegistry.ts','src/agent/demoParser.ts','tests/framing.test.ts','AGENTS.md']:
 assert sha(root/p)==baseline['files'][p]['sha256'],p
with tarfile.open(out/'m0.1-frontend-before.tar.gz') as t:
 original=t.extractfile('tests/dispatcher.test.ts').read()
 assert (root/'tests/dispatcher.test.ts').read_bytes().startswith(original),'Original unit assertions changed'
 old=t.extractfile('scripts/browser-acceptance.mjs').read().decode()
 old=old[old.index("await test('GLB / HDR"):old.index("await fs.writeFile(base+'browser-tests.json'")]
 new=(root/'scripts/m1-browser-legacy.mjs').read_text()
 new=new[new.index("await test('GLB / HDR"):new.index("await fs.writeFile(base+'browser-tests.json'")]
 assert old==new,'Legacy browser assertions were modified'
mandatory=['normal-1920.png','low-do.png','alarm-located.png','missing-data.png','data-only-blower.png','compact-1366.png']
assert all(any(s['file'].endswith(name) for s in shots) for name in mandatory)
for s in shots:
 assert sha(out/s['file'])==s['sha256']
 assert s['build_id']==identity['build_id']
 assert s['scene']['loadedModelSha256']==identity['glb_sha256']
 assert s['scene']['rendererDpr']==1
 assert s['scene']['drawingBuffer']==s['scene']['canvas']
 for p,h in s['browserResponseHashes'].items():assert identity['files'][p.lstrip('/')]['sha256']==h
 with Image.open(out/s['file']) as im:
  im.load();assert im.size==(s['viewport']['width'],s['viewport']['height'])
 data=s['data'];assert all(p['snapshotId']==data['snapshotId'] and p['source']=='SIMULATED' for p in data['readings'].values())
 assert data['readings']['depth']['value']==4.8
missing=next(s for s in shots if s['file'].endswith('/missing-data.png'))['data']
assert missing['readings']['do']['value'] is None and missing['readings']['do']['quality']=='MISSING'
assert missing['readings']['blower_power']['quality']=='STALE' and missing['alarms'][0]['status']=='AWAITING_DATA'
for file,count in [('feature-tests.json',10),('legacy/browser-tests.json',15)]:
 tests=load(file)['results'];assert len(tests)==count and all(t['status']=='PASS' for t in tests)
final_ui=load('final-ui-checks.json')['tests'];assert len(final_ui)==5 and all(t['status']=='PASS' for t in final_ui)
assert load('legacy-layout-assertions.json')['passed'] and load('restart-browser.json')['passed']
assert 'tests 17' in (out/'unit-tests.log').read_text() and 'fail 0' in (out/'unit-tests.log').read_text()
trials=load('performance/summary.json');assert len(trials)==10
initial=load('performance/initial-attempts-summary.json');assert len(initial)==9 and trials[:9]==initial
valid_trials=[t for t in trials if t['valid']];assert len(valid_trials)==9
assert len([t for t in trials if not t['valid']])==1
conditions=[]
for trial in trials:
 r=load('performance/'+trial['file'])
 if not trial['valid']:
  assert trial['round']==3 and trial['mode']=='CAMERA_DATA_CHARTS' and not r['result']['done'] and r['result']['result'] is None
  continue
 assert r['valid'] and r['dataClockCorrect'] and r['actionReceiptsCorrect']
 m=r['result']['result']['measurement'];frames=m['frame_times_ms'];assert len(frames)==m['sample_count'] and sum(frames)>=60000
 assert math.isclose(sum(frames),m['sampled_duration_ms'],abs_tol=.0001)
 assert math.isclose(1000*len(frames)/sum(frames),m['average_fps'],abs_tol=.000001)
 assert sorted(frames)[math.floor(len(frames)*.95)]==m['p95_frame_ms']
 assert sum(x>50 for x in frames)==m['frames_over_50_ms']
 assert m['rendererDpr']==1 and m['loadedModelSha256']==identity['glb_sha256'] and m['page_visible_throughout']
 c=r['conditions'];conditions.append((c['viewport']['width'],c['viewport']['height'],c['nativeDpr'],c['rendererDpr'],c['cssCanvas']['width'],c['cssCanvas']['height'],c['drawingBuffer']['width'],c['drawingBuffer']['height']))
 assert r['target']['passed']==(m['average_fps']>=45 and m['p95_frame_ms']<=40)
assert len(set(conditions))==1,'Performance conditions differ between rounds'
assert all(sum(t['round']==n for t in valid_trials)==3 for n in [1,2,3])
assert len({(t['round'],t['mode']) for t in valid_trials})==9
checks={'protected_files_unchanged':len(baseline['protected']),'frozen_dist_files_unchanged':len(identity['files']),'frozen_source_files_unchanged':len(identity['source_files']),'original_unit_and_browser_assertions_retained':True,'same_conditions_performance_trials':9,'performance_target_met_trials':sum(t['passed'] for t in trials),'performance_incomplete_attempts_preserved':1,'overall_performance_target_passed':all(t['passed'] for t in valid_trials),'actual_screenshot_resource_associations':len(shots),'source_model_materials_and_reference_unchanged':True,'unit':17,'legacy_browser':15,'legacy_layout_assertions':3,'feature_browser':10,'final_ui':5,'restart':True,'real_hidden_tab_transition':'UNVERIFIED: the browser automation kept document.visibilityState visible; deterministic clock policy is unit tested.'}
(out/'final-integrity.json').write_text(json.dumps({'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'build_id':identity['build_id'],'all_integrity_assertions_passed':True,'checks':checks},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(checks,ensure_ascii=False))
