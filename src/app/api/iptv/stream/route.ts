import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function resolveUrl(baseUrl: string, relativeUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    if (relativeUrl.startsWith("/")) {
      const urlObj = new URL(baseUrl);
      return `${urlObj.protocol}//${urlObj.host}${relativeUrl}`;
    }
    const lastSlash = baseUrl.lastIndexOf("/");
    return baseUrl.substring(0, lastSlash + 1) + relativeUrl;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing target url", { status: 400 });
  }

  try {
    // Выполняем запрос к оригинальному источнику потока без кэширования Next.js
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return new Response(`Failed to fetch stream: ${res.statusText}`, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "";
    const isM3u8 = targetUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("application/x-mpegurl");

    if (isM3u8) {
      // Парсим и переписываем плейлист
      const text = await res.text();
      const lines = text.split(/\r?\n/);
      
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        
        if (!trimmed) return line;

        // Если строка содержит ссылку на сегмент или суб-плейлист
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          return `/api/iptv/stream?url=${encodeURIComponent(trimmed)}`;
        }
        
        // Если это относительный путь к сегменту
        if (!trimmed.startsWith("#")) {
          const absoluteUrl = resolveUrl(targetUrl, trimmed);
          return `/api/iptv/stream?url=${encodeURIComponent(absoluteUrl)}`;
        }

        // Обрабатываем URL в тегах, например, ключи шифрования #EXT-X-KEY:METHOD=AES-128,URI="http://..."
        if (trimmed.includes("URI=\"")) {
          return line.replace(/URI="([^"]+)"/g, (match, p1) => {
            const absoluteUrl = p1.startsWith("http") ? p1 : resolveUrl(targetUrl, p1);
            return `URI="/api/iptv/stream?url=${encodeURIComponent(absoluteUrl)}"`;
          });
        }

        return line;
      });

      return new Response(rewrittenLines.join("\n"), {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // Для бинарных сегментов (.ts) проксируем поток напрямую
    if (!res.body) {
      return new Response("Empty stream body", { status: 500 });
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType || "video/mp2t");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=86400"); // Кэшируем на клиенте
    headers.set("X-Accel-Buffering", "no"); // Запрещаем Nginx буферизовать стрим
    headers.set("Content-Encoding", "identity"); // Отключаем сжатие

    // Не проксируем Content-Length для бинарных стримов во избежание ERR_HTTP2_PROTOCOL_ERROR при обрывах
    return new Response(res.body, {
      headers,
    });
  } catch (error) {
    console.error("[IPTV Proxy Error]", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(`Proxy error: ${errMsg}`, { status: 500 });
  }
}
