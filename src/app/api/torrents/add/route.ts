import { NextRequest, NextResponse } from "next/server";
import { addTorrent, uploadTorrent, getTorrent, TorrTorrent } from "@/lib/torrserver";
import { getOrDownloadTorrentFile } from "@/lib/torrentCache";

export async function POST(req: NextRequest) {
  try {
    const { link, title } = await req.json();
    if (!link) {
      return NextResponse.json({ error: "Missing torrent link" }, { status: 400 });
    }

    let torrent: TorrTorrent | null = null;

    if (link.startsWith("magnet:")) {
      // Для magnet-ссылок используем стандартный метод добавления
      console.log(`[Add Torrent] Adding magnet link directly: ${link.substring(0, 50)}...`);
      torrent = await addTorrent(link);
    } else {
      // Для HTTP/HTTPS ссылок скачиваем и кэшируем .torrent-файл
      console.log(`[Add Torrent] Processing torrent URL: ${link}`);
      try {
        const fileBuffer = await getOrDownloadTorrentFile(link);
        if (fileBuffer && fileBuffer.length > 0) {
          // Загружаем файл напрямую в TorrServer
          torrent = await uploadTorrent(fileBuffer, title || "torrent");
        }
      } catch (err) {
        console.error("[Add Torrent] Failed to cache/upload torrent file, trying fallback:", err);
      }

      // Резервный вариант: если кэширование или загрузка файла не удались, пробуем добавить по ссылке
      if (!torrent) {
        console.log("[Add Torrent] Fallback: adding via URL link directly");
        torrent = await addTorrent(link);
      }
    }

    if (!torrent || !torrent.hash) {
      return NextResponse.json({ error: "Failed to add torrent to TorrServer" }, { status: 500 });
    }

    // Ждем 1.5 секунды, чтобы TorrServer успел стянуть метаданные торрента (список файлов)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Запрашиваем информацию заново, чтобы получить file_list
    const details = await getTorrent(torrent.hash);

    return NextResponse.json({ torrent: details || torrent });
  } catch (error: any) {
    console.error("Error in add torrent API route:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
