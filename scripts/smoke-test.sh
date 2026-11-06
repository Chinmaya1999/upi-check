#!/usr/bin/env bash
# End-to-end API check against a live server. Usage: smoke-test.sh http://host   (creates then deletes a throwaway account)
set -uo pipefail
BASE="${1:?usage: smoke-test.sh http://host}"; FAIL=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s (%s)\n' "$1" "$2"; FAIL=1; }
req() { curl -sS -m 15 -o /tmp/smoke.body -w '%{http_code}' "$@"; }   # prints status, body in /tmp/smoke.body
expect() { local name="$1" want="$2" got="$3"; [ "$got" = "$want" ] && pass "$name" || fail "$name" "want $want got $got: $(head -c 200 /tmp/smoke.body)"; }
J=(-H 'content-type: application/json')
EMAIL="smoke$(date +%s)$RANDOM@example.com"; PW='smoke-pass-123'
# Payloads built with jq into variables: portable across bash 3.2 (macOS) and 5 (CI).
body() { jq -nc "$@"; }
REG=$(body --arg c "$EMAIL" --arg p "$PW" '{name:"Smoke",contact:$c,password:$p}')
REG_SHORT=$(body --arg c "$EMAIL" '{name:"Smoke",contact:$c,password:"abc"}')
REG_BADCONTACT=$(body --arg p "$PW" '{name:"Smoke",contact:"123",password:$p}')
LOGIN=$(body --arg c "$EMAIL" --arg p "$PW" '{contact:$c,password:$p}')
LOGIN_BAD=$(body --arg c "$EMAIL" '{contact:$c,password:"wrong-wrong"}')

expect "GET /health"                  200 "$(req "$BASE/health")"
expect "register: short password"     400 "$(req -X POST "$BASE/auth/register" "${J[@]}" -d "$REG_SHORT")"
expect "register: bad contact"        400 "$(req -X POST "$BASE/auth/register" "${J[@]}" -d "$REG_BADCONTACT")"
expect "register"                     201 "$(req -X POST "$BASE/auth/register" "${J[@]}" -d "$REG")"
expect "register: duplicate"          409 "$(req -X POST "$BASE/auth/register" "${J[@]}" -d "$REG")"
expect "login: wrong password"        401 "$(req -X POST "$BASE/auth/login" "${J[@]}" -d "$LOGIN_BAD")"
expect "login"                        200 "$(req -X POST "$BASE/auth/login" "${J[@]}" -d "$LOGIN")"
TOKEN=$(jq -r .token /tmp/smoke.body); [ -n "$TOKEN" ] && [ "$TOKEN" != null ] || { fail "token" "none returned"; exit 1; }
# Always remove the throwaway account, even if a check above aborts the script.
cleanup() { curl -sS -m 10 -o /dev/null -X DELETE "$BASE/me" -H "Authorization: Bearer ${CLEAN_TOKEN:-$TOKEN}" || true; }
trap cleanup EXIT
A=(-H "Authorization: Bearer $TOKEN")
code=$(req "$BASE/admin/api/stats")
case "$code" in
  401) pass "admin API requires sign-in" ;;
  404) echo "  warn admin dashboard is DISABLED on the server (set the ADMIN_PASSWORD secret and redeploy)" ;;
  *)   fail "admin API requires sign-in" "want 401 (or 404 when disabled) got $code" ;;
esac
expect "GET /config (public)"         200 "$(req "$BASE/config")"
expect "GET /me: no token"            401 "$(req "$BASE/me")"
expect "GET /me"                      200 "$(req "$BASE/me" "${A[@]}")"
TX='{"id":"smoke1","accountId":"HDFCBK:1234","direction":"debit","amountPaise":45000,"currency":"INR","occurredAt":"2026-11-04T09:15:00.000Z","dayKey":"2026-11-04","status":"confirmed","kind":"normal","channel":"upi","paymentApp":"phonepe","merchant":"Swiggy","fingerprint":"fp-smoke1","narration":"n","sources":["sms"],"originals":[],"altFingerprints":[],"categoryId":"food","needsReview":false}'
SYNC_BAD='{"transactions":[{"id":1}]}'; SYNC_OK=$(body --argjson t "$TX" '{transactions:[$t]}')
expect "sync: invalid payload"        400 "$(req -X POST "$BASE/transactions/sync" "${A[@]}" "${J[@]}" -d "$SYNC_BAD")"
expect "sync: upsert"                 200 "$(req -X POST "$BASE/transactions/sync" "${A[@]}" "${J[@]}" -d "$SYNC_OK")"
expect "sync: idempotent re-upsert"   200 "$(req -X POST "$BASE/transactions/sync" "${A[@]}" "${J[@]}" -d "$SYNC_OK")"
expect "GET /transactions"            200 "$(req "$BASE/transactions" "${A[@]}")"
[ "$(jq -r .total /tmp/smoke.body)" = 1 ] && pass "exactly one stored transaction" || fail "dedupe" "total=$(jq -r .total /tmp/smoke.body)"
expect "GET /summary/daily"           200 "$(req "$BASE/summary/daily" "${A[@]}")"
[ "$(jq -r '.days[0].byApp[0].app' /tmp/smoke.body)" = phonepe ] && pass "per-app split" || fail "per-app split" "$(head -c 200 /tmp/smoke.body)"
expect "logout"                       200 "$(req -X POST "$BASE/auth/logout" "${A[@]}")"
expect "token revoked after logout"   401 "$(req "$BASE/me" "${A[@]}")"
expect "login again"                  200 "$(req -X POST "$BASE/auth/login" "${J[@]}" -d "$LOGIN")"
CLEAN_TOKEN=$(jq -r .token /tmp/smoke.body); A=(-H "Authorization: Bearer $CLEAN_TOKEN")
expect "DELETE /me (cleanup)"         200 "$(req -X DELETE "$BASE/me" "${A[@]}")"
expect "unknown route"                404 "$(req "$BASE/nope")"
[ $FAIL = 0 ] && echo "SMOKE TEST PASSED" || { echo "SMOKE TEST FAILED"; exit 1; }
