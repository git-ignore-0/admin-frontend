#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
mkdir -p "$test_root/bin"

cat >"$test_root/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
while (( $# )); do
  case "$1" in
    --output) output="$2"; shift ;;
    --write-out) write_out="$2"; shift ;;
    --max-time) timeout="$2"; shift ;;
    --location|-L) follow_redirects=true ;;
    --retry|--retry-delay) shift ;;
    https://*) url="$1" ;;
  esac
  shift
done
[[ "$url" == https://admin-test.naturalfarmingvietnam.com/login && "$timeout" == 30 ]]
printf '%s\n' "$url" >>"$SMOKE_TEST_FIXTURES/calls"
call="$(wc -l <"$SMOKE_TEST_FIXTURES/calls")"
fixture="$(sed -n "${call}p" "$SMOKE_TEST_FIXTURES/responses")"
[[ -n "$fixture" ]] || exit 99
IFS='|' read -r status content_type redirect body <<<"$fixture"
if [[ "$status" == timeout ]]; then
  exit 28
fi
if [[ "${follow_redirects:-false}" == true && -n "$redirect" ]]; then
  status=200
  redirect=''
fi
printf '%s\n' "$body" >"$output"
if [[ -n "${write_out:-}" ]]; then
  printf '%s\n%s\n%s\n' "$status" "$content_type" "$redirect"
fi
MOCK

cat >"$test_root/bin/sleep" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >>"$SMOKE_TEST_FIXTURES/sleeps"
MOCK
chmod +x "$test_root/bin/curl" "$test_root/bin/sleep"
export PATH="$test_root/bin:$PATH"
export RUNNER_TEMP="$test_root"
export SMOKE_TEST_FIXTURES="$test_root"

reset_probe() {
  : >"$test_root/calls"
  : >"$test_root/sleeps"
}

run_smoke() {
  bash -e "${SMOKE_SCRIPT_UNDER_TEST:-$project_root/scripts/smoke-test.sh}" >"$test_root/smoke.log" 2>&1
}

assert_probes() {
  [[ "$(wc -l <"$test_root/calls")" -eq "$1" ]]
  [[ "$(wc -l <"$test_root/sleeps")" -eq "$(( $1 - 1 ))" ]]
  if grep -vxq '10' "$test_root/sleeps"; then
    echo 'Unexpected retry delay.' >&2
    exit 1
  fi
}

placeholder='200|text/html; charset=utf-8||<title>Starting</title>'
login='200|text/html; charset=utf-8||<script src="/_next/static/login.js"></script>'
redirect='302|text/html|https://example.test/login|<script src="/_next/static/other.js"></script>'

reset_probe
cat >"$test_root/responses" <<EOF
$placeholder
$redirect
200|text/plain||/_next/static/login.js
503|text/html||/_next/static/login.js
timeout
$login
EOF
if ! run_smoke; then
  echo 'Expected retries after placeholder HTML and unexpected responses until /login is ready.' >&2
  cat "$test_root/smoke.log" >&2
  exit 1
fi
assert_probes 6
grep -Fq 'Next.js asset marker=missing' "$test_root/smoke.log"
grep -Fq 'HTTP 302' "$test_root/smoke.log"
grep -Fq 'https://example.test/login' "$test_root/smoke.log"
grep -Fq 'text/plain' "$test_root/smoke.log"
grep -Fq 'HTTP 503' "$test_root/smoke.log"
grep -Fq 'curl exited with code 28' "$test_root/smoke.log"
echo 'Admin retries the full login readiness check.'

reset_probe
printf '%s\n' "$login" >"$test_root/responses"
run_smoke
assert_probes 1
grep -Fq 'is ready (attempt 1/7)' "$test_root/smoke.log"
echo 'Admin accepts a ready login page on the first request.'

reset_probe
printf '%s\n' "$redirect" "$placeholder" "$redirect" "$placeholder" \
  "$redirect" "$placeholder" "$redirect" >"$test_root/responses"
if run_smoke; then
  echo 'Expected the readiness check to reject redirects and fail after seven unsuccessful requests.' >&2
  exit 1
fi
assert_probes 7
grep -Fq 'HTTP 302' "$test_root/smoke.log"
grep -Fq 'readiness timed out' "$test_root/smoke.log"
echo 'Admin times out without accepting a redirected page.'
