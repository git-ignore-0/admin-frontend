#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
mkdir -p "$test_root/project/scripts" "$test_root/bundle/.next/static" "$test_root/bundle/node_modules" "$test_root/bin"
cp "$project_root/scripts/deploy-test-ftps.sh" "$test_root/project/scripts/"
printf 'server\n' >"$test_root/bundle/server.js"
printf 'asset\n' >"$test_root/bundle/.next/static/test.js"
(
  cd "$test_root/bundle"
  zip -qr "$test_root/project/cpanel-deploy-passenger.zip" .
)
cat >"$test_root/bin/lftp" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
test "$LFTP_PASSWORD" = 'secret with spaces $ and quotes'
printf '%s\n' "$@" >"$TEST_OUTPUT/arguments"
cat >"$TEST_OUTPUT/commands"
MOCK
chmod +x "$test_root/bin/lftp"
export PATH="$test_root/bin:$PATH"
export TEST_OUTPUT="$test_root"
export TEST_FTP_SERVER=epsilon.kc.epik.com
export TEST_FTP_USERNAME=deploy_admin_test@forvietnam.org
export TEST_FTP_PASSWORD='secret with spaces $ and quotes'
bash "$test_root/project/scripts/deploy-test-ftps.sh"
grep -q 'set ftp:ssl-force yes' "$test_root/commands"
grep -q 'set ftp:ssl-protect-data yes' "$test_root/commands"
grep -q 'set ssl:verify-certificate yes' "$test_root/commands"
grep -q 'set ssl:check-hostname yes' "$test_root/commands"
grep -qF 'ftp://epsilon.kc.epik.com' "$test_root/arguments"
test "$(tail -2 "$test_root/commands" | head -1)" = 'put restart.txt -o tmp/restart.txt'
! grep -q -- '--delete' "$test_root/commands"
! grep -qF "$TEST_FTP_PASSWORD" "$test_root/arguments"

rm "$test_root/commands"
if TEST_FTP_USERNAME=production bash "$test_root/project/scripts/deploy-test-ftps.sh" 2>/dev/null; then
  echo 'Expected non-test credentials to be rejected.' >&2
  exit 1
fi
test ! -f "$test_root/commands"

printf 'do not upload\n' >"$test_root/bundle/.env.local"
(
  cd "$test_root/bundle"
  zip -qr "$test_root/project/cpanel-deploy-passenger.zip" .
)
if bash "$test_root/project/scripts/deploy-test-ftps.sh" 2>/dev/null; then
  echo 'Expected bundled secrets to be rejected.' >&2
  exit 1
fi
test ! -f "$test_root/commands"
echo 'Admin FTPS deployment checks passed.'
