"use client";

import React, { useState, useEffect } from "react";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import MovieRow from "@/components/MovieRow";
import MovieModal from "@/components/MovieModal";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Списки фильмов
  const [trending, setTrending] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [plexMovies, setPlexMovies] = useState<any[]>([]);
  const [plexLibraries, setPlexLibraries] = useState<any[]>([]);

  // Поиск
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Модалка
  const [selectedMovie, setSelectedMovie] = useState<any | null>(null);

  // Авторизация Plex (PIN)
  const [plexAuthUrl, setPlexAuthUrl] = useState<string | null>(null);
  const [plexPinId, setPlexPinId] = useState<number | null>(null);
  const [pollingAuth, setPollingAuth] = useState(false);

  // 1. Проверяем текущую сессию при загрузке
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setIsAuthenticated(data.authenticated);
          setUser(data.user);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  // 2. Инициализируем вход через Plex (получаем PIN и URL)
  const handlePlexLogin = async () => {
    try {
      const res = await fetch("/api/auth/plex/url", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPlexAuthUrl(data.authUrl);
        setPlexPinId(data.pinId);
        
        // Открываем окно Plex авторизации
        window.open(data.authUrl, "Plex Login", "width=600,height=700");
        setPollingAuth(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 3. Опрашиваем Plex API о статусе PIN-кода
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (pollingAuth && plexPinId) {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch("/api/auth/plex/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pinId: plexPinId }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.authorized) {
              clearInterval(intervalId);
              setPollingAuth(false);
              
              // Обновляем статус входа
              const meRes = await fetch("/api/auth/me");
              if (meRes.ok) {
                const meData = await meRes.json();
                setIsAuthenticated(meData.authenticated);
                setUser(meData.user);
              }
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollingAuth, plexPinId]);

  // 4. Загрузка контента после авторизации
  useEffect(() => {
    if (isAuthenticated) {
      // Загрузка TMDB разделов
      fetch("/api/movies/trending")
        .then((res) => res.json())
        .then((data) => {
          setTrending(data.trending || []);
          setPopular(data.popular || []);
          setTopRated(data.topRated || []);
        })
        .catch(console.error);

      // Загрузка Continue Watching из Plex
      fetch("/api/plex/continue")
        .then((res) => res.json())
        .then((data) => setContinueWatching(data.items || []))
        .catch(console.error);

      // Загрузка библиотек Plex
      fetch("/api/plex/library")
        .then((res) => res.json())
        .then((data) => {
          setPlexLibraries(data.sections || []);
          // Если есть библиотеки, загрузим первую (обычно Фильмы)
          if (data.sections && data.sections.length > 0) {
            const movieSection = data.sections.find((s: any) => s.type === "movie") || data.sections[0];
            fetch(`/api/plex/library?sectionId=${movieSection.key}`)
              .then((res) => res.json())
              .then((libData) => setPlexMovies(libData.items || []))
              .catch(console.error);
          }
        })
        .catch(console.error);
    }
  }, [isAuthenticated]);

  // 5. Логика живого поиска
  useEffect(() => {
    const delayDebounceId = setTimeout(async () => {
      if (searchQuery.trim().length > 2) {
        setSearching(true);
        try {
          const res = await fetch(`/api/movies/search?query=${encodeURIComponent(searchQuery)}`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data.results || []);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceId);
  }, [searchQuery]);

  const handleLogout = async () => {
    await fetch("/api/auth/me", { method: "DELETE" });
    setIsAuthenticated(false);
    setUser(null);
  };

  // Экран загрузки
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#141414]">
        <div className="text-center space-y-4">
          <span className="text-4xl font-extrabold text-red-600 animate-pulse tracking-wider">
            NETFLIX
          </span>
          <div className="flex justify-center">
            <div className="w-8 h-8 border-4 border-t-red-600 border-gray-800 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  // Экран входа (если не авторизован в Plex)
  if (!isAuthenticated) {
    return (
      <div 
        className="relative flex h-screen w-screen flex-col items-center justify-center bg-black bg-cover bg-center"
        style={{ 
          backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.85) 100%), url('https://images.unsplash.com/photo-1574267431629-2e570984a13d?q=80&w=1920&auto=format&fit=crop')` 
        }}
      >
        <div className="absolute top-8 left-8">
          <h1 className="text-3xl font-extrabold tracking-wider text-red-600 select-none">
            NETFLIX
          </h1>
        </div>

        <div className="z-10 flex flex-col items-center justify-center max-w-md w-full px-8 py-12 bg-black/75 rounded-lg border border-gray-800 shadow-2xl space-y-8 backdrop-blur-sm">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-white">Вход в Кинотеатр</h2>
            <p className="text-sm text-gray-400">
              Авторизуйтесь через Plex для синхронизации вашей локальной медиатеки и прогресса.
            </p>
          </div>

          <button
            onClick={handlePlexLogin}
            disabled={pollingAuth}
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded shadow-lg transition duration-300 disabled:bg-gray-800 disabled:text-gray-500"
          >
            {pollingAuth ? "Ожидание авторизации..." : "Войти через Plex"}
          </button>

          {pollingAuth && (
            <div className="text-center space-y-2 animate-pulse">
              <p className="text-xs text-gray-500">
                Откроется окно входа в Plex. После успешного входа вы будете перенаправлены на сайт.
              </p>
              <div className="flex justify-center">
                <div className="w-5 h-5 border-2 border-t-red-600 border-gray-800 rounded-full animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Главная страница Netflix Clone
  return (
    <div className="relative pb-24 bg-[#141414] min-h-screen">
      <Header
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onLogout={handleLogout}
      />

      {/* Если в поиске что-то введено, показываем сетку результатов */}
      {searchQuery.trim().length > 2 ? (
        <div className="pt-28 px-6 md:px-12 space-y-6">
          <h2 className="text-2xl font-bold text-white">
            Результаты поиска по «{searchQuery}»
          </h2>
          
          {searching ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="aspect-[2/3] shimmer rounded-md" />
              ))}
            </div>
          ) : searchResults.length === 0 ? (
            <p className="text-gray-500 text-sm">Ничего не найдено.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {searchResults.map((movie) => (
                <div
                  key={movie.id}
                  onClick={() => setSelectedMovie(movie)}
                  className="aspect-[2/3] relative rounded-md overflow-hidden cursor-pointer group transform hover:scale-105 transition duration-300 shadow-md bg-[#1f1f1f]"
                >
                  <img
                    src={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=300&auto=format&fit=crop"}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col justify-end p-3">
                    <p className="font-bold text-xs sm:text-sm text-white truncate">{movie.title}</p>
                    <p className="text-xxs text-gray-400 mt-0.5">
                      {movie.release_date ? new Date(movie.release_date).getFullYear() : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Стандартная главная страница */
        <div className="space-y-12">
          {/* Случайный фильм недели на HeroBanner */}
          <HeroBanner
            movie={trending[Math.floor(Math.random() * Math.min(trending.length, 5))] || null}
            onMovieClick={setSelectedMovie}
          />

          <div className="space-y-10 -mt-20 relative z-20">
            {/* 1. Продолжить просмотр (Plex) */}
            <MovieRow
              title="Продолжить просмотр"
              movies={continueWatching}
              onMovieClick={setSelectedMovie}
              plexAuthToken={user?.authToken}
              plexServerUrl={user?.plexServerUrl || "https://plex.nas-soft.com"}
            />

            {/* 2. Моя медиатека (Plex) */}
            <MovieRow
              title="Из вашей медиатеки Plex"
              movies={plexMovies}
              onMovieClick={setSelectedMovie}
              plexAuthToken={user?.authToken}
              plexServerUrl={user?.plexServerUrl || "https://plex.nas-soft.com"}
            />

            {/* 3. Тренды (TMDB) */}
            <MovieRow
              title="В тренде этой недели"
              movies={trending}
              onMovieClick={setSelectedMovie}
            />

            {/* 4. Популярное (TMDB) */}
            <MovieRow
              title="Популярно сейчас"
              movies={popular}
              onMovieClick={setSelectedMovie}
            />

            {/* 5. Топ рейтинга (TMDB) */}
            <MovieRow
              title="Шедевры мирового кино"
              movies={topRated}
              onMovieClick={setSelectedMovie}
            />
          </div>
        </div>
      )}

      {/* Модальное детальное окно */}
      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          plexAuthToken={user?.authToken}
          plexServerUrl={user?.plexServerUrl || "https://plex.nas-soft.com"}
        />
      )}
    </div>
  );
}
