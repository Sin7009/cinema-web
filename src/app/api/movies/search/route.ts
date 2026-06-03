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
      data.results = data.results.filter((item: any) => item.media_type !== "person");
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

