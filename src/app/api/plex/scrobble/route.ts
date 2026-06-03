import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { scrobbleProgress } from "@/lib/plex";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.authToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ratingKey, state, timeMs } = await req.json();
    if (!ratingKey || !state || timeMs === undefined) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    await scrobbleProgress(session.authToken, ratingKey, state, timeMs);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
