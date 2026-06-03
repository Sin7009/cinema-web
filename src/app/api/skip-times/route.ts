import { NextRequest, NextResponse } from "next/server";
import { getTVShowExternalIds, getMovieDetails } from "@/lib/tmdb";

// Парсинг сезона и серии из названия файла
function parseSeasonEpisode(filename: string, title?: string): { season: number; episode: number } {
  const cleanName = filename.toLowerCase();
  
  // 1. Паттерны вида S01E02, s1e2, s01.e02, S01E02-E03
  const s01e01 = cleanName.match(/s(\d+)\.?e(\d+)/);
  if (s01e01) {
    return { season: parseInt(s01e01[1], 10), episode: parseInt(s01e01[2], 10) };
  }

  // 2. Паттерны вида 1x02, 01x02
  const xPattern = cleanName.match(/(\d+)x(\d+)/);
  if (xPattern) {
    return { season: parseInt(xPattern[1], 10), episode: parseInt(xPattern[2], 10) };
  }

  // 3. Паттерны вида ep02, ep.02, episode 02, серия 02
  const epPattern = cleanName.match(/(?:ep|episode|серия|эпизод)\.?\s*(\d+)/);
  if (epPattern) {
    const sPattern = cleanName.match(/(?:season|сезон|s)\.?\s*(\d+)/);
    const season = sPattern ? parseInt(sPattern[1], 10) : 1;
    return { season, episode: parseInt(epPattern[1], 10) };
  }

  // 4. Очистка и вытаскивание чисел
  const cleanStr = cleanName
    .replace(/1080p|720p|2160p|4k|h\.?264|h\.?265|x\.?264|x\.?265/g, "")
    .replace(/\[[a-f0-9]{8}\]/g, ""); // хэши вроде [A1B2C3D4]
  
  const numbers = cleanStr.match(/(?:\D|^)(\d{1,3})(?:\D|$)/g);
  if (numbers && numbers.length > 0) {
    const parsedNums = numbers.map(n => parseInt(n.replace(/\D/g, ""), 10));
    if (parsedNums.length >= 2) {
      return { season: parsedNums[0], episode: parsedNums[1] };
    } else {
      const sPattern = cleanName.match(/(?:season|сезон|s)\.?\s*(\d+)/);
      const season = sPattern ? parseInt(sPattern[1], 10) : 1;
      return { season, episode: parsedNums[0] };
    }
  }

  return { season: 1, episode: 1 };
}

// Поиск MAL ID на AniList
async function fetchMalIdFromAniList(title: string): Promise<number | null> {
  const query = `
    query ($search: String) {
      Media (search: $search, type: ANIME) {
        idMal
      }
    }
  `;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { search: title } }),
      next: { revalidate: 86400 } // Кэш на 24 часа
    });
    if (res.ok) {
      const json = await res.json();
      return json.data?.Media?.idMal || null;
    }
  } catch (e) {
    console.error("Failed to fetch MAL ID from AniList:", e);
  }
  return null;
}

// Запрос в AniSkip
async function fetchSkipTimesFromAniSkip(malId: number, episode: number, duration: number) {
  const searchParams = new URLSearchParams({
    episodeLength: String(duration),
  });
  const url = `https://api.aniskip.com/v1/skip-times/${malId}/${episode}?${searchParams.toString()}&types[]=op&types[]=ed`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      if (data.found && data.results) {
        let intro = null;
        let outro = null;
        for (const result of data.results) {
          if (result.skip_type === "op") {
            intro = {
              start: result.interval.start_time,
              end: result.interval.end_time,
            };
          } else if (result.skip_type === "ed") {
            outro = {
              start: result.interval.start_time,
              end: result.interval.end_time,
            };
          }
        }
        return { intro, outro };
      }
    }
  } catch (e) {
    console.error("Failed to fetch skip times from AniSkip:", e);
  }
  return null;
}

// Запрос в IntroDB
async function fetchSkipTimesFromIntroDB(imdbId: string, season: number, episode: number) {
  const url = `https://api.introdb.app/segments?imdb_id=${imdbId}&season=${season}&episode=${episode}`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      let intro = null;
      let outro = null;
      if (data.intro) {
        intro = {
          start: data.intro.start_sec,
          end: data.intro.end_sec,
        };
      }
      if (data.outro) {
        outro = {
          start: data.outro.start_sec,
          end: data.outro.end_sec,
        };
      }
      return { intro, outro };
    }
  } catch (e) {
    console.error("Failed to fetch skip times from IntroDB:", e);
  }
  return null;
}

async function getImdbId(tmdbId: string, mediaType: string): Promise<string | null> {
  try {
    if (mediaType === "tv") {
      const ext = await getTVShowExternalIds(tmdbId);
      return ext?.imdb_id || null;
    } else {
      const movie = await getMovieDetails(tmdbId);
      return movie?.imdb_id || null;
    }
  } catch (e) {
    console.error("Failed to get IMDb ID from TMDB:", e);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "";
  const filename = searchParams.get("filename") || "";
  let imdbId = searchParams.get("imdbId") || "";
  const tmdbId = searchParams.get("tmdbId") || "";
  const mediaType = searchParams.get("mediaType") || "tv";
  const durationStr = searchParams.get("duration") || "0";
  const duration = parseFloat(durationStr);

  if (!filename && !title) {
    return NextResponse.json({ error: "Missing filename or title" }, { status: 400 });
  }

  try {
    // 1. Парсим сезон и серию
    const { season, episode } = parseSeasonEpisode(filename || title);

    // 2. Получаем IMDb ID, если передан tmdbId
    if (!imdbId && tmdbId) {
      imdbId = await getImdbId(tmdbId, mediaType) || "";
    }

    let intro = null;
    let outro = null;

    // 3. Запрос в AniSkip для аниме
    // Ищем аниме по названию, если оно определено как аниме или мы просто пробуем сделать это
    const malId = await fetchMalIdFromAniList(title || filename);
    if (malId && duration > 0) {
      const aniSkipResult = await fetchSkipTimesFromAniSkip(malId, episode, duration);
      if (aniSkipResult) {
        intro = aniSkipResult.intro;
        outro = aniSkipResult.outro;
      }
    }

    // 4. Если в AniSkip ничего нет или это не аниме, пробуем IntroDB
    if (!intro && !outro && imdbId) {
      const introDbResult = await fetchSkipTimesFromIntroDB(imdbId, season, episode);
      if (introDbResult) {
        intro = introDbResult.intro;
        outro = introDbResult.outro;
      }
    }

    return NextResponse.json({
      season,
      episode,
      intro,
      outro,
      provider: malId && (intro || outro) ? "AniSkip" : "IntroDB"
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
