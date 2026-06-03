"use client";

import React, { useState, useEffect } from "react";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import MovieRow from "@/components/MovieRow";
import MovieModal from "@/components/MovieModal";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Списки фильмов
  const [trending, setTrending] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [torrserverMovies, setTorrserverMovies] = useState<any[]>([]);

  // Поиск
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Модалка
  const [selectedMovie, setSelectedMovie] = useState<any | null>(null);

  // 1. Загрузка сессии и фильмов при монтировании
  useEffect(() => {
    async function loadData() {
      try {
        // Загрузка пользователя (всегда Администратор)
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          setUser(meData.user);
        }

        // Загрузка TMDB разделов
        const tmdbRes = await fetch("/api/movies/trending");
        if (tmdbRes.ok) {
          const tmdbData = await tmdbRes.json();
          setTrending(tmdbData.trending || []);
          setPopular(tmdbData.popular || []);
          setTopRated(tmdbData.topRated || []);
        }

        // Загрузка торрентов из TorrServer
        const torrRes = await fetch("/api/torrents/list");
        if (torrRes.ok) {
          const torrData = await torrRes.json();
          const items = torrData.items || [];
          // Сортируем по дате добавления (timestamp) по убыванию
          const sorted = [...items].sort((a: any, b: any) => b.timestamp - a.timestamp);
          setContinueWatching(sorted.slice(0, 5)); // Последние 5 запущенных
          setTorrserverMovies(sorted);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 2. Логика живого поиска
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

  const handleLogout = () => {
    // В локальной версии без авторизации кнопка выхода отсутствует
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
            {/* 1. Недавно запущенные (Последние добавленные торренты) */}
            {continueWatching.length > 0 && (
              <MovieRow
                title="Недавно запущенные торренты"
                movies={continueWatching}
                onMovieClick={setSelectedMovie}
              />
            )}

            {/* 2. Моя медиатека (Все торренты TorrServer) */}
            {torrserverMovies.length > 0 && (
              <MovieRow
                title="Медиатека TorrServer"
                movies={torrserverMovies}
                onMovieClick={setSelectedMovie}
              />
            )}

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
        />
      )}
    </div>
  );
}
