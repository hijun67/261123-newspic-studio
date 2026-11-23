# 뉴스픽 스튜디오 (newspic-studio)

뉴스픽·파트너스 기사를 **텍스트로 미러링**해 보관하고, 그 기사 하나로

1. **AI 4컷 만화** (실사 · 지브리풍 · 웹툰 · 이슈 툰)
2. **카드뉴스 8장** (테마 4종 × 비율 4:5 / 9:16)
3. **6개 채널 업로드 패키지** (쓰레드 · 인스타 · 페이스북 · X · 틱톡 · 유튜브 쇼츠)

를 한 화면에서 만들고 내려받는 개인 콘텐츠 제작 스튜디오입니다.

- 라이브: <https://newspic-studio.pages.dev>
- 호스팅: Cloudflare Pages (Functions + KV)
- 외부 유료 API 없이 동작합니다. (무료 이미지 생성 + Canvas 폴백, BYOK 선택)

> 개인 콘텐츠 제작용 도구입니다. 원문 저작권은 원작자에게 있고, 미러링한 텍스트는
> 내 KV/브라우저 아카이브에만 보관됩니다. 사이트 전체에 `X-Robots-Tag: noindex, nofollow`,
> `robots.txt → Disallow: /` 를 적용해 검색엔진 노출을 막습니다.

---

## 1. 화면 흐름

| 단계 | 화면 | 하는 일 |
|---|---|---|
| 1 | 미러링 허브 | 기사 URL → 제목·부제·본문 문단·이미지·발행시각·바이라인 추출, `pn` 자동 병합, 아카이브 저장(검색·열기·삭제·원문 이동) |
| 2 | 4컷 만화 | 기사를 훅 → 핵심 → 반전 → 결론으로 분해, 스타일 4종, 컷별 나레이션·대사·화자·표정·프롬프트 편집, 합본/개별 PNG |
| 3 | 카드뉴스 8장 | 표지 → 3줄 요약 → 배경 → 숫자 → 핵심 팩트 → 쟁점 → 체크리스트 → CTA 자동 기획, 테마·비율 전환, 문구 편집, 개별 PNG / 8장 ZIP |
| 4 | 6개 채널 | 플랫폼별 본문·해시태그·첫 댓글 링크, 글자수 제한 자동 맞춤, 원클릭 복사, 쓰레드/X 작성창, 페북 공유, 9:16 슬라이드 영상(.webm) |

## 2. API (Cloudflare Pages Functions)

| 경로 | 메서드 | 설명 |
|---|---|---|
| `/api/mirror` | `POST` | `{url, pn}` 기사 미러링 / `{title, body, url, pn, manual:true}` 직접 입력 / `{preset:"power-bill"}` 예시 |
| `/api/mirror` | `GET` | `?q=` 아카이브 검색(최대 60건), `?id=` 단건 |
| `/api/mirror` | `DELETE` | `?id=` 아카이브에서 삭제 |
| `/api/presets` | `GET` | 예시 기사 3종 |
| `/api/generate-image` | `POST` | `{prompt, provider:"free"\|"openai"\|"gemini", apiKey?, model?, width, height, seed}` → `{dataUrl}` 또는 `{ok:false, mode:"fallback", reason}` |
| `/api/proxy-image` | `GET` | `?url=` 기사 썸네일을 base64 로 중계(캔버스 저장용) |
| `/api/health` | `GET` | 상태·KV 연결·기능 확인 |

### 저장소

- KV 바인딩 `ARCHIVE` → 네임스페이스 `newspic-studio-kv`, 키 접두사 `a:`, 보관 180일.
- KV 바인딩이 없으면 API 가 `storage:"none"` 을 돌려주고 화면이 **브라우저(localStorage) 아카이브**로 자동 폴백합니다.
- 아카이브 항목에는 파트너 코드가 병합된 `partnerUrl` 이 함께 저장됩니다.

### 이미지 생성

1. **무료(기본)** — Pollinations(`image.pollinations.ai`, flux)에서 서버가 받아 base64 로 반환.
2. **실패/오프라인** — 스타일별 Canvas 아트(실사 야경·지브리 수채화·웹툰 집중선·이슈툰 하프톤)로 자동 대체. 화면이 절대 깨지지 않습니다.
3. **BYOK(선택)** — 본인 OpenAI / Gemini 키를 브라우저(localStorage)에만 저장하고, 생성 요청 때 이 사이트의 함수로만 전달합니다. 서버에 저장하지 않습니다.

