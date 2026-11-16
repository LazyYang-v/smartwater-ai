"""Reproducible M0 asset. Run only in a separate background Blender process."""
import argparse
import bmesh
import bpy
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import sys
import zlib
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
C = json.loads((ROOT / 'config/aeration.json').read_text())
B, A, P, S = C['basin'], C['access'], C['air'], C['site']
parser = argparse.ArgumentParser()
parser.add_argument('--stage', choices=['first', 'final'], default='final')
parser.add_argument('--report-dir',default='docs/acceptance/m0-visual-r1')
ARGS = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
REPORT_DIR=ROOT/ARGS.report_dir
REPORT_DIR.mkdir(parents=True,exist_ok=True)
assert bpy.app.background, 'Use an independent background process; never run this in the interactive scene.'
assert abs(B['top_z'] - B['floor_z'] - B['inner_depth']) < 1e-6
assert abs(B['water_z'] - B['floor_z'] - B['water_depth']) < 1e-6

# A new scene leaves the factory Cube, Camera and Light untouched in their scene.
scene = bpy.data.scenes.new(C['scene_name'])
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
collection = bpy.data.collections.new(C['collection'])
scene.collection.children.link(collection)


def empty(name):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    return obj


device = empty(C['device_id'])
device['device_id'] = C['device_id']
device['display_name'] = '一号曝气池'
device['asset_stage'] = ARGS.stage
device['coordinate_system'] = 'local metres; source Z up; GLB Y up'
device['engineering_validated'] = False
site = empty('SW_SITE_CONTEXT')
buckets = {}
materials = {}
decoded = []
sys.path.insert(0,str(Path(__file__).parent))
from visual_materials import prepare
generated_materials=prepare(ROOT,C['materials'])


def linear(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def material(name, color, roughness=0.6, metal=0, texture=None, normal_strength=.30):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = tuple(linear(v) for v in color[:3]) + (1,)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    if texture:
        for channel, suffix, space in [('Base Color', 'diff', 'sRGB'), ('Normal', 'nor_gl', 'Non-Color'), ('Roughness', 'rough', 'Non-Color')]:
            source_texture='concrete_floor_r1' if texture=='concrete_walkway_r1' and channel!='Base Color' else texture
            path = ROOT / (f'assets/source/textures/{source_texture}_{suffix}.png' if source_texture.endswith('_r1') else f'assets/source/textures/{source_texture}_{suffix}_2k.jpg')
            image = bpy.data.images.load(str(path), check_existing=True)
            image.colorspace_settings.name = space
            # Force decoding; HTTP status and metadata are not sufficient.
            expected=1024 if texture.endswith('_r1') and channel!='Base Color' else 2048
            assert image.size[0] == expected and image.size[1] == expected, str(path)
            assert len(image.pixels) > 0 and all(math.isfinite(image.pixels[i]) for i in (0, 1, 2, 3)), str(path)
            decoded.append({'file': str(path.relative_to(ROOT)), 'width': image.size[0], 'height': image.size[1], 'color_space': space, 'channel': channel})
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = image
            if channel == 'Normal':
                normal = mat.node_tree.nodes.new('ShaderNodeNormalMap')
                normal.inputs['Strength'].default_value = normal_strength
                mat.node_tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
                mat.node_tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
            else:
                mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs[channel])
    materials[name] = mat
    return mat


material('Concrete / board formed · 4m', (0.78, 0.78, 0.74), texture='concrete_wall_r1',normal_strength=C['materials']['wall_normal_strength'])
material('Concrete / floor',(.65,.65,.65),texture='concrete_floor_r1',normal_strength=C['materials']['floor_normal_strength'])
material('Concrete / walkway',(.70,.70,.70),texture='concrete_walkway_r1',normal_strength=C['materials']['walkway_normal_strength'])
material('Precast / coping', (0.73, 0.75, 0.72), 0.82)
material('Concrete / paving', (0.60, 0.63, 0.61), 0.87)
material('Asphalt / 2m', (0.32, 0.33, 0.34), texture='worn_asphalt',normal_strength=.45)
material('Galvanised steel', (0.64, 0.70, 0.72), 0.33, 0.82)
material('Steel / dark', (0.24, 0.29, 0.30), 0.47, 0.65)
material('Air main / blue enamel', (0.22, 0.39, 0.48), 0.32, 0.40)
material('Diffuser / EPDM membrane', (0.16, 0.19, 0.18), 0.88)
material('Safety / ochre', (0.81, 0.62, 0.20), 0.48, 0.20)
material('Expansion joint', (0.27, 0.30, 0.29), 0.95)
material('Road marking', (0.83, 0.82, 0.69), 0.85)
material('Planting soil', (0.28, 0.26, 0.19), 1)
material('Grass', (0.31, 0.39, 0.22), 1)
material('Shrub leaves', (0.26, 0.37, 0.19), 0.95)
material('Shrub light', (0.39, 0.46, 0.24), 0.95)


