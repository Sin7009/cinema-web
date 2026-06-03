"use client";

import React, { useState, useEffect, useRef } from "react";
import { TorrentResult } from "@/lib/jackett";

interface MovieModalProps {
  movie: any;
  onClose: () => void;
  plexAuthToken?: string;
  plexServerUrl?: string;
}

export default function MovieModal({ movie, onClose, plexAuthToken, plexServerUrl }: MovieModalProps) {
  const [activeTab, setActiveTab] = useState<"info" | "torrents" | "watch">("info");
  const [details, setDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [torrents, setTorrents] = useState<TorrentResult[]>([]);
  const [loadingTorrents, setLoadingTorrents] = useState(false);
  
  // Состояния выбора торрента и файлов в TorrServer
  const [addingTorrent, setAddingTorrent] = useState(false);
  const [torrTorrent, setTorrTorrent] = useState<any>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);

  // Состояние встроенного плеера
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Состояния автоматического пропуска титров и заставок
  const [skipTimes, setSkipTimes] = useState<{
    intro: { start: number; end: number } | null;
    outro: { start: number; end: number } | null;
  } | null>(null);
  const [cancelledSkips, setCancelledSkips] = useState<string[]>([]);
  const [loadingSkipTimes, setLoadingSkipTimes] = useState(false);
  const [skipOverlay, setSkipOverlay] = useState<{
    show: boolean;
    type: "intro" | "outro" | null;
    countdown: number;
  }>({
    show: false,
    type: null,
    countdown: 5,
  });

  const movieId = movie.id || movie.hash;
  const isTorrTorrent = !!movie.hash;

  const isTvShow = movie.media_type === "tv" || !!movie.first_air_date || !!movie.name;

  const movieTitle = movie.title || movie.name || movie.original_title || "Без названия";
  const movieYear = movie.release_date || movie.first_air_date || movie.timestamp
    ? new Date(movie.release_date || movie.first_air_date || (movie.timestamp ? movie.timestamp * 1000 : 0)).getFullYear()
    : null;

  // 1. Загрузка подробной информации о фильме или сериале
  useEffect(() => {
    async function loadDetails() {
      setLoadingDetails(true);
      try {
        if (!isTorrTorrent) {
          const endpoint = isTvShow ? `/api/tv/${movieId}` : `/api/movies/${movieId}`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            setDetails(data);
          }
        } else {
          // Если это фильм напрямую из TorrServer
          setDetails({
            overview: movie.stat_string || "Торрент-раздача добавлена в TorrServer.",
            genres: [],
            credits: { cast: [] }
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingDetails(false);
      }
    }
    loadDetails();
  }, [movieId, isTorrTorrent, isTvShow]);

  // 1.2. Автозагрузка деталей торрента из TorrServer по хэшу
  useEffect(() => {
    if (movie.hash) {
      async function loadTorrTorrent() {
        try {
          const res = await fetch(`/api/torrents/get?hash=${movie.hash}`);
          if (res.ok) {
            const data = await res.json();
            setTorrTorrent(data.torrent);
            const files = data.torrent.file_list || [];
            if (files.length === 1) {
              setSelectedFileId(files[0].id);
            }
            setActiveTab("watch"); // Сразу переходим во вкладку воспроизведения
          }
        } catch (e) {
          console.error(e);
        }
      }
      loadTorrTorrent();
    }
  }, [movie.hash]);

  // 2. Поиск торрентов через Jackett в фоновом режиме сразу при открытии модального окна
  useEffect(() => {
    if (torrents.length === 0 && movieTitle && movieTitle !== "Без названия") {
      async function loadTorrents() {
        setLoadingTorrents(true);
        try {
          const origTitle = movie.original_title || movie.original_name || "";
          const params = new URLSearchParams({
            title: movieTitle,
            originalTitle: origTitle,
            year: movieYear ? String(movieYear) : "",
          });
          const res = await fetch(`/api/torrents/search?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            setTorrents(data.results || []);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingTorrents(false);
        }
      }
      loadTorrents();
    }
  }, [movie, movieTitle, movieYear, torrents.length]);

  // 2.2. Автоматический опрос TorrServer для получения списка файлов, если он изначально пуст
  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

    if (activeTab === "watch" && torrTorrent && (!torrTorrent.file_list || torrTorrent.file_list.length === 0)) {
      const pollTorrentDetails = async () => {
        try {
          const res = await fetch(`/api/torrents/get?hash=${torrTorrent.hash}`);
          if (res.ok) {
            const data = await res.json();
            if (data.torrent && data.torrent.file_list && data.torrent.file_list.length > 0) {
              console.log(`[TorrServer Polling Success] File list loaded: ${data.torrent.file_list.length} files`);
              setTorrTorrent(data.torrent);
              const files = data.torrent.file_list;
              if (selectedFileId === null) {
                setSelectedFileId(files[0].id); // Автовыбор первой серии/файла
              }
            }
          }
        } catch (e) {
          console.error("Error polling torrent details:", e);
        }
      };

      pollTorrentDetails();
      intervalId = setInterval(pollTorrentDetails, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeTab, torrTorrent, selectedFileId]);

  // 3. Отправка торрента в TorrServer
  const handleSelectTorrent = async (torrent: TorrentResult) => {
    setAddingTorrent(true);
    try {
      const link = torrent.magnetUrl || torrent.downloadUrl;
      const res = await fetch("/api/torrents/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, title: movieTitle }),
      });

      if (res.ok) {
        const data = await res.json();
        setTorrTorrent(data.torrent);
        setActiveTab("watch"); // Всегда переключаемся во вкладку воспроизведения

        const files = data.torrent.file_list || [];
        if (files.length > 0) {
          setSelectedFileId(files[0].id); // Выбираем первый файл по умолчанию
        }
      } else {
        alert("Не удалось добавить торрент в TorrServer");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddingTorrent(false);
    }
  };

  const playNextEpisode = () => {
    if (!torrTorrent || !torrTorrent.file_list || selectedFileId === null) return;
    const files = torrTorrent.file_list;
    const currentIndex = files.findIndex((f: any) => f.id === selectedFileId);
    if (currentIndex !== -1 && currentIndex < files.length - 1) {
      setSelectedFileId(files[currentIndex + 1].id);
      setIsPlaying(true);
      setShowSkipIntro(false);
      setSkipTimes(null);
      setCancelledSkips([]);
      setSkipOverlay({ show: false, type: null, countdown: 5 });
    } else {
      setIsPlaying(false);
      alert("Вы посмотрели последнюю серию!");
    }
  };

  const handleLoadedMetadata = async (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const duration = video.duration;
    if (!duration || duration <= 0) return;

    if (!torrTorrent || selectedFileId === null) return;
    const selectedFile = torrTorrent.file_list.find((f: any) => f.id === selectedFileId);
    const filename = selectedFile ? selectedFile.path.split("/").pop() : "";

    setLoadingSkipTimes(true);
    setSkipTimes(null);
    setCancelledSkips([]);
    setSkipOverlay({ show: false, type: null, countdown: 5 });

    try {
      const searchParams = new URLSearchParams({
        title: movieTitle,
        filename: filename || "",
        tmdbId: String(movieId),
        mediaType: isTvShow ? "tv" : "movie",
        duration: String(duration),
      });
      if (details?.imdb_id) {
        searchParams.append("imdbId", details.imdb_id);
      }

      const res = await fetch(`/api/skip-times?${searchParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSkipTimes({
          intro: data.intro || null,
          outro: data.outro || null,
        });
      }
    } catch (err) {
      console.error("Failed to load skip times:", err);
    } finally {
      setLoadingSkipTimes(false);
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const currentTime = video.currentTime;
    if (!video.duration) return;

    // 1. Если загружены точные тайминги автопропуска
    if (skipTimes) {
      // Проверка интро
      if (skipTimes.intro) {
        const { start, end } = skipTimes.intro;
        if (currentTime >= start && currentTime < start + 5 && !cancelledSkips.includes("intro")) {
          const countdown = Math.ceil((start + 5) - currentTime);
          setSkipOverlay({ show: true, type: "intro", countdown });
        } else if (currentTime >= start + 5 && !cancelledSkips.includes("intro") && skipOverlay.show && skipOverlay.type === "intro") {
          video.currentTime = end;
          setSkipOverlay({ show: false, type: null, countdown: 5 });
        } else if (skipOverlay.show && skipOverlay.type === "intro" && (currentTime < start || currentTime >= start + 5)) {
          setSkipOverlay({ show: false, type: null, countdown: 5 });
        }
      }

      // Проверка аутро (титры)
      if (skipTimes.outro) {
        const { start } = skipTimes.outro;
        if (currentTime >= start && currentTime < start + 5 && !cancelledSkips.includes("outro")) {
          const countdown = Math.ceil((start + 5) - currentTime);
          setSkipOverlay({ show: true, type: "outro", countdown });
        } else if (currentTime >= start + 5 && !cancelledSkips.includes("outro") && skipOverlay.show && skipOverlay.type === "outro") {
          setSkipOverlay({ show: false, type: null, countdown: 5 });
          playNextEpisode();
        } else if (skipOverlay.show && skipOverlay.type === "outro" && (currentTime < start || currentTime >= start + 5)) {
          setSkipOverlay({ show: false, type: null, countdown: 5 });
        }
      }
    }

    // Резервный ручной пропуск титров, если таймингов нет в базе
    const timeLeft = video.duration - currentTime;
    if (!skipTimes || !skipTimes.outro) {
      if (timeLeft > 5 && timeLeft < 150 && video.duration > 300) {
        setShowSkipIntro(true);
      } else {
        setShowSkipIntro(false);
      }
    } else {
      setShowSkipIntro(false);
    }
  };

  const handleVideoEnded = () => {
    playNextEpisode();
  };

  const getBestTorrent = () => {
    if (!torrents || torrents.length === 0) return null;
    const sorted = [...torrents].sort((a, b) => b.seeders - a.seeders);
    const highQuality = sorted.find(t => (t.quality.includes("1080p") || t.quality.includes("4K") || t.quality.includes("2160p")) && t.seeders > 5);
    return highQuality || sorted[0];
  };

  const getStreamLink = () => {
    if (!torrTorrent || selectedFileId === null) return "";
    return `https://torserv.nas-soft.com/stream/play?hash=${torrTorrent.hash}&id=${selectedFileId}`;
  };

  const getVlcLink = () => {
    const link = getStreamLink();
    if (!link) return "";
    return `vlc://${link.replace("https://", "http://")}`; // VLC на мобилках часто не любит https в кастомной схеме
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#181818] border border-gray-800 rounded-lg shadow-2xl overflow-y-auto no-scrollbar">
        {/* Кнопка Закрыть */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition"
        >
          ✕
        </button>

        {/* Шапка модалки */}
        <div className="relative h-[300px] bg-black">
          {movie.backdrop_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w780${movie.backdrop_path}`}
              alt={movieTitle}
              className="w-full h-full object-cover opacity-50"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-red-900/40 to-black flex items-center justify-center">
              <span className="text-3xl font-bold text-red-600">NETFLIX</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] to-transparent" />
          <div className="absolute bottom-6 left-6 md:left-12 z-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">{movieTitle}</h2>
            <p className="text-sm text-gray-400 mt-1">{movieYear}</p>
          </div>
        </div>

        {/* Навигация по табам */}
        <div className="flex border-b border-gray-800 px-6 md:px-12 bg-[#181818] sticky top-0 z-20">
          <button
            onClick={() => setActiveTab("info")}
            className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
              activeTab === "info" ? "border-red-600 text-white" : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Информация
          </button>
          <button
            onClick={() => setActiveTab("torrents")}
            className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
              activeTab === "torrents" ? "border-red-600 text-white" : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Торренты (Jackett)
          </button>
          {torrTorrent && (
            <button
              onClick={() => setActiveTab("watch")}
              className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                activeTab === "watch" ? "border-red-600 text-white" : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              Воспроизведение
            </button>
          )}
        </div>

        {/* Содержимое табов */}
        <div className="p-6 md:p-12 space-y-6">
          {/* ТАБ 1: ИНФОРМАЦИЯ */}
          {activeTab === "info" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-4">
                <p className="text-gray-300 text-base leading-relaxed">
                  {details?.overview || "Загрузка описания..."}
                </p>

                {details?.genres && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {details.genres.map((genre: any, idx: number) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-800 text-xs text-gray-300 rounded-full"
                      >
                        {genre.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Рекомендуемый торрент (Быстрый запуск в 1 клик) */}
                {(() => {
                  const bestTorrent = getBestTorrent();
                  if (loadingTorrents) {
                    return (
                      <div className="mt-6 p-4 bg-gray-900/20 border border-gray-800/80 rounded-lg flex items-center justify-between">
                        <div className="flex items-center space-x-3 text-sm text-gray-400">
                          <span className="w-4 h-4 border-2 border-t-red-600 border-gray-800 rounded-full animate-spin inline-block mr-1"></span>
                          <span>Поиск лучших торрент-раздач в фоне...</span>
                        </div>
                      </div>
                    );
                  }
                  if (bestTorrent) {
                    return (
                      <div className="mt-6 p-4 bg-red-950/20 border border-red-900/30 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1 overflow-hidden">
                          <span className="text-xxs font-bold uppercase tracking-wider text-red-500 block">Быстрый запуск</span>
                          <h4 className="text-sm font-bold text-white truncate max-w-full sm:max-w-md" title={bestTorrent.title}>
                            {bestTorrent.title}
                          </h4>
                          <div className="flex items-center space-x-3 text-xs text-gray-400">
                            <span className="text-green-500 font-bold">★ {bestTorrent.seeders} сидов</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded text-xxs font-bold">{bestTorrent.quality}</span>
                            <span>•</span>
                            <span>{bestTorrent.sizeHuman}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleSelectTorrent(bestTorrent)}
                          disabled={addingTorrent}
                          className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white text-xs font-extrabold uppercase tracking-wider rounded transition whitespace-nowrap"
                        >
                          {addingTorrent ? "Запуск..." : "Смотреть в 1 клик"}
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="space-y-4 text-sm border-l border-gray-800 pl-0 md:pl-8">
                <div>
                  <span className="text-gray-500">В ролях:</span>
                  <p className="text-gray-300 mt-1">
                    {details?.credits?.cast?.slice(0, 5).map((a: any) => a.name).join(", ") || "Загрузка..."}
                  </p>
                </div>
                {movie.vote_average && (
                  <div>
                    <span className="text-gray-500">Рейтинг TMDB:</span>
                    <p className="text-green-500 font-bold text-base mt-1">
                      ★ {movie.vote_average.toFixed(1)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ТАБ 2: ТОРРЕНТЫ (JACKETT) */}
          {activeTab === "torrents" && (
            <div className="space-y-4">
              {loadingTorrents ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-16 shimmer rounded-md" />
                  ))}
                </div>
              ) : torrents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Раздач не найдено. Настройте индексеры в Jackett.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-xs text-gray-500 uppercase border-b border-gray-800">
                      <tr>
                        <th className="py-3 px-4">Раздача / Название</th>
                        <th className="py-3 px-2 text-center">Размер</th>
                        <th className="py-3 px-2 text-center">Качество</th>
                        <th className="py-3 px-2 text-center text-green-500">Сиды</th>
                        <th className="py-3 px-4 text-center">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {torrents.map((t, idx) => (
                        <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                          <td className="py-3 px-4 max-w-md font-medium text-white truncate" title={t.title}>
                            {t.title}
                            <span className="block text-xs text-gray-500">{t.tracker}</span>
                          </td>
                          <td className="py-3 px-2 text-center whitespace-nowrap">{t.sizeHuman}</td>
                          <td className="py-3 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              t.quality.includes("4K") ? "bg-red-900/50 text-red-300" : "bg-gray-800 text-gray-300"
                            }`}>
                              {t.quality}
                            </span>
                            {t.isHdr && <span className="ml-1 px-1 bg-yellow-600/40 text-yellow-200 rounded text-xxs font-bold">HDR</span>}
                          </td>
                          <td className="py-3 px-2 text-center text-green-500 font-bold">{t.seeders}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleSelectTorrent(t)}
                              disabled={addingTorrent}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white text-xs font-bold rounded transition"
                            >
                              {addingTorrent ? "Запуск..." : "Смотреть"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ТАБ 3: ВОСПРОИЗВЕДЕНИЕ */}
          {activeTab === "watch" && torrTorrent && (
            (!torrTorrent.file_list || torrTorrent.file_list.length === 0) ? (
              <div className="flex flex-col items-center justify-center p-12 bg-black/40 border border-gray-800 rounded-lg space-y-6">
                <div className="w-12 h-12 border-4 border-t-red-600 border-gray-800 rounded-full animate-spin"></div>
                <div className="text-center space-y-2">
                  <span className="text-lg text-white font-semibold">Подключение к раздаче...</span>
                  <p className="text-sm text-gray-400 max-w-md">
                    TorrServer получает метаданные и список файлов торрента. Это может занять некоторое время.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Левая колонка: Видеоплеер */}
                <div className="lg:col-span-2 space-y-4">
                  {selectedFileId !== null && (() => {
                    const selectedFile = torrTorrent.file_list.find((f: any) => f.id === selectedFileId);
                    const currentFileName = selectedFile ? selectedFile.path.split("/").pop() : "";
                    return (
                      <div className="space-y-4">
                        {currentFileName && (
                          <div className="bg-gray-900/40 border border-gray-800/80 px-4 py-2 rounded-md flex justify-between items-center">
                            <span className="text-sm font-semibold text-gray-200 truncate pr-4" title={currentFileName}>
                              🍿 Сейчас играет: <span className="text-white">{currentFileName}</span>
                            </span>
                            {loadingSkipTimes && (
                              <span className="text-xs text-gray-500 flex items-center space-x-1 whitespace-nowrap">
                                <span className="w-2.5 h-2.5 border-2 border-t-red-600 border-gray-800 rounded-full animate-spin inline-block mr-1"></span>
                                Анализ таймингов...
                              </span>
                            )}
                            {!loadingSkipTimes && (skipTimes?.intro || skipTimes?.outro) && (
                              <span className="text-xs text-green-500 font-bold bg-green-950/40 px-2 py-0.5 rounded border border-green-800/30 whitespace-nowrap">
                                ✨ Автопропуск готов
                              </span>
                            )}
                          </div>
                        )}

                        {isPlaying ? (
                          <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden border border-gray-800 group/player">
                            <video
                              ref={videoRef}
                              src={getStreamLink()}
                              controls
                              autoPlay
                              onLoadedMetadata={handleLoadedMetadata}
                              onTimeUpdate={handleTimeUpdate}
                              onEnded={handleVideoEnded}
                              className="w-full h-full"
                              style={{ outline: "none" }}
                            />

                            {/* Интерактивный оверлей автопропуска с таймером отмены */}
                            {skipOverlay.show && (
                              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-6 py-4 bg-black/90 border border-gray-800 rounded-lg shadow-2xl z-40 flex items-center space-x-6 animate-fade-in text-white text-sm whitespace-nowrap">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full border-2 border-red-600 flex items-center justify-center font-bold text-red-500 text-xs">
                                    {skipOverlay.countdown}
                                  </div>
                                  <span className="font-semibold text-gray-100">
                                    {skipOverlay.type === "intro" 
                                      ? "Пропускаем вступительную заставку..." 
                                      : "Переходим к следующей серии..."}
                                  </span>
                                </div>
                                
                                <button
                                  onClick={() => {
                                    if (skipOverlay.type) {
                                      setCancelledSkips(prev => [...prev, skipOverlay.type!]);
                                    }
                                    setSkipOverlay({ show: false, type: null, countdown: 5 });
                                  }}
                                  className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 font-bold rounded transition border border-gray-700 text-xs text-white"
                                >
                                  Отмена
                                </button>
                              </div>
                            )}

                            {/* Кнопка Пропустить титры (резервная ручная) */}
                            {showSkipIntro && (
                              <button
                                onClick={playNextEpisode}
                                className="absolute bottom-16 right-4 px-4 py-2.5 bg-white text-black font-extrabold rounded shadow-2xl hover:bg-red-600 hover:text-white transition duration-300 text-sm z-30 flex items-center space-x-1"
                              >
                                <span>Пропустить титры</span>
                                <span>➔</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-12 bg-black/40 border border-gray-800 rounded-lg space-y-6">
                            <div className="text-center space-y-2">
                              <span className="text-lg text-white font-semibold">Готово к трансляции!</span>
                              <p className="text-sm text-gray-500 max-w-md">
                                Торрент успешно кэшируется в TorrServer. Вы можете смотреть его во встроенном плеере или открыть во внешнем.
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-4 justify-center">
                              {/* Во встроенном плеере */}
                              <button
                                onClick={() => setIsPlaying(true)}
                                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded flex items-center space-x-2 transition"
                              >
                                <span>▶</span>
                                <span>Смотреть здесь</span>
                              </button>

                              {/* Открыть во внешнем плеере */}
                              <a
                                href={getVlcLink()}
                                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded flex items-center space-x-2 border border-gray-700 transition"
                              >
                                <span>🧡</span>
                                <span>Открыть в VLC</span>
                              </a>

                              {/* Скопировать ссылку */}
                              <button
                                onClick={() => {
                                    navigator.clipboard.writeText(getStreamLink());
                                    alert("Ссылка на видеопоток скопирована в буфер обмена!");
                                  }}
                                className="px-4 py-2.5 bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white rounded border border-gray-800 transition text-sm"
                              >
                                Скопировать ссылку
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Правая колонка: Список файлов (серий) */}
                <div className="space-y-4">
                  {torrTorrent.file_list && torrTorrent.file_list.length > 1 && (
                    <div className="space-y-3">
                      <span className="text-sm font-bold text-gray-400 block">Список серий:</span>
                      <div className="max-h-[380px] overflow-y-auto border border-gray-800 rounded bg-black/40 p-2 space-y-1 scrollbar-thin">
                        {torrTorrent.file_list.map((file: any) => (
                          <div
                            key={file.id}
                            onClick={() => {
                              setSelectedFileId(file.id);
                              if (isPlaying) {
                                setShowSkipIntro(false);
                              }
                            }}
                            className={`p-2.5 rounded text-xs cursor-pointer truncate transition duration-200 ${
                              selectedFileId === file.id
                                ? "bg-red-600 text-white font-bold shadow-md"
                                : "text-gray-300 hover:bg-gray-800 hover:text-white"
                            }`}
                            title={file.path.split("/").pop()}
                          >
                            {file.path.split("/").pop()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
