"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { db } from "@/lib/indexedDb";

interface IptvPlayerProps {
  src: string;
  channelName: string;
  onPrevChannel?: () => void;
  onNextChannel?: () => void;
}

export default function IptvPlayer({ src, channelName, onPrevChannel, onNextChannel }: IptvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, setIsPip] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Инициализация Hls.js
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setError(null);
    let hls: Hls | null = null;
    let networkRetryCount = 0;

    // Тайм-аут на загрузку (15 секунд)
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = setTimeout(() => {
      if (video.paused && !video.currentTime) {
        setIsLoading(false);
        setError("Время ожидания загрузки потока истекло. Возможно, трансляция временно недоступна.");
        if (hls) {
          hls.stopLoad();
        }
      }
    }, 15000);

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      // Применяем текущую громкость к видео
      video.volume = isMuted ? 0 : volume;
      video.muted = isMuted;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          // Игнорируем автоплей блокировки браузеров
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              networkRetryCount++;
              console.warn(`EPG/HLS Network error (${networkRetryCount}/3), trying to recover...`, data);
              if (networkRetryCount > 3) {
                setError("Не удалось загрузить видеосегменты. Проверьте сетевое соединение или доступность источника.");
                setIsLoading(false);
                hls?.stopLoad();
                if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
              } else {
                hls?.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("EPG/HLS Media error, trying to recover...", data);
              hls?.recoverMediaError();
              break;
            default:
              console.error("Unrecoverable HLS error", data);
              setError("Ошибка декодирования видеопотока.");
              setIsLoading(false);
              if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Поддержка Safari
      video.src = src;
      video.volume = isMuted ? 0 : volume;
      video.muted = isMuted;
      
      const handleLoadedMetadata = () => {
        video.play().catch(() => {});
      };
      video.addEventListener("loadedmetadata", handleLoadedMetadata);

      const handleSafariError = () => {
        setError("Не удалось воспроизвести поток в вашем браузере.");
        setIsLoading(false);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      };
      video.addEventListener("error", handleSafariError);

      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("error", handleSafariError);
      };
    } else {
      console.error("HLS is not supported in this browser");
      setError("HLS не поддерживается вашим браузером.");
      setIsLoading(false);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    }

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => {
      setIsLoading(false);
      setError(null);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
    const handleCanPlay = () => {
      setIsLoading(false);
      setError(null);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);

    return () => {
      if (hls) {
        hls.destroy();
      }
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [src, volume, isMuted, retryTrigger]);

  // Загрузка сохраненных настроек громкости при монтировании
  useEffect(() => {
    async function loadVolumeSettings() {
      const savedVolume = await db.getSetting<number>("iptv_volume", 1);
      const savedMuted = await db.getSetting<boolean>("iptv_muted", false);
      setVolume(savedVolume);
      setIsMuted(savedMuted);
      
      if (videoRef.current) {
        videoRef.current.volume = savedMuted ? 0 : savedVolume;
        videoRef.current.muted = savedMuted;
      }
    }
    loadVolumeSettings();
  }, []);

  // 2. Скрытие панели управления при бездействии мыши
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  // 3. Управление воспроизведением
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  }, [isPlaying]);

  // 4. Управление громкостью
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const val = parseFloat(e.target.value);
    setVolume(val);
    video.volume = val;
    const newMuted = val === 0;
    setIsMuted(newMuted);

    db.saveSetting("iptv_volume", val);
    db.saveSetting("iptv_muted", newMuted);
  };

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const newMute = !isMuted;
    setIsMuted(newMute);
    video.muted = newMute;

    db.saveSetting("iptv_muted", newMute);
  }, [isMuted]);

  // 5. Управление полноэкранным режимом
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(console.error);
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(console.error);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // 6. Управление Picture-in-Picture
  const togglePip = async () => {
    const video = videoRef.current;
    if (!video || typeof window === "undefined" || !document.pictureInPictureEnabled) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPip(false);
      } else {
        await video.requestPictureInPicture();
        setIsPip(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPip = () => setIsPip(true);
    const handleLeavePip = () => setIsPip(false);

    video.addEventListener("enterpictureinpicture", handleEnterPip);
    video.addEventListener("leavepictureinpicture", handleLeavePip);

    return () => {
      video.removeEventListener("enterpictureinpicture", handleEnterPip);
      video.removeEventListener("leavepictureinpicture", handleLeavePip);
    };
  }, []);

  // 7. Горячие клавиши
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "f" || e.key === "а") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "m" || e.key === "ь") {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleMute]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-white/5 shadow-2xl group select-none"
    >
      {/* Видео элемент */}
      <video
        ref={videoRef}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
      />

      {/* Индикатор загрузки / буферизации */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none transition duration-300">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-4 border-t-violet-500 border-white/10 rounded-full animate-spin shadow-[0_0_15px_rgba(139,92,246,0.3)]" />
            <span className="text-xs font-semibold text-violet-300 tracking-wider uppercase animate-pulse">
              Загрузка эфира...
            </span>
          </div>
        </div>
      )}

      {/* Экран ошибки воспроизведения */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md transition duration-300 z-10">
          <div className="flex flex-col items-center text-center space-y-4 max-w-sm px-6">
            <div className="w-16 h-16 flex items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h4 className="text-sm font-extrabold text-white tracking-wide">
              Поток недоступен
            </h4>
            <p className="text-xxs text-gray-400 leading-relaxed">
              {error}
            </p>
            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => {
                  setError(null);
                  setIsLoading(true);
                  setRetryTrigger(prev => prev + 1);
                }}
                className="px-4 py-2 flex items-center space-x-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-[0_0_15px_rgba(139,92,246,0.4)] transition duration-200"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
                </svg>
                <span>Повторить</span>
              </button>
              {onNextChannel && (
                <button
                  onClick={onNextChannel}
                  className="px-4 py-2 flex items-center space-x-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-xs transition duration-200"
                >
                  <span>Следующий</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Кнопка воспроизведения по центру при паузе */}
      {!isPlaying && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <button
            onClick={togglePlay}
            className="w-20 h-20 flex items-center justify-center rounded-full bg-violet-600/90 text-white shadow-[0_0_30px_rgba(139,92,246,0.5)] transform hover:scale-110 active:scale-95 transition pointer-events-auto duration-300 hover:bg-violet-500"
          >
            <svg className="w-8 h-8 fill-current ml-1" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}

      {/* Верхний статус-бар управления */}
      <div
        className={`absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 flex justify-between items-center ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center space-x-3 truncate">
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded bg-red-600 text-xxs font-black text-white tracking-widest uppercase animate-pulse shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-white inline-block"></span>
            <span>LIVE</span>
          </div>
          <span className="font-extrabold text-white text-sm sm:text-base tracking-wide drop-shadow-md truncate">
            {channelName || "Прямой эфир"}
          </span>
        </div>
      </div>

      {/* Нижняя панель управления */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 flex flex-col space-y-4 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex justify-between items-center">
          {/* Левая группа: Play/Pause, Громкость */}
          <div className="flex items-center space-x-4">
            <button
              onClick={togglePlay}
              className="text-white hover:text-violet-400 transform hover:scale-110 active:scale-90 transition duration-200"
              title={isPlaying ? "Пауза (Space)" : "Воспроизвести (Space)"}
            >
              {isPlaying ? (
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Каналы назад/вперед */}
            <div className="flex items-center space-x-1">
              <button
                onClick={onPrevChannel}
                disabled={!onPrevChannel}
                className="text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transform hover:scale-110 transition duration-200"
                title="Предыдущий канал"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>
              <button
                onClick={onNextChannel}
                disabled={!onNextChannel}
                className="text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transform hover:scale-110 transition duration-200"
                title="Следующий канал"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6zm9-12v12h2V6z" />
                </svg>
              </button>
            </div>

            {/* Звук */}
            <div className="flex items-center space-x-2 group/volume">
              <button
                onClick={toggleMute}
                className="text-white hover:text-violet-400 transform hover:scale-110 active:scale-90 transition duration-200"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? (
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.03c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : volume > 0.5 ? (
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-violet-500 hover:h-1.5 transition-all duration-200"
              />
            </div>
          </div>

          {/* Правая группа: PiP, Fullscreen */}
          <div className="flex items-center space-x-4">
            {/* Picture-in-Picture */}
            {typeof window !== "undefined" && document.pictureInPictureEnabled && (
              <button
                onClick={togglePip}
                className="text-gray-400 hover:text-white transform hover:scale-110 active:scale-90 transition duration-200"
                title="Picture-in-Picture"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
                </svg>
              </button>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-violet-400 transform hover:scale-110 active:scale-90 transition duration-200"
              title={isFullscreen ? "Выйти из полноэкранного (F)" : "На весь экран (F)"}
            >
              {isFullscreen ? (
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
