"""Download selected CC0 files atomically; Blender verifies image decoding separately."""
import concurrent.futures
import datetime
import hashlib
import json
import os
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
UA = {"User-Agent": "SmartWater-M0/0.1 (local asset preparation)"}
SOURCES = [
    ("concrete", "Rob Tuytel", "texture"),
    ("worn_asphalt", "Amal Kumar", "texture"),
    ("kloofendal_48d_partly_cloudy_puresky", "Greg Zaal; Jarod Guest", "hdri"),
]


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as response:
        return json.load(response)


def main():
    tasks = []
    for asset, author, kind in SOURCES:
        metadata = get_json(f"https://api.polyhaven.com/files/{asset}")
        channels = [("hdri", "hdr")] if kind == "hdri" else [("Diffuse", "jpg"), ("nor_gl", "jpg"), ("Rough", "jpg")]
        for channel, fmt in channels:
            file = metadata[channel]["2k"][fmt]
            relative = Path("public/environments/daylight_2k.hdr") if kind == "hdri" else Path("assets/source/textures") / Path(file["url"]).name
            tasks.append({"asset": asset, "author": author, "channel": channel, "format": fmt, "resolution": "2K", "source": f"https://polyhaven.com/a/{asset}", "license": "CC0-1.0", "license_url": "https://polyhaven.com/license", "file": str(relative), "download_url": file["url"], "expected_md5": file["md5"], "expected_size": file["size"]})

    def download(item):
        path = ROOT / item["file"]
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_file() and hashlib.md5(path.read_bytes()).hexdigest() == item["expected_md5"]:
            data = path.read_bytes()
        else:
            with urllib.request.urlopen(urllib.request.Request(item["download_url"], headers=UA), timeout=90) as response:
                data = response.read()
            assert len(data) == item["expected_size"], "Downloaded size mismatch"
            assert hashlib.md5(data).hexdigest() == item["expected_md5"], "Publisher MD5 mismatch"
            staging = path.with_suffix(path.suffix + ".staging.download")
            staging.write_bytes(data)
            os.replace(staging, path)
        item.update({"filename": path.name, "downloaded_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "decoded": False})
        print(f"Verified download: {path.name} ({len(data)} bytes)", flush=True)
        return item

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(download, tasks))
    (ROOT / "docs/asset-register.json").write_text(json.dumps({"assets": records}, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
