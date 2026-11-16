"""Local reproducible PBR derivatives. No render baking or external Python dependencies."""
import bpy, numpy as np, struct, zlib, hashlib, datetime

def write_png(path, rgb):
    rgb=np.uint8(np.clip(rgb,0,1)*255+.5)
    height,width,_=rgb.shape
    grayscale=bool(np.array_equal(rgb[:,:,0],rgb[:,:,1]) and np.array_equal(rgb[:,:,0],rgb[:,:,2]))
    pixels=rgb[:,:,0] if grayscale else rgb
    # bpy pixels and the generated fields use bottom-up UV coordinates; PNG rows are top-down.
    raw=b''.join(b'\0'+pixels[height-1-y].tobytes() for y in range(height))
    def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,0 if grayscale else 2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))

def prepare(root,config):
    folder=root/'assets/source/textures';generated=[]
    def read(name):
        image=bpy.data.images.load(str(folder/name),check_existing=True)
        image.colorspace_settings.name='Non-Color'
        assert list(image.size)==[2048,2048] and len(image.pixels)>0
        values=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(values)
        return values.reshape(2048,2048,4)[:,:,:3]
    def save(name,data,sources,description):
        path=folder/name;write_png(path,data)
        generated.append({'file':str(path.relative_to(root)),'source_files':sources,'author':'SmartWater M0.1 project; original scans by Rob Tuytel','license':'CC0-1.0 derivatives','generated_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'resolution':[data.shape[1],data.shape[0]],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'description':description})
    old=read('concrete_diff_2k.jpg');floor=read('concrete_floor_01_diff_2k.jpg')
    luma=lambda x:x[:,:,0]*.2126+x[:,:,1]*.7152+x[:,:,2]*.0722
    board=luma(old);aggregate=luma(floor)
    # Two 2m aggregate tiles inside the 4m wall tile; retain weakened formwork traces.
    grain=np.tile(aggregate[::2,::2],(2,2))
    wall=.60+.26*(board-board.mean())+.15*(grain-grain.mean())
    floor_gray=.59+.40*(aggregate-aggregate.mean())
    walkway=.68+.22*(aggregate-aggregate.mean())
    for name,data in [('wall',wall),('floor',floor_gray),('walkway',walkway)]:
        gray=np.clip(data,.40,.78)
        save(f'concrete_{name}_r1_diff.png',np.repeat(gray[:,:,None],3,axis=2),['concrete_diff_2k.jpg','concrete_floor_01_diff_2k.jpg'] if name=='wall' else ['concrete_floor_01_diff_2k.jpg'],'Neutral photographic concrete; role-specific contrast, no added dirt or exposure changes')
    del old,floor,board,aggregate,grain,wall,floor_gray,walkway
    old=read('concrete_nor_gl_2k.jpg')*2-1;floor=read('concrete_floor_01_nor_gl_2k.jpg')*2-1
    tiled=np.tile(floor[::2,::2],(2,2,1))
    for name,normal in [('wall',old*.24+tiled*.76),('floor',floor)]:
        normal=(normal[::2,::2]+normal[1::2,::2]+normal[::2,1::2]+normal[1::2,1::2])*.25
        normal=normal/np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-6)
        save(f'concrete_{name}_r1_nor_gl.png',normal*.5+.5,['concrete_nor_gl_2k.jpg','concrete_floor_01_nor_gl_2k.jpg'] if name=='wall' else ['concrete_floor_01_nor_gl_2k.jpg'],'Normalized OpenGL normal; wall keeps restrained formwork relief')
    del old,floor,tiled
    old=read('concrete_rough_2k.jpg');floor=read('concrete_floor_01_rough_2k.jpg')
    for name,data,mean,contrast in [('wall',old,.80,.18),('floor',floor,.84,.28)]:
        rough=np.clip(mean+contrast*(data-data.mean()),.64,.96)
        rough=(rough[::2,::2]+rough[1::2,::2]+rough[::2,1::2]+rough[1::2,1::2])*.25
        save(f'concrete_{name}_r1_rough.png',rough,['concrete_rough_2k.jpg'] if name=='wall' else ['concrete_floor_01_rough_2k.jpg'],'Matte, low-contrast roughness; scalar Non-Color data')
    size=config['water_normal_size'];rng=np.random.default_rng(config['water_normal_seed'])
    fy=np.fft.fftfreq(size)[:,None]*size;fx=np.fft.rfftfreq(size)[None,:]*size
    radius=np.sqrt(fx*fx+fy*fy);height=np.zeros((size,size))
    for sigma,weight in [(3,.30),(9,.45),(23,.20),(54,.05)]:
        white=rng.normal(size=(size,size))
        field=np.fft.irfft2(np.fft.rfft2(white)*np.exp(-.5*(radius/sigma)**2),s=(size,size))
        height+=weight*field/max(field.std(),1e-6)
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))*.5
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))*.5
    scale=.12/max(np.percentile(np.sqrt(dx*dx+dy*dy),99),1e-6)
    nx=-dx*scale;ny=-dy*scale;nz=np.ones_like(nx)
    normal=np.stack([nx,ny,nz],axis=2);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    path=folder/'water_normal_r1.png';save(path.name,normal*.5+.5,[],'Seeded isotropic four-scale periodic noise height gradients; no finite set of directional sine waves')
    return generated
