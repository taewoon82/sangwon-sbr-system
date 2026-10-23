# 업데이트 파일 만들기: python3 make_update.py 12.0.1 "변경 내용" [--with-vendor]
# → dist/SBR설계검토_업데이트_v12.0.1.zip  (manifest.json + index.html [+ vendor/])
import sys, json, hashlib, zipfile, os
ver, notes = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ''
here = os.path.dirname(os.path.abspath(__file__))
idx = open(os.path.join(here, 'app', 'index.html'), 'rb').read()
m = {"app": "sbr-design-review", "version": ver, "notes": notes, "sha256": {"index": hashlib.sha256(idx).hexdigest()}}
os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
out = os.path.join(here, 'dist', f'SBR설계검토_업데이트_v{ver}.zip')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json', json.dumps(m, ensure_ascii=False, indent=2))
    z.writestr('index.html', idx)
    if '--with-vendor' in sys.argv:
        for root, _, files in os.walk(os.path.join(here, 'app', 'vendor')):
            for f in files:
                p = os.path.join(root, f); z.write(p, os.path.relpath(p, os.path.join(here, 'app')))
print(out, os.path.getsize(out))
