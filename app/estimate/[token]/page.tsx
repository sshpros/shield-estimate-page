'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';

type Equipment = {
name: string;
quantity: number;
unit_price: number;
total: number;
primary_image_url?: string | null;
manufacturer?: string | null;
model_number?: string | null;
short_description?: string | null;
features?: string[] | null;
warranty_months?: number | null;
};

type Estimate = {
token: string;
status: string;
customer_name: string;
customer_email?: string | null;
job_site_address?: string | null;
estimate_number?: string | null;
issued_at?: string | null;
expires_at?: string | null;
equipment_line_items: Equipment[];
estimate_notes?: string | null;
estimated_labor_hours?: number | null;
estimated_labor_rate?: number | null;
estimated_labor_total?: number | null;
equipment_total: number;
tax_rate?: number | null;
tax_amount?: number | null;
total: number;
deposit_required: boolean;
deposit_amount?: number | null;
deposit_paid?: boolean;
deposit_invoice_id?: string | null;
company_logo_url?: string | null;
};

const DECLINE_REASONS = [
'Price too high',
'Going with another vendor',
'No longer needed',
'Bad timing',
'Other',
];

export default function EstimatePage() {
const { token } = useParams<{ token: string }>();
const router = useRouter();
const [estimate, setEstimate] = useState<Estimate | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [mode, setMode] = useState<'view' | 'accept' | 'decline' | 'request'>('view');
const [submitting, setSubmitting] = useState(false);
const [signatureName, setSignatureName] = useState('');
const [declineReason, setDeclineReason] = useState('');
const [declineNotes, setDeclineNotes] = useState('');
const sigRef = useRef<SignatureCanvas>(null);

useEffect(() => {
  if (!token) return;
  fetch('/api/get-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.error) setError(data.error);
      else setEstimate(data);
    })
    .catch(() => setError('Failed to load estimate.'))
    .finally(() => setLoading(false));
}, [token]);

const fmt = (n: number) => `$${(n ?? 0).toFixed(2)}`;

