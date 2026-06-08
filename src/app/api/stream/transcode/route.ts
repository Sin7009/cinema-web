import { NextRequest } from "next/server";
import { spawn, exec } from "child_process";
import { promisify } from "util";

export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

interface ProbeResult {
  duration: number;
  audioCodec: string | null;
}

// Список аудиокодеков, поддерживаемых браузерами нативно
const SUPPORTED_AUDIO_CODECS = ["aac", "mp3", "opus", "vorbis", "flac"];

async function probeVideo(url: string): Promise<ProbeResult> {
  try {
    // ffprobe быстро считывает заголовки файла с таймаутом 5 секунд и ограничением объема анализируемых данных до 1 МБ
    const { stdout } = await execAsync(
      `ffprobe -v error -probesize 1000000 -analyzeduration 1000000 -show_entries format=duration -show_entries stream=codec_name,codec_type -of json "${url}"`,
      { timeout: 5000 }
    );
    const data = JSON.parse(stdout);
    
    let duration = 0;
    if (data.format && data.format.duration) {
      duration = parseFloat(data.format.duration);
    }
    
    let audioCodec: string | null = null;
    if (Array.isArray(data.streams)) {
      const audioStream = data.streams.find((s: any) => s.codec_type === "audio");
      if (audioStream) {
        audioCodec = audioStream.codec_name;
      }
    }
    
    return { duration, audioCodec };
  } catch (error) {
    console.error("[Probe Video Error]", error);
    return { duration: 0, audioCodec: null };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const link = searchParams.get("link");
  const index = searchParams.get("index");
  const isProbe = searchParams.get("probe") === "true";
  const isSegment = searchParams.get("segment") === "true";
  const startParam = searchParams.get("start");

  if (!link || !index) {
    return new Response("Missing link or index", { status: 400 });
  }

  // Внутренний URL TorrServer (внутри Docker-сети)
  const torrserverUrl = `http://torrserver:8090/stream/video.mp4?link=${link}&index=${index}&play`;

  // 1. РЕЖИМ ЗОНДИРОВАНИЯ (Probe)
  if (isProbe) {
    console.log(`[Transcoder Probe] Probing video for link=${link}, index=${index}`);
    const { duration, audioCodec } = await probeVideo(torrserverUrl);
    
    const shouldTranscode = !audioCodec || !SUPPORTED_AUDIO_CODECS.includes(audioCodec.toLowerCase());
    console.log(`[Transcoder Probe] Result: duration=${duration}s, audioCodec=${audioCodec}, shouldTranscode=${shouldTranscode}`);

    return Response.json({
      duration,
      audioCodec,
      shouldTranscode,
    });
  }

  // 2. РЕЖИМ СЕГМЕНТА HLS
  if (isSegment) {
    const start = parseFloat(startParam || "0");
    console.log(`[Transcoder Segment] Running ffmpeg for start=${start}s`);

    const ffmpegArgs = [
      "-ss", start.toString(),      // Ищем ключевой кадр до декодирования (быстрая перемотка)
      "-i", torrserverUrl,
      "-t", "10",                   // Длительность сегмента 10 секунд
      "-map", "0:v:0?",             // Копируем первый видеопоток
      "-map", "0:a:0?",             // Копируем первый аудиопоток
      "-c:v", "copy",               // Копируем видео без пережатия (0% CPU)
      "-c:a", "aac",                // Транскодируем звук в AAC
      "-b:a", "192k",               // Стандартный качественный битрейт
      "-ac", "2",                   // Даунмикс в Stereo 2.0 для совместимости
      "-f", "mpegts",               // HLS-совместимый формат сегментов MPEG-TS
      "pipe:1"
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    const stream = new ReadableStream({
      start(controller) {
        ffmpeg.stdout.on("data", (chunk) => {
          controller.enqueue(chunk);
        });

        ffmpeg.stdout.on("end", () => {
          try { controller.close(); } catch {}
        });

        ffmpeg.on("error", (err) => {
          console.error("[Transcoder Segment] ffmpeg spawn error:", err);
          try { controller.error(err); } catch {}
        });

        ffmpeg.on("close", (code) => {
          if (code !== 0 && code !== null) {
            console.warn(`[Transcoder Segment] ffmpeg process exited with code ${code}`);
          }
          try { controller.close(); } catch {}
        });

        // Считываем stderr для логов
        let stderrLog = "";
        ffmpeg.stderr.on("data", (data) => {
          const str = data.toString();
          stderrLog += str;
          if (stderrLog.length > 1000) {
            stderrLog = stderrLog.substring(stderrLog.length - 1000);
          }
        });
      },
      cancel() {
        console.log(`[Transcoder Segment] Client cancelled stream (seeking/exit), killing ffmpeg for start=${start}s`);
        ffmpeg.kill("SIGKILL");
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "video/mp2t",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // 3. РЕЖИМ ПЛЕЙЛИСТА HLS (playlist.m3u8)
  console.log(`[Transcoder Playlist] Generating index.m3u8 for link=${link}, index=${index}`);
  const { duration } = await probeVideo(torrserverUrl);
  
  // Если не смогли определить длительность (например, ffprobe вернул 0),
  // используем дефолтные 3 часа (10800 секунд)
  const videoDuration = duration > 0 ? duration : 10800;
  const segmentDuration = 10;
  const segmentCount = Math.ceil(videoDuration / segmentDuration);

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${segmentDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD"
  ];

  // Берем базовый URL приложения для генерации полных URL сегментов
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://watch.nas-soft.com";

  for (let i = 0; i < segmentCount; i++) {
    const start = i * segmentDuration;
    const dur = Math.min(segmentDuration, videoDuration - start);
    lines.push(`#EXTINF:${dur.toFixed(1)},`);
    lines.push(`${appUrl}/api/stream/transcode?link=${link}&index=${index}&segment=true&start=${start}`);
  }

  lines.push("#EXT-X-ENDLIST");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
