// Download CC BY open movies (Blender Foundation / Blender Studio) from Wikimedia Commons,
// cut a clip from each, and encode them as the mock videos used by the demo.
// Output: public/videos/mockNN_240p.mp4, public/thumbnails/mockNN.jpg, public/data/videos.json
// Usage: NODE_USE_ENV_PROXY=1 node scripts/fetch-videos.ts
// Offline fallback: bash scripts/generate-videos.sh (test pattern, 180s each)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, ".cache/source-videos");
const VIDEO_DIR = join(ROOT, "public/videos");
const THUMB_DIR = join(ROOT, "public/thumbnails");
const DATA_DIR = join(ROOT, "public/data");
const UA = "nico-zap/0.1 (hackathon demo)";
const MAX_CLIP_SECONDS = 180;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Film {
  file: string; // Wikimedia Commons file name
  title: string;
  year: number;
  author: string;
  license: string;
  licenseUrl: string;
  start: number; // clip start (skip opening logos)
}

// Mock ids are assigned in this order (mock01 = rank 1 ...).
const FILMS: Film[] = [
  { file: "Big_Buck_Bunny_4K.webm", title: "Big Buck Bunny", year: 2008, author: "Blender Foundation", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", start: 60 },
  { file: "Spring_-_Blender_Open_Movie.webm", title: "Spring", year: 2019, author: "Blender Animation Studio", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", start: 20 },
  { file: "Coffee_Run_-_Blender_Open_Movie-full_movie.webm", title: "Coffee Run", year: 2020, author: "Blender Studio", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", start: 0 },
  { file: "Elephants_Dream_(2006)_1080p24.webm", title: "Elephants Dream", year: 2006, author: "Blender Foundation / Netherlands Media Art Institute", license: "CC BY 2.5", licenseUrl: "https://creativecommons.org/licenses/by/2.5/", start: 30 },
  { file: "HERO_-_Blender_Open_Movie-full_movie.webm", title: "HERO", year: 2018, author: "Blender Animation Studio", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", start: 10 },
  { file: "Glass_Half_-_Blender_Open_Movie-full_movie.webm", title: "Glass Half", year: 2015, author: "Blender Institute", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", start: 5 },
  { file: "WING_IT!_-_Blender_Open_Movie-full_movie.webm", title: "WING IT!", year: 2023, author: "Blender Studio", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", start: 15 },
  { file: "Sprite_Fright_-_Blender_Open_Movie-full_movie.webm", title: "Sprite Fright", year: 2021, author: "Blender Studio", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", start: 30 },
  { file: "Caminandes-_Llama_Drama_-_Short_Movie.ogv", title: "Caminandes: Llama Drama", year: 2013, author: "Blender Foundation / Pablo Vazquez", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", start: 0 },
  { file: "Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm", title: "Tears of Steel", year: 2012, author: "Blender Foundation", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", start: 60 },
];

async function transcodeUrl(file: string): Promise<{ src: string; page: string; duration: number }> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    titles: `File:${file.replace(/_/g, " ")}`,
    prop: "videoinfo",
    viprop: "url|derivatives",
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": UA } });
  const body = (await res.json()) as {
    query: { pages: Record<string, { videoinfo?: { descriptionurl: string; duration?: number; derivatives: { src: string; transcodekey?: string }[] }[] }> };
  };
  const info = Object.values(body.query.pages)[0].videoinfo?.[0];
  const der = info?.derivatives.find((d) => d.transcodekey === "360p.vp9.webm") ?? info?.derivatives.find((d) => d.transcodekey === "240p.vp9.webm");
  if (!info || !der) throw new Error(`no transcode for ${file}`);
  return { src: der.src, page: info.descriptionurl, duration: info.duration ?? 0 };
}

function probeDuration(path: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  return Number(out.toString().trim());
}

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(THUMB_DIR, { recursive: true });

const manifest = [];
for (const [i, film] of FILMS.entries()) {
  const mockId = `mock${String(i + 1).padStart(2, "0")}`;
  const { src, page } = await transcodeUrl(film.file);
  const cached = join(CACHE_DIR, `${mockId}.webm`);
  if (!existsSync(cached)) {
    console.log(`download ${film.title}`);
    let res = await fetch(src, { headers: { "User-Agent": UA } });
    for (let retry = 1; res.status === 429 && retry <= 5; retry++) {
      console.log(`rate limited, retry in ${retry * 20}s`);
      await sleep(retry * 20_000);
      res = await fetch(src, { headers: { "User-Agent": UA } });
    }
    if (!res.ok) throw new Error(`download failed: ${film.file} ${res.status}`);
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
    await sleep(3000);
  }
  const total = probeDuration(cached);
  const clipSeconds = Math.floor(Math.min(MAX_CLIP_SECONDS, total - film.start));
  const out = join(VIDEO_DIR, `${mockId}_240p.mp4`);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", String(film.start), "-t", String(clipSeconds), "-i", cached,
    // Crop wide films (2.39:1 etc.) to 16:9 so tiles show no letterbox.
    "-vf", "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=426:240,setsar=1,fps=30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-g", "60", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "64k", "-ac", "2", "-movflags", "+faststart",
    out,
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", String(Math.min(20, clipSeconds / 3)), "-i", out, "-frames:v", "1", "-q:v", "4",
    join(THUMB_DIR, `${mockId}.jpg`),
  ]);
  console.log(`${mockId}: ${film.title} ${film.start}s +${clipSeconds}s`);
  manifest.push({
    mockId,
    clipSeconds,
    credit: {
      title: film.title,
      year: film.year,
      author: film.author,
      license: film.license,
      licenseUrl: film.licenseUrl,
      sourceUrl: page,
      changes: `${film.start}秒目から${clipSeconds}秒を切り出し、16:9にトリミングして240pに再エンコード`,
    },
  });
}

writeFileSync(join(DATA_DIR, "videos.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("wrote videos.json");
