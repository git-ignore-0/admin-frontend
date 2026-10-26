#!/usr/bin/env bash

set -euo pipefail

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly archive_path="${project_root}/cpanel-deploy-passenger.zip"
work_root=""
pending_archive=""

cleanup() {
  if [[ -n "${work_root}" && -d "${work_root}" ]]; then
    rm -rf -- "${work_root}"
  fi

  if [[ -n "${pending_archive}" && -f "${pending_archive}" ]]; then
    rm -f -- "${pending_archive}"
  fi
}

validate_sharp_platform_packages() {
  local node_modules_dir="$1"
  local package_manifest
  local package_name
  local invalid_package_found=0

  if [[ ! -d "${node_modules_dir}" ]]; then
    echo "Missing node_modules directory: ${node_modules_dir}" >&2
    return 1
  fi

  while IFS= read -r package_manifest; do
    package_name="$(basename "$(dirname "${package_manifest}")")"
    case "${package_name}" in
      sharp-linux-x64 | sharp-linuxmusl-x64 | sharp-libvips-linux-x64 | sharp-libvips-linuxmusl-x64)
        ;;
      *)
        echo "Unsupported Sharp platform package: @img/${package_name}" >&2
        invalid_package_found=1
        ;;
    esac
  done < <(
    find -L "${node_modules_dir}" \
      -path '*/node_modules/@img/sharp-*/package.json' \
      -type f \
      -print
  )

  [[ "${invalid_package_found}" -eq 0 ]]
}

materialize_package() {
  local deploy_dir="$1"
  local package_name="$2"
  local target="${deploy_dir}/node_modules/${package_name}"
  local source

  if [[ -e "${target}" ]]; then
    return
  fi

  source="$(
    find "${deploy_dir}/node_modules/.pnpm" \
      -path "*/node_modules/${package_name}/package.json" \
      -print \
      -quit
  )"
  if [[ -z "${source}" ]]; then
    echo "Missing package ${package_name} in standalone bundle." >&2
    return 1
  fi

  mkdir -p "$(dirname "${target}")"
  cp -aL "$(dirname "${source}")" "${target}"
}

copy_public_assets() {
  local source_dir="$1"
  local deploy_dir="$2"

  if [[ -d "${source_dir}/public" ]]; then
    cp -a "${source_dir}/public" "${deploy_dir}/public"
  else
    mkdir -p "${deploy_dir}/public"
  fi
}

validate_archive() {
  local candidate_archive="$1"
  local archive_listing="$2"
  local required_entry

  unzip -tqq "${candidate_archive}"
  unzip -Z1 "${candidate_archive}" >"${archive_listing}"

  for required_entry in server.js package.json; do
    if ! grep -Fxq "${required_entry}" "${archive_listing}"; then
      echo "Deployment archive is missing ${required_entry}." >&2
      return 1
    fi
  done

  for required_entry in '.next/' 'node_modules/'; do
    if ! grep -q "^${required_entry}" "${archive_listing}"; then
      echo "Deployment archive is missing ${required_entry}." >&2
      return 1
    fi
  done

  if grep -Eq '(^|/)\.env($|\.)|(^|/)\.git(/|$)|(^|/)[^/]+\.(tar|tar\.gz|tar\.bz2|tar\.xz|tgz)$' "${archive_listing}"; then
    echo "Deployment archive contains an environment file, Git metadata, or a source tarball." >&2
    return 1
  fi

  if grep -Eq '^(app|components|lib|tests)/|^node_modules/\.cache/' "${archive_listing}"; then
    echo "Deployment archive contains source files or build-only dependency caches." >&2
    return 1
  fi
}

main() {
  local source_dir
  local deploy_dir
  local candidate_archive
  local archive_listing
  local pnpm_version

  trap cleanup EXIT
  work_root="$(mktemp -d "${TMPDIR:-/tmp}/nfv-admin-cpanel.XXXXXX")"
  source_dir="${work_root}/source"
  deploy_dir="${work_root}/deploy"
  candidate_archive="${work_root}/cpanel-deploy-passenger.zip"
  archive_listing="${work_root}/archive-listing.txt"

  mkdir -p "${source_dir}"
  echo "Creating a clean source checkout from HEAD..."
  git -C "${project_root}" archive HEAD -- . | tar -x -C "${source_dir}"

  if [[ -f "${project_root}/.env.local" ]]; then
    cp "${project_root}/.env.local" "${source_dir}/.env.local"
  fi

  pnpm_version="$(pnpm --version)"
  if [[ "${pnpm_version}" != "9.15.9" ]]; then
    echo "pnpm 9.15.9 is required; found ${pnpm_version}." >&2
    return 1
  fi

  echo "Installing dependencies with pnpm 9.15.9..."
  (
    cd "${source_dir}"
    pnpm install --frozen-lockfile
  )
  validate_sharp_platform_packages "${source_dir}/node_modules"

  echo "Building the standalone Next.js admin application..."
  (
    cd "${source_dir}"
    pnpm build
  )

  if [[ ! -f "${source_dir}/.next/standalone/server.js" ]]; then
    echo "Missing .next/standalone/server.js; check output: standalone in next.config.ts." >&2
    return 1
  fi

  rm -f -- "${source_dir}/.env.local"
  mkdir -p "${deploy_dir}/.next"

  # Dereference pnpm symlinks so cPanel/LiteSpeed receives real package folders.
  cp -aL "${source_dir}/.next/standalone/." "${deploy_dir}/"
  cp -a "${source_dir}/.next/static" "${deploy_dir}/.next/static"
  copy_public_assets "${source_dir}" "${deploy_dir}"

  materialize_package "${deploy_dir}" "@next/env"
  materialize_package "${deploy_dir}" "@swc/helpers"
  materialize_package "${deploy_dir}" "caniuse-lite"
  materialize_package "${deploy_dir}" "postcss"
  materialize_package "${deploy_dir}" "styled-jsx"

  validate_sharp_platform_packages "${deploy_dir}/node_modules"

  echo "Creating and validating the cPanel Passenger bundle..."
  (
    cd "${deploy_dir}"
    zip -qr "${candidate_archive}" .
  )
  validate_archive "${candidate_archive}" "${archive_listing}"

  pending_archive="${archive_path}.tmp.$$"
  cp "${candidate_archive}" "${pending_archive}"
  mv -f -- "${pending_archive}" "${archive_path}"
  pending_archive=""
  echo "Created ${archive_path}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
