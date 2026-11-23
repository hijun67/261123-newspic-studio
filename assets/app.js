/* 뉴스픽 스튜디오 | 화면 컨트롤러
 * 1) 미러링 허브 → 2) 4컷 → 3) 카드뉴스 8장 → 4) 6개 채널
 */
import {
  PLATFORMS,
  STYLES,
  buildChannels,
  buildHashtags,
  buildStoryboard,
  buildZip,
  cutPrompt,
  partnerLinkFor,
  isNoiseLine,
  shorten,
} from "./plan.js";
import { loadImage, renderCutCanvas, renderSheet, styleTheme } from "./canvas.js";
import { canvasToBytes, ratioInfo, renderCardCanvas } from "./cards.js";
import { recordSlideshow, videoSupported } from "./video.js";

const LS = {
  prefs: "newspic-studio:prefs",
  byok: "newspic-studio:byok",
  archive: "newspic-studio:archive",
  last: "newspic-studio:last-article",
};

const KIND_LABEL = {
  cover: "표지 훅",
  summary: "3줄 요약",
  background: "배경",
  numbers: "숫자",
  facts: "핵심 팩트",
  issue: "쟁점",
  checklist: "체크리스트",
  cta: "CTA",
};

const state = {
  article: null,
  cuts: [],
  cards: [],
  baseCards: [],
  channels: {},
  activePlatform: "threads",
  style: "photo",
  layout: "grid",
  cardTheme: "magazine",
  ratio: "4:5",
  activeCard: 0,
  images: {},
  imageMeta: {},
  articleImageEl: null,
  partnerCode: "",
  storage: "unknown",
  archive: [],
  byok: { provider: "free", openai: "", gemini: "", model: "" },
  slideshowUrl: "",
  busy: false,
};

/* ------------------------------------------------------------------ *
 * 작은 도구
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function toast(message, kind = "") {
  const node = $("toast");
  node.textContent = message;
  node.className = "toast " + kind;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.hidden = true;
  }, 3600);
}

async function api(path, options = {}) {
  const init = { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } };
  const response = await fetch(path, init);
  let data = {};
  try {
    data = await response.json();
  } catch (e) {
    data = {};
  }
  return { status: response.status, data };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 6000);
}

async function copyText(text, message = "복사했습니다.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, "ok");
    return true;
  } catch (e) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      toast(ok ? message : "복사하지 못했습니다. 직접 선택해 주세요.", ok ? "ok" : "err");
      return ok;
    } catch (error) {
      toast("복사하지 못했습니다. 직접 선택해 주세요.", "err");
      return false;
    }
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function todayStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function setProgress(node, fraction, visible = true) {
  node.hidden = !visible;
  const bar = node.querySelector(".bar");
  const label = node.querySelector("span");
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  if (bar) bar.style.setProperty("--p", percent + "%");
  if (label) label.textContent = percent + "%";
}

function kindLabel(kind) {
  return KIND_LABEL[kind] || kind;
}

/* ------------------------------------------------------------------ *
 * 탭
 * ------------------------------------------------------------------ */

