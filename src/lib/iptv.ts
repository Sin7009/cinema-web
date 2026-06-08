import fs from "fs/promises";
import path from "path";
import zlib from "zlib";
import { Readable } from "stream";
import sax from "sax";

const CACHE_DIR = process.env.CACHE_DIR || "/app/cache";
const PLAYLIST_CACHE_FILE = path.join(CACHE_DIR, "iptv_playlist.json");
const EPG_CACHE_FILE = path.join(CACHE_DIR, "iptv_epg.json");

// Интервалы кэширования
const PLAYLIST_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 часов
const EPG_CACHE_TTL = 12 * 60 * 60 * 1000;   // 12 часов

export interface IptvChannel {
  id: string; // уникальный ID (имя канала)
  name: string;
  logo: string;
  group: string;
  url: string;
}

export interface EpgProgramme {
  title: string;
  desc: string;
  start: number; // timestamp ms
  stop: number;  // timestamp ms
}

export interface EpgCache {
  [channelId: string]: EpgProgramme[];
}

export interface PlaylistCache {
  timestamp: number;
  channels: IptvChannel[];
  categories: string[];
}

/**
 * Нормализует URL логотипа, переводя epg.one/cdn.epg.one на безопасный HTTPS cdn.epg.one
 */
export function normalizeLogoUrl(url: string): string {
  if (!url) return "";
  return url.replace(/^https?:\/\/(cdn\.)?epg\.one/i, "https://cdn.epg.one");
}

/**
 * Определяет сдвиг времени в часах из названия канала (например, +2, (+4), -1)
 */
export function getChannelOffsetHours(name: string): number {
  const clean = name.toLowerCase();
  const bracketMatch = clean.match(/\(\s*([+-]?\d+)\s*\)/);
  if (bracketMatch) {
    return parseInt(bracketMatch[1], 10);
  }
  const signMatch = clean.match(/(?:\s|^)([+-]\d+)(?:\s|$)/);
  if (signMatch) {
    return parseInt(signMatch[1], 10);
  }
  return 0;
}

/**
 * Очищает название канала для сопоставления с EPG
 */
export function cleanChannelName(name: string, keepOffset = false): string {
  let clean = name.toLowerCase();
  
  const offset = getChannelOffsetHours(name);
  
  // Сначала удаляем скобки со сдвигами (чтобы getChannelOffsetHours отработал корректно, хотя мы его уже вызвали)
  clean = clean
    .replace(/\(\s*[+-]?\d+\s*\)/g, "")
    .replace(/(?:\s|^)[+-]\d+(?:\s|$)/g, " ")
    .replace(/(?:\s|^)\d+\s*класс/gi, " ");

  // Удаляем любые оставшиеся круглые скобки с текстом (регионы, города: например, "(Уфа)", "(Алтай)")
  clean = clean.replace(/\([^)]*\)/g, " ");

  // Удаляем суффиксы HD, FHD, UHD, SD, orig, 50fps, 50
  clean = clean
    .replace(/\b(hd|fhd|uhd|sd|orig|50\s*fps|50)\b/gi, "")
    .replace(/[^a-zа-я0-9]/gi, "")
    .trim();

  if (keepOffset && offset !== 0) {
    return clean + (offset > 0 ? `+${offset}` : `${offset}`);
  }
  return clean;
}

// Помощник для парсинга даты XMLTV (20260605110000 +0300)
function parseXmltvDate(dateStr: string): number {
  try {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10));
    const minute = parseInt(dateStr.substring(10, 12));
    const second = parseInt(dateStr.substring(12, 14));

    const tzPart = dateStr.substring(15).trim();
    if (tzPart) {
      const sign = tzPart.startsWith("-") ? -1 : 1;
      const tzHours = parseInt(tzPart.substring(1, 3));
      const tzMinutes = parseInt(tzPart.substring(3, 5));
      const utcDate = Date.UTC(year, month, day, hour, minute, second);
      const tzOffsetMs = sign * (tzHours * 60 + tzMinutes) * 60 * 1000;
      return utcDate - tzOffsetMs;
    }
    return new Date(year, month, day, hour, minute, second).getTime();
  } catch {
    return 0;
  }
}

/**
 * Парсинг M3U плейлиста из URL
 */
