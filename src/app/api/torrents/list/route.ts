import { NextResponse } from "next/server";
import { listTorrents } from "@/lib/torrserver";

export async function GET() {
  try {
    const items = await listTorrents();
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
