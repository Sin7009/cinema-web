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

// Вспомогательная функция для маппинга ответа TorrServer и извлечения списка файлов
function mapTorrentResponse(data: any): TorrTorrent | null {
  if (!data) return null;

  let file_list: TorrFile[] = [];

  // 1. Проверяем file_stats (основной источник для запущенных/активных торрентов)
  if (Array.isArray(data.file_stats)) {
    file_list = data.file_stats.map((f: any) => ({
      id: f.id,
      path: f.path,
      size: f.length || f.size || 0
    }));
  }
  // 2. Проверяем file_list (для обратной совместимости)
  else if (Array.isArray(data.file_list)) {
    file_list = data.file_list.map((f: any) => ({
      id: f.id,
      path: f.path,
      size: f.size || f.length || 0
    }));
  }
  // 3. Проверяем сериализованное поле data (для неактивных торрентов в БД, stat = 5)
  else if (data.data) {
    try {
      const parsedData = JSON.parse(data.data);
      const files = parsedData?.TorrServer?.Files;
      if (Array.isArray(files)) {
        file_list = files.map((f: any) => ({
          id: f.id,
          path: f.path,
          size: f.length || f.size || 0
        }));
      }
    } catch (e) {
      // Игнорируем ошибки парсинга
    }
  }

  return {
    hash: data.hash || "",
    title: data.title || "",
    poster: data.poster || "",
    data: data.data || "",
    timestamp: data.timestamp || 0,
    file_list: file_list.length > 0 ? file_list : undefined
  };
}

// Добавить торрент по magnet или torrent-ссылке
export async function addTorrent(link: string): Promise<TorrTorrent | null> {
  const data = await requestTorrServer("/torrents", {
    action: "add",
    link: link,
    save_to_db: true,
  });

  return mapTorrentResponse(data);
}

// Загрузить торрент в TorrServer как файл .torrent
export async function uploadTorrent(fileBuffer: Buffer, title: string): Promise<TorrTorrent | null> {
  try {
    const formData = new FormData();
    const fileBlob = new Blob([new Uint8Array(fileBuffer)], { type: "application/x-bittorrent" });
    formData.append("file", fileBlob, `${title || "torrent"}.torrent`);
    formData.append("save", "true");

    const res = await fetch(`${TORRSERVER_API_URL}/torrent/upload`, {
      method: "POST",
      body: formData,
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.error(`TorrServer upload error: ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    
    // В новых версиях API может возвращать массив объектов [{hash, title, ...}]
    if (Array.isArray(data) && data.length > 0) {
      return mapTorrentResponse(data[0]);
    }
    
    return mapTorrentResponse(data);
  } catch (error) {
    console.error("TorrServer upload fetch error:", error);
    return null;
  }
}

// Получить информацию о торренте (список файлов)
export async function getTorrent(hash: string): Promise<TorrTorrent | null> {
  const data = await requestTorrServer("/torrents", {
    action: "get",
    hash: hash,
  });

  return mapTorrentResponse(data);
}

// Получить плейлист m3u для внешнего плеера
export function getStreamUrl(hash: string, fileId: number): string {
  // Используем внешний публичный домен для вещания на клиенте
  return `https://torserv.nas-soft.com/stream/play?hash=${hash}&id=${fileId}`;
}

// Получить список всех торрентов в TorrServer
export async function listTorrents(): Promise<TorrTorrent[]> {
  const data = await requestTorrServer("/torrents", {
    action: "list",
  });
  if (Array.isArray(data)) {
    return data.map(mapTorrentResponse).filter(Boolean) as TorrTorrent[];
  }
  return [];
}
