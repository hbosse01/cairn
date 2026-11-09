// Lecture d'un fichier FIT (format des montres Suunto, Garmin…).
// On en tire les chiffres exacts de la montre : résumé de séance, tours, points enregistrés et pauses,
// plus les champs ajoutés par Suunto (estimated_vo2_max, recovery_time…).
const BASE = {
  0x00: [1, 'u8'], 0x01: [1, 'i8'], 0x02: [1, 'u8'], 0x83: [2, 'i16'], 0x84: [2, 'u16'], 0x85: [4, 'i32'], 0x86: [4, 'u32'],
  0x07: [1, 'str'], 0x88: [4, 'f32'], 0x89: [8, 'f64'], 0x0a: [1, 'u8'], 0x8b: [2, 'u16'], 0x8c: [4, 'u32'], 0x0d: [1, 'u8'],
  0x8e: [8, 'u64'], 0x8f: [8, 'u64'], 0x90: [8, 'u64'],
};
const INVALID = { u8: 0xff, i8: 0x7f, u16: 0xffff, i16: 0x7fff, u32: 0xffffffff, i32: 0x7fffffff };
const FIT_EPOCH = 631065600; // 31/12/1989 en secondes Unix

function read(dv, off, type, size, le) {
  switch (type) {
    case 'u8': return dv.getUint8(off);
    case 'i8': return dv.getInt8(off);
    case 'u16': return dv.getUint16(off, le);
    case 'i16': return dv.getInt16(off, le);
    case 'u32': return dv.getUint32(off, le);
    case 'i32': return dv.getInt32(off, le);
    case 'f32': return dv.getFloat32(off, le);
    case 'f64': return dv.getFloat64(off, le);
    case 'str': { let s = ''; for (let i = 0; i < size; i++) { const c = dv.getUint8(off + i); if (!c) break; s += String.fromCharCode(c); } return s; }
  }
  return null;
}
const valid = (v, t) => v != null && v !== INVALID[t] && !(typeof v === 'number' && isNaN(v));

// Champs standard utiles (numéro de champ → [nom, échelle, décalage])
const F = {
  18: { 2: ['start_time'], 7: ['elapsed', 1000], 8: ['timer', 1000], 9: ['distance', 100], 11: ['calories'], 14: ['avg_speed', 1000], 15: ['max_speed', 1000], 16: ['avg_hr'], 17: ['max_hr'], 18: ['avg_cadence'], 22: ['ascent'], 23: ['descent'], 124: ['enh_avg_speed', 1000], 125: ['enh_max_speed', 1000], 5: ['sport'], 6: ['sub_sport'] },
  19: { 2: ['start_time'], 253: ['timestamp'], 7: ['elapsed', 1000], 8: ['timer', 1000], 9: ['distance', 100], 13: ['avg_speed', 1000], 15: ['avg_hr'], 16: ['max_hr'], 21: ['ascent'], 22: ['descent'], 110: ['enh_avg_speed', 1000], 24: ['lap_trigger'] },
  20: { 253: ['timestamp'], 2: ['altitude', 5, 500], 3: ['hr'], 5: ['distance', 100], 6: ['speed', 1000], 73: ['enh_speed', 1000], 78: ['enh_altitude', 5, 500], 4: ['cadence'] },
  21: { 253: ['timestamp'], 0: ['event'], 1: ['event_type'] },
};

export function parseFit(buffer) {
  const dv = new DataView(buffer);
  const hsize = dv.getUint8(0);
  const dataSize = dv.getUint32(4, true);
  const end = Math.min(buffer.byteLength, hsize + dataSize);
  const defs = {};
  const devDesc = {};
  const out = { session: null, laps: [], records: [], events: [], dev: {} };
  let off = hsize, lastTs = 0;

  function readData(def, o, compressedOffset) {
    const vals = {};
    for (const f of def.fields) {
      const bt = BASE[f.base] || [1, 'u8'];
      if (f.size === bt[0] || bt[1] === 'str') { const v = read(dv, o, bt[1], f.size, def.le); if (valid(v, bt[1])) vals[f.num] = v; }
      o += f.size;
    }
    if (def.global === 206) {
      devDesc[`${vals[0]}:${vals[1]}`] = { name: vals[3], units: vals[8], type: (BASE[vals[2]] || [1, 'u8'])[1], size: (BASE[vals[2]] || [1])[0] };
    }
    const devVals = {};
    for (const d of def.dev) {
      const desc = devDesc[`${d.idx}:${d.num}`];
      if (desc?.name && d.size >= desc.size) {
        const v = read(dv, o, desc.type, d.size, def.le);
        if (valid(v, desc.type)) devVals[desc.name] = v;
      }
      o += d.size;
    }
    // horodatage
    if (vals[253] != null) lastTs = vals[253];
    else if (compressedOffset != null) {
      let ts = (lastTs & ~0x1f) + compressedOffset;
      if (compressedOffset < (lastTs & 0x1f)) ts += 0x20;
      vals[253] = ts; lastTs = ts;
    }
    const map = F[def.global];
    if (map) {
      const m = {};
      for (const [k, [name, scale, offset]] of Object.entries(map)) {
        if (vals[k] == null) continue;
        let v = vals[k]; if (scale) v = v / scale; if (offset) v -= offset;
        m[name] = v;
      }
      if (def.global === 18) out.session = { ...(out.session || {}), ...m };
      else if (def.global === 19) out.laps.push(m);
      else if (def.global === 20) out.records.push(m);
      else if (def.global === 21) out.events.push(m);
    }
    for (const [k, v] of Object.entries(devVals)) (out.dev[k] ||= { units: devDesc[Object.keys(devDesc).find(x => devDesc[x].name === k)]?.units, values: [], msgs: [] }).values.push(v), out.dev[k].msgs.push(def.global);
    return o;
  }

  while (off < end) {
    const h = dv.getUint8(off++);
    if (h & 0x80) { const def = defs[(h >> 5) & 0x03]; if (!def) break; off = readData(def, off, h & 0x1f); continue; }
    const local = h & 0x0f;
    if (h & 0x40) {
      off++;
      const le = dv.getUint8(off++) === 0;
      const global = dv.getUint16(off, le); off += 2;
      const n = dv.getUint8(off++);
      const fields = [];
      for (let i = 0; i < n; i++) { fields.push({ num: dv.getUint8(off), size: dv.getUint8(off + 1), base: dv.getUint8(off + 2) }); off += 3; }
      const dev = [];
      if (h & 0x20) { const m = dv.getUint8(off++); for (let i = 0; i < m; i++) { dev.push({ num: dv.getUint8(off), size: dv.getUint8(off + 1), idx: dv.getUint8(off + 2) }); off += 3; } }
      defs[local] = { le, global, fields, dev };
    } else {
      const def = defs[local]; if (!def) break;
      off = readData(def, off, null);
    }
  }
  return out;
}

