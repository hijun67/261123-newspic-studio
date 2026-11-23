/* 뉴스픽 스튜디오 | 카드뉴스 8장 렌더러
 * - 테마 4종: 매거진 에디토리얼 · 다크 테크 · 경제 인포그래픽 · 파스텔 데일리
 * - 비율 2종: 4:5 (1080×1350, 인스타·쓰레드) / 9:16 (1080×1920, 틱톡·쇼츠)
 * - 카드 종류 8가지(표지·요약·배경·숫자·팩트·쟁점·체크리스트·CTA)에 맞춰 레이아웃을 바꾼다.
 */
import { font, fitText, roundRect, wrapLines } from "./canvas.js";

const FONT_SERIF = "'Nanum Myeongjo','Noto Serif KR',Georgia,serif";

export const CARD_THEMES = {
  magazine: {
    id: "magazine",
    name: "매거진 에디토리얼",
    bg: "#f4efe4",
    panel: "#fffdf8",
    ink: "#1b1a17",
    muted: "#7a7466",
    accent: "#c0442c",
    accentInk: "#fff8f2",
    line: "#d8cfbd",
    titleFont: FONT_SERIF,
    pattern: "rule",
  },
  dark: {
    id: "dark",
    name: "다크 테크",
    bg: "#080b11",
    panel: "#101623",
    ink: "#f2f6ff",
    muted: "#8d9ab0",
    accent: "#4ade80",
    accent2: "#38bdf8",
    accentInk: "#04140a",
    line: "#22304a",
    titleFont: "",
    pattern: "grid",
  },
  econ: {
    id: "econ",
    name: "경제 인포그래픽",
    bg: "#ffffff",
    panel: "#f4f7fb",
    ink: "#0d2340",
    muted: "#5c7290",
    accent: "#e11d48",
    accent2: "#1d4ed8",
    accentInk: "#ffffff",
    line: "#d7e1ee",
    titleFont: "",
    pattern: "chart",
  },
  pastel: {
    id: "pastel",
    name: "파스텔 데일리",
    bg: "#fdf3f7",
    panel: "#ffffff",
    ink: "#3b2a37",
    muted: "#9b8494",
    accent: "#e8618f",
    accent2: "#8b7cf6",
    accentInk: "#ffffff",
    line: "#f0dbe5",
    titleFont: "",
    pattern: "blob",
  },
};

export function cardTheme(id) {
  return CARD_THEMES[id] || CARD_THEMES.magazine;
}

export function ratioInfo(ratio) {
  if (ratio === "9:16") return { id: "9:16", width: 1080, height: 1920, label: "9:16 · 틱톡·쇼츠" };
  return { id: "4:5", width: 1080, height: 1350, label: "4:5 · 인스타·쓰레드" };
}

/* ------------------------------------------------------------------ *
 * 공통 장식
 * ------------------------------------------------------------------ */

