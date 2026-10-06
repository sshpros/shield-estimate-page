// Proposal front matter (Kyle 2026-10-06): cover, full symbol legend,
// wall-plate elevation and display elevation — the AVS-style opening pages
// that make a proposal read like an engineered drawing set.
//
// SHARED FILE: an identical copy lives in shield-estimate-page
// (app/proposal/[token]/FrontMatter.tsx). It depends only on React and the
// FrontMatterData shape published in design_projects.published_proposal, so
// keep the two copies in sync when changing either.

export type FrontLegendRow = { label: string; wire: string; icon: string };
export type FrontMatterData = {
  cover: { url: string; w: number; h: number } | null;
  legendFull: { sys: string; color: string; rows: FrontLegendRow[] }[];
  wallPlates: { label: string; icon: string; color: string; heightIn: number }[];
  displays: { sizes: number[]; centerIn: number };
  racks?: RackView[];
};

/// Standard mounting heights to the CENTER of the plate, inches above finished
/// floor. Industry defaults (Kyle to confirm his house standard).
export const WALL_HEIGHTS: Record<string, { label: string; heightIn: number }> = {
  keypad_control: { label: "Josh.ai Nano / scene keypad", heightIn: 48 },
  touch_panel: { label: "Touch panel", heightIn: 54 },
  security_keypad: { label: "Security keypad", heightIn: 54 },
  doorbell: { label: "Video doorbell", heightIn: 48 },
  door_phone: { label: "Door / gate station", heightIn: 54 },
  ph_net: { label: "Data outlet", heightIn: 18 },
  rtv: { label: "TV location (behind display)", heightIn: 60 },
};
export const DISPLAY_CENTER_IN = 56;

const CSS = `
.fm-page{background:#fff;color:#16233c;border:1px solid #e2e6ec;border-radius:12px;padding:1.4rem 1.5rem;margin:1rem 0;break-before:page;break-inside:avoid;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
.fm-h{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #16233c;padding-bottom:.45rem;margin-bottom:1rem;gap:1rem;}
.fm-h b{font-size:1.05rem;letter-spacing:.06em;text-transform:uppercase;}
.fm-h span{font-size:.72rem;color:#5c6675;letter-spacing:.08em;text-transform:uppercase;}
.fm-cover{text-align:center;padding:2rem 1.5rem;}
.fm-cover img{max-width:100%;max-height:26rem;object-fit:contain;margin:0 auto 1.4rem;display:block;}
.fm-cover .fm-ph{height:14rem;border:2px dashed #cbd5e1;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#94a3b8;margin-bottom:1.4rem;}
.fm-cover h1{font-size:1.9rem;margin:.2rem 0;letter-spacing:.01em;}
.fm-cover .fm-for{font-size:1.15rem;color:#334155;margin:.2rem 0;}
.fm-cover .fm-addr{color:#5c6675;margin:.2rem 0 1.2rem;}
.fm-cover .fm-brand{font-weight:800;letter-spacing:.08em;margin-top:1.6rem;}
.fm-cover .fm-brand em{color:#1e90ff;font-style:normal;}
.fm-cover .fm-tl{font-size:.7rem;letter-spacing:.22em;color:#5c6675;}
.fm-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(15.5rem,1fr));gap:1rem;}
.fm-sys{border:1px solid #e2e6ec;border-radius:8px;overflow:hidden;break-inside:avoid;}
.fm-sys h4{margin:0;padding:.35rem .6rem;color:#fff;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;}
.fm-row{display:grid;grid-template-columns:2rem 1fr;gap:.5rem;align-items:center;padding:.35rem .6rem;border-top:1px solid #eef1f5;}
.fm-row .ic{width:1.7rem;height:1.7rem;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;background:#fff;}
.fm-row .ic img{width:1.1rem;height:1.1rem;}
.fm-row .lb{font-size:.82rem;font-weight:600;line-height:1.2;}
.fm-row .wr{font-size:.72rem;color:#5c6675;line-height:1.25;}
.fm-note{font-size:.78rem;color:#5c6675;margin-top:.8rem;line-height:1.45;}
.fm-svg{width:100%;height:auto;display:block;}
@media print{.fm-page{border:none;padding:0;margin:0;}}
`;

