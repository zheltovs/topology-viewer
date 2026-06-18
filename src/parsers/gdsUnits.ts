import type { GdsUnits } from './Gds2Parser';

/** Length units, coarse → fine, each as "meters per 1 unit". */
const LENGTH_UNITS: { m: number; label: string }[] = [
  { m: 1, label: 'm' },
  { m: 1e-3, label: 'mm' },
  { m: 1e-6, label: 'µm' },
  { m: 1e-9, label: 'nm' },
  { m: 1e-12, label: 'pm' },
  { m: 1e-15, label: 'fm' },
];

/** Formats a length in meters with an SI prefix so the value sits in [1, 1000). */
function formatLength(meters: number): string {
  if (!(meters > 0) || !Number.isFinite(meters)) return `${meters} m`;
  // Absorb floating-point noise at 1000-boundaries (e.g. 1e-9/1e-3 = 9.9999…e-7
  // should read as 1e-6 = 1 µm, not 1000 nm) before choosing the prefix.
  // Pick the prefix whose magnitude (10^(3k)) is nearest; round absorbs FP noise.
  let k = -Math.round(Math.log10(meters) / 3);
  k = Math.max(0, Math.min(LENGTH_UNITS.length - 1, k));

  // Refine: snap the displayed value into [1, 1000) by stepping a prefix if needed.
  const valueAt = (idx: number) => Number((meters / LENGTH_UNITS[idx].m).toPrecision(10));
  let v = valueAt(k);
  if (v >= 1000 && k > 0) v = valueAt(--k);
  else if (v < 1 && k < LENGTH_UNITS.length - 1) v = valueAt(++k);

  return `${trimNum(v)} ${LENGTH_UNITS[k].label}`;
}

/** Up to 4 significant digits, trailing zeros stripped; integers shown without decimals. */
function trimNum(v: number): string {
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(Number(v.toPrecision(4)));
}

export interface GdsUnitsDisplay {
  /** Size of one user unit, e.g. "1 µm". */
  userUnit: string;
  /** Size of one database unit, e.g. "1 nm". */
  dbUnit: string;
  /** Database units per user unit, e.g. 1000. */
  dbPerUser: number;
  /** Compact badge text, e.g. "µm · 1000 dbu/µm". */
  short: string;
  /** Full descriptive line for the import dialog. */
  full: string;
}

/**
 * Turns raw UNITS factors into human-readable text. Returns `null` when there is
 * no UNITS record (both factors still at their default of 1), so the UI can hide
 * the indicator for plain TXT imports / units-less GDS.
 */
export function describeGdsUnits(u: GdsUnits | undefined): GdsUnitsDisplay | null {
  if (!u) return null;
  if (u.dbToUser === 1 && u.metersPerDb === 1) return null;

  const metersPerUser = u.metersPerDb / u.dbToUser; // meters per user unit
  const dbPerUser = 1 / u.dbToUser;                 // db units per user unit
  const userUnit = formatLength(metersPerUser);
  const dbUnit = formatLength(u.metersPerDb);
  const userSym = userUnit.split(' ')[1] ?? 'u';
  const dbPerUserLabel = trimNum(dbPerUser);

  return {
    userUnit,
    dbUnit,
    dbPerUser,
    short: `${userSym} · ${dbPerUserLabel} dbu/${userSym}`,
    full: `User unit: ${userUnit} · DB unit: ${dbUnit} · ${dbPerUserLabel} dbu per user unit`,
  };
}
