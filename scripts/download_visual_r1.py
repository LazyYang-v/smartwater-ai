"""Download the separately licensed non-board-form floor texture; retain old provenance."""
import concurrent.futures,datetime,hashlib,json,os,urllib.request
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
headers={'User-Agent':'SmartWater-M0.1-local-material-review/1.0'}
with urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/concrete_floor_01',headers=headers),timeout=30) as response:meta=json.load(response)
def download(channel):
    info=meta[channel]['2k']['jpg'];path=ROOT/'assets/source/textures'/Path(info['url']).name
    with urllib.request.urlopen(urllib.request.Request(info['url'],headers=headers),timeout=90) as response:data=response.read()
    assert len(data)==info['size'] and hashlib.md5(data).hexdigest()==info['md5']
    stage=path.with_suffix('.staging.jpg');stage.write_bytes(data)
    image=Image.open(stage);image.load();assert image.size==(2048,2048)
    os.replace(stage,path)
    return {'asset':'concrete_floor_01','source':'https://polyhaven.com/a/concrete_floor_01','author':'Rob Tuytel','license':'CC0-1.0','license_url':'https://polyhaven.com/license','file':str(path.relative_to(ROOT)),'filename':path.name,'channel':channel,'resolution':'2K','width':2048,'height':2048,'downloaded_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(data).hexdigest(),'expected_md5':info['md5'],'bytes':len(data),'decoded':True,'download_url':info['url']}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:records=list(pool.map(download,['Diffuse','nor_gl','Rough']))
path=ROOT/'docs/asset-register.json';register=json.loads(path.read_text());register['assets']=[x for x in register['assets'] if x['asset']!='concrete_floor_01']+records;path.write_text(json.dumps(register,indent=2)+'\n')
(ROOT/'docs/acceptance/m0-visual-r1/downloaded-resources.json').write_text(json.dumps(records,indent=2)+'\n')
print('Downloaded and decoded three CC0 floor material channels.')
