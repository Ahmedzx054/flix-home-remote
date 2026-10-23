"""Create a private, standalone iOS build project without local data or credentials."""
import hashlib
import json
import zipfile
from pathlib import Path

TREES = ['src', 'hub', 'sshcore', 'public/licenses', 'android/app/src/main',
         'ios/App/App', 'ios/App/App.xcodeproj', 'ios/App/CapApp-SPM', '.github/workflows']
SINGLE = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'capacitor.config.ts', 'index.html',
          '.gitignore', 'README.md', 'IOS_CLOUD.md', 'android/build.gradle', 'android/app/build.gradle',
          'public/THIRD_PARTY_NOTICES.txt', 'public/manifest.webmanifest', 'public/icon.svg',
          'ios/debug.xcconfig', 'scripts/build-ios.sh', 'scripts/build-ssh.mjs',
          'scripts/build-identity.mjs', 'scripts/package-ios-unsigned.py', 'scripts/stage-ios-cloud.py',
          'tests/test_ios_distribution.py']
DENIED_PARTS = {'node_modules', 'build', 'Pods', '.build', 'public', '.data', '.vercel', '__pycache__',
                '.git', '_CodeSignature'}
DENIED_SUFFIX = {'.p12', '.p8', '.pem', '.key', '.mobileprovision', '.keystore', '.jks'}


def source_files(root: Path):
    root = root.resolve(strict=True)
    files = set()
    for tree in TREES:
        for file in (root / tree).rglob('*'):
            relative = file.relative_to(root)
            # License sources are allowlisted; generated native web assets are excluded.
            parts = relative.parts[2:] if tree == 'public/licenses' else relative.parts
            if not file.is_file() or any(p in DENIED_PARTS for p in parts):
                continue
            if file.name.startswith('.env') or file.suffix.lower() in DENIED_SUFFIX:
                continue
            if file.name in {'capacitor.config.json', 'Package.resolved'}:
                continue
            files.add(file)
    for name in SINGLE:
        file = root / name
        if not file.is_file():
            raise FileNotFoundError(name)
        files.add(file)
    for file in files:
        if file.is_symlink() or not file.resolve().is_relative_to(root):
            raise ValueError('Unexpected source symlink')
    return sorted(files)


def stage(root: Path):
    root = root.resolve(strict=True)
    files = source_files(root)
    entries = [{'path': f.relative_to(root).as_posix(), 'sha256': hashlib.sha256(f.read_bytes()).hexdigest()}
               for f in files]
    release = root / 'releases/home-remote-ios-cloud.zip'
    release.parent.mkdir(exist_ok=True)
    temporary = release.with_suffix('.zip.partial')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for file in files:
                archive.write(file, file.relative_to(root).as_posix())
            archive.writestr('CLOUD_SOURCE_MANIFEST.json', json.dumps(entries, indent=2) + '\n')
        temporary.replace(release)
    finally:
        temporary.unlink(missing_ok=True)
    evidence = {'sourceOnly': True, 'uploaded': False, 'compiledWithXcode': False, 'signedIPA': False,
                'files': len(entries), 'sha256': hashlib.sha256(release.read_bytes()).hexdigest(),
                'bytes': release.stat().st_size, 'artifact': str(release), 'entries': entries}
    (root / 'evidence').mkdir(exist_ok=True)
    (root / 'evidence/ios-cloud-source.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    return evidence


if __name__ == '__main__':
    evidence = stage(Path(__file__).resolve().parent.parent)
    print(json.dumps({k: v for k, v in evidence.items() if k != 'entries'}))
