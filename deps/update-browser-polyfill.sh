#!/bin/sh
# Regenerate the vendored `deps/browser-polyfill.js` from the pinned
# `deps/webextension-polyfill` submodule.
#
# The upstream repository does not commit its build output, so (exactly like
# the original project does for its BrowsCap bundle) the single distribution
# file is committed here instead. Run this script when the submodule pin is
# updated.
set -eu

cd "$(dirname "$(readlink -f "${0}")")"

echo "Building webextension-polyfill…"
cd webextension-polyfill
npm install
npm run build
cd ..

echo "Copying distribution file…"
cp webextension-polyfill/dist/browser-polyfill.js browser-polyfill.js
echo "Done: deps/browser-polyfill.js"
