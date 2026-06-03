import { NextRequest, NextResponse } from "next/server";
import { setSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { pinId } = await req.json();
    if (!pinId) {
      return NextResponse.json({ error: "Missing pinId" }, { status: 400 });
    }

    const clientIdentifier = process.env.PLEX_CLIENT_ID || "cinema-web-netflix-clone-app";

    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Plex API error: ${errorText}` }, { status: 500 });
    }

    const data = await response.json();
    const authToken = data.authToken;

    if (!authToken) {
      // Пользователь еще не вошел в Plex
      return NextResponse.json({ authorized: false });
    }

    // Сохраняем сессию пользователя (токен Plex и базовую инфу)
    await setSession({
      authToken,
      user: {
        username: data.user?.username || "Plex User",
        email: data.user?.email || "",
        id: data.user?.id || null,
        thumb: data.user?.thumb || null,
      }
    });

    return NextResponse.json({ authorized: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
