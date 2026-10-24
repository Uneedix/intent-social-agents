import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  if (!token_hash || !type || !['signup','recovery','email','invite','magiclink','email_change'].includes(type))
    return NextResponse.redirect(`${url.origin}/login?error=invalid_confirmation`);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) return NextResponse.redirect(`${url.origin}/login?error=confirmation_failed`);
  return NextResponse.redirect(`${url.origin}${type === 'recovery' ? '/reset-password' : '/'}`);
}
