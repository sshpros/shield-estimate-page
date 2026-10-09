'use client';

// Interactive design proposal for customers (Kyle 2026-09-22): the frozen
// published snapshot rendered as a scrollable page — hi-res zoomable floor
// drawings, chaptered rough-in schedule, per-system sections with line
// items linked to the store, investment summary.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FrontMatter, type FrontMatterData } from './FrontMatter';

const FN = 'https://fzzpdojbuwgmylmadupm.supabase.co/functions/v1/get-design-proposal';

type Row = { name: string; qty: number; per: number };
type Item = { desc: string; qty: number; unit: number; storeUrl: string | null };
type Section = {
  title: string; priority: string; note: string; pick: string;
  installLabel: string; installAmount: number; totalLabel: string;
  itemsTotal: number; total: number; optional: boolean; items: Item[];
};
type Snapshot = {
  publishedAt: string;
  meta: { preparedFor: string; rev: string; subtitle: string; lede: string; terms: string; chips: string[] };
  phase1: { total: number; floors: { floor: string; total: number; rooms: { room: string; total: number; rows: Row[] }[] }[] };
  sections: Section[];
  grand: number;
  sheets: Sheet[];
  legend: { sys: string; color: string; rows: string[] }[];
  frontMatter?: FrontMatterData;
};

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

type Sheet = { floor: string; url: string; preview?: string; w: number; h: number };
type View = { x: number; y: number; s: number };

