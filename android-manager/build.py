"""Build the two signed phone apps from an adjacent checkout of the remotes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
EDITION = {
    'p2wifi': ('kr.neutinamu.manager.p2', 'P2 매니저', 'p2-icon.xml', 'Neutinamu_P2_Manager_Android_1.0.1.apk'),
    'wk': ('kr.neutinamu.manager.world', '월드가라오케 매니저', 'world-icon.xml', 'WorldKaraoke_Manager_Android_1.0.2.apk')
}

def run(*args):
    subprocess.run([str(x) for x in args], check=True)

def assets(edition, dest):
    # Serve installed assets under the deployed HTTPS origin. The relay still
    # performs normal admission. Newly released catalog files remain online.
    shutil.copytree(REPO / 'manager', dest / 'manager')
    shutil.copy2(HERE / 'assets/android-voice.mjs', dest / 'manager')
    entry = dest / 'manager/unlock.mjs'
    entry.write_text("import './android-voice.mjs';\n" + entry.read_text())
    shutil.copytree(REPO / edition, dest / edition,
                    ignore=shutil.ignore_patterns('README*', 'print.*', 'sw.js', 'index.html'))
    files = [REPO / name for name in ['icon-192.png','icon-512.png','icon.svg']]
    if edition == 'p2wifi':
        files += [REPO / name for name in ['catalog-sync.js','chosung.js','p2.css']]
        files += list(REPO.glob('catalog-*.csv'))
        bridge = dest / edition / 'wifi-bridge.js'
        original = bridge.read_text()
        start = original.index(' function save(name,text){')
        end = original.index('\n', start)
        bridge.write_text(original[:start] + """ function save(name,text){
  const accepted=window.prompt('neuti-manager-export',JSON.stringify({name,text}))==='ok';
  window.onP2NativeFile?.(accepted?'저장할 위치를 선택하세요.':'파일을 저장하지 못했습니다.');
 }""" + original[end:])
    for path in files:
        shutil.copy2(path, dest)
    envelope = HERE / 'sealed' / (edition + '.json')
    original = REPO / edition / 'manager.sealed.json'
    if json.loads(envelope.read_text())['webSha256'] != hashlib.sha256(original.read_bytes()).hexdigest():
        raise RuntimeError('Refresh the encrypted Android resources with prepare.mjs seal')
    shutil.copy2(envelope, dest / edition / 'manager.sealed.json')
    run('node', HERE / 'prepare.mjs', 'assets', dest)

def main():
    parser=argparse.ArgumentParser()
    for name in ['tools','platform','keystore','password-file','output']:
        parser.add_argument('--'+name, required=True, type=Path)
    parser.add_argument('--edition', choices=EDITION)
    options=parser.parse_args()
    tools, platform = options.tools.resolve(), options.platform.resolve()
    output=options.output.resolve()
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        build=Path(tmp)
        classes=build/'classes'; classes.mkdir()
        sources=sorted((HERE/'src').rglob('*.java'))
        run('java','-m','jdk.compiler/com.sun.tools.javac.Main','-source','8','-target','8','-bootclasspath',os.pathsep.join(map(str,[tools/'core-lambda-stubs.jar',platform])),'-d',classes,*sources)
        dex=build/'dex';dex.mkdir()
        run(tools/'d8','--release','--min-api','26','--lib',platform,'--output',dex,*sorted(classes.rglob('*.class')))
        for edition,(package,label,icon,name) in EDITION.items():
            if options.edition and edition!=options.edition:
                continue
            work=build/edition;work.mkdir()
            res=work/'res';shutil.copytree(HERE/'res',res)
            (res/'drawable').mkdir();shutil.copy2(HERE/icon,res/'drawable/manager_icon.xml')
            manifest=work/'AndroidManifest.xml'
            version_code,version_name = (3,'1.0.2') if edition=='wk' else (2,'1.0.1')
            manifest.write_text((HERE/'AndroidManifest.xml').read_text().replace('APP_PACKAGE',package)
                                .replace('APP_LABEL',label).replace('VERSION_CODE',str(version_code))
                                .replace('VERSION_NAME',version_name))
            assets(edition,work/'assets/site')
            compiled=work/'resources.zip'
            run(tools/'aapt2','compile','--dir',res,'-o',compiled)
            unsigned=work/'unsigned.apk'
            run(tools/'aapt2','link','-I',platform,'--manifest',manifest,'-A',work/'assets','-o',unsigned,compiled)
            with zipfile.ZipFile(unsigned,'a',compression=zipfile.ZIP_DEFLATED) as archive:
                archive.write(dex/'classes.dex','classes.dex')
            aligned=work/'aligned.apk'
            run(tools/'zipalign','-f','4',unsigned,aligned)
            release=output/name
            run(tools/'apksigner','sign','--ks',options.keystore,'--ks-pass','file:'+str(options.password_file),
                '--v4-signing-enabled','false','--out',release,aligned)
            run(tools/'apksigner','verify','--verbose',release)
            run(tools/'zipalign','-c','4',release)
            print(release,flush=True)
if __name__=='__main__':
    main()
