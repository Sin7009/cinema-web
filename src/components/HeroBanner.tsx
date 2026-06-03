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
        {/* Градиенты Netflix */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-black/20 to-transparent w-[50%] h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent w-full h-full" />
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
            className="flex items-center space-x-2 px-6 py-2.5 bg-white text-black font-bold rounded hover:bg-white/80 transition duration-300 shadow-md"
          >
            <span className="text-lg">▶</span>
            <span>Смотреть</span>
          </button>
          <button
            onClick={() => onMovieClick(movie)}
            className="flex items-center space-x-2 px-6 py-2.5 bg-gray-500/40 text-white font-bold rounded hover:bg-gray-500/60 border border-gray-500/30 transition duration-300 shadow-md"
          >
            <span className="text-lg">ⓘ</span>
            <span>Подробнее</span>
          </button>
        </div>
      </div>
    </div>
  );
}
