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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
