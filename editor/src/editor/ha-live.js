// HA layer on a real Home Assistant (the Home Twin panel). The same interface as mockHA (editor/ha.js describes each
// method), only built from the hass object that HA hands to the panel and replaces with a new one on every event:
//   registries — hass.areas / hass.entities / hass.devices (changed — onChange), states — hass.states (changed —
//   onState; events within a frame are merged into one: in a home they come constantly). History, statistics, energy — callWS, the answer comes later.
// An entity's area is its own or its device's. Setting the area: HA 2026.11 does not allow it for an entity without its own name
// (“set the area on its device instead”) — then it goes to the device.
const HOUR = 3600e3;
const BOARD = 'home-twin-3d'; // the Home Twin dashboard (D-059); card.js and card-main.js know it too
// HA's own navigation from the panel's iframe or from the card in HA's page
const navigate = path => {
  const w = window.parent !== window ? window.parent : window;
  w.history.pushState(null, '', path);
  w.dispatchEvent(new CustomEvent('location-changed'));
};
const num = s => (s == null || s === '' || s === 'unknown' || s === 'unavailable' ? NaN : Number(s));
const SENSOR_DEVICE = new Set(['door', 'window', 'garage_door', 'opening', 'moisture']); // binary_sensor for the model and “Security”
const iso = ms => new Date(ms).toISOString();

