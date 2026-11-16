"""Read-only diagnosis of the pre-r1 Blend, using an independent background process."""
import bpy, json, numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/acceptance/m0-visual-r1'
assert bpy.app.background
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/aeration-tank.blend'))
report={'materials':{},'uv':{},'water_frequency_peaks':[]}
for mat in bpy.data.materials:
    if not mat.use_nodes:continue
    bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not bsdf:continue
    report['materials'][mat.name]={'image_nodes':[{'image':n.image.name,'color_space':n.image.colorspace_settings.name,'size':list(n.image.size)} for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image],'normal_strength':[n.inputs['Strength'].default_value for n in mat.node_tree.nodes if n.type=='NORMAL_MAP'],'roughness_input_linked':bsdf.inputs['Roughness'].is_linked}
for name in ['STRUCT_BaseSlab','STRUCT_Wall_Long','ACCESS_PerimeterDeck','WATER_Surface']:
    obj=bpy.data.objects[name];uv=np.array([tuple(x.uv) for x in obj.data.uv_layers.active.data]);report['uv'][name]={'material':obj.data.materials[0].name,'uv_min':uv.min(0).tolist(),'uv_max':uv.max(0).tolist(),'dimensions_m':list(obj.dimensions)}
image=next(i for i in bpy.data.images if i.name.startswith('water_normal_generated'))
arr=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(arr);arr=arr.reshape(image.size[1],image.size[0],4)
power=sum(abs(np.fft.fft2(arr[:,:,c]-arr[:,:,c].mean()))**2 for c in [0,1]);power[0,0]=0
peaks=np.argsort(power.ravel())[-12:][::-1];total=power.sum()
for index in peaks:
    y,x=np.unravel_index(index,power.shape);report['water_frequency_peaks'].append({'frequency_xy':[int(x if x<image.size[0]/2 else x-image.size[0]),int(y if y<image.size[1]/2 else y-image.size[1])],'energy_fraction':float(power[y,x]/total)})
report['top_12_frequency_energy_fraction']=float(sum(power.ravel()[peaks])/total)
(OUT/'material-diagnosis.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
