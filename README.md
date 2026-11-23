# 뉴스픽 스튜디오 (newspic-studio)

뉴스픽·파트너스 기사를 **텍스트로 미러링**해 보관하고, 그 기사 하나로

1. **분류별 기사 피드** (전체 · 경제 · IT/테크 · 사회 · 연예/이슈 · 스포츠 → 원클릭 미러링)
2. **AI 4컷 만화** (실사 · 지브리풍 · 웹툰 · 이슈 툰 / `AI 알아서 생성` · `기사 내 이미지 사용`)
3. **카드뉴스 4 · 6 · 8 · 10장** (한쪽 이미지 + 한쪽 컬러 텍스트 **분할 레이아웃** 기본)
4. **채널별 업로드 패키지** (쓰레드 · 인스타 · 페이스북 · X · 틱톡 · 유튜브 쇼츠, 다중 선택)
5. **자동 생성** (분 단위 간격으로 새 기사를 골라 산출물을 큐에 쌓기)

를 한 화면에서 만들고 내려받는 개인 콘텐츠 제작 스튜디오입니다.

- 라이브: <https://newspic-studio.pages.dev>
- 호스팅: Cloudflare Pages (Functions + KV)
- 외부 유료 API 없이 동작합니다. (Workers AI 무료 할당량 + Canvas 폴백, BYOK 선택)

> 개인 콘텐츠 제작용 도구입니다. 원문 저작권은 원작자에게 있고, 미러링한 텍스트는
> 내 KV/브라우저 아카이브에만 보관됩니다. 사이트 전체에 `X-Robots-Tag: noindex, nofollow`,
> `robots.txt → Disallow: /` 를 적용해 검색엔진 노출을 막습니다.

---

## 1. 화면 흐름

| 단계 | 화면 | 하는 일 |
|---|---|---|
| 1 | 미러링 허브 | **분류별 기사 피드**(6개 탭, RSS + 큐레이션 폴백)에서 기사를 누르면 미러링·요약 후 카드뉴스 단계로 바로 이동, 기사 URL 직접 미러링, `pn` 병합, 직접 붙여넣기, 아카이브 검색·열기·삭제 |
| 1 | 생성 모드 | `수동 생성` / `자동 생성` 전환, 1·5·10·30·60분 프리셋 + 직접 분 입력, 산출물(카드뉴스/4컷/둘 다), 카운트다운, **지금 1회 실행**, 자동 생성 큐 |
| 2 | 4컷 만화 | 훅 → 핵심 → 반전 → 결론 자동 분해, 스타일 4종 + **이미지 소스 2종**(AI 생성 / 기사 내 이미지), 컷별 나레이션·대사·화자·표정·프롬프트 편집, 합본/개별 PNG |
| 3 | 카드뉴스 | **4·6·8·10장** 자동 기획, **분할(기본)/전면형** 레이아웃, 테마 4종 × 비율 2종, 슬라이드별 문구 편집, 개별 PNG / 장수별 ZIP |
| 4 | 채널 | **업로드 채널 다중 선택**, 선택 채널별 본문·해시태그·첫 댓글 링크·작성창·카드 ZIP·영상 패키지, 9:16 슬라이드 영상(.webm) |

## 2. API (Cloudflare Pages Functions)

| 경로 | 메서드 | 설명 |
|---|---|---|
| `/api/feed` | `GET` | `?category=all\|economy\|tech\|society\|entertain\|sports&limit=12&pn=` → 분류별 기사 목록. 연합뉴스 카테고리 RSS + 이티뉴스(IT), 실패 시 카테고리별 큐레이션(6건씩)으로 폴백. KV에 5분 캐시 |
| `/api/mirror` | `POST` | `{url, pn}` 기사 미러링 / `{title, body, url, pn, manual:true}` 직접 입력 / `{preset:"power-bill"}` 예시 |
| `/api/mirror` | `GET` | `?q=` 아카이브 검색(최대 60건), `?id=` 단건 |
| `/api/mirror` | `DELETE` | `?id=` 아카이브에서 삭제 |
| `/api/presets` | `GET` | 예시 기사 3종 |
| `/api/generate-image` | `POST` | `{prompt, provider:"free"\|"openai"\|"gemini", apiKey?, model?, width, height, seed}` → `{dataUrl}` 또는 `{ok:false, mode:"fallback", reason}` |
| `/api/proxy-image` | `GET` | `?url=` 기사 썸네일을 base64 로 중계(캔버스 저장·4컷 기사 이미지용) |
| `/api/health` | `GET` | 상태·KV 연결·기능 확인 |

