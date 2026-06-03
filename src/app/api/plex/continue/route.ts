import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getContinueWatching } from "@/lib/plex";

export async function GET() {
  const session = await getSession();
  if (!session || !session.authToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await getContinueWatching(session.authToken);
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
