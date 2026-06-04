"use client";

import React, { useState, useEffect, useRef } from "react";
import { TorrentResult } from "@/lib/jackett";

function parseSeasonNumber(filePath: string): number {
  const parts = filePath.split("/");
  
  // 1. Попробуем извлечь из имен директорий (проверяем все, кроме последнего элемента - имени файла)
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i].toLowerCase().trim();
    
    // Если папка называется просто числом (например, "1", "02")
    if (/^\d+$/.test(part)) {
      return parseInt(part, 10);
    }
    // Если папка содержит "season", "сезон", "s" + число (например, "season 1", "сезон 02", "s01", "s1")
    const seasonMatch = part.match(/(?:season|сезон|s)\s*(\d+)/i);
    if (seasonMatch) {
      return parseInt(seasonMatch[1], 10);
    }
  }

  // 2. Если в папках не нашли, ищем в имени файла (последняя часть)
  const fileName = parts[parts.length - 1];
  
  // Паттерны типа S01E01, s1e1, S01.E01
  const sEpMatch = fileName.match(/s(\d+)\s*e\d+/i);
  if (sEpMatch) {
    return parseInt(sEpMatch[1], 10);
  }
  
  // Паттерны типа 1x01, 01x02
  const xMatch = fileName.match(/(\d+)x\d+/i);
  if (xMatch) {
    return parseInt(xMatch[1], 10);
  }

  // Паттерны типа "сезон 1 серия 1"
  const ruSeasonMatch = fileName.match(/(?:сезон|season)\s*(\d+)/i);
  if (ruSeasonMatch) {
    return parseInt(ruSeasonMatch[1], 10);
  }

  return 1; // По умолчанию 1 сезон
}

function isVideoFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return !!ext && ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "ts", "m4v", "mpeg", "mpg"].includes(ext);
}

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
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);

  // Обёртка для фильтрации не-видео файлов
  const setFilteredTorrTorrent = (torrent: any) => {
    if (torrent && Array.isArray(torrent.file_list)) {
      torrent.file_list = torrent.file_list.filter((f: any) => isVideoFile(f.path));
    }
    setTorrTorrent(torrent);
  };

  // Состояние встроенного плеера
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [transcodeAudio, setTranscodeAudio] = useState(true);

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

  const movieYear = (() => {
    // Если это торрент из TorrServer, игнорируем метаданные даты (так как там может быть дата добавления)
    // и парсим год исключительно из названия раздачи
    if (isTorrTorrent) {
      if (movieTitle) {
        const match = movieTitle.match(/\b(19\d\d|20[0-2]\d)\b/);
        if (match) return parseInt(match[1], 10);
      }
      // Если в названии торрента нет года, попробуем вытащить его из названия первого файла
      if (torrTorrent && torrTorrent.file_list && torrTorrent.file_list.length > 0) {
        const firstFile = torrTorrent.file_list[0].path;
        const match = firstFile.match(/\b(19\d\d|20[0-2]\d)\b/);
        if (match) return parseInt(match[1], 10);
      }
      return null;
    }

    // Для обычных фильмов из TMDB
    if (movie.release_date) {
      return new Date(movie.release_date).getFullYear();
    }
    if (movie.first_air_date) {
      return new Date(movie.first_air_date).getFullYear();
    }
    if (movieTitle) {
      const match = movieTitle.match(/\b(19\d\d|20[0-2]\d)\b/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  })();



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
            setFilteredTorrTorrent(data.torrent);
            const files = data.torrent.file_list ? data.torrent.file_list.filter((f: any) => isVideoFile(f.path)) : [];
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

  // 2.2. Автоматический опрос TorrServer для получения статуса и списка файлов в реальном времени
  useEffect(() => {
    if (activeTab !== "watch" || !torrTorrent?.hash) return;

    let intervalId: NodeJS.Timeout | undefined;

    const pollTorrentDetails = async () => {
      try {
        const res = await fetch(`/api/torrents/get?hash=${torrTorrent.hash}`);
        if (res.ok) {
          const data = await res.json();
          if (data.torrent) {
            setFilteredTorrTorrent(data.torrent);
            
            // Если файлы загрузились впервые и никакой файл не выбран, выберем первый и запустим плеер
            if (data.torrent.file_list && data.torrent.file_list.length > 0) {
              const files = data.torrent.file_list.filter((f: any) => isVideoFile(f.path));
              if (files.length > 0) {
                setSelectedFileId(prev => {
                  if (prev === null) {
                    setIsPlaying(true); // Автостарт встроенного плеера при автовыборе файла
                    return files[0].id;
                  }
                  return prev;
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Error polling torrent details:", e);
      }
    };

    pollTorrentDetails();
    intervalId = setInterval(pollTorrentDetails, 3000); // Опрашиваем раз в 3 секунды для живого статуса скорости и пиров

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeTab, torrTorrent?.hash]);

  // Эффект принудительного воспроизведения при монтировании/изменении видеоплеера
  useEffect(() => {
    if (isPlaying && videoRef.current) {
      const playVideo = async () => {
        try {
          await videoRef.current?.play();
        } catch (err) {
          console.log("Autoplay was prevented by browser, waiting for user interaction:", err);
        }
      };
      playVideo();
    }
  }, [isPlaying, selectedFileId, torrTorrent?.hash]);


  // Автоматическая синхронизация выбранного сезона при смене активного файла
  useEffect(() => {
    if (torrTorrent && torrTorrent.file_list && selectedFileId !== null) {
      const activeFile = torrTorrent.file_list.find((f: any) => f.id === selectedFileId);
      if (activeFile) {
        const season = parseSeasonNumber(activeFile.path);
        setCurrentSeason(season);
      }
    }
  }, [selectedFileId, torrTorrent]);

  // Группировка файлов по сезонам
  const groupedFiles = React.useMemo(() => {
    if (!torrTorrent || !torrTorrent.file_list) return {};
    const groups: { [key: number]: any[] } = {};
    torrTorrent.file_list.forEach((file: any) => {
      const season = parseSeasonNumber(file.path);
      if (!groups[season]) {
        groups[season] = [];
      }
      groups[season].push(file);
    });
    return groups;
  }, [torrTorrent]);

  const uniqueSeasons = React.useMemo(() => {
    return Object.keys(groupedFiles)
      .map(Number)
      .sort((a, b) => a - b);
  }, [groupedFiles]);

  // 3. Отправка торрента в TorrServer
  const handleSelectTorrent = async (torrent: TorrentResult) => {
    setAddingTorrent(true);
    try {
      const link = torrent.magnetUrl || torrent.downloadUrl;
      const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "";
      const res = await fetch("/api/torrents/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, title: movieTitle, poster: posterUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        setFilteredTorrTorrent(data.torrent);
        setActiveTab("watch"); // Всегда переключаемся во вкладку воспроизведения

        const files = data.torrent.file_list ? data.torrent.file_list.filter((f: any) => isVideoFile(f.path)) : [];
        if (files.length > 0) {
          setSelectedFileId(files[0].id); // Выбираем первый файл по умолчанию
          setIsPlaying(true); // Автостарт встроенного плеера
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

  const playNextEpisodeFromEffect = () => {
    // Вспомогательная функция без alert, чтобы не блокировать UI в асинхронных хэндлерах
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
    const file = torrTorrent.file_list?.find((f: any) => f.id === selectedFileId);
    const filename = file ? file.path.split("/").pop() : "video.mkv";
    return `https://torserv.nas-soft.com/stream/${encodeURIComponent(filename || "video.mkv")}?link=${torrTorrent.hash}&index=${selectedFileId}&play`;
  };

  const getVlcLink = () => {
    const link = getStreamLink();
    if (!link) return "";
    return `vlc://${link.replace("https://", "http://")}`; // VLC на мобилках часто не любит https в кастомной схеме
  };

  const getVideoSrc = () => {
    if (!torrTorrent || selectedFileId === null) return "";
    if (hasUnsupportedAudio() && transcodeAudio) {
      return `/api/stream/transcode?link=${torrTorrent.hash}&index=${selectedFileId}`;
    }
    return getStreamLink();
  };

  const formatSpeed = (bytesPerSec: number | undefined) => {
    if (!bytesPerSec || bytesPerSec <= 0) return "0 КБ/с";
    const kbs = bytesPerSec / 1024;
    if (kbs < 1024) return `${kbs.toFixed(1)} КБ/с`;
    const mbs = kbs / 1024;
    return `${mbs.toFixed(1)} МБ/с`;
  };


  const hasUnsupportedAudio = () => {
    if (!torrTorrent) return false;
    let filename = "";
    if (selectedFileId !== null && torrTorrent.file_list) {
      const file = torrTorrent.file_list.find((f: any) => f.id === selectedFileId);
      if (file) filename = file.path.split("/").pop() || "";
    }
    const title = (torrTorrent.title || "").toLowerCase();
    const fileLower = filename.toLowerCase();
    const audioKeywords = ["eac3", "ddp5", "ddp7", "dd+5", "ddp.5", "dts", "ac3", "truehd", "dolby digital"];
    return audioKeywords.some(kw => title.includes(kw) || fileLower.includes(kw));
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-[#0b0c15]/90 border border-violet-500/20 rounded-xl shadow-[0_0_50px_rgba(168,85,247,0.15)] overflow-y-auto no-scrollbar font-sans text-white">
        {/* Кнопка Закрыть */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/40 text-gray-400 rounded-full flex items-center justify-center hover:bg-violet-600/80 hover:text-white transition duration-300 border border-white/5"
        >
          ✕
        </button>

        {/* Шапка модалки */}
        {activeTab !== "watch" ? (
          <div className="relative h-[300px] bg-black">
            {movie.backdrop_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w780${movie.backdrop_path}`}
                alt={movieTitle}
                className="w-full h-full object-cover opacity-60"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#6366f1]/20 via-[#a855f7]/10 to-black flex items-center justify-center">
                <span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-500 to-pink-500 tracking-wider">SINFLEX</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c15] to-transparent" />
            <div className="absolute bottom-6 left-6 md:left-12 z-10">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">{movieTitle}</h2>
              {movieYear && <p className="text-sm text-violet-400 font-medium mt-1">{movieYear}</p>}
            </div>
          </div>
        ) : (
          <div className="relative p-6 border-b border-white/5 bg-[#0b0c15] flex justify-between items-center pr-16">
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">{movieTitle}</h2>
              {movieYear && <span className="text-xs text-violet-400 font-medium mt-0.5 inline-block">{movieYear}</span>}
            </div>
          </div>
        )}


        {/* Навигация по табам */}
        <div className="flex border-b border-white/5 px-6 md:px-12 bg-[#0b0c15]/95 sticky top-0 z-20 backdrop-blur-md">
          <button
            onClick={() => setActiveTab("info")}
            className={`px-6 py-4 font-bold text-sm tracking-wide transition-all border-b-2 ${
              activeTab === "info" 
                ? "border-violet-500 text-white drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" 
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Информация
          </button>
          <button
            onClick={() => setActiveTab("torrents")}
            className={`px-6 py-4 font-bold text-sm tracking-wide transition-all border-b-2 ${
              activeTab === "torrents" 
                ? "border-violet-500 text-white drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" 
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Торренты (Jackett)
          </button>
          {torrTorrent && (
            <button
              onClick={() => setActiveTab("watch")}
              className={`px-6 py-4 font-bold text-sm tracking-wide transition-all border-b-2 ${
                activeTab === "watch" 
                  ? "border-violet-500 text-white drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" 
                  : "border-transparent text-gray-400 hover:text-white"
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
                        className="px-3 py-1 bg-white/5 border border-white/10 text-xs text-gray-300 rounded-full"
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
                      <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                        <div className="flex items-center space-x-3 text-sm text-gray-400">
                          <span className="w-4 h-4 border-2 border-t-violet-500 border-white/10 rounded-full animate-spin inline-block mr-1"></span>
                          <span>Поиск лучших торрент-раздач в фоне...</span>
                        </div>
                      </div>
                    );
                  }
                  if (bestTorrent) {
                    return (
                      <div className="mt-6 p-4 bg-violet-950/10 border border-violet-500/20 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 backdrop-blur-md">
                        <div className="space-y-1 overflow-hidden">
                          <span className="text-xxs font-bold uppercase tracking-wider text-violet-400 block drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]">Быстрый запуск</span>
                          <h4 className="text-sm font-bold text-white truncate max-w-full sm:max-w-md" title={bestTorrent.title}>
                            {bestTorrent.title}
                          </h4>
                          <div className="flex items-center space-x-3 text-xs text-gray-400">
                            <span className="text-green-400 font-bold">★ {bestTorrent.seeders} сидов</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 bg-white/5 text-gray-300 rounded text-xxs font-bold border border-white/10">{bestTorrent.quality}</span>
                            <span>•</span>
                            <span>{bestTorrent.sizeHuman}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleSelectTorrent(bestTorrent)}
                          disabled={addingTorrent}
                          className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-gray-700 disabled:to-gray-800 text-white text-xs font-extrabold uppercase tracking-wider rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.4)] transition duration-300 whitespace-nowrap"
                        >
                          {addingTorrent ? "Запуск..." : "Смотреть в 1 клик"}
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="space-y-4 text-sm border-l border-white/5 pl-0 md:pl-8">
                <div>
                  <span className="text-gray-500">В ролях:</span>
                  <p className="text-gray-300 mt-1 font-medium">
                    {details?.credits?.cast?.slice(0, 5).map((a: any) => a.name).join(", ") || "Загрузка..."}
                  </p>
                </div>
                {movie.vote_average && (
                  <div>
                    <span className="text-gray-500">Рейтинг TMDB:</span>
                    <p className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400 font-bold text-base mt-1">
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
                    <div key={n} className="h-16 bg-white/5 border border-white/5 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : torrents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Раздач не найдено. Настройте индексеры в Jackett.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-white/5">
                  <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-white/5 border-b border-white/5">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Раздача / Название</th>
                        <th className="py-3 px-2 text-center font-semibold">Размер</th>
                        <th className="py-3 px-2 text-center font-semibold">Качество</th>
                        <th className="py-3 px-2 text-center text-green-400 font-semibold">Сиды</th>
                        <th className="py-3 px-4 text-center font-semibold">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {torrents.map((t, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 max-w-md font-medium text-white truncate" title={t.title}>
                            {t.title}
                            <span className="block text-xs text-violet-400/70 mt-0.5">{t.tracker}</span>
                          </td>
                          <td className="py-3 px-2 text-center whitespace-nowrap">{t.sizeHuman}</td>
                          <td className="py-3 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              t.quality.includes("4K") 
                                ? "bg-fuchsia-950/40 text-fuchsia-300 border border-fuchsia-800/30" 
                                : "bg-white/5 text-gray-300 border border-white/10"
                            }`}>
                              {t.quality}
                            </span>
                            {t.isHdr && <span className="ml-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xxs font-bold">HDR</span>}
                          </td>
                          <td className="py-3 px-2 text-center text-green-400 font-bold">{t.seeders}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleSelectTorrent(t)}
                              disabled={addingTorrent}
                              className="px-4 py-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-gray-700 disabled:to-gray-800 text-white text-xs font-bold rounded-lg shadow-[0_0_10px_rgba(168,85,247,0.3)] transition duration-300"
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
              <div className="flex flex-col items-center justify-center p-12 bg-white/5 border border-white/10 rounded-xl space-y-6">
                <div className="w-12 h-12 border-4 border-t-violet-500 border-white/10 rounded-full animate-spin"></div>
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
                          <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-lg flex justify-between items-center">
                            <span className="text-sm font-semibold text-gray-200 truncate pr-4" title={currentFileName}>
                              🍿 Сейчас играет: <span className="text-white font-bold">{currentFileName}</span>
                            </span>
                            {loadingSkipTimes && (
                              <span className="text-xs text-gray-400 flex items-center space-x-1 whitespace-nowrap">
                                <span className="w-2.5 h-2.5 border-2 border-t-violet-500 border-white/10 rounded-full animate-spin inline-block mr-1"></span>
                                Анализ таймингов...
                              </span>
                            )}
                            {!loadingSkipTimes && (skipTimes?.intro || skipTimes?.outro) && (
                              <span className="text-xs text-violet-400 font-bold bg-violet-950/40 px-2.5 py-1 rounded border border-violet-800/30 whitespace-nowrap drop-shadow-[0_0_5px_rgba(168,85,247,0.3)]">
                                ✨ Автопропуск готов
                              </span>
                            )}
                          </div>
                        )}

                        {isPlaying ? (
                          <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-white/5 shadow-2xl group/player">
                            <video
                              ref={videoRef}
                              src={getVideoSrc()}
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
                              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-6 py-4 bg-black/95 border border-violet-500/20 rounded-xl shadow-2xl z-40 flex items-center space-x-6 animate-fade-in text-white text-sm whitespace-nowrap">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full border-2 border-violet-500 flex items-center justify-center font-bold text-violet-400 text-xs shadow-[0_0_10px_rgba(168,85,247,0.4)]">
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
                                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 font-bold rounded-lg transition duration-200 border border-white/10 text-xs text-white"
                                >
                                  Отмена
                                </button>
                              </div>
                            )}

                            {/* Кнопка Пропустить титры (резервная ручная) */}
                            {showSkipIntro && (
                              <button
                                onClick={playNextEpisode}
                                className="absolute bottom-16 right-4 px-4 py-2.5 bg-white text-black font-extrabold rounded-lg shadow-2xl hover:bg-violet-600 hover:text-white transition duration-300 text-sm z-30 flex items-center space-x-1"
                              >
                                <span>Пропустить титры</span>
                                <span>➔</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-12 bg-white/5 border border-white/10 rounded-xl space-y-6">
                            <div className="text-center space-y-2">
                              <span className="text-lg text-white font-semibold">Готово к трансляции!</span>
                              <p className="text-sm text-gray-400 max-w-md">
                                Торрент успешно кэшируется в TorrServer. Вы можете запустить его во встроенном плеере или открыть во внешнем.
                              </p>
                            </div>

                            <div className="flex justify-center">
                              {/* Во встроенном плеере */}
                              <button
                                onClick={() => setIsPlaying(true)}
                                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-lg flex items-center space-x-2 transition duration-300 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                              >
                                <span>▶</span>
                                <span>Смотреть во встроенном плеере</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Панель управления внешним плеером и ссылками — доступна ВСЕГДА */}
                        <div className="flex flex-wrap gap-4 justify-center bg-[#0b0c15]/60 border border-white/5 p-4 rounded-xl">
                          <a
                            href={getVlcLink()}
                            className="px-6 py-2.5 bg-gradient-to-r from-[#f26522] to-amber-600 hover:from-[#d85215] hover:to-amber-500 text-white font-bold rounded-lg flex items-center space-x-2 transition duration-300 shadow-[0_0_15px_rgba(242,101,34,0.3)] text-xs"
                          >
                            <span>🧡</span>
                            <span>Открыть в VLC</span>
                          </a>

                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(getStreamLink());
                              alert("Ссылка на поток скопирована!");
                            }}
                            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg flex items-center space-x-2 border border-white/10 transition duration-300 text-xs"
                          >
                            <span>📋</span>
                            <span>Скопировать ссылку на поток</span>
                          </button>

                          {isPlaying && (
                            <button
                              onClick={() => setIsPlaying(false)}
                              className="px-6 py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/30 text-red-400 hover:text-red-300 font-bold rounded-lg transition duration-300 text-xs"
                            >
                              Остановить плеер
                            </button>
                          )}
                        </div>

                        {/* Панель живой обратной связи (прогресс буферизации, скорость, пиры) */}
                        {torrTorrent && (
                          <div className="bg-[#0b0c15]/60 border border-white/5 p-4 rounded-xl space-y-3 shadow-[0_0_15px_rgba(168,85,247,0.05)] animate-fade-in text-white">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-400 font-medium flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-ping mr-1 inline-block" />
                                <span>Обратная связь с TorrServer:</span>
                              </span>
                              <span className="font-extrabold text-violet-400 uppercase tracking-wider text-xxs bg-violet-950/40 px-2 py-0.5 rounded border border-violet-800/30">
                                {torrTorrent.stat_string || "Подключение..."}
                                {torrTorrent.stat === 4 && torrTorrent.size > 0 && ` (${Math.round(((torrTorrent.loaded_size || 0) / torrTorrent.size) * 100)}%)`}
                              </span>
                            </div>

                            {/* Прогресс-бар буферизации/скачивания */}
                            {torrTorrent.size > 0 && (
                              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 h-1.5 transition-all duration-500"
                                  style={{ width: `${Math.min(100, Math.round(((torrTorrent.loaded_size || 0) / torrTorrent.size) * 100))}%` }}
                                />
                              </div>
                            )}

                            <div className="flex justify-between items-center text-xxs text-gray-400">
                              <span>Скорость: <strong className="text-green-400 font-bold">{formatSpeed(torrTorrent.download_speed)}</strong></span>
                              <span>Активные пиры: <strong className="text-violet-300 font-bold">{torrTorrent.active_peers || 0} / {torrTorrent.total_peers || 0}</strong></span>
                            </div>
                          </div>
                        )}

                        {/* Предупреждение об аудиодорожке */}
                        {hasUnsupportedAudio() && (
                          <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-3.5 rounded-xl text-xs text-amber-300 flex flex-col space-y-3 shadow-[0_0_15px_rgba(245,158,11,0.05)] animate-fade-in">
                            <div className="flex items-center space-x-3">
                              <span className="text-lg">⚠️</span>
                              <span>
                                <strong>Внимание:</strong> Этот торрент содержит аудиодорожку (EAC3/DDP/DTS/Dolby), которая <strong>не поддерживается браузерами нативно</strong>.
                              </span>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-2.5 border-t border-amber-500/15 gap-2">
                              <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={transcodeAudio}
                                  onChange={(e) => setTranscodeAudio(e.target.checked)}
                                  className="rounded border-amber-500/30 text-amber-500 focus:ring-amber-500/50 bg-black/40 w-4 h-4 cursor-pointer"
                                />
                                <span className="font-semibold text-gray-200 hover:text-white transition duration-200">
                                  🔧 Транскодировать звук на сервере (на лету)
                                </span>
                              </label>
                              
                              {transcodeAudio && (
                                <span className="text-xxs text-amber-400/80 italic sm:text-right">
                                  *Перемотка во встроенном плеере будет отключена
                                </span>
                              )}
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

                      {/* Табы сезонов в стиле Netflix (если сезонов больше одного) */}
                      {uniqueSeasons.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 pb-2 border-b border-white/5 max-h-[120px] overflow-y-auto no-scrollbar">
                          {uniqueSeasons.map((seasonNum) => (
                            <button
                              key={seasonNum}
                              onClick={() => setCurrentSeason(seasonNum)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition duration-200 ${
                                currentSeason === seasonNum
                                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                                  : "bg-[#181926] text-gray-400 hover:text-white hover:bg-white/5 border border-white/5"
                              }`}
                            >
                              Сезон {seasonNum}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="max-h-[340px] overflow-y-auto border border-white/5 rounded-lg bg-black/40 p-2 space-y-1 scrollbar-thin">
                        {((uniqueSeasons.length > 1 && currentSeason !== null
                          ? groupedFiles[currentSeason]
                          : torrTorrent.file_list) || []).map((file: any) => (
                          <div
                            key={file.id}
                            onClick={() => {
                              setSelectedFileId(file.id);
                              if (isPlaying) {
                                setShowSkipIntro(false);
                              }
                            }}
                            className={`p-2.5 rounded-lg text-xs cursor-pointer truncate transition duration-200 ${
                              selectedFileId === file.id
                                ? "bg-gradient-to-r from-violet-600/90 to-fuchsia-600/90 text-white font-bold shadow-[0_0_10px_rgba(168,85,247,0.3)] border border-violet-500/20"
                                : "text-gray-300 hover:bg-white/5 hover:text-white border border-transparent"
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
