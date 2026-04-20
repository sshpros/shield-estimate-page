# Shield Low Voltage — Estimate Landing Page

Customer-facing estimate acceptance page. Deploy to Vercel.

## Setup
1. Push this repo to GitHub.
2. Import into Vercel.
3. Add environment variables in Vercel Project Settings:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_PAYMENT_PAGE_URL` (e.g. `https://shield-payment-page.vercel.app`)
4. Deploy.

## URL format
`https://<your-domain>.vercel.app/estimate/{token}`

## Flow
- Fetches estimate from Supabase `get-estimate` edge function.
- Accept: captures signature → `submit-estimate-response` → if deposit required, redirects to payment page.
- Decline / Request Changes: posts reason/notes to `submit-estimate-response`.