const MAX_ZOOM = 2;      // sheet pixels per screen pixel; sheets are rendered ~3x, so 2 is plenty
const EDGE = 48;         // how far past the sheet edge a pan may go
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/// Fullscreen pan/zoom viewer for the hi-res sheets (Kyle 2026-10-08:
/// smooth on desktop). Zoom anchors on the cursor/fingers; a mouse wheel
/// zooms, a trackpad scrolls to pan and pinches to zoom; ← → flip sheets.
/// The transform is written straight to the DOM in an animation frame —
/// React only re-renders for the zoom readout.
function SheetLightbox({ sheets, index, onIndex, onClose }: {
  sheets: Sheet[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const sheet = sheets[index];
  const wrap = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, s: 1 });
  const frame = useRef(0);
  const anim = useRef(0);
  const [pct, setPct] = useState(0);        // zoom readout, % of fit
  const [full, setFull] = useState(false);  // hi-res loaded for this sheet
  const [dragging, setDragging] = useState(false);

  const box = () => {
    const el = wrap.current!;
    return { cw: el.clientWidth, ch: el.clientHeight };
  };
  const fitS = useCallback(() => {
    const { cw, ch } = box();
    return Math.min(cw / sheet.w, ch / sheet.h) * 0.96;
  }, [sheet]);
  const clamp = useCallback((v: View): View => {
    const { cw, ch } = box();
    const s = clampN(v.s, fitS(), MAX_ZOOM);
    const iw = sheet.w * s, ih = sheet.h * s;
    const x = iw <= cw ? (cw - iw) / 2 : clampN(v.x, cw - iw - EDGE, EDGE);
    const y = ih <= ch ? (ch - ih) / 2 : clampN(v.y, ch - ih - EDGE, EDGE);
    return { x, y, s };
  }, [sheet, fitS]);
  const paint = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const { x, y, s } = view.current;
      if (layer.current) layer.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
      setPct(Math.round((s / fitS()) * 100));
    });
  }, [fitS]);
  const set = useCallback((v: View) => { view.current = clamp(v); paint(); }, [clamp, paint]);
  /// New scale, keeping the sheet point under (px, py) fixed on screen.
  const zoomed = (from: View, px: number, py: number, ns: number): View => {
    const s = clampN(ns, fitS(), MAX_ZOOM);
    return { x: px - (px - from.x) * (s / from.s), y: py - (py - from.y) * (s / from.s), s };
  };
  const stopAnim = () => { cancelAnimationFrame(anim.current); anim.current = 0; };
  /// Eased zoom toward a target scale around a screen point.
  const animateZoom = useCallback((px: number, py: number, ns: number, ms = 220) => {
    stopAnim();
    const start = { ...view.current }, t0 = performance.now();
    const target = clampN(ns, fitS(), MAX_ZOOM);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const s = start.s * Math.pow(target / start.s, e);   // geometric — feels even
      set(zoomed(start, px, py, s));
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [fitS, set]);
  const center = () => { const { cw, ch } = box(); return [cw / 2, ch / 2] as const; };
  const fit = useCallback((animate: boolean) => {
    const [cx, cy] = center();
    if (animate) animateZoom(cx, cy, fitS());
    else { stopAnim(); set({ x: 0, y: 0, s: fitS() }); }
  }, [animateZoom, fitS, set]);

  // New sheet → fit it, start on the light preview.
  useEffect(() => { setFull(false); fit(false); }, [sheet, fit]);
  // Window resize: refit if at fit, else keep the view in bounds.
  useEffect(() => {
    const onResize = () => (view.current.s <= fitS() * 1.01 ? fit(false) : set(view.current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit, fitS, set]);
  // Warm the neighbors once this sheet is sharp, so ← → are instant.
  useEffect(() => {
    if (!full) return;
    for (const j of [index + 1, index - 1]) if (sheets[j]) new Image().src = sheets[j].url;
  }, [full, index, sheets]);
  // Page behind stays put while the viewer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const [cx, cy] = center();
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && index < sheets.length - 1) onIndex(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === '+' || e.key === '=') animateZoom(cx, cy, view.current.s * 1.5);
      else if (e.key === '-' || e.key === '_') animateZoom(cx, cy, view.current.s / 1.5);
      else if (e.key === '0') fit(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, sheets.length, onIndex, onClose, animateZoom, fit]);

  // Wheel + Safari pinch. Native listeners: React's wheel handler is
  // passive, so preventDefault was ignored and a trackpad pinch zoomed the
  // whole browser page instead of the drawing.
  useEffect(() => {
    const el = wrap.current!;
    let mode: 'pan' | 'zoom' = 'zoom', lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      const v = view.current;
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch (Chrome/Edge/Firefox send ctrl+wheel) or ctrl+wheel.
        set(zoomed(v, px, py, v.s * Math.exp(-clampN(dy, -30, 30) * 0.01)));
        return;
      }
      // Mouse wheel → zoom; trackpad two-finger scroll → pan. Decided at
      // the start of each gesture so a fast swipe can't flip mid-way.
      const now = performance.now();
      if (now - lastWheel > 250) {
        const wd = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
        const notch = e.deltaMode !== 0 || (wd ? wd % 120 === 0 : Math.abs(dy) >= 50);
        mode = dx === 0 && notch ? 'zoom' : 'pan';
      }
      lastWheel = now;
      if (mode === 'pan') set({ x: v.x - dx, y: v.y - dy, s: v.s });
      else set(zoomed(v, px, py, v.s * Math.exp(-clampN(dy, -120, 120) * 0.002)));
    };
    // Safari reports trackpad pinch as gesture events, not wheel.
    let g0 = 1;
    const onGestureStart = (e: Event) => { e.preventDefault(); g0 = view.current.s; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      const r = el.getBoundingClientRect();
      set(zoomed(view.current, ge.clientX - r.left, ge.clientY - r.top, g0 * ge.scale));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  }, [set]);

  // Drag to pan (mouse or one finger), two-finger pinch on touch screens.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; v: View } | null>(null);
  const lastTap = useRef(0);
  const local = (x: number, y: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return [x - r.left, y - r.top] as const;
  };
  const toggleAt = (px: number, py: number) => {
    const fs = fitS();
    animateZoom(px, py, view.current.s > fs * 1.3 ? fs : Math.min(MAX_ZOOM, fs * 3), 260);
  };

  const prev = index > 0, next = index < sheets.length - 1;
  return (
    <div className="pp-lightbox" role="dialog" aria-label={`${sheet.floor} drawing`}>
      <div className="pp-lb-bar">
        <span className="pp-lb-title">{sheet.floor}<em>{index + 1} / {sheets.length}</em></span>
        <span className="pp-lb-hint">Scroll or pinch to zoom · drag to move · double-click to zoom in · ← → for other sheets</span>
        <div className="pp-lb-tools">
          <button onClick={() => { const [cx, cy] = center(); animateZoom(cx, cy, view.current.s / 1.5); }} aria-label="Zoom out">−</button>
          <button className="pp-lb-pct" onClick={() => fit(true)} title="Fit to screen (0)">{pct ? `${pct}%` : 'Fit'}</button>
          <button onClick={() => { const [cx, cy] = center(); animateZoom(cx, cy, view.current.s * 1.5); }} aria-label="Zoom in">+</button>
          <button onClick={onClose} aria-label="Close" className="pp-lb-close">✕</button>
        </div>
      </div>
      <div ref={wrap} className={`pp-lb-canvas${dragging ? ' is-dragging' : ''}`}
        onDoubleClick={(e) => { const [px, py] = local(e.clientX, e.clientY); toggleAt(px, py); }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          stopAnim();
          wrap.current!.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), v: { ...view.current } };
          } else if (e.pointerType === 'touch') {
            // dblclick doesn't fire for touch — detect the double tap here.
            const now = Date.now();
            if (now - lastTap.current < 300) { const [px, py] = local(e.clientX, e.clientY); toggleAt(px, py); }
            lastTap.current = now;
          }
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const prevPt = pointers.current.get(e.pointerId);
          if (!prevPt) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const v = view.current;
          if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            set(zoomed(pinch.current.v, mx, my, pinch.current.v.s * (d / pinch.current.d)));
          } else if (pointers.current.size === 1) {
            set({ x: v.x + (e.clientX - prevPt.x), y: v.y + (e.clientY - prevPt.y), s: v.s });
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (pointers.current.size === 0) setDragging(false);
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          if (pointers.current.size === 0) setDragging(false);
        }}>
        <div ref={layer} className="pp-lb-sheet" style={{ width: sheet.w, height: sheet.h }}>
          {sheet.preview && <img src={sheet.preview} alt="" draggable={false} />}
          <img key={sheet.url} src={sheet.url} alt={`${sheet.floor} device layout`} draggable={false}
            decoding="async" className={full || !sheet.preview ? 'is-ready' : ''} onLoad={() => setFull(true)} />
        </div>
        {!full && <div className="pp-lb-loading">Loading full detail…</div>}
        {prev && <button className="pp-lb-nav is-prev" aria-label="Previous sheet"
          onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={() => onIndex(index - 1)}>‹</button>}
        {next && <button className="pp-lb-nav is-next" aria-label="Next sheet"
          onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={() => onIndex(index + 1)}>›</button>}
      </div>
    </div>
  );
}

