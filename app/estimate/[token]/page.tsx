'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import type SignatureCanvasType from 'react-signature-canvas';

type LineItem = {
  name: string;
  quantity: number;
  unit_price: number;
  total?: number;
  tier_index?: number;
  primary_image_url?: string | null;
  gallery_image_urls?: string[];
  manufacturer?: string | null;
  model_number?: string | null;
  short_description?: string | null;
  features?: string[] | null;
  warranty_months?: number | null;
  warranty_description?: string | null;
};

type Tier = {
  index: number;
  label: string;
  is_recommended: boolean;
  is_accepted: boolean;
  line_items: LineItem[];
  equipment_total: number;
  labor_total: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  deposit_percent: number;
  deposit_amount: number;
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
  subtotal?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  labor_total?: number | null;
  equipment_total?: number | null;
  total_amount?: number | null;
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
  is_tiered?: boolean;
  tiers?: Tier[] | null;
  recommended_tier_index?: number;
  accepted_tier_index?: number;
  tier_labels?: string[];
};

const DEFAULT_LOGO_URL =
  'https://fzzpdojbuwgmylmadupm.supabase.co/storage/v1/object/public/public-assets/logo.jpg';
const PAYMENT_PAGE_URL =
  process.env.NEXT_PUBLIC_PAYMENT_PAGE_URL || 'https://shield-payment-page.vercel.app';

const DECLINE_REASONS = [
  'Price too high',
  'Going with another vendor',
  'No longer needed',
  'Bad timing',
  'Other',
];

