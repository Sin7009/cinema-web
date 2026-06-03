const JACKETT_API_URL = process.env.JACKETT_API_URL || "http://jackett:9117";
const JACKETT_API_KEY = process.env.JACKETT_API_KEY || "";

export interface TorrentResult {
  title: string;
  tracker: string;
  size: number;
  sizeHuman: string;
  seeders: number;
  peers: number;
  downloadUrl: string;
  magnetUrl: string | null;
  quality: string;
  isHdr: boolean;
}

function parseQuality(title: string): { quality: string; isHdr: boolean } {
  const lower = title.toLowerCase();
  let quality = "SD";
  let isHdr = false;

  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd")) {
    quality = "4K UHD";
  } else if (lower.includes("1080p") || lower.includes("fhd")) {
    quality = "1080p FHD";
  } else if (lower.includes("720p") || lower.includes("hd")) {
    quality = "720p HD";
  }

  if (lower.includes("hdr") || lower.includes("dolby vision") || lower.includes("dv")) {
    isHdr = true;
  }

  return { quality, isHdr };
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 Б";
  const k = 1024;
  const sizes = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export async function searchTorrents(query: string): Promise<TorrentResult[]> {
  if (!JACKETT_API_KEY) {
    console.warn("JACKETT_API_KEY is not configured");
    return [];
  }

  const categories = "2000,2010,2020,2030,2040,2045,2050,2060,5000,5030,5040"; // Фильмы и Сериалы
  const searchParams = new URLSearchParams({
    apikey: JACKETT_API_KEY,
    Query: query,
    Category: categories,
  });

  const url = `${JACKETT_API_URL}/api/v2.0/indexers/all/results?${searchParams.toString()}`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } }); // Кэш на 30 секунд
    if (!res.ok) {
      console.error(`Jackett search failed: ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const results = data.Results || [];

    return results
      .map((item: any) => {
        const { quality, isHdr } = parseQuality(item.Title);
        return {
          title: item.Title,
          tracker: item.Tracker,
          size: item.Size,
          sizeHuman: formatSize(item.Size),
          seeders: item.Seeders || 0,
          peers: item.Peers || 0,
          downloadUrl: item.Link,
          magnetUrl: item.MagnetUri || null,
          quality,
          isHdr,
        };
      })
      .sort((a: TorrentResult, b: TorrentResult) => b.seeders - a.seeders); // Сортируем по сидам
  } catch (error) {
    console.error(`Jackett fetch error:`, error);
    return [];
  }
}

export async function searchTorrentsMulti(
  title: string,
  originalTitle: string,
  year: string | null
): Promise<TorrentResult[]> {
  const cleanTitle = title.trim();
  const cleanOrigTitle = originalTitle ? originalTitle.trim() : "";
  const cleanYear = year ? year.trim() : "";

  // 1. Формируем поисковые запросы
  const queries: string[] = [];
  const q1 = cleanYear ? `${cleanTitle} ${cleanYear}` : cleanTitle;
  queries.push(q1);

  if (cleanOrigTitle && cleanOrigTitle.toLowerCase() !== cleanTitle.toLowerCase()) {
    const q2 = cleanYear ? `${cleanOrigTitle} ${cleanYear}` : cleanOrigTitle;
    queries.push(q2);
  }

  console.log(`[Jackett Multi Search] Queries: ${JSON.stringify(queries)}`);

  // 2. Выполняем запросы параллельно
  try {
    const searchPromises = queries.map((q) => searchTorrents(q));
    const allResultsArrays = await Promise.all(searchPromises);

    // 3. Объединяем и дедуплицируем результаты
    const mergedResults: TorrentResult[] = [];
    const seenUrls = new Set<string>();

    for (const results of allResultsArrays) {
      for (const item of results) {
        const key = item.magnetUrl || item.downloadUrl;
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          mergedResults.push(item);
        }
      }
    }

    // Сортируем объединенные результаты по сидам
    return mergedResults.sort((a, b) => b.seeders - a.seeders);
  } catch (error) {
    console.error("[Jackett Multi Search] Error:", error);
    return [];
  }
}
