import { NextResponse, type NextRequest } from 'next/server';

/**
 * Admin back-office is mounted under `/admin/*` (Payload v3 catch-all
 * `(payload)/admin/[[...segments]]/page.tsx`). The site root `/` has
 * no page of its own — we used to ship a `app/page.tsx` doing
 * `redirect('/admin')`, but it forced Next 15 to require a top-level
 * `app/layout.tsx` rendering `<html>` + `<body>`, which conflicts with
 * Payload's `RootLayout` already owning the document inside the
 * `(payload)` route group.
 *
 * Doing the redirect here keeps Payload as the *single* source of
 * truth for the document shell, and avoids a prerender failure at
 * build time.
 */
export function middleware(request: NextRequest): NextResponse {
  const url = new URL(request.url);
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/admin';
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

// Match only the root and explicit `/` requests. Everything under
// `/admin`, `/api`, and static asset paths is passed through.
export const config = {
  matcher: ['/'],
};