function Header({ title, kicker }: { title: string; kicker: string }) {
  return <div className="fm-h"><b>{title}</b><span>{kicker}</span></div>;
}

export function CoverPage({ cover, title, preparedFor, address, rev, date }: {
  cover: FrontMatterData["cover"]; title: string; preparedFor: string; address: string; rev: string; date: string;
}) {
  return (
    <div className="fm-page fm-cover" style={{ breakBefore: "auto" }}>
      <style>{CSS}</style>
      {cover ? <img src={cover.url} alt="Home rendering" /> : <div className="fm-ph">Cover image — choose one in the proposal editor</div>}
      <h1>{title}</h1>
      {preparedFor ? <div className="fm-for">Prepared for {preparedFor}</div> : null}
      {address ? <div className="fm-addr">{address}</div> : null}
      <div className="fm-tl">Low-Voltage &amp; Smart Home Systems Proposal · {rev} · {date}</div>
      <div className="fm-brand">SHIELD <em>LOW VOLTAGE</em></div>
      <div className="fm-tl">SECURITY · AV · AUTOMATION · NETWORKING</div>
    </div>
  );
}

export function LegendPage({ groups }: { groups: FrontMatterData["legendFull"] }) {
  return (
    <div className="fm-page">
      <Header title="Symbol Legend" kicker="All symbols · infrastructure / wire" />
      <div className="fm-legend">
        {groups.map((g) => (
          <div className="fm-sys" key={g.sys}>
            <h4 style={{ background: g.color }}>{g.sys}</h4>
            {g.rows.map((r) => (
              <div className="fm-row" key={r.label}>
                <div className="ic" style={{ borderColor: g.color }}>{r.icon ? <img src={r.icon} alt="" /> : null}</div>
                <div><div className="lb">{r.label}</div>{r.wire ? <div className="wr">{r.wire}</div> : null}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="fm-note">Each drawing sheet carries an <b>"If used"</b> legend listing only the symbols that appear on that sheet. All cable is home-run to the head-end shown on the drawings and labeled at both ends.</p>
    </div>
  );
}

/// Dimensioned wall elevation: each wall-mounted device type used on the
/// project at its standard height (center of plate, above finished floor).
export function WallPlatePage({ plates }: { plates: FrontMatterData["wallPlates"] }) {
  const sorted = [...plates].sort((a, b) => b.heightIn - a.heightIn);
  const colW = 40, left = 26, H = 108;
  const W = left + Math.max(1, sorted.length) * colW + 8;
  const yOf = (inch: number) => H - inch;
  // Two-line labels so neighbouring columns never collide.
  const wrap = (t: string): string[] => {
    const words = t.split(" "); const lines = [""];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if (cur && (cur + " " + w).length > 17 && lines.length < 2) lines.push(w);
      else lines[lines.length - 1] = cur ? cur + " " + w : w;
    }
    return lines;
  };
  return (
    <div className="fm-page">
      <Header title="Wall-Plate Elevation" kicker="Standard mounting heights · center of plate, A.F.F." />
      <svg className="fm-svg" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Wall plate mounting heights">
        <rect x={0} y={0} width={W} height={H} fill="#fbfcfd" />
        <line x1={0} y1={H} x2={W} y2={H} stroke="#16233c" strokeWidth={1.2} />
        {[0, 12, 24, 36, 48, 60, 72, 84, 96].map((i) => (
          <g key={i}>
            <line x1={left - 4} y1={yOf(i)} x2={W} y2={yOf(i)} stroke="#e8edf3" strokeWidth={0.35} />
            <text x={left - 6} y={yOf(i) + 1.2} fontSize={3.4} textAnchor="end" fill="#94a3b8">{i === 0 ? "FF" : `${i}"`}</text>
          </g>
        ))}
        <line x1={left} y1={yOf(48)} x2={W} y2={yOf(48)} stroke="#94a3b8" strokeWidth={0.4} strokeDasharray="2 1.5" />
        <text x={W - 2} y={yOf(48) - 1.2} fontSize={2.6} textAnchor="end" fill="#94a3b8">light switch reference 48"</text>
        {sorted.map((p, i) => {
          const cx = left + i * colW + colW / 2;
          const y = yOf(p.heightIn);
          return (
            <g key={p.label}>
              <line x1={cx - 9} y1={H} x2={cx - 9} y2={y} stroke={p.color} strokeWidth={0.45} />
              <line x1={cx - 11} y1={y} x2={cx - 7} y2={y} stroke={p.color} strokeWidth={0.45} />
              <text x={cx - 10.5} y={(H + y) / 2} fontSize={3.2} fill={p.color} fontWeight={700}
                transform={`rotate(-90 ${cx - 10.5} ${(H + y) / 2})`} textAnchor="middle">{p.heightIn}" A.F.F.</text>
              <rect x={cx - 4.5} y={y - 6} width={9} height={12} rx={1} fill="#fff" stroke="#16233c" strokeWidth={0.5} />
              {p.icon ? <image href={p.icon} x={cx - 3} y={y - 3} width={6} height={6} /> : null}
              {wrap(p.label).map((ln, li) => (
                <text key={li} x={cx} y={H + 5 + li * 3.6} fontSize={2.9} textAnchor="middle" fill="#16233c" fontWeight={600}>{ln}</text>
              ))}
            </g>
          );
        })}
      </svg>
      <p className="fm-note">Heights are to the center of the device plate above finished floor and are field-verified with your builder and designer at the pre-rough walk. Devices align horizontally with adjacent switches where practical; ceiling devices (speakers, access points, sensors) are located per the drawings.</p>
    </div>
  );
}

/// Displays drawn to scale beside a 5'10" figure at the standard center height.
export function DisplayPage({ displays }: { displays: FrontMatterData["displays"] }) {
  const sizes = [...new Set(displays.sizes)].sort((a, b) => a - b);
  const C = displays.centerIn;
  const dims = sizes.map((d) => ({ d, w: d * 0.8716, h: d * 0.4903 }));
  const gap = 10, personW = 24;
  const W = personW + 10 + dims.reduce((t, x) => t + x.w + gap, 0) + 22;
  const H = 110;
  const yOf = (inch: number) => H - inch;
  let x = personW + 10;
  return (
    <div className="fm-page">
      <Header title="Display Elevation" kicker={`Displays to scale · ${C}" to center A.F.F.`} />
      <svg className="fm-svg" viewBox={`0 0 ${W} ${H + 12}`} role="img" aria-label="Display sizes and mounting height">
        <rect x={0} y={0} width={W} height={H} fill="#fbfcfd" />
        <line x1={0} y1={H} x2={W} y2={H} stroke="#16233c" strokeWidth={1.2} />
        <line x1={0} y1={yOf(C)} x2={W} y2={yOf(C)} stroke="#1e90ff" strokeWidth={0.4} strokeDasharray="2 1.5" />
        <text x={W - 2} y={yOf(C) - 1.5} fontSize={3} textAnchor="end" fill="#1e90ff" fontWeight={700}>{C}" to center</text>
        {/* 5'10" figure */}
        <g fill="#cbd5e1">
          <circle cx={12} cy={yOf(70) + 4.5} r={4.5} />
          <rect x={7} y={yOf(61)} width={10} height={27} rx={4} />
          <rect x={7.6} y={yOf(36)} width={3.8} height={36} rx={1.6} />
          <rect x={12.6} y={yOf(36)} width={3.8} height={36} rx={1.6} />
        </g>
        <text x={12} y={H + 5} fontSize={3} textAnchor="middle" fill="#5c6675">5'-10"</text>
        {dims.map(({ d, w, h }) => {
          const x0 = x; x += w + gap;
          return (
            <g key={d}>
              <rect x={x0} y={yOf(C) - h / 2} width={w} height={h} rx={0.8} fill="#16233c" />
              <rect x={x0 + 0.8} y={yOf(C) - h / 2 + 0.8} width={w - 1.6} height={h - 1.6} rx={0.4} fill="#26385a" />
              <text x={x0 + w / 2} y={yOf(C) + 1.4} fontSize={4.2} textAnchor="middle" fill="#fff" fontWeight={800}>{d}"</text>
              <text x={x0 + w / 2} y={H + 5} fontSize={2.9} textAnchor="middle" fill="#16233c" fontWeight={600}>{d}" — {w.toFixed(1)}" W × {h.toFixed(1)}" H</text>
            </g>
          );
        })}
      </svg>
      <p className="fm-note">Standard viewing height is {C}" to the center of the display; locations over fireplaces, consoles or in bedrooms are set at the pre-rough walk. For flush in-wall mounting, the wall pocket must be at least 1" larger than the display on every side; pocket depth depends on the mount (fixed, tilt or articulating). A recessed power/data box is installed behind every display.</p>
    </div>
  );
}

export function FrontMatter({ data, title, preparedFor, address, rev, date }: {
  data: FrontMatterData; title: string; preparedFor: string; address: string; rev: string; date: string;
}) {
  return (
    <div className="fm">
      <CoverPage cover={data.cover} title={title} preparedFor={preparedFor} address={address} rev={rev} date={date} />
      <LegendPage groups={data.legendFull} />
      {data.wallPlates.length > 0 && <WallPlatePage plates={data.wallPlates} />}
      {data.displays.sizes.length > 0 && <DisplayPage displays={data.displays} />}
      {data.racks && data.racks.length > 0 && <RackPage racks={data.racks} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rack elevations (Kyle 2026-10-06). Front view, 1U = 10 units, 19" = 190.

export type RackViewItem = { id: string; kind: string; label: string; u: number; size_u: number; watts: number; ups_off?: boolean };
export type RackView = {
  name: string; height_u: number; ups_va: number; notes?: string; items: RackViewItem[];
  power: { devices: number; poe: number; total: number; pduOnly?: number; upsLoad?: number; upsWatts: number; pct: number | null; usedU: number; freeU: number };
};

const KIND_STYLE: Record<string, { fill: string; ink: string }> = {
  device: { fill: "#16233c", ink: "#fff" }, shelf: { fill: "#334155", ink: "#fff" }, patch: { fill: "#e2e8f0", ink: "#16233c" },
  cable_mgmt: { fill: "#475569", ink: "#e2e8f0" }, blank: { fill: "#f1f5f9", ink: "#94a3b8" }, fan: { fill: "#cbd5e1", ink: "#16233c" },
  ups: { fill: "#0f3d2e", ink: "#d1fae5" }, pdu: { fill: "#7c2d12", ink: "#ffedd5" }, fiber: { fill: "#0e7490", ink: "#ecfeff" },
};

export function RackSvg({ rack, selectedId, onItemDown, svgRef }: {
  rack: RackView; selectedId?: string | null;
  onItemDown?: (id: string, e: React.MouseEvent<SVGGElement>) => void;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const U = 10, rail = 18, W = 190 + rail * 2, H = rack.height_u * U;
  const yTop = (u: number, size: number) => (rack.height_u - (u + size - 1)) * U;
  return (
    <svg ref={svgRef} className="fm-svg" viewBox={`-2 -2 ${W + 4} ${H + 4}`} style={{ maxWidth: 420 }} role="img" aria-label={`${rack.name} rack elevation`}>
      <rect x={0} y={0} width={W} height={H} fill="#0b1220" rx={3} />
      {Array.from({ length: rack.height_u }, (_, i) => {
        const u = rack.height_u - i;
        return (
          <g key={u}>
            <rect x={rail} y={i * U} width={190} height={U} fill={i % 2 ? "#141d2e" : "#111827"} />
            <text x={rail / 2} y={i * U + 7} fontSize={5.5} textAnchor="middle" fill="#64748b">{u}</text>
            <text x={W - rail / 2} y={i * U + 7} fontSize={5.5} textAnchor="middle" fill="#64748b">{u}</text>
          </g>
        );
      })}
      {rack.items.map((it) => {
        const st = KIND_STYLE[it.kind] ?? KIND_STYLE.device;
        const y = yTop(it.u, it.size_u), h = it.size_u * U;
        const sel = it.id === selectedId;
        return (
          <g key={it.id} onMouseDown={onItemDown ? (e) => onItemDown(it.id, e) : undefined} style={{ cursor: onItemDown ? "grab" : "default" }}>
            <rect x={rail + 1} y={y + 0.5} width={188} height={h - 1} rx={1.5} fill={st.fill} stroke={sel ? "#38bdf8" : "#0b1220"} strokeWidth={sel ? 1.6 : 0.6} />
            {it.kind === "patch" && Array.from({ length: 24 }, (_, k) => (
              <rect key={k} x={rail + 30 + k * 6.2} y={y + 3.2} width={4.4} height={3.6} rx={0.5} fill="#64748b" />
            ))}
            {it.kind === "fan" && [0, 1, 2].map((k) => <circle key={k} cx={rail + 128 + k * 14} cy={y + h / 2} r={3.4} fill="none" stroke="#475569" strokeWidth={0.8} />)}
            {it.kind === "ups" && <circle cx={rail + 180} cy={y + 5} r={1.6} fill="#34d399" />}
            <text x={rail + (it.kind === "patch" ? 4 : 7)} y={y + Math.min(h, 10) / 2 + 2.2} fontSize={it.kind === "patch" ? 4.4 : 5.6}
              fill={it.kind === "patch" ? "#334155" : st.ink} fontWeight={600}>
              {it.kind === "patch" ? "PATCH" : it.label}
            </text>
            {it.watts > 0 && it.kind !== "patch" && (
              <text x={rail + 184} y={y + Math.min(h, 10) / 2 + 2.2} fontSize={4.6} textAnchor="end" fill={st.ink} opacity={0.75}>{it.watts}W</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function RackPowerTable({ rack }: { rack: RackView }) {
  const p = rack.power;
  const tone = p.pct == null ? "#5c6675" : p.pct > 80 ? "#c0392b" : p.pct > 70 ? "#b7791f" : "#0a7d3f";
  return (
    <table style={{ fontSize: ".78rem", borderCollapse: "collapse", width: "100%" }}>
      <tbody>
        <tr><td>Rack space</td><td style={{ textAlign: "right" }}>{p.usedU}U used · {p.freeU}U free of {rack.height_u}U</td></tr>
        <tr><td>Equipment load</td><td style={{ textAlign: "right" }}>{p.devices} W</td></tr>
        {p.poe > 0 && <tr><td>PoE load (cameras, Wi-Fi, keypads)</td><td style={{ textAlign: "right" }}>{p.poe} W</td></tr>}
        <tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{p.total} W</b></td></tr>
        {rack.ups_va > 0 && (p.pduOnly ?? 0) > 0 && <tr><td style={{ color: "#5c6675" }}>Amplifiers on switched PDU (not on UPS)</td><td style={{ textAlign: "right", color: "#5c6675" }}>−{p.pduOnly} W</td></tr>}
        {rack.ups_va > 0
          ? <tr><td>UPS {rack.ups_va} VA (~{p.upsWatts} W){(p.pduOnly ?? 0) > 0 ? ` · ${p.upsLoad} W protected` : ""}</td><td style={{ textAlign: "right", color: tone, fontWeight: 700 }}>{p.pct}% load</td></tr>
          : <tr><td colSpan={2} style={{ color: "#5c6675" }}>Surge-protected switched PDU (no UPS)</td></tr>}
      </tbody>
    </table>
  );
}

export function RackPage({ racks }: { racks: RackView[] }) {
  return (
    <div className="fm-page">
      <Header title="Rack Elevations" kicker="Equipment racks · front view · power budget" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(16rem,1fr))", gap: "1.2rem", alignItems: "start" }}>
        {racks.map((r) => (
          <div key={r.name} style={{ breakInside: "avoid" }}>
            <div style={{ fontWeight: 800, fontSize: ".85rem", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: ".4rem" }}>{r.name} · {r.height_u}U</div>
            <RackSvg rack={r} />
            <div style={{ marginTop: ".5rem" }}><RackPowerTable rack={r} /></div>
            {r.notes ? <p className="fm-note" style={{ marginTop: ".3rem" }}>{r.notes}</p> : null}
          </div>
        ))}
      </div>
      <p className="fm-note">Network, recording and control equipment run on the UPS for clean shutdown and ride-through; amplifiers run on surge-protected switched outlets. Every rack is labeled, cable-managed and documented in your as-built package.</p>
    </div>
  );
}
