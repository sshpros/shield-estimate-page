'use client';

// Keypad engraving page (Kyle 2026-11-01): one private link per client to
// choose the engraving on every Lutron Palladiom keypad button. Each keypad is
// drawn as its faceplate with a live preview in Lutron's engraving font
// (Helvetica, 11 or 14 pt) and text case. Entries save as the client types;
// Submit locks the list and notifies the office, which orders from it.
// Lutron confirms the final fit, so long labels warn instead of blocking.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const FN = 'https://fzzpdojbuwgmylmadupm.supabase.co/functions/v1/get-engraving';
const FN_SAVE = 'https://fzzpdojbuwgmylmadupm.supabase.co/functions/v1/submit-engraving';
const PHONE = '(928) 843-7767';

type TextCase = 'title' | 'caps' | 'lower' | 'free';
type Keypad = {
  id: string; sort: number; room: string; location: string; layout: '2' | '3' | '4' | '3RL';
  finish: string; has_stickers: boolean; labels: string[]; suggestions: string[]; note: string;
  updated_at: string; updated_by: string;
};
type Data = {
  request: { title: string; text_case: TextCase; font_pt: 11 | 14; status: 'open' | 'submitted'; submitted_at: string | null; submitted_by: string; intro: string };
  keypads: Keypad[];
};

const BUTTONS: Record<Keypad['layout'], number> = { '2': 2, '3': 3, '4': 4, '3RL': 3 };
const LAYOUT_NAME: Record<Keypad['layout'], string> = { '2': '2-button', '3': '3-button', '4': '4-button', '3RL': '3-button with raise/lower' };
const CASES: { id: TextCase; label: string }[] = [
  { id: 'title', label: 'Title Case' }, { id: 'caps', label: 'ALL CAPS' }, { id: 'lower', label: 'all lower' }, { id: 'free', label: 'As typed' },
];
// Rough per-line fit at each size; Lutron makes the final call.
const FIT: Record<11 | 14, { chars: number; lines: number }> = { 11: { chars: 14, lines: 2 }, 14: { chars: 11, lines: 2 } };

// Faceplate colors for the common Palladiom finishes (button + faceplate match).
const FINISHES: Record<string, { face: string; ink: string; metal?: boolean }> = {
  white: { face: '#f3f2ee', ink: '#9a9a96' }, almond: { face: '#ece3d2', ink: '#988f7f' }, beige: { face: '#e4d9c6', ink: '#8f8473' },
  taupe: { face: '#b9ac9c', ink: '#f5f1ea' }, gray: { face: '#8f9094', ink: '#f2f2f2' }, brown: { face: '#5a4636', ink: '#eadfd2' },
  black: { face: '#222224', ink: '#e9e9ea' }, 'satin nickel': { face: '#c7c5bf', ink: '#f8f8f6', metal: true },
  'bright nickel': { face: '#d4d4d2', ink: '#ffffff', metal: true }, 'satin chrome': { face: '#c9ccd0', ink: '#ffffff', metal: true },
  'bright chrome': { face: '#d9dcdf', ink: '#ffffff', metal: true }, 'satin brass': { face: '#c9a961', ink: '#fbf3df', metal: true },
  'bright brass': { face: '#d6b257', ink: '#fff7e0', metal: true }, 'antique brass': { face: '#8d6d3e', ink: '#f4e6c9', metal: true },
  'polished graphite': { face: '#4b4c50', ink: '#eeeeef', metal: true },
};
const finishOf = (f: string) => FINISHES[f.trim().toLowerCase()] ?? FINISHES.white;

