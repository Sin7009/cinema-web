import { NextRequest } from "next/server";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const link = searchParams.get("link");
  const index = searchParams.get("index");

  if (!link || !index) {
    return new Response("Missing link or index", { status: 400 });
  }

  // Внутренний URL TorrServer (Next.js и TorrServer работают в одной Docker-сети)
  const torrserverUrl = `http://torrserver:8090/stream/video.mp4?link=${link}&index=${index}&play`;

  console.log(`[Transcoder] Starting transcode stream for link=${link}, index=${index}`);

  // Аргументы ffmpeg для транскодирования аудиодорожки в AAC Stereo и копирования видеопотока
  const ffmpegArgs = [
    "-i", torrserverUrl,
    "-map", "0:v:0?",   // Копируем первое видео
    "-map", "0:a:0?",   // Копируем первое аудио (которое перекодируем)
    "-c:v", "copy",      // Видео копируем без пережатия (0% нагрузки на CPU)
    "-c:a", "aac",       // Аудио перекодируем в AAC (поддерживается всеми браузерами)
    "-b:a", "192k",      // Битрейт аудио
    "-ac", "2",          // 2 канала (Stereo) для совместимости
    "-movflags", "frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset", // фрагментированный MP4 для стриминга в pipe
    "-f", "mp4",
    "pipe:1"
  ];

  const ffmpeg = spawn("ffmpeg", ffmpegArgs);

  const stream = new ReadableStream({
    start(controller) {
      ffmpeg.stdout.on("data", (chunk) => {
        controller.enqueue(chunk);
      });

      ffmpeg.stdout.on("end", () => {
        try {
          controller.close();
        } catch (e) {
          // Игнорируем ошибки, если поток уже закрыт
        }
      });

      ffmpeg.on("error", (err) => {
        console.error("[Transcoder] ffmpeg process error:", err);
        try {
          controller.error(err);
        } catch (e) {}
      });

      ffmpeg.on("close", (code) => {
        console.log(`[Transcoder] ffmpeg process exited with code ${code}`);
        try {
          controller.close();
        } catch (e) {}
      });

      // Логируем ошибки ffmpeg из stderr для отладки
      let stderrLog = "";
      ffmpeg.stderr.on("data", (data) => {
        stderrLog += data.toString();
        if (stderrLog.length > 1000) {
          stderrLog = stderrLog.substring(stderrLog.length - 1000);
        }
      });
    },
    cancel() {
      console.log("[Transcoder] Client disconnected, killing ffmpeg process...");
      ffmpeg.kill("SIGKILL");
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
    },
  });
}
