#!/bin/bash
# Smoke test of Home Twin on a given Home Assistant version (Docker): a fresh HA with the demo integration, the integration
# installed from a zip built like the release one, added through the config flow, the typical demo plan saved to HA.
#   integration/tools/try-version.sh 2024.7.4 8126   → then open http://localhost:8126/home-twin (dev / devdevdev)
#   docker rm -f ht-try-2024-7-4                      → clean up
# Build the editor first (cd editor && npm run build) so custom_components/home_twin/frontend/panel.js exists.
set -e
V=${1:?version, e.g. 2024.7.4}; P=${2:-8126}
ROOT=$(cd "$(dirname "$0")/../.." && pwd); D=/tmp/ht-try-$V; N=ht-try-${V//./-}
docker rm -f "$N" >/dev/null 2>&1 || true; rm -rf "$D"; mkdir -p "$D/config/custom_components/home_twin"
printf 'default_config:\ndemo:\nhomeassistant:\n  language: en\n' > "$D/config/configuration.yaml"
(cd "$ROOT/custom_components/home_twin" && zip -qr "$D/home_twin.zip" . -x '__pycache__/*')
unzip -q "$D/home_twin.zip" -d "$D/config/custom_components/home_twin"
docker run -d --name "$N" -p "$P:8123" -v "$D/config:/config" "ghcr.io/home-assistant/home-assistant:$V" >/dev/null
for i in $(seq 1 150); do curl -sf "http://localhost:$P/api/onboarding" >/dev/null && break; sleep 2; done
export HA_URL=http://localhost:$P HA_TOKEN=$D/token.json
cd "$ROOT/integration"; node tools/ha-dev.mjs onboard
TOK=$(node -e "console.log(require('$D/token.json').token)")
for i in $(seq 1 30); do F=$(curl -s -X POST -H "Authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"handler":"home_twin"}' "http://localhost:$P/api/config/config_entries/flow"); echo "$F" | grep -q flow_id && break; sleep 3; done
FID=$(echo "$F" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).flow_id))")
curl -s -X POST -H "Authorization: Bearer $TOK" -H 'content-type: application/json' -d '{}' "http://localhost:$P/api/config/config_entries/flow/$FID" >/dev/null
PLAN=$(cd "$ROOT/editor" && node --input-type=module -e "const {DEMO}=await (await import('./demo/typical.mjs')).default();console.log(JSON.stringify({type:'home_twin/plan/save',plan:DEMO}))")
echo "plan saved: $(node tools/ha-dev.mjs ws "$PLAN" | tr -d '\n ')"
echo "panel: $(node tools/ha-dev.mjs ws '{"type":"get_panels"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const h=JSON.parse(s)[0]['home-twin'];console.log(h?h.title+' / config panel of '+h.config_panel_domain:'missing')})")"
echo "Open http://localhost:$P/home-twin (dev / devdevdev)"
