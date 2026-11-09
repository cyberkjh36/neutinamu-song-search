"""Bundle only first-party UI and catalog assets; preserve verified venue mappings."""
from pathlib import Path
import argparse, hashlib, json, re, shutil, zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
APK_SHA = '2714cbdba254ea8e6a430d87fef59cf8ddd6516752f1975a73935b57fd4a9d4b'
ASSETS = ['index.html','chosung.js','native-search.js','favorites-data.js','favorites-ui.js','favorites.css','p2-ui.mjs','p2-client.mjs','p2.css','icon.svg','icon-192.png','icon-512.png','catalog-20261018.csv','catalog-update-20261104.csv']

def prepare(apk):
    raw = Path(apk).read_bytes()
    if hashlib.sha256(raw).hexdigest() != APK_SHA:
        raise ValueError('Use the verified Android 0.11.15 APK for venue room mappings')
    with zipfile.ZipFile(apk) as z:
        text = z.read('assets/p2-rooms.txt').decode('utf-8-sig')
    rooms = {}
    for line in text.splitlines():
        if not line.strip(): continue
        match = re.fullmatch(r'([1-9][0-9]?)번(?:방)?\s+(TJ_P2_P[0-9]{10}_[0-9]+_B)',line.strip())
        if not match or match[1] in rooms: raise ValueError('Invalid room mapping')
        rooms[match[1]] = match[2]
    if set(rooms) != {'1','2','3','5','6','7','8'} or len(set(rooms.values())) != 7: raise ValueError('Incomplete room mapping')
    output = ROOT/'Prepared'; web = output/'Web'; web.mkdir(parents=True,exist_ok=True)
    for name in ASSETS: shutil.copy2(REPO/name,web/name)
    html = (web/'index.html').read_text()
    csp = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'"
    html = html.replace('<head>','<head>\n<meta http-equiv="Content-Security-Policy" content="'+csp+'">',1)
    (web/'index.html').write_text(html)
    js = (web/'native-search.js').read_text().replace('made by cyberkjh · 0.11.15','made by cyberkjh · iPhone 개발본 0.11.15')
    (web/'native-search.js').write_text(js)
    (output/'rooms.json').write_text(json.dumps(rooms,ensure_ascii=False,indent=2))
    print('Prepared 15 shared UI/catalog assets and all 7 venue rooms; no connection passwords included.')

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--rooms-from-apk',required=True); args = p.parse_args(); prepare(args.rooms_from_apk)
