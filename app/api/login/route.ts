import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const { password } = await req.json(); // ここも await が必要です

  if (password === process.env.APP_PASSWORD) {
    // 【変更点】 await cookies() と書いて、一度変数で受けるのが確実です
    const cookieStore = await cookies();
    
    cookieStore.set('auth_status', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 1週間
      path: '/',
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
}