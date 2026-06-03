const TMDB_BASE_URL = "https://api.themoviedb.org/3";

async function fetchFromTMDB(endpoint: string, queryParams: Record<string, string> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || apiKey === "YOUR_TMDB_API_KEY_HERE") {
    console.warn("TMDB_API_KEY is not set or placeholder is used");
    return null;
  }

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    language: "ru-RU",
    ...queryParams,
  });

  const url = `${TMDB_BASE_URL}${endpoint}?${searchParams.toString()}`;
  
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } }); // Кэш на 1 час
    if (!res.ok) {
      console.error(`TMDB error fetching ${endpoint}: ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error(`TMDB fetch error:`, error);
    return null;
  }
}

export async function getTrendingMovies() {
  const data = await fetchFromTMDB("/trending/movie/week");
  return data?.results || [];
}

export async function getPopularMovies() {
  const data = await fetchFromTMDB("/movie/popular");
  return data?.results || [];
}

export async function getTopRatedMovies() {
  const data = await fetchFromTMDB("/movie/top_rated");
  return data?.results || [];
}

export async function searchMovies(query: string, page = "1") {
  const data = await fetchFromTMDB("/search/movie", { query, page });
  return data || { results: [], total_pages: 0, total_results: 0 };
}

export async function getMovieDetails(id: string) {
  return await fetchFromTMDB(`/movie/${id}`, {
    append_to_response: "credits,videos,similar,recommendations",
  });
}

export async function searchMulti(query: string, page = "1") {
  const data = await fetchFromTMDB("/search/multi", { query, page });
  return data || { results: [], total_pages: 0, total_results: 0 };
}

export async function getTVShowDetails(id: string) {
  return await fetchFromTMDB(`/tv/${id}`, {
    append_to_response: "credits,videos,similar,recommendations",
  });
}

export async function getTVShowExternalIds(id: string) {
  return await fetchFromTMDB(`/tv/${id}/external_ids`);
}

export async function getSeasonDetails(tvId: string, seasonNumber: string | number) {
  return await fetchFromTMDB(`/tv/${tvId}/season/${seasonNumber}`);
}

