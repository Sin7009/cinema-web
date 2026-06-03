import { NextRequest, NextResponse } from "next/server";
import { getTorrent } from "@/lib/torrserver";

interface Params {
  params: Promise<{
    hash: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { hash } = await params;
    if (!hash) {
      return NextResponse.json({ error: "Missing hash parameter" }, { status: 400 });
    }

    const details = await getTorrent(hash);
    if (!details) {
      return NextResponse.json({ error: "Torrent not found" }, { status: 404 });
    }

    return NextResponse.json({ torrent: details });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