def add(key, mat, verts, faces, smooth=False, parent='device', tile=None):
    bucket = buckets.setdefault((key, mat, parent), {'verts': [], 'faces': [], 'smooth': [], 'uv': []})
    offset = len(bucket['verts'])
    bucket['verts'].extend([tuple(v) for v in verts])
    for face in faces:
        bucket['faces'].append(tuple(i + offset for i in face))
        bucket['smooth'].append(smooth and len(face) == 4)
        points = [Vector(verts[i]) for i in face]
        normal = (points[1] - points[0]).cross(points[2] - points[0])
        axis = max(range(3), key=lambda i: abs(normal[i]))
        axes = [i for i in range(3) if i != axis]
        scale = tile or 4
        bucket['uv'].append([(p[axes[0]] / scale, p[axes[1]] / scale) for p in points])


def box(key, center, size, mat='Precast / coping', bevel=0, parent='device'):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * 0.22), segments=C['quality']['bevel_segments'], affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.verts.ensure_lookup_table(); bm.verts.index_update()
    verts = [v.co + Vector(center) for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    tile=C['materials']['asphalt_tile_m'] if mat.startswith('Asphalt') else C['materials']['floor_tile_m'] if mat=='Concrete / floor' else C['materials']['walkway_tile_m'] if mat=='Concrete / walkway' else C['materials']['concrete_tile_m']
    add(key, mat, verts, faces, parent=parent, tile=tile)
    bm.free()


def pipe(key, points, radius, mat='Galvanised steel', sides=None, parent='device'):
    points = [Vector(p) for p in points]
    sides = sides or C['quality']['pipe_sides']
    verts, faces = [], []
    for i, point in enumerate(points):
        tangent = (points[min(i + 1, len(points)-1)] - points[max(i-1, 0)]).normalized()
        reference = Vector((0,0,1)) if abs(tangent.z) < 0.9 else Vector((1,0,0))
        right = tangent.cross(reference).normalized()
        up = tangent.cross(right).normalized()
        for j in range(sides):
            t = j * math.tau / sides
            verts.append(point + radius * (math.cos(t) * right + math.sin(t) * up))
    for i in range(len(points)-1):
        for j in range(sides):
            faces.append((i*sides+j, i*sides+(j+1)%sides, (i+1)*sides+(j+1)%sides, (i+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))), tuple((len(points)-1)*sides+j for j in range(sides))])
    add(key, mat, verts, faces, smooth=True, parent=parent)


def rounded(points, r):
    ps = [Vector(p) for p in points]
    output = [ps[0]]
    for i in range(1, len(ps)-1):
        u=(ps[i]-ps[i-1]).normalized(); v=(ps[i+1]-ps[i]).normalized()
        rr=min(r, (ps[i]-ps[i-1]).length*0.4, (ps[i+1]-ps[i]).length*0.4)
        center=ps[i]-u*rr+v*rr
        for step in range(7):
            t=step*math.pi/12
            output.append(center+rr*(-v*math.cos(t)+u*math.sin(t)))
    output.append(ps[-1])
    return output


def flange(key, center, axis, radius, bolts=True):
    p=Vector(center); axis=Vector(axis).normalized()
    pipe(key, [p-axis*.045,p+axis*.045], radius, 'Galvanised steel', 24)
    if bolts:
        u=axis.cross(Vector((0,0,1)) if abs(axis.z)<.9 else Vector((1,0,0))).normalized(); v=axis.cross(u)
        for j in range(8):
            t=j*math.tau/8
            q=p+(u*math.cos(t)+v*math.sin(t))*radius*.78
            pipe('AIR_FlangeBolts',[q-axis*.065,q+axis*.065],.022,'Steel / dark',6)