function showTab(name) {
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  $$(".panel").forEach((panel) => {
    const active = panel.id === "tab-" + name;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ------------------------------------------------------------------ *
 * 아카이브 (KV 또는 브라우저)
 * ------------------------------------------------------------------ */

function localArchive() {
  return readJson(LS.archive, []);
}

function saveLocalArticle(article) {
  const items = localArchive().filter((item) => item.id !== article.id);
  items.unshift(article);
  writeJson(LS.archive, items.slice(0, 40));
}

function removeLocalArticle(id) {
  writeJson(LS.archive, localArchive().filter((item) => item.id !== id));
}

function setStoragePill() {
  const pill = $("storagePill");
  if (state.storage === "kv") {
    pill.textContent = "아카이브 · KV";
    pill.className = "pill";
    pill.title = "Cloudflare KV(newspic-studio-kv)에 저장됩니다.";
  } else if (state.storage === "local") {
    pill.textContent = "아카이브 · 브라우저";
    pill.className = "pill local";
    pill.title = "KV 연결이 없어 이 브라우저(localStorage)에 저장합니다.";
  } else {
    pill.textContent = "아카이브 확인 중…";
    pill.className = "pill";
  }
}

async function refreshArchive(query = "") {
  const term = query.trim();
  const result = await api("/api/mirror" + (term ? "?q=" + encodeURIComponent(term) : ""));
  if (result.data.ok && result.data.storage === "kv") {
    state.storage = "kv";
    state.archive = result.data.items || [];
  } else {
    state.storage = "local";
    const items = localArchive();
    state.archive = term
      ? items.filter((item) => [item.title, item.subtitle, item.site, item.body].join(" ").toLowerCase().includes(term.toLowerCase()))
      : items;
  }
  setStoragePill();
  renderArchive(term);
}

function renderArchive(term = "") {
  const list = $("archiveList");
  list.textContent = "";
  const items = state.archive;
  $("archiveCount").textContent = items.length ? `${items.length}건` : "0";
  $("archiveEmpty").hidden = items.length > 0;
  if (term && !items.length) $("archiveEmpty").textContent = "검색 결과가 없습니다.";

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "archive-item" + (state.article && state.article.id === item.id ? " active" : "");
    li.dataset.id = item.id;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", item.title + " 열기");

    const title = document.createElement("h4");
    title.textContent = item.title || "(제목 없음)";
    const meta = document.createElement("div");
    meta.className = "meta";
    const site = document.createElement("span");
    site.textContent = item.site || "직접 입력";
    const dot = document.createElement("span");
    dot.textContent = "·";
    const date = document.createElement("span");
    date.textContent = formatDate(item.createdAt).slice(0, 12);
    meta.append(site, dot, date);
    if (item.source === "preset") {
      const badge = document.createElement("span");
      badge.className = "chip static";
      badge.style.padding = "1px 6px";
      badge.style.fontSize = "9.5px";
      badge.textContent = "예시";
      meta.appendChild(badge);
    }

    const tools = document.createElement("div");
    tools.className = "tools";
    const openBtn = document.createElement("button");
    openBtn.className = "mini-btn";
    openBtn.type = "button";
    openBtn.textContent = "열기";
    openBtn.dataset.action = "open";
    const linkBtn = document.createElement("a");
    linkBtn.className = "mini-btn";
    linkBtn.textContent = "원문 ↗";
    linkBtn.href = item.partnerUrl || item.url || "#";
    linkBtn.target = "_blank";
    linkBtn.rel = "noopener";
    if (!item.partnerUrl && !item.url) linkBtn.style.display = "none";
    const delBtn = document.createElement("button");
    delBtn.className = "mini-btn danger";
    delBtn.type = "button";
    delBtn.textContent = "삭제";
    delBtn.dataset.action = "delete";
    tools.append(openBtn, linkBtn, delBtn);

    li.append(title, meta, tools);
    list.appendChild(li);
  }
}

async function openArchivedArticle(id) {
  let article = null;
  if (state.storage === "kv") {
    const result = await api("/api/mirror?id=" + encodeURIComponent(id));
    if (result.data.ok) article = result.data.article;
  }
  if (!article) article = localArchive().find((item) => item.id === id) || null;
  if (!article) {
    toast("아카이브에서 기사를 찾지 못했습니다.", "err");
    return;
  }
  if (!article.paragraphs || !article.paragraphs.length) {
    article.paragraphs = String(article.body || "").split(/\n{2,}/).filter(Boolean);
  }
  setArticle(article, { fromArchive: true });
}

async function deleteArchivedArticle(id) {
  if (!window.confirm("이 기사를 아카이브에서 지울까요?")) return;
  if (state.storage === "kv") {
    const result = await api("/api/mirror?id=" + encodeURIComponent(id), { method: "DELETE" });
    if (!result.data.ok) {
      toast("아카이브에서 지우지 못했습니다.", "err");
      return;
    }
  }
  removeLocalArticle(id);
  if (state.article && state.article.id === id) {
    state.article = null;
  }
  await refreshArchive($("archiveSearch").value);
  renderWorkspace();
  toast("아카이브에서 지웠습니다.", "ok");
}

/* ------------------------------------------------------------------ *
 * 기사 → 스튜디오
 * ------------------------------------------------------------------ */

function partnerUrlNow(article = state.article) {
  if (!article) return "";
  return partnerLinkFor(article, state.partnerCode);
}

async function setArticle(article, { fromArchive = false } = {}) {
  state.article = article;
  state.article.partnerUrl = partnerUrlNow(article);
  const storyboard = buildStoryboard(state.article, { partnerUrl: state.article.partnerUrl });
  state.cuts = storyboard.cuts;
  state.baseCards = storyboard.cards.map((card) => ({ ...card, lines: [...card.lines] }));
  state.cards = storyboard.cards.map((card) => ({ ...card, lines: [...card.lines] }));
  state.channels = storyboard.channels;
  state.activeCard = 0;
  state.images = {};
  state.imageMeta = {};
  state.articleImageEl = null;
  state.slideshowUrl = "";
  writeJson(LS.last, state.article);

  renderReader();
  renderWorkspace();
  await loadArticleImage();
  if (!fromArchive) await refreshArchive($("archiveSearch").value || "");
}

function renderWorkspace() {
  const has = Boolean(state.article);
  $("mirrorEmpty").hidden = has;
  $("readerCard").hidden = !has;
  $("cutsEmpty").hidden = has;
  $("cardsEmpty").hidden = has;
  $("channelsEmpty").hidden = has;
  $("cutsStudio").hidden = !has;
  $("cardsStudio").hidden = !has;
  $("channelsStudio").hidden = !has;
  if (!has) return;

  $("cutsArticleTitle").textContent = state.article.title;
  $("cardsArticleTitle").textContent = state.article.title;
  $("channelsArticleTitle").textContent = state.article.title;

  renderChips();
  renderCuts();
  renderComic();
  renderSlideList();
  renderCardEditor();
  renderCardPreview();
  renderPlatformTabs();
  renderChannel();
  document.body.dataset.articleId = state.article.id;
}

function renderReader() {
  const article = state.article;
  if (!article) return;
  $("readerSite").textContent = article.site || "직접 입력";
  const dateText = article.publishedAt ? formatDate(article.publishedAt) : formatDate(article.createdAt);
  $("readerDate").textContent = dateText;
  $("readerChars").textContent = `${article.charCount || 0}자 · ${(article.paragraphs || []).length}문단`;
  $("readerTitle").textContent = article.title;
  const subtitle = isNoiseLine(article.subtitle) ? "" : article.subtitle || "";
  $("readerSubtitle").textContent = subtitle;
  $("readerSubtitle").hidden = !subtitle;

  const meta = $("readerMeta");
  meta.textContent = "";
  const bits = [];
  if (article.author) bits.push("글 " + article.author);
  if (article.partnerCode) bits.push("파트너 코드 pn=" + article.partnerCode);
  if (article.url) bits.push("원문 주소 저장됨");
  if (article.source === "preset") bits.push("예시 기사");
  for (const bit of bits) {
    const span = document.createElement("span");
    span.textContent = bit;
    meta.appendChild(span);
  }

  const body = $("readerBody");
  body.textContent = "";
  for (const paragraph of article.paragraphs || []) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    body.appendChild(p);
  }

  const link = $("readerPartner");
  const href = article.partnerUrl || article.url;
  link.href = href || "#";
  link.hidden = !href;
  link.textContent = article.partnerCode ? "원문 파트너스 링크 ↗" : "원문 링크 ↗";

  const imageWrap = $("readerImageWrap");
  if (article.image && !state.articleImageEl) {
    $("readerImage").src = article.image;
    imageWrap.hidden = false;
  } else if (state.articleImageEl) {
    imageWrap.hidden = false;
  } else {
    imageWrap.hidden = true;
  }
}

async function loadArticleImage() {
  const article = state.article;
  if (!article || !article.image) return;
  const result = await api("/api/proxy-image?url=" + encodeURIComponent(article.image));
  if (!result.data.ok || !result.data.dataUrl) return;
  const image = await loadImage(result.data.dataUrl);
  if (!image) return;
  state.articleImageEl = image;
  $("readerImage").src = result.data.dataUrl;
  $("readerImageWrap").hidden = false;
  renderCardPreview();
}

/* ------------------------------------------------------------------ *
 * 미러링 폼
 * ------------------------------------------------------------------ */

async function submitMirror(event) {
  event.preventDefault();
  if (state.busy) return;
  const url = $("articleUrl").value.trim();
  if (!url) {
    toast("기사 주소를 입력해 주세요.", "err");
    $("articleUrl").focus();
    return;
  }
  const button = $("mirrorBtn");
  const original = button.textContent;
  state.busy = true;
  button.disabled = true;
  button.textContent = "미러링 중…";
  try {
    const result = await api("/api/mirror", {
      method: "POST",
      body: JSON.stringify({ url, pn: state.partnerCode }),
    });
    const data = result.data;
    if (data.ok && data.article) {
      if (data.storage !== "kv") saveLocalArticle(data.article);
      setArticle(data.article);
      if (data.warnings && data.warnings.length) toast(data.warnings[0], "ok");
      else toast("미러링 완료 — 텍스트 리더로 저장했습니다.", "ok");
    } else if (data.needsManual) {
      $("manualBox").hidden = false;
      $("manualToggle").setAttribute("aria-expanded", "true");
      $("manualUrl").value = url;
      toast(data.message || "주소를 불러오지 못했습니다. 직접 붙여넣어 주세요.", "err");
    } else {
      toast(data.message || "미러링에 실패했습니다.", "err");
    }
  } catch (error) {
    toast("네트워크 오류로 미러링하지 못했습니다.", "err");
  } finally {
    state.busy = false;
    button.disabled = false;
    button.textContent = original;
  }
}

async function saveManual() {
  const title = $("manualTitle").value.trim();
  const body = $("manualBody").value.trim();
  if (!title && !body) {
    toast("제목이나 본문을 입력해 주세요.", "err");
    return;
  }
  const button = $("manualSave");
  button.disabled = true;
  try {
    const result = await api("/api/mirror", {
      method: "POST",
      body: JSON.stringify({
        manual: true,
        title,
        body,
        url: $("manualUrl").value.trim(),
        pn: state.partnerCode,
      }),
    });
    if (result.data.ok && result.data.article) {
      if (result.data.storage !== "kv") saveLocalArticle(result.data.article);
      setArticle(result.data.article);
      toast("직접 입력한 기사를 아카이브에 저장했습니다.", "ok");
    } else {
      toast(result.data.message || "저장하지 못했습니다.", "err");
    }
  } finally {
    button.disabled = false;
  }
}

async function loadPresets() {
  const row = $("presetRow");
  try {
    const result = await api("/api/presets");
    const presets = (result.data && result.data.presets) || [];
    row.textContent = "";
    for (const preset of presets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.dataset.preset = preset.id;
      button.textContent = `${preset.emoji} ${preset.label}`;
      row.appendChild(button);
    }
  } catch (e) {
    row.innerHTML = "";
  }
}

async function loadPreset(id) {
  if (state.busy) return;
  state.busy = true;
  try {
    const result = await api("/api/mirror", {
      method: "POST",
      body: JSON.stringify({ preset: id, pn: state.partnerCode }),
    });
    if (result.data.ok && result.data.article) {
      if (result.data.storage !== "kv") saveLocalArticle(result.data.article);
      setArticle(result.data.article);
      toast("예시 기사를 불러왔습니다. 실제 기사 주소로도 확인해 보세요.", "ok");
    } else {
      toast(result.data.message || "예시 기사를 불러오지 못했습니다.", "err");
    }
  } finally {
    state.busy = false;
  }
}

/* ------------------------------------------------------------------ *
 * 칩(스타일·배치·테마·비율·플랫폼)
 * ------------------------------------------------------------------ */

function renderChips() {
  const styleRow = $("styleRow");
  styleRow.textContent = "";
  for (const style of STYLES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.style === style.id ? " active" : "");
    button.dataset.style = style.id;
    button.title = style.tone;
    button.textContent = `${style.emoji} ${style.name}`;
    styleRow.appendChild(button);
  }

  const layoutRow = $("layoutRow");
  layoutRow.textContent = "";
  for (const item of [
    { id: "grid", label: "2×2 정사각" },
    { id: "vertical", label: "세로 4컷" },
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.layout === item.id ? " active" : "");
    button.dataset.layout = item.id;
    button.textContent = item.label;
    layoutRow.appendChild(button);
  }

  const themeRow = $("themeRow");
  themeRow.textContent = "";
  for (const item of [
    { id: "magazine", label: "📖 매거진" },
    { id: "dark", label: "🌙 다크 테크" },
    { id: "econ", label: "📈 경제 인포" },
    { id: "pastel", label: "🌸 파스텔" },
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.cardTheme === item.id ? " active" : "");
    button.dataset.theme = item.id;
    button.textContent = item.label;
    themeRow.appendChild(button);
  }

  const ratioRow = $("ratioRow");
  ratioRow.textContent = "";
  for (const item of [
    { id: "4:5", label: "4:5 인스타" },
    { id: "9:16", label: "9:16 틱톡" },
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.ratio === item.id ? " active" : "");
    button.dataset.ratio = item.id;
    button.textContent = item.label;
    ratioRow.appendChild(button);
  }
}

