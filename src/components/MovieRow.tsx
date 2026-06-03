"use client";

import React, { useRef } from "react";

interface MovieRowProps {
  title: string;
  movies: any[];
  onMovieClick: (movie: any) => void;
  plexAuthToken?: string;
  plexServerUrl?: string;
}

export default function MovieRow({ title, movies, onMovieClick, plexAuthToken, plexServerUrl }: MovieRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  if (!movies || movies.length === 0) return null;

  const handleScroll = (direction: "left" | "right") => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollTo = direction === "left" 
        ? scrollLeft - clientWidth * 0.75 
        : scrollLeft + clientWidth * 0.75;
      
      rowRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
    }
  };

  const getMoviePoster = (movie: any) => {
    // Если это фильм из TorrServer
    if (movie.poster) {
      return movie.poster;
    }
    // Если это фильм из TMDB
    if (movie.poster_path) {
      return `https://image.tmdb.org/t/p/w300${movie.poster_path}`;
    }
    // Если это фильм из Plex
    if (movie.thumb && plexServerUrl && plexAuthToken) {
      return `${plexServerUrl}${movie.thumb}?X-Plex-Token=${plexAuthToken}`;
    }
    // Плейсхолдер
    return "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=300&auto=format&fit=crop";
  };

  const getMovieTitle = (movie: any) => {
    return movie.title || movie.name || movie.original_title || "Без названия";
  };

  const getMovieYear = (movie: any) => {
    const dateStr = movie.release_date || movie.first_air_date || movie.originallyAvailableAt || (movie.timestamp ? movie.timestamp * 1000 : null);
    if (dateStr) {
      return new Date(dateStr).getFullYear();
    }
    return null;
  };

  return (
    <div className="space-y-2 px-6 md:px-12 group relative">
      <h2 className="text-xl md:text-2xl font-bold text-gray-200 group-hover:text-white transition duration-300">
        {title}
      </h2>

      <div className="relative">
        {/* Кнопка Влево */}
        <button
          onClick={() => handleScroll("left")}
          className="absolute top-0 bottom-0 left-0 z-10 w-12 bg-black/60 hover:bg-black/85 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-r-md"
        >
          <span className="text-2xl text-white">‹</span>
        </button>

        {/* Карусель */}
        <div
          ref={rowRef}
          className="flex space-x-4 overflow-x-scroll no-scrollbar py-4"
        >
          {movies.map((movie) => (
            <div
              key={movie.id || movie.ratingKey || movie.hash}
              onClick={() => onMovieClick(movie)}
              className="flex-none w-36 sm:w-44 md:w-52 h-52 sm:h-64 md:h-76 relative rounded-md overflow-hidden cursor-pointer transform hover:scale-105 transition duration-300 shadow-lg hover:shadow-black/60 bg-[#1f1f1f]"
            >
              {/* Постер */}
              <img
                src={getMoviePoster(movie)}
                alt={getMovieTitle(movie)}
                loading="lazy"
                className="w-full h-full object-cover"
              />

              {/* Инфо при наведении */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 hover:opacity-100 transition duration-300 flex flex-col justify-end p-3">
                <p className="font-bold text-sm sm:text-base text-white truncate">
                  {getMovieTitle(movie)}
                </p>
                <div className="flex items-center space-x-2 text-xs text-gray-400 mt-1">
                  {getMovieYear(movie) && <span>{getMovieYear(movie)}</span>}
                  {movie.vote_average && (
                    <span className="text-green-500 font-semibold">
                      ★ {movie.vote_average.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Кнопка Вправо */}
        <button
          onClick={() => handleScroll("right")}
          className="absolute top-0 bottom-0 right-0 z-10 w-12 bg-black/60 hover:bg-black/85 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-l-md"
        >
          <span className="text-2xl text-white">›</span>
        </button>
      </div>
    </div>
  );
}
