/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Header, { User } from "@/components/Header";
import IptvPlayer from "@/components/IptvPlayer";
import { IptvChannel, EpgProgramme } from "@/lib/iptv";
import { db } from "@/lib/indexedDb";

export default function IptvPage() {
  const [user, setUser] = useState<User | null>(null);
  
  // Данные плейлиста и EPG
  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [epgData, setEpgData] = useState<Record<string, EpgProgramme[]>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  
  // Состояния интерфейса
  const [loading, setLoading] = useState(true);
  const [epgLoading, setEpgLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<IptvChannel | null>(null);
  
  // Локальное время для расчета EPG прогресса (обновляется каждую минуту)
  const [nowTime, setNowTime] = useState(() => Date.now());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 1. Загрузка данных
  useEffect(() => {
    async function loadIptvData() {
      try {
        // Загрузка пользователя (всегда Администратор)
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          setUser(meData.user);
        }

        // Загрузка Избранного из IndexedDB (и фоллбэк на localStorage)
        let favList: string[] = [];
        try {
          favList = await db.getIptvFavorites();
          if (favList.length === 0) {
            const savedFavorites = localStorage.getItem("sinflex_iptv_favorites");
            if (savedFavorites) {
              favList = JSON.parse(savedFavorites);
              await db.saveIptvFavorites(favList);
            }
          }
        } catch {
          const savedFavorites = localStorage.getItem("sinflex_iptv_favorites");
          if (savedFavorites) {
            favList = JSON.parse(savedFavorites);
          }
        }
        setFavorites(favList);

        // Загрузка плейлиста
        const playlistRes = await fetch("/api/iptv/playlist");
        if (!playlistRes.ok) throw new Error("Failed to load playlist");
        const playlistData = await playlistRes.json();
        
        setChannels(playlistData.channels || []);
        setCategories(playlistData.categories || []);

        if (favList.length > 0) {
          setSelectedCategory("Избранное");
          const firstFav = (playlistData.channels || []).find((c: IptvChannel) => favList.includes(c.id));
          if (firstFav) {
            setSelectedChannel(firstFav);
          } else if (playlistData.channels && playlistData.channels.length > 0) {
            setSelectedChannel(playlistData.channels[0]);
          }
        } else {
          setSelectedCategory("Все");
          if (playlistData.channels && playlistData.channels.length > 0) {
            setSelectedChannel(playlistData.channels[0]);
          }
        }

        setLoading(false);

        // Загрузка EPG (в фоновом режиме, чтобы плеер заработал сразу)
        const epgRes = await fetch("/api/iptv/epg");
        if (epgRes.ok) {
          const epg = await epgRes.json();
          setEpgData(epg || {});
        }
      } catch (err) {
        console.error(err);
        setLoading(false);
      } finally {
        setEpgLoading(false);
      }
    }

    loadIptvData();
  }, []);

  // Обновление локального времени каждую минуту
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTime(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // 2. Управление Избранным
  const toggleFavorite = async (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let newFavs: string[];
    if (favorites.includes(channelId)) {
      newFavs = favorites.filter(id => id !== channelId);
    } else {
      newFavs = [...favorites, channelId];
    }
    setFavorites(newFavs);
    localStorage.setItem("sinflex_iptv_favorites", JSON.stringify(newFavs));
    try {
      await db.saveIptvFavorites(newFavs);
    } catch {
      console.error("Failed to save favorites to IndexedDB");
    }
  };

  // 3. Фильтрация и поиск каналов
  const filteredChannels = useMemo(() => {
    return channels.filter(channel => {
      // Фильтр по категории
      if (selectedCategory === "Избранное") {
        if (!favorites.includes(channel.id)) return false;
      } else if (selectedCategory && selectedCategory !== "Все" && channel.group !== selectedCategory) {
        return false;
      }

      // Поиск по названию
      if (searchQuery.trim().length > 0) {
        return channel.name.toLowerCase().includes(searchQuery.toLowerCase());
      }

      return true;
    });
  }, [channels, selectedCategory, favorites, searchQuery]);

  // 4. Поиск текущей передачи и следующей
  const getChannelPrograms = (channelId: string) => {
    const programs = epgData[channelId] || [];
    const currentIdx = programs.findIndex(p => p.start <= nowTime && p.stop >= nowTime);
    
    if (currentIdx === -1) return { current: null, next: null, progress: 0 };

    const current = programs[currentIdx];
    const next = programs[currentIdx + 1] || null;
    const progress = Math.min(
      100,
      Math.max(0, ((nowTime - current.start) / (current.stop - current.start)) * 100)
    );

    return { current, next, progress };
  };

  // Форматирование времени (1234567890 -> 14:30)
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("ru-RU", {
      timeZone: "Europe/Moscow",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  // Переключение каналов (внутри отфильтрованного списка)
  const handlePrevChannel = () => {
    if (!selectedChannel || filteredChannels.length <= 1) return;
    const currentIdx = filteredChannels.findIndex(c => c.id === selectedChannel.id);
    const prevIdx = (currentIdx - 1 + filteredChannels.length) % filteredChannels.length;
    setSelectedChannel(filteredChannels[prevIdx]);
    scrollToActiveChannel();
  };

  const handleNextChannel = () => {
    if (!selectedChannel || filteredChannels.length <= 1) return;
    const currentIdx = filteredChannels.findIndex(c => c.id === selectedChannel.id);
    const nextIdx = (currentIdx + 1) % filteredChannels.length;
    setSelectedChannel(filteredChannels[nextIdx]);
    scrollToActiveChannel();
  };

  const scrollToActiveChannel = () => {
    setTimeout(() => {
      const activeEl = document.querySelector("[data-active-channel='true']");
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  };

  // EPG текущего выбранного канала
  const selectedChannelEpg = useMemo(() => {
    if (!selectedChannel) return [];
    return epgData[selectedChannel.id] || [];
  }, [selectedChannel, epgData]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#07080e]">
        <div className="text-center space-y-6">
          <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-500 to-pink-500 animate-pulse tracking-widest font-sans">
            SINFLEX IPTV
          </span>
          <div className="flex justify-center">
            <div className="w-10 h-10 border-4 border-t-violet-500 border-white/5 rounded-full animate-spin shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
          </div>
          <p className="text-gray-500 text-xs tracking-wide uppercase animate-pulse">Загрузка плейлиста...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pb-10 bg-[#07060f] min-h-screen text-white font-sans">
      <Header
        user={user}
        searchQuery=""
        setSearchQuery={() => {}}
      />

      <div className="pt-28 px-4 md:px-10 max-w-8xl mx-auto flex flex-col lg:flex-row gap-8">
        
        {/* ЛЕВАЯ ЧАСТЬ: САЙДБАР С КАНАЛАМИ */}
        <div className="w-full lg:w-96 flex flex-col shrink-0 glass rounded-2xl overflow-hidden border border-white/5 h-[calc(100vh-140px)] shadow-2xl">
          
          {/* Поиск каналов */}
          <div className="p-4 border-b border-white/5 space-y-3 bg-black/20">
            <div className="relative">
              <input
                type="text"
                placeholder="Поиск канала..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 bg-black/40 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-violet-500 transition text-white placeholder-gray-500"
              />
              <svg className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            {/* Выбор Категории */}
            <div className="flex space-x-2 overflow-x-auto pb-1.5 no-scrollbar scroll-smooth">
              {/* Все каналы */}
              <button
                onClick={() => setSelectedCategory("Все")}
                className={`px-3 py-1.5 rounded-xl text-xxs font-bold uppercase tracking-wider whitespace-nowrap transition duration-200 flex items-center space-x-1.5 border ${
                  selectedCategory === "Все"
                    ? "bg-violet-600 border-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                    : "bg-black/40 border-white/5 hover:border-white/10 hover:bg-white/5 text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>📺 Все</span>
                <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${selectedCategory === "Все" ? "bg-violet-700 text-white" : "bg-white/5 text-gray-500"}`}>
                  {channels.length}
                </span>
              </button>

              {/* Избранное */}
              {favorites.length > 0 && (
                <button
                  onClick={() => setSelectedCategory("Избранное")}
                  className={`px-3 py-1.5 rounded-xl text-xxs font-bold uppercase tracking-wider whitespace-nowrap transition duration-200 flex items-center space-x-1.5 border ${
                    selectedCategory === "Избранное"
                      ? "bg-violet-600 border-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                      : "bg-black/40 border-white/5 hover:border-white/10 hover:bg-white/5 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  <span>⭐ Избранное</span>
                  <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${selectedCategory === "Избранное" ? "bg-violet-700 text-white" : "bg-white/5 text-gray-500"}`}>
                    {favorites.length}
                  </span>
                </button>
              )}

              {/* Все остальные категории из плейлиста */}
              {categories.map((cat) => {
                const count = channels.filter(c => c.group === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xxs font-bold uppercase tracking-wider whitespace-nowrap transition duration-200 flex items-center space-x-1.5 border ${
                      selectedCategory === cat
                        ? "bg-violet-600 border-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                        : "bg-black/40 border-white/5 hover:border-white/10 hover:bg-white/5 text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span>📁 {cat}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${selectedCategory === cat ? "bg-violet-700 text-white" : "bg-white/5 text-gray-500"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Список каналов */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto divide-y divide-white/5 no-scrollbar bg-black/10"
          >
            {filteredChannels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500 space-y-2">
                <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs">Каналы не найдены</span>
              </div>
            ) : (
              filteredChannels.map((channel) => {
                const isActive = selectedChannel?.id === channel.id;
                const { current, progress } = getChannelPrograms(channel.id);
                
                return (
                  <div
                    key={channel.id}
                    onClick={() => setSelectedChannel(channel)}
                    data-active-channel={isActive}
                    className={`flex items-center space-x-3.5 p-3.5 cursor-pointer transition duration-200 border-l-4 group relative ${
                      isActive
                        ? "bg-violet-950/20 border-violet-500"
                        : "border-transparent hover:bg-white/5"
                    }`}
                  >
                    {/* Логотип */}
                    <div className="w-12 h-12 rounded-lg bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center shrink-0">
                      {channel.logo ? (
                        <img
                          src={channel.logo.replace(/^https?:\/\/(cdn\.)?epg\.one/i, "https://cdn.epg.one")}
                          alt=""
                          className="w-full h-full object-contain p-1"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="text-xxs font-black text-violet-400 uppercase tracking-widest">
                          {channel.name.substring(0, 2)}
                        </span>
                      )}
                    </div>

                    {/* Название и EPG */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex justify-between items-center">
                        <h3 className={`font-bold text-xs truncate ${isActive ? "text-violet-300" : "text-gray-200"}`}>
                          {channel.name}
                        </h3>
                      </div>
                      
                      {current ? (
                        <div className="space-y-1">
                          <p className="text-xxs text-gray-400 font-medium truncate">
                            {current.title}
                          </p>
                          {/* Шкала выполнения */}
                          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xxs text-gray-500 italic">
                          {epgLoading ? "Программа загружается..." : "Нет данных о передаче"}
                        </p>
                      )}
                    </div>

                    {/* Добавить в Избранное */}
                    <button
                      onClick={(e) => toggleFavorite(channel.id, e)}
                      className={`opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-yellow-400 transition shrink-0 ${
                        favorites.includes(channel.id) ? "opacity-100 text-yellow-400" : ""
                      }`}
                      title={favorites.includes(channel.id) ? "Убрать из избранного" : "Добавить в избранное"}
                    >
                      <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ЦЕНТРАЛЬНАЯ ЧАСТЬ: ПЛЕЕР И ПОЛНЫЙ EPG ГИД */}
        <div className="flex-1 flex flex-col space-y-6 min-w-0">
          {selectedChannel ? (
            <>
              {/* Плеер */}
              <IptvPlayer
                src={selectedChannel.url}
                channelName={selectedChannel.name}
                onPrevChannel={handlePrevChannel}
                onNextChannel={handleNextChannel}
              />

              {/* Детали канала и кнопка Избранного */}
              <div className="flex justify-between items-center p-6 glass rounded-2xl border border-white/5 shadow-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-black/40 rounded-xl border border-white/10 p-2 shrink-0 flex items-center justify-center">
                    {selectedChannel.logo ? (
                      <img src={selectedChannel.logo.replace(/^https?:\/\/(cdn\.)?epg\.one/i, "https://cdn.epg.one")} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs font-black text-violet-400 uppercase tracking-widest">{selectedChannel.name.substring(0, 3)}</span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">{selectedChannel.name}</h2>
                    <p className="text-xs text-gray-400">Категория: {selectedChannel.group}</p>
                  </div>
                </div>

                <button
                  onClick={(e) => toggleFavorite(selectedChannel.id, e)}
                  className={`flex items-center space-x-2 px-4 py-2 border rounded-xl text-xs font-bold transition duration-300 ${
                    favorites.includes(selectedChannel.id)
                      ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                      : "border-white/10 hover:border-white/20 hover:bg-white/5 text-gray-300 hover:text-white"
                  }`}
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  <span>{favorites.includes(selectedChannel.id) ? "В избранном" : "В избранное"}</span>
                </button>
              </div>

              {/* Программа передач (EPG Grid) */}
              <div className="p-6 glass rounded-2xl border border-white/5 shadow-lg space-y-4">
                <h3 className="text-base font-extrabold text-white tracking-wide uppercase flex items-center space-x-2">
                  <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Программа передач на сегодня</span>
                </h3>

                {epgLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-t-violet-500 border-white/5 rounded-full animate-spin" />
                  </div>
                ) : selectedChannelEpg.length === 0 ? (
                  <p className="text-gray-500 text-xs italic text-center py-6">Телепрограмма временно недоступна для этого канала.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-white/5 pr-2 no-scrollbar">
                    {selectedChannelEpg.map((prog, idx) => {
                      const isCurrent = prog.start <= nowTime && prog.stop >= nowTime;
                      const isPast = prog.stop < nowTime;

                      return (
                        <div
                          key={idx}
                          className={`py-3.5 flex items-start space-x-4 transition duration-150 ${
                            isCurrent
                              ? "bg-violet-950/10 -mx-3 px-3 rounded-lg border-l-4 border-violet-500"
                              : isPast
                              ? "opacity-45"
                              : ""
                          }`}
                        >
                          {/* Время начала и завершения */}
                          <div className="text-xs font-bold text-violet-400 w-24 shrink-0 font-mono">
                            {formatTime(prog.start)} - {formatTime(prog.stop)}
                          </div>

                          {/* Текст передачи */}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center space-x-2">
                              <h4 className={`text-xs font-bold tracking-wide ${isCurrent ? "text-violet-300" : "text-gray-200"}`}>
                                {prog.title}
                              </h4>
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-[9px] font-black text-violet-300 tracking-wider uppercase animate-pulse border border-violet-500/20">
                                  Сейчас в эфире
                                </span>
                              )}
                            </div>
                            {prog.desc && (
                              <p className="text-xxs text-gray-400 leading-relaxed max-w-2xl">{prog.desc}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 py-32 text-gray-500 space-y-4 glass rounded-2xl border border-white/5 shadow-2xl">
              <svg className="w-16 h-16 opacity-30 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-400">Канал не выбран</h3>
              <p className="text-xs max-w-xs text-center leading-relaxed text-gray-500">Пожалуйста, выберите канал из списка слева для начала воспроизведения эфира.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