export async function fetchAndParsePlaylist(url: string, force = false): Promise<PlaylistCache> {
  if (!force) {
    try {
      const cachedData = await fs.readFile(PLAYLIST_CACHE_FILE, "utf-8");
      const cache = JSON.parse(cachedData) as PlaylistCache;
      if (Date.now() - cache.timestamp < PLAYLIST_CACHE_TTL) {
        console.log("[IPTV Playlist] Served from cache");
        return cache;
      }
    } catch {
      // Кэш отсутствует или поврежден
    }
  }

  console.log(`[IPTV Playlist] Fetching playlist from: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch playlist: ${res.statusText}`);
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const channels: IptvChannel[] = [];
  const categoriesSet = new Set<string>();

  let currentInfo: Partial<IptvChannel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      const info: Partial<IptvChannel> = {};

      const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/i);
      const groupTitleMatch = line.match(/group-title="([^"]+)"/i);

      // Имя канала после последней запятой
      const commaIndex = line.lastIndexOf(",");
      const displayName = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : "Без названия";

      info.id = displayName; // Используем название как ID
      info.name = displayName;
      info.logo = tvgLogoMatch ? normalizeLogoUrl(tvgLogoMatch[1]) : "";
      info.group = groupTitleMatch ? groupTitleMatch[1] : "Другие";

      currentInfo = info;
    } else if (line.startsWith("#EXTGRP:")) {
      if (currentInfo) {
        currentInfo.group = line.substring(8).trim();
      }
    } else if (line && !line.startsWith("#")) {
      if (currentInfo) {
        currentInfo.url = line;
        
        if (currentInfo.group) {
          categoriesSet.add(currentInfo.group);
        } else {
          currentInfo.group = "Другие";
          categoriesSet.add("Другие");
        }

        channels.push(currentInfo as IptvChannel);
        currentInfo = null;
      }
    }
  }

  const result: PlaylistCache = {
    timestamp: Date.now(),
    channels,
    categories: Array.from(categoriesSet).sort(),
  };

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(PLAYLIST_CACHE_FILE, JSON.stringify(result, null, 2), "utf-8");
  console.log(`[IPTV Playlist] Cached ${channels.length} channels`);

  return result;
}

/**
 * Загрузка, стриминговый парсинг и фильтрация EPG по совпадению названий каналов
 */
