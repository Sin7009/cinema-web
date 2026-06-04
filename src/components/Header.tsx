import React, { useState, useEffect } from "react";

interface HeaderProps {
  user: any;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onLogout: () => void;
}

interface TorrStatus {
  active: boolean;
  title: string | null;
  downloadSpeed: number;
  uploadSpeed: number;
  activePeers: number;
  totalPeers: number;
  progress: number;
  statString: string | null;
}

export default function Header({ user, searchQuery, setSearchQuery, onLogout }: HeaderProps) {
  const [torrStatus, setTorrStatus] = useState<TorrStatus | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null); // null = loading, true = online, false = offline

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/torrents/status");
        if (res.ok) {
          const data = await res.json();
          setTorrStatus(data);
          setIsOnline(true);
        } else {
          setIsOnline(false);
          setTorrStatus(null);
        }
      } catch (e) {
        setIsOnline(false);
        setTorrStatus(null);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return "0 КБ/с";
    const kbs = bytesPerSec / 1024;
    if (kbs < 1024) return `${kbs.toFixed(1)} КБ/с`;
    const mbs = kbs / 1024;
    return `${mbs.toFixed(1)} МБ/с`;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 md:px-12 py-4 transition-all duration-500 glass border-b border-white/5 bg-black/20 backdrop-blur-xl">
      <div className="flex items-center space-x-8">
        <h1 className="text-3xl font-black tracking-widest bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent cursor-pointer select-none drop-shadow-[0_0_15px_rgba(217,70,239,0.35)] hover:scale-105 transition duration-300">
          SINFLEX
        </h1>
        <nav className="hidden lg:flex space-x-6 text-sm font-bold text-gray-400">
          <span className="text-white hover:text-white cursor-pointer transition">Главная</span>
          <span className="hover:text-white cursor-pointer transition">Фильмы</span>
          <span className="hover:text-white cursor-pointer transition">Сериалы</span>
        </nav>
      </div>

      {/* Индикатор статуса TorrServer */}
      <div className="flex-1 max-w-lg mx-6 hidden md:block">
        <div className="flex justify-center">
          {isOnline === null ? (
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
              <span>TorrServer: проверка...</span>
            </div>
          ) : isOnline === false ? (
            <div className="flex items-center space-x-2 px-3 py-1 bg-red-950/20 border border-red-500/30 rounded-full text-xs font-bold text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.15)] animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span>TorrServer отключен</span>
            </div>
          ) : torrStatus && torrStatus.active ? (
            <div className="flex items-center space-x-3 px-4 py-1.5 bg-violet-950/20 border border-violet-500/30 rounded-full text-xs font-semibold text-violet-300 shadow-[0_0_15px_rgba(168,85,247,0.2)] animate-fade-in truncate max-w-full">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fuchsia-500"></span>
              </span>
              <span className="truncate">
                🍿 Воспроизведение: <strong className="text-white font-bold">{torrStatus.title}</strong>
              </span>
              <span className="text-gray-500">•</span>
              <span className="text-green-400 font-bold whitespace-nowrap">↓ {formatSpeed(torrStatus.downloadSpeed)}</span>
              {torrStatus.activePeers > 0 && (
                <>
                  <span className="text-gray-500">•</span>
                  <span className="text-violet-400 font-medium whitespace-nowrap">★ {torrStatus.activePeers} пиров</span>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2 px-3 py-1 bg-emerald-950/20 border border-emerald-500/30 rounded-full text-xs font-bold text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>TorrServer в сети (готов)</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-6">
        {/* Поиск */}
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder="Название фильма..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-40 sm:w-48 md:w-56 px-4 py-1.5 bg-black/60 border border-gray-700 rounded-full text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 text-gray-400 hover:text-white text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Профиль Plex */}
        <div className="flex items-center space-x-3 group relative">
          <div className="flex items-center space-x-2 cursor-pointer">
            {user?.thumb ? (
              <img
                src={user.thumb}
                alt={user.username}
                className="w-8 h-8 rounded-md border border-gray-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-md bg-violet-600 flex items-center justify-center font-bold text-white uppercase text-sm">
                {user?.username?.charAt(0) || "P"}
              </div>
            )}
            <span className="hidden sm:inline text-sm text-gray-300 group-hover:text-white transition">
              {user?.username || "Plex User"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

