#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Create it with required variables." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required_vars=(RPC_URL CHAIN_ID DEPLOYER_PRIVATE_KEY CLAIM_AMOUNT_WEI FUND_AMOUNT_WEI)
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing ${var} in ${ENV_FILE}." >&2
    exit 1
  fi
done

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ -z "${RP_ID_HASH:-}" && -z "${RP_ID:-}" ]] && is_truthy "${RP_ID_LOCALHOST:-}"; then
  RP_ID="localhost"
  export RP_ID
fi

if [[ -z "${RP_ID_HASH:-}" ]]; then
  if [[ -z "${RP_ID:-}" ]]; then
    echo "Missing RP_ID or RP_ID_HASH in ${ENV_FILE}." >&2
    exit 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to compute RP_ID_HASH." >&2
    exit 1
  fi
  RP_ID_HASH=$(python3 - "${RP_ID}" <<'PY'
import hashlib, sys
rp_id = sys.argv[1]
print("0x" + hashlib.sha256(rp_id.encode("utf-8")).hexdigest())
PY
  )
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "cast (foundry) is required for initialization and funding." >&2
  exit 1
fi

DEPLOY_ARGS=(--endpoint "${RPC_URL}" --private-key "${DEPLOYER_PRIVATE_KEY}")
if [[ -n "${MAX_FEE_PER_GAS_GWEI:-}" ]]; then
  DEPLOY_ARGS+=(--max-fee-per-gas-gwei "${MAX_FEE_PER_GAS_GWEI}")
fi
if is_truthy "${STYLUS_NO_VERIFY:-}"; then
  DEPLOY_ARGS+=(--no-verify)
fi

update_env() {
  local key="$1"
  local value="$2"
  python3 - "${ENV_FILE}" "${key}" "${value}" <<"PY"
import sys
path, key, value = sys.argv[1:]
lines = []
found = False
with open(path, "r", encoding="utf-8") as f:
  for line in f:
    if line.strip().startswith(f"{key}="):
      lines.append(f"{key}={value}\n")
      found = True
    else:
      lines.append(line)
if not found:
  if lines and not lines[-1].endswith("\n"):
    lines[-1] += "\n"
  lines.append(f"{key}={value}\n")
with open(path, "w", encoding="utf-8") as f:
  f.writelines(lines)
PY
}

DEPLOYED_ADDRESS=""

deploy_contract() {
  local dir="$1"
  local log
  log=$(mktemp)
  (cd "${dir}" && cargo stylus deploy "${DEPLOY_ARGS[@]}") 2>&1 | tee "${log}"
  local addr
  addr=$(python3 - "${log}" <<'PY' || true
import re, sys
path = sys.argv[1]
text = open(path, "r", encoding="utf-8", errors="ignore").read()
text = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", text).replace("\r", "")
patterns = [
    r"deployed code at address:\s*(0x[a-fA-F0-9]{40})",
    r"successfully activated contract\s*(0x[a-fA-F0-9]{40})",
    r"activated contract\s*(0x[a-fA-F0-9]{40})",
]
for pat in patterns:
    matches = re.findall(pat, text)
    if matches:
        print(matches[-1])
        sys.exit(0)
fallback = re.findall(r"0x[a-fA-F0-9]{40}", text)
if fallback:
    print(fallback[-1])
    sys.exit(0)
sys.exit(1)
PY
  )
  addr=$(echo "${addr:-}" | tr -d '[:space:]')
  if [[ -z "${addr}" || ! "${addr}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "Failed to parse contract address from deploy output." >&2
    tail -n 20 "${log}" >&2 || true
    rm -f "${log}"
    return 1
  fi
  rm -f "${log}"
  DEPLOYED_ADDRESS="${addr}"
}

echo "Deploying verifier (stylus-webauthn)..."
deploy_contract "${ROOT_DIR}/stylus-webauthn" || exit 1
VERIFIER_ADDRESS="${DEPLOYED_ADDRESS}"
echo "Verifier address: ${VERIFIER_ADDRESS}"

echo "Initializing verifier..."
cast send "${VERIFIER_ADDRESS}" \
  "initialize(bytes32)" "${RP_ID_HASH}" \
  --private-key "${DEPLOYER_PRIVATE_KEY}" --rpc-url "${RPC_URL}"

echo "Deploying escrow (stylus-redpacket)..."
deploy_contract "${ROOT_DIR}/stylus-redpacket" || exit 1
ESCROW_ADDRESS="${DEPLOYED_ADDRESS}"
echo "Escrow address: ${ESCROW_ADDRESS}"

echo "Initializing escrow..."
cast send "${ESCROW_ADDRESS}" \
  "initialize(address,uint256)" "${VERIFIER_ADDRESS}" "${CLAIM_AMOUNT_WEI}" \
  --private-key "${DEPLOYER_PRIVATE_KEY}" --rpc-url "${RPC_URL}"

echo "Funding escrow..."
cast send "${ESCROW_ADDRESS}" \
  --value "${FUND_AMOUNT_WEI}" \
  --private-key "${DEPLOYER_PRIVATE_KEY}" --rpc-url "${RPC_URL}"

CLAIMER_PRIVATE_KEY=${CLAIMER_PRIVATE_KEY:-$DEPLOYER_PRIVATE_KEY}

update_env "VERIFIER_ADDRESS" "${VERIFIER_ADDRESS}"
update_env "ESCROW_ADDRESS" "${ESCROW_ADDRESS}"
update_env "RP_ID_HASH" "${RP_ID_HASH}"

cat <<APP_ENV > "${ROOT_DIR}/app/.env"
RPC_URL=${RPC_URL}
CHAIN_ID=${CHAIN_ID}
CONTRACT_ADDRESS=${ESCROW_ADDRESS}
CLAIMER_PRIVATE_KEY=${CLAIMER_PRIVATE_KEY}
APP_ENV

echo "Done."
echo "Verifier: ${VERIFIER_ADDRESS}"
echo "Escrow:   ${ESCROW_ADDRESS}"
