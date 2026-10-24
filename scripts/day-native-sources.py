"""Preserve exact upstream source and real license notices, not POM labels.

This repairs provenance; source availability never marks binary reproduction true.
"""
from pathlib import Path
import hashlib, io, json, urllib.request, zipfile

ROOT = Path(__file__).resolve().parents[1]
PINS = [
    ('libadb-android', '3.1.1', 'MuntashirAkon/libadb-android',
     'c849886ebc6d48e7b46d967e78a6bb65c90c3b74', 'Apache-2.0 OR GPL-3.0-or-later'),
    ('ionfilesystem-android', '1.1.1', 'ionic-team/ion-android-filesystem',
     'ad4c23981b63fdf60627e23a94187076997fc82b', 'MIT'),
]

def main():
    folder = ROOT / 'public/licenses/native'
    folder.mkdir(parents=True, exist_ok=True)
    index, notices = [], []
    for name, version, repo, revision, expression in PINS:
        url = f'https://codeload.github.com/{repo}/zip/{revision}'
        data = urllib.request.urlopen(url, timeout=60).read()
        archive_name = f'{name}-{version}-source.zip'
        (folder / archive_name).write_bytes(data)
        archive = zipfile.ZipFile(io.BytesIO(data))
        assert archive.testzip() is None
        prefix = archive.namelist()[0].split('/')[0] + '/'
        documents = []
        for entry in archive.namelist():
            relative = entry.removeprefix(prefix)
            if entry.endswith('/') or not (relative in ('COPYING', 'LICENSE', 'NOTICE') or relative.startswith('LICENSES/')):
                continue
            text = archive.read(entry)
            # All notice bytes are preserved; no generic substitute copyright.
            notices.append(f'\n===== {name}@{version} / {relative} / {revision} =====\n' + text.decode())
            documents.append({'path': relative, 'sha256': hashlib.sha256(text).hexdigest()})
        assert documents, f'No actual upstream notices: {name}'
        index.append({'name': name, 'version': version, 'repository': f'https://github.com/{repo}',
                      'revision': revision, 'source_url': url, 'source_file': archive_name,
                      'sha256': hashlib.sha256(data).hexdigest(), 'licenses': expression,
                      'selected_alternative': 'Apache-2.0' if name == 'libadb-android' else 'MIT',
                      'documents': documents, 'binary_reproduction_verified': False})
    (folder / 'notices.txt').write_text(''.join(notices), encoding='utf-8')
    (folder / 'sources.json').write_text(json.dumps(index, indent=2)+'\n')
    print(json.dumps({'pinned_sources': len(index), 'actual_license_documents': sum(len(x['documents']) for x in index),
                      'binary_reproduction_verified': False}))

if __name__ == '__main__': main()
