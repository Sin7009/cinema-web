import { NextRequest, NextResponse } from "next/server";
import { searchTorrents } from "@/lib/jackett";

// In-memory кэш для результатов поиска торрентов
interface CacheEntry {
  timestamp: number;
  results: any[];
}

const torrentsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 3 * 60 * 60 * 1000; // Время жизни кэша: 3 часа
const MAX_CACHE_SIZE = 500; // Максимальное количество запросов в кэше

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const normalizedQuery = query.trim().toLowerCase();
  const now = Date.now();

  // 1. Проверяем кэш
  const cached = torrentsCache.get(normalizedQuery);
  if (cached) {
    if (now - cached.timestamp < CACHE_TTL) {
      console.log(`[Cache Hit] Returning cached torrents for: "${query}"`);
      return NextResponse.json({ results: cached.results, cached: true });
    } else {
      // Удаляем устаревшую запись
      torrentsCache.delete(normalizedQuery);
    }
  }

  try {
    console.log(`[Cache Miss] Fetching fresh torrents from Jackett for: "${query}"`);
    const results = await searchTorrents(query);
    
    // 2. Очистка кэша, если он переполнен (удаляем старые записи)
    if (torrentsCache.size >= MAX_CACHE_SIZE) {
      const keys = Array.from(torrentsCache.keys());
      const toRemove = Math.floor(MAX_CACHE_SIZE / 2);
      for (let i = 0; i < toRemove; i++) {
        torrentsCache.delete(keys[i]);
      }
    }

    // 3. Сохраняем новые данные в кэш
    torrentsCache.set(normalizedQuery, {
      timestamp: now,
      results,
    });

    return NextResponse.json({ results, cached: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

