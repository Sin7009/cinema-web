import { NextResponse } from "next/server";
import { getSession, clearSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session || !session.authToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, user: session.user });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ success: true });
}