function applyCase(s: string, c: TextCase): string {
  if (c === 'caps') return s.toUpperCase();
  if (c === 'lower') return s.toLowerCase();
  if (c === 'title') return s.toLowerCase().replace(/(^|[\s\-/&(])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return s;
}

function fitIssue(label: string, pt: 11 | 14): string | null {
  const lines = label.split('\n');
  const f = FIT[pt];
  if (lines.length > f.lines) return `More than ${f.lines} lines may not fit`;
  if (lines.some((l) => l.trim().length > f.chars)) return `Over about ${f.chars} characters per line may not fit at ${pt} pt`;
  return null;
}

const readName = () => { try { return localStorage.getItem('engraving-name') ?? ''; } catch { return ''; } };
const writeName = (n: string) => { try { localStorage.setItem('engraving-name', n); } catch { /* private mode */ } };

export default function EngravingPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { labels: string[]; note: string }>>({});
  const [saving, setSaving] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const load = useCallback(async () => {
    const r = await fetch(`${FN}?token=${token}`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) { setError('This engraving link is not available. Contact Shield if you think that is a mistake.'); return; }
    setData(j);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const k of j.keypads as Keypad[]) {
        if (!next[k.id]) next[k.id] = { labels: Array.from({ length: BUTTONS[k.layout] }, (_, i) => k.labels?.[i] ?? ''), note: k.note ?? '' };
      }
      return next;
    });
  }, [token]);

  useEffect(() => { setName(readName()); void load().catch(() => setError('Could not load your keypads. Check your connection and reload.')); }, [load]);

  const locked = data?.request.status === 'submitted';
  const textCase = data?.request.text_case ?? 'title';
  const pt = data?.request.font_pt ?? 11;
  const toEngrave = useMemo(() => (data?.keypads ?? []).filter((k) => !k.has_stickers), [data]);
  const stickered = useMemo(() => (data?.keypads ?? []).filter((k) => k.has_stickers), [data]);
  const totals = useMemo(() => {
    let filled = 0, total = 0;
    for (const k of toEngrave) {
      const d = drafts[k.id];
      total += BUTTONS[k.layout];
      filled += (d?.labels ?? []).filter((l) => l.trim()).length;
    }
    return { filled, total };
  }, [toEngrave, drafts]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch(FN_SAVE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name: readName(), ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || 'Could not save. Check your connection and try again.');
    return j;
  }, [token]);

  const saveKeypad = useCallback((id: string, d: { labels: string[]; note: string }) => {
    clearTimeout(timers.current[id]);
    setSaving((s) => ({ ...s, [id]: 'saving' }));
    timers.current[id] = setTimeout(async () => {
      try { await post({ action: 'save_keypad', keypad_id: id, labels: d.labels, note: d.note }); setSaving((s) => ({ ...s, [id]: 'saved' })); }
      catch { setSaving((s) => ({ ...s, [id]: 'error' })); }
    }, 700);
  }, [post]);

  const edit = (k: Keypad, i: number | 'note', value: string) => {
    if (locked) return;
    setDrafts((prev) => {
      const cur = prev[k.id] ?? { labels: Array(BUTTONS[k.layout]).fill(''), note: '' };
      const next = i === 'note' ? { ...cur, note: value } : { ...cur, labels: cur.labels.map((l, j) => (j === i ? value : l)) };
      saveKeypad(k.id, next);
      return { ...prev, [k.id]: next };
    });
  };

  const fillSuggestions = (k: Keypad) => {
    if (locked) return;
    setDrafts((prev) => {
      const cur = prev[k.id] ?? { labels: Array(BUTTONS[k.layout]).fill(''), note: '' };
      const next = { ...cur, labels: cur.labels.map((l, i) => (l.trim() ? l : (k.suggestions?.[i] ?? ''))) };
      saveKeypad(k.id, next);
      return { ...prev, [k.id]: next };
    });
  };

  const setStyle = async (tc: TextCase, size: 11 | 14) => {
    if (!data || locked) return;
    setData({ ...data, request: { ...data.request, text_case: tc, font_pt: size } });
    try { await post({ action: 'set_style', text_case: tc, font_pt: size }); }
    catch (e) { setNotice((e as Error).message); }
  };

  const submit = async () => {
    const n = name.trim();
    if (!n) { setNotice('Add your name so we know who approved the engravings.'); return; }
    writeName(n);
    setSubmitting(true);
    try {
      await post({ action: 'submit', name: n });
      setConfirming(false);
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setNotice((e as Error).message); }
    finally { setSubmitting(false); }
  };

  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(t); }, [notice]);

  if (error) return <main className="en"><p className="en-msg">{error}</p></main>;
  if (!data) return <main className="en"><p className="en-msg">Loading your keypads…</p></main>;
  const r = data.request;

  return (
    <main className="en">
      <header className="en-head">
        <div className="en-brand">SHIELD <em>LOW&nbsp;VOLTAGE</em></div>
        <div className="en-kicker">Lutron Palladiom · Keypad engravings</div>
      </header>

      <h1 className="en-title">{r.title || 'Your keypads'}</h1>
      {r.intro ? <p className="en-intro">{r.intro}</p> : null}

      {locked ? (
        <section className="en-banner done">
          <b>Submitted{r.submitted_by ? ` by ${r.submitted_by}` : ''}{r.submitted_at ? ` on ${new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : ''}.</b>
          <span> We&rsquo;re ordering your engraved buttons from Lutron. To change anything, call or text Shield at <span className="en-sel">{PHONE}</span>.</span>
        </section>
      ) : data.keypads.length > 0 ? (
        <p className="en-lede">
          Type what each button should say. Tap a button on a keypad to jump to it. Your entries save as you go, so you can come back and finish later.
          When everything looks right, submit at the bottom.
        </p>
      ) : null}

      {data.keypads.length === 0 ? (
        <section className="en-empty">
          <h2>Your keypad list is on its way</h2>
          <p>Shield is adding your keypads to this page. Once they&rsquo;re here, you&rsquo;ll see each one by room with a box for every button.</p>
        </section>
      ) : (
        <>
          <section className="en-style" aria-label="Engraving style">
            <div className="en-style-row">
              <span className="en-label">Text style</span>
              <div className="en-seg" role="radiogroup" aria-label="Text style">
                {CASES.map((c) => (
                  <button key={c.id} role="radio" aria-checked={textCase === c.id} className={textCase === c.id ? 'on' : ''}
                    disabled={locked} onClick={() => setStyle(c.id, pt)}>{c.label}</button>
                ))}
              </div>
            </div>
            <div className="en-style-row">
              <span className="en-label">Text size</span>
              <div className="en-seg" role="radiogroup" aria-label="Text size">
                {([11, 14] as const).map((s) => (
                  <button key={s} role="radio" aria-checked={pt === s} className={pt === s ? 'on' : ''} disabled={locked}
                    onClick={() => setStyle(textCase, s)}>{s === 11 ? 'Standard (11 pt)' : 'Large (14 pt)'}</button>
                ))}
              </div>
            </div>
            <p className="en-fine">Lutron engraves in Helvetica. The preview shows your chosen style on every keypad.</p>
          </section>

          {toEngrave.length > 0 ? (
            <div className="en-progress" aria-live="polite">
              <div className="en-bar"><i style={{ width: `${totals.total ? (totals.filled / totals.total) * 100 : 0}%` }} /></div>
              <span><b>{totals.filled}</b> of {totals.total} buttons labeled</span>
            </div>
          ) : null}

          <div className="en-list">
            {toEngrave.map((k) => {
              const d = drafts[k.id] ?? { labels: Array(BUTTONS[k.layout]).fill(''), note: '' };
              const f = finishOf(k.finish);
              const st = saving[k.id];
              return (
                <article key={k.id} className="en-kp">
                  <header className="en-kp-head">
                    <div>
                      <h2>{k.room || 'Keypad'}</h2>
                      <p>{[k.location, LAYOUT_NAME[k.layout], k.finish].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className={`en-save ${st ?? ''}`}>{st === 'saving' ? 'Saving…' : st === 'saved' ? 'Saved' : st === 'error' ? 'Not saved — retry by editing' : ''}</span>
                  </header>
                  <div className="en-kp-body">
                    <Faceplate layout={k.layout} face={f.face} ink={f.ink} metal={!!f.metal} pt={pt}
                      labels={d.labels.map((l) => applyCase(l, textCase))}
                      onTap={(i) => inputRefs.current[`${k.id}-${i}`]?.focus()} />
                    <div className="en-fields">
                      {d.labels.map((label, i) => {
                        const issue = label.trim() ? fitIssue(applyCase(label, textCase), pt) : null;
                        const id = `${k.id}-${i}`;
                        return (
                          <div key={id} className="en-field">
                            <label htmlFor={id}>{i === 0 ? 'Top button' : i === BUTTONS[k.layout] - 1 && k.layout !== '3RL' ? 'Bottom button' : `Button ${i + 1}`}</label>
                            <textarea id={id} ref={(el) => { inputRefs.current[id] = el; }} rows={label.includes('\n') ? 2 : 1}
                              value={label} placeholder={k.suggestions?.[i] ? `e.g. ${k.suggestions[i]}` : 'Engraving'} readOnly={locked}
                              onChange={(e) => edit(k, i, e.target.value)} maxLength={60} />
                            {issue ? <span className="en-warn">{issue}</span> : null}
                          </div>
                        );
                      })}
                      {k.layout === '3RL' ? <p className="en-fine">The raise / lower buttons at the bottom aren&rsquo;t engraved.</p> : null}
                      <div className="en-field">
                        <label htmlFor={`${k.id}-note`}>Notes for this keypad (optional)</label>
                        <textarea id={`${k.id}-note`} rows={1} value={d.note} readOnly={locked} placeholder="Anything we should know"
                          onChange={(e) => edit(k, 'note', e.target.value)} maxLength={500} />
                      </div>
                      {!locked && k.suggestions?.some(Boolean) && d.labels.some((l) => !l.trim()) ? (
                        <button className="en-link" onClick={() => fillSuggestions(k)}>Fill empty buttons with suggestions</button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {stickered.length > 0 ? (
            <section className="en-stickers">
              <h2>Already labeled</h2>
              <p>These keypads have labels already, so there&rsquo;s nothing to engrave.</p>
              <ul>{stickered.map((k) => <li key={k.id}><b>{k.room}</b>{k.location ? ` · ${k.location}` : ''} · {LAYOUT_NAME[k.layout]}</li>)}</ul>
            </section>
          ) : null}

          {!locked && toEngrave.length > 0 ? (
            <section className="en-submit">
              <h2>Ready to order?</h2>
              <p>
                {totals.filled < totals.total
                  ? `${totals.total - totals.filled} button${totals.total - totals.filled === 1 ? ' is' : 's are'} still blank. Blank buttons are engraved blank.`
                  : 'Every button has a label.'}
                {' '}Once you submit, we order the engraved buttons from Lutron and the list can&rsquo;t be changed here.
              </p>
              <label htmlFor="en-name">Your name</label>
              <input id="en-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name" />
              {confirming ? (
                <div className="en-confirm">
                  <span>Submit the engravings for {toEngrave.length} keypad{toEngrave.length === 1 ? '' : 's'}?</span>
                  <div className="en-actions">
                    <button className="en-btn" onClick={() => setConfirming(false)} disabled={submitting}>Keep editing</button>
                    <button className="en-btn primary" onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Yes, submit'}</button>
                  </div>
                </div>
              ) : (
                <button className="en-btn primary wide" onClick={() => (name.trim() ? setConfirming(true) : setNotice('Add your name so we know who approved the engravings.'))}>
                  Submit engravings
                </button>
              )}
            </section>
          ) : null}
        </>
      )}

      <footer className="en-foot">Questions? Call or text Shield Low Voltage at <span className="en-sel">{PHONE}</span>.</footer>
      {notice ? <div className="en-toast" role="status">{notice}</div> : null}
    </main>
  );
}

/** A Palladiom keypad face: stacked buttons with the engraving preview. */
function Faceplate({ layout, face, ink, metal, labels, pt, onTap }: {
  layout: Keypad['layout']; face: string; ink: string; metal: boolean; labels: string[]; pt: 11 | 14; onTap: (i: number) => void;
}) {
  return (
    <div className={`en-plate${metal ? ' metal' : ''}`} style={{ ['--face' as string]: face, ['--ink' as string]: ink }} aria-hidden="true">
      <div className="en-buttons">
        {labels.map((l, i) => (
          <button key={i} type="button" tabIndex={-1} className="en-btnface" onClick={() => onTap(i)}>
            <span className="en-engr" style={{ fontSize: pt === 14 ? '0.98rem' : '0.78rem' }}>{l || ' '}</span>
          </button>
        ))}
        {layout === '3RL' ? (
          <div className="en-rl"><button type="button" tabIndex={-1}>▾</button><button type="button" tabIndex={-1}>▴</button></div>
        ) : null}
      </div>
    </div>
  );
}
