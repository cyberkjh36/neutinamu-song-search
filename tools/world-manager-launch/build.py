"""Build password-protected per-user Windows room setup from pre-provisioned receiver keys."""
import argparse, getpass, hashlib, hmac, json, os, struct, subprocess, tempfile
from pathlib import Path
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--compiler',required=True)
    p.add_argument('--uia',type=Path,required=True)
    p.add_argument('--cecil',type=Path,required=True)
    p.add_argument('--keys',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    opts=p.parse_args()
    root=Path(__file__).resolve().parent
    shared=root.parent/'room-shortcut/setup'
    common=[opts.compiler,'-target:winexe','-platform:anycpu','-optimize+','-r:System.Windows.Forms','-r:System.Drawing','-r:System.Security','-r:System.Runtime.Serialization','-r:System.Xml']
    common += ['-r:'+str(opts.uia/name) for name in ('UIAutomationClient.dll','UIAutomationTypes.dll','WindowsBase.dll')]
    source=[str(root/name) for name in ('RoomLaunch.cs','Agent.cs','PhoneWindow.cs')]
    roles=json.loads(opts.keys.read_text())
    with tempfile.TemporaryDirectory() as folder:
        dest=Path(folder);agent=dest/'WorldKaraoke.ManagerLaunch.exe'
        subprocess.run(common+['-main:Watcher','-out:'+str(agent)]+source,check=True)
        binary=agent.read_bytes()
        tokens=b''.join(roles[n]['pc'].encode('ascii') for n in '5678')
        if len(tokens)!=256:raise ValueError('Invalid receiver keys')
        raw=struct.pack('<I',1)+tokens+struct.pack('<I',len(binary))+binary
        password=getpass.getpass('Installation password: ').encode()
        if not password: raise ValueError('An installation password is required')
        salt=os.urandom(16);iv=os.urandom(16)
        key=hashlib.pbkdf2_hmac('sha256',password,salt,310000,64)
        pad=padding.PKCS7(128).padder();padded=pad.update(raw)+pad.finalize()
        enc=Cipher(algorithms.AES(key[:32]),modes.CBC(iv)).encryptor()
        data=b'P2UPD001'+salt+iv+enc.update(padded)+enc.finalize()
        resource=dest/'update.protected';resource.write_bytes(data+hmac.digest(key[32:],data,'sha256'))
        subprocess.run(common+['-r:'+str(opts.cecil),'-resource:'+str(opts.cecil)+',manager.cecil','-resource:'+str(root/'Cecil-LICENSE.txt')+',Cecil-LICENSE.txt','-main:Setup','-out:'+str(opts.output),'-resource:'+str(resource)+',update.protected']+
                       source+[str(root/'Setup.cs'),str(root/'DirectLaunchUpgrade.cs'),str(shared/'ProtectedPayload.cs'),str(shared/'InstallPasswordDialog.cs')],check=True)
if __name__=='__main__':main()
