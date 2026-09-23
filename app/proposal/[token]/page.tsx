'use client';

// Interactive design proposal for customers (Kyle 2026-09-22): the frozen
// published snapshot rendered as a scrollable page — hi-res zoomable floor
// drawings, chaptered rough-in schedule, per-system sections with line
// items linked to the store, investment summary.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

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
  sheets: { floor: string; url: string; w: number; h: number }[];
  legend: { sys: string; color: string; rows: string[] }[];
};

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/// Fullscreen pan/zoom viewer for the hi-res sheets: wheel + pinch zoom,
/// drag pan, double-tap to toggle.
function SheetLightbox({ sheet, onClose }: { sheet: { floor: string; url: string; w: number; h: number }; onClose: () => void }) {
  const [t, setT] = useState({ x: 0, y: 0, s: 0 }); // s=0 → fit
  const wrap = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const lastTap = useRef(0);

  const fitScale = useCallback(() => {
    const el = wrap.current; if (!el) return 1;
    return Math.min(el.clientWidth / sheet.w, el.clientHeight / sheet.h);
  }, [sheet]);
  const scale = t.s || fitScale();

  const clampT = (nx: number, ny: number, ns: number) => {
    const el = wrap.current; if (!el) return { x: nx, y: ny, s: ns };
    const iw = sheet.w * ns, ih = sheet.h * ns;
    const maxX = Math.max(0, (iw - el.clientWidth) / 2), maxY = Math.max(0, (ih - el.clientHeight) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, nx)), y: Math.max(-maxY, Math.min(maxY, ny)), s: ns };
  };
  const zoomAt = (factor: number) => {
    const ns = Math.max(fitScale(), Math.min(6, scale * factor));
    setT((c) => clampT(c.x, c.y, ns));
  };

  return (
    <div className="pp-lightbox" role="dialog" aria-label={`${sheet.floor} drawing`}
      onWheel={(e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15); }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
        } else if (pointers.current.size === 1) {
          const now = Date.now();
          if (now - lastTap.current < 300) zoomAt(scale > fitScale() * 1.5 ? 0.01 : 2.4);
          lastTap.current = now;
        }
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2 && pinch.current) {
          const [a, b] = [...pointers.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const ns = Math.max(fitScale(), Math.min(6, pinch.current.s * (d / pinch.current.d)));
          setT((c) => clampT(c.x, c.y, ns));
        } else if (pointers.current.size === 1) {
          setT((c) => clampT(c.x + (e.clientX - prev.x), c.y + (e.clientY - prev.y), scale));
        }
      }}
      onPointerUp={(e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; }}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; }}
    >
      <div className="pp-lb-bar">
        <span>{sheet.floor}</span>
        <span className="pp-lb-hint">pinch / scroll to zoom · drag to pan · double-tap to toggle</span>
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div ref={wrap} className="pp-lb-canvas">
        <img src={sheet.url} alt={`${sheet.floor} device layout`} draggable={false}
          style={{ width: sheet.w, height: sheet.h, transform: `translate(${t.x}px, ${t.y}px) scale(${scale})` }} />
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

      <h1 className="pp-title">{title} — Systems Proposal</h1>
      {snap.meta.subtitle && <p className="pp-sub">{snap.meta.subtitle}</p>}
      <div className="pp-lede">{snap.meta.lede}</div>

      <nav className="pp-nav">
        {navItems.map((n) => <a key={n.id} href={`#${n.id}`}>{n.label}</a>)}
      </nav>

      {snap.sheets.length > 0 && (
        <section id="drawings">
          <div className="pp-band">Design Drawings — your home, planned device by device</div>
          <p className="pp-note">Tap any drawing to open it full screen — pinch and drag to inspect every placement.</p>
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
                <img src={sh.url} alt={`${sh.floor} device layout`} loading="lazy" />
                <span>{sh.floor} — tap to zoom</span>
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
        <SheetLightbox sheet={snap.sheets[lightbox]} onClose={() => setLightbox(null)} />
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
