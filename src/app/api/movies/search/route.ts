import { NextRequest, NextResponse } from "next/server";
import { searchMulti } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");
  const page = searchParams.get("page") || "1";

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const data = await searchMulti(query, page);
    
    // Фильтруем результаты поиска: убираем актеров/людей, оставляем только фильмы и сериалы
    if (data && data.results) {
      data.results = data.results.filter((item: import("@/components/MovieRow").MovieItem) => item.media_type !== "person");
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

