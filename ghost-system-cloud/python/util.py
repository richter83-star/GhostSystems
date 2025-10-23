import os, json, time
from slugify import slugify

def save_meta(meta, base='data/meta'):
    os.makedirs(base, exist_ok=True)
    path = os.path.join(base, f"{meta['sku']}.json")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    return path

def sku(title, kind):
    return f"{slugify(title)}_{kind}_{int(time.time())}"