L, W, T, Z = B['inner_length'], B['inner_width'], B['wall_thickness'], B['top_z']
ox, oy = L/2+T, W/2+T
ex, ey = ox+A['width'], oy+A['width']
box('STRUCT_BaseSlab',(0,0,B['floor_z']-B['base_thickness']/2),(L+2*T+.6,W+2*T+.6,B['base_thickness']),'Concrete / floor',B['bevel'])
for sign in [-1,1]:
    box('STRUCT_Wall_Long',(0,sign*(W/2+T/2),(Z+B['floor_z'])/2),(L+2*T,T,B['inner_depth']),'Concrete / board formed · 4m',B['bevel'])
    box('STRUCT_Wall_End',(sign*(L/2+T/2),0,(Z+B['floor_z'])/2),(T,W,B['inner_depth']),'Concrete / board formed · 4m',B['bevel'])
    box('STRUCT_Coping',(0,sign*(W/2+T/2),Z-.06),(L+2*T+.12,T+.12,.12),bevel=.025)
    box('STRUCT_Coping',(sign*(L/2+T/2),0,Z-.06),(T+.12,W,.12),bevel=.025)
    box('ACCESS_PerimeterDeck',(0,sign*(oy+A['width']/2),Z-A['deck_thickness']/2),(2*ex,A['width'],A['deck_thickness']),'Concrete / walkway',.025)
    box('ACCESS_PerimeterDeck',(sign*(ox+A['width']/2),0,Z-A['deck_thickness']/2),(A['width'],2*oy,A['deck_thickness']),'Concrete / walkway',.025)
    for x in range(-20,21,5):
        box('ACCESS_ConcreteSupports',(x,sign*(oy+.85),(Z-A['deck_thickness'])/2),(.32,.4,Z-A['deck_thickness']),'Concrete / board formed · 4m',.015)
    for y in [-7,-3,3,7]:
        box('ACCESS_ConcreteSupports',(sign*(ox+.85),y,(Z-A['deck_thickness'])/2),(.4,.32,Z-A['deck_thickness']),'Concrete / board formed · 4m',.015)
for x in [-14,-7,0,7,14]:
    for sign in [-1,1]:
        box('STRUCT_ExpansionJoints',(x,sign*(W/2-.003),(Z+B['floor_z'])/2),(.018,.012,B['inner_depth']),'Expansion joint')
        box('STRUCT_DeckJoints',(x,sign*(oy+.75),Z+.003),(.018,1.5,.008),'Expansion joint')

# Cross-pool steel inspection bridge: beams bear on the concrete walls.
for x in [-A['width']/2+.08,A['width']/2-.08]:
    box('ACCESS_BridgeBeams',(x,0,Z-.16),(.16,2*oy+.12,.30),'Steel / dark',.02)
for j in range(81):
    box('ACCESS_BridgeGrating',(0,-oy+j*(2*oy/80),Z-.035),(A['width'],.045,.07),'Galvanised steel')
for x in [-.4,0,.4]:
    box('ACCESS_BridgeGrating',(x,0,Z-.055),(.035,2*oy,.05),'Galvanised steel')


def railing(start, end, key='SAFETY_Railing', gaps=()):
    start,end=Vector(start),Vector(end)
    n=math.ceil((end-start).length/A['rail_post_spacing'])
    for i in range(n+1):
        p=start.lerp(end,i/n)
        if any(lo < p[axis] < hi for axis,lo,hi in gaps): continue
        pipe(key,[p,p+Vector((0,0,A['rail_height']))],A['post_radius'])
        box('SAFETY_Baseplates',p+Vector((0,0,.015)),(.15,.15,.03),'Galvanised steel',.008)
        if ARGS.stage=='final':
            for dx,dy in [(-.045,-.045),(.045,.045)]:
                pipe('SAFETY_AnchorBolts',[p+Vector((dx,dy,.03)),p+Vector((dx,dy,.055))],.011,'Steel / dark',6)
    for i in range(n):
        p=start.lerp(end,i/n);q=start.lerp(end,(i+1)/n)
        if any(lo < ((p[axis]+q[axis])/2) < hi for axis,lo,hi in gaps): continue
        for height in [A['rail_mid_height'],A['rail_height']]:
            pipe(key,[p+Vector((0,0,height)),q+Vector((0,0,height))],A['rail_radius'])