function resolveLogoUrl(raw?: string | null): string {
  const val = (raw ?? '').trim();
  if (!val) return DEFAULT_LOGO_URL;
  if (/^https?:\/\//i.test(val)) return val;
  const path = val.replace(/^\/+/, '').replace(/^public-assets\//, '');
  return `https://fzzpdojbuwgmylmadupm.supabase.co/storage/v1/object/public/public-assets/${path}`;
}

function normalizeTaxRatePct(raw: number | null | undefined): number {
  const n = Number(raw ?? 0);
  if (!isFinite(n) || n <= 0) return 0;
  return n > 1 ? n : n * 100;
}

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
  const [logoSrc, setLogoSrc] = useState<string>(DEFAULT_LOGO_URL);
  const [logoFailed, setLogoFailed] = useState(false);
  const [selectedTierIndex, setSelectedTierIndex] = useState<number>(0);

  const [SigCanvas, setSigCanvas] = useState<any>(null);
  useEffect(() => {
    let mounted = true;
    import('react-signature-canvas').then((mod) => {
      if (mounted) setSigCanvas(() => mod.default);
    });
    return () => { mounted = false; };
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
        else {
          setData(res);
          const resolved = resolveLogoUrl(res?.logo_url);
          setLogoSrc(resolved);
          setLogoFailed(false);
          // Default to recommended tier, or accepted tier if already accepted
          if (res.is_tiered) {
            const accepted = res.accepted_tier_index ?? -1;
            const recommended = res.recommended_tier_index ?? 0;
            setSelectedTierIndex(accepted >= 0 ? accepted : recommended);
          }
        }
      })
      .catch(() => setError('Failed to load estimate.'))
      .finally(() => setLoading(false));
  }, [token]);

  const fmt = (n: number) => `$${(n ?? 0).toFixed(2)}`;

  const isTiered = Boolean(data?.is_tiered && data?.tiers?.length);
  const tiers: Tier[] = isTiered ? (data!.tiers ?? []) : [];
  const activeTier: Tier | null = isTiered ? (tiers[selectedTierIndex] ?? tiers[0] ?? null) : null;

  const lineItems: LineItem[] = useMemo(() => {
    if (isTiered && activeTier) return activeTier.line_items ?? [];
    return Array.isArray(data?.line_items) ? data!.line_items! : [];
  }, [data, isTiered, activeTier]);

  const displayTaxRatePct = useMemo(
    () => normalizeTaxRatePct(data?.job?.tax_rate ?? data?.estimate?.tax_rate ?? 0),
    [data]
  );

  const totals = useMemo(() => {
    if (!data) return { equipment: 0, labor: 0, tax: 0, total: 0 };

    if (isTiered && activeTier) {
      return {
        equipment: activeTier.equipment_total,
        labor: activeTier.labor_total,
        tax: activeTier.tax_amount,
        total: activeTier.total,
      };
    }

    const equipment = lineItems.reduce(
      (sum, li) => sum + (li.total ?? (li.quantity ?? 0) * (li.unit_price ?? 0)),
      0
    );
    const labor =
      data.job.estimated_labor_cost ??
      (data.job.estimated_labor_hours ?? 0) * (data.job.estimated_labor_rate ?? 0);
    const taxable = equipment + labor;

    const serverTax = data.estimate?.tax_amount;
    let tax: number;
    if (serverTax != null && Number(serverTax) >= 0) {
      tax = Number(serverTax);
    } else {
      const taxRatePct = normalizeTaxRatePct(data.job.tax_rate);
      tax = taxable * (taxRatePct / 100);
    }

    const serverTotal = data.estimate?.total_amount;
    const total =
      serverTotal != null && Number(serverTotal) > 0
        ? Number(serverTotal)
        : taxable + tax;

    return { equipment, labor, tax, total };
  }, [data, lineItems, isTiered, activeTier]);

  const depositAmount = useMemo(() => {
    if (isTiered && activeTier) return activeTier.deposit_amount;
    return data?.estimate?.deposit_amount ?? null;
  }, [data, isTiered, activeTier]);

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
      const depositInvoiceId =
        estimate?.deposit_invoice_id ?? result?.deposit_invoice?.id ?? null;

      if (
        payload.action === 'accept' &&
        estimate?.deposit_required &&
        depositInvoiceId
      ) {
        const payUrl = `${PAYMENT_PAGE_URL}/api/payment?invoice_id=${depositInvoiceId}&return_token=${token}`;
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
      ...(isTiered ? { accepted_tier_index: selectedTierIndex } : {}),
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

  const { estimate, job } = data;
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
      <div
        className="logo-wrap"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px 0',
        }}
      >
        {!logoFailed ? (
          <img
            src={logoSrc}
            alt="Shield Low Voltage"
            style={{
              maxWidth: 220,
              maxHeight: 120,
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
            onError={() => {
              if (logoSrc !== DEFAULT_LOGO_URL) {
                setLogoSrc(DEFAULT_LOGO_URL);
              } else {
                setLogoFailed(true);
              }
            }}
          />
        ) : (
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5, color: '#fff' }}>
            Shield Low Voltage
          </div>
        )}
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

      {/* Tier picker — only shown for tiered estimates */}
      {isTiered && tiers.length > 0 && (
        <div className="card">
          <div className="card-title">Choose Your Package</div>
          <div className="tier-picker">
            {tiers.map((tier) => (
              <button
                key={tier.index}
                className={[
                  'tier-btn',
                  selectedTierIndex === tier.index ? 'tier-btn-active' : '',
                  tier.is_recommended ? 'tier-btn-recommended' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelectedTierIndex(tier.index)}
              >
                {tier.is_recommended && (
                  <span className="tier-star">⭐</span>
                )}
                <span className="tier-label">{tier.label}</span>
                <span className="tier-total">{fmt(tier.total)}</span>
                {tier.is_recommended && (
                  <span className="tier-badge">Recommended</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">{isTiered ? `${activeTier?.label ?? 'Selected'} — Equipment` : 'Equipment'}</div>
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
                      {[item.manufacturer, item.model_number].filter(Boolean).join(' · ')}
                      {item.warranty_months ? ` · ${item.warranty_months}mo warranty` : ''}
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
              Tax {displayTaxRatePct > 0 ? `(${displayTaxRatePct.toFixed(2)}%)` : ''}
            </span>
            <span>{fmt(totals.tax)}</span>
          </div>
        )}
        <div className="totals-row grand">
          <span>Total</span>
          <span>{fmt(totals.total)}</span>
        </div>
        {estimate.deposit_required && depositAmount != null && (
          <div className="deposit-badge">
            {estimate.deposit_paid
              ? `✓ Deposit of ${fmt(depositAmount)} received`
              : `Deposit of ${fmt(depositAmount)} required to start work`}
          </div>
        )}
      </div>

      {!terminal && mode === 'view' && (
        <>
          <button className="btn btn-primary" onClick={() => setMode('accept')}>
            {isTiered ? `Accept ${activeTier?.label ?? ''} Package` : 'Accept Estimate'}
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

      {terminal && (
        <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>
            {estimate.status === 'Accepted' || estimate.status === 'Deposit Paid'
              ? '✓'
              : estimate.status === 'Expired'
              ? '⏱'
              : '✕'}
          </div>
          <h2 style={{ marginBottom: 8 }}>{estimate.status}</h2>
          <p style={{ color: '#8b93a7', marginBottom: 0 }}>
            {estimate.status === 'Accepted' && estimate.deposit_required && !estimate.deposit_paid
              ? 'Your estimate has been accepted. Please complete your deposit payment to get started.'
              : estimate.status === 'Accepted'
              ? 'Thank you! We will be in touch shortly.'
              : estimate.status === 'Deposit Paid'
              ? 'Your deposit has been received. We will be in touch to schedule your job.'
              : estimate.status === 'Declined'
              ? 'We have recorded your response.'
              : estimate.status === 'Changes Requested'
              ? 'Your request has been sent. We will reach out shortly.'
              : estimate.status === 'Expired'
              ? 'This estimate has expired. Please contact us for a new one.'
              : ''}
          </p>
          {estimate.status === 'Accepted' &&
            estimate.deposit_required &&
            estimate.deposit_invoice_id &&
            !estimate.deposit_paid && (
              <a
                href={`${PAYMENT_PAGE_URL}/api/payment?invoice_id=${estimate.deposit_invoice_id}&return_token=${token}`}
                className="btn btn-primary"
                style={{ display: 'block', marginTop: 20, textDecoration: 'none' }}
              >
                Pay Deposit — {fmt(depositAmount ?? 0)}
              </a>
            )}
        </div>
      )}

      {mode === 'accept' && (
        <div className="card">
          <div className="card-title">
            {isTiered ? `Sign to Accept — ${activeTier?.label ?? ''} Package` : 'Sign to Accept'}
          </div>
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
          <button
            className="btn btn-danger"
            onClick={handleDecline}
            disabled={submitting}
          >
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
            placeholder="What would you like to change?"
            value={declineNotes}
            onChange={(e) => setDeclineNotes(e.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={handleRequest}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Request'}
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

      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'zoom-out',
            padding: 20,
          }}
        >
          <img
            src={lightboxImage}
            alt="Equipment"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      )}

      <div className="footer-note">
        Shield Low Voltage · Questions? Reply to this message or call us.
      </div>
    </div>
  );
}
