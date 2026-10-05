// SE LLAMA A GANO · nube en Netlify
// Guarda todos los derbis en Netlify Blobs. Todos pueden LEER; solo el administrador
// (usuario y contraseña de la app) puede GUARDAR. Hace un respaldo por hora.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const RUTA = /^(derbis\/[A-Za-z0-9_\-.~:@+]{1,200}|ajustes\/(general|fondos))$/;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const vacio = () => ({ rev: 0, docs: {}, revs: {}, borr: {} });

async function leer(store) {
  const r = await store.getWithMetadata("estado", { type: "json" });
  if (!r) return { e: vacio(), etag: null };
  const e = r.data || vacio();
  e.docs ||= {}; e.revs ||= {}; e.borr ||= {}; e.rev ||= 0;
  return { e, etag: r.etag };
}

function autorizado(e, req) {
  const h = e.docs["ajustes/general"] && e.docs["ajustes/general"].adminHash;
  if (!h) return true; // todavía no hay administrador: primera configuración
  const c = req.headers.get("x-clave");
  if (!c) return false;
  let txt;
  try { txt = Buffer.from(c, "base64").toString("utf8"); } catch { return false; }
  const i = txt.indexOf("|");
  if (i < 0) return false;
  const u = txt.slice(0, i).trim().toLowerCase(), p = txt.slice(i + 1);
  return createHash("sha256").update("sellamaagano:" + u + "|" + p, "utf8").digest("hex") === h;
}

export default async (req) => {
  const url = new URL(req.url);
  const ruta = url.pathname.replace(/^\/api\/?/, "");
  const store = getStore({ name: "sellamaagano", consistency: "strong" });

  if (ruta === "info") return json({ ok: true, nube: true });

  if (ruta === "todo" && req.method === "GET") {
    const { e } = await leer(store);
    const desde = Number(url.searchParams.get("rev")) || 0;
    if (desde && desde === e.rev) return json({ rev: e.rev, docs: {}, borrados: [] });
    const completo = !desde || desde > e.rev;
    const docs = {};
    for (const [k, r] of Object.entries(e.revs)) if (completo || r > desde) docs[k] = e.docs[k];
    const borrados = completo ? [] : Object.entries(e.borr).filter(([, r]) => r > desde).map(([k]) => k);
    return json({ rev: e.rev, docs, borrados, completo });
  }

  if (ruta === "doc" && (req.method === "PUT" || req.method === "DELETE")) {
    const path = url.searchParams.get("path") || "";
    if (!RUTA.test(path)) return json({ error: "ruta no válida" }, 400);
    let body = null;
    if (req.method === "PUT") {
      try { body = await req.json(); } catch { return json({ error: "datos no válidos" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "datos no válidos" }, 400);
    }
    for (let intento = 0; intento < 6; intento++) {
      const { e, etag } = await leer(store);
      if (!autorizado(e, req)) return json({ error: "sin permiso" }, 403);
      e.rev += 1;
      if (body) { e.docs[path] = body; e.revs[path] = e.rev; delete e.borr[path]; }
      else { delete e.docs[path]; delete e.revs[path]; e.borr[path] = e.rev; }
      const res = await store.setJSON("estado", e, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (res && res.modified === false) { await new Promise(r => setTimeout(r, 80 + Math.random() * 200)); continue; }
      // respaldo: el último estado de cada hora queda guardado aparte
      const hora = new Date().toISOString().slice(0, 13).replace("T", "_");
      store.setJSON("respaldos/" + hora + "h", e).catch(() => {});
      return new Response(null, { status: 204 });
    }
    return json({ error: "ocupado, reintenta" }, 503);
  }

  if (ruta === "respaldos" && req.method === "GET") {
    const { blobs } = await store.list({ prefix: "respaldos/" });
    return json({ respaldos: blobs.map(b => b.key.replace("respaldos/", "")).sort().reverse().slice(0, 72) });
  }
  if (ruta.startsWith("respaldo/") && req.method === "GET") {
    const k = "respaldos/" + ruta.slice("respaldo/".length);
    const d = await store.get(k, { type: "json" });
    return d ? json(d) : json({ error: "no existe" }, 404);
  }
  return json({ error: "no encontrado" }, 404);
};

export const config = { path: "/api/*" };