for y in [-ey,ey,-oy,oy]:
    railing((-ex,y,Z),(ex,y,Z),gaps=[(0,-1.05,1.05)] if y in [-ey,-oy,oy] else ())
for x in [-ex,ex,-ox,ox]:
    railing((x,-oy,Z),(x,oy,Z),gaps=[(1,-1.05,1.05)] if x==-ex else ())
for x in [-.75,.75]:
    railing((x,-oy,Z),(x,oy,Z),'SAFETY_BridgeRailing')


def stairs(origin, direction):
    origin=Vector(origin); direction=Vector(direction); across=Vector((-direction.y,direction.x,0))
    count=round(Z/A['stair_rise']);run=count*A['stair_run']
    for i in range(count):
        p=origin+direction*(i+.5)*A['stair_run'];p.z=(i+1)*A['stair_rise']-.06
        dims=(A['width'],A['stair_run']+.015,.12) if direction.y else (A['stair_run']+.015,A['width'],.12)
        box('ACCESS_StairTreads',p,dims,'Galvanised steel',.008)
        edge=p+direction*(A['stair_run']*.43);edge.z+=.065
        box('ACCESS_StairNosings',edge,(A['width'],.03,.015) if direction.y else (.03,A['width'],.015),'Safety / ochre')
    for side in [-1,1]:
        base=origin+across*side*(A['width']/2)
        pipe('ACCESS_StairStringers',[base+Vector((0,0,.06)),base+direction*run+Vector((0,0,Z-.06))],.075,'Steel / dark')
        for f in [0,.5,1]:
            p=base+direction*(run*f)+Vector((0,0,Z*f))
            pipe('SAFETY_StairRailing',[p,p+Vector((0,0,A['rail_height']))],A['post_radius'])
        for h in [A['rail_mid_height'],A['rail_height']]:
            pipe('SAFETY_StairRailing',[base+Vector((0,0,h)),base+direction*run+Vector((0,0,Z+h))],A['rail_radius'])


stair_run=round(Z/A['stair_rise'])*A['stair_run']
stairs((0,-ey-stair_run,0),(0,1,0))
stairs((-ex-stair_run,0,0),(1,0,0))

# Main header on supported brackets, inside the north coping.
pipe('AIR_Main',[(-20.7,P['main_y'],P['main_z']),(20.7,P['main_y'],P['main_z'])],P['main_radius'],'Air main / blue enamel',24)
for x in [-20,-14,-7,0,7,14,20]:
    box('AIR_MainSupports',(x,P['main_y'],Z+.13),(.18,.32,.26),'Galvanised steel',.01)
    box('AIR_MainSupports',(x,(P['main_y']+9.25)/2,Z+.035),(.20,9.25-P['main_y']+.25,.07),'Galvanised steel',.01)
    if ARGS.stage=='final': flange('AIR_MainFlanges',(x+.4,P['main_y'],P['main_z']),(1,0,0),.285)
for x in [-20.72,20.72]:
    flange('AIR_MainEndCaps',(x,P['main_y'],P['main_z']),(1,0,0),.22,False)

