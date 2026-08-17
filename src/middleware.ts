import { NextResponse, type NextRequest } from "next/server";

/**
 * A password on the front door.
 *
 * The deployed app holds an API key and will spend it on request, so a public URL
 * with no gate is an invitation to burn someone else's credits. HTTP Basic is the
 * right weight here: no session store, no login page, no library, and every browser
 * and curl already speaks it.
 *
 * **Unset APP_PASSWORD leaves the app open.** That is deliberate, so local
 * development is not a password prompt on every reload — and it is why the deploy
 * instructions make setting it the first step rather than a footnote.
 *
 * What this is not: user accounts, roles, or an audit trail. One shared secret for
 * one person. If a second person needs their own access, this is the file to replace.
 */
export function middleware(request: NextRequest): NextResponse {
  const expected = process.env.APP_PASSWORD ?? "";
  if (expected === "") return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded !== undefined) {
    try {
      const decoded = atob(encoded);
      // Everything after the first colon, so a password containing one still works.
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (constantTimeEqual(supplied, expected)) return NextResponse.next();
    } catch {
      // Malformed base64 falls through to the challenge below.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="CX Agent Lab", charset="UTF-8"' },
  });
}

/**
 * Compares in time independent of where the first difference falls.
 *
 * A plain `===` returns as soon as two characters differ, which leaks the length of
 * the correct prefix to anyone willing to measure. Cheap to avoid, so avoid it.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const config = {
  // Static assets are excluded: they carry nothing sensitive, and challenging them
  // makes a locked page render as a wall of broken images behind the prompt.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
