"use client";

import React, { useState, useEffect } from "react";
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

  const movieId = movie.id || movie.hash;
  const isTorrTorrent = !!movie.hash;

  const movieTitle = movie.title || movie.name || movie.original_title || "Без названия";
  const movieYear = movie.release_date || movie.first_air_date || movie.timestamp
    ? new Date(movie.release_date || movie.first_air_date || (movie.timestamp ? movie.timestamp * 1000 : 0)).getFullYear()
    : null;

  // 1. Загрузка подробной информации о фильме
  useEffect(() => {
    async function loadDetails() {
      setLoadingDetails(true);
      try {
        if (!isTorrTorrent) {
          const res = await fetch(`/api/movies/${movieId}`);
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
  }, [movieId, isTorrTorrent]);

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

  // 2. Поиск торрентов через Jackett при переходе на вкладку
  useEffect(() => {
    if (activeTab === "torrents" && torrents.length === 0) {
      async function loadTorrents() {
        setLoadingTorrents(true);
        try {
          const searchQuery = movieYear ? `${movieTitle} ${movieYear}` : movieTitle;
          const res = await fetch(`/api/torrents/search?query=${encodeURIComponent(searchQuery)}`);
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
  }, [activeTab, movieTitle, movieYear]);

  // 3. Отправка торрента в TorrServer
  const handleSelectTorrent = async (torrent: TorrentResult) => {
    setAddingTorrent(true);
    try {
      const link = torrent.magnetUrl || torrent.downloadUrl;
      const res = await fetch("/api/torrents/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link }),
      });

      if (res.ok) {
        const data = await res.json();
        setTorrTorrent(data.torrent);
        
        // Если файлов несколько (сериал или диск), даем выбрать.
        // Если один файл - автоматически выбираем его.
        const files = data.torrent.file_list || [];
        if (files.length === 1) {
          setSelectedFileId(files[0].id);
          setActiveTab("watch");
        } else if (files.length > 1) {
          // Сортируем файлы по размеру или имени
          setActiveTab("watch");
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
            <div className="space-y-6">
              {/* Список файлов, если их больше одного */}
              {torrTorrent.file_list && torrTorrent.file_list.length > 1 && (
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-gray-400">Выберите файл (серию):</span>
                  <div className="max-h-[150px] overflow-y-auto border border-gray-800 rounded bg-black/40 p-2 space-y-1">
                    {torrTorrent.file_list.map((file: any) => (
                      <div
                        key={file.id}
                        onClick={() => {
                          setSelectedFileId(file.id);
                          setIsPlaying(false);
                        }}
                        className={`p-2 rounded text-xs cursor-pointer truncate transition ${
                          selectedFileId === file.id
                            ? "bg-red-600 text-white font-bold"
                            : "text-gray-300 hover:bg-gray-800"
                        }`}
                      >
                        {file.path.split("/").pop()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Интерфейс воспроизведения */}
              {selectedFileId !== null && (
                <div className="space-y-4">
                  {isPlaying ? (
                    <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden border border-gray-800">
                      <video
                        src={getStreamLink()}
                        controls
                        autoPlay
                        className="w-full h-full"
                        style={{ outline: "none" }}
                      />
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
