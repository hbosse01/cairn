// Lecture minimale d'un fichier FIT : récupère les champs « développeur » ajoutés par Suunto
// (estimated_vo2_max, recovery_time, peak_epoc…) qui ne sont pas transmis par Intervals.icu.
const BASE = {
  0x00: [1, 'u8'], 0x01: [1, 'i8'], 0x02: [1, 'u8'], 0x83: [2, 'i16'], 0x84: [2, 'u16'], 0x85: [4, 'i32'], 0x86: [4, 'u32'],
  0x07: [1, 'str'], 0x88: [4, 'f32'], 0x89: [8, 'f64'], 0x0a: [1, 'u8'], 0x8b: [2, 'u16'], 0x8c: [4, 'u32'], 0x0d: [1, 'u8'],
};
const INVALID = { u8: 0xff, i8: 0x7f, u16: 0xffff, i16: 0x7fff, u32: 0xffffffff, i32: 0x7fffffff };

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

export function parseFitDevFields(buffer) {
  const dv = new DataView(buffer);
  const hsize = dv.getUint8(0);
  const dataSize = dv.getUint32(4, true);
  const end = Math.min(buffer.byteLength, hsize + dataSize);
  const defs = {};
  const devDesc = {}; // `${devIdx}:${fieldNum}` -> { name, units, type }
  const out = {}; // nom -> dernière valeur (le message session arrive en fin de fichier)
  let off = hsize;
  while (off < end) {
    const h = dv.getUint8(off++);
    if (h & 0x80) { // en-tête compressé (horodatage)
      const def = defs[(h >> 5) & 0x03]; if (!def) break;
      off = readData(def, off); continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) { // définition
      off++; // réservé
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
      off = readData(def, off);
    }
  }
  return out;

  function readData(def, o) {
    const vals = {};
    for (const f of def.fields) {
      const bt = BASE[f.base] || [1, 'u8'];
      if (f.size === bt[0] || bt[1] === 'str') vals[f.num] = read(dv, o, bt[1], f.size, def.le);
      o += f.size;
    }
    if (def.global === 206) { // field_description
      const key = `${vals[0]}:${vals[1]}`;
      devDesc[key] = { name: vals[3], units: vals[8], type: (BASE[vals[2]] || [1, 'u8'])[1], size: (BASE[vals[2]] || [1])[0] };
    }
    for (const d of def.dev) {
      const desc = devDesc[`${d.idx}:${d.num}`];
      if (desc?.name && d.size >= desc.size) {
        const v = read(dv, o, desc.type, d.size, def.le);
        if (v != null && v !== INVALID[desc.type] && !(typeof v === 'number' && isNaN(v))) {
          (out[desc.name] ||= { units: desc.units, values: [], msg: def.global }).values.push(v);
        }
      }
      o += d.size;
    }
    return o;
  }
}

// Valeurs utiles d'une séance Suunto
export function suuntoSummary(buffer) {
  const f = parseFitDevFields(buffer);
  const last = k => { const x = f[k]; return x?.values?.length ? x.values[x.values.length - 1] : null; };
  const max = k => { const x = f[k]; return x?.values?.length ? Math.max(...x.values) : null; };
  return { vo2max: last('estimated_vo2_max'), recoverySec: last('recovery_time'), peakEpoc: max('peak_epoc'), fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { units: v.units, n: v.values.length, last: v.values[v.values.length - 1], msg: v.msg }])) };
}