if ARGS.stage=='final':
    for i,x in enumerate(P['branch_x']):
        key=f'AIR_Branch_{i+1:02}'
        path=[(x,P['main_y'],P['main_z']),(x,P['branch_y'],P['main_z']),(x,P['branch_y'],P['bottom_z']),(x,-7.5,P['bottom_z'])]
        pipe(key,rounded(path,P['bend_radius']),P['drop_radius'],'Air main / blue enamel')
        flange('AIR_BranchFlanges',(x,8.14,P['main_z']),(0,1,0),.15)
        pipe('AIR_ValveBodies',[(x,7.85,P['main_z']),(x,8.1,P['main_z'])],.13,'Galvanised steel')
        pipe('AIR_ValveStems',[(x,7.97,P['main_z']),(x,7.97,P['main_z']+.38)],.025,'Galvanised steel')
        ring=[(x+.17*math.cos(j*math.tau/24),7.97+.17*math.sin(j*math.tau/24),P['main_z']+.38) for j in range(25)]
        pipe('AIR_ValveHandwheels',ring,.018,'Safety / ochre',8)
        for angle in [0,math.pi/2]:
            d=Vector((math.cos(angle)*.16,math.sin(angle)*.16,0));p=Vector((x,7.97,P['main_z']+.38))
            pipe('AIR_ValveHandwheels',[p-d,p+d],.013,'Safety / ochre',8)
        for y in P['lateral_y']:
            pipe('AERATOR_Laterals',[(x-P['lateral_half_width'],y,P['bottom_z']),(x+P['lateral_half_width'],y,P['bottom_z'])],P['lateral_radius'],'Steel / dark',10)
            for dx in [-2.4,0,2.4]:
                box('AERATOR_PipeSupports',(x+dx,y,(B['floor_z']+P['bottom_z'])/2),(.12,.15,P['bottom_z']-B['floor_z']),'Galvanised steel')
            for dx in P['disc_offsets']:
                z=P['bottom_z']+.18
                pipe('AERATOR_DiscConnections',[(x+dx,y,P['bottom_z']),(x+dx,y,z)],.034,'Galvanised steel',10)
                pipe('AERATOR_DiscBodies',[(x+dx,y,z-.02),(x+dx,y,z+.035)],P['disc_radius'],'Galvanised steel',24)
                pipe('AERATOR_DiscMembranes',[(x+dx,y,z+.035),(x+dx,y,z+P['disc_height'])],P['disc_radius']*.91,'Diffuser / EPDM membrane',24)
        for z in [-2.8,-.4,.8]:
            box('AIR_DropSupports',(x,(P['branch_y']+9)/2,z),(.17,9-P['branch_y']+.10,.10),'Galvanised steel')
            box('AIR_DropAnchors',(x,8.98,z),(.30,.06,.30),'Galvanised steel',.01)

# Opaque water; seeded multiscale surface normal is prepared by visual_materials.py.
normal_path=ROOT/'assets/source/textures/water_normal_r1.png'
mat=material('Water / opaque process water',C['materials']['water_color'],C['materials']['water_roughness'])
bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bsdf.inputs['IOR'].default_value=1.333
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(normal_path));tex.image.colorspace_settings.name='Non-Color'
normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=C['materials']['water_normal_strength']
mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
add('WATER_Surface',mat.name,[(-L/2+.03,-W/2+.03,B['water_z']),(L/2-.03,-W/2+.03,B['water_z']),(L/2-.03,W/2-.03,B['water_z']),(-L/2+.03,W/2-.03,B['water_z'])],[(0,1,2,3)],tile=C['materials']['water_tile_m'])

# Four ground pieces leave an exact opening; no ground plane crosses the pool.
for sign in [-1,1]:
    box('SITE_Hardscape',(sign*(S['length']/2+ox)/2,0,-.12),(S['length']/2-ox,S['width'],.24),'Concrete / paving',parent='site')
    box('SITE_Hardscape',(0,sign*(S['width']/2+oy)/2,-.12),(2*ox,S['width']/2-oy,.24),'Concrete / paving',parent='site')
for x in [-28,-24,-16,-8,0,8,16,24,28]:
    for y0,y1 in [(-14.1,-oy),(oy,20)]:
        box('SITE_PavingJoints',(x,(y0+y1)/2,.003),(.012,y1-y0,.006),'Expansion joint',parent='site')
box('SITE_Road',(0,S['road_y'],.018),(S['length'],S['road_width'],.036),'Asphalt / 2m',parent='site')
for x in range(-29,30,6):
    box('SITE_RoadMarkings',(x,S['road_y'],.04),(2.7,.10,.015),'Road marking',parent='site')
for sign in [-1,1]:
    yy=S['road_y']+sign*(S['road_width']/2+.12)
    box('SITE_RoadCurbs',(0,yy,.10),(S['length'],.22,.20),'Precast / coping',.025,parent='site')
    box('SITE_PlantingBeds',(0,sign*18.9,.035),(S['length']-1,1.65,.07),'Grass',.025,parent='site')
for x in [-27,27]:
    for y in [-9,9]:
        box('SITE_PlantingBeds',(x,y,.08),(2.8,5,.16),'Planting soil',.03,parent='site')
        if ARGS.stage=='final':
            for j in range(4):
                bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=2,radius=1)
                for v in bm.verts:v.co=Vector((v.co.x*.70+x,v.co.y*.70+y-1.5+j,v.co.z*.47+.52))
                bm.verts.index_update()
                add('SITE_Shrubs','Shrub leaves' if j%2 else 'Shrub light',[v.co for v in bm.verts],[tuple(v.index for v in f.verts) for f in bm.faces],parent='site')
                bm.free()

