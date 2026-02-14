import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 認証済みクッキーがあるかチェック
  const isAuthenticated = request.cookies.get('auth_status')?.value === 'authenticated';

  // 2. すでにログイン済みなら、ログインページには行かせない（トップへ戻す）
  if (isAuthenticated && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 3. 以下のファイルは認証なしでアクセスOKにする（スタイル崩れ防止など）
  // - ログインページ自体 (/login)
  // - APIルート (/api/login など)
  // - 画像やシステムファイル (_next, favicon.ico 等)
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('favicon.ico')
  ) {
    return NextResponse.next();
  }

  // 4. 未ログインなら、強制的にログインページへ飛ばす
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

// どのパスでミドルウェアを動かすか
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};