export function liveHA(initial) {
  let hass = initial,
    raf = 0,
    boardMade = false;
  const subs = new Set(),
    ssubs = new Set(),
    hist = new Map(),
    forecast = new Map(),
    fsubs = new Map();
  const reg = e => hass.entities?.[e] || null;
  const devOf = r => (r?.device_id ? hass.devices?.[r.device_id] || null : null);
  const areaOf = e => {
    const r = reg(e);
    return r?.area_id || devOf(r)?.area_id || null;
  };
  const nameOf = e => hass.states[e]?.attributes?.friendly_name || reg(e)?.name || e;
  // hidden and service ones (config, diagnostic) are not shown; an entity without a registry entry (from YAML) is shown
  const shown = e => {
    const r = reg(e);
    return !r || (!r.hidden && !r.entity_category);
  };
  const ofDomain = d =>
    Object.keys(hass.states)
      .filter(e => e.startsWith(d + '.'))
      .sort();
  const pulse = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      ssubs.forEach(f => f());
    });
  };
  const ws = msg => hass.callWS(msg);

  // sensor history for 3 hours: 36 points 5 minutes apart, the last one is now; between records — the last value.
  // Drawn right away (whatever there is), one request per sensor every 5 minutes; when the answer arrives — redraw (onState)
  async function loadHistory(e, c) {
    c.busy = true;
    c.at = Date.now();
    try {
      const end = Date.now(),
        start = end - 3 * HOUR;
      const r = await ws({
        type: 'history/history_during_period',
        start_time: iso(start),
        end_time: iso(end),
        entity_ids: [e],
        minimal_response: true,
        no_attributes: true,
        include_start_time_state: true,
        significant_changes_only: false,
      });
      const pts = (r?.[e] || [])
        .map(x => [(x.lu ?? Date.parse(x.last_updated) / 1000) * 1000, num(x.s ?? x.state)])
        .filter(p => Number.isFinite(p[1]));
      const out = [];
      let j = 0,
        v = null;
      for (let i = 0; i < 36; i++) {
        const t = start + (i + 1) * 5 * 60e3;
        while (j < pts.length && pts[j][0] <= t) {
          v = pts[j][1];
          j++;
        }
        if (v != null) out.push(v);
      }
      c.data = out;
    } catch {
      c.data = [];
    } finally {
      c.busy = false;
    }
    pulse();
  }
  // hourly forecast — a weather/subscribe_forecast subscription, one per entity
  function watchForecast(e) {
    if (fsubs.has(e) || !hass.connection) return;
    fsubs.set(e, null);
    hass.connection
      .subscribeMessage(
        m => {
          forecast.set(
            e,
            (m?.forecast || []).map(f => ({
              at: Date.parse(f.datetime),
              condition: f.condition,
              temperature: f.temperature,
            })),
          );
          pulse();
        },
        {type: 'weather/subscribe_forecast', entity_id: e, forecast_type: 'hourly'},
      )
      .then(u => fsubs.set(e, u))
      .catch(() => {});
  }
  const weatherEntity = () => {
    const all = ofDomain('weather').filter(shown);
    if (!all.length) return null;
    const home = hass.config?.location_name?.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return (
      all.find(e => e === 'weather.home' || (home && e === 'weather.' + home)) ||
      all.find(e => reg(e)?.platform === 'met') ||
      all[0]
    );
  };

  const ha = {
    demo: false,
    // registries are loaded: before that an empty area list does not mean “areas were deleted” (app.js: syncAreas)
    ready: () => !!hass.areas && !!hass.entities,
    update(h) {
      const p = hass;
      hass = h;
      if (h.areas !== p.areas || h.entities !== p.entities || h.devices !== p.devices) subs.forEach(f => f());
      if (h.states !== p.states) pulse();
    },
    areas: () =>
      Object.values(hass.areas || {})
        .map(a => ({
          area_id: a.area_id,
          name: a.name,
          temperature_entity_id: a.temperature_entity_id || null,
          humidity_entity_id: a.humidity_entity_id || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    lights: () =>
      ofDomain('light')
        .filter(shown)
        .map(e => {
          const m = hass.states[e].attributes.entity_id;
          return {
            id: e.slice(6),
            entity: e,
            name: nameOf(e),
            area: areaOf(e),
            color: '#ffce87',
            ...(Array.isArray(m) ? {members: m} : {}),
          };
        }),
    switches: () =>
      ofDomain('switch')
        .filter(shown)
        .filter(areaOf)
        .map(e => ({entity: e, name: nameOf(e), area: areaOf(e)})),
    sensors: () =>
      ofDomain('sensor')
        .map(e => {
          const A = hass.states[e].attributes,
            r = reg(e);
          return {
            entity: e,
            name: nameOf(e),
            area: areaOf(e),
            device: r?.device_id || null,
            cls: A.device_class || null,
            unit: A.unit_of_measurement || null,
            cat: r?.entity_category || null,
            hidden: !!r?.hidden,
          };
        })
        .filter(
          x => x.cls !== 'timestamp' && (x.unit != null || Number.isFinite(num(hass.states[x.entity].state))),
        ),
    state: e => {
      const v = num(hass.states[e]?.state);
      return Number.isFinite(v) ? v : null;
    },
    entity: e => hass.states[e] || null,
    onState: f => {
      ssubs.add(f);
      return () => ssubs.delete(f);
    },
    onChange: f => {
      subs.add(f);
      return () => subs.delete(f);
    },
    history: e => {
      let c = hist.get(e);
      if (!c) {
        c = {at: 0, data: [], busy: false};
        hist.set(e, c);
      }
      if (!c.busy && Date.now() - c.at > 5 * 60e3) loadHistory(e, c);
      return c.data;
    },
    sunDown: () => hass.states['sun.sun']?.state === 'below_horizon',
    weather: () => {
      const e = weatherEntity();
      if (!e) return null;
      watchForecast(e);
      const s = hass.states[e],
        A = s.attributes,
        sun = hass.states['sun.sun']?.attributes || {};
      return {
        entity: e,
        condition: s.state,
        temperature: A.temperature ?? null,
        feels: A.apparent_temperature ?? null,
        hourly: forecast.get(e) || [],
        sunrise: Date.parse(sun.next_rising) || null,
        sunset: Date.parse(sun.next_setting) || null,
      };
    },
    statistics: (ids, {start, end, period, types}) =>
      ids.length
        ? ws({
            type: 'recorder/statistics_during_period',
            start_time: iso(start),
            end_time: iso(end),
            statistic_ids: ids,
            period,
            types,
            units: {energy: 'kWh'},
          }).then(r =>
            Object.fromEntries(
              Object.entries(r || {}).map(([k, L]) => [
                k,
                L.map(x => ({
                  ...x,
                  start: typeof x.start === 'number' ? x.start : Date.parse(x.start),
                  end: typeof x.end === 'number' ? x.end : Date.parse(x.end),
                })),
              ]),
            ),
          )
        : Promise.resolve({}),
    stateHistory: (ids, {start, end}) =>
      ids.length
        ? ws({
            type: 'history/history_during_period',
            start_time: iso(start),
            end_time: iso(end),
            entity_ids: ids,
            minimal_response: true,
            no_attributes: true,
            include_start_time_state: true,
            significant_changes_only: false,
          }).then(r =>
            Object.fromEntries(
              Object.entries(r || {}).map(([k, L]) => [
                k,
                L.map(x => ({s: x.s ?? x.state, lu: x.lu ?? Date.parse(x.last_updated) / 1000})),
              ]),
            ),
          )
        : Promise.resolve({}),
    energy: () =>
      ws({type: 'energy/get_prefs'})
        .then(p => ({
          grid: (p.energy_sources || [])
            .filter(s => s.type === 'grid')
            .flatMap(s => (s.flow_from || []).map(f => f.stat_energy_from))
            .filter(Boolean),
          devices: (p.device_consumption || []).map(d => ({
            statistic: d.stat_consumption,
            name: d.name || undefined,
            parent: d.included_in_stat || undefined,
          })),
        }))
        .catch(() => null),
    devices: () =>
      Object.keys(hass.states)
        .sort()
        .flatMap(e => {
          const d = e.split('.')[0],
            A = hass.states[e].attributes,
            cls = A.device_class || null;
          if (
            !shown(e) ||
            !(
              ['climate', 'cover', 'camera', 'valve', 'vacuum'].includes(d) ||
              (d === 'binary_sensor' && SENSOR_DEVICE.has(cls))
            )
          )
            return [];
          const x = {entity: e, name: nameOf(e), area: areaOf(e), domain: d, cls};
          // leak sensor: charge and “battery low” are entities of the same device
          if (cls === 'moisture' && reg(e)?.device_id) {
            const sib = Object.values(hass.entities).filter(
                o => o.device_id === reg(e).device_id && o.entity_id !== e,
              ),
              bc = o => hass.states[o.entity_id]?.attributes.device_class === 'battery';
            const b = sib.find(o => o.entity_id.startsWith('sensor.') && bc(o)),
              low = sib.find(o => o.entity_id.startsWith('binary_sensor.') && bc(o));
            if (b) x.battery = b.entity_id;
            if (low) x.low = low.entity_id;
          }
          return [x];
        }),
    entities: () =>
      Object.keys(hass.states)
        .filter(shown)
        .sort()
        .map(e => {
          const A = hass.states[e].attributes;
          return {
            entity: e,
            name: nameOf(e),
            area: areaOf(e),
            domain: e.split('.')[0],
            ...(A.device_class ? {cls: A.device_class} : {}),
            ...(A.unit_of_measurement ? {unit: A.unit_of_measurement} : {}),
          };
        }),
    call: (domain, service, data = {}) =>
      hass.callService(domain, service, data).then(
        () => true,
        () => false,
      ),
    identify: e =>
      hass.callService('light', 'turn_on', {entity_id: e, flash: 'short'}).then(
        () => e,
        () => e,
      ),
    setArea: async (e, area) => {
      try {
        await ws({type: 'config/entity_registry/update', entity_id: e, area_id: area});
      } catch (err) {
        const d = reg(e)?.device_id;
        if (err?.code !== 'invalid_info' || !d) throw err;
        await ws({type: 'config/device_registry/update', device_id: d, area_id: area});
      }
    },
    // the entity card — via an event on the HA root (the panel is in an iframe of the same origin: the parent document is accessible;
    // the dashboard card is in HA's own document)
    moreInfo: e => {
      let root = null;
      try {
        root = (window.parent !== window ? window.parent.document : document).querySelector('home-assistant');
      } catch {}
      (root || document.body).dispatchEvent(
        new CustomEvent('hass-more-info', {detail: {entityId: e}, bubbles: true, composed: true}),
      );
    },
    url: path => (hass.hassUrl ? hass.hassUrl(path) : path),
    // The Home Twin dashboard (D-059): the whole home on the screen, in everyone's sidebar. add(title) — create it (an administrator)
    // with one panel view holding the card; one that exists is not touched. open() — go there.
    board: {
      exists: () => boardMade || !!hass.panels?.[BOARD],
      async add(title) {
        if (ha.board.exists()) return;
        await ws({
          type: 'lovelace/dashboards/create',
          url_path: BOARD,
          title,
          icon: 'mdi:home-modern',
          show_in_sidebar: true,
          require_admin: false,
          mode: 'storage',
        });
        await ws({
          type: 'lovelace/config/save',
          url_path: BOARD,
          config: {
            title,
            views: [{title, path: 'home', type: 'panel', cards: [{type: 'custom:home-twin-card'}]}],
          },
        });
        boardMade = true;
      },
      open: () => navigate(`/${BOARD}/home`),
    },
    areasUrl: '/config/areas/dashboard',
    devicesUrl: '/config/devices/dashboard',
    // no longer needed (the dashboard card was removed): forecast subscriptions end, nobody is told about changes
    close() {
      for (const u of fsubs.values()) u?.();
      fsubs.clear();
      cancelAnimationFrame(raf);
      raf = 0;
      subs.clear();
      ssubs.clear();
    },
  };
  return ha;
}

// The plan in HA (the home_twin integration): read at startup, written with a delay after edits. rev — the revision the plan
// was changed from: if it was changed in another window, HA does not write (conflict) and reports onConflict; keepMine — write ours on top.
// No connection (HA restarts, the network dropped): the write is retried every 5 s and the state is 'offline' (onStatus). The browser
// keeps the plan (history.js) and a mark “not sent yet, edited from revision N”, so the next start sends it instead of losing it:
// load(local) — the browser's plan; HA has not changed since — ours goes up, it has — ask (D-058).
const UNSENT = 'home-twin-editor:ha-unsent';
const keep = key => ({
  get: () => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  },
  set: v => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  },
  clear: () => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
});
const json = p => JSON.stringify(p ?? null);
export function hassPlans(getHass, {onConflict, onStatus, mark = keep(UNSENT)} = {}) {
  // base, last — snapshots (JSON) of the plan this browser started from and of the plan HA has: the editor changes its plan in place
  let rev = null,
    base,
    last,
    timer = 0,
    want = null,
    sending = false,
    stop = false,
    state = 'saved';
  const status = s => {
    if (s !== state) {
      state = s;
      onStatus?.(s);
    }
  };
  const conflict = () => {
    stop = true;
    status('conflict');
    onConflict?.();
  };
  const ws = m => getHass().callWS(m);
  async function send(force = false) {
    if (sending || !want || (stop && !force)) return;
    sending = true;
    const plan = want;
    want = null;
    let wait = 700;
    try {
      // the start could not read HA: read now; HA has a plan other than the one this browser started from — ask
      if (rev == null && !force) {
        const r = await ws({type: 'home_twin/plan/get'});
        if (r.plan && json(r.plan) !== base) {
          want ??= plan;
          conflict();
          return;
        }
        rev = r.rev;
      }
      const sent = json(plan),
        r = await ws({type: 'home_twin/plan/save', plan, ...(force ? {} : {rev})});
      rev = r.rev;
      last = sent;
      stop = false;
      if (want) mark.set({rev});
      else mark.clear();
      status('saved');
    } catch (e) {
      want ??= plan;
      if (e?.code === 'conflict') conflict();
      else {
        status('offline');
        wait = 5000;
      }
    } finally {
      sending = false;
      if (want && !stop) schedule(wait);
    }
  }
  const schedule = (ms = 700) => {
    clearTimeout(timer);
    timer = setTimeout(() => send(), ms);
  };
  return {
    async load(local) {
      base = json(local);
      const r = await ws({type: 'home_twin/plan/get'});
      rev = r.rev;
      last = json(r.plan);
      const m = mark.get();
      if (!m || !local || base === last) {
        mark.clear();
        return r;
      }
      // the last edits did not reach HA (no connection, the tab was closed): HA unchanged since — send them, changed — ask
      want = local;
      if (m.rev === r.rev) schedule();
      else conflict();
      return {...r, plan: local};
    },
    // the same plan HA already has (the start, an edit undone) is not written: a write would make other windows see a conflict
    save(p) {
      if (!want && !sending && json(p) === last) return;
      want = p;
      mark.set({rev});
      if (!stop) schedule();
    },
    keepMine: () => {
      stop = false;
      send(true);
    },
    // “Load from HA”: forget what was not sent
    discard: () => {
      want = null;
      mark.clear();
    },
    flush: () => {
      clearTimeout(timer);
      return send();
    },
    state: () => state,
  };
}

