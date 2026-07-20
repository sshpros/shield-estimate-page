import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
try {
  const body = await req.json();
  if (!body?.token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Server misconfigured: SUPABASE_URL or SUPABASE_ANON_KEY is missing on Vercel.' },
      { status: 500 }
    );
  }

  const upstream = await fetch(`${supabaseUrl}/functions/v1/submit-change-order-response`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();

  try {
    return NextResponse.json(JSON.parse(text), { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: 'Edge function returned non-JSON', detail: text.slice(0, 500) },
      { status: 502 }
    );
  }
} catch (e: any) {
  return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
}
}
