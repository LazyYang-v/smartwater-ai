"""M2.2 equipment, independent background only. Existing packed PBRs are read-only."""
import bpy,bmesh,ast,math,json,sys,hashlib,struct,datetime,os,shutil
from pathlib import Path
from mathutils import Vector
assert bpy.app.background,'Never execute in the user interactive Blender scene'
ROOT=Path(__file__).resolve().parents[2]
kind=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'blower'
assert kind in ['blower','pump']
C=json.loads((ROOT/'config/equipment-units.json').read_text());U=C[kind];R=U['room'];M=U['machine']
scene=bpy.data.scenes.new('SmartWater_M22_'+kind);bpy.context.window.scene=scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
collection=bpy.data.collections.new('SW_M22_'+kind.upper());scene.collection.children.link(collection)
def empty(name,parent=None):
 o=bpy.data.objects.new(name,None);collection.objects.link(o);o.parent=parent;return o
unit=empty(U['root']);unit['unit_id']=U['unit_id'];unit['engineering_validated']=False;unit['asset_stage']='m2-equipment-r1'
device=empty(U['device_id'],unit)
for k,v in {'device_id':U['device_id'],'unit_id':U['unit_id'],'display_name':U['name'],'asset_root_node':U['root'],'mechanical_node':U['device_id'],'available_metrics':U['metrics'],'engineering_validated':False}.items():device[k]=v
building=empty('BUILDING_Shell',unit);roof=empty('BUILDING_Roof',unit);roof['part_id']='ROOF';roof['toggleable']=True
piping=empty('PIPING_Local',unit);site=empty('SW_SITE_CONTEXT')
parents={'device':device,'building':building,'roof':roof,'piping':piping,'site':site};materials={};buckets={}
names=['Concrete / board formed · 4m','Concrete / floor','Concrete / walkway','Precast / coping','Concrete / paving','Galvanised steel','Steel / dark','Air main / blue enamel','Safety / ochre','Expansion joint','Road marking','Grass','Diffuser / EPDM membrane']
source=ROOT/C['material_source'];source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
with bpy.data.libraries.load(str(source),link=False) as (data,dest):
 assert all(n in data.materials for n in names)
 dest.materials=names.copy()
for name,mat in zip(names,dest.materials):materials[name]=mat
images={node.image for mat in materials.values() for node in mat.node_tree.nodes if node.type=='TEX_IMAGE' and node.image}
image_records=[]
for image in images:
 assert image.size[0]>0 and len(image.pixels)>0
 image.pack();image_records.append({'name':image.name,'size':list(image.size),'colorspace':image.colorspace_settings.name,'packed':bool(image.packed_file)})
helpers=ROOT/'scripts/blender/build_aeration.py';text=helpers.read_text()
for n in ast.parse(text).body:
 if isinstance(n,ast.FunctionDef) and n.name in {'box','pipe','rounded','flange'}:exec(compile(ast.get_source_segment(text,n),str(helpers),'exec'),globals())
def add(key,mat,verts,faces,smooth=False,parent='device',tile=None):
 b=buckets.setdefault((key,mat,parent),{'v':[],'f':[],'s':[],'uv':[]});offset=len(b['v']);vs=[Vector(v) for v in verts];b['v'].extend(tuple(v) for v in vs)
 for f in faces:
  b['f'].append(tuple(offset+i for i in f));b['s'].append(smooth and len(f)==4)
  ps=[vs[i] for i in f];normal=(ps[1]-ps[0]).cross(ps[2]-ps[0]);axis=max(range(3),key=lambda j:abs(normal[j]));axes=[j for j in range(3) if j!=axis];b['uv'].append([(p[axes[0]]/(tile or 4),p[axes[1]]/(tile or 4)) for p in ps])
def ring(key,center,axis,radius,tube=.035,mat='Galvanised steel',parent='device'):
 p=Vector(center);axis=Vector(axis).normalized();u=axis.cross(Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0))).normalized();v=axis.cross(u)
 pipe(key,[p+radius*(u*math.cos(i*math.tau/48)+v*math.sin(i*math.tau/48)) for i in range(49)],tube,mat,8,parent)
def boltgrid(center,spanx,spany,parent='device'):
 for sx in [-1,1]:
  for sy in [-1,1]:
   x,y,z=center;x+=sx*spanx/2;y+=sy*spany/2;pipe('MECH_AnchorBolts',[(x,y,z),(x,y,z+.09)],.035,'Steel / dark',6,parent)
