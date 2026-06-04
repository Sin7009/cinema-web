import { NextResponse } from "next/server";
import { getTorrServerStatus } from "@/lib/torrserver";

export async function GET() {
  try {
    const status = await getTorrServerStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
