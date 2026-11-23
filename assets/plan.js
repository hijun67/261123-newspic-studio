/* 뉴스픽 스튜디오 | 기사 → 4컷 · 카드뉴스 8장 · 6개 채널 문구 (순수 함수)
 * DOM 에 의존하지 않으므로 브라우저와 Node 테스트에서 그대로 쓴다.
 */

/* ------------------------------------------------------------------ *
 * 0. 기본 텍스트 유틸
 * ------------------------------------------------------------------ */

export function clean(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function splitSentences(text, maxLen = 200) {
  const source = clean(text).replace(/\n+/g, " ");
  if (!source) return [];
  const parts = source
    .split(/(?<=[.!?。？！])\s+|(?<=[다요죠니다])\s{2,}/)
    .map((part) => stripDateline(part))
    .filter(Boolean);
  const out = [];
  for (const part of parts.length ? parts : [source]) {
    if (part.length <= maxLen) {
      out.push(part);
      continue;
    }
    let rest = part;
    while (rest.length > maxLen) {
      let cut = rest.lastIndexOf(" ", maxLen);
      if (cut < maxLen * 0.5) cut = rest.lastIndexOf(",", maxLen);
      if (cut < maxLen * 0.5) cut = maxLen;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out.filter((sentence) => sentence.length >= 8);
}

export function shorten(text, max) {
  const s = clean(text).replace(/\s+/g, " ").replace(/[「」『』"'“”]+$/g, "").trim();
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  let cut = slice.lastIndexOf(" ");
  if (cut < max * 0.5) cut = slice.lastIndexOf(",");
  if (cut < max * 0.5) cut = slice.lastIndexOf("·");
  if (cut < max * 0.5) cut = max;
  return s.slice(0, cut).replace(/[,·\-\s]+$/, "").trim() + "…";
}

export function stripEmoji(text) {
  return String(text || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
}

const NOISE = /(기사의 이해를 돕기 위한|기사 내용과 직접적인 연관|이미지로 기사 내용|사진은 기사 내용|자료사진|사진 ?[=:]|제공 ?[=:]|사진공동취재단|게티이미지|클립아트|무단 전재|재배포 금지|Copyright|ⓒ)/;
const BYLINE_ONLY = /^[가-힣]{2,4}\s*(?:기자|특파원|앵커|논설위원)$/;
const EMAIL_ONLY = /^[\w.+-]+@[\w.-]+$/;

/** 사진 설명·저작권 안내처럼 기사 내용이 아닌 줄 */
export function isNoiseLine(text) {
  const value = String(text || "").trim();
  if (BYLINE_ONLY.test(value) || EMAIL_ONLY.test(value)) return true;
  return NOISE.test(value);
}

/** (서울=연합뉴스) · [부산=뉴시스] · 홍길동 기자 = 같은 머리말 제거 */
export function stripDateline(text) {
  let value = String(text || "").trim();
  value = value.replace(/^[\[(（](?:[가-힣A-Za-z·\s]{1,20}=[가-힣A-Za-z·\s]{1,20})[)\]）]\s*/, "");
  value = value.replace(/^[가-힣]{2,4}\s*(?:기자|특파원|앵커|논설위원)\s*=\s*/, "");
  return value.trim();
}

export function sentencePool(article) {
  const paragraphs = Array.isArray(article.paragraphs) && article.paragraphs.length
    ? article.paragraphs
    : String(article.body || "").split(/\n+/);
  const seen = new Set();
  const out = [];
  const title = clean(article.title);
  for (const paragraph of paragraphs) {
    for (const sentence of splitSentences(paragraph)) {
      const key = sentence.replace(/[^\w가-힣]/g, "").slice(0, 40);
      if (seen.has(key)) continue;
      if (title && sentence.replace(/\s/g, "") === title.replace(/\s/g, "")) continue;
      if (isNoiseLine(sentence)) continue;
      if (/^(copyright|ⓒ|무단 전재)/i.test(sentence)) continue;
      seen.add(key);
      out.push(sentence);
    }
  }
  return out;
}

const FACT_WORDS = /(\d|%|퍼센트|원|만원|억원|조원|명|가구|개월|년|시간|분|배|건|대)/;

export function isFactSentence(sentence) {
  return FACT_WORDS.test(sentence) && sentence.length >= 16;
}

const ISSUE_WORDS = /(다만|그러나|하지만|우려|논란|지적|과제|규제|책임|비판|한계|반발|위험|쟁점)/;

export function isIssueSentence(sentence) {
  return ISSUE_WORDS.test(sentence);
}

function scoreSentences(sentences) {
  return sentences
    .map((sentence, index) => {
      let score = 0;
      if (isFactSentence(sentence)) score += 4;
      if (/(발표|밝혔다|결정|확대|축소|도입|시행|개편|출시|개발|체결|선정)/.test(sentence)) score += 3;
      if (isIssueSentence(sentence)) score += 1;
      if (sentence.length >= 25 && sentence.length <= 110) score += 2;
      if (index < 3) score += 1;
      return { sentence, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

/** 앞에서부터 순서대로, 중복 없이 n개 고르기 */
function pick(pool, used, count, filter) {
  const out = [];
  for (const item of pool) {
    if (out.length >= count) break;
    if (used.has(item)) continue;
    if (filter && !filter(item)) continue;
    out.push(item);
    used.add(item);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 1. 주제 감지 (장면 프롬프트 · 해시태그)
 * ------------------------------------------------------------------ */

const TOPICS = [
  {
    id: "energy",
    match: /(전기|요금|에너지|누진|한전|가스|냉방|난방)/,
    tags: ["전기요금", "에너지", "생활비"],
    scene: "a Korean apartment living room at dusk with a glowing electricity meter, a fan and warm lamps, city skyline through the window",
  },
  {
    id: "battery",
    match: /(배터리|충전|전기차|리튬|소재|반도체|칩|공정)/,
    tags: ["배터리", "기술", "전기차"],
    scene: "a sleek electric car charging port with glowing battery cells inside a bright clean laboratory",
  },
  {
    id: "transport",
    match: /(자율주행|버스|지하철|택시|교통|노선|운행|도로)/,
    tags: ["교통", "자율주행", "서울"],
    scene: "a futuristic driverless bus on a neon-lit Seoul street at 2 a.m., wet asphalt reflections",
  },
  {
    id: "realestate",
    match: /(부동산|집값|아파트|전세|월세|분양|주택|재건축)/,
    tags: ["부동산", "집값", "아파트"],
    scene: "endless rows of Korean apartment towers at sunset, warm windows lighting up one by one",
  },
  {
    id: "finance",
    match: /(금리|대출|은행|예금|적금|연금|재테크|환율|물가)/,
    tags: ["금리", "재테크", "경제"],
    scene: "a modern bank lobby with a rising interest-rate curve glowing on a glass wall, a person checking a phone",
  },
  {
    id: "market",
    match: /(주식|증시|코스피|코스닥|투자|반등|폭락|상장)/,
    tags: ["주식", "증시", "투자"],
    scene: "a glowing red and blue stock chart reflected in a window above a night city skyline",
  },
  {
    id: "tech",
    match: /(AI|인공지능|로봇|앱|플랫폼|데이터|소프트웨어|스타트업)/,
    tags: ["AI", "테크", "디지털"],
    scene: "a person facing a wall of softly glowing holographic data panels in a dark studio",
  },
  {
    id: "policy",
    match: /(정부|국회|정책|장관|대통령|법안|규제|지원금|보조금)/,
    tags: ["정책", "정부", "사회"],
    scene: "the Korean National Assembly building under dramatic clouds, a lone figure walking toward it",
  },
  {
    id: "health",
    match: /(병원|의료|백신|감염|질환|건강|의사|간호)/,
    tags: ["건강", "의료", "생활"],
    scene: "a clean hospital corridor with soft teal light and a doctor walking away from camera",
  },
  {
    id: "education",
    match: /(수능|입시|학교|교육|학생|대학|학원)/,
    tags: ["교육", "입시", "사회"],
    scene: "students walking into a Korean high school gate at dawn, exam banners fluttering",
  },
  {
    id: "weather",
    match: /(폭염|한파|태풍|장마|기후|기온|미세먼지|홍수)/,
    tags: ["날씨", "기후", "안전"],
    scene: "a heat-shimmered city street with silhouettes under umbrellas, sun blazing between buildings",
  },
  {
    id: "sports",
    match: /(축구|야구|농구|선수|경기|리그|올림픽|감독)/,
    tags: ["스포츠", "경기", "화제"],
    scene: "a floodlit stadium with a roaring crowd silhouette and a player standing alone on the pitch",
  },
  {
    id: "culture",
    match: /(드라마|영화|아이돌|연예|공연|전시|웹툰|예능)/,
    tags: ["연예", "문화", "화제"],
    scene: "a glowing movie theater marquee on a rainy night street with reflective pavement",
  },
  {
    id: "legal",
    match: /(검찰|재판|법원|구속|기소|판결|수사)/,
    tags: ["사회", "법", "이슈"],
    scene: "the steps of a Korean courthouse at dusk with long shadows and a blurred crowd",
  },
];

export function topicProfile(article) {
  const title = clean(article.title);
  const subtitle = isNoiseLine(article.subtitle) ? "" : clean(article.subtitle);
  const text = [title, subtitle, article.body].join(" ");
  const scored = TOPICS.map((topic) => {
    const global = new RegExp(topic.match.source, "g");
    const count = (text.match(global) || []).length;
    const inTitle = topic.match.test(title) || topic.match.test(subtitle);
    return { topic, score: count + (inTitle ? 2 : 0), count };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const primaryItem = scored[0];
  const primary = primaryItem && primaryItem.score >= 2 ? primaryItem.topic : null;
  const secondary = scored
    .slice(1)
    .filter((item) => item.score >= 3)
    .slice(0, 1)
    .map((item) => item.topic);

  const chosen = [primary, ...secondary].filter(Boolean);
  const tags = [];
  for (const hit of chosen) {
    for (const tag of hit.tags) if (!tags.includes(tag)) tags.push(tag);
  }
  const fallback = {
    id: "general",
    tags: ["뉴스", "이슈", "오늘"],
    scene: "a thoughtful Korean office worker reading breaking news on a phone in a sunlit cafe, city outside",
  };
  const lead = primary || fallback;
  return {
    id: lead.id,
    tags: tags.length ? tags.slice(0, 6) : fallback.tags,
    scene: lead.scene,
    hits: chosen.map((hit) => hit.id),
  };
}

export function buildHashtags(article, extra = []) {
  const profile = topicProfile(article);
  const tags = ["뉴스픽", "뉴스", "이슈", ...profile.tags, ...extra];
  const out = [];
  for (const tag of tags) {
    const cleanTag = String(tag).replace(/[^\w가-힣]/g, "");
    if (!cleanTag) continue;
    const value = "#" + cleanTag;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. 4컷 만화
 * ------------------------------------------------------------------ */

export const STYLES = [
  {
    id: "photo",
    name: "실사 이미지",
    en: "Photorealistic",
    emoji: "📷",
    tone: "뉴스 사진 같은 실사 톤",
    prompt:
      "photorealistic editorial news photograph, 35mm lens, natural cinematic light, shallow depth of field, ultra detailed, muted color grade",
  },
  {
    id: "ghibli",
    name: "지브리풍",
    en: "Ghibli Watercolor",
    emoji: "🌿",
    tone: "수채화 애니메이션 감성",
    prompt:
      "Studio Ghibli inspired watercolor animation still, hand-painted gouache background, soft warm light, fluffy cumulus clouds, gentle nostalgic mood, clean cel shading",
  },
  {
    id: "webtoon",
    name: "웹툰 스타일",
    en: "Korean Webtoon",
    emoji: "💬",
    tone: "한국 웹툰 선화·파스텔",
    prompt:
      "Korean webtoon digital illustration, crisp ink linework, cel shading, expressive character face, pastel palette, vertical comic composition",
  },
  {
    id: "issuetoon",
    name: "이슈 툰",
    en: "Editorial Canvas",
    emoji: "🎯",
    tone: "신문 1면 시사만평",
    prompt:
      "bold editorial newspaper cartoon illustration, thick black outlines, flat saturated colors, halftone texture, satirical poster composition",
  },
];

const CUT_SHOTS = [
  "wide establishing shot, dramatic sky, empty space at the top for a headline",
  "medium shot focused on the key subject, clear balanced composition",
  "close-up on a telling detail, slight dutch angle, surprising element",
  "calm resolved scene, subject facing the viewer, thoughtful mood",
];

const ROLE_META = [
  { role: "hook", label: "훅", expression: "놀람", speaker: "독자" },
  { role: "fact", label: "핵심", expression: "진지", speaker: "기자" },
  { role: "twist", label: "반전", expression: "당황", speaker: "독자" },
  { role: "ending", label: "결론", expression: "웃음", speaker: "기자" },
];

const REACTIONS = {
  hook: ["잠깐, 이게 진짜야?", "이게 무슨 소리야?", "방금 뭐라고?"],
  fact: ["핵심만 딱 짚으면 이거지.", "숫자부터 봐야겠는데?", "그래서 얼마나 달라지는데?"],
  twist: ["여기서 반전이네.", "디테일이 만만치 않은데?", "그럼 우리는?"],
  ending: ["자세한 건 첫 댓글에서!", "결국 관건은 이거네.", "저장해 두고 다시 보자."],
};

function sceneFromSentences(article, sentence) {
  const profile = topicProfile(article);
  const detail = /(숫자|원|%|명|가구)/.test(sentence) ? "a document with charts and highlighted numbers on a desk" : "";
  return detail ? `${profile.scene}, ${detail}` : profile.scene;
}

export function cutPrompt(cut, styleId, article) {
  const style = STYLES.find((item) => item.id === styleId) || STYLES[0];
  const shot = CUT_SHOTS[cut.index - 1] || CUT_SHOTS[0];
  const scene = cut.scene || sceneFromSentences(article, cut.narration || "");
  const subject = cut.visual ? ` of ${cut.visual}` : "";
  return `${shot}${subject}, ${scene}, ${style.prompt}, no text, no letters, no watermark, no logo, no caption, 16:9 composition`;
}

export function buildCuts(article, partnerUrl = "") {
  const pool = sentencePool(article);
  const used = new Set();
  const ranked = scoreSentences(pool).map((item) => item.sentence);
  const ordered = [...pool.slice(0, 2), ...ranked];
  const subtitle = stripDateline(isNoiseLine(article.subtitle) ? "" : clean(article.subtitle));

  const factLine = pick(ordered, used, 1)[0] || shorten(article.subtitle || article.title, 70);
  const twistLine =
    pick(ordered, used, 1, (s) => isIssueSentence(s))[0] || pick(ordered, used, 1)[0] || factLine;
  const endLine =
    pick(ordered, used, 1, (s) => /(계획|예정|전망|신청|확인|필요|중요)/.test(s))[0] ||
    pick(ordered, used, 1)[0] ||
    twistLine;

  const lines = [shorten(article.title, 54), shorten(factLine, 62), shorten(twistLine, 62), shorten(endLine, 62)];

  return ROLE_META.map((meta, index) => {
    const line = lines[index];
    const reaction = REACTIONS[meta.role][index % REACTIONS[meta.role].length];
    const cut = {
      index: index + 1,
      role: meta.role,
      roleLabel: meta.label,
      narration: line,
      dialogue:
        index === 0
          ? shorten(subtitle || reaction, 46)
          : reaction,
      speaker: meta.speaker,
      expression: meta.expression,
      visual: "",
      scene: "",
      aiPrompt: "",
    };
    cut.aiPrompt = cutPrompt(cut, "photo", article);
    return cut;
  });
}

/* ------------------------------------------------------------------ *
 * 3. 카드뉴스 8장
 * ------------------------------------------------------------------ */

const CARD_KINDS = [
  "cover",
  "summary",
  "background",
  "numbers",
  "facts",
  "issue",
  "checklist",
  "cta",
];

const NUMBER_RE =
  /([0-9][0-9,\.]*\s*(?:조|억|만|천)?\s*(?:원|달러|엔|명|가구|개사|개|건|대|배|%|퍼센트|시간|분|년|개월|일|km|㎞|도|톤|kWh|℃))/g;

export function extractNumbers(article) {
  const text = [article.title, article.body].join(" ");
  const found = [];
  let match;
  while ((match = NUMBER_RE.exec(text)) && found.length < 12) {
    const value = clean(match[1]);
    if (!found.some((item) => item.value === value)) found.push({ value, index: match.index });
  }
  return found;
}

function numberLines(article, used, count = 3) {
  const pool = sentencePool(article).filter(isFactSentence);
  const picked = [];
  for (const sentence of pool) {
    if (picked.length >= count) break;
    if (used.has(sentence)) continue;
    const numbers = sentence.match(NUMBER_RE);
    if (!numbers) continue;
    used.add(sentence);
    picked.push({ text: shorten(sentence, 52), highlight: clean(numbers[0]) });
  }
  return picked;
}

/* 카드 장수(4·6·8·10)별 구성. 화면의 장수 칩과 그대로 대응한다. */
export const CARD_COUNTS = [4, 6, 8, 10];

export const CARD_SEQUENCES = {
  4: ["cover", "summary", "facts", "cta"],
  6: ["cover", "summary", "background", "numbers", "issue", "cta"],
  8: ["cover", "summary", "background", "numbers", "facts", "issue", "checklist", "cta"],
  10: ["cover", "summary", "background", "numbers", "facts", "detail", "issue", "comparison", "checklist", "cta"],
};

export const CARD_KIND_LABELS = {
  cover: "표지",
  summary: "3줄 요약",
  background: "배경",
  numbers: "숫자",
  facts: "핵심 팩트",
  detail: "디테일",
  issue: "쟁점",
  comparison: "비교",
  checklist: "체크리스트",
  cta: "CTA",
};

export function buildCards(article, partnerUrl = "", hashtags = null, options = {}) {
  const requested = Number(options && options.count);
  const count = CARD_COUNTS.includes(requested) ? requested : 8;
  const pool = sentencePool(article);
  const used = new Set();
  const ranked = scoreSentences(pool).map((item) => item.sentence);
  const ordered = [...pool.slice(0, 3), ...ranked];
  const tags = hashtags || buildHashtags(article);
  const title = clean(article.title);
  const subtitle = stripDateline(isNoiseLine(article.subtitle) ? "" : clean(article.subtitle));

  const summary = [];
  for (const sentence of ordered) {
    if (summary.length >= 3) break;
    if (used.has(sentence)) continue;
    if (sentence.length < 14) continue;
    used.add(sentence);
    summary.push(shorten(sentence, 54));
  }
  while (summary.length < 3) summary.push(shorten(subtitle || title, 54));

  const background = pick(ordered, used, 2, (s) => !isIssueSentence(s)).map((s) => shorten(s, 58));
  const facts = pick(ordered, used, 3).map((s) => shorten(s, 54));
  const issues = pick(ordered, used, 2, isIssueSentence).map((s) => shorten(s, 60));
  const numbers = numberLines(article, used, 3);

  const impact =
    pick(ordered, used, 1, (s) => /(가구|이용자|소비자|국민|직장인|학생|주민|개인)/.test(s))[0] ||
    facts[0] ||
    summary[0];
  const next =
    pick(ordered, used, 1, (s) => /(신청|시행|예정|계획|발표|확인|필요|부터)/.test(s) && !isIssueSentence(s))[0] ||
    "원문 기사에서 세부 일정과 조건을 확인하세요.";
  const detail = pick(ordered, used, 2).map((s) => shorten(s, 60));

  const byKind = {
    cover: {
      kind: "cover",
      kicker: `${clean(article.site) || "뉴스픽"} · 오늘의 이슈`,
      title: shorten(title, 42),
      lines: [shorten(subtitle || summary[0], 62)],
      footer: tags.slice(0, 3).join(" "),
      badges: tags.slice(0, 3),
    },
    summary: {
      kind: "summary",
      kicker: "3줄 요약",
      title: "한 번에 정리하면",
      lines: summary.map((line) => "· " + line),
      footer: "한 번에 정리",
      badges: ["3줄 요약", clean(article.site) || "뉴스픽"],
    },
    background: {
      kind: "background",
      kicker: "배경",
      title: "왜 지금 나온 이야기일까",
      lines: background.length ? background : summary.slice(0, 2),
      footer: "무슨 일이 있었나",
      badges: ["배경", "맥락"],
    },
    numbers: {
      kind: "numbers",
      kicker: "숫자로 보기",
      title: numbers.length ? "이 숫자만 보면 됩니다" : "핵심 수치",
      lines: numbers.length ? numbers.map((item) => item.text) : summary.map((line) => line),
      numbers,
      footer: "기사에 나온 숫자 그대로",
      badges: numbers.slice(0, 3).map((item) => item.highlight),
    },
    facts: {
      kind: "facts",
      kicker: "핵심 팩트",
      title: count === 4 ? "핵심 숫자와 사실" : "놓치면 안 되는 사실",
      lines: count === 4 && numbers.length ? numbers.map((item) => item.text) : facts.length ? facts : summary,
      numbers: count === 4 ? numbers : [],
      footer: "핵심 팩트 3",
      badges: ["핵심", "팩트"],
    },
    detail: {
      kind: "detail",
      kicker: "디테일",
      title: "숫자 뒤의 이야기",
      lines: detail.length ? detail : facts.slice(0, 2),
      footer: "한 걸음 더 들어가면",
      badges: ["디테일", "맥락"],
    },
    issue: {
      kind: "issue",
      kicker: "쟁점",
      title: "갈리는 지점은 여기",
      lines: issues.length ? issues : [summary[2] || summary[0]],
      footer: "찬반이 갈리는 이유",
      badges: ["쟁점", "찬반"],
    },
    comparison: {
      kind: "comparison",
      kicker: "비교",
      title: "달라지는 것 · 그대로인 것",
      lines: [
        "달라짐 — " + shorten(facts[0] || summary[0], 46),
        "그대로 — " + shorten(issues[1] || issues[0] || summary[2], 46),
        "다음 확인 — " + shorten(next, 46),
      ],
      footer: "무엇이 바뀌고 무엇이 남나",
      badges: ["달라짐", "그대로"],
    },
    checklist: {
      kind: "checklist",
      kicker: "한 줄 정리",
      title: "내 기준 체크리스트",
      lines: [
        "✔ 오늘 알아둘 것 — " + shorten(summary[0], 44),
        "✔ 내게 미치는 영향 — " + shorten(impact, 44),
        "✔ 다음에 확인할 것 — " + shorten(next, 44),
      ],
      footer: "저장해 두고 다시 보기",
      badges: ["체크", "요약"],
    },
    cta: {
      kind: "cta",
      kicker: "원문 보기",
      title: "전체 기사는 첫 댓글에서",
      lines: [
        "프로필 링크 · 첫 댓글에 원문 링크를 달아 두었습니다.",
        partnerUrl ? shorten(partnerUrl, 64) : "파트너 코드를 넣으면 내 뉴스픽 링크로 바뀝니다.",
      ],
      footer: tags.slice(0, 5).join(" "),
      badges: tags.slice(0, 3),
    },
  };

  return CARD_SEQUENCES[count].map((kind, index) => ({
    ...byKind[kind],
    no: index + 1,
    index,
    kindLabel: CARD_KIND_LABELS[kind] || kind,
  }));
}

/* ------------------------------------------------------------------ *
 * 4. 6개 채널 업로드 패키지
 * ------------------------------------------------------------------ */

export const PLATFORMS = [
  { id: "threads", name: "쓰레드", en: "Threads", emoji: "🧵", limit: 500, color: "#8b5cf6" },
  { id: "instagram", name: "인스타그램", en: "Instagram", emoji: "📸", limit: 2200, color: "#e1306c" },
  { id: "facebook", name: "페이스북", en: "Facebook", emoji: "📘", limit: 2000, color: "#1877f2" },
  { id: "x", name: "X", en: "X (Twitter)", emoji: "✖️", limit: 280, color: "#e7e9ea" },
  { id: "tiktok", name: "틱톡", en: "TikTok", emoji: "🎵", limit: 2200, color: "#25f4ee" },
  { id: "youtube", name: "유튜브 쇼츠", en: "YouTube Shorts", emoji: "▶️", limit: 5000, color: "#ff0033" },
];

function joinBlocks(blocks) {
  return blocks.filter((block) => block && block.trim()).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function fitBlocks(blocks, limit, shrink) {
  let text = joinBlocks(blocks);
  let level = 0;
  while (text.length > limit && level < 8) {
    level += 1;
    text = joinBlocks(shrink(blocks, level));
  }
  return text.slice(0, limit);
}

export function buildChannels(article, cards, partnerUrl = "") {
  const tags = buildHashtags(article);
  const title = clean(article.title);
  const summary = (cards.find((card) => card.kind === "summary")?.lines || []).map((line) => line.replace(/^·\s*/, ""));
  const issueLine = (cards.find((card) => card.kind === "issue")?.lines || [])[0] || summary[0] || "";
  const url = partnerUrl || article.partnerUrl || article.url || "";
  const linkNote = url
    ? `→ 전체 기사: ${url}`
    : "→ 파트너 코드를 넣으면 여기에 내 뉴스픽 링크가 들어갑니다.";
  const hash = tags.slice(0, 6).join(" ");
  const out = {};

  /* 쓰레드 */
  out.threads = {
    id: "threads",
    limit: 500,
    body: fitBlocks(
      [
        shorten(title, 80),
        summary.slice(0, 3).map((line) => "· " + shorten(line, 56)).join("\n"),
        "↓ 전체 기사는 첫 번째 댓글 링크에서 확인하세요.",
        hash,
      ],
      500,
      (blocks, level) => [
        blocks[0],
        level < 3 ? blocks[1].split("\n").slice(0, 3 - level).join("\n") : "",
        blocks[2],
        level > 5 ? "" : blocks[3],
      ]
    ),
    firstComment: linkNote,
    intentUrl: "https://www.threads.net/intent/post?text=",
    tips: ["이미지는 4:5 카드뉴스나 4컷 합본을 첨부하세요.", "첫 댓글에 원문 링크를 달면 도달이 안정적입니다."],
  };

  /* X */
  const xBody = fitBlocks(
    [
      shorten(title, 64),
      shorten(summary[0] || issueLine, 60),
      "원문 링크는 첫 댓글 ↓",
      tags.slice(0, 2).join(" "),
    ],
    280,
    (blocks, level) => [shorten(blocks[0], Math.max(24, 64 - level * 8)), level < 2 ? blocks[1] : "", blocks[2], level < 2 ? blocks[3] : ""]
  );
  out.x = {
    id: "x",
    limit: 280,
    body: xBody,
    chars: xBody.length,
    firstComment: linkNote,
    intentUrl: "https://x.com/intent/tweet?text=",
    tips: ["280자 제한 — 링크는 첫 댓글에 넣어 본문을 살립니다.", "이미지는 4장까지 첨부됩니다."],
  };

  /* 인스타그램 */
  const igTags = buildHashtags(article, ["카드뉴스", "뉴스스타그램", "오늘의뉴스", "정보", "이슈", "reels", "news"]).slice(0, 20);
  out.instagram = {
    id: "instagram",
    limit: 2200,
    body: fitBlocks(
      [
        shorten(title, 90),
        summary.map((line) => "· " + shorten(line, 60)).join("\n"),
        shorten(issueLine, 90),
        "카드 8장으로 정리했습니다. 넘겨서 확인하세요 👉",
        "전체 기사는 프로필 링크와 첫 댓글에서 볼 수 있습니다.",
        igTags.join(" "),
      ],
      2200,
      (blocks) => blocks
    ),
    firstComment: linkNote + "\n" + tags.slice(0, 4).join(" "),
    shareUrl: url ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` : "",
    tips: ["캐러셀은 4:5(1080×1350) 카드뉴스 8장을 순서대로 올리세요.", "첫 댓글에 원문 링크를 고정하세요."],
  };

  /* 페이스북 */
  out.facebook = {
    id: "facebook",
    limit: 2000,
    body: fitBlocks(
      [
        shorten(title, 100),
        summary.slice(0, 2).map((line) => "· " + shorten(line, 64)).join("\n"),
        shorten(issueLine, 100),
        "자세한 내용은 첫 댓글의 원문 링크에서 확인하세요.",
        tags.slice(0, 4).join(" "),
      ],
      2000,
      (blocks) => blocks
    ),
    firstComment: linkNote,
    shareUrl: url ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` : "",
    tips: ["링크 미리보기보다 카드 이미지가 크게 보입니다.", "첫 댓글에 링크를 달면 도달이 좋습니다."],
  };

  /* 틱톡 */
  out.tiktok = {
    id: "tiktok",
    limit: 2200,
    body: fitBlocks(
      [
        shorten(title, 80),
        "8장 카드로 30초 안에 정리했습니다.",
        summary.slice(0, 3).map((line) => "· " + shorten(line, 44)).join("\n"),
        "전체 기사는 프로필 링크 / 첫 댓글에서.",
        buildHashtags(article, ["틱톡", "뉴스", "shorts", "fyp"]).slice(0, 10).join(" "),
      ],
      2200,
      (blocks) => blocks
    ),
    firstComment: linkNote,
    video: { ratio: "9:16", width: 1080, height: 1920 },
    tips: ["9:16 카드뉴스 8장으로 자동 슬라이드 영상(.webm)을 만듭니다.", "첫 2초에 표지 카드가 나오도록 구성했습니다."],
  };

  /* 유튜브 쇼츠 */
  const ytTitle = shorten(title, 82).replace(/#\S+/g, "").trim() + " #Shorts";
  out.youtube = {
    id: "youtube",
    limit: 5000,
    title: ytTitle.slice(0, 100),
    body: fitBlocks(
      [
        shorten(title, 90),
        "3줄 요약\n" + summary.map((line) => "· " + shorten(line, 54)).join("\n"),
        shorten(issueLine, 110),
        "원문 기사: " + (url || "파트너 코드를 넣으면 자동으로 채워집니다."),
        buildHashtags(article, ["Shorts", "쇼츠", "뉴스요약"]).slice(0, 8).join(" "),
      ],
      5000,
      (blocks) => blocks
    ),
    firstComment: linkNote,
    video: { ratio: "9:16", width: 1080, height: 1920 },
    tips: ["제목에 #Shorts 를 넣어야 쇼츠로 분류됩니다.", "9:16 영상(.webm)을 그대로 업로드하면 됩니다."],
  };

  for (const platform of PLATFORMS) {
    const pack = out[platform.id];
    pack.name = platform.name;
    pack.emoji = platform.emoji;
    pack.chars = (pack.body || "").length;
    pack.hashtags = (pack.body || "").match(/#[^\s#]+/g) || [];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 5. 한 번에 만들기
 * ------------------------------------------------------------------ */

export function buildStoryboard(article, options = {}) {
  const partnerUrl = options.partnerUrl || article.partnerUrl || "";
  const hashtags = buildHashtags(article);
  const cuts = buildCuts(article, partnerUrl);
  const cards = buildCards(article, partnerUrl, hashtags, { count: options.cardCount || 8 });
  const channels = buildChannels(article, cards, partnerUrl);
  return { cuts, cards, channels, hashtags, partnerUrl };
}

/* 4컷 이미지 소스 모드 */
export const IMAGE_MODES = [
  { id: "ai", name: "AI 알아서 생성", emoji: "✨", hint: "스타일에 맞춰 AI가 컷마다 새 이미지를 만듭니다." },
  { id: "article", name: "기사 내 이미지 사용", emoji: "🖼️", hint: "기사 대표·본문 이미지를 컷에 배치하고, 모자란 컷은 AI/Canvas로 채웁니다." },
];

export function partnerLinkFor(article, partnerCode) {
  const code = clean(partnerCode);
  const base = clean(article.partnerUrl || article.url);
  if (!base) return "";
  if (!code) return base;
  try {
    const url = new URL(base);
    url.searchParams.set("pn", code);
    return url.toString();
  } catch (e) {
    return base;
  }
}

/* ------------------------------------------------------------------ *
 * 6. ZIP (무압축 store) — 카드 8장 일괄 저장
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

/** files: [{name, data: Uint8Array}] → ZIP 바이트 */
export function buildZip(files, now = new Date()) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centrals = [];
  let offset = 0;
  const { time, day } = dosDateTime(now);

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, day, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, day, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let position = 0;
  for (const part of [...chunks, ...centrals, end]) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}
