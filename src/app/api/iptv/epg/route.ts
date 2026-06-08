import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { fetchAndParsePlaylist, fetchAndParseEpg } from "@/lib/iptv";

const DEFAULT_PLAYLIST_URL = "http://eea56c71aaa8.zatikov.net/playlists/uplist/8e5c746f7feadb75191e865fc9a1e9b4/playlist.m3u8";
const DEFAULT_EPG_URL = "http://epg.one/epg2.xml.gz";
const CACHE_DIR = process.env.CACHE_DIR || "/app/cache";
const EPG_CACHE_FILE = path.join(CACHE_DIR, "iptv_epg.json");

const EPG_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 часов

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";
    const epgUrl = searchParams.get("url") || DEFAULT_EPG_URL;
    const playlistUrl = searchParams.get("playlistUrl") || DEFAULT_PLAYLIST_URL;
    const channelId = searchParams.get("channelId");

    // 1. Получаем список каналов для фильтрации
    const playlistData = await fetchAndParsePlaylist(playlistUrl, false);

    let epgData: Record<string, import("@/lib/iptv").EpgProgramme[]> | null = null;
    let needsRefresh = false;

    // 2. Проверяем существование кэша
    try {
      const stats = await fs.stat(EPG_CACHE_FILE);
      const fileAge = Date.now() - stats.mtimeMs;
      
      if (fileAge > EPG_CACHE_TTL) {
        needsRefresh = true;
      }
      
      const cachedContent = await fs.readFile(EPG_CACHE_FILE, "utf-8");
      epgData = JSON.parse(cachedContent);
    } catch {
      // Кэша нет
      needsRefresh = true;
    }

    // 3. Выполняем обновление
    if (force || (needsRefresh && !epgData)) {
      // Синхронное обновление, если кэша нет совсем или запрошен force
      console.log("[API EPG] Performing synchronous EPG fetch/parse...");
      epgData = await fetchAndParseEpg(epgUrl, playlistData.channels, true);
    } else if (needsRefresh && epgData) {
      // Асинхронное фоновое обновление (Stale-While-Revalidate)
      console.log("[API EPG] Triggering background EPG fetch/parse...");
      fetchAndParseEpg(epgUrl, playlistData.channels, true).catch(err => {
        console.error("[API EPG Background Error]", err);
      });
    }

    // 4. Возвращаем результат
    if (channelId) {
      const channelEpg = epgData ? (epgData[channelId] || []) : [];
      return NextResponse.json({ [channelId]: channelEpg });
    }

    return NextResponse.json(epgData || {});
  } catch (error) {
    console.error("[API EPG Error]", error);
    const message = error instanceof Error ? error.message : "Failed to load EPG";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
