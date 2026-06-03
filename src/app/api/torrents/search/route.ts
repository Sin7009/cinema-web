import { NextRequest, NextResponse } from "next/server";
import { searchTorrents } from "@/lib/jackett";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchTorrents(query);
    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