def valve(x,y,z,radius,axis=(0,1,0),parent='piping'):
 p=Vector((x,y,z));a=Vector(axis)
 pipe('PIPE_ValveBody',[p-a*.22,p+a*.22],radius*1.32,'Air main / blue enamel',20,parent)
 pipe('PIPE_ValveStem',[(x,y,z),(x,y,z+.5)],.045,'Galvanised steel',12,parent)
 ring('PIPE_ValveHandwheel',(x,y,z+.5),(0,0,1),.23,.025,'Safety / ochre',parent)
 for direction in [(1,0),(0,1)]:pipe('PIPE_ValveSpokes',[(x-direction[0]*.23,y-direction[1]*.23,z+.5),(x+direction[0]*.23,y+direction[1]*.23,z+.5)],.016,'Safety / ochre',8,parent)
 for sign in [-1,1]:
  q=p+a*sign*.28;pipe('PIPE_ValveFlanges',[q-a*.045,q+a*.045],radius*1.65,'Galvanised steel',24,parent)
# Slab, walls with actual entrance / louver openings, steel portal frames.
l,w,h,t=R['length'],R['width'],R['height'],R['wall']
box('BUILDING_BaseSlab',(0,0,R['slab']/2),(l+.6,w+.6,R['slab']),'Concrete / floor',.025,'building')
# Front open inspection bay; rear wall has raised louver windows rather than opaque decoration.
for x in [-l/2+.75,l/2-.75]:box('BUILDING_FrontPiers',(x,-w/2,h/2),(1.5,t,h),'Precast / coping',.02,'building')
box('BUILDING_EntranceLintel',(0,-w/2,h-.45),(l-3,t,.9),'Precast / coping',.02,'building')
box('BUILDING_RearSill',(0,w/2,.75),(l,t,1.5),'Concrete / board formed · 4m',.02,'building')
box('BUILDING_RearHeader',(0,w/2,h-.45),(l,t,.9),'Precast / coping',.02,'building')
for x in [-l/2,0,l/2]:box('BUILDING_RearColumns',(x,w/2,h/2),(.3,t,h),'Precast / coping',.015,'building')
for x in [-l/2,l/2]:
 box('BUILDING_SideSill',(x,0,.7),(t,w,1.4),'Concrete / board formed · 4m',.02,'building')
 box('BUILDING_SideHeader',(x,0,h-.5),(t,w,1),'Precast / coping',.02,'building')
 for y in [-w/2,0,w/2]:box('BUILDING_SidePiers',(x,y,h/2),(t,.28,h),'Precast / coping',.02,'building')
 for y in [-w/4,w/4]:
  # Side ventilation banks: independently readable frames and horizontal slats.
  box('BUILDING_LouverFrame',(x,y,2.5),(.27,w/2-.4,2),'Steel / dark',.01,'building')
  for j in range(11):box('BUILDING_LouverSlats',(x-.15 if x<0 else x+.15,y,1.62+j*.16),(.12,w/2-.55,.045),'Galvanised steel',.005,'building')
for x in [-l*.36,l*.36]:
 box('BUILDING_PortalPosts',(x,0,h/2),(.18,.18,h),'Steel / dark',.015,'building')
 box('BUILDING_PortalBeam',(x,0,h+.02),(.16,w+.15,.24),'Steel / dark',.015,'building')
for y in [-w/2,w/2]:box('BUILDING_RoofTrussChord',(0,y,h+.12),(l+.6,.12,.18),'Steel / dark',.01,'roof')
box('BUILDING_RoofSkin',(0,0,h+.28),(l+.7,w+.7,.12),'Galvanised steel',.02,'roof')
for j in range(round(l/.35)+1):box('BUILDING_RoofRibs',(-l/2+j*.35,0,h+.36),(.045,w+.7,.04),'Galvanised steel',.005,'roof')
for x in [-l/2-.16,l/2+.16]:pipe('BUILDING_Downspouts',[(x,w/2+.2,h),(x,w/2+.2,.2)],.06,'Steel / dark',12,'building')
for y in [-w/2-.32]:
 box('ACCESS_EntranceApron',(0,y,.08),(l-2,1,.16),'Concrete / walkway',.02,'building')
 for x in [-l/2+1,l/2-1]:pipe('ACCESS_Bollards',[(x,y,.08),(x,y,.95)],.065,'Safety / ochre',12,'building')
