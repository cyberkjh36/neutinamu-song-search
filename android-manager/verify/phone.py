"""Exercise both release APKs and an isolated enrollment fixture on the emulator."""
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile

repo=Path(__file__).resolve().parents[2]
tools=Path(os.environ['ANDROID_HOME'])/'build-tools/35.0.0'

def run(*args,check=True,timeout=60):
    return subprocess.run([str(v) for v in args],check=check,capture_output=True,text=True,timeout=timeout,stdin=subprocess.DEVNULL).stdout.strip()

def adb(*args):return run('adb',*args)

def wait_node(look, seconds=65):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        try:
            raw=run('adb','exec-out','uiautomator','dump','/dev/tty',check=False,timeout=12)
        except subprocess.TimeoutExpired:
            continue
        if '<hierarchy' in raw and '</hierarchy>' in raw:
            nodes=ET.fromstring(raw[raw.index('<hierarchy'):raw.index('</hierarchy>')+12])
            for n in nodes.iter('node'):
                if look(n.attrib):return n.attrib
        time.sleep(.5)
    raise AssertionError('Mobile control did not appear; foreground: '+adb('shell','dumpsys','activity','activities')[:700])

def press(node):
    x,y,x1,y1=map(int,re.findall(r'\d+',node['bounds']))
    adb('shell','input','tap',str((x+x1)//2),str((y+y1)//2))

def has(text):
    return lambda node:text in node.get('text','') or text in node.get('content-desc','')

def enter(password):
    press(wait_node(lambda n:n.get('class')=='android.widget.EditText'))
    adb('shell','input','text',password)
    adb('shell','input','keyevent','66')

def launch(pkg):
    adb('shell','am','start','-W','-n',pkg+'/kr.neutinamu.manager.ManagerActivity')

def make_fixture(apk,product,work):
    encrypted=run('node',repo/'android-manager/verify/fixture.mjs',product)
    unsigned=work/'qa-unsigned.apk'
    target='assets/site/'+product+'/manager.sealed.json'
    with zipfile.ZipFile(apk) as source,zipfile.ZipFile(unsigned,'w') as out:
        for item in source.infolist():
            if item.filename.startswith('META-INF/'):continue
            out.writestr(item,encrypted.encode() if item.filename==target else source.read(item))
    aligned=work/'qa.apk'
    run(tools/'zipalign','-f','4',unsigned,aligned)
    run(tools/'apksigner','sign','--ks',work/'qa.p12','--ks-pass','pass:test-only-fixture',aligned)
    return aligned

with tempfile.TemporaryDirectory() as tmp:
    work=Path(tmp)
    run('keytool','-genkeypair','-keystore',work/'qa.p12','-storepass','test-only-fixture','-alias','fixture','-keyalg','RSA','-dname','CN=Android Automation','-validity','10')
    os.environ['ANDROID_FIXTURE_KEY']=secrets.token_hex(12)
    for product,pkg,glob in [('p2wifi','kr.neutinamu.manager.p2','Neutinamu_P2_Manager_Android_*.apk'),('wk','kr.neutinamu.manager.world','WorldKaraoke_Manager_Android_*.apk')]:
        releases=sorted((repo/'downloads').glob(glob))
        apk=releases[-1]
        # The field-reported waiting screen shipped in World 1.0.1. Exercise a
        # direct update from it as well as the usual previous-release upgrade.
        if product=='wk' and apk.name=='WorldKaraoke_Manager_Android_1.0.3.apk':
            reported=repo/'downloads/WorldKaraoke_Manager_Android_1.0.1.apk'
            adb('install','--no-streaming',reported)
            adb('install','--no-streaming','-r',apk)
            launch(pkg)
            wait_node(lambda n:n.get('class')=='android.widget.EditText')
            adb('uninstall',pkg)
            print('Direct World manager 1.0.1 to 1.0.3 update opened on Android.',flush=True)
        if len(releases)>1:
            print('Installing previous release:',releases[-2].name,flush=True)
            adb('install','--no-streaming','-r',releases[-2])
        print('Testing update:',apk.name,flush=True)
        adb('install','--no-streaming','-r',apk)
        print('Opening updated app:',pkg,flush=True)
        launch(pkg)
        enter('invalid-test-value');wait_node(has('비밀번호를 확인'))
        print(pkg,'release installed, opened in its own Activity and rejected an incorrect enrollment key',flush=True)
        adb('uninstall',pkg);adb('install',make_fixture(apk,product,work));launch(pkg)
        enter(os.environ['ANDROID_FIXTURE_KEY']);wait_node(has('Fixture ready'))
        adb('shell','am','force-stop',pkg);launch(pkg)
        wait_node(has('Fixture ready'))
        press(wait_node(has('Test microphone')))
        wait_node(lambda n:n.get('package') in ['com.android.permissioncontroller','com.google.android.permissioncontroller','com.android.packageinstaller'] and n.get('clickable')=='true')
        adb('uninstall',pkg)
        print(pkg,'enrollment survived a process restart and speech opened the native microphone permission prompt',flush=True)
