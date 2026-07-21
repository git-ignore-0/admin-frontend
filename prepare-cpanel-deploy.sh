#!/usr/bin/env bash

set -euo pipefail

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly deploy_dir="${project_root}/cpanel-deploy"
readonly archive_path="${project_root}/cpanel-deploy-passenger.zip"

cd "${project_root}"

echo "Building the standalone Next.js admin application..."
pnpm build

if [[ ! -f .next/standalone/server.js ]]; then
  echo "Missing .next/standalone/server.js; check output: standalone in next.config.ts." >&2
  exit 1
fi

echo "Preparing the cPanel Passenger bundle..."
rm -rf "${deploy_dir}" "${archive_path}"
mkdir -p "${deploy_dir}/.next"

# Dereference pnpm symlinks so cPanel/LiteSpeed receives real package folders.
cp -aL .next/standalone/. "${deploy_dir}/"
cp -a .next/static "${deploy_dir}/.next/static"
cp -a public "${deploy_dir}/public"

materialize_package() {
  local package_name="$1"
  local target="${deploy_dir}/node_modules/${package_name}"
  local source

  if [[ -e "${target}" ]]; then
    return
  fi

  source="$(find "${deploy_dir}/node_modules/.pnpm" -path "*/node_modules/${package_name}/package.json" -print -quit)"
  if [[ -z "${source}" ]]; then
    echo "Missing package ${package_name} in standalone bundle." >&2
    exit 1
  fi

  mkdir -p "$(dirname "${target}")"
  cp -aL "$(dirname "${source}")" "${target}"
}

materialize_package "@next/env"
materialize_package "@swc/helpers"
materialize_package "caniuse-lite"
materialize_package "postcss"
materialize_package "styled-jsx"

(
  cd "${deploy_dir}"
  zip -qr "${archive_path}" .
)

echo "Created ${archive_path}"
