'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import type SignatureCanvasType from 'react-signature-canvas';

type LineItem = {
name: string;
quantity: number;
unit_price: number;
total?: number;
primary_image_url?: string | null;
gallery_image_urls?: string[];
manufacturer?: string | null;
model_number?: string | null;
short_description?: string | null;
features?: string[] | null;
warranty_months?: number | null;
};

type EstimateLink = {
id: string;
token: string;
status: string;
job_id: string;
estimate_number?: string | null;
issued_at?: string | null;
expires_at?: string | null;
opened_at?: string | null;
sync_version?: number;
deposit_required?: boolean;
deposit_amount?: number | null;
deposit_paid?: boolean;
deposit_invoice_id?: string | null;
customer_email?: string | null;
};

type Job = {
id: string;
customer_id?: string | null;
customer_name: string;
address?: string | null;
job_type?: string | null;
platform?: string | null;
originating_company?: string | null;
estimate_notes?: string | null;
estimated_labor_hours?: number | null;
estimated_labor_cost?: number | null;
estimated_labor_rate?: number | null;
tax_rate?: number | null;
};

type EstimateResponse = {
estimate: EstimateLink;
job: Job;
line_items?: LineItem[] | null;
logo_url?: string | null;
expired?: boolean;
};

const DEFAULT_LOGO_URL = 'https://shield-payment-page.vercel.app/shield-logo.png';

const DECLINE_REASONS = [
'Price too high',
'Going with another vendor',
'No longer needed',
'Bad timing',
'Other',
];

export default function EstimatePage() {
const { token } = useParams<{ token: string }>();
const [data, setData] = useState<EstimateResponse | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [mode, setMode] = useState<'view' | 'accept' | 'decline' | 'request'>('view');
const [submitting, setSubmitting] = useState(false);
const [signatureName, setSignatureName] = useState('');
const [declineReason, setDeclineReason] = useState('');
const [declineNotes, setDeclineNotes] = useState('');
const [lightboxImage, setLightboxImage] = useState<string | null>(null);

const [SigCanvas, setSigCanvas] = useState<any>(null);
useEffect(() => {
  let mounted = true;
  import('react-signature-canvas').then((mod) => {
    if (mounted) setSigCanvas(() => mod.default);
  });
  return () => {
    mounted = false;
  };
}, []);

const sigRef = useRef<SignatureCanvasType | null>(null);

useEffect(() => {
  if (!token) return;
  fetch('/api/get-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.error) setError(res.error);
      else setData(res);
    })
    .catch(() => setError('Failed to load estimate.'))
    .finally(() => setLoading(false));
}, [token]);

const fmt = (n: number) => `$${(n ?? 0).toFixed(2)}`;

const lineItems: LineItem[] = useMemo(
  () => (Array.isArray(data?.line_items) ? data!.line_items! : []),
  [data]
);

const totals = useMemo(() => {
  if (!data) return { equipment: 0, labor: 0, tax: 0, total: 0 };
  const equipment = lineItems.reduce(
    (sum, li) => sum + (li.total ?? (li.quantity ?? 0) * (li.unit_price ?? 0)),
    0
  );
  const labor =
    data.job.estimated_labor_cost ??
    (data.job.estimated_labor_hours ?? 0) * (data.job.estimated_labor_rate ?? 0);
  const taxable = equipment + labor;
  const taxRate = data.job.tax_rate ?? 0;
  const tax = taxable * taxRate;
  return { equipment, labor, tax, total: taxable + tax };
}, [data, lineItems]);

const submit = async (payload: any) => {
  setSubmitting(true);
  try {
    const res = await fetch('/api/submit-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...payload }),
    });
    const result = await res.json();
    if (result.error) {
      alert(result.error);
      setSubmitting(false);
      return;
    }
    const refreshed = await fetch('/api/get-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then((r) => r.json());
    if (!refreshed.error) setData(refreshed);

    const estimate = (refreshed?.estimate ?? result?.estimate) as EstimateLink | undefined;
    if (
      payload.action === 'accept' &&
      estimate?.deposit_required &&
      estimate?.deposit_invoice_id
    ) {
      const payUrl = `${process.env.NEXT_PUBLIC_PAYMENT_PAGE_URL}/api/payment?invoice_id=${estimate.deposit_invoice_id}&return_token=${token}`;
      window.location.href = payUrl;
      return;
    }
    setMode('view');
  } catch {
    alert('Something went wrong. Please try again.');
  } finally {
    setSubmitting(false);
  }
};

const handleAccept = () => {
  const pad = sigRef.current;
  if (!pad || pad.isEmpty()) {
    alert('Please sign to accept.');
    return;
  }
  if (!signatureName.trim()) {
    alert('Please type your full name.');
    return;
  }
  const canvas =
    typeof (pad as any).getTrimmedCanvas === 'function'
      ? (pad as any).getTrimmedCanvas()
      : pad.getCanvas();
  const signature_base64 = canvas.toDataURL('image/png').split(',')[1];
  submit({
    action: 'accept',
    signature_base64,
    customer_signature_name: signatureName.trim(),
  });
};

