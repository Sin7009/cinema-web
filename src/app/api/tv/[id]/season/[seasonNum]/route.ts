import { NextRequest, NextResponse } from "next/server";
import { getSeasonDetails } from "@/lib/tmdb";

interface Params {
  params: Promise<{
    id: string;
    seasonNum: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id, seasonNum } = await params;
    if (!id || !seasonNum) {
      return NextResponse.json({ error: "Missing TV show ID or season number" }, { status: 400 });
    }

    const data = await getSeasonDetails(id, seasonNum);
    if (!data) {
      return NextResponse.json({ error: "Season details not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
