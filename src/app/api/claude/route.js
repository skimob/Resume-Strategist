import { NextResponse } from "next/server";

export async function POST(request) {
  const body = await request.json();

  console.log("API Key exists:", !!process.env.ANTHROPIC_API_KEY);
  console.log("API Key prefix:", process.env.ANTHROPIC_API_KEY?.slice(0, 15));

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
    console.log("Anthropic error:", error);
    return NextResponse.json({ error }, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
