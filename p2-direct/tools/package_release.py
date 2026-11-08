"""Restore the verified room directory before signing; verify the final APK.

CI APKs intentionally omit the venue's room mapping and must not be installed.
Use a previously verified venue APK as the room source. No private data is logged.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOM_ASSET = 'assets/p2-rooms.txt'
LINE = re.compile(r'([1-9][0-9]?)번(?:방)?[ \t]+(TJ_P2_[A-Za-z0-9_]+)')
LONG_NAME = re.compile(r'TJ_P2_P020([0-9]{7}_[0-9]+_B)')


def validate_rooms(data):
    text = data.decode('utf-8')
    rooms, devices = set(), set()
    for line in text.splitlines():
        line = line.replace('\ufeff', '').strip()
        if not line:
            continue
        match = LINE.fullmatch(line)
        if not match:
            raise ValueError('Invalid room mapping')
        room, device = match.groups()
        device = device.upper()
        alias = LONG_NAME.fullmatch(device)
        if alias:
            device = 'TJ_P2_' + alias[1]
        if room in rooms or device in devices:
            raise ValueError('Duplicate room mapping')
        rooms.add(room)
        devices.add(device)
    if not rooms:
        raise ValueError('Empty room mapping')
    return sorted(rooms, key=int)


def read_rooms(apk):
    with zipfile.ZipFile(apk) as archive:
        if archive.namelist().count(ROOM_ASSET) != 1:
            raise ValueError('APK must contain exactly one room directory')
        data = archive.read(ROOM_ASSET)
    validate_rooms(data)
    return data


def verify(apk, rooms_from_apk):
    expected = read_rooms(rooms_from_apk)
    actual = read_rooms(apk)
    if actual != expected:
        raise ValueError('Room directory differs from the verified venue APK')
    with zipfile.ZipFile(apk) as archive:
        if archive.testzip() is not None:
            raise ValueError('APK integrity check failed')
    return {'room_directory_verified': True,
            'room_numbers': validate_rooms(actual),
            'room_directory_sha256': hashlib.sha256(actual).hexdigest(),
            'apk_sha256': hashlib.sha256(Path(apk).read_bytes()).hexdigest()}


def prepare(input_apk, rooms_from_apk, output_apk):
    input_apk, output_apk = Path(input_apk), Path(output_apk)
    if output_apk.resolve() in (input_apk.resolve(), Path(rooms_from_apk).resolve()):
        raise ValueError('Output must not overwrite an input APK')
    expected = read_rooms(rooms_from_apk)
    with zipfile.ZipFile(input_apk) as source:
        names = source.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate APK entries')
        if ROOM_ASSET in names:
            raise ValueError('Input already has a room directory; verify it instead')
        if any(n.upper().startswith('META-INF/') and
               n.upper().endswith(('.RSA', '.DSA', '.EC', '.SF')) for n in names):
            raise ValueError('Use the unsigned CI APK, before signing')
        output_apk.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output_apk, 'x') as dest:
            for item in source.infolist():
                dest.writestr(item, source.read(item.filename))
            dest.writestr(ROOM_ASSET, expected, compress_type=zipfile.ZIP_DEFLATED)
    return verify(output_apk, rooms_from_apk)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    pack = sub.add_parser('prepare')
    pack.add_argument('--input-apk', required=True)
    pack.add_argument('--rooms-from-apk', required=True)
    pack.add_argument('--output-apk', required=True)
    check = sub.add_parser('verify')
    check.add_argument('--apk', required=True)
    check.add_argument('--rooms-from-apk', required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        result = prepare(args.input_apk, args.rooms_from_apk, args.output_apk)
    else:
        result = verify(args.apk, args.rooms_from_apk)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