// The plan photo in HA (D-058): the image goes to /api/home_twin/photo over HTTP, its placement — home_twin/photo/place.
// The same interface as underlay.js: browserPhotos. Writes wait a moment (dragging) and are retried while there is no
// connection; until HA confirms them they also sit in the browser (local — browserPhotos, and the mark of what is not sent yet),
// so a closed tab does not lose them. HA has never had a photo, but this browser kept one (before D-058) — it is sent once.
const PHOTO_UNSENT = 'home-twin-editor:photo-unsent',
  PHOTO = '/api/home_twin/photo';
export function hassPhotos(getHass, {local, onStatus, mark = keep(PHOTO_UNSENT)} = {}) {
  // todo: {clear, src, place} — what HA does not have yet; gen grows with “Remove”: what was not sent before it is dropped
  let id = null,
    todo = mark.get() || {},
    gen = 0,
    timer = 0,
    busy = false,
    fails = 0;
  const ws = m => getHass().callWS(m);
  const schedule = (ms = 400) => {
    clearTimeout(timer);
    timer = setTimeout(sync, ms);
  };
  const need = o => {
    todo = {...todo, ...o};
    mark.set(todo);
    schedule();
  };
  async function image(pid) {
    const r = await getHass().fetchWithAuth(PHOTO + '?v=' + pid);
    if (!r.ok) throw new Error('plan photo: HTTP ' + r.status);
    const blob = await r.blob();
    return await new Promise((ok, err) => {
      const f = new FileReader();
      f.onload = () => ok(f.result);
      f.onerror = () => err(f.error);
      f.readAsDataURL(blob);
    });
  }
  async function sync() {
    if (busy) return schedule();
    busy = true;
    timer = 0;
    const t = {...todo},
      g = gen;
    todo = {};
    try {
      if (t.clear) {
        await ws({type: 'home_twin/photo/delete'});
        id = null;
        t.clear = false;
      }
      if (t.src) {
        const s = await local.load();
        if (s) {
          const blob = await (await fetch(s.src)).blob();
          const r = await getHass().fetchWithAuth(PHOTO, {
            method: 'POST',
            headers: {'Content-Type': blob.type || 'image/jpeg'},
            body: blob,
          });
          if (!r.ok) throw new Error('plan photo: HTTP ' + r.status);
          id = (await r.json()).id;
        }
        t.src = false;
        t.place = !!s;
      }
      if (t.place) {
        const p = local.where();
        if (p && id)
          try {
            await ws({type: 'home_twin/photo/place', photo: id, place: p});
          } catch (e) {
            if (e?.code !== 'no_photo') throw e;
          } // another window replaced the photo
        t.place = false;
      }
      if (fails) {
        fails = 0;
        onStatus?.('saved');
      }
    } catch (e) {
      console.warn('Home Twin:', e);
      if (!fails++) onStatus?.('offline');
    } finally {
      busy = false;
      const left = g === gen ? t : {};
      todo = {
        clear: !!(left.clear || todo.clear),
        src: !!(left.src || todo.src),
        place: !!(left.place || todo.place),
      };
      if (todo.clear || todo.src || todo.place) {
        mark.set(todo);
        if (!timer) schedule(fails ? Math.min(3e5, 1e4 * 2 ** (fails - 1)) : 400);
      } else {
        todo = {};
        mark.clear();
        if (g === gen) await local.clear();
      }
    }
  }
  return {
    async load() {
      const r = await ws({type: 'home_twin/photo/get'});
      id = r.photo?.id || null;
      const t = todo;
      if (t.clear) {
        schedule(0);
        return null;
      }
      // not sent last time (or kept in this browser before D-058) — the browser's copy, sent now
      const s = t.src || r.never ? await local.load() : null;
      if (s) {
        need({src: true, place: true});
        return s;
      }
      const p = t.place && id ? local.where() : null;
      if (p) {
        need({place: true});
        return {src: await image(id), place: p};
      }
      if (t.src || t.place) {
        todo = {};
        mark.clear();
      }
      return r.photo?.place ? {src: await image(id), place: r.photo.place} : null;
    },
    async put(src) {
      await local.put(src);
      need({src: true, place: true, clear: false});
    },
    place(p) {
      local.place(p);
      need({place: true});
      return true;
    },
    async clear() {
      gen++;
      id = null;
      await local.clear();
      todo = {};
      need({clear: true});
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
        return sync();
      }
    },
    state: () => (fails ? 'offline' : 'saved'),
  };
}
