"""Independent-background M2 authoring; reuses read-only M0.1 packed PBRs."""
import bpy,bmesh,ast,math,json,sys,struct,hashlib,datetime,os,shutil
from pathlib import Path
from mathutils import Vector
assert bpy.app.background,'Never run in the user interactive scene'
ROOT=Path(__file__).resolve().parents[2]
C=json.loads((ROOT/'config/clarifier.json').read_text());B=C['basin'];A=C['access'];M=C['mechanism'];S=C['site']
scene=bpy.data.scenes.new(C['scene_name']);bpy.context.window.scene=scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
collection=bpy.data.collections.new(C['collection']);scene.collection.children.link(collection)
def empty(name,parent=None,location=(0,0,0)):
 obj=bpy.data.objects.new(name,None);collection.objects.link(obj);obj.parent=parent;obj.location=location;return obj
device=empty(C['device_id']);device['device_id']=C['device_id'];device['display_name']='一号二沉池';device['asset_stage']=C['revision'];device['geometry_form']='circular';device['engineering_validated']=False;device['units']='metres'
site=empty('SW_SITE_CONTEXT')
pivot=empty('MECH_ScraperBridgePivot',device,(0,0,M['pivot_z']));pivot['part_id']='SCRAPER_BRIDGE';pivot['rotation_axis_source']='Z';pivot['rotation_axis_gltf']='Y';pivot['rotation_center_local']=[0,0,0];pivot['animation_note']='Pose-ready mechanism; no automatic device actuation'
parents={'device':device,'site':site,'bridge':pivot};buckets={};materials={}
names=['Concrete / board formed · 4m','Concrete / floor','Concrete / walkway','Precast / coping','Concrete / paving','Asphalt / 2m','Galvanised steel','Steel / dark','Air main / blue enamel','Safety / ochre','Expansion joint','Road marking','Grass','Water / opaque process water','Diffuser / EPDM membrane']
source=ROOT/C['material_source'];source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
with bpy.data.libraries.load(str(source),link=False) as (data,dest):
 assert all(n in data.materials for n in names),'Missing validated PBRs; do not substitute silently'
 dest.materials=names.copy()
for name,mat in zip(names,dest.materials):
 assert isinstance(name,str) and mat is not None
 materials[name]=mat
used_images={node.image for mat in materials.values() for node in mat.node_tree.nodes if node.type=='TEX_IMAGE' and node.image}
decoded_images=[]
for image in used_images:
 assert image.size[0]>0 and len(image.pixels)>0,'Cannot decode '+image.name
 image.pack();decoded_images.append({'name':image.name,'size':list(image.size),'colorspace':image.colorspace_settings.name,'packed':bool(image.packed_file)})

# Import pure geometry helper definitions only; never execute aeration authoring or regeneration.
helper_source=ROOT/'scripts/blender/build_aeration.py';tree=ast.parse(helper_source.read_text());wanted={'box','pipe','rounded','flange'}
for node in tree.body:
 if isinstance(node,ast.FunctionDef) and node.name in wanted:
  text=ast.get_source_segment(helper_source.read_text(),node).replace('AIR_FlangeBolts','HYDRO_FlangeBolts')
  exec(compile(text,str(helper_source),'exec'),globals())

def add(key,mat,verts,faces,smooth=False,parent='device',tile=None,cylindrical=False):
 bucket=buckets.setdefault((key,mat,parent),{'verts':[],'faces':[],'smooth':[],'uv':[]});offset=len(bucket['verts']);verts=[Vector(v) for v in verts];bucket['verts'].extend(tuple(v) for v in verts)
 for face in faces:
  bucket['faces'].append(tuple(offset+i for i in face));bucket['smooth'].append(smooth and len(face)==4)
  points=[verts[i] for i in face];scale=tile or 4
  if cylindrical:
   angles=[math.atan2(p.y,p.x) for p in points]
   if max(angles)-min(angles)>math.pi:angles=[a+math.tau if a<0 else a for a in angles]
   radius=sum(math.hypot(p.x,p.y) for p in points)/len(points)
   uv=[(a*radius/scale,p.z/scale) for a,p in zip(angles,points)]
  else:
   normal=(points[1]-points[0]).cross(points[2]-points[0]);axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis];uv=[(p[axes[0]]/scale,p[axes[1]]/scale) for p in points]
  bucket['uv'].append(uv)