export async function fetchAndParseEpg(epgUrl: string, playlistChannels: IptvChannel[], force = false): Promise<EpgCache> {
  if (!force) {
    try {
      const cachedData = await fs.readFile(EPG_CACHE_FILE, "utf-8");
      const cache = JSON.parse(cachedData);
      const stats = await fs.stat(EPG_CACHE_FILE);
      if (Date.now() - stats.mtimeMs < EPG_CACHE_TTL) {
        console.log("[IPTV EPG] Served from cache");
        return cache;
      }
    } catch {
      // Кэш отсутствует или поврежден
    }
  }

  console.log(`[IPTV EPG] Downloading EPG from: ${epgUrl}`);
  const res = await fetch(epgUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch EPG: ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error("EPG response body is empty");
  }

  console.log("[IPTV EPG] Preparing playlist channels for matching...");
  
  // Подготовка информации о каналах плейлиста для сопоставления
  const playlistInfos = playlistChannels.map(channel => {
    const nameLower = channel.name.toLowerCase();
    const cleanBase = cleanChannelName(channel.name, false);
    const cleanWithOffset = cleanChannelName(channel.name, true);
    const offsetHours = getChannelOffsetHours(channel.name);
    return {
      channel,
      nameLower,
      cleanBase,
      cleanWithOffset,
      offsetHours,
      matchedEpgId: null as string | null,
      useFallbackOffset: false,
    };
  });

  console.log("[IPTV EPG] Parsing gzip XMLTV stream...");
  
  const xmlIdToDisplayNames: Record<string, string[]> = {};
  const epgIdToLogo: Record<string, string> = {};
  const epgCache: EpgCache = {};

  const now = Date.now();
  const minTime = now - 6 * 60 * 60 * 1000;
  const maxTime = now + 36 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    const gunzip = zlib.createGunzip();
    const xmlParser = sax.createStream(true, { lowercase: true, trim: true });

    let currentXmlChannelId: string | null = null;
    let currentChannelLogo = "";
    const currentChannelNames: string[] = [];

    let currentProgramme: Partial<EpgProgramme> & { channel?: string } | null = null;
    let currentText = "";
    let currentTag = "";
    let isMatched = false;

    xmlParser.on("opentag", (node) => {
      currentTag = node.name;
      
      // 1. Секция каналов <channel id="XXX">
      if (node.name === "channel") {
        currentXmlChannelId = node.attributes.id as string;
        currentChannelLogo = "";
        currentChannelNames.length = 0;
      } else if (node.name === "icon" && currentXmlChannelId) {
        const logoUrl = node.attributes.src as string;
        currentChannelLogo = logoUrl ? normalizeLogoUrl(logoUrl) : "";
      }
      
      // 2. Секция передач <programme channel="XXX">
      else if (node.name === "programme") {
        // Выполняем сопоставление каналов один раз перед началом парсинга программ
        if (!isMatched) {
          matchPlaylistChannels(playlistInfos, xmlIdToDisplayNames);
          isMatched = true;
        }

        const channelId = node.attributes.channel as string;
        const matchedChannels = playlistInfos.filter(info => info.matchedEpgId === channelId);
        
        if (matchedChannels.length > 0) {
          const start = parseXmltvDate(node.attributes.start as string);
          const stop = parseXmltvDate(node.attributes.stop as string);

          // Фильтруем с расширенным интервалом (до +-12 часов), так как региональный сдвиг может подвинуть передачу в диапазон
          if (stop > minTime - 12 * 60 * 60 * 1000 && start < maxTime + 12 * 60 * 60 * 1000) {
            currentProgramme = {
              channel: channelId,
              start,
              stop,
              title: "",
              desc: "",
            };
          }
        }
      }
    });

    xmlParser.on("text", (text) => {
      if (currentXmlChannelId && currentTag === "display-name") {
        currentText += text;
      } else if (currentProgramme && (currentTag === "title" || currentTag === "desc")) {
        currentText += text;
      }
    });

    xmlParser.on("closetag", (tagName) => {
      if (currentXmlChannelId) {
        if (tagName === "display-name") {
          currentChannelNames.push(currentText.trim());
        } else if (tagName === "channel") {
          if (currentChannelNames.length > 0) {
            xmlIdToDisplayNames[currentXmlChannelId] = [...currentChannelNames];
            if (currentChannelLogo) {
              epgIdToLogo[currentXmlChannelId] = currentChannelLogo;
            }
          }
          currentXmlChannelId = null;
        }
      }

      if (currentProgramme) {
        if (tagName === "title") {
          currentProgramme.title = currentText.trim();
        } else if (tagName === "desc") {
          currentProgramme.desc = currentText.trim();
        } else if (tagName === "programme") {
          const epgId = currentProgramme.channel!;
          const matchedChannels = playlistInfos.filter(info => info.matchedEpgId === epgId);

          for (const info of matchedChannels) {
            let start = currentProgramme.start!;
            let stop = currentProgramme.stop!;

            // Программный сдвиг времени для региональных версий
            if (info.useFallbackOffset && info.offsetHours !== 0) {
              const shiftMs = info.offsetHours * 60 * 60 * 1000;
              start += shiftMs;
              stop += shiftMs;
            }

            if (stop > minTime && start < maxTime) {
              const channelKey = info.channel.id;
              if (!epgCache[channelKey]) {
                epgCache[channelKey] = [];
              }
              epgCache[channelKey].push({
                title: currentProgramme.title || "Без названия",
                desc: currentProgramme.desc || "",
                start,
                stop,
              });
            }
          }
          currentProgramme = null;
        }
      }
      
      currentText = "";
      currentTag = "";
    });

    xmlParser.on("end", async () => {
      console.log(`[IPTV EPG] Finished parsing XMLTV. Filtered ${Object.keys(epgCache).length} channels.`);
      
      // Сортируем программы для каждого канала по времени
      for (const ch in epgCache) {
        epgCache[ch].sort((a, b) => a.start - b.start);
      }

      try {
        // Обогащаем логотипы в плейлисте
        await enrichPlaylistLogos(playlistInfos, epgIdToLogo);

        await fs.mkdir(CACHE_DIR, { recursive: true });
        await fs.writeFile(EPG_CACHE_FILE, JSON.stringify(epgCache, null, 2), "utf-8");
        console.log("[IPTV EPG] EPG cache written to disk");
        resolve(epgCache);
      } catch (err) {
        reject(err);
      }
    });

    xmlParser.on("error", (err) => {
      reject(err);
    });

    nodeStream.pipe(gunzip).pipe(xmlParser);
  });
}

