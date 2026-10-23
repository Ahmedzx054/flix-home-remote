"""Synthetic distribution checks, never Xcode or physical-phone acceptance."""
import hashlib
import importlib.util
import json
import plistlib
import re
import struct
import tempfile
import unittest
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


packager = load_script('package-ios-unsigned')
stager = load_script('stage-ios-cloud')


class DevicePackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='flix-ios-distribution-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = self.root / 'App.app'
        self.app.mkdir()
        self.info = {'CFBundleExecutable': 'App', 'CFBundleIdentifier': 'com.flix.homeremote',
                     'CFBundleShortVersionString': '0.4.0', 'CFBundleVersion': '5',
                     'DTPlatformName': 'iphoneos', 'CFBundleSupportedPlatforms': ['iPhoneOS']}
        self.write_info()
        self.write_binary()
        (self.app / 'public').mkdir()
        (self.app / 'public/index.html').write_text('Synthetic UI fixture', encoding='utf-8')
        self.output = self.root / 'release/HomeRemote-unsigned.ipa'

    def write_info(self):
        (self.app / 'Info.plist').write_bytes(plistlib.dumps(self.info))

    def write_binary(self, platform=2, cpu=0x0100000C):
        command = struct.pack('<IIIIII', 0x32, 24, platform, 0x110000, 0x1B0000, 0)
        header = struct.pack('<IIIIIIII', 0xFEEDFACF, cpu, 0, 2, 1, len(command), 0, 0)
        (self.app / 'App').write_bytes(header + command)

    def test_packages_payload_and_records_unsigned_boundary(self):
        result = packager.package(self.app, self.output)
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(set(archive.namelist()), {'Payload/App.app/App', 'Payload/App.app/Info.plist',
                                                     'Payload/App.app/public/index.html'})
            self.assertIsNone(archive.testzip())
        self.assertFalse(result['signedIPA'])
        self.assertTrue(result['requiresUserSigning'])
        self.assertFalse(result['physicalPhone'])
        self.assertFalse(result['multicastEntitlement'])
        self.assertEqual(json.loads((self.output.parent / 'ios-build.json').read_text())['sha256'], result['sha256'])

    def test_rejects_arm64_simulator_even_with_device_plist(self):
        self.write_binary(platform=7)
        with self.assertRaisesRegex(ValueError, 'device platform'):
            packager.package(self.app, self.output)
        self.assertFalse(self.output.exists())

    def test_rejects_x86_and_truncated_commands(self):
        self.write_binary(cpu=0x01000007)
        with self.assertRaisesRegex(ValueError, 'arm64'):
            packager.package(self.app, self.output)
        self.write_binary()
        (self.app / 'App').write_bytes((self.app / 'App').read_bytes()[:40])
        with self.assertRaisesRegex(ValueError, 'Truncated'):
            packager.package(self.app, self.output)

    def test_rejects_simulator_plist_and_unexpected_bundle(self):
        for key, value, message in [('DTPlatformName', 'iphonesimulator', 'Simulator'),
                                    ('CFBundleIdentifier', 'example.other', 'bundle')]:
            previous = self.info[key]
            self.info[key] = value
            self.write_info()
            with self.assertRaisesRegex(ValueError, message):
                packager.package(self.app, self.output)
            self.info[key] = previous

    def test_rejects_embedded_profile_and_stale_signature(self):
        for name in ['embedded.mobileprovision', '_CodeSignature/CodeResources']:
            file = self.app / name
            file.parent.mkdir(exist_ok=True)
            file.write_text('synthetic signing data')
            with self.assertRaisesRegex(ValueError, 'signing profile|stale signatures'):
                packager.package(self.app, self.output)
            file.unlink()

    def test_rejects_executable_escape_and_output_inside_app(self):
        self.info['CFBundleExecutable'] = '../outside'
        self.write_info()
        with self.assertRaisesRegex(ValueError, 'executable'):
            packager.package(self.app, self.output)
        self.info['CFBundleExecutable'] = 'App'
        self.write_info()
        with self.assertRaisesRegex(ValueError, 'outside'):
            packager.package(self.app, self.app / 'bad.ipa')


class SourceBundleTests(unittest.TestCase):
    def test_build_inputs_staged_without_credentials_or_local_data(self):
        with tempfile.TemporaryDirectory(prefix='flix-ios-source-') as folder:
            root = Path(folder)
            for name in stager.SINGLE + ['src/main.ts', 'ios/App/App/HomeDiscoveryPlugin.swift']:
                file = root / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('synthetic build input: ' + name, encoding='utf-8')
            excluded = ['.env', 'src/.env.production', 'ios/App/App/team.p12',
                        'ios/App/App/key.p8', 'ios/App/App/embedded.mobileprovision',
                        'ios/App/App/public/session.json', '.data/customer.json',
                        'src/node_modules/secret.js', 'ios/App/CapApp-SPM/.build/cache.txt']
            for name in excluded:
                file = root / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('MUST_NOT_UPLOAD', encoding='utf-8')
            result = stager.stage(root)
            with zipfile.ZipFile(result['artifact']) as archive:
                self.assertTrue(set(stager.SINGLE).issubset(archive.namelist()))
                self.assertFalse(set(excluded).intersection(archive.namelist()))
                self.assertTrue(all(b'MUST_NOT_UPLOAD' not in archive.read(n) for n in archive.namelist()))
                for entry in json.loads(archive.read('CLOUD_SOURCE_MANIFEST.json')):
                    self.assertEqual(hashlib.sha256(archive.read(entry['path'])).hexdigest(), entry['sha256'])
            self.assertFalse(result['uploaded'])
            self.assertFalse(result['compiledWithXcode'])


class NativeBridgeWiringTests(unittest.TestCase):
    def test_both_ios_startup_paths_register_the_direct_phone_plugins(self):
        app = ROOT / 'ios/App/App'
        info = plistlib.loads((app / 'Info.plist').read_bytes())
        config = info['UIApplicationSceneManifest']['UISceneConfigurations']['UIWindowSceneSessionRoleApplication'][0]
        self.assertTrue(config['UISceneDelegateClassName'].endswith('.SceneDelegate'))
        delegate = (app / 'SceneDelegate.swift').read_text(encoding='utf-8')
        controller = re.search(r'rootViewController\s*=\s*(\w+)\(', delegate).group(1)
        storyboard = ET.parse(app / 'Base.lproj' / (config['UISceneStoryboardFile'] + '.storyboard'))
        initial = storyboard.getroot().get('initialViewController')
        self.assertEqual(storyboard.find(f'.//viewController[@id="{initial}"]').get('customClass'), controller)
        plugins = (app / 'HomeDiscoveryPlugin.swift').read_text(encoding='utf-8')
        startup = re.search(r'class\s+' + re.escape(controller) + r'\s*:\s*CAPBridgeViewController\s*\{(.*?)\n\}',
                            plugins, re.S).group(1)
        self.assertIn('override func capacitorDidLoad()', startup)
        for name in ['HomeDiscoveryPlugin', 'DirectLanPlugin', 'DirectAdbPlugin']:
            self.assertIn(f'registerPluginInstance({name}())', startup)


if __name__ == '__main__':
    unittest.main()
