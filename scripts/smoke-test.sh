#!/usr/bin/env bash
set -euo pipefail

login_url=https://admin-test.naturalfarmingvietnam.com/login
smoke_root="$(mktemp -d)"
trap 'rm -rf -- "$smoke_root"' EXIT

# The worker receipt confirms the restart request. HTTP readiness is checked here.
# An unauthenticated /login must serve the page directly, so do not follow redirects.
attempts=7
for (( attempt=1; attempt<=attempts; attempt++ )); do
  if metadata="$(curl --silent --show-error --max-time 30 \
    --output "$smoke_root/login.html" \
    --write-out '%{http_code}\n%{content_type}\n%{redirect_url}\n' "$login_url")"; then
    mapfile -t response <<<"$metadata"
    status="${response[0]}"
    content_type="${response[1]:-}"
    marker=missing
    if grep -Fq '/_next/static/' "$smoke_root/login.html"; then
      marker=present
    fi
    if [[ "$status" == 200 && "${content_type%%;*}" == text/html && "$marker" == present ]]; then
      printf 'Admin login page is ready (attempt %s/%s).\n' "$attempt" "$attempts"
      exit 0
    fi
    printf 'Admin /login attempt %s/%s: HTTP %s, content type=%q, redirect=%q, Next.js asset marker=%s.\n' \
      "$attempt" "$attempts" "$status" "${content_type:-none}" "${response[2]:-none}" "$marker" >&2
  else
    printf 'Admin /login attempt %s/%s: curl exited with code %s.\n' "$attempt" "$attempts" "$?" >&2
  fi
  if (( attempt < attempts )); then
    sleep 10
  fi
done

echo 'Admin login page readiness timed out waiting for HTTP 200 with Next.js HTML.' >&2
exit 1