# Machine foundation, grouted skid, anchors, anti-vibration mounts and shaft coupling.
z=M['shaft_height'];r=M['motor_radius'];base=M['foundation_height'];motor_end=.45+M['motor_length']
box('MECH_ConcreteFoundation',(0,0,(base+R['slab'])/2),(M['base_length'],M['base_width'],base-R['slab']),'Concrete / floor',.035)
for y in [-.8,.8]:box('MECH_SkidRails',(0,y,base+.1),(M['base_length']-.25,.18,.2),'Steel / dark',.015)
for x in [-1.8,0,1.8]:
 for y in [-.8,.8]:box('MECH_ElastomerMounts',(x,y,base+.23),(.28,.28,.12),'Diffuser / EPDM membrane',.015)
for xx in [-1.2,.7,1.8]:box('MECH_CrossBearers',(xx,0,base+.355),(.35,2.0,.13),'Steel / dark',.012)
boltgrid((0,0,base+.2),M['base_length']-.3,1.6)
# Motor is along X, with end bell, fan grille, feet, terminal box and cooling fins.
pipe('MOTOR_Housing',[(.45,0,z),(motor_end,0,z)],r,'Air main / blue enamel',40)
for x in [.45,motor_end]:pipe('MOTOR_EndBell',[(x-.08,0,z),(x+.08,0,z)],r*1.08,'Air main / blue enamel',40)
for i in range(24):
 a=i*math.tau/24
 pipe('MOTOR_CoolingFins',[(.58,math.cos(a)*(r+.025),z+math.sin(a)*(r+.025)),(motor_end-.15,math.cos(a)*(r+.025),z+math.sin(a)*(r+.025))],.026,'Air main / blue enamel',6)
for x in [.7,1.8]:
 for y in [-.45,.45]:box('MOTOR_Feet',(x,y,(z-r+base+.42)/2),(.35,.25,z-r-base-.42),'Air main / blue enamel',.02)
box('MOTOR_TerminalBox',(1.1,0,z+r+.14),(.52,.48,.28),'Steel / dark',.025)
for j in range(-4,5):pipe('MOTOR_FanGuard',[(motor_end+.11,-.38,z+j*.08),(motor_end+.11,.38,z+j*.08)],.018,'Galvanised steel',8)
ring('MOTOR_FanRim',(motor_end+.11,0,z),(1,0,0),.47,.03)
pipe('MECH_CouplingShaft',[(-.8,0,z),(.5,0,z)],.09,'Galvanised steel',20)
box('MECH_CouplingGuard',(-.03,0,z),(.65,.5,.55),'Safety / ochre',.07)
# Cable runs continuously from terminal box down to the wall-side junction pedestal.
pipe('ELECTRICAL_Cable',rounded([(1.1,.25,z+.6),(1.1,.6,z+.6),(1.1,.6,.65),(2.5,.6,.65)],.12),.035,'Steel / dark',10)
box('ELECTRICAL_JunctionBox',(2.5,.6,.8),(.3,.24,.4),'Steel / dark',.02)
if kind=='blower':
 # Lobed pressure casing, reinforced ribs, suction filter and discharge silencer.
 rb=M['blower_radius']
 for yy in [-.35,.35]:pipe('BLOWER_LobedCasing',[(-1.75,yy,z),(-.65,yy,z)],rb*.72,'Air main / blue enamel',40)
 for xx in [-1.72,-.7]:
  for yy in [-.35,.35]:pipe('BLOWER_EndPlates',[(xx-.05,yy,z),(xx+.05,yy,z)],rb*.79,'Galvanised steel',40)
 for xx in [-1.5,-1.2,-.9]:box('BLOWER_CasingRibs',(xx,0,z),( .055,1.7,.9),'Air main / blue enamel',.02)
 for yy in [-.55,.55]:box('BLOWER_Feet',(-1.2,yy,(base+.42+z-.5)/2),(.85,.25,z-.5-base-.42),'Air main / blue enamel',.015)
 pipe('BLOWER_InletNeck',[(-1.2,0,z+.55),(-1.2,0,z+1.05)],.2,'Air main / blue enamel',24)
 pipe('BLOWER_SuctionFilter',[(-1.2,0,z+1),(-1.2,0,z+1.65)],.42,'Galvanised steel',32)
 for zz in [z+1.04,z+1.6]:ring('BLOWER_FilterBands',(-1.2,0,zz),(0,0,1),.43,.025)
 for i in range(16):
  a=i*math.tau/16;pipe('BLOWER_FilterRibs',[(-1.2+math.cos(a)*.425,math.sin(a)*.425,z+1.08),(-1.2+math.cos(a)*.425,math.sin(a)*.425,z+1.56)],.012,'Steel / dark',6)
 pipe('BLOWER_DischargeNeck',[(-1.2,-.65,z),(-1.2,-1.5,z)],.19,'Air main / blue enamel',24)
 route=rounded([(-1.2,-1.5,z),(-1.2,-2.25,z),(2.9,-2.25,z),(2.9,-3.7,z)],.35)
 pipe('PIPE_Discharge',route,.19,'Air main / blue enamel',24,'piping');valve(1,-2.25,z,.19,(1,0,0))
 pipe('PIPE_DischargeSilencer',[(2.9,-2.8,z),(2.9,-3.65,z)],.34,'Air main / blue enamel',32,'piping')
 port=empty('PORT_AIR_DEMO_OUT',unit);port.location=(2.9,-3.7,z);port['port_status']='LOCAL_DEMO_ONLY_NOT_VERIFIED_TO_AERATION_HEADER'