def annulus(key,ri,ro,z,mat,parent='device',n=None):
 n=n or B['segments'];verts=[]
 for radius in [ri,ro]:
  verts.extend((radius*math.cos(i*math.tau/n),radius*math.sin(i*math.tau/n),z) for i in range(n))
 faces=[(i,n+i,n+(i+1)%n,(i+1)%n) for i in range(n)]
 add(key,mat,verts,faces,parent=parent,tile=6 if mat.startswith('Water') else C['materials']['floor_tile_m'])
def ring(key,ri,ro,bottom,top,mat,parent='device',n=None):
 n=n or B['segments']
 for radius,inward in [(ro,False),(ri,True)]:
  verts=[(radius*math.cos(i*math.tau/n),radius*math.sin(i*math.tau/n),z) for z in [bottom,top] for i in range(n)]
  faces=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
  if inward:faces=[tuple(reversed(f)) for f in faces]
  add(key,mat,verts,faces,True,parent,cylindrical=True)
 annulus(key,ri,ro,top,mat,parent,n);# separate top vertices keep concrete edge normals crisp
 verts=[]
 for radius in [ri,ro]:verts.extend((radius*math.cos(i*math.tau/n),radius*math.sin(i*math.tau/n),bottom) for i in range(n))
 add(key,mat,verts,[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)],parent=parent)

def floor_z(r):
 if r<=.8:return B['sump_z']
 if r<1.5:return B['sump_z']+(r-.8)/.7*.35
 return -4.55+min(1,(r-1.5)/9.6)*.25
# Thick sloped floor, closed at rim; central hopper and slab remain inspectable with water off.
radial=[0,.8,1.5,11.1,12.7];n=B['segments']
for r0,r1 in zip(radial,radial[1:]):
 for is_bottom in [False,True]:
  verts=[(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n),floor_z(r)-(B['base_thickness'] if is_bottom else 0)) for r in [r0,r1] for i in range(n)]
  if r0==0:
   verts=[verts[0]]+verts[n:];faces=[(0,1+i,1+(i+1)%n) for i in range(n)]
  else:faces=[(i,n+i,n+(i+1)%n,(i+1)%n) for i in range(n)]
  if is_bottom:faces=[tuple(reversed(f)) for f in faces]
  add('STRUCT_SlopedFloor','Concrete / floor',verts,faces)
ring('STRUCT_BaseEdge',12.65,12.7,-4.8,-4.3,'Concrete / floor')
ring('STRUCT_CircularWall',12,12.4,B['floor_z'],B['top_z'],'Concrete / board formed · 4m')
ring('STRUCT_Coping',11.98,12.48,1.08,1.2,'Precast / coping')
ring('ACCESS_PerimeterDeck',12.4,13.9,1.02,1.2,'Concrete / walkway')
for j in range(24):
 a=j*math.tau/24;u=Vector((math.cos(a),math.sin(a),0));v=Vector((-math.sin(a),math.cos(a),0))
 # radial support frames bear on ground, not on a full ground plane through the basin.
 p=u*13.05;box('ACCESS_DeckPiers',(p.x,p.y,.51),(.32,.32,1.02),'Concrete / board formed · 4m',.015)
 box('ACCESS_PierFootings',(p.x,p.y,-.12),(.68,.68,.24),'Precast / coping',.02)
 for lo,hi in [(12.0,12.45),(12.65,13.88)]:
  p0=u*lo;p1=u*hi
  pipe('STRUCT_RadialJoints',[(p0.x,p0.y,1.202),(p1.x,p1.y,1.202)],.005,'Expansion joint',6)
