#!/usr/bin/env bash
# 웹앱(webapp/SBR_*.html) → 윈도우 데스크톱 앱 (인터넷 없이 동작)
# 사용: cd desktop && ./build_desktop.sh   (node 18+, 인터넷 1회 필요: npm 패키지·electron 내려받기)
set -e
cd "$(dirname "$0")"
npm i --no-save electron@33.2.1 @electron/packager@18.3.6 three@0.160.0 jszip@3.10.1 @mlightcad/libredwg-web@0.7.14
rm -rf app && mkdir -p app/vendor
NM=node_modules
mkdir -p app/vendor/libredwg-web/{dist,wasm} app/vendor/three/build app/vendor/three/examples/jsm/{controls,renderers,exporters} app/vendor/jszip/dist
cp $NM/@mlightcad/libredwg-web/dist/libredwg-web.js app/vendor/libredwg-web/dist/
cp $NM/@mlightcad/libredwg-web/wasm/libredwg-web.{js,wasm} app/vendor/libredwg-web/wasm/
cp $NM/three/build/three.module.js app/vendor/three/build/
cp $NM/three/examples/jsm/controls/OrbitControls.js app/vendor/three/examples/jsm/controls/
cp $NM/three/examples/jsm/renderers/CSS2DRenderer.js app/vendor/three/examples/jsm/renderers/
cp $NM/three/examples/jsm/exporters/GLTFExporter.js app/vendor/three/examples/jsm/exporters/
cp $NM/jszip/dist/jszip.min.js app/vendor/jszip/dist/
SRC=$(ls -t ../webapp/SBR_*.html | head -1)
sed -e 's#https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.14/#./vendor/libredwg-web/#g' \
    -e 's#https://cdn.jsdelivr.net/npm/three@0.160.0/#./vendor/three/#g' \
    -e 's#https://cdn.jsdelivr.net/npm/jszip@3.10.1/#./vendor/jszip/#g' "$SRC" > app/index.html
grep -q "cdn.jsdelivr" app/index.html && { echo "CDN 주소가 남아 있음"; exit 1; }
npx electron-packager . SBR-Design-Review --platform=win32 --arch=x64 --out=dist --overwrite --asar \
  --ignore="^/dist($|/)" --ignore="^/node_modules($|/)" --ignore="^/build_desktop\.sh$"
find dist -path "*locales/*.pak" ! -name "ko.pak" ! -name "en-US.pak" -delete
echo "완료: dist/SBR-Design-Review-win32-x64"