else:
 # Radially varying volute, backplate, bolted split joint and horizontal suction.
 center=Vector((-1.2,0,z));verts=[];faces=[];n=96
 for xx in [-1.65,-.75]:
  for j in range(n):
   a=j*math.tau/n;radius=M['pump_radius']*(.86+.18*j/n);verts.append((xx,math.cos(a)*radius,z+math.sin(a)*radius))
 for j in range(n):faces.append((j,(j+1)%n,n+(j+1)%n,n+j))
 faces.extend([tuple(reversed(range(n))),tuple(range(n,2*n))]);add('PUMP_Volute','Air main / blue enamel',verts,faces,True)
 for xx in [-1.68,-.72]:ring('PUMP_SplitFlange',(xx,0,z),(1,0,0),M['pump_radius']*1.06,.07)
 for j in range(12):
  a=j*math.tau/12;yy=math.cos(a)*.8;zz=z+math.sin(a)*.8;pipe('PUMP_CasingBolts',[(-1.76,yy,zz),(-1.64,yy,zz)],.032,'Galvanised steel',6)
 box('PUMP_Pedestal',(-1.2,0,(base+.42+z-.65)/2),(1.2,1.1,z-.65-base-.42),'Air main / blue enamel',.03)
 pipe('PUMP_SuctionNeck',[(-2.4,0,z),(-1.65,0,z)],.25,'Air main / blue enamel',24)
 pipe('PUMP_DischargeRiser',[(-1.2,0,z+.55),(-1.2,0,z+.85)],.24,'Air main / blue enamel',24)
 pipe('PIPE_Suction',rounded([(-2.4,0,z),(-3.6,0,z),(-3.6,-3.3,z)],.4),.25,'Air main / blue enamel',24,'piping');valve(-3.6,-2.1,z,.25)
 pipe('PIPE_Discharge',rounded([(-1.2,0,z+.85),(-1.2,0,z+1.35),(-1.2,2.6,z+1.35),(3.4,2.6,z+1.35),(3.4,-3.3,z+1.35)],.4),.24,'Air main / blue enamel',24,'piping');valve(3.4,0,z+1.35,.24)
 # Front service end flanges explicitly terminate this demonstration asset; no pretend downstream process.
supports=[(0,-2.25,z,.19),(2.9,-3.2,z,.34),(-1.2,-1.9,z,.19)] if kind=='blower' else [(-3.6,-2,z,.25),(1,2.6,z+1.35,.24),(3.4,0,z+1.35,.24)]
for xx,yy,zz,rr in supports:
 box('PIPE_SupportBase',(xx,yy,.25),(.4,.45,.14),'Galvanised steel',.01,'piping')
 pipe('PIPE_Supports',[(xx,yy,.32),(xx,yy,zz-rr-.1)],.06,'Galvanised steel',12,'piping')
 box('PIPE_Saddles',(xx,yy,zz-rr-.05),(.35,.38,.1),'Galvanised steel',.01,'piping')
