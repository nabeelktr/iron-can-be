import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS middleware for the IronCan API.
 * Allows requests from the React Native app and web origins.
 */
export function middleware(request: NextRequest) {
  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  // For all other requests, add CORS headers to the response
  const response = NextResponse.next();
  const headers = corsHeaders(request);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") ?? "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export const config = {
  matcher: "/api/:path*",
};
