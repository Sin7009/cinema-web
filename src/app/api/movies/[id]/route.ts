import { NextRequest, NextResponse } from "next/server";
import { getMovieDetails } from "@/lib/tmdb";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing movie ID" }, { status: 400 });
    }

    const data = await getMovieDetails(id);
    if (!data) {
      return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