### 저장소

- KV 바인딩 `ARCHIVE` → 네임스페이스 `newspic-studio-kv`, 키 접두사 `a:`(아카이브·180일), `f:`(피드 캐시·5분).
- KV 바인딩이 없으면 API 가 `storage:"none"` 을 돌려주고 화면이 **브라우저(localStorage) 아카이브**로 자동 폴백합니다.
- 아카이브 항목에는 파트너 코드가 병합된 `partnerUrl` 이 함께 저장됩니다.

### 이미지 생성

1. **무료(기본)** — Cloudflare **Workers AI**(`@cf/black-forest-labs/flux-1-schnell`, 무료 할당량)로 생성합니다. 바인딩이 없을 때는 Pollinations(`image.pollinations.ai`, flux)를 시도합니다. 결과는 항상 base64 data URL 로 돌려주어 캔버스 저장 문제가 없습니다.
2. **실패/오프라인** — 스타일별 Canvas 아트(실사 야경·지브리 수채화·웹툰 집중선·이슈툰 하프톤)로 자동 대체. 화면이 절대 깨지지 않습니다.
3. **BYOK(선택)** — 본인 OpenAI / Gemini 키를 브라우저(localStorage)에만 저장하고, 생성 요청 때 이 사이트의 함수로만 전달합니다. 서버에 저장하지 않습니다.

## 3. 로컬 실행 · 테스트

```bash
node scripts/build.mjs          # dist/ 생성 (정적 자산)
node /workspace/.local-tests/newspic-studio/test.js    # 단위·API 테스트
LD_LIBRARY_PATH=/workspace/tmp-acs/libs /workspace/tmp/node/bin/node \
  /workspace/.local-tests/newspic-studio/ui.test.js    # headless Chromium UI 테스트
```

- 단위·API: `plan.js`(4컷·카드 4/6/8/10·채널·ZIP) + `/api/*` 전 경로(피드 RSS·pn·캐시·큐레이션 폴백 포함), KV 유무·차단·실패 폴백
- UI: 1440px/390px 가로 오버플로 0, 콘솔 에러 0, 분류 피드 원클릭 미러링, 4/6/8/10장 전환, 분할/전면 렌더, 기사 내 이미지 4컷, 자동 생성 1회·타이머, 채널 5개 다중 선택, PNG/ZIP 규격, 클립보드, 영상

## 4. 배포

```bash
# 1) KV 네임스페이스 생성 (최초 1회)
npx wrangler kv namespace create newspic-studio-kv
#    → 출력된 id 를 wrangler.toml 의 [[kv_namespaces]] id 에 넣는다

# 2) 빌드 + 배포
node scripts/build.mjs
npx wrangler pages deploy dist --project-name newspic-studio --branch main
```

- `wrangler.toml` 의 `pages_build_output_dir = "dist"`, `[[kv_namespaces]] binding = "ARCHIVE"`, `[ai] binding = "AI"`.
- Cloudflare 대시보드에서 Pages 프로젝트 `newspic-studio` 의 프로덕션 브랜치는 `main`.
- **GitHub 푸시만으로는 자동 배포되지 않습니다.** (직접 업로드 프로젝트) 수정 시 위 2)를 다시 실행합니다.
- 배포용 API 토큰은 `Cloudflare Pages:Edit`(+KV 생성 시 `Workers KV Storage:Edit`)만, 계정 한정, 짧은 만료로 발급하고 **배포 직후 삭제**합니다.

## 5. 검증 결과 (2026-11-23 1단계 업그레이드)

