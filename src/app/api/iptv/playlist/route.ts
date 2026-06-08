import { NextRequest, NextResponse } from "next/server";
import { fetchAndParsePlaylist } from "@/lib/iptv";

const DEFAULT_PLAYLIST_URL = "http://eea56c71aaa8.zatikov.net/playlists/uplist/8e5c746f7feadb75191e865fc9a1e9b4/playlist.m3u8";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";
    const playlistUrl = searchParams.get("url") || DEFAULT_PLAYLIST_URL;

    const data = await fetchAndParsePlaylist(playlistUrl, force);
    
    // Переписываем URL каналов через прокси, чтобы обойти блокировку Mixed Content (HTTP потоки на HTTPS сайте)
    const proxiedChannels = data.channels.map(channel => ({
      ...channel,
      url: `/api/iptv/stream?url=${encodeURIComponent(channel.url)}`,
    }));

    return NextResponse.json({
      ...data,
      channels: proxiedChannels,
    });
  } catch (error) {
    console.error("[API Playlist Error]", error);
    const message = error instanceof Error ? error.message : "Failed to load playlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