function paintPattern(ctx, w, h, theme) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  if (theme.pattern === "rule") {
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1.5;
    for (let y = 160; y < h; y += 96) {
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(w - 64, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(192,68,44,0.07)";
    ctx.beginPath();
    ctx.arc(w * 0.92, h * 0.08, 240, 0, Math.PI * 2);
    ctx.fill();
  } else if (theme.pattern === "grid") {
    ctx.strokeStyle = "rgba(74,222,128,0.08)";
    ctx.lineWidth = 1.5;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(w * 0.82, h * 0.14, 0, w * 0.82, h * 0.14, 520);
    glow.addColorStop(0, "rgba(56,189,248,0.22)");
    glow.addColorStop(1, "rgba(56,189,248,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  } else if (theme.pattern === "chart") {
    ctx.strokeStyle = "rgba(29,78,216,0.08)";
    ctx.lineWidth = 2;
    for (let y = h * 0.2; y < h; y += 74) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(225,29,72,0.06)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.72);
    for (let x = 0; x <= w; x += w / 8) {
      ctx.lineTo(x, h * (0.72 - 0.18 * Math.sin(x / w * Math.PI * 1.4)));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  } else {
    const g1 = ctx.createRadialGradient(w * 0.15, h * 0.1, 0, w * 0.15, h * 0.1, 420);
    g1.addColorStop(0, "rgba(232,97,143,0.18)");
    g1.addColorStop(1, "rgba(232,97,143,0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createRadialGradient(w * 0.9, h * 0.9, 0, w * 0.9, h * 0.9, 480);
    g2.addColorStop(0, "rgba(139,124,246,0.18)");
    g2.addColorStop(1, "rgba(139,124,246,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function drawHeader(ctx, w, pad, theme, card) {
  const y = pad;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  // kicker chip
  ctx.font = font(30, 800);
  const label = (card.kicker || "").toUpperCase();
  const labelText = /^[A-Z0-9 ]+$/.test(label) ? label : card.kicker;
  const chipW = Math.min(w - pad * 2 - 220, ctx.measureText(labelText).width + 56);
  ctx.fillStyle = theme.accent;
  roundRect(ctx, pad, y, chipW, 62, 31);
  ctx.fill();
  ctx.fillStyle = theme.accentInk;
  ctx.fillText(labelText, pad + 28, y + 33);

  ctx.textAlign = "right";
  ctx.fillStyle = theme.muted;
  ctx.font = font(26, 700);
  ctx.fillText("뉴스픽 스튜디오", w - pad, y + 32);
  ctx.restore();
}

function drawFooter(ctx, w, h, pad, theme, card, total = 8) {
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = theme.muted;
  ctx.font = font(24, 600);
  const foot = String(card.footer || "").slice(0, 46);
  ctx.fillText(foot, pad, h - pad * 0.72);

  // 진행 점
  const dotY = h - pad * 0.72;
  const count = total;
  const dotR = 5;
  const gap = 22;
  const startX = w - pad - (count - 1) * gap;
  for (let i = 0; i < count; i += 1) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = i === (card.no || 1) - 1 ? theme.accent : theme.line;
    ctx.fill();
  }

  ctx.textAlign = "right";
  ctx.fillStyle = theme.accent;
  ctx.font = font(26, 800);
  ctx.fillText(String(card.no || 1).padStart(2, "0") + " / " + String(total).padStart(2, "0"), startX - 34, dotY);
  ctx.restore();
}

function drawUnderline(ctx, x, y, width, theme) {
  ctx.fillStyle = theme.accent;
  ctx.fillRect(x, y, Math.min(width, 120), 8);
}

/* ------------------------------------------------------------------ *
 * 카드 종류별 본문
 * ------------------------------------------------------------------ */

function drawCover(ctx, w, h, pad, theme, card, imageEl) {
  if (imageEl && imageEl.naturalWidth) {
    const scale = Math.max(w / imageEl.naturalWidth, h / imageEl.naturalHeight);
    const dw = imageEl.naturalWidth * scale;
    const dh = imageEl.naturalHeight * scale;
    ctx.drawImage(imageEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const shade = ctx.createLinearGradient(0, h * 0.2, 0, h);
    shade.addColorStop(0, "rgba(6,10,16,0.12)");
    shade.addColorStop(0.45, "rgba(6,10,16,0.72)");
    shade.addColorStop(1, "rgba(6,10,16,0.94)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    theme = { ...theme, ink: "#ffffff", muted: "rgba(255,255,255,0.74)", line: "rgba(255,255,255,0.3)", accent: theme.accent };
  } else {
    // 표지 아트 패널
    const panelTop = pad + 74;
    const panelBottom = h * 0.4;
    const panelH = Math.max(180, panelBottom - panelTop);
    ctx.save();
    ctx.fillStyle = theme.panel;
    ctx.fillRect(pad, panelTop, w - pad * 2, panelH);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, panelTop, w - pad * 2, panelH);
    ctx.beginPath();
    ctx.rect(pad, panelTop, w - pad * 2, panelH);
    ctx.clip();

    // 큰 숫자 워터마크
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.1;
    ctx.font = font(Math.round(panelH * 0.92), 900);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("08", w - pad - 24, panelTop + panelH * 0.52);
    ctx.globalAlpha = 1;

    // 막대 그래프
    const barBase = panelTop + panelH - 34;
    for (let i = 0; i < 5; i += 1) {
      const barH = 26 + i * (panelH * 0.085);
      ctx.fillStyle = i === 4 ? theme.accent : theme.line;
      ctx.fillRect(pad + 46 + i * 34, barBase - barH, 20, barH);
    }
    // 원 + 대각선
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(pad + 46 + 5 * 34 + 56, barBase - panelH * 0.34, Math.round(panelH * 0.19), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pad, panelTop + panelH * 0.32);
    ctx.lineTo(w - pad, panelTop + panelH * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const topY = imageEl ? pad + 16 : pad + 18;
  ctx.font = font(27, 800);
  ctx.fillStyle = theme.accent;
  ctx.fillText("CARD NEWS · 8", pad, topY);
  ctx.textAlign = "right";
  ctx.fillStyle = theme.muted;
  ctx.font = font(25, 600);
  ctx.fillText(card.kicker || "뉴스픽", w - pad, topY);
  ctx.textAlign = "left";

  const titleTop = imageEl ? h * 0.4 : h * 0.46;
  const titleSize = Math.round(h * 0.046);
  const title = fitText(ctx, card.title, {
    maxWidth: w - pad * 2,
    maxLines: 3,
    size: titleSize,
    minSize: 38,
    weight: 800,
    ratio: 1.22,
  });
  ctx.fillStyle = theme.ink;
  ctx.textAlign = "left";
  title.lines.forEach((line, i) => {
    ctx.font = theme.titleFont ? `800 ${title.size}px ${theme.titleFont}` : font(title.size, 800);
    ctx.fillText(line, pad, titleTop + i * title.lineHeight);
  });

  let cursor = titleTop + title.lines.length * title.lineHeight + 16;
  drawUnderline(ctx, pad, cursor, 110, theme);
  cursor += 30;

  const sub = fitText(ctx, (card.lines || []).join(" "), {
    maxWidth: w - pad * 2,
    maxLines: 2,
    size: 32,
    minSize: 22,
    weight: 600,
    ratio: 1.42,
  });
  ctx.fillStyle = imageEl ? "rgba(255,255,255,0.86)" : theme.muted;
  ctx.font = font(sub.size, 600);
  sub.lines.forEach((line, i) => ctx.fillText(line, pad, cursor + i * sub.lineHeight));
  cursor += sub.lines.length * sub.lineHeight;

  if (cursor < h - pad * 2.15) {
    ctx.fillStyle = theme.muted;
    ctx.font = font(26, 700);
    ctx.fillText("옆으로 넘겨서 30초 정리 보기 →", pad, h - pad * 2.05);
  }
  ctx.restore();
}

function drawSummary(ctx, w, h, pad, theme, card) {
  const title = fitText(ctx, card.title, { maxWidth: w - pad * 2, maxLines: 2, size: 62, minSize: 40, weight: 800 });
  let y = pad + 110;
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  title.lines.forEach((line, i) => ctx.fillText(line, pad, y + i * title.lineHeight));
  y += title.lines.length * title.lineHeight + 18;
  drawUnderline(ctx, pad, y, 120, theme);
  y += 52;

  const items = card.lines || [];
  const boxH = Math.min(310, (h - y - pad * 1.6) / Math.max(items.length, 1) - 22);
  items.forEach((line, index) => {
    const top = y + index * (boxH + 22);
    ctx.fillStyle = theme.panel;
    roundRect(ctx, pad, top, w - pad * 2, boxH, 26);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(pad + 64, top + boxH / 2, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.accentInk;
    ctx.font = font(32, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), pad + 64, top + boxH / 2 + 1);
    ctx.textAlign = "left";

    const body = fitText(ctx, line.replace(/^·\s*/, ""), {
      maxWidth: w - pad * 2 - 150,
      maxLines: 3,
      size: 36,
      minSize: 24,
      weight: 700,
      ratio: 1.36,
    });
    ctx.fillStyle = theme.ink;
    ctx.font = font(body.size, 700);
    const bodyTop = top + boxH / 2 - ((body.lines.length - 1) * body.lineHeight) / 2;
    body.lines.forEach((text, i) => ctx.fillText(text, pad + 120, bodyTop + i * body.lineHeight));
  });
}

function drawLines(ctx, w, h, pad, theme, card, opts = {}) {
  const title = fitText(ctx, card.title, { maxWidth: w - pad * 2, maxLines: 2, size: 60, minSize: 40, weight: 800 });
  let y = pad + 112;
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  title.lines.forEach((line, i) => ctx.fillText(line, pad, y + i * title.lineHeight));
  y += title.lines.length * title.lineHeight + 16;
  drawUnderline(ctx, pad, y, 120, theme);
  y += 56;

  const items = (card.lines || []).slice(0, opts.maxItems || 3);
  const area = h - pad * 1.7 - y;
  const gap = 20;
  const rowH = Math.min(300, Math.max(96, (area - gap * (items.length - 1)) / Math.max(items.length, 1)));

  items.forEach((line, index) => {
    const top = y + index * (rowH + gap);
    if (opts.boxed !== false) {
      ctx.fillStyle = theme.panel;
      roundRect(ctx, pad, top, w - pad * 2, rowH, 22);
      ctx.fill();
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = theme.accent;
    ctx.fillRect(pad + 6, top + 20, 8, rowH - 40);

    const body = fitText(ctx, String(line).replace(/^✔\s*/, ""), {
      maxWidth: w - pad * 2 - 110,
      maxLines: 3,
      size: 38,
      minSize: 24,
      weight: 700,
      ratio: 1.38,
    });
    ctx.fillStyle = theme.ink;
    ctx.font = font(body.size, 700);
    const bodyTop = top + rowH / 2 - ((body.lines.length - 1) * body.lineHeight) / 2;
    body.lines.forEach((text, i) => ctx.fillText(text, pad + 44, bodyTop + i * body.lineHeight));
  });
}

function drawNumbers(ctx, w, h, pad, theme, card) {
  const title = fitText(ctx, card.title, { maxWidth: w - pad * 2, maxLines: 2, size: 58, minSize: 38, weight: 800 });
  let y = pad + 112;
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  title.lines.forEach((line, i) => ctx.fillText(line, pad, y + i * title.lineHeight));
  y += title.lines.length * title.lineHeight + 16;
  drawUnderline(ctx, pad, y, 120, theme);
  y += 60;

  const numbers = (card.numbers || []).slice(0, 3);
  const area = h - pad * 1.7 - y;
  const gap = 22;
  const rowH = Math.min(300, (area - gap * (numbers.length - 1)) / Math.max(numbers.length, 1));

  numbers.forEach((item, index) => {
    const top = y + index * (rowH + gap);
    ctx.fillStyle = theme.panel;
    roundRect(ctx, pad, top, w - pad * 2, rowH, 24);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.accent;
    ctx.font = font(Math.min(64, rowH * 0.34), 800);
    ctx.textAlign = "left";
    const value = String(item.highlight || "").slice(0, 12);
    ctx.fillText(value, pad + 40, top + rowH * 0.32);

    const text = fitText(ctx, item.text, {
      maxWidth: w - pad * 2 - 80,
      maxLines: 2,
      size: 32,
      minSize: 22,
      weight: 600,
      ratio: 1.34,
    });
    ctx.fillStyle = theme.muted;
    ctx.font = font(text.size, 600);
    text.lines.forEach((line, i) => ctx.fillText(line, pad + 40, top + rowH * 0.7 + i * text.lineHeight - 6));
  });
}

function drawChecklist(ctx, w, h, pad, theme, card) {
  const title = fitText(ctx, card.title, { maxWidth: w - pad * 2, maxLines: 2, size: 58, minSize: 38, weight: 800 });
  let y = pad + 112;
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  title.lines.forEach((line, i) => ctx.fillText(line, pad, y + i * title.lineHeight));
  y += title.lines.length * title.lineHeight + 16;
  drawUnderline(ctx, pad, y, 120, theme);
  y += 60;

  const items = (card.lines || []).slice(0, 4);
  const area = h - pad * 1.7 - y;
  const gap = 22;
  const rowH = Math.min(260, (area - gap * (items.length - 1)) / Math.max(items.length, 1));
  items.forEach((line, index) => {
    const top = y + index * (rowH + gap);
    ctx.fillStyle = theme.panel;
    roundRect(ctx, pad, top, w - pad * 2, rowH, 24);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 6;
    roundRect(ctx, pad + 32, top + rowH / 2 - 24, 48, 48, 12);
    ctx.stroke();
    // 체크
    ctx.beginPath();
    ctx.moveTo(pad + 44, top + rowH / 2);
    ctx.lineTo(pad + 56, top + rowH / 2 + 12);
    ctx.lineTo(pad + 74, top + rowH / 2 - 14);
    ctx.lineWidth = 6;
    ctx.stroke();

    const body = fitText(ctx, String(line).replace(/^✔\s*/, ""), {
      maxWidth: w - pad * 2 - 150,
      maxLines: 3,
      size: 36,
      minSize: 24,
      weight: 700,
      ratio: 1.36,
    });
    ctx.fillStyle = theme.ink;
    ctx.font = font(body.size, 700);
    const bodyTop = top + rowH / 2 - ((body.lines.length - 1) * body.lineHeight) / 2;
    body.lines.forEach((text, i) => ctx.fillText(text, pad + 108, bodyTop + i * body.lineHeight));
  });
}

function drawCta(ctx, w, h, pad, theme, card) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.22, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.accentInk;
  ctx.font = font(64, 800);
  ctx.fillText("↓", w / 2, h * 0.22 - 36);

  const title = fitText(ctx, card.title, {
    maxWidth: w - pad * 2,
    maxLines: 3,
    size: 78,
    minSize: 46,
    weight: 800,
    ratio: 1.22,
  });
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  const titleTop = h * 0.35;
  title.lines.forEach((line, i) => ctx.fillText(line, w / 2, titleTop + i * title.lineHeight));

  let y = titleTop + title.lines.length * title.lineHeight + 40;
  const lines = card.lines || [];
  ctx.font = font(34, 600);
  ctx.fillStyle = theme.muted;
  const first = fitText(ctx, lines[0] || "", { maxWidth: w - pad * 2 - 80, maxLines: 2, size: 34, minSize: 22, weight: 600, ratio: 1.38 });
  first.lines.forEach((line, i) => ctx.fillText(line, w / 2, y + i * first.lineHeight));
  y += first.lines.length * first.lineHeight + 34;

  if (lines[1]) {
    const link = wrapLines(ctx, String(lines[1]), w - pad * 2 - 120, 2);
    const boxH = 118;
    ctx.fillStyle = theme.ink;
    roundRect(ctx, pad + 30, y, w - pad * 2 - 60, boxH, 24);
    ctx.fill();
    ctx.fillStyle = theme.bg === "#080b11" ? "#04140a" : "#ffffff";
    ctx.font = font(26, 700);
    link.forEach((line, i) => ctx.fillText(line, w / 2, y + 26 + i * 34));
    y += boxH + 38;
  }

  ctx.fillStyle = theme.muted;
  ctx.font = font(27, 700);
  ctx.fillText("프로필 링크도 같은 기사로 연결됩니다", w / 2, y);

  // 하단 미니 카드 8장 표시
  const stripY = h - pad * 2.55;
  const cardW = 44;
  const gap = 14;
  const totalW = 8 * cardW + 7 * gap;
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i === 0 ? theme.accent : theme.line;
    roundRect(ctx, w / 2 - totalW / 2 + i * (cardW + gap), stripY, cardW, 62, 8);
    ctx.fill();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 카드 1장
 * ------------------------------------------------------------------ */

export function drawCard(ctx, w, h, card, themeId, imageEl, opts = {}) {
  const theme = cardTheme(themeId);
  const pad = Math.round(w * 0.075);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  if (card.kind === "cover") {
    // 표지는 배경을 직접 칠한다
    if (imageEl && imageEl.naturalWidth) {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, w, h);
    } else {
      paintPattern(ctx, w, h, theme);
    }
    drawCover(ctx, w, h, pad, theme, card, imageEl);
    drawFooter(ctx, w, h, pad, theme, card, opts.total || 8);
    ctx.restore();
    return;
  }

  paintPattern(ctx, w, h, theme);
  drawHeader(ctx, w, pad, theme, card);

  if (card.kind === "summary") drawSummary(ctx, w, h, pad, theme, card);
  else if (card.kind === "numbers") drawNumbers(ctx, w, h, pad, theme, card);
  else if (card.kind === "checklist") drawChecklist(ctx, w, h, pad, theme, card);
  else if (card.kind === "cta") drawCta(ctx, w, h, pad, theme, card);
  else drawLines(ctx, w, h, pad, theme, card);

  drawFooter(ctx, w, h, pad, theme, card, opts.total || 8);
  ctx.restore();
}

export function renderCardCanvas(card, themeId, ratio, imageEl, opts = {}) {
  const info = ratioInfo(ratio);
  const canvas = document.createElement("canvas");
  canvas.width = info.width;
  canvas.height = info.height;
  const ctx = canvas.getContext("2d");
  drawCard(ctx, info.width, info.height, card, themeId, imageEl, opts);
  return canvas;
}

export function canvasToBlob(canvas, type = "image/png", quality = 0.95) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

export function canvasToBytes(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      const buffer = await blob.arrayBuffer();
      resolve(new Uint8Array(buffer));
    }, "image/png");
  });
}