| 구분 | 결과 |
|---|---|
| 단위·API (`test.js`) | **155/155 통과** — 4컷·카드 4/6/8/10·6채널·ZIP, `/api/*` 전 경로, 피드 RSS/캐시/폴백, KV/폴백/차단 |
| headless Chromium UI (`ui.test.js`) | **116/116 통과** — 1440·390px 오버플로 0, 콘솔 에러 0, 피드 원클릭, 장수 전환, 분할 레이아웃, 기사 내 이미지 4컷, 자동 생성 1회·타이머, 채널 다중 선택, PNG/ZIP |
| 라이브 (`live-shots-v2.js`) | 실제 기사 미러링 → 피드 · 분할 카드 · 자동 생성 · 모바일 검증 |

## 6. 파일 구조

```
index.html                  화면 (피드·자동 생성·4컷·카드·채널)
assets/style.css            다크 스튜디오 테마 (390px 대응)
assets/app.js               화면 컨트롤러 · 피드 · 자동 생성 큐 · 다운로드
assets/plan.js              4컷/카드 4·6·8·10장/채널 기획 + ZIP (순수 함수)
assets/canvas.js            4컷 캔버스 렌더러 (스타일 4종 + AI/기사 이미지 배경)
assets/cards.js             카드뉴스 렌더러 (분할/전면 · 테마 4종 × 비율 2종)
assets/video.js             선택 장수 카드 → 9:16 .webm (Canvas + MediaRecorder)
functions/api/feed.js       분류별 기사 피드 (RSS + 5분 캐시 + 폴백)
functions/api/_feedFallback.js  카테고리별 큐레이션 6건씩
functions/api/mirror.js     미러링·아카이브 (KV/폴백)
functions/api/generate-image.js  무료/BYOK 이미지 생성
functions/api/proxy-image.js     썸네일 base64 중계
functions/api/presets.js    예시 기사 3종
functions/api/health.js     상태 확인
functions/api/_lib.js       파싱·정리·파트너 링크 공용 함수
scripts/build.mjs           dist/ 빌드
wrangler.toml               Pages + KV 설정
```

## 7. 알아둘 점 · 한계

- **본문 문장을 원문 그대로 사용**합니다. 게시 전 사실 확인이 필요하고, 인용 범위를 넘는 전재는 피하세요.
- **파트너 코드(pn)** 는 뉴스픽 기사 주소(`newspic.kr`)에만 병합됩니다. 연합뉴스 등 다른 언론사 원문 주소는 `pn` 파라미터를 받지 않아 그대로 연결됩니다(피드에 `pn 적용` 배지로 표시).
- 피드는 연합뉴스 카테고리 RSS와 이티뉴스(IT)를 씁니다. 언론사가 RSS를 막거나 오프라인이면 **카테고리별 큐레이션 6건**이 표시되고, 그 기사는 요약·본문으로 아카이브에 저장됩니다(`큐레이션` 배지).
- **자동 생성은 브라우저 탭이 열려 있는 동안** 동작합니다(서버 스케줄러 아님). AI 이미지는 무료 할당량을 아끼기 위해 자동 단계에서는 만들지 않고, 기사 이미지 또는 Canvas 아트로 산출물을 만듭니다.
- 분할 카드에서 기사 사진을 못 불러오면(CDN 차단) 컬러 아트 패널로 대체됩니다. 4컷 이미지를 만들었다면 카드 이미지 면에 함께 사용됩니다.
- 일부 언론사/뉴스픽 페이지는 봇 차단(403)·타임아웃이 날 수 있습니다. 그때는 화면이 **직접 붙여넣기**로 전환됩니다.
- 쓰레드/X 인텐트는 **본문만** 넘길 수 있어 이미지는 앱에서 직접 첨부해야 합니다.
- 채널 업로드는 **패키지 준비 단계**입니다. 실제 API 자동 게시는 연동 전이며 화면에도 그렇게 표시합니다.
- 영상은 브라우저 MediaRecorder 로 만들어 **실시간**으로 녹화합니다(장수 × 2.2초).
- iOS Safari 에서는 첫 사용자 제스처 후에 다운로드/공유가 동작합니다.
