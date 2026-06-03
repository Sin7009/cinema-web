import { NextRequest, NextResponse } from "next/server";
import { addTorrent, getTorrent } from "@/lib/torrserver";

export async function POST(req: NextRequest) {
  try {
    const { link } = await req.json();
    if (!link) {
      return NextResponse.json({ error: "Missing torrent link" }, { status: 400 });
    }

    const torrent = await addTorrent(link);
    if (!torrent || !torrent.hash) {
      return NextResponse.json({ error: "Failed to add torrent to TorrServer" }, { status: 500 });
    }

    // Ждем 1.5 секунды, чтобы TorrServer успел стянуть метаданные торрента (список файлов)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Запрашиваем информацию заново, чтобы получить file_list
    const details = await getTorrent(torrent.hash);

    return NextResponse.json({ torrent: details || torrent });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
