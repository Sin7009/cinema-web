import { NextRequest, NextResponse } from "next/server";
import { getTVShowDetails, getTVShowExternalIds } from "@/lib/tmdb";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing TV show ID" }, { status: 400 });
    }

    const [details, externalIds] = await Promise.all([
      getTVShowDetails(id),
      getTVShowExternalIds(id),
    ]);

    if (!details) {
      return NextResponse.json({ error: "TV show not found" }, { status: 404 });
    }

    // Объединяем детали и внешние ID (включая imdb_id)
    const mergedDetails = {
      ...details,
      imdb_id: externalIds?.imdb_id || null,
    };

    return NextResponse.json(mergedDetails);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
