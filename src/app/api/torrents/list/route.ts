import { NextResponse } from "next/server";
import { listTorrents } from "@/lib/torrserver";

export async function GET() {
  try {
    const items = await listTorrents();
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