# Peripheral drive track and access rail. Inner rotating clearance remains unobstructed.
track=[(M['wheel_track_radius']*math.cos(i*math.tau/256),M['wheel_track_radius']*math.sin(i*math.tau/256),1.225) for i in range(257)]
pipe('MECH_PeripheralTrack',track,.022,'Steel / dark',12)
for h in [A['rail_mid_height'],A['rail_height']]:
 arc=[(13.85*math.cos(a),13.85*math.sin(a),1.2+h) for a in [math.pi+.065+i*(math.tau-.13)/256 for i in range(257)]]
 pipe('SAFETY_PerimeterRails',arc,A['rail_radius'],'Galvanised steel',12)
for j in range(44):
 a=j*math.tau/44
 if abs(a-math.pi)<.075:continue
 p=Vector((13.85*math.cos(a),13.85*math.sin(a),1.2))
 pipe('SAFETY_PerimeterPosts',[p,p+Vector((0,0,1.1))],.028,'Galvanised steel',12)
 box('SAFETY_PostBases',p+Vector((0,0,.018)),(.16,.16,.036),'Galvanised steel',.008)
 for dx in [-.05,.05]:pipe('SAFETY_Anchors',[p+Vector((dx,.05,.035)),p+Vector((dx,.05,.07))],.011,'Steel / dark',6)
# West stair rises from grade0 to deck1.2; landing, stringers, rail and nosing are connected.
for i in range(8):
 x=-16.3+(i+.5)*.3;z=(i+1)*.15-.06
 box('ACCESS_StairTreads',(x,0,z),(.31,1.5,.12),'Galvanised steel',.008)
 box('ACCESS_StairNosings',(x+.13,0,z+.067),(.035,1.5,.014),'Safety / ochre')
for y in [-.75,.75]:
 pipe('ACCESS_StairStringers',[(-16.3,y,.06),(-13.9,y,1.14)],.075,'Steel / dark')
 for f in [0,.5,1]:pipe('SAFETY_StairPosts',[(-16.3+2.4*f,y,1.2*f),(-16.3+2.4*f,y,1.2*f+1.1)],.028)
 for h in [.56,1.1]:pipe('SAFETY_StairRails',[(-16.3,y,h),(-13.9,y,1.2+h)],.025)
box('ACCESS_GradeLanding',(-16.9,0,.06),(1.2,1.8,.12),'Concrete / paving',.02)
# Central feed well, supporting pier and bearing assembly.
pipe('STRUCT_CenterPier',[(0,0,-4.9),(0,0,1.26)],.65,'Concrete / board formed · 4m',64)
ring('HYDRO_Feedwell',1.65,1.8,-1.2,.88,'Air main / blue enamel',n=128)
ring('MECH_CenterBearing',.66,.91,1.25,1.38,'Steel / dark',n=64)
ring('MECH_BearingCover',.60,.86,1.38,1.46,'Galvanised steel','bridge',64)
for j in range(12):
 a=j*math.tau/12;p=Vector((.78*math.cos(a),.78*math.sin(a),1.47));pipe('MECH_BearingBolts',[p,p+Vector((0,0,.045))],.02,'Steel / dark',6,'bridge')
# Radial I-beam bridge, grating and truss bracing, all parented to one local rotation pivot.
for y in [-.48,.48]:
 box('MECH_BridgeFlanges',(6.65,y,1.38),(13.3,.14,.045),'Steel / dark',parent='bridge')
 box('MECH_BridgeWebs',(6.65,y,1.465),(13.3,.035,.14),'Steel / dark',parent='bridge')
 box('MECH_BridgeFlanges',(6.65,y,1.535),(13.3,.14,.045),'Galvanised steel',parent='bridge')
for i in range(73):box('MECH_DeckGrating',(.22+i*.18,0,1.5575),(.035,1.25,.045),'Galvanised steel',parent='bridge')
for y in [-.61,-.2,.2,.61]:box('MECH_DeckStringers',(6.65,y,1.55),(13.3,.035,.05),'Galvanised steel',parent='bridge')
for y in [-.66,.66]:
 for x in [.2,2.3,4.4,6.5,8.6,10.7,12.8]:
  pipe('SAFETY_BridgePosts',[(x,y,1.58),(x,y,2.68)],.028,parent='bridge');box('SAFETY_BridgeBases',(x,y,1.6),(.14,.14,.04),'Galvanised steel',parent='bridge')
 for h in [2.14,2.68]:pipe('SAFETY_BridgeRails',[(.1,y,h),(13.05,y,h)],.025,parent='bridge')
