import { NextResponse, type NextRequest } from "next/server";

// Demo-mode session id, assigned once before any route handler runs, so
// parallel first requests share one in-memory session instead of racing.
// Native clients may send their session id as a header instead of a cookie.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function middleware(req: NextRequest) {
  const header = req.headers.get("x-lifeline-session");
  if (req.cookies.get("ll_sid") && !header) return NextResponse.next();
  const sid = header && UUID.test(header) ? header : crypto.randomUUID();
  const headers = new Headers(req.headers);
  const others = (req.headers.get("cookie") ?? "").split(/;\s*/).filter((c) => c && !c.startsWith("ll_sid="));
  headers.set("cookie", [...others, `ll_sid=${sid}`].join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set("ll_sid", sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return res;
}

export const config = { matcher: ["/api/:path*"] };
