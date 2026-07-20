'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import type SignatureCanvasType from 'react-signature-canvas';

type Addition = {
  description: string;
  category: string;
  part_number: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type InvoiceItem = {
  description: string;
  category: string;
  quantity: number;
  unit_price: number;
  total: number;
  is_recurring: boolean;
  removed: boolean;
};

type ChangeOrderData = {
  change_order: {
    number: string;
    status: string;
    reason: string;
    notes: string;
    net_amount_delta: number;
    created_by_name: string;
    additions: Addition[];
  };
  invoice: {
    invoice_id: string;
    payment_url: string | null;
    invoice_number: string;
    customer_name: string;
    line_items: InvoiceItem[];
    total_before: number;
    total_after: number;
    tax_rate: number;
    balance_due: number;
  };
};

const LOGO_URL =
  'https://fzzpdojbuwgmylmadupm.supabase.co/storage/v1/object/public/public-assets/logo-3d.png?v=7';

const DECLINE_REASONS = [
  'Price too high',
  'No longer needed',
  'Want different equipment',
  'Bad timing',
  'Other',
];

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function ChangeOrderPage() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const isPreview = search.get('preview') === '1';

  const [data, setData] = useState<ChangeOrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<'view' | 'approve' | 'decline' | 'changes'>('view');
  const [signatureName, setSignatureName] = useState('');
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);
  const [changeNotes, setChangeNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ status: string; payment_url?: string | null } | null>(null);

  const [SigCanvas, setSigCanvas] = useState<any>(null);
  const sigRef = useRef<SignatureCanvasType | null>(null);

  useEffect(() => {
    import('react-signature-canvas').then((mod) => setSigCanvas(() => mod.default));
  }, []);

  useEffect(() => {
    if (!params?.token) return;
    fetch('/api/get-change-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: params.token, preview: isPreview }),
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || 'Failed to load');
        setData(body);
        if (body?.invoice?.customer_name) setSignatureName(body.invoice.customer_name);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params?.token, isPreview]);

  const submit = async (payload: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/submit-change-order-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, ...payload }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Submission failed');
      setOutcome({ status: body.status, payment_url: body.payment_url });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = () => {
    const canvas = sigRef.current;
    if (!signatureName.trim()) {
      setError('Please type your name before approving.');
      return;
    }
    if (!canvas || canvas.isEmpty()) {
      setError('Please sign before approving.');
      return;
    }
    const signature_base64 = canvas.toDataURL('image/png').split(',')[1];
    submit({ action: 'approve', customer_signature_name: signatureName.trim(), signature_base64 });
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#8b93a7' }}>
          Loading change order…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#8b93a7' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const co = data.change_order;
  const inv = data.invoice;
  const resolvedStatus = outcome?.status ?? co.status;
  const isResolved = ['Applied', 'Declined', 'Voided'].includes(resolvedStatus);
  const paymentUrl = outcome?.payment_url ?? inv.payment_url;
  const delta = inv.total_after - inv.total_before;

  const statusPillClass =
    resolvedStatus === 'Applied'
      ? 'status-accepted'
      : resolvedStatus === 'Declined' || resolvedStatus === 'Voided'
        ? 'status-declined'
        : 'status-sent';

  return (
    <div className="container">
      {isPreview && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: 'rgba(139,92,246,.12)',
            border: '1px solid rgba(139,92,246,.35)',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 18 }}>👁</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#c084fc' }}>
              TECHNICIAN PREVIEW — READ ONLY
            </div>
            <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 2 }}>
              Responses are disabled in preview mode.
            </div>
          </div>
        </div>
      )}

      <div className="logo-wrap">
        <img src={LOGO_URL} alt="Shield Low Voltage" />
      </div>

      <div className="header">
        <h1>Change Order {co.number}</h1>
        <p>
          Invoice {inv.invoice_number} · {inv.customer_name}
        </p>
        <div style={{ marginTop: 8 }}>
          <span className={`status-pill ${statusPillClass}`}>{resolvedStatus}</span>
        </div>
      </div>

      {co.reason && (
        <div className="card">
          <div className="card-title">Reason for Change</div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>{co.reason}</div>
        </div>
      )}

      <div className="card">
        <div className="card-title">What&apos;s Changing</div>
        {co.additions.map((a, i) => (
          <div className="info-row" key={`add-${i}`}>
            <span style={{ color: '#4ade80' }}>
              + {a.quantity} × {a.description}
            </span>
            <span style={{ color: '#4ade80', fontWeight: 600 }}>{fmt(a.total)}</span>
          </div>
        ))}
        {inv.line_items
          .filter((li) => li.removed)
          .map((li, i) => (
            <div className="info-row" key={`rem-${i}`}>
              <span style={{ color: '#f87171', textDecoration: 'line-through' }}>
                − {li.quantity} × {li.description}
              </span>
              <span style={{ color: '#f87171', fontWeight: 600 }}>−{fmt(li.total)}</span>
            </div>
          ))}
        {co.additions.length === 0 && !inv.line_items.some((li) => li.removed) && (
          <div style={{ color: '#8b93a7', padding: '8px 0' }}>No line-item changes.</div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Your Invoice After This Change</div>
        {inv.line_items
          .filter((li) => !li.is_recurring)
          .map((li, i) => (
            <div className="info-row" key={`cur-${i}`}>
              <span
                style={
                  li.removed
                    ? { color: '#6b7280', textDecoration: 'line-through' }
                    : undefined
                }
              >
                {li.quantity} × {li.description}
              </span>
              <span
                className="info-value"
                style={
                  li.removed
                    ? { color: '#6b7280', textDecoration: 'line-through', fontWeight: 400 }
                    : undefined
                }
              >
                {fmt(li.total)}
              </span>
            </div>
          ))}
        {co.additions.map((a, i) => (
          <div className="info-row" key={`new-${i}`}>
            <span style={{ color: '#4ade80' }}>
              {a.quantity} × {a.description} <span style={{ fontSize: 11 }}>(new)</span>
            </span>
            <span className="info-value" style={{ color: '#4ade80' }}>
              {fmt(a.total)}
            </span>
          </div>
        ))}

        <div className="info-row" style={{ marginTop: 8 }}>
          <span className="info-label">Current Total</span>
          <span className="info-value" style={{ textDecoration: 'line-through', color: '#8b93a7' }}>
            {fmt(inv.total_before)}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label" style={{ fontWeight: 700, color: '#fff' }}>
            New Total
          </span>
          <span className="info-value" style={{ fontSize: 18, fontWeight: 700 }}>
            {fmt(inv.total_after)}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Change</span>
          <span
            className="info-value"
            style={{ color: delta >= 0 ? '#fb923c' : '#4ade80', fontWeight: 700 }}
          >
            {delta >= 0 ? '+' : '−'}
            {fmt(Math.abs(delta))}
          </span>
        </div>
      </div>

      {isResolved ? (
        <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>
            {resolvedStatus === 'Applied' ? '✅' : '❌'}
          </div>
          <h2 style={{ marginBottom: 8 }}>
            {resolvedStatus === 'Applied' ? 'Change Order Approved' : `Change Order ${resolvedStatus}`}
          </h2>
          <p style={{ color: '#8b93a7', marginBottom: 0 }}>
            {resolvedStatus === 'Applied'
              ? 'Your invoice has been updated with the approved changes.'
              : 'No changes were made to your invoice.'}
          </p>
          {resolvedStatus === 'Applied' && paymentUrl && (
            <a
              href={paymentUrl}
              className="btn btn-primary"
              style={{ display: 'block', marginTop: 20, textDecoration: 'none' }}
            >
              Pay Now
            </a>
          )}
        </div>
      ) : outcome ? (
        <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📨</div>
          <h2 style={{ marginBottom: 8 }}>Request Sent</h2>
          <p style={{ color: '#8b93a7', marginBottom: 0 }}>
            We received your requested changes and will follow up with an updated change order.
          </p>
        </div>
      ) : isPreview ? null : (
        <>
          {mode === 'view' && (
            <div className="card">
              <button className="btn btn-primary" onClick={() => setMode('approve')}>
                Approve These Changes
              </button>
              <div className="btn-row">
                <button className="btn btn-danger" onClick={() => setMode('decline')}>
                  Decline
                </button>
                <button className="btn btn-secondary" onClick={() => setMode('changes')}>
                  Request Changes
                </button>
              </div>
            </div>
          )}

          {mode === 'approve' && (
            <div className="card">
              <div className="card-title">Approve &amp; Sign</div>
              <input
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Type your full name"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #2d3646',
                  background: '#0a0d14',
                  color: '#fff',
                  fontSize: 15,
                  marginBottom: 12,
                }}
              />
              <div className="signature-wrap">
                {SigCanvas ? (
                  <SigCanvas
                    ref={sigRef}
                    penColor="#e5e7eb"
                    canvasProps={{ className: 'signature-pad' }}
                  />
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: '#8b93a7' }}>
                    Loading signature pad…
                  </div>
                )}
              </div>
              <div className="signature-hint">Sign above with your finger or stylus</div>
              <button
                className="btn btn-secondary"
                style={{ marginBottom: 10 }}
                onClick={() => sigRef.current?.clear()}
              >
                Clear Signature
              </button>
              <button className="btn btn-primary" disabled={submitting} onClick={handleApprove}>
                {submitting ? 'Submitting…' : `Approve — New Total ${fmt(inv.total_after)}`}
              </button>
              <button
                className="btn btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() => setMode('view')}
              >
                Back
              </button>
            </div>
          )}

          {mode === 'decline' && (
            <div className="card">
              <div className="card-title">Decline Change Order</div>
              <select
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #2d3646',
                  background: '#0a0d14',
                  color: '#fff',
                  fontSize: 15,
                  marginBottom: 12,
                }}
              >
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-danger"
                disabled={submitting}
                onClick={() => submit({ action: 'decline', decline_reason: declineReason })}
              >
                {submitting ? 'Submitting…' : 'Confirm Decline'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() => setMode('view')}
              >
                Back
              </button>
            </div>
          )}

          {mode === 'changes' && (
            <div className="card">
              <div className="card-title">Request Changes</div>
              <textarea
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                placeholder="Tell us what you'd like adjusted…"
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #2d3646',
                  background: '#0a0d14',
                  color: '#fff',
                  fontSize: 15,
                  marginBottom: 12,
                  resize: 'vertical',
                }}
              />
              <button
                className="btn btn-primary"
                disabled={submitting || !changeNotes.trim()}
                onClick={() => submit({ action: 'request_changes', change_request_notes: changeNotes.trim() })}
              >
                {submitting ? 'Submitting…' : 'Send Request'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() => setMode('view')}
              >
                Back
              </button>
            </div>
          )}

          {error && (
            <div
              className="card"
              style={{ borderColor: 'rgba(239,68,68,.4)', color: '#f87171', fontSize: 14 }}
            >
              {error}
            </div>
          )}
        </>
      )}

      <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 12, marginTop: 24 }}>
        Questions? Reply to the email this link came from and we&apos;ll get right back to you.
      </p>
    </div>
  );
}
