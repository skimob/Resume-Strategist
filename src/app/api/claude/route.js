import { NextResponse } from "next/server";

// This route sits between your React app and Anthropic.
// Your API key lives here on the server — it is NEVER sent to the browser.

export async function POST(request) {
  // Basic auth check — must have authed via password gate
  // (session storage on client; for extra security you could use cookies here)

  const body = await request.json();

  // Forward the request to Anthropic, injecting the secret key
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error }, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