for (name,mat,parent),bucket in buckets.items():
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(bucket['verts'],[],bucket['faces']);mesh.materials.append(materials[mat]);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for poly,coords,smooth in zip(mesh.polygons,bucket['uv'],bucket['smooth']):
        poly.use_smooth=smooth
        for li,coord in zip(poly.loop_indices,coords):uv.data[li].uv=coord
    obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.parent=device if parent=='device' else site
    obj['part_type']=name.split('_')[0]
    if name=='WATER_Surface':obj['part_id']='WATER_SURFACE';obj['toggleable']=True

# Decode HDRI, but environment lighting is set up separately in the browser.
hdr=bpy.data.images.load(str(ROOT/'public/environments/daylight_2k.hdr'),check_existing=True)
assert list(hdr.size)==[2048,1024] and len(hdr.pixels)>0
decoded.append({'file':'public/environments/daylight_2k.hdr','width':2048,'height':1024,'channel':'environment','color_space':hdr.colorspace_settings.name})
world=bpy.data.worlds.new('SW_M0_Daylight');scene.world=world;world.use_nodes=True
env=world.node_tree.nodes.new('ShaderNodeTexEnvironment');env.image=hdr
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');world.node_tree.links.new(env.outputs['Color'],background.inputs['Color'])
background.inputs['Strength'].default_value=.65
for image in bpy.data.images:
    if image.source=='FILE':image.pack()

for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=65
            area.spaces.active.region_3d.view_location=(0,0,-.5)

for obj in bpy.context.view_layer.objects:obj.select_set(False)
for obj in collection.all_objects:obj.select_set(True)
bpy.context.view_layer.objects.active=device
staging=ROOT/'assets'/'staging';staging.mkdir(parents=True,exist_ok=True)
blend=staging/'aeration-tank.blend';glb=staging/'aeration-tank.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend),check_existing=False)
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False)
raw=glb.read_bytes();assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,8)[0]==len(raw)
length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
assert len([n for n in doc['nodes'] if n.get('extras',{}).get('device_id')==C['device_id']])==1
assert any(n['name']=='WATER_Surface' for n in doc['nodes'])
assert all(n.get('name') not in ['Cube','Camera','Light'] for n in doc['nodes'])
assert all('bufferView' in image for image in doc.get('images',[]))
assert blend.stat().st_size>10000
backup=ROOT/'assets/previous';backup.mkdir(exist_ok=True)
destinations=[(blend,ROOT/'assets/source/aeration-tank.blend'),(glb,ROOT/'public/models/aeration-tank.glb')]
for source,target in destinations:
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():shutil.copy2(target,backup/target.name)
for source,target in destinations:os.replace(source,target)
triangles=sum(len(p.vertices)-2 for o in collection.objects if o.type=='MESH' for p in o.data.polygons)
report={'stage':ARGS.stage,'scene':scene.name,'collection':collection.name,'mesh_objects':len([o for o in collection.objects if o.type=='MESH']),'triangles':triangles,'glb_bytes':len(raw),'glb_sha256':hashlib.sha256(raw).hexdigest(),'decoded_images':decoded,'disc_count':len(P['branch_x'])*len(P['lateral_y'])*len(P['disc_offsets']) if ARGS.stage=='final' else 0,'created_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'dimensions':C}
(REPORT_DIR/f'model-{ARGS.stage}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
register_path=ROOT/'docs/asset-register.json';register=json.loads(register_path.read_text())
for asset in register['assets']:
    info=next((x for x in decoded if x['file']==asset['file']),None)
    if info:asset.update(info);asset['decoded']=True
register['generated_assets']=[a for a in register.get('generated_assets',[]) if a.get('file') not in [g['file'] for g in generated_materials]]+generated_materials
register_path.write_text(json.dumps(register,ensure_ascii=False,indent=2)+'\n')
print('M0_BUILD_SUCCESS='+json.dumps({k:v for k,v in report.items() if k not in ['decoded_images','dimensions']}),flush=True)