interface PlaylistInfo {
  channel: IptvChannel;
  nameLower: string;
  cleanBase: string;
  cleanWithOffset: string;
  offsetHours: number;
  matchedEpgId: string | null;
  useFallbackOffset: boolean;
}

/**
 * Сопоставляет каналы плейлиста с EPG ID из XMLTV
 */
function matchPlaylistChannels(
  playlistInfos: PlaylistInfo[],
  xmlIdToDisplayNames: Record<string, string[]>
) {
  // 1. Точное совпадение по имени в нижнем регистре
  for (const info of playlistInfos) {
    for (const [xmlId, names] of Object.entries(xmlIdToDisplayNames)) {
      const hasExact = names.some(n => n.toLowerCase() === info.nameLower);
      if (hasExact) {
        info.matchedEpgId = xmlId;
        info.useFallbackOffset = false;
        break;
      }
    }
  }

  // 2. Совпадение по cleanWithOffset (сохраняет сдвиг)
  for (const info of playlistInfos) {
    if (info.matchedEpgId) continue;
    for (const [xmlId, names] of Object.entries(xmlIdToDisplayNames)) {
      const hasCleanMatch = names.some(n => cleanChannelName(n, true) === info.cleanWithOffset);
      if (hasCleanMatch) {
        info.matchedEpgId = xmlId;
        info.useFallbackOffset = false;
        break;
      }
    }
  }

  // 3. Fallback по cleanBase для региональных каналов (сдвигаем базовый EPG)
  for (const info of playlistInfos) {
    if (info.matchedEpgId) continue;
    if (info.offsetHours === 0) continue;
    
    for (const [xmlId, names] of Object.entries(xmlIdToDisplayNames)) {
      const hasBaseMatch = names.some(n => cleanChannelName(n, false) === info.cleanBase);
      if (hasBaseMatch) {
        info.matchedEpgId = xmlId;
        info.useFallbackOffset = true;
        break;
      }
    }
  }
  
  // 4. Дополнительный Fallback по cleanBase для обычных каналов
  for (const info of playlistInfos) {
    if (info.matchedEpgId) continue;
    for (const [xmlId, names] of Object.entries(xmlIdToDisplayNames)) {
      const hasBaseMatch = names.some(n => cleanChannelName(n, false) === info.cleanBase);
      if (hasBaseMatch) {
        info.matchedEpgId = xmlId;
        info.useFallbackOffset = false;
        break;
      }
    }
  }
}

/**
 * Обогащает логотипы каналов в плейлисте на основе иконок EPG
 */
async function enrichPlaylistLogos(
  playlistInfos: PlaylistInfo[],
  epgIdToLogo: Record<string, string>
) {
  try {
    const cachedData = await fs.readFile(PLAYLIST_CACHE_FILE, "utf-8");
    const playlist = JSON.parse(cachedData) as PlaylistCache;
    
    // Создаем карту epgId к иконке
    const nameToIconMap: Record<string, string> = {};
    for (const info of playlistInfos) {
      if (info.matchedEpgId) {
        const logo = epgIdToLogo[info.matchedEpgId];
        if (logo) {
          nameToIconMap[info.channel.name.toLowerCase()] = logo;
        }
      }
    }

    let updated = false;
    for (const channel of playlist.channels) {
      if (!channel.logo) {
        const epgLogo = nameToIconMap[channel.name.toLowerCase()];
        if (epgLogo) {
          channel.logo = normalizeLogoUrl(epgLogo);
          updated = true;
        }
      } else {
        // Также нормализуем существующие логотипы на случай, если они ведут на http epg.one
        const normLogo = normalizeLogoUrl(channel.logo);
        if (normLogo !== channel.logo) {
          channel.logo = normLogo;
          updated = true;
        }
      }
    }

    if (updated) {
      await fs.writeFile(PLAYLIST_CACHE_FILE, JSON.stringify(playlist, null, 2), "utf-8");
      console.log("[IPTV Playlist] Enriched playlist channel logos from EPG icons");
    }
  } catch (e) {
    console.error("[IPTV EPG] Failed to enrich playlist logos", e);
  }
}
