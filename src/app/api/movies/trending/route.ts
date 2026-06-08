import { NextResponse } from "next/server";
import { getTrendingMovies, getPopularMovies, getTopRatedMovies } from "@/lib/tmdb";

export async function GET() {
  try {
    const [trending, popular, topRated] = await Promise.all([
      getTrendingMovies(),
      getPopularMovies(),
      getTopRatedMovies(),
    ]);

    return NextResponse.json({
      trending,
      popular,
      topRated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
