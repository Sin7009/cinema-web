import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getPlexLibraries, getLibraryItems } from "@/lib/plex";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.authToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sectionId = searchParams.get("sectionId");

  try {
    if (sectionId) {
      const items = await getLibraryItems(session.authToken, sectionId);
      return NextResponse.json({ items });
    } else {
      const sections = await getPlexLibraries(session.authToken);
      return NextResponse.json({ sections });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
