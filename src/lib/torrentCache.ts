import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = process.env.CACHE_DIR || "/app/cache";
const TORRENTS_DIR = path.join(CACHE_DIR, "torrents");
const SEARCH_CACHE_FILE = path.join(CACHE_DIR, "search_cache.json");

const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах
const MAX_SEARCH_CACHE_SIZE = 500;

// Убедимся, что папки существуют
async function ensureDirs() {
  try {
    await fs.mkdir(TORRENTS_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create cache directories:", err);
  }
}

// Получить SHA256 хэш ссылки для имени файла
function getUrlHash(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex");
}

/**
 * Получить закэшированный .torrent файл.
 * Если файла нет в кэше, он скачивается по ссылке, сохраняется на диск и возвращается.
 */
export async function getOrDownloadTorrentFile(url: string): Promise<Buffer | null> {
  await ensureDirs();
  const hash = getUrlHash(url);
  const rawPath = path.join(TORRENTS_DIR, `${hash}.torrent`);
  const filePath = path.normalize(rawPath);

  // Валидация пути для предотвращения Path Traversal
  if (!filePath.startsWith(TORRENTS_DIR)) {
    console.error(`Invalid torrent file path: ${filePath}`);
    return null;
  }

  // 1. Проверяем файловый кэш
  try {
    const data = await fs.readFile(filePath);
    console.log(`[Torrent File Cache Hit] Served from: ${filePath} (URL: ${url})`);
    return data;
  } catch (e) {
    // Файл не найден, продолжаем к скачиванию
  }

  // 2. Скачиваем файл из Jackett/трекера
  try {
    console.log(`[Torrent File Cache Miss] Downloading torrent from: ${url}`);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) {
      console.error(`Failed to download torrent file: ${res.statusText} (${res.status})`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Сохраняем в кэш
    await fs.writeFile(filePath, buffer);
    console.log(`[Torrent File Cache Save] Saved torrent file to: ${filePath}`);
    return buffer;
  } catch (err) {
    console.error(`Error downloading torrent file from ${url}:`, err);
    return null;
  }
}

interface SearchCacheEntry {
  timestamp: number;
  results: any[];
}

interface SearchCache {
  [key: string]: SearchCacheEntry;
}

/**
 * Чтение кэша поиска с диска
 */
async function readSearchCache(): Promise<SearchCache> {
  await ensureDirs();
  try {
    const rawPath = path.normalize(SEARCH_CACHE_FILE);
    if (!rawPath.startsWith(CACHE_DIR)) {
      throw new Error("Invalid search cache file path");
    }
    const data = await fs.readFile(rawPath, "utf-8");
    const parsed = JSON.parse(data);
    // Возвращаем объект без прототипа для безопасности
    const safeObj = Object.create(null);
    Object.assign(safeObj, parsed);
    return safeObj;
  } catch (e) {
    return Object.create(null);
  }
}

/**
 * Запись кэша поиска на диск
 */
async function writeSearchCache(cache: SearchCache): Promise<void> {
  await ensureDirs();
  try {
    const rawPath = path.normalize(SEARCH_CACHE_FILE);
    if (!rawPath.startsWith(CACHE_DIR)) {
      throw new Error("Invalid search cache file path");
    }
    await fs.writeFile(rawPath, JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write search cache file:", err);
  }
}

/**
 * Получить результаты поиска из персистентного кэша
 */
export async function getCachedSearchResults(key: string): Promise<any[] | null> {
  const cache = await readSearchCache();
  const normalizedKey = key.toLowerCase().trim();
  
  if (!Object.prototype.hasOwnProperty.call(cache, normalizedKey)) {
    return null;
  }
  const entry = cache[normalizedKey];
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp < CACHE_TTL) {
    console.log(`[Search Cache Hit] Returning cached results for key: "${key}"`);
    return entry.results;
  }

  // Удаляем устаревшую запись
  delete cache[normalizedKey];
  await writeSearchCache(cache);
  return null;
}

/**
 * Сохранить результаты поиска в персистентный кэш
 */
export async function setCachedSearchResults(key: string, results: any[]): Promise<void> {
  const cache = await readSearchCache();
  const normalizedKey = key.toLowerCase().trim();

  // Добавляем/обновляем запись
  cache[normalizedKey] = {
    timestamp: Date.now(),
    results,
  };

  // Проверка переполнения
  const keys = Object.keys(cache);
  if (keys.length > MAX_SEARCH_CACHE_SIZE) {
    // Сортируем ключи по timestamp и удаляем старую половину
    const sortedKeys = keys.sort((a, b) => {
      const entryA = cache[a];
      const entryB = cache[b];
      return (entryA ? entryA.timestamp : 0) - (entryB ? entryB.timestamp : 0);
    });
    const toRemove = Math.floor(MAX_SEARCH_CACHE_SIZE / 2);
    for (let i = 0; i < toRemove; i++) {
      delete cache[sortedKeys[i]];
    }
  }

  await writeSearchCache(cache);
  console.log(`[Search Cache Save] Cached ${results.length} results for key: "${key}"`);
}
