import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { extraireUtm } from "@/lib/utm";

const COOKIE_UTM = "adp_utm";
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

// Chemins qui nécessitent le rafraîchissement de session Supabase
const CHEMINS_AUTH = ["/conception", "/connexion"];

function estCheminAuth(pathname: string): boolean {
  return CHEMINS_AUTH.some((c) => pathname === c || pathname.startsWith(c + "/"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Rafraîchissement de session sur les chemins authentifiés ---
  if (estCheminAuth(pathname)) {
    return rafraichirSession(request);
  }

  // --- Capture UTM (site public uniquement) ---
  if (request.cookies.has(COOKIE_UTM)) {
    return NextResponse.next();
  }

  const utmData = extraireUtm(request.nextUrl);
  if (!utmData) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(COOKIE_UTM, JSON.stringify(utmData), {
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

async function rafraichirSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Rafraîchir la session (renouvelle le token si expiré)
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Exclure les fichiers statiques
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
