import { NextResponse } from "next/server";

export async function POST(request) {
  const { password } = await request.json();
  if (password === process.env.APP_PASSWORD) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
