/* 뉴스픽 스튜디오 | 정적 자산 빌드 (dist/)
   - Pages Functions 는 프로젝트 루트 functions/ 를 그대로 인식한다.
   - 배포: node scripts/build.mjs && npx wrangler pages deploy dist --project-name newspic-studio
*/
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const FILES = ["index.html", "robots.txt", "sitemap.xml", "_headers"];
const DIRS = ["assets"];

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const file of FILES) await cp(join(ROOT, file), join(DIST, file));
for (const dir of DIRS) await cp(join(ROOT, dir), join(DIST, dir), { recursive: true });
console.log("빌드 완료: dist/");
