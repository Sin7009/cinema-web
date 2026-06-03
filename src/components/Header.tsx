"use client";

import React from "react";

interface HeaderProps {
  user: any;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onLogout: () => void;
}

export default function Header({ user, searchQuery, setSearchQuery, onLogout }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 md:px-12 py-4 transition-all duration-500 bg-gradient-to-b from-black/80 to-transparent hover:bg-black/95">
      <div className="flex items-center space-x-8">
        <h1 className="text-3xl font-extrabold tracking-wider text-red-600 cursor-pointer select-none">
          NETFLIX
        </h1>
        <nav className="hidden md:flex space-x-6 text-sm font-medium text-gray-300">
          <span className="text-white hover:text-white cursor-pointer transition">Главная</span>
          <span className="hover:text-white cursor-pointer transition">Фильмы</span>
          <span className="hover:text-white cursor-pointer transition">Сериалы</span>
        </nav>
      </div>

      <div className="flex items-center space-x-6">
        {/* Поиск */}
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder="Название фильма..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 md:w-64 px-4 py-1.5 bg-black/60 border border-gray-700 rounded-full text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-600 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 text-gray-400 hover:text-white text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Профиль Plex */}
        <div className="flex items-center space-x-3 group relative">
          <div className="flex items-center space-x-2 cursor-pointer">
            {user?.thumb ? (
              <img
                src={user.thumb}
                alt={user.username}
                className="w-8 h-8 rounded-md border border-gray-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-md bg-red-600 flex items-center justify-center font-bold text-white uppercase text-sm">
                {user?.username?.charAt(0) || "P"}
              </div>
            )}
            <span className="hidden sm:inline text-sm text-gray-300 group-hover:text-white transition">
              {user?.username || "Plex User"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