/* ------------------------------------------------------------------ *
 * 4컷 스튜디오
 * ------------------------------------------------------------------ */

function renderCuts() {
  const grid = $("cutsGrid");
  grid.textContent = "";
  state.cuts.forEach((cut, index) => {
    const card = document.createElement("article");
    card.className = "cut-card";
    card.dataset.cut = String(cut.index);

    const header = document.createElement("header");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = String(cut.index);
    const role = document.createElement("span");
    role.className = "role";
    role.textContent = `${cut.roleLabel} 컷 · ${cut.expression}`;
    const imgState = document.createElement("span");
    imgState.className = "imgstate" + (state.images[cut.index] ? " ai" : "");
    imgState.dataset.role = "imgstate";
    imgState.textContent = state.images[cut.index] ? "AI 이미지" : "Canvas 아트";
    header.append(badge, role, imgState);
    card.appendChild(header);

    const fields = document.createElement("div");
    fields.className = "cut-fields";

    fields.appendChild(
      field("나레이션", "cut-narration", cut.narration, "textarea", 2, index)
    );
    fields.appendChild(field("대사(말풍선)", "cut-dialogue", cut.dialogue, "textarea", 2, index));

    const dialogue = fields.querySelector('[data-field="cut-dialogue"]');
    if (dialogue) dialogue.rows = 2;

    const speakerLabel = document.createElement("div");
    speakerLabel.className = "field";
    const speakerSpan = document.createElement("span");
    speakerSpan.textContent = "화자";
    const speakerSelect = document.createElement("select");
    speakerSelect.dataset.field = "cut-speaker";
    speakerSelect.dataset.index = String(index);
    for (const name of ["독자", "기자"]) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = cut.speaker === name;
      speakerSelect.appendChild(option);
    }
    speakerLabel.append(speakerSpan, speakerSelect);
    fields.appendChild(speakerLabel);

    const expressionLabel = document.createElement("div");
    expressionLabel.className = "field";
    const expressionSpan = document.createElement("span");
    expressionSpan.textContent = "표정";
    const expressionSelect = document.createElement("select");
    expressionSelect.dataset.field = "cut-expression";
    expressionSelect.dataset.index = String(index);
    for (const name of ["놀람", "진지", "당황", "웃음"]) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = cut.expression === name;
      expressionSelect.appendChild(option);
    }
    expressionLabel.append(expressionSpan, expressionSelect);
    fields.appendChild(expressionLabel);

    const promptField = document.createElement("label");
    promptField.className = "field full";
    const promptSpan = document.createElement("span");
    promptSpan.textContent = "AI 이미지 프롬프트 (영어 권장)";
    const promptArea = document.createElement("textarea");
    promptArea.rows = 3;
    promptArea.dataset.field = "cut-prompt";
    promptArea.dataset.index = String(index);
    promptArea.value = cut.aiPrompt;
    promptField.append(promptSpan, promptArea);
    fields.appendChild(promptField);

    card.appendChild(fields);

    const row = document.createElement("div");
    row.className = "row wrap";
    const regen = document.createElement("button");
    regen.type = "button";
    regen.className = "btn";
    regen.dataset.action = "regen-cut";
    regen.dataset.index = String(index);
    regen.textContent = "✨ 이 컷 이미지";
    const reroll = document.createElement("button");
    reroll.type = "button";
    reroll.className = "btn ghost";
    reroll.dataset.action = "reroll-cut";
    reroll.dataset.index = String(index);
    reroll.textContent = "프롬프트 새로";
    row.append(regen, reroll);
    card.appendChild(row);

    grid.appendChild(card);
  });
}

