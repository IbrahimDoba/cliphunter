import { auth } from "@/lib/auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // Allow auth-related routes
  const isAuthPage = pathname.startsWith('/auth')
  const isApiAuth = pathname.startsWith('/api/auth')

  // Allow public API routes (clip serving)
  const isPublicApi = pathname.startsWith('/api/clips/')

  // Allow static files and images
  const isStaticFile = pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js)$/)

  // Redirect authenticated users away from auth pages to home
  if (isLoggedIn && isAuthPage) {
    return Response.redirect(new URL('/', req.nextUrl.origin))
  }

  if (isAuthPage || isApiAuth || isPublicApi || isStaticFile) {
    return
  }

  // Redirect to signin if not authenticated
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
