from pathlib import Path
import hashlib,json,datetime
root=Path(__file__).resolve().parents[1];out=root/'docs/acceptance/m1-stability-r1'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((out/'baseline.json').read_text());fixed=json.loads((out/'build-identity.json').read_text())
protected=[p for p,v in baseline['protected'].items() if not (root/p).is_file() or h(root/p)!=v]
source=[p for p,v in fixed['source_files'].items() if not(root/p).is_file() or h(root/p)!=v]
artifacts=[p for p,v in fixed['files'].items() if not(root/'dist'/p).is_file() or h(root/'dist'/p)!=v['sha256']]
extra=set(str(p.relative_to(root)) for p in (root/'src').rglob('*') if p.is_file())-set(fixed['source_files'])
unchanged={p:h(root/p)==baseline['files'][p]['sha256'] for p in ['package.json','pnpm-lock.yaml']}
result={'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'build_id':fixed['build_id'],'protected_checked':len(baseline['protected']),'protected_mismatches':protected,'source_mismatches':source,'unexpected_source_files':sorted(extra),'dist_mismatches':artifacts,'metadata_matches':h(root/'dist/build-id.json')==h(out/'build-identity.json'),'dependency_files_unchanged':unchanged,'glb_sha256':h(root/'public/models/aeration-tank.glb'),'blend_sha256':h(root/'assets/source/aeration-tank.blend'),'harnesses':{str(p.relative_to(root)):h(p) for p in sorted((root/'scripts').glob('m11-*'))}}
result['passed']=not(protected or source or artifacts or extra) and all(unchanged.values()) and result['metadata_matches']
(out/'final-integrity.json').write_text(json.dumps(result,indent=2)+'\n');assert result['passed'],result
windows=[json.loads(p.read_text()) for p in sorted((out/'endurance').glob('window-*.json'))]
rows=[]
for w in windows:
 a=w['after'];m=w['measurement'];rows.append({'window':w['index'],'at':a['wallTime'],'scenario':a['scenario'],'snapshotId':a['snapshotId'],'pageAgeMs':a['pageAgeMs'],'submittedFrame':a['frame'],'loop':a['loop'],'ownership':a['ownership'],'geometryCount':a['geometryCount'],'textureCount':a['textureCount'],'programCount':a['programCount'],'calls':a['calls'],'triangles':a['triangles'],'charts':a['charts'],'history':a['history'],'DOM':a['domNodes'],'toolRecords':a['toolRecords'],'loadGeneration':a['loadGeneration'],'visible':a['visible'],'workload_error':m.get('workload_error'),'average_fps':m['average_fps'],'p95_frame_ms':m['p95_frame_ms']})
(out/'resource-trends.json').write_text(json.dumps({'scope':'Application explicit ownership only; internal library registrations and GPU bytes unavailable. Frame/pass counts are separate.','windows':rows},indent=2)+'\n')
print(json.dumps({'integrity':result['passed'],'protected':len(baseline['protected']),'source_files':len(fixed['source_files']),'windows':len(windows)}))
