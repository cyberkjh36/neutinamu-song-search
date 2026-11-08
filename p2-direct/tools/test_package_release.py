import tempfile
import unittest
from pathlib import Path
import zipfile
from package_release import ROOM_ASSET, prepare, verify, validate_rooms


class PackagingRegressionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.rooms = '1번 TJ_P2_TEST_ONE_1_B\n8번방 TJ_P2_P0207654321_7_B\n'.encode()
        self.previous = self.apk('previous.apk', {ROOM_ASSET: self.rooms})
        self.ci = self.apk('ci.apk', {'classes.dex': b'code', 'assets/catalog.csv': b'catalog'})

    def apk(self, name, entries):
        path = self.root / name
        with zipfile.ZipFile(path, 'w') as archive:
            for name, data in entries.items():
                archive.writestr(name, data)
        return path

    def test_rejects_missing_directory_in_final_apk(self):
        # Regression: 0.11.10 was signed directly from the room-less CI artifact.
        with self.assertRaises(ValueError):
            verify(self.ci, self.previous)

    def test_restores_exact_room_data_and_preserves_every_other_entry(self):
        output = self.root / 'ready.apk'
        result = prepare(self.ci, self.previous, output)
        self.assertEqual(['1', '8'], result['room_numbers'])
        with zipfile.ZipFile(self.ci) as original, zipfile.ZipFile(output) as ready:
            self.assertEqual(set(original.namelist()) | {ROOM_ASSET}, set(ready.namelist()))
            for name in original.namelist():
                self.assertEqual(original.read(name), ready.read(name))
            self.assertEqual(self.rooms, ready.read(ROOM_ASSET))

    def test_rejects_missing_previous_directory(self):
        with self.assertRaises(ValueError):
            prepare(self.ci, self.ci, self.root / 'bad.apk')

    def test_rejects_empty_invalid_or_duplicate_room_mapping(self):
        for data in [b'', b'\n', b'8 invalid', b'\xff',
                     '1번 TJ_P2_SAME\n8번 TJ_P2_SAME'.encode(),
                     '1번 TJ_P2_ONE\n1번 TJ_P2_TWO'.encode(),
                     '1번 TJ_P2_P0207654321_7_B\n8번 TJ_P2_7654321_7_B'.encode()]:
            with self.subTest(data=data), self.assertRaises((ValueError, UnicodeError)):
                validate_rooms(data)

    def test_rejects_replacement_or_partial_mapping(self):
        other = self.apk('other.apk', {ROOM_ASSET: '8번 TJ_P2_OTHER'.encode()})
        with self.assertRaises(ValueError):
            verify(other, self.previous)

    def test_rejects_duplicate_room_asset(self):
        import warnings
        other = self.apk('duplicate.apk', {ROOM_ASSET: self.rooms})
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(other, 'a') as archive:
                archive.writestr(ROOM_ASSET, self.rooms)
        with self.assertRaises(ValueError):
            verify(other, self.previous)

    def test_does_not_overwrite_source_or_existing_output(self):
        before = self.ci.read_bytes()
        with self.assertRaises(ValueError):
            prepare(self.ci, self.previous, self.ci)
        output = self.root / 'existing.apk'
        output.write_bytes(b'keep')
        with self.assertRaises(FileExistsError):
            prepare(self.ci, self.previous, output)
        self.assertEqual(before, self.ci.read_bytes())
        self.assertEqual(b'keep', output.read_bytes())

    def test_rejects_already_packaged_or_signed_input(self):
        with self.assertRaises(ValueError):
            prepare(self.previous, self.previous, self.root / 'bad.apk')
        signed = self.apk('signed.apk', {'META-INF/CERT.RSA': b'signature'})
        with self.assertRaises(ValueError):
            prepare(signed, self.previous, self.root / 'bad.apk')


if __name__ == '__main__':
    unittest.main()