# Junction flanges on the actual continuous runs, not scattered decoration.
if kind=='blower':
 for x,y,axis in [(-1.2,-1.58,(0,1,0)),(0,-2.25,(1,0,0)),(2.9,-3.7,(0,1,0))]:
  pipe('PIPE_JointFlange',[(x-axis[0]*.04,y-axis[1]*.04,z),(x+axis[0]*.04,y+axis[1]*.04,z)],.29,'Galvanised steel',24,'piping')
else:
 for x,y,zz,axis in [(-2.42,0,z,(1,0,0)),(-3.6,-3.3,z,(0,1,0)),(-1.2,0,z+1,(0,0,1)),(3.4,-3.3,z+1.35,(0,1,0))]:
  p=Vector((x,y,zz));a=Vector(axis);pipe('PIPE_JointFlange',[p-a*.045,p+a*.045],.36,'Galvanised steel',24,'piping')
# Asset-local preview apron, excluded from plant assembly.
box('SITE_Hardscape',(0,0,-.1),(l+3,w+3,.2),'Concrete / paving',.02,'site')
for x in [-l/2-1,l/2+1]:box('SITE_GreenStrip',(x,0,.04),(1,6,.08),'Grass',.02,'site')
for (name,mat,parent),b in buckets.items():
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(b['v'],[],b['f']);mesh.materials.append(materials[mat]);mesh.update();uv=mesh.uv_layers.new(name='UVMap')
 for poly,coords,smooth in zip(mesh.polygons,b['uv'],b['s']):
  poly.use_smooth=smooth
  for li,coord in zip(poly.loop_indices,coords):uv.data[li].uv=coord
 obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.parent=parents[parent];obj['part_id']=name
for o in bpy.context.view_layer.objects:o.select_set(False)
for o in collection.all_objects:o.select_set(True)
bpy.context.view_layer.objects.active=device
staging=ROOT/'assets/staging/m22';staging.mkdir(parents=True,exist_ok=True);blend=staging/(U['file']+'.blend');glb=staging/(U['file']+'.glb')
bpy.ops.wm.save_as_mainfile(filepath=str(blend),check_existing=False)
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False)
raw=glb.read_bytes();doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,8)[0]==len(raw)
assert sum(n.get('extras',{}).get('device_id')==U['device_id'] for n in doc['nodes'])==1
assert all(n.get('name') not in ['Cube','Camera','Light'] for n in doc['nodes'])
assert any(n.get('name')=='BUILDING_Roof' for n in doc['nodes'])
assert all('bufferView' in image for image in doc.get('images',[]))
triangles=sum(len(p.vertices)-2 for o in collection.objects if o.type=='MESH' for p in o.data.polygons)
bpy.ops.wm.open_mainfile(filepath=str(blend),load_ui=False);assert bpy.data.objects.get(U['root']) and bpy.data.objects.get('BUILDING_Roof')
validation=bpy.data.scenes.new('M22_ImportValidation');bpy.context.window.scene=validation;bpy.ops.import_scene.gltf(filepath=str(glb));assert sum(o.get('device_id')==U['device_id'] for o in validation.objects)==1
for src,dst in [(blend,ROOT/'assets/source'/(U['file']+'.blend')),(glb,ROOT/'public/models'/(U['file']+'.glb'))]:
 if dst.exists():
  previous=ROOT/'assets/previous/m22';previous.mkdir(parents=True,exist_ok=True);shutil.copy2(dst,previous/(hashlib.sha256(dst.read_bytes()).hexdigest()[:12]+'-'+dst.name))
 os.replace(src,dst)
report={'device_id':U['device_id'],'unit_id':U['unit_id'],'asset_root_node':U['root'],'mechanical_node':U['device_id'],'metrics':U['metrics'],'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_reopened':True,'independent_glb_import':True,'triangles':triangles,'mesh_nodes':len(doc.get('meshes',[])),'glb_bytes':len(raw),'glb_sha256':hashlib.sha256(raw).hexdigest(),'blend_sha256':hashlib.sha256((ROOT/'assets/source'/(U['file']+'.blend')).read_bytes()).hexdigest(),'material_source_sha256':source_sha,'packed_images':image_records,'dimensions':U}
(ROOT/'docs/acceptance/m2-equipment'/(kind+'-asset.json')).write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n');assert hashlib.sha256(source.read_bytes()).hexdigest()==source_sha
print('M22_ASSET_SUCCESS='+json.dumps(report,ensure_ascii=False),flush=True)