const handleDecline = () => {
  if (!declineReason) {
    alert('Please choose a reason.');
    return;
  }
  submit({
    action: 'decline',
    decline_reason: declineReason,
    decline_notes: declineNotes,
  });
};

const handleRequest = () => {
  if (!declineNotes.trim()) {
    alert('Please describe what you would like changed.');
    return;
  }
  submit({ action: 'request_changes', decline_notes: declineNotes });
};

if (loading) return <div className="loading">Loading estimate…</div>;
if (error || !data)
  return (
    <div className="error-state">
      <h2>Estimate Not Available</h2>
      <p>{error || 'This estimate could not be found.'}</p>
    </div>
  );

const { estimate, job, logo_url } = data;
const resolvedLogo = logo_url || DEFAULT_LOGO_URL;
const terminal = [
  'Accepted',
  'Declined',
  'Expired',
  'Deposit Paid',
  'Changes Requested',
].includes(estimate.status);
const statusClass = `status-pill status-${estimate.status
  .toLowerCase()
  .replace(/\s+/g, '-')}`;

return (
  <div className="container">
    <div className="logo-wrap">
      <img src={resolvedLogo} alt="Shield Low Voltage" />
    </div>

    <div className="header">
      <h1>Your Estimate</h1>
      <p>
        {estimate.estimate_number ? `#${estimate.estimate_number} · ` : ''}
        <span className={statusClass}>{estimate.status}</span>
      </p>
    </div>

    <div className="card">
      <div className="card-title">Customer</div>
      <div className="info-row">
        <span className="info-label">Name</span>
        <span className="info-value">{job.customer_name}</span>
      </div>
      {job.address && (
        <div className="info-row">
          <span className="info-label">Job Site</span>
          <span className="info-value">{job.address}</span>
        </div>
      )}
      {job.job_type && (
        <div className="info-row">
          <span className="info-label">Service</span>
          <span className="info-value">{job.job_type}</span>
        </div>
      )}
      {estimate.expires_at && (
        <div className="info-row">
          <span className="info-label">Expires</span>
          <span className="info-value">
            {new Date(estimate.expires_at).toLocaleDateString()}
          </span>
        </div>
      )}
    </div>

    <div className="card">
      <div className="card-title">Equipment</div>
      {lineItems.length === 0 ? (
        <div style={{ color: '#8b93a7', padding: '8px 0' }}>
          No equipment listed on this estimate.
        </div>
      ) : (
        lineItems.map((item, i) => {
          const lineTotal =
            item.total ?? (item.quantity ?? 0) * (item.unit_price ?? 0);
          const gallery = (item.gallery_image_urls ?? []).filter(Boolean);
          return (
            <div className="equipment-item" key={i}>
              {item.primary_image_url ? (
                <img
                  src={item.primary_image_url}
                  alt={item.name}
                  className="equipment-img"
                  onClick={() => setLightboxImage(item.primary_image_url!)}
                  style={{ cursor: 'zoom-in' }}
                />
              ) : (
                <div className="equipment-img-placeholder">📦</div>
              )}
              <div className="equipment-details">
                <div className="equipment-name">{item.name}</div>
                {(item.manufacturer || item.model_number) && (
                  <div className="equipment-meta">
                    {[item.manufacturer, item.model_number]
                      .filter(Boolean)
                      .join(' · ')}
                    {item.warranty_months
                      ? ` · ${item.warranty_months}mo warranty`
                      : ''}
                  </div>
                )}
                {item.short_description && (
                  <div className="equipment-desc">{item.short_description}</div>
                )}
                {item.features && item.features.length > 0 && (
                  <ul className="equipment-features">
                    {item.features.slice(0, 5).map((f, idx) => (
                      <li key={idx}>
                        <span className="feature-check">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                {gallery.length > 0 && (
                  <div className="gallery-strip">
                    {gallery.slice(0, 6).map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`${item.name} ${idx + 1}`}
                        className="gallery-thumb"
                        onClick={() => setLightboxImage(url)}
                      />
                    ))}
                  </div>
                )}
                <div className="equipment-qty" style={{ marginTop: 6 }}>
                  Qty {item.quantity} × {fmt(item.unit_price)}
                </div>
              </div>
              <div className="equipment-price">{fmt(lineTotal)}</div>
            </div>
          );
        })
      )}
    </div>

    {job.estimate_notes && (
      <div className="card">
        <div className="card-title">Notes</div>
        <div className="notes-text">{job.estimate_notes}</div>
      </div>
    )}

    <div className="card">
      <div className="card-title">Pricing</div>
      <div className="totals-row">
        <span>Equipment</span>
        <span>{fmt(totals.equipment)}</span>
      </div>
      {totals.labor > 0 && (
        <div className="totals-row">
          <span>
            Labor
            {job.estimated_labor_hours ? ` (${job.estimated_labor_hours} hrs)` : ''}
          </span>
          <span>{fmt(totals.labor)}</span>
        </div>
      )}
      {totals.tax > 0 && (
        <div className="totals-row">
          <span>
            Tax {job.tax_rate ? `(${(job.tax_rate * 100).toFixed(2)}%)` : ''}
          </span>
          <span>{fmt(totals.tax)}</span>
        </div>
      )}
      <div className="totals-row grand">
        <span>Total</span>
        <span>{fmt(totals.total)}</span>
      </div>
      {estimate.deposit_required && estimate.deposit_amount != null && (
        <div className="deposit-badge">
          {estimate.deposit_paid
            ? `✓ Deposit of ${fmt(estimate.deposit_amount)} received`
            : `Deposit of ${fmt(estimate.deposit_amount)} required to start work`}
        </div>
      )}
    </div>

    {!terminal && mode === 'view' && (
      <>
        <button className="btn btn-primary" onClick={() => setMode('accept')}>
          Accept Estimate
        </button>
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => setMode('request')}>
            Request Changes
          </button>
          <button className="btn btn-danger" onClick={() => setMode('decline')}>
            Decline
          </button>
        </div>
      </>
    )}

    {mode === 'accept' && (
      <div className="card">
        <div className="card-title">Sign to Accept</div>
        <div className="signature-wrap">
          {SigCanvas ? (
            <SigCanvas
              ref={sigRef}
              canvasProps={{ className: 'signature-pad' }}
              penColor="#000"
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
          style={{ marginBottom: 12 }}
          onClick={() => sigRef.current?.clear()}
        >
          Clear Signature
        </button>
        <input
          className="input"
          placeholder="Type your full name"
          value={signatureName}
          onChange={(e) => setSignatureName(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={handleAccept}
          disabled={submitting || !SigCanvas}
        >
          {submitting
            ? 'Submitting…'
            : estimate.deposit_required
            ? 'Accept & Continue to Deposit'
            : 'Accept Estimate'}
        </button>
        <button
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          onClick={() => setMode('view')}
        >
          Cancel
        </button>
      </div>
    )}

    {mode === 'decline' && (
      <div className="card">
        <div className="card-title">Decline Estimate</div>
        <div style={{ marginBottom: 10 }}>
          {DECLINE_REASONS.map((r) => (
            <button
              key={r}
              className={`reason-pill ${declineReason === r ? 'active' : ''}`}
              onClick={() => setDeclineReason(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          className="textarea"
          placeholder="Additional notes (optional)"
          value={declineNotes}
          onChange={(e) => setDeclineNotes(e.target.value)}
        />
        <button className="btn btn-danger" onClick={handleDecline} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Decline'}
        </button>
        <button
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          onClick={() => setMode('view')}
        >
          Cancel
        </button>
      </div>
    )}

    {mode === 'request' && (
      <div className="card">
        <div className="card-title">Request Changes</div>
        <textarea
          className="textarea"
          placeholder="What would you like changed?"
          value={declineNotes}
          onChange={(e) => setDeclineNotes(e.target.value)}
        />
        <button className="btn btn-primary" onClick={handleRequest} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Send Request'}
        </button>
        <button
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          onClick={() => setMode('view')}
        >
          Cancel
        </button>
      </div>
    )}

    {terminal && (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          {estimate.status === 'Accepted' || estimate.status === 'Deposit Paid'
            ? '✓'
            : estimate.status === 'Expired'
            ? '⏱'
            : '✕'}
        </div>
        <h2 style={{ marginBottom: 6 }}>{estimate.status}</h2>
        <p style={{ color: '#8b93a7' }}>
          {estimate.status === 'Accepted' &&
            'Thank you! We will be in touch shortly.'}
          {estimate.status === 'Deposit Paid' &&
            'Your deposit has been received. We will schedule your job soon.'}
          {estimate.status === 'Declined' && 'We have recorded your response.'}
          {estimate.status === 'Changes Requested' &&
            'Your request has been sent. We will reach out shortly.'}
          {estimate.status === 'Expired' &&
            'This estimate has expired. Please contact us for a new one.'}
        </p>
      </div>
    )}

    {lightboxImage && (
      <div
        className="lightbox"
        onClick={() => setLightboxImage(null)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          cursor: 'zoom-out',
        }}
      >
        <img
          src={lightboxImage}
          alt=""
          style={{ maxWidth: '92%', maxHeight: '92%', borderRadius: 8 }}
        />
      </div>
    )}

    <div className="footer-note">Shield Low Voltage · Powered by Rork</div>
  </div>
);
}
