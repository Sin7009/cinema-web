import { NextRequest, NextResponse } from "next/server";
import { getTorrent } from "@/lib/torrserver";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hash = searchParams.get("hash");

  if (!hash) {
    return NextResponse.json({ error: "Missing hash parameter" }, { status: 400 });
  }

  try {
    const torrent = await getTorrent(hash);
    if (!torrent) {
      return NextResponse.json({ error: "Torrent not found" }, { status: 404 });
    }
    return NextResponse.json({ torrent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
