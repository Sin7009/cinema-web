const TORRSERVER_API_URL = process.env.TORRSERVER_API_URL || "http://torrserver:8090";

export interface TorrFile {
  id: number;
  path: string;
  size: number;
}

export interface TorrTorrent {
  hash: string;
  title: string;
  poster: string;
  data: string;
  timestamp: number;
  file_list?: TorrFile[];
}

async function requestTorrServer(endpoint: string, body: any) {
  try {
    const res = await fetch(`${TORRSERVER_API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.error(`TorrServer error: ${res.statusText}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error(`TorrServer fetch error:`, error);
    return null;
  }
}

// Добавить торрент по magnet или torrent-ссылке
export async function addTorrent(link: string): Promise<TorrTorrent | null> {
  const data = await requestTorrServer("/torrents", {
    action: "add",
    link: link,
    save_to_db: true,
  });

  return data;
}

// Получить информацию о торренте (список файлов)
export async function getTorrent(hash: string): Promise<TorrTorrent | null> {
  const data = await requestTorrServer("/torrents", {
    action: "get",
    hash: hash,
  });

  return data;
}

// Получить плейлист m3u для внешнего плеера
export function getStreamUrl(hash: string, fileId: number): string {
  // Используем внешний публичный домен для вещания на клиенте
  return `https://torserv.nas-soft.com/stream/play?hash=${hash}&id=${fileId}`;
}
