"""Build Espressif's compact CA format from Mozilla roots supplied by certifi.

Format: https://github.com/espressif/arduino-esp32/blob/2.0.17/tools/gen_crt_bundle.py
No insecure TLS fallback. Generated data is not a private key.
"""
import re
import struct
from pathlib import Path
import certifi
from cryptography import x509
from cryptography.hazmat.primitives import serialization

def generate(destination):
    pem=Path(certifi.where()).read_bytes()
    certs=[x509.load_pem_x509_certificate(b) for b in re.findall(
        rb"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",pem,re.S)]
    rows=sorted((c.subject.public_bytes(),c.public_key().public_bytes(
        serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)) for c in certs)
    bundle=struct.pack('>H',len(rows))+b''.join(struct.pack('>HH',len(n),len(k))+n+k for n,k in rows)
    text='#pragma once\n#include <Arduino.h>\nstatic const uint8_t kCaBundle[] PROGMEM = {\n'
    text+='\n'.join(','.join(str(n) for n in bundle[i:i+32])+',' for i in range(0,len(bundle),32))+'\n};\n'
    destination.write_text(text)

try:
    Import('env')  # provided by PlatformIO/SCons
    root=Path(env['PROJECT_DIR'])
except NameError:
    root=Path(__file__).resolve().parent
generate(root/'include'/'ca_bundle.generated.h')
