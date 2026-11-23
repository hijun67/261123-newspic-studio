/* /api/health — 배포 상태·기능 확인 */
export async function onRequest(context) {
  const env = (context && context.env) || {};
  const data = {
    ok: true,
    service: "newspic-studio",
    version: "1.0.0",
    time: new Date().toISOString(),
    features: {
      mirror: true,
      kv: Boolean(env.ARCHIVE && typeof env.ARCHIVE.get === "function"),
      freeImage: true,
      workersAi: Boolean(env.AI && typeof env.AI.run === "function"),
      byok: ["openai", "gemini"],
      cards: 8,
      channels: 6,
    },
  };
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