const submit = async (payload: any) => {
  setSubmitting(true);
  try {
    const res = await fetch('/api/submit-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...payload }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); setSubmitting(false); return; }
    setEstimate(data);

    if (payload.action === 'accept' && data.deposit_required && data.deposit_invoice_id) {
      const payUrl = `${process.env.NEXT_PUBLIC_PAYMENT_PAGE_URL}/api/payment?invoice_id=${data.deposit_invoice_id}&return_token=${token}`;
      window.location.href = payUrl;
      return;
    }
    setMode('view');
  } catch (e) {
    alert('Something went wrong. Please try again.');
  } finally {
    setSubmitting(false);
  }
};

const handleAccept = () => {
  if (!sigRef.current || sigRef.current.isEmpty()) { alert('Please sign to accept.'); return; }
  if (!signatureName.trim()) { alert('Please type your full name.'); return; }
  const signature_base64 = sigRef.current.getTrimmedCanvas().toDataURL('image/png').split(',')[1];
  submit({ action: 'accept', signature_base64, customer_signature_name: signatureName.trim() });
};

const handleDecline = () => {
  if (!declineReason) { alert('Please choose a reason.'); return; }
  submit({ action: 'decline', decline_reason: declineReason, decline_notes: declineNotes });
};

const handleRequest = () => {
  if (!declineNotes.trim()) { alert('Please describe what you would like changed.'); return; }
  submit({ action: 'request_changes', decline_notes: declineNotes });
};

if (loading) return <div className="loading">Loading estimate…</div>;
if (error || !estimate) return (
  <div className="error-state">
    <h2>Estimate Not Available</h2>
    <p>{error || 'This estimate could not be found.'}</p>
  </div>
);

const terminal = ['Accepted', 'Declined', 'Expired', 'Deposit Paid', 'Changes Requested'].includes(estimate.status);
const statusClass = `status-pill status-${estimate.status.toLowerCase().replace(/\s+/g, '-')}`;

return (
  <div className="container">
    {estimate.company_logo_url && (
      <div className="logo-wrap">
        <img src={estimate.company_logo_url} alt="Shield Low Voltage" />
      </div>
    )}

    <div className="header">
      <h1>Your Estimate</h1>
      <p>
        {estimate.estimate_number ? `#${estimate.estimate_number} · ` : ''}
        <span className={statusClass}>{estimate.status}</span>
      </p>
    </div>

    <div className="card">
      <div className="card-title">Customer</div>
      <div className="info-row"><span className="info-label">Name</span><span className="info-value">{estimate.customer_name}</span></div>
      {estimate.job_site_address && <div className="info-row"><span className="info-label">Job Site</span><span className="info-value">{estimate.job_site_address}</span></div>}
      {estimate.expires_at && <div className="info-row"><span className="info-label">Expires</span><span className="info-value">{new Date(estimate.expires_at).toLocaleDateString()}</span></div>}
    </div>

    {estimate.equipment_line_items.length > 0 && (
      <div className="card">
        <div className="card-title">Equipment</div>
        {estimate.equipment_line_items.map((item, i) => (
          <div className="equipment-item" key={i}>
            {item.primary_image_url ? (
              <img src={item.primary_image_url} alt={item.name} className="equipment-img" />
            ) : (
              <div className="equipment-img-placeholder">📦</div>
            )}
            <div className="equipment-details">
              <div className="equipment-name">{item.name}</div>
              {(item.manufacturer || item.model_number) && (
                <div className="equipment-meta">
                  {[item.manufacturer, item.model_number].filter(Boolean).join(' · ')}
                  {item.warranty_months ? ` · ${item.warranty_months}mo warranty` : ''}
                </div>
              )}
              {item.short_description && <div className="equipment-desc">{item.short_description}</div>}
              {item.features && item.features.length > 0 && (
                <div className="equipment-features">
                  {item.features.slice(0, 3).map((f, idx) => <div key={idx}>• {f}</div>)}
                </div>
              )}
              <div className="equipment-qty" style={{ marginTop: 4 }}>
                Qty {item.quantity} × {fmt(item.unit_price)}
              </div>
            </div>
            <div className="equipment-price">{fmt(item.total)}</div>
          </div>
        ))}
      </div>
    )}

    {estimate.estimate_notes && (
      <div className="card">
        <div className="card-title">Notes</div>
        <div className="notes-text">{estimate.estimate_notes}</div>
      </div>
    )}

    <div className="card">
      <div className="card-title">Pricing</div>
      <div className="totals-row"><span>Equipment</span><span>{fmt(estimate.equipment_total)}</span></div>
      {estimate.estimated_labor_total != null && estimate.estimated_labor_total > 0 && (
        <div className="totals-row">
          <span>Labor {estimate.estimated_labor_hours ? `(${estimate.estimated_labor_hours} hrs)` : ''}</span>
          <span>{fmt(estimate.estimated_labor_total)}</span>
        </div>
      )}
      {estimate.tax_amount != null && estimate.tax_amount > 0 && (
        <div className="totals-row">
          <span>Tax {estimate.tax_rate ? `(${(estimate.tax_rate * 100).toFixed(2)}%)` : ''}</span>
          <span>{fmt(estimate.tax_amount)}</span>
        </div>
      )}
      <div className="totals-row grand"><span>Total</span><span>{fmt(estimate.total)}</span></div>
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
        <button className="btn btn-primary" onClick={() => setMode('accept')}>Accept Estimate</button>
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => setMode('request')}>Request Changes</button>
          <button className="btn btn-danger" onClick={() => setMode('decline')}>Decline</button>
        </div>
      </>
    )}

    {mode === 'accept' && (
      <div className="card">
        <div className="card-title">Sign to Accept</div>
        <div className="signature-wrap">
          <SignatureCanvas ref={sigRef} canvasProps={{ className: 'signature-pad' }} penColor="#000" />
        </div>
        <div className="signature-hint">Sign above with your finger or stylus</div>
        <button className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={() => sigRef.current?.clear()}>Clear Signature</button>
        <input className="input" placeholder="Type your full name" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} />
        <button className="btn btn-primary" onClick={handleAccept} disabled={submitting}>
          {submitting ? 'Submitting…' : estimate.deposit_required ? 'Accept & Continue to Deposit' : 'Accept Estimate'}
        </button>
        <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setMode('view')}>Cancel</button>
      </div>
    )}

    {mode === 'decline' && (
      <div className="card">
        <div className="card-title">Decline Estimate</div>
        <div style={{ marginBottom: 10 }}>
          {DECLINE_REASONS.map((r) => (
            <button key={r} className={`reason-pill ${declineReason === r ? 'active' : ''}`} onClick={() => setDeclineReason(r)}>{r}</button>
          ))}
        </div>
        <textarea className="textarea" placeholder="Additional notes (optional)" value={declineNotes} onChange={(e) => setDeclineNotes(e.target.value)} />
        <button className="btn btn-danger" onClick={handleDecline} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Decline'}</button>
        <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setMode('view')}>Cancel</button>
      </div>
    )}

    {mode === 'request' && (
      <div className="card">
        <div className="card-title">Request Changes</div>
        <textarea className="textarea" placeholder="What would you like changed?" value={declineNotes} onChange={(e) => setDeclineNotes(e.target.value)} />
        <button className="btn btn-primary" onClick={handleRequest} disabled={submitting}>{submitting ? 'Submitting…' : 'Send Request'}</button>
        <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setMode('view')}>Cancel</button>
      </div>
    )}

    {terminal && (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          {estimate.status === 'Accepted' || estimate.status === 'Deposit Paid' ? '✓' : estimate.status === 'Expired' ? '⏱' : '✕'}
        </div>
        <h2 style={{ marginBottom: 6 }}>{estimate.status}</h2>
        <p style={{ color: '#8b93a7' }}>
          {estimate.status === 'Accepted' && 'Thank you! We will be in touch shortly.'}
          {estimate.status === 'Deposit Paid' && 'Your deposit has been received. We will schedule your job soon.'}
          {estimate.status === 'Declined' && 'We have recorded your response.'}
          {estimate.status === 'Changes Requested' && 'Your request has been sent. We will reach out shortly.'}
          {estimate.status === 'Expired' && 'This estimate has expired. Please contact us for a new one.'}
        </p>
      </div>
    )}

    <div className="footer-note">Shield Low Voltage · Powered by Rork</div>
  </div>
);
}
