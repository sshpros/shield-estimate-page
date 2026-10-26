// Shapes + pure helpers for the GC project page.

export type Dates = { start?: string; inspection?: string; drywall?: string };
export type Milestone = { id: string; title: string; date: string | null; owner: string; done: boolean };
export type Sheet = { design_plan_id: string; floor_code: string; floor_name: string; url: string; w: number; h: number; src_w: number; src_h: number };
export type Floor = {
  code: string; name: string; boxes: number; done: number; pulled: number; trimmed: number; remaining_minutes: number;
  released_at: string | null;
  /** What really happened, from the field: first pull/box, last box, trim. */
  actual: { started: string | null; roughed_in: string | null; trim_started: string | null; trimmed: string | null };
  rooms: { code: string; name: string; boxes: number; done: number }[];
  walls: { room_code: string; wall: string; url: string }[];
};
export type Loc = {
  id: string; floor_code: string; room_code: string; room_name: string; label: string; device_name: string;
  drop_type: string; status: string; trim_status: string | null; x: number; y: number;
};
export type Item = {
  id: string; floor_code: string; owner: string; title: string; detail: string; due_date: string | null; status: string;
  source: string; location_id: string | null; note: string; photo_url: string | null; done_at: string | null;
  done_by: string | null; updated_by: string | null; created_at: string;
};
export type Project = {
  plan: {
    title: string; address: string; crew_size: number; schedule: Record<string, Dates>; milestones: Milestone[];
    gc_contact: { name?: string; company?: string; email?: string; phone?: string };
    gc_acks: Record<string, { at: string; name: string }>; sheets: Sheet[];
  };
  floors: Floor[]; locations: Loc[]; coordination: Item[];
  progress: { day: string; boxes: number }[];
  activity: { at: string; text: string }[];
  last_field_activity: string | null;
};

export const OWNERS = ['GC', 'Electrician', 'HVAC', 'Plumber', 'Shield', 'Other'];

export const fmtDate = (d: string | null | undefined, year = false) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }) : '—';
export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const localDay = (d = new Date()) => d.toLocaleDateString('en-CA');

export type Estimate = {
  days: number; finish: string | null; late: boolean;
  /** First day we expect to work this floor (it waits its turn in plan order). */
  begin: string | null;
  /** Workdays between our finish and drywall (negative = late). */
  spare: number | null;
};

const isWorkday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

/** Workdays from `a` to `b` (yyyy-mm-dd), counting b but not a; negative when b is before a. */
export function workdaysBetween(a: string, b: string): number {
  const sign = b >= a ? 1 : -1;
  const [lo, hi] = sign > 0 ? [a, b] : [b, a];
  const d = new Date(`${lo}T12:00:00`);
  let n = 0;
  while (localDay(d) < hi) { d.setDate(d.getDate() + 1); if (isWorkday(d)) n++; }
  return sign * n;
}

/** Half-day slots still left today: both before noon, the afternoon until 3 PM, then none. */
function slotsLeftToday(now: Date): number {
  if (!isWorkday(now)) return 0;
  const h = now.getHours();
  return h < 12 ? 2 : h < 15 ? 1 : 0;
}

/**
 * Our estimated rough-in finish per floor. The crew works the floors in plan
 * order, in half-day slots on workdays, starting with what's left of today:
 * a floor without its own start date picks up where the one before it left
 * off; a start date in the future waits for that date.
 * Days = labor minutes of the boxes not done ÷ a day's work, in half days.
 * A day's work is our real pace once we have two days on site, else the
 * plan (crew × 8 h) — so the dates move as the crew checks boxes off.
 * Late = we'd still be roughing in on (or after) the floor's drywall date.
 */
export function estimates(floors: Floor[], schedule: Record<string, Dates>, crew: number, now = new Date(),
  minutesPerDay: number | null = null): Map<string, Estimate> {
  const perDay = minutesPerDay && minutesPerDay > 0 ? minutesPerDay : Math.max(1, crew) * 8 * 60;
  const out = new Map<string, Estimate>();
  // The cursor is a day plus the half-day slots already used on it.
  let day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  let used = 2 - slotsLeftToday(now);
  for (const f of floors) {
    const days = Math.ceil((f.remaining_minutes / perDay) * 2) / 2;
    const dates = schedule[f.code];
    if (f.released_at || days === 0) { out.set(f.code, { days, finish: null, late: false, begin: null, spare: null }); continue; }
    if (dates?.start && dates.start > localDay(day)) { day = new Date(`${dates.start}T12:00:00`); used = 0; }
    let slots = days * 2;
    let finishDay = day;
    let beginDay: Date | null = null;
    while (slots > 0) {
      if (used >= 2 || !isWorkday(day)) { day = new Date(day); day.setDate(day.getDate() + 1); used = 0; continue; }
      used++; slots--; finishDay = day; beginDay ??= day;
    }
    const finish = localDay(finishDay);
    const spare = dates?.drywall ? workdaysBetween(finish, dates.drywall) - 1 : null;
    out.set(f.code, { days, finish, late: !!dates?.drywall && finish >= dates.drywall, begin: beginDay ? localDay(beginDay) : finish, spare });
  }
  return out;
}

/** The drop types a generated coordination item (source auto:<rule>:<floor>) is about. */
export function ruleDrops(source: string): ((dropType: string) => boolean) | null {
  const rule = source.startsWith('auto:') ? source.split(':')[1] : '';
  if (rule === 'tv-outlet' || rule === 'tv-blocking') return (t) => t === 'rtv';
  if (rule === 'pj-outlet' || rule === 'pj-blocking') return (t) => t === 'projector';
  if (rule === 'shade-pockets') return (t) => t === 'shade';
  if (rule === 'ap-hvac') return (t) => t === 'wap';
  if (rule === 'spk-hvac') return (t) => /speaker|subwoofer/.test(t) && !/landscape/.test(t);
  if (rule === 'life-safety') return (t) => t === 'security_smoke' || t === 'security_co';
  return null;
}

/** What a box on the plan asks of another trade — mirrors the PM's coordination rules. */
export function requirementOf(dropType: string): { trade: string; text: string } | null {
  if (dropType === 'rtv') return { trade: 'Electrician', text: 'Outlet behind the TV + blocking for the mount (GC)' };
  if (dropType === 'projector') return { trade: 'Electrician', text: 'Outlet at the projector + backing for the mount (GC)' };
  if (dropType === 'shade') return { trade: 'GC', text: 'Shade pocket / blocking at the window head' };
  if (dropType === 'wap') return { trade: 'HVAC', text: 'Keep this ceiling access point clear of duct runs' };
  if (/speaker|subwoofer/.test(dropType) && !/landscape/.test(dropType)) return { trade: 'HVAC', text: 'Keep this speaker location clear of ducts and joists' };
  if (dropType === 'security_smoke' || dropType === 'security_co') return { trade: 'Shield', text: 'Smoke / CO location — checked against the fire & code plan' };
  return null;
}

export const TRADE_COLOR: Record<string, string> = {
  GC: '#8b5cf6', Electrician: '#f59e0b', HVAC: '#0ea5e9', Plumber: '#14b8a6', Shield: '#ef4444', Other: '#94a3b8',
};
export const STATUS_COLOR: Record<string, string> = { todo: '#ffffff', pulled: '#60a5fa', done: '#22c55e', issue: '#60a5fa' };

/** Shrinks a photo to a JPEG data URL, at most `max` px on the long side. */
export async function shrinkPhoto(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that photo.')); i.src = url;
    });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
