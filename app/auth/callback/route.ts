import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const type = url.searchParams.get('type');
  const origin = url.origin;
  if (!code) return NextResponse.redirect(`${origin}/login?error=invalid_callback`);
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
  return NextResponse.redirect(`${origin}${type === 'recovery' ? '/reset-password' : '/'}`);
}
