#!/usr/bin/env bash
set -euo pipefail

: "${TEST_FTP_SERVER:?Missing TEST_FTP_SERVER}"
: "${TEST_FTP_USERNAME:?Missing TEST_FTP_USERNAME}"
: "${TEST_FTP_PASSWORD:?Missing TEST_FTP_PASSWORD}"

# These credentials must be jailed to the Admin TEST application root.
if [[ "$TEST_FTP_SERVER" != "ftp.forvietnam.org" ||
  "$TEST_FTP_USERNAME" != "deploy_admin_test@forvietnam.org" ]]; then
  echo 'Expected the dedicated Admin test FTPS account.' >&2
  exit 1
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy_work_root="$(mktemp -d)"
trap 'rm -rf -- "$deploy_work_root"' EXIT
unzip -q "$project_root/cpanel-deploy-passenger.zip" -d "$deploy_work_root/bundle"
test -f "$deploy_work_root/bundle/server.js"
test -d "$deploy_work_root/bundle/.next/static"
test -d "$deploy_work_root/bundle/node_modules"

# Never upload hosting configuration, source archives or symlinks.
if find "$deploy_work_root/bundle" \( -name '.env*' -o -name '.htaccess' -o -name '*.zip' -o -type l \) -print -quit | grep -q .; then
  echo 'Unexpected hosting configuration, archive or symlink in bundle.' >&2
  exit 1
fi

printf '%s\n' "${GITHUB_SHA:-manual}-$(date -u +%s)" >"$deploy_work_root/restart.txt"
cd "$deploy_work_root"

# Explicit FTPS on port 21. Certificate and hostname checks stay enabled.
# No --delete: retain hosting config and previous static chunks.
# Upload server.js and restart.txt only after all other files succeed.
LFTP_PASSWORD="$TEST_FTP_PASSWORD" lftp --norc \
  --env-password --user "$TEST_FTP_USERNAME" -p 21 \
  "ftp://$TEST_FTP_SERVER" <<'LFTP'
set cmd:fail-exit yes
set ftp:ssl-force yes
set ftp:ssl-protect-data yes
set ssl:verify-certificate yes
set ssl:check-hostname yes
set net:timeout 30
set net:max-retries 2
set net:reconnect-interval-base 5
cd /
# Verify the account points at an already configured Passenger app.
cls -d .env.local
cls -d .htaccess
cls -d server.js
mirror --reverse --parallel=2 --no-perms --transfer-all --exclude-glob server.js bundle/ ./
put bundle/server.js -o server.js
mkdir -p tmp
put restart.txt -o tmp/restart.txt
bye
LFTP
