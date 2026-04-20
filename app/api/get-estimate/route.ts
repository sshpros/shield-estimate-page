import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
try {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/get-estimate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'apikey': process.env.SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
} catch (e: any) {
  return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
}
}
