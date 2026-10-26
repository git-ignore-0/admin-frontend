#!/usr/bin/env bash

set -euo pipefail

readonly test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT

cp "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/prepare-cpanel-deploy.sh" \
  "${test_root}/prepare-cpanel-deploy.sh"

# shellcheck source=/dev/null
source "${test_root}/prepare-cpanel-deploy.sh"

make_sharp_package() {
  local fixture_root="$1"
  local package_name="$2"

  mkdir -p "${fixture_root}/node_modules/@img/${package_name}"
  printf '{}\n' >"${fixture_root}/node_modules/@img/${package_name}/package.json"
}

assert_allowed() {
  local fixture_root="$1"

  if ! validate_sharp_platform_packages "${fixture_root}/node_modules"; then
    echo "Expected Linux x64 Sharp packages to pass validation." >&2
    exit 1
  fi
}

assert_rejected() {
  local package_name="$1"
  local fixture_root="${test_root}/${package_name}"

  make_sharp_package "${fixture_root}" "${package_name}"
  if validate_sharp_platform_packages "${fixture_root}/node_modules"; then
    echo "Expected ${package_name} to fail validation." >&2
    exit 1
  fi
}

readonly allowed_root="${test_root}/allowed"
make_sharp_package "${allowed_root}" "sharp-linux-x64"
make_sharp_package "${allowed_root}" "sharp-linuxmusl-x64"
make_sharp_package "${allowed_root}" "sharp-libvips-linux-x64"
make_sharp_package "${allowed_root}" "sharp-libvips-linuxmusl-x64"
assert_allowed "${allowed_root}"

assert_rejected "sharp-darwin-x64"
assert_rejected "sharp-win32-x64"
assert_rejected "sharp-linux-arm64"
assert_rejected "sharp-wasm32"

readonly source_without_public="${test_root}/source-without-public"
readonly deploy_without_public="${test_root}/deploy-without-public"
mkdir -p "${source_without_public}" "${deploy_without_public}"
copy_public_assets "${source_without_public}" "${deploy_without_public}"
if [[ ! -d "${deploy_without_public}/public" ]]; then
  echo "Expected an empty public directory when the clean source has no public assets." >&2
  exit 1
fi

echo "Sharp platform package validation passed."
