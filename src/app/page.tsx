/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import Header, { User } from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import MovieRow, { MovieItem } from "@/components/MovieRow";
import MovieModal from "@/components/MovieModal";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  // Списки фильмов
  const [trending, setTrending] = useState<MovieItem[]>([]);
  const [popular, setPopular] = useState<MovieItem[]>([]);
  const [topRated, setTopRated] = useState<MovieItem[]>([]);
  const [continueWatching, setContinueWatching] = useState<MovieItem[]>([]);
  const [torrserverMovies, setTorrserverMovies] = useState<MovieItem[]>([]);
  const [heroMovie, setHeroMovie] = useState<MovieItem | null>(null);

  // Поиск
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MovieItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Модалка
  const [selectedMovie, setSelectedMovie] = useState<MovieItem | null>(null);

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
          const trendList: MovieItem[] = tmdbData.trending || [];
          setTrending(trendList);
          setPopular(tmdbData.popular || []);
          setTopRated(tmdbData.topRated || []);
          
          if (trendList.length > 0) {
            const randIdx = Math.floor(Math.random() * Math.min(trendList.length, 5));
            setHeroMovie(trendList[randIdx]);
          }
        }

        // Загрузка торрентов из TorrServer
        const torrRes = await fetch("/api/torrents/list");
        if (torrRes.ok) {
          const torrData = await torrRes.json();
          const items: MovieItem[] = torrData.items || [];
          // Сортируем по дате добавления (timestamp) по убыванию
          const sorted = [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
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



  // Экран загрузки
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#07080e]">
        <div className="text-center space-y-6">
          <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-500 to-pink-500 animate-pulse tracking-widest font-sans">
            SINFLEX
          </span>
          <div className="flex justify-center">
            <div className="w-10 h-10 border-4 border-t-violet-500 border-white/5 rounded-full animate-spin shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
          </div>
        </div>
      </div>
    );
  }

  // Главная страница Sinflex
  return (
    <div className="relative pb-24 bg-[#141414] min-h-screen">
      <Header
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
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
                    <p className="font-bold text-xs sm:text-sm text-white truncate">
                      {movie.title || movie.name || movie.original_title || movie.original_name || "Без названия"}
                    </p>
                    <p className="text-xxs text-gray-400 mt-0.5">
                      {movie.release_date ? new Date(movie.release_date).getFullYear() : 
                       movie.first_air_date ? new Date(movie.first_air_date).getFullYear() : ""}
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
            movie={heroMovie}
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