for x in [2.5,5,7.5,10]:
 for y in [-.45,.45]:
  pipe('MECH_BridgeTruss',[(x-1.1,y,1.38),(x,y,.87),(x+1.1,y,1.38)],.045,'Steel / dark',parent='bridge')
# Two drive wheels sit on the circular track; their axles and guards connect to the bridge frame.
for y in [-.46,.46]:
 p=Vector((13.44,y,1.497));pipe('MECH_DriveTyres',[p-Vector((.07,0,0)),p+Vector((.07,0,0))],.25,'Diffuser / EPDM membrane',40,'bridge')
 pipe('MECH_WheelHubs',[p-Vector((.09,0,0)),p+Vector((.09,0,0))],.12,'Galvanised steel',24,'bridge')
 box('MECH_AxleBrackets',(13.29,y,1.58),(.20,.10,.34),'Steel / dark',.015,'bridge')
 pipe('MECH_WheelAxles',[(13.25,y,1.497),(13.58,y,1.497)],.04,'Galvanised steel',16,'bridge')
 box('MECH_WheelGuards',(13.47,y,1.78),(.32,.56,.06),'Safety / ochre',.01,'bridge')
for y in [-.45,.45]:pipe('ACCESS_BridgeStepStringers',[(13.1,y,1.37),(13.7,y,1.25)],.035,'Steel / dark',12,'bridge')
box('ACCESS_BridgeStep1',(13.57,0,1.33),(.28,1.0,.12),'Galvanised steel',parent='bridge')
box('ACCESS_BridgeStep2',(13.29,0,1.52),(.28,1.0,.12),'Galvanised steel',parent='bridge')
box('MECH_Gearbox',(12.93,.35,1.83),(.4,.36,.50),'Air main / blue enamel',.025,'bridge')
pipe('MECH_Motor',[(12.93,.45,2.03),(12.93,1.0,2.03)],.17,'Air main / blue enamel',32,'bridge')
for j in range(10):pipe('MECH_MotorCoolingFins',[(12.93,.48+j*.045,2.03),(12.93,.495+j*.045,2.03)],.192,'Galvanised steel',32,'bridge')
pipe('MECH_MotorFanCover',[(12.93,.99,2.03),(12.93,1.07,2.03)],.18,'Steel / dark',32,'bridge')
box('MECH_JunctionBox',(.25,.35,1.85),(.28,.25,.42),'Galvanised steel',.02,'bridge')
pipe('MECH_CableConduit',[(.3,.45,1.72),(12.7,.45,1.72),(12.7,.35,1.9)],.018,'Steel / dark',10,'bridge')
# Floor-following scraper hangers and angled blades, no rods floating above the sludge floor.
for x in [2.5,5.3,8.1,10.7]:
 bottom=floor_z(x)+.18
 for y in [-.37,.37]:pipe('MECH_ScraperHangers',[(x,y,1.32),(x,y,bottom)],.034,'Steel / dark',12,'bridge')
 pipe('MECH_ScraperArms',[(max(.9,x-1.0),-.8,floor_z(max(.9,x-1))+.28),(x,.37,bottom)],.045,'Galvanised steel',12,'bridge')
 # Angled steel scraper plate represented by a closed, thickness-bearing prism.
 angle=.42;u=Vector((math.cos(angle),math.sin(angle),0));v=Vector((-math.sin(angle),math.cos(angle),0));center=Vector((x,0,floor_z(x)+.17));verts=[]
 for z in [-.12,.12]:
  for a,b in [(-.9,-.025),(.9,-.025),(.9,.025),(-.9,.025)]:verts.append(center+u*a+v*b+Vector((0,0,z)))
 add('MECH_ScraperBlades','Galvanised steel',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],parent='bridge')
