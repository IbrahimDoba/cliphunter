import { auth } from "@/lib/auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // Public routes (no authentication required)
  const isLandingPage = pathname === '/'
  const isAuthPage = pathname.startsWith('/auth')
  const isApiAuth = pathname.startsWith('/api/auth')
  const isPublicApi = pathname.startsWith('/api/clips/')
  const isOutputFile = pathname.startsWith('/outputs/')
  const isStaticFile = pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js)$/)

  // Redirect authenticated users away from auth pages to generate page
  if (isLoggedIn && isAuthPage) {
    return Response.redirect(new URL('/generate', req.nextUrl.origin))
  }

  // Allow public routes without authentication
  if (isLandingPage || isAuthPage || isApiAuth || isPublicApi || isOutputFile || isStaticFile) {
    return
  }

  // Redirect to signin if not authenticated (for protected routes)
  if (!isLoggedIn) {
    const signInUrl = new URL('/auth/signin', req.nextUrl.origin)
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return Response.redirect(signInUrl)
  }
})

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/clips/).*)',
  ],
}
