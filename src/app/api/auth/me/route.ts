import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    authenticated: true,
    user: {
      username: "Administrator",
      email: "admin@nas-soft.com",
      id: "admin",
      thumb: null,
    }
  });
}

export async function DELETE() {
  return NextResponse.json({ success: true });
}
