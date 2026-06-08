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
  category?: string;
  data: string;
  timestamp: number;
  file_list?: TorrFile[];
  
  // Динамические поля статуса воспроизведения/загрузки
  stat?: number;
  stat_string?: string;
  download_speed?: number;
  upload_speed?: number;
  active_peers?: number;
  total_peers?: number;
  loaded_size?: number;
  size?: number;
}

interface TorrServerResponse {
  hash?: string;
  title?: string;
  poster?: string;
  category?: string;
  data?: string;
  timestamp?: number;
  stat?: number;
  stat_string?: string;
  download_speed?: number;
  upload_speed?: number;
  active_peers?: number;
  total_peers?: number;
  loaded_size?: number;
  size?: number;
  file_stats?: Array<{ id: number; path: string; length?: number; size?: number }>;
  file_list?: Array<{ id: number; path: string; length?: number; size?: number }>;
}

async function requestTorrServer(endpoint: string, body: Record<string, unknown>) {
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
function mapTorrentResponse(data: TorrServerResponse | null): TorrTorrent | null {
  if (!data) return null;

  let file_list: TorrFile[] = [];

  // 1. Проверяем file_stats (основной источник для запущенных/активных торрентов)
  if (Array.isArray(data.file_stats)) {
    file_list = data.file_stats.map((f) => ({
      id: f.id,
      path: f.path,
      size: f.length || f.size || 0
    }));
  }
  // 2. Проверяем file_list (для обратной совместимости)
  else if (Array.isArray(data.file_list)) {
    file_list = data.file_list.map((f) => ({
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
        file_list = files.map((f: { id: number; path: string; length?: number; size?: number }) => ({
          id: f.id,
          path: f.path,
          size: f.length || f.size || 0
        }));
      }
    } catch {
      // Игнорируем ошибки парсинга
    }
  }

  return {
    hash: data.hash || "",
    title: data.title || "",
    poster: data.poster || "",
    category: data.category || "",
    data: data.data || "",
    timestamp: data.timestamp || 0,
    file_list: file_list.length > 0 ? file_list : undefined,
    
    // Динамические поля
    stat: data.stat,
    stat_string: data.stat_string,
    download_speed: data.download_speed,
    upload_speed: data.upload_speed,
    active_peers: data.active_peers,
    total_peers: data.total_peers,
    loaded_size: data.loaded_size,
    size: data.size
  };
}

// Добавить торрент по magnet или torrent-ссылке
export async function addTorrent(link: string, title?: string, poster?: string): Promise<TorrTorrent | null> {
  const data = await requestTorrServer("/torrents", {
    action: "add",
    link: link,
    title: title || "",
    poster: poster || "",
    category: "sinflex",
    save_to_db: true,
  });

  return mapTorrentResponse(data);
}

// Загрузить торрент в TorrServer как файл .torrent
export async function uploadTorrent(fileBuffer: Buffer, title: string, poster?: string): Promise<TorrTorrent | null> {
  try {
    const formData = new FormData();
    const fileBlob = new Blob([new Uint8Array(fileBuffer)], { type: "application/x-bittorrent" });
    formData.append("file", fileBlob, `${title || "torrent"}.torrent`);
    formData.append("save", "true");
    
    // Передаем дополнительные метаданные в TorrServer
    if (title) formData.append("title", title);
    if (poster) formData.append("poster", poster);
    formData.append("category", "sinflex");

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
    let torrent: TorrTorrent | null = null;
    if (Array.isArray(data) && data.length > 0) {
      torrent = mapTorrentResponse(data[0]);
    } else {
      torrent = mapTorrentResponse(data);
    }

    // Если по какой-то причине TorrServer не сохранил title/poster при upload (зависит от версии),
    // принудительно обновим их через action: update
    if (torrent && torrent.hash && (title || poster)) {
      await requestTorrServer("/torrents", {
        action: "update",
        hash: torrent.hash,
        title: title || torrent.title || "",
        poster: poster || torrent.poster || "",
        category: "sinflex",
        save_to_db: true,
      });
      torrent.title = title || torrent.title;
      torrent.poster = poster || torrent.poster;
    }

    return torrent;
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

// Получить ссылку на поток для воспроизведения
export function getStreamUrl(hash: string, fileId: number, filename?: string): string {
  const name = filename ? encodeURIComponent(filename) : "video.mkv";
  // Используем внешний публичный домен для вещания на клиенте с новым форматом API TorrServer Matrix
  return `https://torserv.nas-soft.com/stream/${name}?link=${hash}&index=${fileId}&play`;
}

// Получить список всех торрентов в TorrServer
export async function listTorrents(): Promise<TorrTorrent[]> {
  const data = await requestTorrServer("/torrents", {
    action: "list",
  });
  if (Array.isArray(data)) {
    const list = data.map(mapTorrentResponse).filter(Boolean) as TorrTorrent[];
    // Фильтруем раздачи: оставляем только те, у которых есть постер ИЛИ у которых категория "sinflex" (1C)
    return list.filter(t => (t.poster && t.poster.trim() !== "") || t.category === "sinflex");
  }
  return [];
}

export interface TorrStatus {
  active: boolean;
  title: string | null;
  downloadSpeed: number;
  uploadSpeed: number;
  activePeers: number;
  totalPeers: number;
  progress: number;
  statString: string | null;
}

export async function getTorrServerStatus(): Promise<TorrStatus> {
  try {
    const data = await requestTorrServer("/torrents", { action: "list" });
    if (!Array.isArray(data)) {
      return { active: false, title: null, downloadSpeed: 0, uploadSpeed: 0, activePeers: 0, totalPeers: 0, progress: 0, statString: null };
    }

    // Ищем торрент, который активно стримится или скачивается (скорость > 0 или статус downloading/metadata)
    const activeTorrent = (data as TorrServerResponse[]).find((t) => (t.download_speed || 0) > 0 || ((t.stat || 0) >= 1 && (t.stat || 0) <= 4));

    if (activeTorrent) {
      const size = activeTorrent.size || 0;
      const loaded = activeTorrent.loaded_size || 0;
      const progress = size > 0 ? Math.round((loaded / size) * 100) : 0;

      return {
        active: true,
        title: activeTorrent.title || "Без названия",
        downloadSpeed: activeTorrent.download_speed || 0,
        uploadSpeed: activeTorrent.upload_speed || 0,
        activePeers: activeTorrent.active_peers || 0,
        totalPeers: activeTorrent.total_peers || 0,
        progress: progress,
        statString: activeTorrent.stat_string || null
      };
    }

    return {
      active: false,
      title: null,
      downloadSpeed: 0,
      uploadSpeed: 0,
      activePeers: 0,
      totalPeers: 0,
      progress: 0,
      statString: null
    };
  } catch {
    console.error("Error in getTorrServerStatus");
    return { active: false, title: null, downloadSpeed: 0, uploadSpeed: 0, activePeers: 0, totalPeers: 0, progress: 0, statString: null };
  }
}

