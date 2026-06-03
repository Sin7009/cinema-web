const PLEX_SERVER_URL = process.env.PLEX_SERVER_URL || "https://plex.nas-soft.com";

async function fetchFromPlex(endpoint: string, authToken: string, queryParams: Record<string, string> = {}) {
  const searchParams = new URLSearchParams({
    ...queryParams,
  });

  const url = `${PLEX_SERVER_URL}${endpoint}?${searchParams.toString()}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": authToken,
      },
      next: { revalidate: 0 }, // Не кэшировать, данные динамические
    });
    if (!res.ok) {
      console.error(`Plex error fetching ${endpoint}: ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error(`Plex fetch error:`, error);
    return null;
  }
}

// Получить продолжение просмотра (Continue Watching / On Deck)
export async function getContinueWatching(authToken: string) {
  const data = await fetchFromPlex("/hubs/home/continueWatching", authToken);
  // Если современный continueWatching недоступен, попробуем старый onDeck
  if (!data || !data.MediaContainer?.Metadata) {
    const onDeckData = await fetchFromPlex("/library/onDeck", authToken);
    return onDeckData?.MediaContainer?.Metadata || [];
  }
  return data.MediaContainer.Metadata || [];
}

// Получить все библиотеки (фильмы, сериалы и т.д.)
export async function getPlexLibraries(authToken: string) {
  const data = await fetchFromPlex("/library/sections", authToken);
  return data?.MediaContainer?.Directory || [];
}

// Получить элементы конкретной библиотеки
export async function getLibraryItems(authToken: string, sectionId: string) {
  const data = await fetchFromPlex(`/library/sections/${sectionId}/all`, authToken);
  return data?.MediaContainer?.Metadata || [];
}

// Отправить прогресс просмотра (скробблинг)
// state: 'playing', 'paused', 'stopped'
// time: текущее время воспроизведения в миллисекундах
export async function scrobbleProgress(authToken: string, ratingKey: string, state: "playing" | "paused" | "stopped", timeMs: number) {
  return await fetchFromPlex("/::/progress", authToken, {
    key: ratingKey,
    state,
    time: timeMs.toString(),
  });
}