## 3. 로컬 실행 · 테스트

```bash
node scripts/build.mjs          # dist/ 생성 (정적 자산)
node /workspace/.local-tests/newspic-studio/test.js    # 단위·API 테스트
LD_LIBRARY_PATH=/workspace/tmp-acs/libs /workspace/tmp/node/bin/node \
  /workspace/.local-tests/newspic-studio/ui.test.js    # headless Chromium UI 테스트
```

- 단위·API: `plan.js`(4컷·카드·채널·ZIP) + `/api/*` 전 경로, KV 유무·차단·실패 폴백
- UI: 1440px/390px 가로 오버플로 0, 콘솔 에러 0, 스타일·테마·비율 전환, PNG/ZIP 다운로드 규격, 클립보드, 6개 플랫폼, 영상 생성, 브라우저 아카이브 유지

## 4. 배포

```bash
# 1) KV 네임스페이스 생성 (최초 1회)
npx wrangler kv namespace create newspic-studio-kv
#    → 출력된 id 를 wrangler.toml 의 [[kv_namespaces]] id 에 넣는다

# 2) 빌드 + 배포
node scripts/build.mjs
npx wrangler pages deploy dist --project-name newspic-studio --branch main
```

- `wrangler.toml` 의 `pages_build_output_dir = "dist"`, `[[kv_namespaces]] binding = "ARCHIVE"`.
- Cloudflare 대시보드에서 Pages 프로젝트 `newspic-studio` 의 프로덕션 브랜치는 `main`.
- **GitHub 푸시만으로는 자동 배포되지 않습니다.** (직접 업로드 프로젝트) 수정 시 위 2)를 다시 실행합니다.
- 배포용 API 토큰은 `Cloudflare Pages:Edit`(+KV 생성 시 `Workers KV Storage:Edit`)만, 계정 한정, 짧은 만료로 발급하고 **배포 직후 삭제**합니다.

## 5. 파일 구조

```
index.html                  4단계 화면
assets/style.css            다크 스튜디오 테마 (390px 대응)
assets/app.js               화면 컨트롤러 · 아카이브 · 다운로드
assets/plan.js              4컷/카드 8장/6채널 기획 + ZIP (순수 함수)
assets/canvas.js            4컷 캔버스 렌더러 (스타일 4종 + AI 이미지 배경)
assets/cards.js             카드뉴스 렌더러 (테마 4종 × 비율 2종)
assets/video.js             카드 8장 → 9:16 .webm (Canvas + MediaRecorder)
functions/api/mirror.js     미러링·아카이브 (KV/폴백)
functions/api/generate-image.js  무료/BYOK 이미지 생성
functions/api/proxy-image.js     썸네일 base64 중계
functions/api/presets.js    예시 기사 3종
functions/api/health.js     상태 확인
functions/api/_lib.js       파싱·정리·파트너 링크 공용 함수
scripts/build.mjs           dist/ 빌드
wrangler.toml               Pages + KV 설정
```

## 6. 알아둘 점 · 한계

- **본문 문장을 원문 그대로 사용**합니다. 게시 전 사실 확인이 필요하고, 인용 범위를 넘는 전재는 피하세요.
- 일부 언론사/뉴스픽 페이지는 봇 차단(403)·타임아웃이 날 수 있습니다. 그때는 화면이 **직접 붙여넣기**로 전환됩니다(주소는 첫 댓글 링크용으로 유지).
- 4컷 이미지는 AI가 글자를 그리지 않도록 `no text, no letters` 를 프롬프트에 넣고, 나레이션·대사는 캔버스로 얹습니다.
- 쓰레드/X 인텐트는 **본문만** 넘길 수 있어 이미지는 앱에서 직접 첨부해야 합니다(화면 3단계 체크리스트).
- 영상은 브라우저 MediaRecorder 로 만들어 **실시간**으로 녹화합니다(8장 × 2.2초 ≈ 18초).
- 카드 표지에 기사 이미지를 쓰려면 이미지 중계(`/api/proxy-image`)가 필요합니다. 일부 CDN 은 차단될 수 있습니다.
- iOS Safari 에서는 첫 사용자 제스처 후에 다운로드/공유가 동작합니다.
