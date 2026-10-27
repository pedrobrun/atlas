#!/usr/bin/env bash
# Assembles the landing page in site/out/: the page, the images, and the
# procurement example's map as demo.html.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

node src/build.ts examples/procurement
rm -rf site/out
mkdir -p site/out/assets
cp site/index.html site/out/
cp assets/logo.svg assets/demo-root.jpg assets/demo-details.jpg assets/demo-ask.jpg site/out/assets/
cp examples/procurement/.atlas/out/atlas.html site/out/demo.html
echo "site: site/out/"