function field(labelText, dataField, value, tag = "input", rows = 2, index = 0) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement(tag);
  input.dataset.field = dataField;
  input.dataset.index = String(index);
  if (tag === "textarea") {
    input.rows = rows;
    input.value = value || "";
  } else {
    input.value = value || "";
  }
  wrap.append(span, input);
  return wrap;
}

function updateCutFromInput(target) {
  const index = Number(target.dataset.index);
  const cut = state.cuts[index];
  if (!cut) return;
  const fieldName = target.dataset.field;
  if (fieldName === "cut-narration") cut.narration = target.value;
  else if (fieldName === "cut-dialogue") cut.dialogue = target.value;
  else if (fieldName === "cut-speaker") cut.speaker = target.value;
  else if (fieldName === "cut-expression") cut.expression = target.value;
  else if (fieldName === "cut-prompt") cut.aiPrompt = target.value;
  else return;
  renderComic();
}

function renderComic() {
  const canvas = $("comicCanvas");
  if (!state.article) return;
  renderSheet(canvas, {
    cuts: state.cuts,
    images: state.images,
    style: state.style,
    layout: state.layout,
    article: state.article,
  });
  const aiCount = Object.keys(state.images).length;
  const status = $("comicStatus");
  if (aiCount === 0) status.textContent = "Canvas 폴백 아트 · " + styleTheme(state.style).name;
  else if (aiCount === 4) status.textContent = "AI 이미지 4/4";
  else status.textContent = `AI ${aiCount}/4 · 나머지 Canvas 폴백`;
}

