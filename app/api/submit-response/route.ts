import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
try {
  const body = await req.json();
  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/submit-estimate-response`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'apikey': process.env.SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
} catch (e: any) {
  return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
}
}
