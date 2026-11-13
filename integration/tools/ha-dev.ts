// Test HA for development (Docker, integration/dev): onboarding, token, websocket commands.
//   node tools/ha-dev.ts onboard                — user dev / devdevdev, token in dev/token.json
//   node tools/ha-dev.ts ws '{"type":"..."}'     — a single command, response to stdout
//   node tools/ha-dev.ts seed                   — areas and assigning demo entities to them, the home_twin integration
import fs from "node:fs";
import type {
  HassAreaEntry,
  HassEntityEntry,
  HassMessage,
} from "../../editor/src/core/types.ts";

/** A step of HA's onboarding (GET /api/onboarding). */
interface OnboardingStep {
  step: string;
  done: boolean;
}

/** HA's answer with tokens (POST /auth/token); the browser keeps all of it. */
interface Tokens {
  access_token: string;
  expires_in: number;
  [field: string]: unknown;
}

/** A message from HA's WebSocket API: auth_required, auth_ok, auth_invalid, or a command's result. */
interface WsMessage {
  type: string;
  success?: boolean;
  result?: unknown;
  error?: unknown;
}

/** A command for ws(): a message, or a function of the answers so far that makes one. */
type WsCommand = HassMessage | ((answers: unknown[]) => HassMessage);

// HA_URL and HA_TOKEN — another HA (e.g. a clean one for testing installation): its address and token file
const HA = process.env.HA_URL || "http://localhost:8123";
const CLIENT = HA + "/";
const TOKEN =
  process.env.HA_TOKEN || new URL("../dev/token.json", import.meta.url);
// the token file onboard writes: {token}
const savedToken = (): string =>
  (JSON.parse(fs.readFileSync(TOKEN, "utf8")) as { token: string }).token;
