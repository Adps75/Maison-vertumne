import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extraireUtm } from "@/lib/utm";

const COOKIE_NAME = "adp_utm";
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 jours en secondes

export function middleware(request: NextRequest) {
  // Ne pas écraser un cookie existant (premier contact uniquement)
  if (request.cookies.has(COOKIE_NAME)) {
    return NextResponse.next();
  }

  const utmData = extraireUtm(request.nextUrl);
  if (!utmData) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(COOKIE_NAME, JSON.stringify(utmData), {
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export const config = {
  matcher: [
    // Exclure les fichiers statiques et les API internes
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