# Annular launder and sawtooth V-notch weir, physically separate from water surfaces.
ring('HYDRO_LaunderFloor',11.16,11.98,-.15,0,'Concrete / floor')
ring('HYDRO_WeirSupport',11.16,11.29,0,.32,'Precast / coping')
for j in range(M['weir_teeth']):
 angles=[(j+k/2)*math.tau/M['weir_teeth'] for k in range(3)];verts=[]
 for r in [11.21,11.23]:
  verts.extend((r*math.cos(a),r*math.sin(a),z) for a,z in zip(angles,[.65,.43,.65]));verts.extend((r*math.cos(a),r*math.sin(a),.27) for a in angles)
 faces=[(0,1,4,3),(1,2,5,4),(6,9,10,7),(7,10,11,8),(0,6,7,1),(1,7,8,2),(3,4,10,9),(4,5,11,10),(0,3,9,6),(2,8,11,5)]
 add('HYDRO_VNotchWeir','Galvanised steel',verts,faces)
for j in range(24):
 a=j*math.tau/24;p=Vector((11.235*math.cos(a),11.235*math.sin(a),.30));pipe('HYDRO_WeirFixings',[p,p+Vector((math.cos(a)*.025,math.sin(a)*.025,0))],.025,'Steel / dark',6)
# Continuous influent riser and outlet assembly. Flanges/sleeves identify wall penetrations.
pipe('HYDRO_Influent',rounded([(-15.8,0,-2.2),(-2.15,0,-2.2),(-1.25,0,-1.4),(-1.25,0,-.4)],.3),.30,'Air main / blue enamel',24)
for x in [-12.5,-14.9]:flange('HYDRO_InfluentFlanges',(x,0,-2.2),(1,0,0),.42)
pipe('HYDRO_SludgeOutlet',[(0,0,-4.85),(0,0,-5.2),(15.6,0,-5.2)],.13,'Steel / dark',16)
a=-math.pi/9;u=Vector((math.cos(a),math.sin(a),0));q=u*15.1
pipe('HYDRO_Effluent',[(11.6*u.x,11.6*u.y,.0),(q.x,q.y,.0),(q.x,q.y,-.8),(17,q.y,-.8)],.25,'Air main / blue enamel',24)
flange('HYDRO_EffluentSleeve',(12.5*u.x,12.5*u.y,0),u,.37)
box('HYDRO_OutletBase',(q.x,q.y,-.46),(1.6,1.5,.18),'Concrete / floor',.02)
for sx in [-1,1]:box('HYDRO_OutletWalls',(q.x+sx*.72,q.y,.07),(.16,1.5,1.04),'Concrete / board formed · 4m',.015)
for sy in [-1,1]:box('HYDRO_OutletWalls',(q.x,q.y+sy*.67,.07),(1.3,.16,1.04),'Concrete / board formed · 4m',.015)
# Independent, opaque water meshes aggregated in one toggleable node; avoid concrete overlap.
for ri,ro,z in [(.68,1.63,.5),(1.82,11.15,.5),(11.31,11.97,.22)]:annulus('WATER_Surface',ri,ro,z,'Water / opaque process water')
add('WATER_Surface','Water / opaque process water',[(q.x-.63,q.y-.58,.18),(q.x+.63,q.y-.58,.18),(q.x+.63,q.y+.58,.18),(q.x-.63,q.y+.58,.18)],[(0,1,2,3)])
# Ground ring reaches a square boundary and leaves a true circular excavation opening.
n=256;verts=[]
for outer in [False,True]:
 for j in range(n):
  a=j*math.tau/n;co,si=math.cos(a),math.sin(a);r=min(20/max(abs(co),1e-9),20/max(abs(si),1e-9)) if outer else 12.45;verts.append((r*co,r*si,0))
