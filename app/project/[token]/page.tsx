'use client';

// GC project page (Kyle 2026-10-21): one private link for the general
// contractor — our rough-in progress per floor, the timeline against their
// dates, milestones, what each trade owes us (with where it is on the plan),
// drywall releases with wall photos, and an activity feed. The GC can change
// dates and milestones, check off / comment on / photograph items, add items
// and acknowledge releases. The office can fill all of it in for them from
// the PM dashboard. No pricing anywhere on this page.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  estimates, fmtDate, fmtWhen, localDay, OWNERS, requirementOf, ruleDrops, shrinkPhoto, STATUS_COLOR, TRADE_COLOR,
  type Dates, type Estimate, type Item, type Milestone, type Project,
} from './gc';

const FN = 'https://fzzpdojbuwgmylmadupm.supabase.co/functions/v1/get-gc-project';
const FN_UPDATE = 'https://fzzpdojbuwgmylmadupm.supabase.co/functions/v1/submit-gc-update';
const NAME_KEY = 'shield-gc-name';

/** Each nav item is its own page; the hash keeps the back button and shared links working. */
const TABS = ['overview', 'timeline', 'needs', 'plans', 'releases', 'activity'] as const;
type Tab = (typeof TABS)[number];
const tabFromHash = (): Tab => {
  const h = window.location.hash.slice(1);
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : 'overview';
};

function readName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
function storeName(n: string) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode — ask again next visit */ }
}