const j = async (r: Response): Promise<unknown> => {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(r.status + " " + t);
  }
};
async function onboard(): Promise<void> {
  const st = (await j(await fetch(HA + "/api/onboarding"))) as OnboardingStep[];
  if (st.find((s) => s.step === "user")?.done) {
    console.log("already set up");
    return;
  }
  const { auth_code } = (await j(
    await fetch(HA + "/api/onboarding/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT,
        name: "Dev",
        username: "dev",
        password: "devdevdev",
        language: "en",
      }),
    }),
  )) as { auth_code: string };
  const tok = (await j(
    await fetch(HA + "/auth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: auth_code,
        client_id: CLIENT,
      }),
    }),
  )) as Tokens;
  const H = {
    authorization: "Bearer " + tok.access_token,
    "content-type": "application/json",
  };
  for (const [p, b] of [
    ["core_config", {}],
    ["analytics", {}],
    [
      "integration",
      { client_id: CLIENT, redirect_uri: CLIENT + "?auth_callback=1" },
    ],
  ])
    await fetch(HA + "/api/onboarding/" + p, {
      method: "POST",
      headers: H,
      body: JSON.stringify(b),
    });
  const ll = await ws(
    [
      {
        type: "auth/long_lived_access_token",
        client_name: "home-twin-dev",
        lifespan: 3650,
      },
    ],
    tok.access_token,
  );
  fs.writeFileSync(TOKEN, JSON.stringify({ token: ll[0] }));
  console.log("done: dev / devdevdev");
}
// one after another: each command is an object or a function (previous responses) → object
function ws(cmds: WsCommand[], token = savedToken()): Promise<unknown[]> {
  return new Promise((ok, err) => {
    const s = new WebSocket(HA.replace("http", "ws") + "/api/websocket");
    let id = 0;
    const out: unknown[] = [];
    const next = (): void => {
      if (id >= cmds.length) {
        s.close();
        ok(out);
        return;
      }
      const c = cmds[id];
      const m = typeof c === "function" ? c(out) : c;
      s.send(JSON.stringify({ id: ++id, ...m }));
    };
    s.onmessage = (e) => {
      const m = JSON.parse(e.data) as WsMessage;
      if (m.type === "auth_required")
        s.send(JSON.stringify({ type: "auth", access_token: token }));
      else if (m.type === "auth_ok") next();
      else if (m.type === "auth_invalid") err(new Error("auth_invalid"));
      else if (m.type === "result") {
        out.push(m.success ? m.result : { error: m.error });
        next();
      }
    };
    // Node's WebSocket fires an ErrorEvent, which carries the error
    s.onerror = (e) => err((e as ErrorEvent).error || new Error("ws error"));
  });
}
async function seed(): Promise<void> {
  // the registries as HA lists them
  const ents = (
    await ws([{ type: "config/entity_registry/list" }])
  )[0] as HassEntityEntry[];
  const areas = (
    await ws([{ type: "config/area_registry/list" }])
  )[0] as HassAreaEntry[];
  // area id → name; an existing area matches by id or by name (case-insensitive): HA onboarding already creates Kitchen, Living Room, Bedroom
  const want: Record<string, string> = {
    kitchen: "Kitchen",
    living_room: "Living room",
    bedroom: "Bedroom",
    bathroom: "Bathroom",
    hall: "Hallway",
  };
  const is = (a: HassAreaEntry, id: string): boolean =>
    a.area_id === id || a.name.toLowerCase() === want[id].toLowerCase();
  for (const [id, name] of Object.entries(want))
    if (!areas.some((a) => is(a, id)))
      await ws([{ type: "config/area_registry/create", name }]);
  const A = (
    await ws([{ type: "config/area_registry/list" }])
  )[0] as HassAreaEntry[];
  const aid = (id: string): string | undefined =>
    A.find((a) => is(a, id))?.area_id;
  // demo entities by room: by words in the entity id
  const rules: Array<[RegExp, string]> = [
    [/kitchen/, "kitchen"],
    [/living_room|living/, "living_room"],
    [/bed_light|bedroom|ceiling_lights|hvac/, "bedroom"],
    [/bath|ecobee/, "bathroom"],
    [/entrance|hall|front_door|garage/, "hall"],
  ];
  // the area goes to the device (HA 2026.11 won't take an area for an entity without its own name), to the entity if it has no device
  const ups: HassMessage[] = [];
  const devs = new Set<string>();
  for (const e of ents) {
    const r = rules.find(([re]) => re.test(e.entity_id));
    if (!r || e.area_id) continue;
    if (e.device_id) {
      if (!devs.has(e.device_id)) {
        devs.add(e.device_id);
        ups.push({
          type: "config/device_registry/update",
          device_id: e.device_id,
          area_id: aid(r[1]),
        });
      }
    } else
      ups.push({
        type: "config/entity_registry/update",
        entity_id: e.entity_id,
        area_id: aid(r[1]),
      });
  }
  if (ups.length) {
    // a result, or {error} for a command HA did not take
    const res = (await ws(ups)) as Array<{
      error?: { message: string };
    } | null>;
    const bad = res.filter(
      (x): x is { error: { message: string } } => !!x?.error,
    );
    if (bad.length) console.log("failed:", bad.length, bad[0].error.message);
  }
  // the integration's entries (an error answer has no length either)
  const entries = (
    await ws([{ type: "config_entries/get", domain: "home_twin" }])
  )[0] as unknown[] | undefined;
  if (!entries?.length) {
    const f = await fetch(HA + "/api/config/config_entries/flow", {
      method: "POST",
      headers: {
        authorization: "Bearer " + savedToken(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ handler: "home_twin" }),
    });
    const flow = (await j(f)) as { flow_id: string };
    await fetch(HA + "/api/config/config_entries/flow/" + flow.flow_id, {
      method: "POST",
      headers: {
        authorization: "Bearer " + savedToken(),
        "content-type": "application/json",
      },
      body: "{}",
    });
  }
  console.log("areas:", A.length, "entities assigned:", ups.length);
}
// tokens for the browser (as the HA frontend stores them in localStorage.hassTokens) — log in without the form
async function browserTokens(): Promise<void> {
  const f = (await j(
    await fetch(HA + "/auth/login_flow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT,
        handler: ["homeassistant", null],
        redirect_uri: CLIENT + "?auth_callback=1",
      }),
    }),
  )) as { flow_id: string };
  const r = (await j(
    await fetch(HA + "/auth/login_flow/" + f.flow_id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT,
        username: "dev",
        password: "devdevdev",
      }),
    }),
  )) as { result: string };
  const t = (await j(
    await fetch(HA + "/auth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: r.result,
        client_id: CLIENT,
      }),
    }),
  )) as Tokens;
  console.log(
    JSON.stringify({
      ...t,
      hassUrl: HA,
      clientId: CLIENT,
      expires: Date.now() + t.expires_in * 1000,
    }),
  );
}
const [cmd, arg] = process.argv.slice(2);
if (cmd === "tokens") {
  await browserTokens();
  process.exit(0);
}
if (cmd === "onboard") await onboard();
else if (cmd === "seed") await seed();
else if (cmd === "ws")
  console.log(
    JSON.stringify(
      // the command line: one command, or a list of them
      await ws(
        (JSON.parse(arg) as { type?: string }).type
          ? [JSON.parse(arg) as HassMessage]
          : (JSON.parse(arg) as HassMessage[]),
      ),
      null,
      1,
    ),
  );
else console.log("onboard | seed | ws <json>");
