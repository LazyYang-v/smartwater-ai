"""Open the editable source, then independently reimport the delivered GLB."""
import bpy
import hashlib
import json
import math
import numpy as np
from pathlib import Path
from mathutils import Vector

assert bpy.app.background
ROOT=Path(__file__).resolve().parents[2]
C=json.loads((ROOT/'config/aeration.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/aeration-tank.blend'))
source=bpy.data.scenes[C['scene_name']]
collection=bpy.data.collections[C['collection']]
assert collection in list(source.collection.children)
assert sum(o.get('device_id')==C['device_id'] for o in collection.objects)==1
assert not any(o.name in ['Cube','Camera','Light'] for o in collection.objects)
assert all(i.packed_file for i in bpy.data.images if i.source=='FILE')
editable={'opened':True,'active_scene':bpy.context.scene.name,'scene':source.name,'managed_objects':len(collection.objects),'all_file_images_packed':True}
audit={'material_roles':{},'water_spectrum':{}}
for name in ['STRUCT_BaseSlab','STRUCT_Wall_Long','ACCESS_PerimeterDeck','WATER_Surface']:
    obj=bpy.data.objects[name];mat=obj.data.materials[0]
    uv=np.array([tuple(x.uv) for x in obj.data.uv_layers.active.data])
    audit['material_roles'][name]={'material':mat.name,'uv_min':uv.min(0).tolist(),'uv_max':uv.max(0).tolist(),'normal_strength':[n.inputs['Strength'].default_value for n in mat.node_tree.nodes if n.type=='NORMAL_MAP'],'images':[{'name':n.image.name,'color_space':n.image.colorspace_settings.name,'size':list(n.image.size)} for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]}
image=bpy.data.images['water_normal_r1.png'];pixels=np.empty(len(image.pixels),np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
power=sum(abs(np.fft.fft2(pixels[:,:,i]-pixels[:,:,i].mean()))**2 for i in [0,1]);power[0,0]=0
audit['water_spectrum']={'top_12_frequency_energy_fraction':float(np.sort(power.ravel())[-12:].sum()/power.sum()),'size':list(image.size),'xy_stddev':[float(pixels[:,:,i].std()) for i in [0,1]]}
(ROOT/'docs/acceptance/m0-visual-r1/material-after.json').write_text(json.dumps(audit,indent=2)+'\n')

validation=bpy.data.scenes.new('SW_M0_IndependentValidation')
bpy.context.window.scene=validation
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/aeration-tank.glb'))
objects=list(validation.objects)
devices=[o for o in objects if o.get('device_id')==C['device_id']]
assert len(devices)==1
device=devices[0]
water=next(o for o in objects if o.name.startswith('WATER_Surface'))
water_coords=[water.matrix_world@v.co for v in water.data.vertices]
assert all(abs(p.z-C['basin']['water_z'])<1e-5 for p in water_coords)
assert abs(max(p.x for p in water_coords)-min(p.x for p in water_coords)-(C['basin']['inner_length']-.06))<1e-4
assert abs(max(p.y for p in water_coords)-min(p.y for p in water_coords)-(C['basin']['inner_width']-.06))<1e-4
site=next(o for o in objects if o.name.startswith('SW_SITE_CONTEXT'))
assert site.parent is None and device.parent is None
assert all(o.name not in ['Cube','Camera','Light'] for o in objects)
assert water.parent==device
coords=[o.matrix_world@v.co for o in device.children if o.type=='MESH' for v in o.data.vertices]
minimum=[min(p[i] for p in coords) for i in range(3)]
maximum=[max(p[i] for p in coords) for i in range(3)]
assert abs(minimum[2]-(C['basin']['floor_z']-C['basin']['base_thickness']))<1e-4
ground=next(o for o in objects if o.name.startswith('SITE_Hardscape'))
assert not ground.ray_cast(Vector((0,0,5)),Vector((0,0,-1)),distance=10)[0], 'Ground crosses pool interior'
meshes=[o for o in objects if o.type=='MESH']
assert all(math.isfinite(v.co[i]) for o in meshes for v in o.data.vertices for i in range(3))
assert all(p.area>1e-10 for o in meshes for p in o.data.polygons)
assert all(all(math.isfinite(n) for n in p.normal) for o in meshes for p in o.data.polygons)
report={'editable_blend':editable,'independent_glb_reimport':True,'unique_device_id':C['device_id'],'root_nodes_separate':True,'water_local_z':water_coords[0].z,'device_bounds_z_up':{'min':minimum,'max':maximum},'ground_opening_verified':True,'mesh_objects':len(meshes),'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),'finite_vertices_and_normals':True,'nondegenerate_faces':True,'glb_bytes':(ROOT/'public/models/aeration-tank.glb').stat().st_size,'glb_sha256':hashlib.sha256((ROOT/'public/models/aeration-tank.glb').read_bytes()).hexdigest()}
(ROOT/'docs/acceptance/m0-visual-r1/model-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('M0_VALIDATION_SUCCESS='+json.dumps(report))
