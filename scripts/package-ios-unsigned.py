"""Package an Xcode-built device app for user signing. Never represents a signed IPA."""
import hashlib
import json
import plistlib
import struct
import sys
import zipfile
from pathlib import Path


def package(app: Path, output: Path):
    app = app.resolve(strict=True)
    if not app.is_dir() or app.suffix != '.app':
        raise ValueError('An Xcode-built .app directory is required')
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    executable = info.get('CFBundleExecutable', '')
    if not executable or Path(executable).name != executable:
        raise ValueError('Invalid app executable')
    binary = app / executable
    with binary.open('rb') as source:
        header = source.read(32)
        # iOS simulators can also be ARM64; inspect the binary platform, not only Info.plist.
        if len(header) < 32:
            raise ValueError('Expected an arm64 Mach-O device executable')
        magic, cpu, _, kind, count, size, _, _ = struct.unpack('<IIIIIIII', header)
        if (magic, cpu, kind) != (0xFEEDFACF, 0x0100000C, 2):
            raise ValueError('Expected an arm64 Mach-O device executable')
        if not 0 < count <= 4096 or not 24 <= size <= 1024 * 1024:
            raise ValueError('Invalid Mach-O load command bounds')
        commands = source.read(size)
    if len(commands) != size:
        raise ValueError('Truncated Mach-O load commands')
    offset = 0
    platforms = []
    for _ in range(count):
        if offset + 8 > size:
            raise ValueError('Truncated Mach-O load command')
        command, length = struct.unpack_from('<II', commands, offset)
        if length < 8 or length % 8 or offset + length > size:
            raise ValueError('Invalid Mach-O load command length')
        if command == 0x32:  # LC_BUILD_VERSION: platform 2 is iOS, 7 is iOS Simulator.
            if length < 24:
                raise ValueError('Truncated platform load command')
            platforms.append(struct.unpack_from('<I', commands, offset + 8)[0])
        offset += length
    if offset != size or platforms != [2]:
        raise ValueError('Expected an iOS device platform in the executable')
    if info.get('DTPlatformName') != 'iphoneos' or 'iPhoneOS' not in info.get('CFBundleSupportedPlatforms', []):
        raise ValueError('Simulator apps cannot be packaged as installable device apps')
    if info.get('CFBundleIdentifier') != 'com.flix.homeremote':
        raise ValueError('Unexpected bundle identifier')
    files = sorted(p for p in app.rglob('*') if p.is_file())
    for file in files:
        if file.is_symlink() or not file.resolve().is_relative_to(app):
            raise ValueError('Symlinks are not supported in the device app')
        if '_CodeSignature' in file.parts or file.name == 'embedded.mobileprovision':
            raise ValueError('Unsigned package must not contain a signing profile or stale signatures')
    output = output.resolve()
    if output.is_relative_to(app):
        raise ValueError('Output must be outside the app directory')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.ipa.partial')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for file in files:
                archive.write(file, 'Payload/' + app.name + '/' + file.relative_to(app).as_posix())
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    result = {'compiledWithXcode': True, 'simulator': False, 'signedIPA': False,
              'requiresUserSigning': True, 'physicalPhone': False, 'multicastEntitlement': False,
              'bundleId': info['CFBundleIdentifier'], 'version': info.get('CFBundleShortVersionString'),
              'build': info.get('CFBundleVersion'), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
              'bytes': output.stat().st_size}
    (output.parent / 'ios-build.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    return result


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: package-ios-unsigned.py App.app HomeRemote-unsigned.ipa')
    print(json.dumps(package(Path(sys.argv[1]), Path(sys.argv[2]))))