async function generateCutImage(cut) {
  const styleId = state.style;
  const prompt = (cut.aiPrompt && cut.aiPrompt.trim()) || cutPrompt(cut, styleId, state.article);
  const byok = state.byok;
  const useByok = byok.provider !== "free" && ((byok.provider === "openai" && byok.openai) || (byok.provider === "gemini" && byok.gemini));
  const body = {
    prompt,
    width: 1024,
    height: 1024,
    seed: Math.floor(Math.random() * 900000) + 1000,
    provider: useByok ? byok.provider : "free",
  };
  if (useByok) {
    body.apiKey = byok.provider === "openai" ? byok.openai : byok.gemini;
    if (byok.model) body.model = byok.model;
  }
  let result;
  try {
    result = await api("/api/generate-image", { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    result = { data: { ok: false, mode: "fallback", reason: "네트워크 오류" } };
  }
  if (result.data && result.data.ok && result.data.dataUrl) {
    const image = await loadImage(result.data.dataUrl);
    if (image) {
      state.images[cut.index] = image;
      state.imageMeta[cut.index] = { ai: true, provider: result.data.provider };
      updateCutImageState(cut.index, true);
      renderComic();
      return { ok: true };
    }
  }
  delete state.images[cut.index];
  state.imageMeta[cut.index] = { ai: false, reason: (result.data && result.data.reason) || "생성 실패" };
  updateCutImageState(cut.index, false);
  renderComic();
  return { ok: false, reason: (result.data && result.data.reason) || "이미지를 만들지 못했습니다." };
}

function updateCutImageState(index, isAi) {
  const node = document.querySelector(`[data-cut="${index + 1}"] [data-role="imgstate"]`);
  if (!node) return;
  node.className = "imgstate " + (isAi ? "ai" : "fallback");
  node.textContent = isAi ? "AI 이미지" : "Canvas 아트";
}

async function generateAllImages() {
  if (!state.article || state.busy) return;
  state.busy = true;
  const button = $("generateAll");
  button.disabled = true;
  button.textContent = "생성 중…";
  const progress = $("cutsProgress");
  let success = 0;
  let lastReason = "";
  for (let i = 0; i < state.cuts.length; i += 1) {
    setProgress(progress, i / state.cuts.length);
    const result = await generateCutImage(state.cuts[i]);
    if (result.ok) success += 1;
    else lastReason = result.reason;
    setProgress(progress, (i + 1) / state.cuts.length);
  }
  setProgress(progress, 1, false);
  button.disabled = false;
  button.textContent = "✨ AI 이미지 4컷 생성";
  state.busy = false;
  if (success === 4) toast("AI 이미지 4컷을 만들었습니다.", "ok");
  else if (success === 0) toast("AI 이미지를 못 받아 스타일별 Canvas 아트로 대체했습니다. " + (lastReason || ""), "");
  else toast(`AI 이미지 ${success}/4 생성 — 나머지는 Canvas 아트로 그렸습니다.`, "");
}

async function downloadSheet() {
  const canvas = $("comicCanvas");
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  downloadBlob(blob, `newspic-4cut-${state.style}-${state.layout}-${todayStamp()}.png`);
  toast("합본 PNG를 저장했습니다.", "ok");
}

async function downloadCuts() {
  for (const cut of state.cuts) {
    const canvas = renderCutCanvas(cut, state.style, state.images[cut.index] || null, state.article);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    downloadBlob(blob, `newspic-cut-${cut.index}-${todayStamp()}.png`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  toast("컷 4장 PNG를 저장했습니다.", "ok");
}

/* ------------------------------------------------------------------ *
 * 카드뉴스 8장
 * ------------------------------------------------------------------ */

function renderSlideList() {
  const list = $("slideList");
  list.textContent = "";
  state.cards.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slide-item" + (state.activeCard === index ? " active" : "");
    button.dataset.card = String(index);
    const no = document.createElement("span");
    no.className = "no";
    no.textContent = String(index + 1).padStart(2, "0");
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = kindLabel(card.kind);
    button.append(no, kind);
    list.appendChild(button);
  });
}

function renderCardEditor() {
  const card = state.cards[state.activeCard];
  if (!card) return;
  $("slideHeading").textContent = `${card.no}장 · ${kindLabel(card.kind)}`;
  $("editorKind").textContent = kindLabel(card.kind);
  $("cardKicker").value = card.kicker || "";
  $("cardTitleInput").value = card.title || "";
  $("cardLines").value = (card.lines || []).join("\n");
  $("cardFooter").value = card.footer || "";
  const info = ratioInfo(state.ratio);
  $("cardSize").textContent = `${info.width}×${info.height}`;
}

function renderCardPreview() {
  if (!state.article) return;
  const canvas = $("cardCanvas");
  const card = state.cards[state.activeCard];
  if (!card) return;
  const info = ratioInfo(state.ratio);
  canvas.width = info.width;
  canvas.height = info.height;
  const useImage = $("useArticleImage").checked && state.articleImageEl && card.kind === "cover";
  const rendered = renderCardCanvas(card, state.cardTheme, state.ratio, useImage ? state.articleImageEl : null, {
    total: state.cards.length,
  });
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(rendered, 0, 0);
}

function updateCardFromInputs() {
  const card = state.cards[state.activeCard];
  if (!card) return;
  card.kicker = $("cardKicker").value;
  card.title = $("cardTitleInput").value;
  card.lines = $("cardLines").value.split("\n").filter((line, index, all) => line.trim() || all.length === 1);
  card.footer = $("cardFooter").value;
  renderCardPreview();
  renderSlideList();
  refreshChannelsFromCards();
}

function refreshChannelsFromCards() {
  if (!state.article) return;
  const partnerUrl = partnerUrlNow();
  state.channels = buildChannels(state.article, state.cards, partnerUrl);
  if ($("channelBody")) renderChannel();
}

function selectCard(index) {
  state.activeCard = Math.max(0, Math.min(state.cards.length - 1, index));
  renderSlideList();
  renderCardEditor();
  renderCardPreview();
}

function resetCard() {
  const base = state.baseCards[state.activeCard];
  if (!base) return;
  state.cards[state.activeCard] = { ...base, lines: [...base.lines] };
  renderCardEditor();
  renderCardPreview();
  refreshChannelsFromCards();
  toast("자동 문구로 되돌렸습니다.", "ok");
}

async function downloadCard() {
  const canvas = $("cardCanvas");
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  downloadBlob(blob, `newspic-card-${state.activeCard + 1}-${state.ratio.replace(":", "x")}-${todayStamp()}.png`);
  toast("카드 PNG를 저장했습니다.", "ok");
}

async function downloadCardsZip() {
  const button = $("downloadZip");
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "묶는 중…";
  try {
    const files = [];
    for (let i = 0; i < state.cards.length; i += 1) {
      const card = state.cards[i];
      const useImage = $("useArticleImage").checked && state.articleImageEl && card.kind === "cover";
      const canvas = renderCardCanvas(card, state.cardTheme, state.ratio, useImage ? state.articleImageEl : null, {
        total: state.cards.length,
      });
      const data = await canvasToBytes(canvas);
      files.push({ name: `card-${String(i + 1).padStart(2, "0")}-${card.kind}.png`, data });
    }
    const zip = buildZip(files);
    downloadBlob(new Blob([zip], { type: "application/zip" }), `newspic-cards8-${state.ratio.replace(":", "x")}-${todayStamp()}.zip`);
    toast("카드뉴스 8장을 ZIP으로 저장했습니다.", "ok");
  } catch (e) {
    toast("ZIP을 만들지 못했습니다. 카드를 하나씩 저장해 주세요.", "err");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/* ------------------------------------------------------------------ *
 * 6개 채널
 * ------------------------------------------------------------------ */

function renderPlatformTabs() {
  const row = $("platformRow");
  row.textContent = "";
  for (const platform of PLATFORMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.activePlatform === platform.id ? " active" : "");
    button.dataset.platform = platform.id;
    button.textContent = `${platform.emoji} ${platform.name}`;
    row.appendChild(button);
  }
}

function currentChannel() {
  return state.channels[state.activePlatform] || null;
}

function renderChannel() {
  const pack = currentChannel();
  if (!pack) return;
  $("channelName").textContent = `${pack.emoji} ${pack.name}`;
  $("channelBody").value = pack.body || "";
  updateChannelChars();
  $("channelComment").textContent = pack.firstComment || "—";
  $("channelTips").textContent = (pack.tips || []).join(" · ");

  const titleField = $("channelTitleField");
  if (pack.id === "youtube") {
    titleField.hidden = false;
    $("channelTitleInput").value = pack.title || "";
  } else {
    titleField.hidden = true;
  }

  const intent = $("openIntent");
  intent.hidden = !pack.intentUrl;
  const share = pack.shareUrl;
  $("copyAll").dataset.share = share || "";
}

function updateChannelChars() {
  const pack = currentChannel();
  if (!pack) return;
  const length = $("channelBody").value.length;
  const limit = pack.limit || 500;
  $("channelChars").textContent = `${length} / ${limit}자`;
  $("channelChars").style.color = length > limit ? "#fca5a5" : length > limit * 0.92 ? "#fcd34d" : "";
}

async function makeVideo() {
  if (!videoSupported()) {
    toast("이 브라우저는 영상 녹화를 지원하지 않습니다. Chrome·Safari 최신 버전에서 시도해 주세요.", "err");
    return;
  }
  const button = $("makeVideo");
  const progress = $("videoProgress");
  button.disabled = true;
  button.textContent = "영상 만드는 중…";
  setProgress(progress, 0);
  try {
    const useImage = $("useArticleImage").checked && state.articleImageEl;
    const blob = await recordSlideshow({
      cards: state.cards,
      theme: state.cardTheme,
      imageEl: useImage ? state.articleImageEl : null,
      secondsPerSlide: 2.2,
      onProgress: (value) => setProgress(progress, value),
    });
    if (state.slideshowUrl) URL.revokeObjectURL(state.slideshowUrl);
    state.slideshowUrl = URL.createObjectURL(blob);
    const link = $("videoDownload");
    link.href = state.slideshowUrl;
    link.download = `newspic-cards8-9x16-${todayStamp()}.webm`;
    link.hidden = false;
    setProgress(progress, 1, false);
    toast("9:16 슬라이드 영상(.webm)을 만들었습니다.", "ok");
  } catch (error) {
    setProgress(progress, 1, false);
    toast((error && error.message) || "영상을 만들지 못했습니다.", "err");
  } finally {
    button.disabled = false;
    button.textContent = "🎬 슬라이드 영상 만들기";
  }
}

/* ------------------------------------------------------------------ *
 * 설정(BYOK)
 * ------------------------------------------------------------------ */

function loadSettings() {
  const byok = readJson(LS.byok, state.byok);
  state.byok = { provider: "free", openai: "", gemini: "", model: "", ...byok };
  const prefs = readJson(LS.prefs, {});
  state.partnerCode = prefs.partnerCode || "";
  state.style = prefs.style || "photo";
  state.layout = prefs.layout || "grid";
  state.cardTheme = prefs.cardTheme || "magazine";
  state.ratio = prefs.ratio || "4:5";
  $("partnerCode").value = state.partnerCode;
  $("imageProvider").value = state.byok.provider || "free";
  $("openaiKey").value = state.byok.openai || "";
  $("geminiKey").value = state.byok.gemini || "";
  $("imageModel").value = state.byok.model || "";
}

function savePrefs() {
  writeJson(LS.prefs, {
    partnerCode: state.partnerCode,
    style: state.style,
    layout: state.layout,
    cardTheme: state.cardTheme,
    ratio: state.ratio,
  });
}

function applyPartnerCode() {
  const value = $("partnerCode").value.trim().replace(/^pn=/, "");
  state.partnerCode = value;
  savePrefs();
  if (!state.article) return;
  state.article.partnerUrl = partnerUrlNow();
  const cta = state.cards.find((card) => card.kind === "cta");
  if (cta && state.article.partnerUrl && !/^http/.test(cta.lines[1] || "")) {
    cta.lines[1] = shorten(state.article.partnerUrl, 64);
  } else if (cta && state.article.partnerUrl) {
    cta.lines[1] = shorten(state.article.partnerUrl, 64);
  }
  renderReader();
  renderCardEditor();
  renderCardPreview();
  refreshChannelsFromCards();
  const dialogue = $("readerPartner");
  if (dialogue) dialogue.href = state.article.partnerUrl || state.article.url || "#";
}

/* ------------------------------------------------------------------ *
 * 이벤트 연결
 * ------------------------------------------------------------------ */

function bindEvents() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
  $$("[data-goto]").forEach((button) =>
    button.addEventListener("click", () => showTab(button.dataset.goto))
  );

  $("mirrorForm").addEventListener("submit", submitMirror);
  $("manualToggle").addEventListener("click", () => {
    const box = $("manualBox");
    box.hidden = !box.hidden;
    $("manualToggle").setAttribute("aria-expanded", box.hidden ? "false" : "true");
  });
  $("manualSave").addEventListener("click", saveManual);
  $("presetRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) loadPreset(button.dataset.preset);
  });

  $("archiveSearch").addEventListener("input", (event) => {
    clearTimeout(renderArchive.timer);
    renderArchive.timer = setTimeout(() => refreshArchive(event.target.value), 220);
  });
  $("archiveList").addEventListener("click", (event) => {
    const item = event.target.closest(".archive-item");
    if (!item) return;
    const action = event.target.closest("[data-action]");
    if (action && action.dataset.action === "delete") {
      deleteArchivedArticle(item.dataset.id);
      return;
    }
    openArchivedArticle(item.dataset.id);
  });
  $("archiveList").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest(".archive-item");
    if (!item) return;
    event.preventDefault();
    openArchivedArticle(item.dataset.id);
  });

  $("partnerCode").addEventListener("change", applyPartnerCode);
  $("partnerCode").addEventListener("blur", applyPartnerCode);

  $("toCuts").addEventListener("click", () => showTab("cuts"));
  $("toCards").addEventListener("click", () => showTab("cards"));

  $("styleRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-style]");
    if (!button) return;
    const style = button.dataset.style;
    if (style === state.style) return;
    state.style = style;
    state.images = {};
    state.imageMeta = {};
    for (const cut of state.cuts) cut.aiPrompt = cutPrompt(cut, style, state.article);
    savePrefs();
    renderChips();
    renderCuts();
    renderComic();
    toast(`${styleTheme(style).name} 스타일로 바꿨습니다. AI 이미지는 새로 생성해 주세요.`, "ok");
  });

  $("layoutRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-layout]");
    if (!button) return;
    state.layout = button.dataset.layout;
    savePrefs();
    renderChips();
    renderComic();
  });

  $("cutsGrid").addEventListener("input", (event) => {
    if (event.target.matches("[data-field]")) updateCutFromInput(event.target);
  });
  $("cutsGrid").addEventListener("change", (event) => {
    if (event.target.matches("select[data-field]")) updateCutFromInput(event.target);
  });
  $("cutsGrid").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const index = Number(button.dataset.index);
    const cut = state.cuts[index];
    if (!cut) return;
    if (button.dataset.action === "reroll-cut") {
      cut.aiPrompt = cutPrompt(cut, state.style, state.article);
      const area = document.querySelector(`[data-field="cut-prompt"][data-index="${index}"]`);
      if (area) area.value = cut.aiPrompt;
      toast("프롬프트를 새로 만들었습니다.", "ok");
      return;
    }
    if (button.dataset.action === "regen-cut") {
      button.disabled = true;
      const original = button.textContent;
      button.textContent = "생성 중…";
      const result = await generateCutImage(cut);
      button.disabled = false;
      button.textContent = original;
      toast(result.ok ? "이미지를 받았습니다." : result.reason, result.ok ? "ok" : "");
    }
  });

  $("generateAll").addEventListener("click", generateAllImages);
  $("resetImages").addEventListener("click", () => {
    state.images = {};
    state.imageMeta = {};
    renderCuts();
    renderComic();
    toast("AI 이미지를 지우고 Canvas 아트로 돌아갔습니다.", "ok");
  });
  $("downloadSheet").addEventListener("click", downloadSheet);
  $("downloadCuts").addEventListener("click", downloadCuts);

  $("themeRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme]");
    if (!button) return;
    state.cardTheme = button.dataset.theme;
    savePrefs();
    renderChips();
    renderCardPreview();
  });
  $("ratioRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ratio]");
    if (!button) return;
    state.ratio = button.dataset.ratio;
    savePrefs();
    renderChips();
    renderCardEditor();
    renderCardPreview();
  });
  $("slideList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-card]");
    if (button) selectCard(Number(button.dataset.card));
  });
  $("prevSlide").addEventListener("click", () => selectCard(state.activeCard - 1));
  $("nextSlide").addEventListener("click", () => selectCard(state.activeCard + 1));
  ["cardKicker", "cardTitleInput", "cardLines", "cardFooter"].forEach((id) =>
    $(id).addEventListener("input", updateCardFromInputs)
  );
  $("resetCard").addEventListener("click", resetCard);
  $("downloadCard").addEventListener("click", downloadCard);
  $("downloadZip").addEventListener("click", downloadCardsZip);
  $("useArticleImage").addEventListener("change", renderCardPreview);

  $("platformRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-platform]");
    if (!button) return;
    state.activePlatform = button.dataset.platform;
    renderPlatformTabs();
    renderChannel();
  });
  $("channelBody").addEventListener("input", () => {
    const pack = currentChannel();
    if (pack) pack.body = $("channelBody").value;
    updateChannelChars();
  });
  $("channelTitleInput").addEventListener("input", () => {
    const pack = currentChannel();
    if (pack) pack.title = $("channelTitleInput").value;
  });
  $("copyBody").addEventListener("click", () => copyText($("channelBody").value, "본문을 복사했습니다."));
  $("copyComment").addEventListener("click", () => copyText($("channelComment").textContent, "첫 댓글 문구를 복사했습니다."));
  $("copyAll").addEventListener("click", () => {
    const pack = currentChannel();
    const text = `${$("channelBody").value}\n\n--- 첫 댓글 ---\n${pack ? pack.firstComment : ""}`;
    copyText(text, "본문과 첫 댓글을 함께 복사했습니다.");
  });
  $("openIntent").addEventListener("click", () => {
    const pack = currentChannel();
    if (!pack) return;
    if (pack.id === "instagram" || pack.id === "facebook") {
      if (pack.shareUrl) window.open(pack.shareUrl, "_blank", "noopener");
      else toast("인스타·페이스북은 앱에서 이미지를 올린 뒤 본문을 붙여넣어 주세요.");
      return;
    }
    if (pack.intentUrl) window.open(pack.intentUrl + encodeURIComponent($("channelBody").value), "_blank", "noopener");
  });
  $("channelChecklist").addEventListener("click", (event) => {
    const item = event.target.closest("li");
    if (!item) return;
    item.classList.toggle("done");
    const box = item.querySelector(".box");
    if (box) box.textContent = item.classList.contains("done") ? "✓" : "";
    box.style.background = item.classList.contains("done") ? "var(--accent)" : "transparent";
    box.style.color = "#1c0b04";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.fontWeight = "900";
  });
  $("makeVideo").addEventListener("click", makeVideo);

  $("byokBtn").addEventListener("click", () => $("settingsDialog").showModal());
  $("saveSettings").addEventListener("click", () => {
    state.byok = {
      provider: $("imageProvider").value,
      openai: $("openaiKey").value.trim(),
      gemini: $("geminiKey").value.trim(),
      model: $("imageModel").value.trim(),
    };
    writeJson(LS.byok, state.byok);
    $("settingsDialog").close();
    toast(
      state.byok.provider === "free"
        ? "무료 이미지 생성으로 설정했습니다."
        : `${state.byok.provider} 키를 이 브라우저에만 저장했습니다.`,
      "ok"
    );
  });
  $("clearKeys").addEventListener("click", () => {
    state.byok = { provider: "free", openai: "", gemini: "", model: "" };
    writeJson(LS.byok, state.byok);
    $("imageProvider").value = "free";
    $("openaiKey").value = "";
    $("geminiKey").value = "";
    $("imageModel").value = "";
    toast("저장된 키를 지웠습니다.", "ok");
  });
  $("settingsDialog").addEventListener("click", (event) => {
    if (event.target === $("settingsDialog")) $("settingsDialog").close();
  });
}

/* ------------------------------------------------------------------ *
 * 시작
 * ------------------------------------------------------------------ */

async function init() {
  loadSettings();
  bindEvents();
  await loadPresets();
  setStoragePill();

  const hash = location.hash.replace("#", "");
  const startTab = ["mirror", "cuts", "cards", "channels"].includes(hash) ? hash : "mirror";
  showTab(startTab);

  const last = readJson(LS.last, null);
  if (last && last.title) {
    setArticle(last, { fromArchive: true });
    await refreshArchive("");
  } else {
    await refreshArchive("");
    renderWorkspace();
  }

  window.__studio = {
    state,
    setArticle,
    showTab,
    generateCutImage,
    renderComic,
    renderCardPreview,
    recordSlideshow,
    buildZip,
  };
}

init();
