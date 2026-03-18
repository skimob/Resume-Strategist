import { NextResponse } from "next/server";

// Uses Jina.ai's free reader API to extract clean text from any URL.
// No API key required. Simply prefix the target URL with https://r.jina.ai/
// Jina strips ads, navigation, and boilerplate — returning just the main content.

export async function POST(request) {
  const { url } = await request.json();

  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, {
      headers: {
        // Ask Jina to return plain text (not markdown)
        "Accept": "text/plain",
        // Identify ourselves politely
        "X-With-Generated-Alt": "true",
      },
      // 15 second timeout
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not fetch page (status ${response.status})` },
        { status: 502 }
      );
    }

    const text = await response.text();

    // Trim and sanity-check the response
    const trimmed = text.trim();
    if (trimmed.length < 100) {
      return NextResponse.json(
        { error: "Page content too short — it may require a login or be blocked." },
        { status: 422 }
      );
    }

    // Cap at ~8000 chars to avoid sending a massive payload to Claude
    const truncated = trimmed.length > 8000
      ? trimmed.slice(0, 8000) + "\n\n[Content truncated for length]"
      : trimmed;

    return NextResponse.json({ text: truncated });

  } catch (err) {
    if (err.name === "TimeoutError") {
      return NextResponse.json({ error: "Request timed out. The page took too long to load." }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to fetch URL." }, { status: 500 });
  }
}