export default function ProposalPage() {
  const { token } = useParams<{ token: string }>();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${FN}?token=${token}`);
        if (!r.ok) throw new Error('This proposal link is not available.');
        const j = await r.json();
        setSnap(j.proposal); setTitle(j.title); setAddress(j.address ?? '');
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [token]);

  if (err) return <div className="pp-err">{err}</div>;
  if (!snap) return <div className="pp-err">Loading your proposal…</div>;

  const navItems = [
    ...(snap.sheets.length ? [{ id: 'drawings', label: 'Drawings' }] : []),
    { id: 'roughin', label: 'Pre-Wire' },
    ...snap.sections.map((s) => ({ id: slug(s.title), label: s.title.split(' ')[0] })),
    { id: 'summary', label: 'Summary' },
  ];

  return (
    <div className="pp">
      <header className="pp-head">
        <div className="pp-brand">SHIELD <em>LOW&nbsp;VOLTAGE</em>
          <span>SECURITY · AV · AUTOMATION · NETWORKING</span></div>
        <div className="pp-meta">Proposal · {snap.meta.rev}
          {snap.meta.preparedFor ? <><br />Prepared for <b>{snap.meta.preparedFor}</b></> : null}
          {address ? <><br />{address}</> : null}</div>
      </header>

      {snap.frontMatter && (
        <FrontMatter data={snap.frontMatter} title={title} preparedFor={snap.meta.preparedFor} address={address} rev={snap.meta.rev}
          date={new Date(snap.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} />
      )}

      <h1 className="pp-title">{title} — Systems Proposal</h1>
      {snap.meta.subtitle && <p className="pp-sub">{snap.meta.subtitle}</p>}
      <div className="pp-lede">{snap.meta.lede}</div>

      <nav className="pp-nav">
        {navItems.map((n) => <a key={n.id} href={`#${n.id}`}>{n.label}</a>)}
      </nav>

      {snap.sheets.length > 0 && (
        <section id="drawings">
          <div className="pp-band">Design Drawings — your home, planned device by device</div>
          <p className="pp-note">Click any drawing to open it full screen — zoom in to inspect every placement.</p>
          {snap.legend.length > 0 && (
            <div className="pp-legend">
              {snap.legend.map((g) => (
                <div key={g.sys}><b style={{ color: g.color }}>{g.sys}</b> {g.rows.join(' · ')}</div>
              ))}
            </div>
          )}
          <div className="pp-sheets">
            {snap.sheets.map((sh, i) => (
              <button key={sh.floor} className="pp-sheet" onClick={() => setLightbox(i)}>
                <img src={sh.preview ?? sh.url} alt={`${sh.floor} device layout`} loading="lazy" decoding="async" />
                <span>{sh.floor} — click to zoom</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section id="roughin">
        <div className="pp-band"><span>Phase 1 · Rough-In — Structured Wiring</span><span>{money(snap.phase1.total)}</span></div>
        <p className="pp-note">The low-voltage pre-wire, pulled before drywall — every location bundles the correct cable, trim and labor. The foundation every system below plugs into.</p>
        <div className="pp-card pp-tw"><table>
          <thead><tr><th>Room</th><th>Drop</th><th className="q">Qty</th><th className="n">Per drop</th><th className="n">Ext.</th></tr></thead>
          <tbody>
            {snap.phase1.floors.map((f) => (
              <FloorRows key={f.floor} floor={f} />
            ))}
            <tr className="pp-grand-row"><td colSpan={4}>Phase 1 — Structured Wiring total</td><td className="n">{money(snap.phase1.total)}</td></tr>
          </tbody>
        </table></div>
      </section>

      {snap.sections.map((s) => (
        <section key={s.title} id={slug(s.title)}>
          <h2 className="pp-h2">
            {s.priority ? <span className={'pp-pr' + (s.optional ? ' opt' : '')}>{s.priority}</span> : null}
            {s.title}
          </h2>
          {s.note && <p className="pp-note">{s.note}</p>}
          <div className="pp-card pp-tw"><table>
            <thead><tr><th>Item</th><th className="q">Qty</th><th className="n">Unit</th><th className="n">Ext.</th></tr></thead>
            <tbody>
              {s.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.storeUrl
                    ? <a className="pp-store" href={it.storeUrl} target="_blank" rel="noreferrer">{it.desc}<span> · view in store ↗</span></a>
                    : it.desc}</td>
                  <td className="q">{it.qty}</td>
                  <td className="n">{money(it.unit)}</td>
                  <td className="n">{money(it.qty * it.unit)}</td>
                </tr>
              ))}
              {s.installLabel && (
                <>
                  <tr className="pp-sub-row"><td>Equipment</td><td /><td /><td className="n">{money(s.itemsTotal)}</td></tr>
                  <tr className="pp-sub-row"><td>{s.installLabel}</td><td /><td /><td className="n">{money(s.installAmount)}</td></tr>
                </>
              )}
              <tr className="pp-total-row"><td>{s.totalLabel}</td><td /><td /><td className="n">{money(s.total)}</td></tr>
            </tbody>
          </table></div>
          {s.pick && <p className="pp-pick">{s.pick}</p>}
        </section>
      ))}

      <section id="summary" className="pp-summary">
        <h2 className="pp-h2">Investment Summary</h2>
        <table><tbody>
          <tr><td><b>Phase 1</b> · Structured wiring (rough-in)</td><td className="n">{money(snap.phase1.total)}</td></tr>
          {snap.sections.filter((s) => !s.optional).map((s) => (
            <tr key={s.title}><td>{s.title}</td><td className="n">{money(s.total)}</td></tr>
          ))}
          <tr className="pp-grand"><td>Full system</td><td className="n">{money(snap.grand)}</td></tr>
          {snap.sections.filter((s) => s.optional).map((s) => (
            <tr key={s.title} className="pp-opt"><td>+ Optional · {s.title}</td><td className="n">{money(s.total)}</td></tr>
          ))}
        </tbody></table>
      </section>

      <div className="pp-cta-wrap"><a className="pp-cta" href="sms:+19288437767">Questions? Text Kyle — (928) 843-7767</a></div>

      <footer className="pp-foot">
        {snap.meta.terms}
        <div className="pp-chips">{snap.meta.chips.map((c) => <span key={c}>{c}</span>)}</div>
        Shield Low Voltage · shieldlowvoltage.com · (928) 843-7767
      </footer>

      {lightbox !== null && (
        <SheetLightbox sheets={snap.sheets} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

function FloorRows({ floor }: { floor: { floor: string; total: number; rooms: { room: string; total: number; rows: Row[] }[] } }) {
  return (
    <>
      <tr className="pp-floor-head"><td colSpan={5}>{floor.floor}</td></tr>
      {floor.rooms.map((r) => r.rows.map((row, i) => (
        <tr key={r.room + i}>
          {i === 0 ? <td rowSpan={r.rows.length} className="pp-room">{r.room}</td> : null}
          <td>{row.name}</td>
          <td className="q">{row.qty}</td>
          <td className="n">{money(row.per)}</td>
          <td className="n">{money(row.qty * row.per)}</td>
        </tr>
      )))}
      <tr className="pp-floor-total"><td colSpan={4}>{floor.floor} rough-in total</td><td className="n">{money(floor.total)}</td></tr>
    </>
  );
}
