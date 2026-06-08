import { NextRequest, NextResponse } from "next/server";
import { searchTorrents, searchTorrentsMulti, TorrentResult } from "@/lib/jackett";
import { getCachedSearchResults, setCachedSearchResults } from "@/lib/torrentCache";

// Извлечение значимых ключевых слов для валидации раздач
function getSignificantKeywords(title: string): string[] {
  if (!title) return [];
  
  // Заменяем знаки препинания на пробелы и делим по пробельным символам
  const words = title
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
    .split(/\s+/);
    
  const commonStopWords = new Set([
    "the", "and", "for", "with", "this", "that", "from", "you", "are",
    "как", "для", "или", "что", "это", "под", "над", "без", "все", "всех"
  ]);
  
  return words.filter(word => 
    word.length >= 3 && 
    !commonStopWords.has(word) && 
    /^[a-z0-9а-яё]+$/i.test(word)
  );
}

// Список нежелательных расширений в названии торрента
const INVALID_EXTENSIONS = [
  ".zip", ".rar", ".pdf", ".epub", ".cbr", ".cbz", 
  ".mp3", ".flac", ".exe", ".txt", ".djvu", ".fb2"
];

// Список стоп-слов, указывающих на курсы, журналы, книги или спам/порно
const STOP_WORDS = [
  "udemy", "masterclass", "ebook", "magazine", "comic", "book", 
  "newspaper", "journal", "legalporno", "sextape", "porn", "xxx", 
  "blowketing", "amatuer", "lessons", "course", "tutorial", "pack"
];

// Список стандартных видео-тегов для подтверждения видеоформата
const VIDEO_TAGS = [
  "1080p", "720p", "2160p", "4k", "uhd", "fhd", "hd", "web-dl", 
  "webdl", "bluray", "bdrip", "hdrip", "webrip", "dvdrip", "hdtv", 
  "hevc", "x264", "x265", "avc", "mkv", "mp4"
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title");
  const originalTitle = searchParams.get("originalTitle");
  const year = searchParams.get("year");
  const query = searchParams.get("query"); // Резервный параметр

  // Если нет параметров поиска
  if (!title && !query) {
    return NextResponse.json({ results: [] });
  }

  // Строим уникальный ключ кэша для запроса
  const cacheKey = title 
    ? `${title.trim()}_${(originalTitle || "").trim()}_${(year || "").trim()}`
    : (query || "").trim();

  // 1. Проверяем персистентный кэш поиска
  try {
    const cachedResults = await getCachedSearchResults(cacheKey);
    if (cachedResults) {
      console.log(`[Cache Hit API] Returning persistent cached torrents for key: "${cacheKey}"`);
      return NextResponse.json({ results: cachedResults, cached: true });
    }
  } catch (err) {
    console.error("Error reading search cache:", err);
  }

  try {
    console.log(`[Cache Miss API] Fetching fresh torrents from Jackett for key: "${cacheKey}"`);
    
    let rawResults: TorrentResult[] = [];

    if (title) {
      // Выполняем параллельный поиск на русском и английском
      rawResults = await searchTorrentsMulti(title, originalTitle || "", year);
    } else if (query) {
      // Одиночный поиск по строке (совместимость)
      rawResults = await searchTorrents(query);
    }

    // Собираем значимые слова для валидации (из русского и английского названия)
    const keywords: string[] = [];
    if (title) keywords.push(...getSignificantKeywords(title));
    if (originalTitle) keywords.push(...getSignificantKeywords(originalTitle));
    if (query) keywords.push(...getSignificantKeywords(query));

    // Убираем дубликаты из массива ключевых слов
    const uniqueKeywords = Array.from(new Set(keywords));
    console.log(`[Validation Keywords] Filter keywords: ${JSON.stringify(uniqueKeywords)}`);

    // 2. Интеллектуальная фильтрация результатов поиска
    const filteredResults = rawResults.filter((item) => {
      const lowerTitle = item.title.toLowerCase();

      // А. Фильтр расширений
      const hasInvalidExt = INVALID_EXTENSIONS.some(ext => lowerTitle.includes(ext));
      if (hasInvalidExt) return false;

      // Б. Фильтр стоп-слов
      const hasStopWord = STOP_WORDS.some(word => lowerTitle.includes(word));
      if (hasStopWord) return false;

      // В. Фильтр видео-тегов (требуем наличие хотя бы одного тега качества)
      const hasVideoTag = VIDEO_TAGS.some(tag => lowerTitle.includes(tag));
      if (!hasVideoTag) return false;

      // Г. Валидация по ключевым словам из названия
      if (uniqueKeywords.length > 0) {
        const matchesKeyword = uniqueKeywords.some(keyword => lowerTitle.includes(keyword));
        if (!matchesKeyword) return false;
      }

      return true;
    });

    // 3. Сохраняем отфильтрованные результаты в кэш
    try {
      await setCachedSearchResults(cacheKey, filteredResults);
    } catch (err) {
      console.error("Failed to write to search cache:", err);
    }

    return NextResponse.json({ results: filteredResults, cached: false });
  } catch (error) {
    console.error("Error in torrent search API route:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