// Séance prête à l'emploi : temps « chrono » (pauses exclues) pour chaque point, tours, résumé
export function fitActivity(buffer) {
  const f = parseFit(buffer);
  const recs = f.records.filter(r => r.timestamp != null).sort((a, b) => a.timestamp - b.timestamp);
  // périodes de pause à partir des événements chrono (event 0) : stop (1) / stop_all (4) → start (0)
  const pauses = []; let stopAt = null;
  for (const e of f.events.sort((a, b) => a.timestamp - b.timestamp)) {
    if (e.event !== 0) continue;
    if ((e.event_type === 1 || e.event_type === 4) && stopAt == null) stopAt = e.timestamp;
    else if (e.event_type === 0 && stopAt != null) { pauses.push([stopAt, e.timestamp]); stopAt = null; }
  }
  const inPause = (t0, t1) => pauses.some(([a, b]) => t0 >= a - 0.5 && t1 <= b + 0.5);
  const t0 = recs.length ? recs[0].timestamp : 0;
  const time = [], timer = [], distance = [], heartrate = [], altitude = [], speed = [], pausedBefore = [];
  let acc = 0;
  recs.forEach((r, i) => {
    if (i > 0) {
      const dt = r.timestamp - recs[i - 1].timestamp;
      const paused = inPause(recs[i - 1].timestamp, r.timestamp) || (dt > 30 && pauses.length === 0 && ((r.distance ?? 0) - (recs[i - 1].distance ?? 0)) < dt * 0.3);
      pausedBefore.push(paused);
      if (!paused) acc += dt;
    } else pausedBefore.push(false);
    time.push(r.timestamp - t0); timer.push(acc);
    distance.push(r.distance ?? null); heartrate.push(r.hr ?? null);
    altitude.push(r.enh_altitude ?? r.altitude ?? null); speed.push(r.enh_speed ?? r.speed ?? null);
  });
  const s = f.session || {};
  const last = k => { const x = f.dev[k]; return x?.values?.length ? x.values[x.values.length - 1] : null; };
  const summary = {
    distance: s.distance ?? (distance.length ? distance[distance.length - 1] : null),
    timer: s.timer ?? acc, elapsed: s.elapsed ?? (time.length ? time[time.length - 1] : null),
    avgHr: s.avg_hr ?? null, maxHr: s.max_hr ?? null, ascent: s.ascent ?? null, descent: s.descent ?? null,
    avgSpeed: s.enh_avg_speed ?? s.avg_speed ?? null, calories: s.calories ?? null,
    vo2max: last('estimated_vo2_max'), recoverySec: last('recovery_time'),
  };
  const laps = f.laps.map(l => ({ distance: l.distance ?? 0, timer: l.timer ?? l.elapsed ?? 0, elapsed: l.elapsed ?? 0, avgHr: l.avg_hr ?? null, maxHr: l.max_hr ?? null, ascent: l.ascent ?? null, descent: l.descent ?? null, avgSpeed: l.enh_avg_speed ?? l.avg_speed ?? null, start: l.start_time ?? null, end: l.timestamp ?? null }));
  // repère du premier et dernier point de chaque tour (pour la VAP par tour)
  laps.forEach(l => { if (l.start == null || l.end == null) return; let i0 = recs.findIndex(r => r.timestamp >= l.start); let i1 = -1; for (let i = recs.length - 1; i >= 0; i--) if (recs[i].timestamp <= l.end) { i1 = i; break; } l.i0 = i0; l.i1 = i1; });
  return { summary, laps, streams: { time, timer, distance, heartrate, altitude, speed, pausedBefore }, pauses };
}