export default function GcProjectPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [askName, setAskName] = useState(false);
  /// The write waiting on the name dialog.
  const pendingRun = useRef<((name: string) => Promise<void>) | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);
  /** Writes still saving — the reload waits for all of them. */
  const inflight = useRef(0);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [focus, setFocus] = useState<{ floor: string; locationId: string | null; itemId?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const go = useCallback((t: Tab) => {
    if (window.location.hash.slice(1) !== t) window.history.pushState(null, '', `#${t}`);
    setTab(t);
    // Land at the top of the new page, just under the header.
    const nav = navRef.current;
    if (nav && window.scrollY > nav.offsetTop) window.scrollTo({ top: nav.offsetTop });
  }, []);

  const load = useCallback(async () => {
    const r = await fetch(`${FN}?token=${token}`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) { setError(j.error ?? 'This project link is not available.'); return; }
    setData(j);
    setError(null);
  }, [token]);

  useEffect(() => { setName(readName()); void load().catch(() => setError('Could not load the project. Check your connection and reload.')); }, [load]);
  // Stay current while the page is open (techs are checking boxes off all day),
  // and catch up the moment the GC comes back to the tab.
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible' && inflight.current === 0) void load().catch(() => {}); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && inflight.current === 0) void load().catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  /**
   * Every write goes through here: asks for the GC's name once, posts, reloads.
   * Check-offs and dates pass `instant` — the page shows the change the moment
   * it's tapped and saves in the background (a failed save puts it back), and
   * nothing else on the page locks. The reload waits until no write is still
   * in flight, so a quick run of check-offs never flickers back.
   */
  const send = useCallback(async (action: string, payload: Record<string, unknown>, ok?: string, instant?: (d: Project) => Project) => {
    const run = async (n: string) => {
      if (instant) setData((d) => (d ? instant(d) : d)); else setBusy(true);
      inflight.current++;
      try {
        const r = await fetch(FN_UPDATE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name: n, action, ...payload }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? 'Could not save that.');
        if (ok) setToast({ text: ok });
      } catch (e) {
        setToast({ text: instant ? `${(e as Error).message} Your change was undone.` : (e as Error).message, bad: true });
        throw e;
      } finally {
        inflight.current--;
        // A failed instant change reloads too — that's what puts it back.
        if (inflight.current === 0) await load().catch(() => {});
        if (!instant) setBusy(false);
      }
    };
    if (!name) {
      // Ask once, then run the write with the typed name.
      return new Promise<void>((resolve, reject) => {
        setNameDraft('');
        pendingRun.current = (n: string) => run(n).then(resolve, reject);
        setAskName(true);
      });
    }
    return run(name);
  }, [token, name, load]);

  if (error) return <main className="pp"><div className="pp-err">{error}</div></main>;
  if (!data) return <main className="pp"><div className="pp-err">Loading project…</div></main>;

  const p = data.plan;
  const total = data.floors.reduce((s, f) => s + f.boxes, 0);
  const done = data.floors.reduce((s, f) => s + f.done, 0);
  const openItems = data.coordination.filter((c) => c.status === 'open');
  const est = estimates(data.floors, p.schedule, p.crew_size);
  const nextMilestone = p.milestones.filter((m) => !m.done && m.date && m.date >= localDay()).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const showOnPlan = (floor: string, locationId: string | null, itemId?: string) => {
    setFocus({ floor, locationId, itemId });
    go('plans');
  };

  return (
    <main className="pp gc">
      <header className="pp-head">
        <div className="pp-brand">SHIELD <em>LOW&nbsp;VOLTAGE</em><span>PROJECT PORTAL</span></div>
        <div className="pp-meta">Low-voltage rough-in{p.address ? <><br />{p.address}</> : null}
          {p.gc_contact.name || p.gc_contact.company ? <><br />GC: <b>{[p.gc_contact.name, p.gc_contact.company].filter(Boolean).join(' · ')}</b></> : null}</div>
      </header>

      <h1 className="pp-title">{p.title}</h1>
      <p className="pp-sub">
        {data.last_field_activity ? `Last field update ${fmtWhen(data.last_field_activity)}` : 'Field work has not started yet'}
        {' · '}Updates live
      </p>

      <nav className="pp-nav" ref={navRef}>
        {TABS.map((t) => (
          <a key={t} href={`#${t}`} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); go(t); }}>
            {t === 'overview' ? 'Overview' : t === 'timeline' ? 'Timeline' : t === 'needs' ? `What we need${openItems.length ? ` (${openItems.length})` : ''}`
              : t === 'plans' ? 'Plan sheets' : t === 'releases' ? 'Drywall releases' : 'Activity'}
          </a>
        ))}
      </nav>

      {tab === 'overview' && <section id="overview">
        <div className="gc-kpis">
          <Kpi label="Boxes roughed in" value={`${done} / ${total}`} pct={total ? done / total : 0} onClick={() => go('plans')} />
          <Kpi label="Open items" value={String(openItems.length)} sub={`${openItems.filter((c) => c.owner !== 'Shield').length} for other trades`} onClick={() => go('needs')} />
          <Kpi label="Floors released" value={`${data.floors.filter((f) => f.released_at).length} / ${data.floors.length}`} sub="Ready for drywall" onClick={() => go('releases')} />
          <Kpi label="Next milestone" value={nextMilestone ? fmtDate(nextMilestone.date) : '—'} sub={nextMilestone?.title ?? 'None scheduled'} onClick={() => go('timeline')} />
        </div>
        <div className="pp-card gc-floors">
          {data.floors.map((f) => {
            const e = est.get(f.code)!;
            return (
              <div key={f.code} className="gc-floor">
                <div className="gc-floor-top">
                  <b>{f.name}</b>
                  <span className={`gc-pill ${f.released_at ? 'ok' : e.late ? 'warn' : ''}`}>
                    {f.released_at ? `Released ${fmtDate(f.released_at)}` : f.done === 0 && f.pulled === 0 ? 'Not started' : e.late ? 'Behind drywall date' : 'In progress'}
                  </span>
                </div>
                <div className="gc-bar" aria-label={`${f.done} of ${f.boxes} done`}>
                  <span className="done" style={{ width: `${f.boxes ? (f.done / f.boxes) * 100 : 0}%` }} />
                  <span className="pulled" style={{ width: `${f.boxes ? (f.pulled / f.boxes) * 100 : 0}%` }} />
                </div>
                <div className="gc-floor-meta">
                  {f.done}/{f.boxes} boxes done{f.pulled ? ` · ${f.pulled} wired, being labeled` : ''}
                  {!f.released_at && e.finish ? ` · our estimate: done ${fmtDate(e.finish)}` : ''}
                  {p.schedule[f.code]?.drywall ? ` · drywall ${fmtDate(p.schedule[f.code]!.drywall)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
        <h2 className="pp-h2">Latest activity</h2>
        <div className="pp-card gc-activity">
          {data.activity.slice(0, 5).map((a, i) => <div key={i} className="gc-act"><span>{fmtWhen(a.at)}</span>{a.text}</div>)}
          {data.activity.length === 0 && <div className="gc-empty">Nothing yet.</div>}
          {data.activity.length > 5 && <button className="pp-link gc-more" onClick={() => go('activity')}>See all activity</button>}
        </div>
      </section>}

      {tab === 'timeline' && <section id="timeline">
        <div className="pp-band">Timeline</div>
        <p className="pp-note">
          Moves on its own as our crew checks boxes off — our finish dates come from the boxes still left and the crew on site.
        </p>
        <Gantt floors={data.floors} schedule={p.schedule} est={est} />
        <h2 className="pp-h2">Your dates</h2>
        <p className="pp-note">Change them any time — our crew plans around them and Shield is notified.</p>
        <div className="pp-card pp-tw">
          <table>
            <thead><tr><th>Floor</th><th>Our start</th><th>LV inspection</th><th>Drywall</th><th className="n">We&apos;re done</th><th /></tr></thead>
            <tbody>
              {data.floors.map((f) => <DateRow key={f.code} floor={f} dates={p.schedule[f.code]} est={est.get(f.code)!} busy={busy}
                onSave={(d) => send('set_floor_dates', { floor_code: f.code, ...d }, `${f.name} dates saved`)} />)}
            </tbody>
          </table>
        </div>
        <h2 className="pp-h2">Milestones</h2>
        <Milestones list={p.milestones} busy={busy}
          onSave={(m) => send('save_milestone', { milestone: m }, 'Milestone saved', m.id
            ? (d) => ({ ...d, plan: { ...d.plan, milestones: d.plan.milestones.map((x) => (x.id === m.id ? m : x)) } })
            : undefined)}
          onDelete={(m) => send('delete_milestone', { id: m.id }, 'Milestone removed')} />
      </section>}

      {tab === 'needs' && <section id="needs">
        <div className="pp-band"><span>What we need from each trade</span><span>{openItems.length} open</span></div>
        <p className="pp-note">Everything our rough-in depends on — outlets, blocking, clearances, inspections. Check items off as they're done, leave a note or a photo, or add anything we should know about.</p>
        <Needs items={data.coordination} floors={data.floors} busy={busy} send={send} showOnPlan={showOnPlan} />
      </section>}

      {tab === 'plans' && <section id="plans">
        <div className="pp-band">Plan sheets</div>
        <Plans data={data} focus={focus} />
      </section>}

      {tab === 'releases' && <section id="releases">
        <div className="pp-band">Drywall releases</div>
        <p className="pp-note">When every box on a floor is pulled, labeled at both ends and photographed, we release it for drywall. Anything added after a release is a change order.</p>
        {data.floors.filter((f) => f.released_at).length === 0 && <div className="pp-card gc-empty">No floors released yet.</div>}
        {data.floors.filter((f) => f.released_at).map((f) => {
          const ack = p.gc_acks[f.code];
          return (
            <div key={f.code} className="pp-card gc-release">
              <div className="gc-floor-top">
                <b>{f.name} — released {fmtDate(f.released_at, true)}</b>
                {ack
                  ? <span className="gc-pill ok">Acknowledged by {ack.name} · {fmtDate(ack.at)}</span>
                  : <button className="gc-btn" disabled={busy} onClick={() => void send('ack_release', { floor_code: f.code }, `${f.name} release acknowledged`).catch(() => {})}>Acknowledge release</button>}
              </div>
              <details>
                <summary>Wall photos ({f.walls.length})</summary>
                {f.rooms.map((r) => {
                  const ws = f.walls.filter((w) => w.room_code === r.code);
                  if (!ws.length) return null;
                  return (
                    <div key={r.code} className="gc-walls">
                      <div className="gc-walls-room">{r.name}</div>
                      <div className="gc-walls-grid">
                        {ws.map((w) => <a key={w.wall} href={w.url} target="_blank" rel="noreferrer"><img src={w.url} alt={`${r.name} ${w.wall} wall`} loading="lazy" /><span>{w.wall}</span></a>)}
                      </div>
                    </div>
                  );
                })}
              </details>
            </div>
          );
        })}
      </section>}

      {tab === 'activity' && <section id="activity">
        <div className="pp-band">Activity</div>
        <div className="pp-card gc-activity">
          {data.progress.length > 0 && (
            <div className="gc-spark" aria-label="Boxes finished per day">
              {data.progress.map((d) => {
                const max = Math.max(...data.progress.map((x) => x.boxes));
                return <div key={d.day} title={`${fmtDate(d.day)}: ${d.boxes} boxes`}><span style={{ height: `${(d.boxes / max) * 100}%` }} /><em>{fmtDate(d.day).replace(/^\w+ /, '')}</em></div>;
              })}
            </div>
          )}
          {data.activity.map((a, i) => <div key={i} className="gc-act"><span>{fmtWhen(a.at)}</span>{a.text}</div>)}
          {data.activity.length === 0 && <div className="gc-empty">Nothing yet.</div>}
        </div>
      </section>}

      <footer className="pp-foot">
        Shield Low Voltage · {name ? <>You&apos;re updating as <b>{name}</b> · <button className="pp-link" onClick={() => { setNameDraft(name); pendingRun.current = null; setAskName(true); }}>change</button> · </> : null}
        Questions? Call or text your Shield project manager. This page is private to your project — please don&apos;t share the link.
      </footer>

      {askName && (
        <div className="gc-modal" role="dialog" aria-label="Your name">
          <form className="gc-modal-card" onSubmit={(e) => {
            e.preventDefault();
            const n = nameDraft.trim();
            if (!n) return;
            storeName(n); setName(n);
            const run = pendingRun.current; pendingRun.current = null; setAskName(false);
            if (run) void run(n).catch(() => {});
          }}>
            <b>Who&apos;s making this update?</b>
            <p>Your name goes on every change so Shield knows who to follow up with. We&apos;ll remember it on this device.</p>
            <input autoFocus placeholder="Your name" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            <div className="gc-row-end">
              <button type="button" className="gc-btn ghost" onClick={() => { pendingRun.current = null; setAskName(false); }}>Cancel</button>
              <button type="submit" className="gc-btn" disabled={!nameDraft.trim()}>Continue</button>
            </div>
          </form>
        </div>
      )}
      {toast && <div className={`gc-toast ${toast.bad ? 'bad' : ''}`} role="status">{toast.text}</div>}
    </main>
  );
}

type Send = (action: string, payload: Record<string, unknown>, ok?: string, instant?: (d: Project) => Project) => Promise<void>;

/** Applies a change to one coordination item, for an instant update. */
const patchItem = (id: string, patch: Partial<Item>) => (d: Project): Project =>
  ({ ...d, coordination: d.coordination.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

function Kpi({ label, value, sub, pct, onClick }: { label: string; value: string; sub?: string; pct?: number; onClick?: () => void }) {
  return (
    <div className={`gc-kpi${onClick ? ' tap' : ''}`} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick} onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}>
      <div className="gc-kpi-label">{label}</div>
      <div className="gc-kpi-value">{value}</div>
      {pct != null && <div className="gc-bar thin"><span className="done" style={{ width: `${pct * 100}%` }} /></div>}
      {sub && <div className="gc-kpi-sub">{sub}</div>}
    </div>
  );
}

/** Where each floor stands against the GC's dates: what's done, where our forecast lands, today. */
function Gantt({ floors, schedule, est }: { floors: Project['floors']; schedule: Record<string, Dates>; est: Map<string, Estimate> }) {
  const today = localDay();
  const day = (iso: string | null | undefined) => (iso ? localDay(new Date(iso.length > 10 ? iso : `${iso}T12:00:00`)) : null);
  // The window: earliest start or activity → latest drywall or finish, with today always in view.
  const marks = floors.flatMap((f) => {
    const s = schedule[f.code] ?? {};
    return [s.start, s.inspection, s.drywall, day(f.actual?.started), day(f.actual?.roughed_in), est.get(f.code)?.finish];
  }).filter(Boolean) as string[];
  const lo = [today, ...marks].sort()[0];
  const hiDate = new Date(`${[today, ...marks].sort().pop()}T12:00:00`); hiDate.setDate(hiDate.getDate() + 1);
  const hi = localDay(hiDate);
  const t0 = new Date(`${lo}T12:00:00`).getTime();
  const span = Math.max(1, (new Date(`${hi}T12:00:00`).getTime() - t0) / 864e5 + 1);
  /** Left edge of a day's column, in % of the track. */
  const x = (d: string) => (((new Date(`${d}T12:00:00`).getTime() - t0) / 864e5) / span) * 100;
  const w = (a: string, b: string) => Math.max(100 / span, x(b) - x(a) + 100 / span);
  /** Today splits at the today line: done work ends there, the forecast starts there. */
  const now = x(today) + 50 / span;
  // Week ticks on Mondays (and the first day).
  const ticks: string[] = [];
  for (let d = new Date(`${lo}T12:00:00`); localDay(d) <= hi; d.setDate(d.getDate() + 1)) if (d.getDay() === 1 || localDay(d) === lo) ticks.push(localDay(d));
  return (
    <div className="pp-card gc-gantt">
      <div className="gc-g-axis">
        {ticks.map((t) => <span key={t} style={{ left: `${x(t)}%` }}>{fmtDate(t)}</span>)}
      </div>
      {floors.map((f) => {
        const s = schedule[f.code] ?? {};
        const e = est.get(f.code);
        const started = day(f.actual?.started);
        const doneOn = f.released_at ? day(f.released_at) : day(f.actual?.roughed_in);
        const workedTo = doneOn ?? (started ? today : null);
        const status = f.released_at ? { t: `Released ${fmtDate(f.released_at)}`, c: 'ok' }
          : !e?.finish ? { t: doneOn ? `Roughed in ${fmtDate(doneOn)}` : 'Done', c: 'ok' }
          : e.late ? { t: s.drywall && today >= s.drywall ? 'Past drywall date' : `At risk — done ${fmtDate(e.finish)}`, c: 'warn' }
          : e.spare != null ? { t: e.spare === 0 ? `On track — done ${fmtDate(e.finish)}` : `On track — ${e.spare} day${e.spare === 1 ? '' : 's'} to spare`, c: 'ok' }
          : { t: !started && e.begin && e.begin > today ? `Starts about ${fmtDate(e.begin)}` : `Done about ${fmtDate(e.finish)}`, c: '' };
        // The forecast runs from when the floor's turn comes (today for the one we're on).
        const fFrom = e?.begin && e.begin > today ? e.begin : today;
        return (
          <div key={f.code} className="gc-g-row">
            <div className="gc-g-head">
              <b>{f.name}</b>
              <span className={`gc-pill ${status.c}`}>{status.t}</span>
            </div>
            <div className="gc-g-track">
              {s.start && s.drywall && s.drywall >= s.start && <i className="gc-g-window" style={{ left: `${x(s.start)}%`, width: `${w(s.start, s.drywall)}%` }} title="Your start → drywall" />}
              {started && workedTo && <i className={`gc-g-worked ${doneOn ? 'done' : ''}`} style={{ left: `${x(started)}%`, width: `${doneOn ? w(started, workedTo) : Math.max(50 / span, now - x(started))}%` }} />}
              {e?.finish && <i className={`gc-g-forecast ${e.late ? 'late' : ''}`} style={fFrom === today
                ? { left: `${now}%`, width: `${Math.max(50 / span, x(e.finish) + 100 / span - now)}%` }
                : { left: `${x(fFrom)}%`, width: `${w(fFrom, e.finish)}%` }} />}
              {s.inspection && <i className="gc-g-insp" style={{ left: `${x(s.inspection) + 50 / span}%` }} title={`LV inspection ${fmtDate(s.inspection)}`} />}
              {s.drywall && <i className="gc-g-dry" style={{ left: `${x(s.drywall)}%` }} title={`Drywall ${fmtDate(s.drywall)}`} />}
              <i className="gc-g-today" style={{ left: `${now}%` }} />
            </div>
            <div className="gc-g-meta">
              {f.done}/{f.boxes} boxes{started ? ` · started ${fmtDate(started)}` : ''}
              {s.inspection ? ` · inspection ${fmtDate(s.inspection)}` : ''}
              {s.drywall ? ` · drywall ${fmtDate(s.drywall)}` : ''}
              {f.actual?.trimmed ? ` · trimmed out ${fmtDate(f.actual.trimmed)}` : f.actual?.trim_started ? ` · trim-out started ${fmtDate(f.actual.trim_started)}` : ''}
            </div>
          </div>
        );
      })}
      <div className="gc-g-legend">
        <span><i className="gc-g-worked" />Done</span>
        <span><i className="gc-g-forecast" />Our forecast</span>
        <span><i className="gc-g-window" />Your start → drywall</span>
        <span><i className="gc-g-insp" />Inspection</span>
        <span><i className="gc-g-dry" />Drywall</span>
        <span><i className="gc-g-today" />Today</span>
      </div>
    </div>
  );
}

function DateRow({ floor, dates, est, busy, onSave }: {
  floor: Project['floors'][number]; dates: Dates | undefined; est: { finish: string | null; late: boolean }; busy: boolean; onSave: (d: Dates) => Promise<void>;
}) {
  const [d, setD] = useState<Dates>(dates ?? {});
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setD(dates ?? {}); }, [dates, dirty]);
  const set = (k: keyof Dates, v: string) => { setDirty(true); setD({ ...d, [k]: v || undefined }); };
  return (
    <tr>
      <td className="pp-room">{floor.name}</td>
      {(['start', 'inspection', 'drywall'] as const).map((k) => (
        <td key={k}><input type="date" className="gc-input" value={d[k] ?? ''} onChange={(e) => set(k, e.target.value)} aria-label={`${floor.name} ${k}`} /></td>
      ))}
      <td className={`n ${est.late ? 'gc-late' : ''}`}>{floor.released_at ? 'Released' : est.finish ? `${fmtDate(est.finish)}${est.late ? ' · late' : ''}` : floor.actual?.roughed_in ? `Done ${fmtDate(floor.actual.roughed_in)}` : 'Done'}</td>
      <td>{dirty && <button className="gc-btn sm" disabled={busy} onClick={() => void onSave({ start: d.start ?? '', inspection: d.inspection ?? '', drywall: d.drywall ?? '' }).then(() => setDirty(false), () => {})}>Save</button>}</td>
    </tr>
  );
}

function Milestones({ list, busy, onSave, onDelete }: { list: Milestone[]; busy: boolean; onSave: (m: Milestone) => Promise<void>; onDelete: (m: Milestone) => Promise<void> }) {
  const [draft, setDraft] = useState({ title: '', date: '', owner: 'GC' });
  return (
    <div className="pp-card gc-list">
      {list.map((m) => (
        <div key={m.id} className={`gc-item ${m.done ? 'is-done' : ''}`}>
          <button className={`gc-check ${m.done ? 'on' : ''}`} aria-label={m.done ? 'Mark not done' : 'Mark done'}
            onClick={() => void onSave({ ...m, done: !m.done }).catch(() => {})}>{m.done ? '✓' : ''}</button>
          <div className="gc-item-body"><div className="gc-item-title">{m.title}</div></div>
          <input type="date" className="gc-input" value={m.date ?? ''} onChange={(e) => void onSave({ ...m, date: e.target.value || null }).catch(() => {})} aria-label={`${m.title} date`} />
          <span className="gc-owner" style={{ background: TRADE_COLOR[m.owner] ?? TRADE_COLOR.Other }}>{m.owner}</span>
          <button className="gc-x" aria-label={`Remove ${m.title}`} disabled={busy} onClick={() => window.confirm(`Remove “${m.title}”?`) && void onDelete(m).catch(() => {})}>×</button>
        </div>
      ))}
      {list.length === 0 && <div className="gc-empty">No milestones yet.</div>}
      <form className="gc-add" onSubmit={(e) => {
        e.preventDefault();
        if (!draft.title.trim()) return;
        void onSave({ id: '', title: draft.title.trim(), date: draft.date || null, owner: draft.owner, done: false })
          .then(() => setDraft({ title: '', date: '', owner: 'GC' }), () => {});
      }}>
        <input className="gc-input grow" placeholder="Add a milestone (e.g. Framing walk, Final inspection)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input type="date" className="gc-input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} aria-label="Milestone date" />
        <select className="gc-input" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} aria-label="Milestone owner">
          {OWNERS.map((o) => <option key={o}>{o}</option>)}
        </select>
        <button className="gc-btn" disabled={busy || !draft.title.trim()}>Add</button>
      </form>
    </div>
  );
}

function Needs({ items, floors, busy, send, showOnPlan }: {
  items: Item[]; floors: Project['floors']; busy: boolean; send: Send; showOnPlan: (floor: string, loc: string | null, item?: string) => void;
}) {
  const [show, setShow] = useState<'open' | 'all'>('open');
  // Rows checked off on this visit stay put (struck through) until the filter
  // changes, so the GC sees what they just did instead of the row vanishing.
  const [kept, setKept] = useState<Set<string>>(new Set());
  const keep = useCallback((id: string) => setKept((k) => new Set(k).add(id)), []);
  const filter = (f: 'open' | 'all') => { setShow(f); setKept(new Set()); };
  const [add, setAdd] = useState({ owner: 'Shield', floor_code: '', title: '', detail: '', due_date: '' });
  const floorName = (c: string) => floors.find((f) => f.code === c)?.name ?? '';
  const visible = items.filter((i) => show === 'all' || i.status === 'open' || kept.has(i.id));
  const groups = OWNERS.map((o) => ({ owner: o, list: visible.filter((i) => i.owner === o) })).filter((g) => g.list.length);
  return (
    <>
      <div className="gc-seg" role="tablist">
        <button className={show === 'open' ? 'on' : ''} onClick={() => filter('open')}>Open ({items.filter((i) => i.status === 'open').length})</button>
        <button className={show === 'all' ? 'on' : ''} onClick={() => filter('all')}>All ({items.length})</button>
      </div>
      {groups.length === 0 && <div className="pp-card gc-empty">{items.length ? 'Everything is checked off. Nice work.' : 'Nothing on the list yet.'}</div>}
      {groups.map((g) => (
        <div key={g.owner} className="pp-card gc-list">
          <div className="gc-group"><span className="gc-dot" style={{ background: TRADE_COLOR[g.owner] }} />{g.owner === 'Shield' ? 'Shield (us)' : g.owner}<em>{g.list.length}</em></div>
          {g.list.map((i) => <NeedRow key={i.id} item={i} floorName={floorName(i.floor_code)} busy={busy} send={send} keep={keep} showOnPlan={showOnPlan} />)}
        </div>
      ))}
      <form className="pp-card gc-add col" onSubmit={(e) => {
        e.preventDefault();
        if (!add.title.trim()) return;
        void send('add_item', { ...add, title: add.title.trim() }, 'Added — Shield has been notified')
          .then(() => setAdd({ owner: 'Shield', floor_code: '', title: '', detail: '', due_date: '' }), () => {});
      }}>
        <b>Add an item</b>
        <div className="gc-add">
          <select className="gc-input" value={add.owner} onChange={(e) => setAdd({ ...add, owner: e.target.value })} aria-label="Who it's for">
            {OWNERS.map((o) => <option key={o} value={o}>{o === 'Shield' ? 'For Shield' : o}</option>)}
          </select>
          <select className="gc-input" value={add.floor_code} onChange={(e) => setAdd({ ...add, floor_code: e.target.value })} aria-label="Floor">
            <option value="">Whole project</option>
            {floors.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
          </select>
          <input type="date" className="gc-input" value={add.due_date} onChange={(e) => setAdd({ ...add, due_date: e.target.value })} aria-label="Due date" />
        </div>
        <input className="gc-input" placeholder="What's needed (e.g. Cabinet layout changed in the kitchen)" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} />
        <textarea className="gc-input" rows={2} placeholder="Details (optional)" value={add.detail} onChange={(e) => setAdd({ ...add, detail: e.target.value })} />
        <div className="gc-row-end"><button className="gc-btn" disabled={busy || !add.title.trim()}>Add item</button></div>
      </form>
    </>
  );
}

function NeedRow({ item: i, floorName, busy, send, keep, showOnPlan }: {
  item: Item; floorName: string; busy: boolean; send: Send; keep: (id: string) => void; showOnPlan: (floor: string, loc: string | null, item?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(i.note);
  useEffect(() => { if (!open) setNote(i.note); }, [i.note, open]);
  const done = i.status === 'done';
  const overdue = !done && i.due_date && i.due_date < localDay();
  return (
    <div className={`gc-item ${done ? 'is-done' : ''}`}>
      <button className={`gc-check ${done ? 'on' : ''}`} aria-label={done ? 'Mark open' : 'Mark done'}
        onClick={() => {
          keep(i.id);
          void send('set_item_status', { id: i.id, done: !done }, done ? 'Reopened' : 'Marked done',
            patchItem(i.id, done ? { status: 'open', done_at: null, done_by: null } : { status: 'done', done_at: new Date().toISOString() })).catch(() => {});
        }}>{done ? '✓' : ''}</button>
      <div className="gc-item-body">
        <div className="gc-item-title">{i.title}</div>
        <div className="gc-item-meta">
          {i.detail || floorName || 'Whole project'}
          {done && i.done_by ? ` · done by ${i.done_by}` : ''}
          {i.source === 'gc' ? ' · added by the GC' : ''}
        </div>
        {i.note && !open && <div className="gc-note">{i.updated_by ? <b>{i.updated_by}: </b> : null}{i.note}</div>}
        {i.photo_url && <a href={i.photo_url} target="_blank" rel="noreferrer"><img className="gc-thumb" src={i.photo_url} alt="Attached photo" loading="lazy" /></a>}
        <div className="gc-actions">
          <button className="pp-link" onClick={() => setOpen(!open)}>{open ? 'Close' : i.note ? 'Edit note' : 'Add note'}</button>
          <label className="pp-link">{i.photo_url ? 'Replace photo' : 'Add photo'}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try { await send('set_item_photo', { id: i.id, image_base64: await shrinkPhoto(f) }, 'Photo added'); } catch { /* toast shown */ }
            }} />
          </label>
          {i.floor_code && <button className="pp-link" onClick={() => showOnPlan(i.floor_code, i.location_id, i.id)}>Show on plan</button>}
        </div>
        {open && (
          <div className="gc-note-edit">
            <textarea className="gc-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Outlet is in — 48 in. AFF, centered" />
            <button className="gc-btn sm" disabled={busy} onClick={() => void send('set_item_note', { id: i.id, note }, 'Note saved').then(() => setOpen(false), () => {})}>Save note</button>
          </div>
        )}
      </div>
      <input type="date" className={`gc-input ${overdue ? 'gc-late' : ''}`} value={i.due_date ?? ''}
        onChange={(e) => void send('set_item_date', { id: i.id, due_date: e.target.value || null }, 'Due date saved',
          patchItem(i.id, { due_date: e.target.value || null })).catch(() => {})} aria-label={`${i.title} due date`} />
    </div>
  );
}

function Plans({ data, focus }: { data: Project; focus: { floor: string; locationId: string | null; itemId?: string } | null }) {
  const sheets = data.plan.sheets;
  const [floor, setFloor] = useState(sheets[0]?.floor_code ?? '');
  const [layer, setLayer] = useState<'needs' | 'progress'>('needs');
  const [zoom, setZoom] = useState(1);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    if (!focus) return;
    setFloor(focus.floor); setLayer('needs'); setPick(focus.locationId);
  }, [focus]);
  const sheet = sheets.find((s) => s.floor_code === floor);
  const locs = useMemo(() => data.locations.filter((l) => l.floor_code === floor), [data.locations, floor]);
  const marks = layer === 'needs'
    ? locs.map((l) => ({ l, req: requirementOf(l.drop_type) })).filter((m) => m.req)
    : locs.map((l) => ({ l, req: null }));
  const focusRooms = useMemo(() => {
    // A floor-level item covers the boxes of its type in the rooms it lists.
    if (!focus?.itemId || focus.locationId || focus.floor !== floor) return null;
    const item = data.coordination.find((c) => c.id === focus.itemId);
    if (!item) return null;
    const isType = ruleDrops(item.source) ?? (() => true);
    return new Set(locs.filter((l) => isType(l.drop_type) && item.detail.includes(l.room_name)).map((l) => l.id));
  }, [focus, floor, data.coordination, locs]);
  const dimOthers = !!pick || !!focusRooms?.size;
  const picked = locs.find((l) => l.id === pick);

  if (!sheets.length) return <div className="pp-card gc-empty">Plan sheets will appear here once Shield publishes them.</div>;
  return (
    <>
      <div className="gc-plan-bar">
        <select className="gc-input" value={floor} onChange={(e) => { setFloor(e.target.value); setPick(null); }} aria-label="Floor">
          {sheets.map((s) => <option key={s.floor_code} value={s.floor_code}>{s.floor_name}</option>)}
        </select>
        <div className="gc-seg">
          <button className={layer === 'needs' ? 'on' : ''} onClick={() => setLayer('needs')}>Trade requirements</button>
          <button className={layer === 'progress' ? 'on' : ''} onClick={() => setLayer('progress')}>Our progress</button>
        </div>
        <div className="gc-seg">
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out">−</button>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="Zoom in">+</button>
        </div>
      </div>
      <div className="gc-legend">
        {layer === 'needs'
          ? Object.entries(TRADE_COLOR).filter(([t]) => marks.some((m) => m.req?.trade === t)).map(([t, c]) => <span key={t}><i style={{ background: c }} />{t}</span>)
          : [['Not started', STATUS_COLOR.todo], ['Wired', STATUS_COLOR.pulled], ['Done', STATUS_COLOR.done]].map(([t, c]) => <span key={t}><i style={{ background: c }} />{t}</span>)}
        <span className="gc-legend-hint">Tap a dot for details</span>
      </div>
      {sheet && (
        <div className="gc-plan-scroll">
          <div className="gc-plan" style={{ width: `${zoom * 100}%` }}>
            <img src={sheet.url} alt={`${sheet.floor_name} plan`} />
            {marks.map(({ l, req }) => {
              const lit = pick === l.id || focusRooms?.has(l.id);
              return (
                <button key={l.id} className={`gc-mark ${lit ? 'lit' : dimOthers ? 'dim' : ''}`} aria-label={`${l.label} ${l.device_name}`}
                  style={{ left: `${(l.x / sheet.src_w) * 100}%`, top: `${(l.y / sheet.src_h) * 100}%`, background: req ? TRADE_COLOR[req.trade] : STATUS_COLOR[l.status] ?? '#fff' }}
                  onClick={() => setPick(l.id === pick ? null : l.id)} />
              );
            })}
          </div>
        </div>
      )}
      {picked && (
        <div className="pp-card gc-picked">
          <b>{picked.room_name}</b> · {picked.device_name} <span className="gc-mono">{picked.label}</span>
          <div className="gc-item-meta">{requirementOf(picked.drop_type)?.text ?? (picked.status === 'done' ? 'Roughed in and photographed' : picked.status === 'todo' ? 'Not started' : 'Wired, being labeled')}</div>
        </div>
      )}
    </>
  );
}
