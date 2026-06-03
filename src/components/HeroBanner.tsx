"use client";

import React from "react";

interface HeroBannerProps {
  movie: any;
  onMovieClick: (movie: any) => void;
}

export default function HeroBanner({ movie, onMovieClick }: HeroBannerProps) {
  if (!movie) return null;

  const getMovieTitle = (movie: any) => {
    return movie.title || movie.name || movie.original_title || "Без названия";
  };

  const getMovieOverview = (movie: any) => {
    const text = movie.overview || "";
    if (text.length > 200) {
      return text.substring(0, 200) + "...";
    }
    return text || "Описание отсутствует.";
  };

  return (
    <div className="relative h-[56.25vw] min-h-[500px] max-h-[85vh] w-full flex items-center bg-black">
      {/* Фоновое изображение */}
      <div className="absolute inset-0 w-full h-full">
        <img
          src={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
          alt={getMovieTitle(movie)}
          className="w-full h-full object-cover opacity-60"
        />
        {/* Градиенты Sinflex */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#07060f] via-[#07060f]/60 to-transparent w-[55%] h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07060f] via-transparent to-transparent w-full h-full" />
      </div>

      {/* Текстовый контент */}
      <div className="absolute left-6 md:left-12 max-w-xl space-y-4 z-10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white drop-shadow-md">
          {getMovieTitle(movie)}
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-gray-200 drop-shadow">
          {getMovieOverview(movie)}
        </p>

        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={() => onMovieClick(movie)}
            className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-lg hover:from-violet-500 hover:to-fuchsia-500 transition duration-300 shadow-[0_0_15px_rgba(139,92,246,0.45)] hover:scale-105 transform cursor-pointer"
          >
            <span className="text-lg">▶</span>
            <span>Смотреть</span>
          </button>
          <button
            onClick={() => onMovieClick(movie)}
            className="flex items-center space-x-2 px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-lg border border-white/10 backdrop-blur-md transition duration-300 hover:scale-105 transform cursor-pointer"
          >
            <span className="text-lg">ⓘ</span>
            <span>Подробнее</span>
          </button>
        </div>
      </div>
    </div>
  );
}
