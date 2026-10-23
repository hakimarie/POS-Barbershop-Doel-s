import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Fail closed when configuration is missing: protected pages never render
  // without a verified Supabase session.
  if (!supabaseUrl || !supabaseKey) {
    if (isPublicRoute) return NextResponse.next();
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("error", "config");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser validates the session with Supabase Auth; do not trust getSession
  // alone for server-side authorization decisions.
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!isPublicRoute && (error || !user)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && user && !error) {
    const next = request.nextUrl.searchParams.get("next");
    const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