add('SITE_Hardscape','Concrete / paving',verts,[(j,n+j,n+(j+1)%n,(j+1)%n) for j in range(n)],parent='site')
box('SITE_Road',(0,-16.4,.02),(40,4.2,.04),'Asphalt / 2m',parent='site')
for x in range(-17,18,6):box('SITE_RoadMarkings',(x,-16.4,.045),(2.7,.10,.01),'Road marking',parent='site')
for y in [-18.62,-14.18]:box('SITE_Curbs',(0,y,.1),(40,.22,.2),'Precast / coping',.025,'site')
for x in [-17.5,17.5]:box('SITE_GreenStrip',(x,9,.045),(1.8,12,.09),'Grass',.02,'site')
for (name,mat,parent_name),bucket in buckets.items():
 parent=parents[parent_name];origin=Vector(parent.location) if parent_name=='bridge' else Vector((0,0,0));mesh=bpy.data.meshes.new(name);mesh.from_pydata([Vector(v)-origin for v in bucket['verts']],[],bucket['faces']);mesh.materials.append(materials[mat]);mesh.update()
 uv=mesh.uv_layers.new(name='UVMap')
 for poly,coords,smooth in zip(mesh.polygons,bucket['uv'],bucket['smooth']):
  poly.use_smooth=smooth
  for li,coord in zip(poly.loop_indices,coords):uv.data[li].uv=coord
 obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.parent=parent;obj['part_id']=name;obj['part_type']=name.split('_')[0]
 if name=='WATER_Surface':obj['toggleable']=True
# Saving keeps factory Scene/Cube/Camera/Light untouched; export selects only generated collection.
for obj in bpy.context.view_layer.objects:obj.select_set(False)
for obj in collection.all_objects:obj.select_set(True)
bpy.context.view_layer.objects.active=device
staging=ROOT/'assets/staging/m2';staging.mkdir(parents=True,exist_ok=True);blend=staging/'clarifier-tank.blend';glb=staging/'clarifier-tank.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend),check_existing=False)
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False)
raw=glb.read_bytes();assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,8)[0]==len(raw);doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
assert sum(n.get('extras',{}).get('device_id')==C['device_id'] for n in doc['nodes'])==1
assert all(n.get('name') not in ['Cube','Camera','Light'] for n in doc['nodes'])
assert any(n.get('name')=='MECH_ScraperBridgePivot' for n in doc['nodes'])
assert all('bufferView' in i for i in doc.get('images',[]))
assert all(math.isfinite(float(v)) for o in collection.objects if o.type=='MESH' for vertex in o.data.vertices for v in vertex.co)
triangles=sum(len(p.vertices)-2 for o in collection.objects if o.type=='MESH' for p in o.data.polygons)
# Reopen editable source and independently reimport GLB in this isolated background process.
bpy.ops.wm.open_mainfile(filepath=str(blend),load_ui=False)
assert bpy.data.scenes.get(C['scene_name']) and bpy.data.objects.get('MECH_ScraperBridgePivot')
check=bpy.data.scenes.new('M2_GLTF_Validation');bpy.context.window.scene=check;bpy.ops.import_scene.gltf(filepath=str(glb))
assert sum(o.get('device_id')==C['device_id'] for o in check.objects)==1
assert any(o.get('part_id')=='WATER_Surface' for o in check.objects)
# Promote validated pair; never touch existing aeration artifacts.
for src,dst in [(blend,ROOT/'assets/source/clarifier-tank.blend'),(glb,ROOT/'public/models/clarifier-tank.glb')]:
 dst.parent.mkdir(parents=True,exist_ok=True)
 if dst.exists():
  previous=ROOT/'assets/previous/m2';previous.mkdir(parents=True,exist_ok=True);shutil.copy2(dst,previous/(hashlib.sha256(dst.read_bytes()).hexdigest()[:12]+'-'+dst.name))
 os.replace(src,dst)
report={'device_id':C['device_id'],'created_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'triangles':triangles,'mesh_nodes':len(doc.get('meshes',[])),'glb_bytes':len(raw),'glb_sha256':hashlib.sha256(raw).hexdigest(),'blend_sha256':hashlib.sha256((ROOT/'assets/source/clarifier-tank.blend').read_bytes()).hexdigest(),'material_source_sha256':source_sha,'reused_images':decoded_images,'source_reopened':True,'independent_glb_import':True,'dimensions':C}
(ROOT/'docs/acceptance/m1-stability-r1/m2-asset.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_sha
print('M2_CLARIFIER_SUCCESS='+json.dumps({k:v for k,v in report.items() if k!='dimensions'}),flush=True)
