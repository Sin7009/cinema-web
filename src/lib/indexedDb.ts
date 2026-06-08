/**
 * SinflexDB - Клиентская библиотека для работы с IndexedDB.
 * Полностью безопасна для использования в Next.js (SSR).
 */

export interface PlaybackProgress {
  id: string; // Формат: `${hash}_${fileId}`
  hash: string;
  fileId: number;
  time: number;
  duration: number;
  updatedAt: number;
}

export interface WatchHistoryItem {
  id: string; // ID фильма (TMDB) или торрент хэш
  title: string;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  updatedAt: number;
  type: "movie" | "tv" | "torrent";
  activeFileId?: number;
}

const DB_NAME = "sinflex_db";
const DB_VERSION = 1;

class SinflexDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    // Безопасная инициализация на сервере
    if (typeof window !== "undefined") {
      this.initPromise = this.init();
    }
  }

  private init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        if (oldVersion < 1) {
          // Хранилище прогресса видео
          db.createObjectStore("progress", { keyPath: "id" });
          
          // Хранилище истории просмотров
          db.createObjectStore("history", { keyPath: "id" });

          // Хранилище настроек (ключ-значение)
          db.createObjectStore("settings", { keyPath: "id" });

          // Хранилище избранного IPTV
          db.createObjectStore("iptv_favorites", { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (typeof window === "undefined") {
      throw new Error("IndexedDB is only available in the browser.");
    }
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.init();
    return this.initPromise;
  }

  // --- PROGRESS METHODS ---

  async getProgress(hash: string, fileId: number): Promise<PlaybackProgress | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("progress", "readonly");
        const store = transaction.objectStore("progress");
        const id = `${hash}_${fileId}`;
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async saveProgress(hash: string, fileId: number, time: number, duration: number): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("progress", "readwrite");
        const store = transaction.objectStore("progress");
        const id = `${hash}_${fileId}`;
        
        const data: PlaybackProgress = {
          id,
          hash,
          fileId,
          time,
          duration,
          updatedAt: Date.now(),
        };

        const request = store.put(data);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Игнорируем ошибки при невозможности записи (например, режим инкогнито)
    }
  }

  async deleteProgress(hash: string, fileId: number): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("progress", "readwrite");
        const store = transaction.objectStore("progress");
        const id = `${hash}_${fileId}`;
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Игнорируем ошибки
    }
  }

  // --- HISTORY METHODS ---

  async getHistory(): Promise<WatchHistoryItem[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("history", "readonly");
        const store = transaction.objectStore("history");
        const request = store.getAll();

        request.onsuccess = () => {
          const result = request.result || [];
          // Сортируем по дате обновления (сначала новые)
          result.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(result);
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async addToHistory(item: Omit<WatchHistoryItem, "updatedAt">): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("history", "readwrite");
        const store = transaction.objectStore("history");
        
        const data: WatchHistoryItem = {
          ...item,
          updatedAt: Date.now(),
        };

        const request = store.put(data);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Игнорируем
    }
  }

  async removeFromHistory(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("history", "readwrite");
        const store = transaction.objectStore("history");
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Игнорируем
    }
  }

  // --- SETTINGS METHODS ---

  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("settings", "readonly");
        const store = transaction.objectStore("settings");
        const request = store.get(key);

        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result.value as T);
          } else {
            resolve(defaultValue);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return defaultValue;
    }
  }

  async saveSetting<T>(key: string, value: T): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("settings", "readwrite");
        const store = transaction.objectStore("settings");
        const request = store.put({ id: key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Игнорируем
    }
  }

  // --- IPTV FAVORITES ---

  async getIptvFavorites(): Promise<string[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("iptv_favorites", "readonly");
        const store = transaction.objectStore("iptv_favorites");
        const request = store.getAll();

        request.onsuccess = () => {
          const list = request.result || [];
          resolve(list.map((item) => item.id));
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async saveIptvFavorites(favorites: string[]): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("iptv_favorites", "readwrite");
        const store = transaction.objectStore("iptv_favorites");
        
        // Очищаем старые
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
          let count = 0;
          if (favorites.length === 0) {
            resolve();
            return;
          }
          
          favorites.forEach((fav) => {
            const addReq = store.put({ id: fav });
            addReq.onsuccess = () => {
              count++;
              if (count === favorites.length) {
                resolve();
              }
            };
            addReq.onerror = () => reject(addReq.error);
          });
        };

        clearRequest.onerror = () => reject(clearRequest.error);
      });
    } catch {
      // Игнорируем
    }
  }
}

export const db = new SinflexDB();
