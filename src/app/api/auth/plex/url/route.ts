import { NextResponse } from "next/server";

export async function POST() {
  try {
    const clientIdentifier = process.env.PLEX_CLIENT_ID || "cinema-web-netflix-clone-app";
    
    const response = await fetch("https://plex.tv/api/v2/pins?strong=true", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "X-Plex-Product": "Cinema Web",
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Plex API error: ${errorText}` }, { status: 500 });
    }

    const data = await response.json();
    const pinId = data.id;
    const code = data.code;

    // Ссылка для редиректа пользователя
    const authUrl = `https://app.plex.tv/auth/#!?clientID=${clientIdentifier}&key=${code}&context[device][product]=Cinema%20Web`;

    return NextResponse.json({ authUrl, pinId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
