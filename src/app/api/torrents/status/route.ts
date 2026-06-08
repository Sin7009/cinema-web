import { NextResponse } from "next/server";
import { getTorrServerStatus } from "@/lib/torrserver";

export async function GET() {
  try {
    const status = await getTorrServerStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
