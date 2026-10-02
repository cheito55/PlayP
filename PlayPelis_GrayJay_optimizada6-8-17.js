/*
 * StreamflixHub v1.8.26 - YouTube: prueba ANDROID_VR (sin PO token) antes que iOS, junta fuentes de ambos clientes (antes se cortaba en iOS y su HLS da 'Video no disponible'), video+audio separados (UnMux) cuando solo hay YouTube.
 * (base) StreamflixHub v1.8.25 - YouTube: busqueda propia de playlists/videos largos en el buscador (origen ytplay://), playlist conocida Cebollitas, episodios por playlist.
 * (base) StreamflixHub v1.8.24 - Fix Servidores Plus: filtro de episodio (.ok) en Odysee/Dailymotion/Archive, Archive.org series por archivo/episodio, Dailymotion con filtro de duracion, NUEVO proveedor YouTube.
 * (base) StreamflixHub v1.8.23 - GrayJay source (ES5) - arquitectura + extractores Streamflix Reborn 1.7.231 + Servidores Plus
 * Fix v1.8.23: Dailymotion usa mkSrc con Referer (mkSrcBare impedía reproducir HLS). Nombres de fuente sin duplicar.
 * Fix v1.8.6: Bing RSS (format=rss) como 1er motor, cite 'ok.ru > video > ID', log de diagnostico y sello de build.
 * Fix v1.8.2: llave duplicada en okruFetchSearchPage (SyntaxError) + mkSrc restaurada.
 * Fix v1.8.3 OK.ru direct:
 *  - Bing SERP: decodifica u=a1 + base64(URL) para extraer IDs (antes web-discover salía vacío)
 *  - clearOkruFails: búsquedas fallidas no marcan ok.ru como host caído (hostDead bloqueaba videoembed)
 *  - Reintento embed en ok.ru / m.ok.ru tras limpiar fails
 *  - okruFetchSearchPage no envenena hostDead y descarta páginas de login/home sin resultados
 * Parches PlayPelis (2026-09-30):
 *  - SERVER_HOSTS ampliado (StreamSB/Dood/embeds del APK PlayPelis)
 *  - DOMAINS actualizados (prioriza espejos vivos; demota Esplay/pelisplus.to caidos)
 *  - Proveedor Esplay best-effort + fallbacks mycdn.moe
 *  - exEsplay mejorado (varios endpoints)
 *  - SITES extra: Gnula (extraSites)
 *  - OK.ru: búsqueda pública + DDG/Bing site:ok.ru (sin login), match título TMDB, streams sin requestModifier
 * Fix v1.8.16 OK.ru title variants:
 *  - Busca título ES + EN/original + variante Latino, incluyendo año cuando existe.
 *  - No corta la búsqueda al primer match: exige probar al menos una consulta Latino.
 *  - Mantiene la deduplicación por película para reunir IDs/streams de varias copias.
 * Fix v1.8.17 OK.ru calidad: agrega IDs alternativos en una sola ficha y ordena streams por resolución.
 * Fix v1.8.18 OK.ru quality-first:
 *  - Consultas con 1080p/Full HD/720p y Latino 1080p/720p antes del título plano.
 *  - Prioriza audio Latino en queries y fusiona calidades de varias copias en una ficha.
 * Fix v1.8.19 OK.ru títulos localizados:
 *  - TMDB es-MX + translations para obtener el nombre hispano (ej. Big → Quisiera ser grande).
 *  - Queries y match usan título latino ES; bonus de score si el video OK.ru dice Latino.
 * Fix v1.8.20 OK.ru series:
 *  - Queries: "Serie Capítulo N", "Cap N", "SxEy", "TxEy", "Temporada X Capítulo Y".
 *  - Match exige número de episodio/capítulo en el título OK.ru; año relajado en series.
 * Fix v1.8.21 OK.ru series variantes + capítulo absoluto:
 *  - Acepta S/T, Cap/C/Ep/E, "Serie - 10", mayúsculas/minúsculas indiferente.
 *  - Numeración continua (ej. Loki E10 = S2E4 si S1 tiene 6 eps) vía TMDB episode_count.
 * Fix v1.8.22 Servidores Plus:
 *  - Nuevo setting servidoresPlus: OK.ru + Odysee + Dailymotion + Archive.org + YouTube.
 *  - Solo se activan si el usuario lo prende; corren como primera prioridad.
 *  - Extractores propios (sin plugins externos) integrados en el script.
 *
 * Catalogo: TMDB. Fuentes: PoseidonHD2, PelisJuanita, Cuevana3, OK.ru, Odysee, Dailymotion, Archive.org, LaCartoons, sitios WP.
 * Ajuste "serverMode": Rapido (3) / Normal (5) / Completo (8) servidores.
 * Ajuste "servidoresPlus": activa OK.ru + Odysee + Dailymotion + Archive.org + YouTube (primera prioridad).
 * Debug: debugMode en settings -> bloque === DEBUG === en la descripcion.
 * extraSites: catalogo Juanita/JKAnime + sitios WP extra.
 */

var PLATFORM = "StreamflixHub";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "streamflixhub://";

var TMDB_KEY = "26c168179ae6b5445f36aca260e00d48";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_IMG = "https://image.tmdb.org/t/p/w500";
var TMDB_STILL = "https://image.tmdb.org/t/p/w300";
var TMDB_BACK = "https://image.tmdb.org/t/p/w780";

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

var MAX_ITEMS = 40;
var MAX_HTML = 1200000;
var MAX_CAND = 6;
/* early-stop / maximo de fuentes mostradas, segun el ajuste serverMode (0 rapido, 1 normal, 2 completo) */
var SERVER_MODES = [{ want: 2, max: 4, extra: 2000 }, { want: 4, max: 6, extra: 5000 }, { want: 6, max: 8, extra: 12000 }];
function serverMode() {
    var v = _settings && _settings.serverMode, n = parseInt(v, 10), m;
    if (v != null && String(v).length > 2) { m = /(\d+)/.exec(String(v)); if (m) n = m[1] == "3" ? 0 : (m[1] == "8" ? 2 : 1); }
    if (isNaN(n) || n < 0 || n >= SERVER_MODES.length) n = 0; /* default RAPIDO */
    return SERVER_MODES[n];
}
function wantServers() { return serverMode().want; }
function maxResults() { return serverMode().max; }
var SRC_CACHE_MS = 20 * 60 * 1000;
var BUDGET_MS = 35000;
var CORE_SITE_IDS = { "pelisplus": 1, "cinecalidad": 1, "flixlatam": 1, "pelisflixhd": 1 };
var MAX_WP_PROVIDERS = 4;

var PLPRO_BASE = "https://plpro.org";
var PLPRO_USER = "p";
var PLPRO_PASS = "p";

var _settings = {};
var _debug = "";
var _fail = {};
var _okh = {};
var FAIL_EXPIRE_MS = 15000;
var _deadline = 0;
var _pre = {};
var _spCache = {};
var _tmdbCache = {};
var _srcCache = {};
var _juanitaSlugIndex = {};
var _lat = {};

function log(s) { _debug += String(s) + "\n"; }
function resetDebug() { _debug = ""; }
function budgetLeft() { return Date.now() < _deadline; }
function startBudget() { _deadline = Date.now() + BUDGET_MS + serverMode().extra; }
function extraSites() { var v = _settings && _settings.extraSites; return v === true || v === "true" || v === 1 || v === "1"; }
/* Servidores Plus (OK.ru + Odysee + Dailymotion + Archive.org + YouTube).
   Por defecto DESACTIVADOS. Cuando se activan, corren como primera prioridad
   y luego siguen los proveedores normales (Poseidon/Cuevana/Juanita/etc.). */
function servidoresPlus() {
    var v = _settings && _settings.servidoresPlus;
    return v === true || v === "true" || v === 1 || v === "1";
}
/* Modo "solo OK.ru" (legacy): si está activo, salta Poseidon/Cuevana/etc.
   Por defecto APAGADO; preferir servidoresPlus. */
var ONLY_OKRU_DEFAULT = false;
function onlyOkru() {
    var v = _settings && _settings.soloOkru;
    if (v === undefined || v === null || v === "") return ONLY_OKRU_DEFAULT;
    return v === true || v === "true" || v === 1 || v === "1";
}
function debugMode() { var v = _settings && _settings.debugMode; return v === true || v === "true" || v === 1 || v === "1"; }

/* ------------------------------------------------------------------ */
/* utilidades de texto                                                 */
/* ------------------------------------------------------------------ */

function clean(s) {
    if (s == null) return "";
    return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
        .replace(/&#038;/g, "&").replace(/&#8217;/g, "'").replace(/\\u0026/g, "&").replace(/\\\//g, "/")
        .replace(/\s+/g, " ").trim();
}
function enc(s) { return encodeURIComponent(String(s == null ? "" : s)); }
function dec(s) { try { return decodeURIComponent(String(s || "")); } catch (e) { return String(s || ""); } }
function readBody(r) {
    if (!r) return "";
    if (typeof r == "string") return r;
    if (r.body != null) return String(r.body);
    if (r.data != null && typeof r.data == "string") return r.data;
    return "";
}
function hostOf(url) { var m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i); return m ? m[1].toLowerCase() : ""; }
function originOf(url) { var m = String(url || "").match(/^(https?:\/\/[^\/?#]+)/i); return m ? m[1] : ""; }
function absUrl(u, base) {
    u = clean(u);
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    var o = originOf(base) || String(base || "");
    if (u.charAt(0) === "/") return o + u;
    return o + "/" + u;
}
function cleanUrl(u) {
    u = String(u == null ? "" : u).replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
    return u.replace(/^[\s"']+/, "").replace(/[\s"'),;\\]+$/g, "");
}
function strip(s) {
    return clean(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}
function uniq(a) {
    var out = [], seen = {}, i;
    for (i = 0; i < a.length; i++) { var k = String(a[i]); if (a[i] && !seen[k]) { seen[k] = 1; out.push(a[i]); } }
    return out;
}
function stripAccents(s) {
    s = String(s == null ? "" : s);
    try { s = s.normalize("NFD"); } catch (e) {
        var from = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ", to = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC", i, r = "";
        for (i = 0; i < s.length; i++) { var p = from.indexOf(s.charAt(i)); r += p >= 0 ? to.charAt(p) : s.charAt(i); }
        return r;
    }
    return s.replace(/[\u0300-\u036f]/g, "");
}
function normalizeTitle(s) {
    return stripAccents(clean(s)).toLowerCase().replace(/&[^;\s]+;/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
var TITLE_NOISE = { "1080p": 1, "720p": 1, "480p": 1, "2160p": 1, "4k": 1, "uhd": 1, "hd": 1, "hdtv": 1,
    "latino": 1, "latam": 1, "castellano": 1, "espanol": 1, "doblado": 1, "doblaje": 1, "subtitulado": 1,
    "sub": 1, "subs": 1, "vose": 1, "vos": 1, "dual": 1, "audio": 1, "webdl": 1, "webrip": 1, "bluray": 1, "brrip": 1,
    "online": 1, "gratis": 1, "completa": 1, "pelicula": 1, "peliculas": 1, "serie": 1, "series": 1, "capitulo": 1, "temporada": 1,
    "m1080p": 1, "m720p": 1, "dl": 1, "dlatino": 1, "lat": 1, "esp": 1, "spa": 1, "spanish": 1, "english": 1,
    "ver": 1, "watch": 1, "movie": 1, "film": 1, "full": 1, "microhd": 1 };
function titleTokens(s) {
    var n = normalizeTitle(s), parts = n ? n.split(" ") : [], out = [], i;
    for (i = 0; i < parts.length; i++) if (parts[i].length > 1 && !TITLE_NOISE[parts[i]]) out.push(parts[i]);
    return out;
}
function tokenSimilarity(a, b) {
    var ta = titleTokens(a), tb = titleTokens(b), i, hit = 0, used = {};
    if (!ta.length || !tb.length) return 0;
    for (i = 0; i < ta.length; i++) { if (!used[ta[i]] && tb.indexOf(ta[i]) >= 0) { hit++; used[ta[i]] = 1; } }
    return Math.round((hit / Math.max(ta.length, tb.length)) * 100);
}
function titleCoverage(pageTitle, want) {
    var pt = titleTokens(pageTitle), wt = titleTokens(want), i, hit = 0;
    if (!wt.length) return 0;
    for (i = 0; i < wt.length; i++) if (pt.indexOf(wt[i]) >= 0) hit++;
    return Math.round((hit / wt.length) * 100);
}
function verifyPageTitle(html, ctx) {
    if (!html) return { ok: null, pageTitle: "" };
    var tm = /<title[^>]*>([^<]+)<\/title>/i.exec(html) || /property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = tm ? clean(strip(tm[1])) : "";
    if (!pageTitle) return { ok: null, pageTitle: "" };

    var cov = Math.max(titleCoverage(pageTitle, ctx.titleEs || ""), titleCoverage(pageTitle, ctx.titleEn || ""), titleCoverage(pageTitle, ctx.titleOrig || ""));

    var yr = (/\b((?:19|20)\d{2})\b/.exec(pageTitle) || [])[1] || "";

    if (!yr) {
        var metaYear = (/<meta[^>]+(?:name|property)=["'][^"']*(?:description|date|year)["'][^>]+content=["'][^"']*\b((?:19|20)\d{2})\b/i.exec(html) || [])[1] || "";
        if (metaYear) yr = metaYear;
    }

    var yearOk = !yr || !ctx.year || Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) <= 1;

    return { ok: cov >= 70 && yearOk, pageTitle: pageTitle, cov: cov, year: yr };
}
function slugJuanita(t) {
    return stripAccents(t).trim().replace(/[^a-zA-Z0-9]/g, " ").replace(/\s+/g, "-").replace(/-+/g, "-").toLowerCase();
}
function trimDash(s) { return String(s || "").replace(/^-+/, "").replace(/-+$/, ""); }
function slugCuevana(t) {
    return stripAccents(String(t || "").toLowerCase()).replace(/[\[\]^\/,'*:.!><~@#$%+=?|"\\()\u00bf\u00a1]+/g, "").trim().replace(/ +/g, "-").replace(/-+/g, "-");
}
function slugWords(u) {
    var p = String(u || "").split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() || "";
    return p.replace(/[-_]+/g, " ").replace(/\.html?$/i, "").replace(/\s+\d{4}$/, "");
}

function b64decode(s) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", out = "", i = 0, c1, c2, c3, c4, n;
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+\/=]/g, "");
    while (i < s.length) {
        c1 = chars.indexOf(s.charAt(i++)); c2 = chars.indexOf(s.charAt(i++)); c3 = chars.indexOf(s.charAt(i++)); c4 = chars.indexOf(s.charAt(i++));
        if (c1 < 0 || c2 < 0) break;
        n = (c1 << 18) | (c2 << 12) | ((c3 < 0 ? 0 : c3) << 6) | (c4 < 0 ? 0 : c4);
        out += String.fromCharCode((n >> 16) & 255);
        if (c3 >= 0 && s.charAt(i - 2) != "=") out += String.fromCharCode((n >> 8) & 255);
        if (c4 >= 0 && s.charAt(i - 1) != "=") out += String.fromCharCode(n & 255);
    }
    return out;
}

function attrsOf(tag) {
    var out = {}, re = /([a-zA-Z0-9_:\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, m;
    while ((m = re.exec(String(tag || ""))) != null) out[m[1].toLowerCase()] = clean(m[2] != null ? m[2] : m[3]);
    return out;
}
function attr(tag, name) { return attrsOf(tag)[String(name).toLowerCase()] || ""; }
function findTags(html, test) {
    var out = [], re = /<[a-zA-Z][^>]*>/g, m, t;
    while ((m = re.exec(html || "")) != null) {
        t = m[0];
        if (test.test(t)) { out.push({ tag: t, index: m.index, end: re.lastIndex }); if (out.length >= 300) break; }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function hdr(referer, extra) {
    var h = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "es-AR,es;q=0.9,en;q=0.8" }, k;
    if (referer) h["Referer"] = referer;
    if (extra) for (k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
}
function markFail(h) {
    var e = _fail[h];
    if (!e || Date.now() - e.at > FAIL_EXPIRE_MS) e = { count: 0, at: 0 };
    e.count++; e.at = Date.now();
    _fail[h] = e;
}
function clearFail(h) {
    if (h) { delete _fail[h]; delete _okh[h]; }
}
function clearOkruFails() {
    var keys = ["ok.ru", "www.ok.ru", "m.ok.ru", "odnoklassniki.ru"], i;
    for (i = 0; i < keys.length; i++) clearFail(keys[i]);
}
function hostDead(h) {
    var e = _fail[h];
    if (!e || Date.now() - e.at > FAIL_EXPIRE_MS) return false;
    return e.count >= 2 && !_okh[h];
}

function prefetchUrls(urls, referer) {
    urls = uniq(urls || []);
    if (!urls.length || !budgetLeft()) return;
    var todo = [], i;
    for (i = 0; i < urls.length; i++) { var u = urls[i]; if (u && !_pre.hasOwnProperty(u) && !hostDead(hostOf(u))) todo.push(u); }
    if (!todo.length) return;
    try {
        if (typeof http.batch == "function") {
            var b = http.batch(), j;
            for (j = 0; j < todo.length; j++) b = b.GET(todo[j], hdr(referer || (originOf(todo[j]) + "/")), false);
            var res = b.execute();
            for (j = 0; j < todo.length; j++) {
                var body = readBody(res[j]);
                if (body) { _okh[hostOf(todo[j])] = 1; _pre[todo[j]] = body.length > MAX_HTML ? body.substring(0, MAX_HTML) : body; }
                else { _pre[todo[j]] = ""; markFail(hostOf(todo[j])); }
            }
            return;
        }
    } catch (e) { log("prefetch -> " + e); }
}

function httpGet(url, referer, extra) {
    var h = hostOf(url), r, b;
    if (!h) return "";
    if (_pre.hasOwnProperty(url)) { b = _pre[url]; delete _pre[url]; if (b) return b; }
    if (hostDead(h)) { log("SKIP host caido " + h); return ""; }
    if (!budgetLeft()) { log("SIN TIEMPO " + url.substring(0, 80)); return ""; }
    try {
        r = http.GET(url, hdr(referer || (originOf(url) + "/"), extra), false);
        b = readBody(r);
        if (r && r.code >= 500) { log("HTTP " + r.code + " " + url.substring(0, 90)); markFail(h); return ""; }
        if (r && (r.code == 403 || r.code == 429) && !b) { log("HTTP " + r.code + " " + url.substring(0, 90)); markFail(h); return ""; }
        if (r && r.code == 404) { log("404 " + url.substring(0, 90)); return ""; }
        if (b) { _okh[h] = 1; if (b.length > MAX_HTML) b = b.substring(0, MAX_HTML); return b; }
        markFail(h);
        return "";
    } catch (e) {
        log("GET " + url.substring(0, 90) + " -> " + e);
        markFail(h);
        return "";
    }
}
function httpGetAuth(url, referer) {
    if (!budgetLeft()) return "";
    try {
        var hh = hdr(referer || "https://ok.ru/", null);
        var r = http.GET(url, hh, true);
        var b = readBody(r);
        if (b) {
            if (b.length > MAX_HTML) b = b.substring(0, MAX_HTML);
            return b;
        }
    } catch (e) { log("GET-auth " + String(url).substring(0, 60) + " -> " + e); }
    return "";
}
function httpPost(url, body, referer, extra) {
    var h = hostOf(url), r, b;
    if (hostDead(h) || !budgetLeft()) return "";
    try {
        var hd = hdr(referer || (originOf(url) + "/"), extra);
        hd["Content-Type"] = (extra && extra["Content-Type"]) || "application/x-www-form-urlencoded; charset=UTF-8";
        r = http.POST(url, body, hd, false);
        b = readBody(r);
        if (b) _okh[h] = 1;
        return b || "";
    } catch (e) {
        log("POST " + url.substring(0, 90) + " -> " + e);
        return "";
    }
}
function batchGet(urls, referer) {
    var out = [], need = [], idx = [], i, k;
    for (i = 0; i < urls.length; i++) {
        if (_pre.hasOwnProperty(urls[i]) && _pre[urls[i]]) { out[i] = _pre[urls[i]]; delete _pre[urls[i]]; }
        else { out[i] = ""; need.push(urls[i]); idx.push(i); }
    }
    if (!need.length) return out;
    try {
        if (typeof http.batch == "function" && need.length > 1 && budgetLeft()) {
            var b = http.batch();
            for (k = 0; k < need.length; k++) b = b.GET(need[k], hdr(referer || (originOf(need[k]) + "/")), false);
            var res = b.execute();
            for (k = 0; k < need.length; k++) {
                var body = readBody(res[k]);
                if (body) _okh[hostOf(need[k])] = 1;
                out[idx[k]] = body && body.length > MAX_HTML ? body.substring(0, MAX_HTML) : body;
            }
            return out;
        }
    } catch (e) { log("batch -> " + e); }
    for (k = 0; k < need.length; k++) out[idx[k]] = httpGet(need[k], referer);
    return out;
}
function parseJson(t) { try { return JSON.parse(t); } catch (e) { return null; } }

/* ------------------------------------------------------------------ */
/* TMDB                                                                */
/* ------------------------------------------------------------------ */

function tmdbUrl(path, lang) {
    return TMDB_API + path + (path.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + enc(TMDB_KEY) + "&language=" + (lang || "es-AR");
}
function tmdbGet(path, lang) {
    var key = path + "|" + (lang || "es-AR");
    if (_tmdbCache.hasOwnProperty(key)) return _tmdbCache[key];
    try {
        var r = http.GET(tmdbUrl(path, lang), { "User-Agent": UA, "Accept": "application/json" }, false), b = readBody(r);
        var j = b ? JSON.parse(b) : null;
        if (j) _tmdbCache[key] = j;
        return j;
    } catch (e) { log("TMDB " + path + " -> " + e); return null; }
}
function tmdbGetBatch(reqs) {
    var i, k, out = [], need = [], idx = [], key;
    for (i = 0; i < reqs.length; i++) {
        key = reqs[i].path + "|" + (reqs[i].lang || "es-AR");
        if (_tmdbCache.hasOwnProperty(key)) out[i] = _tmdbCache[key];
        else { out[i] = null; need.push(reqs[i]); idx.push(i); }
    }
    if (!need.length) return out;
    try {
        if (typeof http.batch == "function" && need.length > 1) {
            var b = http.batch();
            for (k = 0; k < need.length; k++) b = b.GET(tmdbUrl(need[k].path, need[k].lang), { "User-Agent": UA, "Accept": "application/json" }, false);
            var res = b.execute();
            for (k = 0; k < need.length; k++) {
                var body = readBody(res[k]), d = body ? parseJson(body) : null;
                out[idx[k]] = d;
                if (d) _tmdbCache[need[k].path + "|" + (need[k].lang || "es-AR")] = d;
            }
            return out;
        }
    } catch (e) { log("TMDB batch -> " + e); }
    for (k = 0; k < need.length; k++) out[idx[k]] = tmdbGet(need[k].path, need[k].lang);
    return out;
}
function img(p, base) { return p ? (base || TMDB_IMG) + p : ""; }
function yearOf(s) { var m = /^(\d{4})/.exec(String(s || "")); return m ? m[1] : ""; }
function unixOf(s) { if (!s) return 0; var t = new Date(String(s)).getTime(); return isNaN(t) ? 0 : Math.floor(t / 1000); }

function makeMovieUrl(id) { return SCHEME + "movie/" + id; }
function makeTvUrl(id, s, e) { return SCHEME + "tv/" + id + "/" + s + "/" + e; }
function makeShowUrl(id) { return SCHEME + "show/" + id; }
function parseInternal(url) {
    var s = String(url || ""), m = s.match(/^streamflixhub:\/\/movie\/(\d+)$/);
    if (m) return { kind: "movie", id: m[1] };
    m = s.match(/^streamflixhub:\/\/tv\/(\d+)\/(\d+)\/(\d+)$/);
    if (m) return { kind: "tv", id: m[1], season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
    m = s.match(/^streamflixhub:\/\/show\/(\d+)$/);
    if (m) return { kind: "show", id: m[1] };
    return null;
}
function parseAny(url) {
    var p = parseInternal(url);
    if (p) return { origin: "tmdb", p: p };
    if (typeof juanitaParseInternal == "function") {
        p = juanitaParseInternal(url);
        if (p) return { origin: "juanita", p: p };
    }
    if (typeof jkParseInternal == "function") {
        p = jkParseInternal(url);
        if (p) return { origin: "jk", p: p };
    }
    if (typeof ytParseInternal == "function") {
        p = ytParseInternal(url);
        if (p) return { origin: "yt", p: p };
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* fuentes de video                                                    */
/* ------------------------------------------------------------------ */

function reqMod(ref) {
    if (!ref) return null;
    var h = { "User-Agent": UA, "Referer": ref }, o = originOf(ref);
    if (o) h["Origin"] = o;
    return {
        headers: h,
        modifyRequest: function (url, headers) {
            headers = headers || {};
            var k;
            for (k in h) if (h.hasOwnProperty(k)) headers[k] = h[k];
            return { url: url, headers: headers };
        }
    };
}
function inferMediaType(u) {
    u = String(u || "");
    if (/\.mpd(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=(?:dash|mpd)/i.test(u) || /\/dash\//i.test(u)) return "dash";
    if (/\.m3u8(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=m3u8/i.test(u) || /\/hls\//i.test(u) || /playlist\.m3u8/i.test(u)) return "hls";
    if (/\.mp4(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=mp4/i.test(u)) return "mp4";
    return "";
}
/* mkSrc: fuente con Referer/Origin (requestModifier). force = "hls" | "mp4" | "dash".
   Devuelve null si no puede inferir el tipo (varios extractores dependen de eso). */
function mkSrc(u, label, ref, force) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var type = force || inferMediaType(u);
    var o = { name: label || "Video", url: u, duration: 0 };
    var rm = reqMod(ref);
    if (rm) o.requestModifier = rm;
    if (type == "hls") {
        try { return new HLSSource(o); } catch (e) { log("mkSrc hls -> " + e); return null; }
    }
    if (type == "dash" && typeof DashSource == "function") {
        try { return new DashSource(o); } catch (e) { log("mkSrc dash -> " + e); return null; }
    }
    if (type == "mp4") {
        o.width = 0; o.height = 0; o.container = "video/mp4"; o.codec = ""; o.bitrate = 0;
        try { return new VideoUrlSource(o); } catch (e) { log("mkSrc mp4 -> " + e); return null; }
    }
    return null;
}

/* Fuentes OK.ru / okcdn SIN requestModifier ni headers extra.
   El CDN ya firma la URL; inyectar Referer/Origin rompe reproducción nativa y Chromecast. */
function okRequestModifier() {
    var h = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    };
    return {
        headers: h,
        modifyRequest: function (url, headers) {
            var newHeaders = {};
            // Limpia las cabeceras de ExoPlayer y retiene solo el User-Agent
            for (var k in h) newHeaders[k] = h[k];
            return { url: url, headers: newHeaders };
        }
    };
}

function mkSrcBare(u, label, force) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var type = force || inferMediaType(u);
    
    var opts = { name: label || "HLS", url: u, duration: 0 };
    // Fundamental: previene que GrayJay envíe la cookie de sesión al CDN
    opts.requestModifier = okRequestModifier();

    if (type == "hls") {
        try { return new HLSSource(opts); } catch (e) { log("mkSrcBare hls -> " + e); return null; }
    }
    if (type == "dash" && typeof DashSource == "function") {
        opts.name = label || "DASH";
        try { return new DashSource(opts); } catch (e) { log("mkSrcBare dash -> " + e); return null; }
    }
    if (type == "mp4" || !type) {
        opts.name = label || "MP4";
        opts.width = 0; opts.height = 0; opts.container = "video/mp4"; opts.codec = ""; opts.bitrate = 0;
        try { return new VideoUrlSource(opts); } catch (e) { log("mkSrcBare mp4 -> " + e); return null; }
    }
    return null;
}
function addSrc(arr, s) {
    if (!s || !s.url) return;
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i].url == s.url) return;
    arr.push(s);
}

/* --- desempaquetador Dean Edwards (p.a.c.k.e.r) --- */
function unpackOne(p, a, c, k) {
    function e(n) {
        return (n < a ? "" : e(parseInt(n / a, 10))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
    }
    var d = {}, i;
    for (i = 0; i < c; i++) d[e(i)] = (k[i] && k[i].length) ? k[i] : e(i);
    var keys = [], ki;
    for (ki in d) if (d.hasOwnProperty(ki)) keys.push(ki);
    keys.sort(function (x, y) { return y.length - x.length; });
    for (i = 0; i < keys.length; i++) {
        if (!keys[i]) continue;
        p = p.replace(new RegExp("\\b" + keys[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), d[keys[i]]);
    }
    return p;
}
function unpackAll(text) {
    var out = [], re = /eval\(function\(p,a,c,k,e,(?:d|r)\)[\s\S]*?\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g, m;
    while ((m = re.exec(String(text || ""))) != null) {
        try { out.push(unpackOne(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4].split("|"))); } catch (e) { log("unpack " + e); }
        if (out.length >= 6) break;
    }
    return out;
}
function extractPackedSources(html, pageUrl, label) {
    var out = [], base = originOf(pageUrl) + "/", texts, i, t, m, re, u;
    if (!html) return out;
    texts = [String(html)].concat(unpackAll(html));
    for (i = 0; i < texts.length; i++) {
        t = normalizeMediaText(texts[i]);
        var pats = [
            /(?:["']?hls\d*["']?|["']?file["']?)\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.m3u8[^"']*)["']/gi,
            /(?:url\s*:\s*|loadSource\(\s*)['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/gi,
            /(?:file|src)\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi,
            /["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi,
            /sources?\s*[:=]\s*\[\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi,
            /["']file["']\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            /["']hls\d*["']\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.m3u8[^"']*)["']/gi,
            /["']src["']\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            /file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
            /source\s*=\s*["']((?:https?:\/\/|\/)[^"']+\.m3u8[^"']*)["']/gi,
            /player\.src\(\s*["']([^"']+)["']/gi,
            /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi,
            /https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/gi
        ];
        var pi;
        for (pi = 0; pi < pats.length; pi++) {
            re = pats[pi];
            re.lastIndex = 0;
            while ((m = re.exec(t)) != null) {
                u = m[1] || m[0];
                if (!u || u.length < 8) continue;
                addMediaCandidate(out, absUrl(u, base), label, pageUrl, base);
                if (out.length >= 10) return out;
            }
        }
        re = /["'](\/[^"']*master[^"']*)["']/gi;
        while ((m = re.exec(t)) != null) {
            u = m[1];
            if (!/\.m3u8/i.test(u)) u = u.replace(/\.[a-z0-9]{1,5}$/i, ".m3u8");
            addMediaCandidate(out, absUrl(u, base), label, pageUrl, base);
        }
        if (out.length) return out;
    }
    return out;
}

function normalizeMediaText(t) {
    return String(t || "")
        .replace(/\\u0026/gi, "&").replace(/\\u002F/gi, "/")
        .replace(/\\u003A/gi, ":").replace(/\\u003F/gi, "?")
        .replace(/\\u003D/gi, "=").replace(/\\u0023/gi, "#")
        .replace(/\\\//g, "/").replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}
function addMediaCandidate(out, u, label, ref, base) {
    u = cleanUrl(normalizeMediaText(u));
    if (!u) return;
    if (u.indexOf("//") === 0) u = "https:" + u;
    else if (u.charAt(0) == "/" && u.charAt(1) != "/" && base) u = base + u;
    if (!/^https?:\/\//i.test(u)) return;
    if (!/\.(?:m3u8|mp4|mpd)(?:[?#]|$)/i.test(u) && !/\b(?:m3u8|mp4|mpd)\b/i.test(u)) return;
    var s = mkSrc(u, label, ref);
    if (!s) {
        if (/\.m3u8(?:[?#]|$)/i.test(u) || /\bm3u8\b/i.test(u)) s = mkSrc(u, label || "HLS", ref, "hls");
        else if (/\.mp4(?:[?#]|$)/i.test(u)) s = mkSrc(u, label || "MP4", ref, "mp4");
    }
    if (s) addSrc(out, s);
}
function isDirectMediaUrl(u) {
    u = normalizeMediaText(cleanUrl(u));
    return /^https?:\/\//i.test(u) && !!inferMediaType(u);
}
function scanMedia(text, label, ref, pageUrl) {
    var out = [], texts = [normalizeMediaText(text)], i, m, re, base = originOf(pageUrl);
    var un = unpackAll(text);
    for (i = 0; i < un.length; i++) texts.push(normalizeMediaText(un[i]));
    for (i = 0; i < texts.length; i++) {
        var t = texts[i];
        re = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[0], label, ref, base);
        re = /(?:^|["'\s=(])((?:\/\/)[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?)/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        re = /["']?(?:file|src|source|hls\d*|url|link|stream|playlist|dash|hlsManifestUrl|hlsMasterPlaylistUrl)["']?\s*[:=]\s*["']([^"']+)["']/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        re = /(?:file|src|source|url|link|stream|playlist|hlsManifestUrl|hlsMasterPlaylistUrl)\s*[:=]\s*\\?["'](https?:[^\\"']+)/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        re = /\{[^{}]{0,500}?(?:file|src|source|url|hls)\s*[:=]\s*["'](https?:[^"']+)["']/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* hosts de embeds                                                     */
/* ------------------------------------------------------------------ */

var SERVER_HOSTS = ["streamsb.net", "streamsss.net", "ssbstream.net", "watchsb.com", "sbanh.com", "sbfast.com", "sbfast.live", "sbplay.one", "sbplay.org", "sbplay1.com", "sbplay2.com", "sbplay2.xyz", "sbplay3.com", "sbfull.com", "sbbrisk.com", "sblongvu.com", "sbembed.com", "sbembed1.com", "playersb.com", "embedsb.com", "viewsb.com", "lvturbo.com",
    "dood.", "doodstream.", "dooood.", "dood.cx", "dood.la", "dood.pm", "dood.sh", "dood.so", "dood.to", "dood.watch", "dood.wf", "dood.ws", "dood.yt", "dood.li",
    "uqload.", "uqload.com", "uqload.co", "uqload.cx", "voe.sx", "streamtape.", "upstream.to", "streamlare.", "streamhub.to", "streamsss.net", "plusvip.net", "sololatino.net", "zplayer.live", "v2.zplayer.live", "fastream.to", "vidcloud9.org", "doc.vidcloud9.org", "cloudemb.com", "embedsito.net",
    "okru.link", "ok.ru", "moonplayer.", "moonplayer.lat", "playhide.online", "esplay.", "mycdn.moe", "acek-cdn.com", "dramiyos-cdn.com", "solo-latino.com", "owodeuwu.xyz", "suzihaza.com",
    "streamwish", "hlswish", "wishembed", "awish", "vidhide", "filelions", "filemoon", "mixdrop", "mxdrop", "supervideo", "xupalace", "nuuuppp", "playhubconnect", "saidochesto",
    "vimeos", "callistanise", "hgcloud.", "vimeo.com", "vk.com", "vkvideo.ru", "odnoklassniki", "streamhub", "embedwish", "dhcplay", "minochinos", "lulustream", "luluvdo", "vtube", "vidguard", "bigwarp", "player.cuevana3", "vimeus.", "goodstream.",
    "fortamomar.workers.dev", "seriesplayer.", "onfilom.com", "playspelis.com", "afterdark.best", "chillx.top", "closeload.top", "dokicloud.one", "dropload.io", "frembed.casa", "fsvid.lol", "gupload.xyz", "gxplayer.xyz", "hxfile.co", "lamovie.link", "loadx.ws", "magasavor.net", "maxstream.video", "moviesapi.club", "oneupload.net", "primesrc.me", "rabbitstream.net", "ridoo.net", "rpmvid.com", "savefiles.com", "sharecloudy.com", "streamix.so", "streamruby.com", "upzur.com", "upzone.to", "veev.to", "vidguard.to", "vidlink.pro", "vidara.to", "videasy.net", "vidflix.club", "vidnest.io", "vidora.stream", "vidplay.online", "vidrock.net", "vidsonic.net", "vidsrc.to", "vidxgo.co", "vidzee.wtf", "vidzy.org", "vixsrc.to", "vixcloud.co", "zilla-networks.com", "bigwarp.io", "goodstream.one", "vidoza.net", "vidmoly.to", "vidmoly.me", "swdyu.com", "strwish.com", "playerwish.com", "luluvdo.com", "supervideo.cc", "nupload.me", "closeload.com", "mixdrop.ag", "filemoon.sx", "filemoon.site", "321moviesfree.com", "flixlat.com",
    "hglink.to", "morencius.com", "futuretravelroute.space"];
var UNSUPPORTED = ["waaw.", "netu.", "hqq.", "younetu.", "hqtv.", "biribup.", "cuevana3.download", "1fichier."];

var DOMAINS = {
    poseidon: ["https://www.poseidonhd2.co", "https://poseidonhd2.co"],
    juanita: ["https://pelisjuanita.com"],
    pelisflix1: ["https://pelisflix1.tv", "https://pelisflix1.de", "https://pelisflix1.link", "https://pelisflix1.at", "https://pelisflix1.surf"],
    pelisflixhd: ["https://pelisflixhd.win"],
    cuevana_main: ["https://www.cuevana3.eu", "https://cuevana3.cc", "https://cuevana19.com", "https://es.cuevana4br.com", "https://cuevana3.ai", "https://cuevana3.me", "https://cuevana3.so", "https://cuevana2.biz"],
    cuevana_alt: ["https://cuevana3e.pro"],
    pelisplusto: ["https://pelisplus.to", "https://www.pelisplus.to"],
    pelisplushd: ["https://pelisplushd.bz", "https://pelisplushd.nu", "https://pelisplus2.ai"],
    sololatino: ["https://sololatino.net"],
    cinecalidad: ["https://www.cinecalidad.ec", "https://cinecalidad.onl"],
    flixlatam: ["https://flixlatam.com"],
    esplay: ["https://api.esplay.one", "https://pelisplus.esplay.one", "https://static.esplay.one", "https://pelisplus.esplay.io", "https://pelisplus2.ai"],
    plpro: ["https://plpro.org"],
    gnula: ["https://gnula.uno"],
    lacartoons: ["https://www.lacartoons.com"],
    mirrors: ["https://playspelis.com", "https://peliculaplay.com", "https://solo-latino.com", "https://flixlat.com", "https://onfilom.com",
        "https://akm-cdn-play-web.onfilom.com", "https://r-limit.flixlat.com", "https://vod-limit-02.playspelis.com",
        "https://seriesplayer.fortamomar.workers.dev", "https://api.mycdn.moe", "https://acek-cdn.com"]
};
var WISH_HOSTS = [
    "streamwish.to", "streamwish.com", "streamwish.biz", "streamwish.cc", "streamwish.club", "streamwish.fun",
    "streamwish.info", "streamwish.live", "streamwish.me", "streamwish.net", "streamwish.org", "streamwish.site",
    "strwish.com", "strmwis.xyz", "swdyu.com", "swhoi.com", "swish.site", "swishsrv.com", "hlswish.com",
    "playerwish.com", "embedwish.com", "awish.pro", "awish.top", "dwish.pro", "dwish.top", "mwish.pro", "mwish.top",
    "flaswish.com", "sfastwish.com", "cdnwish.com", "jodwish.com", "obeywish.com", "wishembed.pro", "wishfast.top",
    "wishon.site", "wishonly.site", "vidwish.live", "vidwish.site", "asnwish.com", "juliewomanwish.com"
];
var VOE_HOSTS = [
    "charlestoughrace.com", "christopheruntilpoint.com", "crystaltreatmenteast.com", "dianaavoidthey.com",
    "jefferycontrolmodel.com", "jessicayeahcatch.com", "jilliandescribecompany.com", "johnbeyondnation.com",
    "juliewomanwish.com", "lancewhosedifficult.com", "lauradaydo.com", "mikaylaarealike.com",
    "rebeccapracticeloss.com", "richardquestionbuilding.com", "voe.sx", "walterprettytheir.com"
];
var MOON_HOSTS = [
    "bf0skv.org", "bysebuho.com", "bysejikuar.com", "bysekoze.com", "bysesayeveum.com", "bysezoxexe.com",
    "filemoon.site", "filemoon.sx", "moflix-stream.link"
];
var DOOD_HOSTS = [
    "d000d.com", "do7go.com", "dood.la", "dood.li", "doods.to", "dooood.com", "dsvplay.com", "myvidplay.com",
    "playmogo.com", "poophq.com"
];
var MIX_HOSTS = [
    "m1xdrop.net", "miiixdrop.net", "miixdrop.net", "mixdrop.ag", "mixdrop.bz", "mixdrop.ch", "mixdrop.club",
    "mixdrop.co", "mixdrop.cv", "mixdrop.to", "mxdrop.to"
];
var VIDHIDE_HOSTS = [
    "callistanise.com", "dhcplay.com", "dhtpre.com", "dingtezuni.com", "dintezuvio.com", "filelions.to",
    "minochinos.com", "moflix-stream.click", "morencius.com", "peytonepre.com", "vidhidefast.com", "vidhideplus.com",
    "vidhidepro.com"
];
var TAPE_HOSTS = [
    "streamta.site", "streamtape.com", "streamtape.net", "streamtape.to"
];
var UQLOAD_HOSTS = [
    "uqload.com", "uqload.cx", "uqload.is"
];
var FILE_HOSTS = [
    "bigwarp.cc", "bigwarp.io", "bigwarp.pro", "goodstream.one", "lamovie.link", "luluvdo.com", "luluvdoo.com",
    "luluvid.com", "moflix-stream.fans", "mp4upload.com", "rubystm.com", "rubyvid.com", "stmruby.com",
    "streamhub.to", "streamruby.com", "supervideo.cc", "upzone.cc", "upzone.link", "upzone.net", "upzone.to",
    "videzz.net", "vidmoly.me", "vidmoly.net", "vidmoly.org", "vidmoly.to", "vidoza.net", "vimeos.net", "vtbe.to",
    "vtube.to", "www.mp4upload.com", "www.yourupload.com", "www.yucache.net"
];

function hostIn(h, list) {
    var i, a;
    h = String(h || "").toLowerCase().replace(/^www\./, "");
    for (i = 0; i < list.length; i++) {
        a = list[i];
        if (h == a) return true;
        if (h.length > a.length && h.substring(h.length - a.length - 1) == "." + a) return true;
    }
    return false;
}
SERVER_HOSTS = SERVER_HOSTS.concat(WISH_HOSTS, VOE_HOSTS, MOON_HOSTS, DOOD_HOSTS, MIX_HOSTS, VIDHIDE_HOSTS, TAPE_HOSTS, UQLOAD_HOSTS, FILE_HOSTS);

function hostMatches(h, list) {
    var i;
    for (i = 0; i < list.length; i++) if (h.indexOf(list[i]) >= 0) return true;
    return false;
}
function isServerUrl(u) { return hostMatches(hostOf(u), SERVER_HOSTS); }
function isPackerFamily(h) {
    h = String(h || "");
    return hostIn(h, WISH_HOSTS) || hostIn(h, VIDHIDE_HOSTS) || hostIn(h, MOON_HOSTS) || h.indexOf("morencius") >= 0 || h.indexOf("hglink") >= 0 || h.indexOf("hgcloud") >= 0 ||
        h.indexOf("vidhide") >= 0 || h.indexOf("callistanise") >= 0 ||
        h.indexOf("filelions") >= 0 || h.indexOf("lulustream") >= 0 || h.indexOf("luluvdo") >= 0 ||
        h.indexOf("streamwish") >= 0 || h.indexOf("hlswish") >= 0 || h.indexOf("wishembed") >= 0 ||
        h.indexOf("awish") >= 0 || h.indexOf("embedwish") >= 0 || h.indexOf("filemoon") >= 0;
}
function unwrapEmbedUrl(url) {
    var u = cleanUrl(url), m, real;
    m = /[?&]v=([^&]+)/.exec(u);
    if (m) {
        real = cleanUrl(b64decode(dec(m[1])));
        if (/^https?:\/\//i.test(real) && real != u) return real;
    }
    return u;
}

function htmlUnescape(s) {
    return String(s || "").replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, function (c) { var b = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
}
function reverseStr(s) { return String(s).split("").reverse().join(""); }
function jsonAfter(text, marker) {
    var i = String(text || "").indexOf(marker), j, depth = 0, inStr = false, q = "", esc = false, start = -1, ch;
    if (i < 0) return null;
    for (j = i + marker.length; j < text.length && j < i + 400000; j++) {
        ch = text.charAt(j);
        if (start < 0) { if (ch == "{") { start = j; depth = 1; } continue; }
        if (inStr) { if (esc) esc = false; else if (ch == "\\") esc = true; else if (ch == q) inStr = false; continue; }
        if (ch == '"' || ch == "'") { inStr = true; q = ch; continue; }
        if (ch == "{") depth++;
        else if (ch == "}") { depth--; if (depth === 0) return parseJson(text.substring(start, j + 1)); }
    }
    return null;
}

/* ---- VOE ---- */
var VOE_LUT = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
function voeDecodeWith(enc, lut) {
    var t = rot13(enc), i;
    for (i = 0; i < lut.length; i++) t = t.split(lut[i]).join("");
    var s = b64decode(t), u = "";
    for (i = 0; i < s.length; i++) u += String.fromCharCode(s.charCodeAt(i) - 3);
    return parseJson(b64decode(reverseStr(u)));
}
function srcsFromVoeJson(o, label, ref) {
    var out = [], k, v;
    if (!o) return out;
    for (k in o) {
        if (!o.hasOwnProperty(k)) continue;
        v = o[k];
        if (typeof v != "string" || !/^https?:\/\//i.test(v)) continue;
        if (/direct_access|mp4/i.test(k) || /\.mp4(?:[?#]|$)/i.test(v)) addSrc(out, mkSrc(v, label + " MP4", ref, "mp4"));
        else if (/^(?:source|hls|file|url|src)$/i.test(k)) addSrc(out, mkSrc(v, label, ref, "hls"));
    }
    return out;
}
function voeFromHtml(h, pageUrl, label) {
    var out = [], m = /json">\s*\[\s*"([^"]+)"\s*\]\s*<\/script>\s*(?:<script[^>]+src="([^"]+)")?/i.exec(h || ""), ref = originOf(pageUrl) + "/", luts = [], i;
    if (!m) {
        var re = /['"](hls|mp4)['"]\s*:\s*['"]([^'"]+)['"]/gi, mm;
        while ((mm = re.exec(h || "")) != null) {
            var v = mm[2];
            if (!/^https?:/i.test(v)) { var d = b64decode(v); if (/^https?:/i.test(d)) v = d; }
            addSrc(out, mkSrc(v, label, ref, mm[1].toLowerCase() == "mp4" ? "mp4" : "hls"));
        }
        if (!out.length) {
            out = scanMedia(h, label, ref, pageUrl);
            log("    voe: sin bloque cifrado (largo html=" + (h || "").length + ")" + (out.length ? " -> scanMedia genérico encontró " + out.length : ""));
        }
        return out;
    }
    if (m[2]) {
        var js = httpGet(absUrl(m[2], pageUrl), pageUrl), lm = /(\[(?:'\W{2}'[,\]]){1,9})/.exec(js || "");
        if (lm) { var arr = lm[1].slice(2, -2).split("','"); if (arr.length) luts.push(arr); log("    voe: LUT del js = " + arr.join(" ")); }
    }
    luts.push(VOE_LUT);
    for (i = 0; i < luts.length; i++) {
        var o = null;
        try { o = voeDecodeWith(m[1], luts[i]); } catch (e) { log("    voe decode " + e); }
        if (o) {
            out = srcsFromVoeJson(o, label, ref);
            log("    voe: json ok, claves=" + Object.keys(o).slice(0, 8).join(",") + " -> " + out.length);
            if (out.length) return out;
        }
    }
    log("    voe: no se pudo descifrar (largo bloque=" + m[1].length + ")");
    return out;
}
function exVidhide(url, label, ref) {
    var hosts = [], h0 = hostOf(url), path, i, u, html, out = [], base;
    path = String(url || "").replace(/^https?:\/\/[^\/]+/i, "");
    if (/\/v\//i.test(path) && !/\/e\//i.test(path)) path = path.replace(/\/v\//i, "/e/");
    hosts.push(h0);
    if (/vidhide|callistanise|filelions|morencius|hglink|dintez|dingte|peytone|moflix-stream/i.test(h0)) {
        var mirrors = ["callistanise.com", "filelions.to", "vidhideplus.com", "vidhidefast.com", "morencius.com", "hglink.to"];
        for (i = 0; i < mirrors.length; i++) if (mirrors[i] != h0) hosts.push(mirrors[i]);
    }
    for (i = 0; i < hosts.length && !out.length && budgetLeft(); i++) {
        u = "https://" + hosts[i] + path;
        base = "https://" + hosts[i] + "/";
        html = httpGet(u, ref || base);
        if (!html || html.length < 300) continue;
        out = extractPackedSources(html, u, label || "VidHide");
        if (!out.length) out = scanMedia(html, label || "VidHide", u, u);
        if (out.length) { log("    vidhide OK @" + hosts[i] + " -> " + out.length); return out; }
    }
    log("    vidhide/callistanise: sin m3u8");
    return out;
}

function exVoe(url, label, ref) {
    var h = httpGet(url, ref), tries = 0, m, cur = url;
    while (h && tries < 3) {
        var out = voeFromHtml(h, cur, label);
        if (out.length) return out;
        m = /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i.exec(h);
        if (!m || /^(?:#|javascript)/i.test(m[1])) break;
        cur = absUrl(m[1], cur);
        log("    voe: redirect -> " + cur.substring(0, 80));
        h = httpGet(cur, url);
        tries++;
    }
    return [];
}

function exUqload(url, label) {
    var u = String(url || ""); if (u.indexOf(".html") < 0) u += ".html";
    var h = httpGet(u, url), m = /sources\s*:\s*\[([^\]]+)\]/i.exec(h || ""), out = [], parts, i;
    if (!m) return out;
    parts = m[1].replace(/\\"/g, "").replace(/"/g, "").split(",");
    for (i = 0; i < parts.length; i++) addSrc(out, mkSrc(clean(parts[i]), label, "https://uqload.com/"));
    return out;
}
function exStreamTape(url, label) {
    var h = httpGet(url, url), m = /robotlink'\)\.innerHTML\s*=\s*'(.+?)'\s*\+\s*\('(.+?)'\)/i.exec(h || "");
    if (!m) return [];
    var s = mkSrc("https:" + m[1] + m[2].substring(3), label, "https://streamtape.com/");
    return s ? [s] : [];
}
function exDood(url, label) {
    var host = hostOf(url) || "dood.wf", id = (String(url).split("/e/")[1] || String(url).split("/d/")[1] || "").split(/[?#]/)[0];
    if (!id) return [];
    var base = "https://" + host, h = httpGet(base + "/e/" + id, base + "/"), m = /\/pass_md5\/[^'"]*/.exec(h || "");
    if (!m) return [];
    var body = httpGet(base + m[0], base + "/e/" + id);
    if (!body || body.length > 1000) return [];
    var tok = m[0].split("/").pop() || "", rnd = "", i, chs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (i = 0; i < 10; i++) rnd += chs.charAt(Math.floor(Math.random() * chs.length));
    var s = mkSrc(body + rnd + "?token=" + tok + "&expiry=" + Date.now() + "#.mp4", label, base + "/");
    if (!s) { s = mkSrc(body + rnd + "?token=" + tok + "&expiry=" + Date.now() + ".mp4", label, base + "/"); }
    return s ? [s] : [];
}
function exPlusVip(url, label) {
    var h = httpGet(url, "https://plusvip.net/"), m = /['"]\/sources\/([^'"]+)/i.exec(h || "");
    if (!m) return [];
    var linkPart = String(url).split("?data=")[1] || "", out = [];
    var b = httpPost("https://plusvip.net/sources/" + m[1], "link=" + enc(linkPart), url), x = /\{link:\s*([^}]+)\}/i.exec(b || "");
    if (x) addSrc(out, mkSrc(x[1].replace(/\\/g, ""), label, "https://plusvip.net/"));
    return out;
}
function exEsplay(url, label) {
    var id = String(url).split("#")[1] || (String(url).match(/[?&](?:id|v)=([A-Za-z0-9_-]+)/) || [])[1] || "";
    if (!id) { var pm = String(url).match(/\/(?:video|player)\/([A-Za-z0-9_-]+)/i); if (pm) id = pm[1]; }
    if (!id) return [];
    var bases = [
        "https://api.mycdn.moe/video/",
        "https://api.mycdn.moe/player/?id=",
        "https://pelisplus.esplay.one/video/",
        "https://pelisplus.esplay.io/video/"
    ], ref = "https://pelisplus.esplay.io/", i, b, d, s, media;
    for (i = 0; i < bases.length; i++) {
        if (!budgetLeft()) break;
        b = httpGet(bases[i] + id, ref);
        if (!b) continue;
        d = parseJson(b);
        if (d) {
            s = mkSrc(d.file || d.url || d.source || (d.data && (d.data.file || d.data.url)) || "", label, ref);
            if (s) return [s];
        }
        media = scanMedia(b, label, ref, ref);
        if (media.length) return media;
    }
    return [];
}
function exFastream(url, label) {
    var n = String(url).indexOf("embed-") >= 0 ? (String(url).split("embed-").pop() || "").replace(".html", "") : (String(url).split("html?").pop() || "");
    if (!n) return [];
    var h = httpPost("https://fastream.to/dl", "op=embed&file_code=" + enc(n) + "&auto=1&referer=", "https://fastream.to/emb.html?" + n, { "Origin": "https://fastream.to" });
    return scanMedia(h, label, "https://fastream.to/", "https://fastream.to/");
}
/* ---- OK.ru ---- */
var OK_RANK = { "ultra": 7, "quad": 6, "full": 5, "hd": 4, "sd": 3, "low": 2, "lowest": 1, "mobile": 0 };
var OK_LABEL = { "ultra": "2160p", "quad": "1440p", "full": "1080p", "hd": "720p", "sd": "480p", "low": "360p", "lowest": "240p", "mobile": "144p" };
function okParseMeta(h) {
    if (!h) return null;
    var m = /data-options=(?:"([^"]*)"|'([^']*)')/i.exec(h), meta = null, o, fv;
    if (m) {
        o = parseJson(htmlUnescape(m[1] != null ? m[1] : m[2]));
        fv = o && o.flashvars;
        if (fv) {
            meta = fv.metadata;
            if (typeof meta == "string") meta = parseJson(htmlUnescape(meta));
            if (!meta && fv.metadataUrl) {
                var mu = String(fv.metadataUrl).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
                if (mu.indexOf("//") === 0) mu = "https:" + mu;
                meta = parseJson(httpGet(mu, "https://ok.ru/")) || parseJson(httpPost(mu, "", "https://ok.ru/"));
            }
        }
    }
    if (!meta) {
        var t = htmlUnescape(h)
            .replace(/\\u0026/gi, "&").replace(/\\u002F/gi, "/").replace(/\\u003A/gi, ":")
            .replace(/\\\//g, "/").replace(/\\"/g, '"');
        var mm = /"metadata"\s*:\s*"(\{[\s\S]*?\})"/.exec(t);
        if (mm) {
            try { meta = parseJson(mm[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")); } catch (e1) { meta = null; }
        }
        if (!meta) {
            var hls = /"hlsManifestUrl"\s*:\s*"([^"]+)"/i.exec(t);
            var vids = [];
            var vr = /"name"\s*:\s*"(mobile|lowest|low|sd|hd|full|quad|ultra)"\s*,\s*"url"\s*:\s*"([^"]+)"/gi, vm;
            while ((vm = vr.exec(t)) != null) vids.push({ name: vm[1], url: vm[2].replace(/\\u0026/gi, "&").replace(/\\\//g, "/") });
            if (hls || vids.length) meta = { hlsManifestUrl: hls ? hls[1].replace(/\\u0026/gi, "&").replace(/\\\//g, "/") : "", videos: vids };
        }
    }
    return meta;
}
function exOkRu(url, label, ref) {
    var id = (String(url).match(/(?:videoembed|video|live)\/(\d+)/) || String(url).match(/[?&](?:id|mid)=(\d+)/) || [])[1];
    if (!id) { log("    ok.ru: sin id en " + url.substring(0, 80)); return []; }
    var R = "https://ok.ru/", out = [], h, meta;
    h = httpGet("https://ok.ru/videoembed/" + id, R);
    if (!h) h = httpGet("https://ok.ru/video/" + id, R);
    if (!h) { log("    ok.ru: sin HTML id=" + id); return out; }
    meta = okParseMeta(h);
    if (!meta) {
        log("    ok.ru: sin metadata id=" + id + " html=" + h.length);
        return out;
    }
    if (meta.error) log("    ok.ru: error metadata=" + String(meta.error).substring(0, 80));
    out = okruSourcesFromMeta(meta, label || "OK.ru");
    log("    ok.ru id=" + id + " out=" + out.length);
    return out;
}

function exVk(url, label, ref) {
    var u = cleanUrl(url), m = /video(-?\d+)_(\d+)/.exec(u);
    if (u.indexOf("video_ext.php") < 0 && m) u = "https://vk.com/video_ext.php?oid=" + m[1] + "&id=" + m[2] + ((/[?&]hash=([0-9a-f]+)/i.exec(u) || [])[0] || "").replace(/^\?/, "&");
    var R = hostOf(u).indexOf("vkvideo") >= 0 ? "https://vkvideo.ru/" : "https://vk.com/", h = httpGet(u, ref || R), out = [], list = [], re, k;
    if (!h) return out;
    re = /"url(\d{3,4})"\s*:\s*"([^"]+)"/g;
    while ((k = re.exec(h)) != null) list.push({ q: parseInt(k[1], 10), u: k[2] });
    list.sort(function (a, b) { return b.q - a.q; });
    var hl = /"(?:hls|hls_ondemand)"\s*:\s*"([^"]+)"/i.exec(h);
    if (hl) addSrc(out, mkSrc(hl[1], label + " HLS", R, "hls"));
    var i;
    for (i = 0; i < list.length; i++) addSrc(out, mkSrc(list[i].u, label + " " + list[i].q + "p", R, "mp4"));
    if (!out.length) {
        var err = /"(?:error|error_text|msg)"\s*:\s*"([^"]{3,120})"/i.exec(h);
        log("    vk: sin fuentes (largo=" + h.length + (err ? ", " + err[1] : "") + ")");
    } else log("    vk: hls=" + (hl ? "si" : "no") + " mp4=" + list.length);
    return out;
}

/* ---- Vimeo ---- */
function vimeoSources(cfg, label) {
    var out = [], R = "https://player.vimeo.com/", files = cfg && cfg.request && cfg.request.files, i, k;
    if (!files) return out;
    if (files.hls) {
        var cdns = files.hls.cdns || {}, def = files.hls.default_cdn, c = cdns[def] || null;
        if (!c) for (k in cdns) if (cdns.hasOwnProperty(k)) { c = cdns[k]; break; }
        var hu = (c && (c.url || c.avc_url)) || files.hls.url || "";
        if (hu) addSrc(out, mkSrc(hu, label + " HLS", R, "hls"));
    }
    var pr = (files.progressive || []).slice(0);
    pr.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
    for (i = 0; i < pr.length; i++) if (pr[i].url) addSrc(out, mkSrc(pr[i].url, label + " " + (pr[i].quality || pr[i].height || "MP4"), R, "mp4"));
    return out;
}
function exVimeo(url, label, ref) {
    var id = (/(?:player\.vimeo\.com\/video|vimeo\.com)\/(?:video\/)?(\d+)/.exec(url) || [])[1];
    if (!id) return [];
    var hash = (/[?&]h=([0-9a-f]+)/i.exec(url) || /vimeo\.com\/\d+\/([0-9a-f]{8,})/i.exec(url) || [])[1] || "";
    var refs = uniq([ref || "", ref ? originOf(ref) + "/" : "", "https://player.vimeo.com/"]), i, out = [], q = hash ? "?h=" + hash : "";
    for (i = 0; i < refs.length && !out.length && budgetLeft(); i++) {
        var cfg = parseJson(httpGet("https://player.vimeo.com/video/" + id + "/config" + q, refs[i] || "https://player.vimeo.com/"));
        if (!cfg) {
            var page = httpGet("https://player.vimeo.com/video/" + id + q, refs[i] || "https://player.vimeo.com/");
            cfg = jsonAfter(page, "playerConfig = ") || jsonAfter(page, "playerConfig=") || jsonAfter(page, "var config = ");
        }
        out = vimeoSources(cfg, label);
        log("    vimeo id=" + id + (hash ? " h" : "") + " ref=" + (refs[i] || "-").substring(0, 40) + " -> " + out.length + (cfg && cfg.message ? " (" + String(cfg.message).substring(0, 80) + ")" : (cfg ? "" : " (sin config)")));
    }
    return out;
}

function discoverLinks(html, pageUrl) {
    var out = [], m, re, u, base = originOf(pageUrl), i, tags;
    function add(x) {
        x = cleanUrl(x);
        if (!x) return;
        x = absUrl(x, pageUrl);
        if (!/^https?:\/\//i.test(x) || x == pageUrl) return;
        if (out.indexOf(x) < 0 && out.length < 12) out.push(x);
    }
    tags = findTags(html, /^<iframe\b/i);
    for (i = 0; i < tags.length; i++) { var a = attrsOf(tags[i].tag); add(a["data-src"] || a["src"] || ""); }
    re = /(?:location(?:\.href)?|window\.location(?:\.href)?)\s*=\s*["']([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) add(m[1]);
    re = /var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi;
    while ((m = re.exec(html)) != null) add(m[1]);
    re = /location\.replace\(\s*["']([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) add(m[1]);
    re = /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) add(m[1]);
    re = /data-(?:video|link|url|tr|server|embed-url)=["']([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) {
        u = m[1];
        if (!/^https?:|^\//.test(u)) { var d = b64decode(u.split("?v=")[1] || u); if (/^https?:\/\//i.test(d)) u = d; }
        add(u);
    }
    re = /go_to_player\(['"]([^'"]+)/gi;
    while ((m = re.exec(html)) != null) add(m[1].indexOf("http") == 0 ? m[1] : "https://api.mycdn.moe/player/?id=" + m[1]);
    re = /https?:\/\/[^\s"'<>\\]+/gi;
    while ((m = re.exec(html)) != null) { if (isServerUrl(m[0]) && !/\.(?:js|css|png|jpe?g|gif|svg|ico|woff2?)(?:[?#]|$)/i.test(m[0])) add(m[0]); }
    return out;
}

function exGeneric(url, label, ref, depth) {
    var h = httpGet(url, ref || (originOf(url) + "/")), out, i, links;
    if (!h) return [];
    out = scanMedia(h, label, url, url);
    if (out.length) return out;
    out = voeFromHtml(h, url, label);
    if (out.length || depth >= 3) return out;
    links = discoverLinks(h, url);
    for (i = 0; i < links.length && budgetLeft() && out.length < 6; i++) {
        var more = resolveEmbed(links[i], label, url, depth + 1), j;
        for (j = 0; j < more.length; j++) addSrc(out, more[j]);
    }
    return out;
}

function encodePlayerUrl(url) {
    url = String(url || "").replace(/&amp;/g, "&");
    var m = /^(https?:\/\/[^?]+\?id=)(.+)$/i.exec(url);
    if (!m) return url;
    try {
        var id = decodeURIComponent(m[2]);
        return m[1] + encodeURIComponent(id).replace(/%2F/gi, "/").replace(/%20/g, "+");
    } catch (e) {
        return m[1] + encodeURIComponent(m[2]).replace(/%2F/gi, "/");
    }
}

function extractJuanitaDynamicHls(text, label, ref) {
    var out = [], t = normalizeMediaText(String(text || "")), variants = [t], i, m, u, re;
    variants.push(t.replace(/\\\//g, "/").replace(/\\u002F/gi, "/").replace(/\\u003A/gi, ":").replace(/\\u003F/gi, "?").replace(/\\u003D/gi, "="));
    for (i = 0; i < variants.length; i++) {
        t = variants[i];
        re = /https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi;
        while ((m = re.exec(t)) != null) {
            u = cleanUrl(normalizeMediaText(m[0]));
            if (/^https?:\/\//i.test(u)) addMediaCandidate(out, u, label || "Juanita HLS", ref, originOf(ref));
        }
        if (out.length >= 8) break;
    }
    return out;
}

function exSeriesPlayer(url, label, ref) {
    var raw = String(url || "").replace(/&amp;/g, "&"), key = raw, out = [], tries = [], i, fetchUrl, html, n;
    if (!raw) return out;
    if (_spCache[key] && _spCache[key].length) {
        for (i = 0; i < _spCache[key].length; i++) addSrc(out, _spCache[key][i]);
        log("    seriesplayer cache hit -> " + out.length);
        return out;
    }
    fetchUrl = encodePlayerUrl(raw);
    tries.push(fetchUrl);
    if (tries.indexOf(raw) < 0) tries.push(raw);
    var mfull = /^(https?:\/\/[^?]+\?id=)(.+)$/i.exec(raw);
    if (mfull) {
        try { var full = mfull[1] + encodeURIComponent(decodeURIComponent(mfull[2])); if (tries.indexOf(full) < 0) tries.push(full); } catch (e) {}
    }
    for (i = 0; i < tries.length && budgetLeft() && !out.length; i++) {
        fetchUrl = tries[i];
        html = httpGet(fetchUrl, ref || "https://pelisjuanita.com/");
        if (!html) { log("    seriesplayer intento " + (i + 1) + ": sin HTML"); continue; }
        if (/ID no v[\u00e1a]lido/i.test(html)) { log("    seriesplayer intento " + (i + 1) + ": ID no valido"); continue; }
        log("    seriesplayer intento " + (i + 1) + ": html=" + html.length + "b");
        out = extractJuanitaDynamicHls(html, (label || "Juanita") + " HLS", fetchUrl);
        if (!out.length) out = scanMedia(html, label || "Juanita", fetchUrl, fetchUrl);
        if (!out.length) {
            var cfg = jsonAfter(normalizeMediaText(html), "playerConfig=") || jsonAfter(normalizeMediaText(html), "playerConfig =") || jsonAfter(normalizeMediaText(html), "sources:");
            if (cfg) {
                var dump = JSON.stringify(cfg);
                out = scanMedia(dump, label || "Juanita", fetchUrl, fetchUrl);
            }
        }
    }
    if (out.length) {
        _spCache[key] = [];
        for (n = 0; n < out.length && n < 8; n++) _spCache[key].push(out[n]);
    }
    log("    seriesplayer -> " + out.length + (out.length ? " (" + String(out[0].url || "").substring(0, 120) + "...)" : ""));
    return out;
}

function extractProxyPlayerUrl(html) {
    var m, u, re, out = [], seen = {};
    if (!html) return out;
    re = /var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi;
    while ((m = re.exec(html)) != null) {
        u = cleanUrl(m[1]);
        if (u && !seen[u]) { seen[u] = 1; out.push(u); }
    }
    re = /(?:window\.)?location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi;
    while ((m = re.exec(html)) != null) {
        u = cleanUrl(m[1]);
        if (u && !seen[u]) { seen[u] = 1; out.push(u); }
    }
    re = /https?:\/\/[a-z0-9._-]+\/(?:e|v|embed|d|f)\/[a-zA-Z0-9_-]+/gi;
    while ((m = re.exec(html)) != null) {
        u = cleanUrl(m[0]);
        if (u && (isServerUrl(u) || /\/e\/[a-z0-9]+/i.test(u)) && !seen[u]) { seen[u] = 1; out.push(u); }
    }
    return out;
}
function isProxyPlayerHost(h) {
    h = String(h || "");
    return /player\.cuevana3/i.test(h) || /player\.poseidonhd2/i.test(h);
}
function exPoseidonPlayer(url, label, ref) {
    var html = httpGet(url, ref || (originOf(url) + "/")), out = [], links, i, j, more;
    if (!html) { log("    proxy-player: sin HTML"); return out; }
    links = extractProxyPlayerUrl(html);
    if (!links.length) {
        var disc = discoverLinks(html, url), k;
        for (k = 0; k < disc.length; k++) if (links.indexOf(disc[k]) < 0) links.push(disc[k]);
    }
    log("    proxy-player links=" + links.length + (links[0] ? (" -> " + links[0].substring(0, 90)) : ""));
    for (i = 0; i < links.length && budgetLeft() && out.length < 3; i++) {
        if (isProxyPlayerHost(hostOf(links[i]))) continue;
        more = resolveEmbed(links[i], label, url, 1);
        for (j = 0; j < more.length; j++) addSrc(out, more[j]);
        if (out.length) break;
    }
    if (!out.length) out = scanMedia(html, label, url, url);
    log("    proxy-player -> " + out.length);
    return out;
}

function exMixdrop(url, label, ref) {
    var u = String(url || "").replace(/\/f\//, "/e/").replace(/^(https?:\/\/[^\/]+\/e\/[^\/?#]+).*$/, "$1"), base = "https://" + hostOf(u) + "/", html, un, i, m = null, out = [], v;
    html = httpGet(u, ref || base);
    if (!html) return out;
    un = [html].concat(unpackAll(html));
    for (i = 0; i < un.length && !m; i++) m = /wurl\s*=\s*["']([^"']+)["']/.exec(un[i]);
    if (!m) return scanMedia(html, label, base, u);
    v = cleanUrl(m[1]);
    if (v.indexOf("//") == 0) v = "https:" + v;
    addSrc(out, mkSrc(v, label || "MixDrop", base, "mp4"));
    log("    mixdrop: " + (out.length ? "ok" : "fallo"));
    return out;
}
function exFileSources(url, label, ref, depth) {
    var base = "https://" + hostOf(url) + "/", html = httpGet(url, ref || base), out = [], texts, i, m, re, t, v;
    if (!html) return out;
    texts = [html].concat(unpackAll(html));
    for (i = 0; i < texts.length; i++) {
        t = normalizeMediaText(texts[i]);
        re = /player\.src\(\s*["']([^"']+)["']/gi;
        while ((m = re.exec(t)) != null) { v = absUrl(cleanUrl(m[1]), base); addSrc(out, mkSrc(v, label, base) || mkSrc(v, label, base, "mp4")); }
        re = /<source[^>]+src=["']([^"']+)["']/gi;
        while ((m = re.exec(t)) != null) { v = absUrl(cleanUrl(m[1]), base); addSrc(out, mkSrc(v, label, base) || mkSrc(v, label, base, "mp4")); }
    }
    if (out.length) return out;
    out = scanMedia(html, label, base, url);
    if (!out.length) out = voeFromHtml(html, url, label);
    log("    filesources " + hostOf(url) + ": " + out.length);
    return out;
}

function exStreamWish(url, label, ref) {
    var id = "", m, hosts, i, u, html, out = [], path;
    m = /\/(?:e|v)\/([a-zA-Z0-9]+)/i.exec(url || "");
    if (m) id = m[1];
    if (!id) {
        html = httpGet(url, ref || originOf(url) + "/");
        return extractPackedSources(html, url, label || "StreamWish").concat(scanMedia(html || "", label || "StreamWish", url, url));
    }
    path = "/e/" + id;
    hosts = [hostOf(url)].concat([
        "swdyu.com", "streamwish.to", "strwish.com", "streamwish.xyz", "flaswish.com",
        "sfastwish.com", "mwhubseeker.com", "hlswish.com", "playerwish.com"
    ]);
    var seen = {}, list = [];
    for (i = 0; i < hosts.length; i++) {
        if (!hosts[i] || seen[hosts[i]]) continue;
        seen[hosts[i]] = 1; list.push(hosts[i]);
    }
    for (i = 0; i < list.length && !out.length && budgetLeft(); i++) {
        u = "https://" + list[i] + path;
        html = httpGet(u, ref || "https://player.cuevana3.eu/");
        if (!html || html.length < 400) continue;
        out = extractPackedSources(html, u, label || "StreamWish");
        if (!out.length) out = scanMedia(html, label || "StreamWish", u, u);
        if (out.length) { log("    streamwish OK @" + list[i] + " -> " + out.length); return out; }
    }
    log("    streamwish: sin fuente");
    return out;
}

/* ================================================================== */
/* EXTRACTORES Streamflix Reborn 1.7.231                               */
/* ================================================================== */

var SF_ALL_HOSTS = {
    wish: ["streamwish.to","streamwish.com","streamwish.biz","streamwish.cc","streamwish.club","streamwish.fun","streamwish.info","streamwish.live","streamwish.me","streamwish.net","streamwish.org","streamwish.site","strwish.com","strmwis.xyz","swdyu.com","swhoi.com","swish.site","swishsrv.com","hlswish.com","playerwish.com","embedwish.com","awish.pro","awish.top","dwish.pro","dwish.top","mwish.pro","mwish.top","flaswish.com","sfastwish.com","cdnwish.com","jodwish.com","obeywish.com","wishembed.pro","wishfast.top","wishon.site","wishonly.site","vidwish.live","vidwish.site","asnwish.com"],
    vidhide: ["callistanise.com","vidhideplus.com","vidhidefast.com","vidhidepre.com","filelions.to","filelions.com","morencius.com","hglink.to","hgcloud.net","dintezuvio.com","dingtezuni.com","peytonepre.com","moflix-stream.click","moflix-stream.xyz","moflix-stream.fans","moflix-stream.link","moflix.rpmplay.xyz","moflix.upns.xyz"],
    filemoon: ["filemoon.sx","filemoon.to","filemoon.online","filemoon.site","filemoon.in","filemoon.nl","moonmov.pro","bysejikuar.com","kerapoxy.cc"],
    voe: ["voe.sx","voe-unblock.com","voeun-block.net","voeunblock.com","voeunbl.com","un-block-voe.net","v-o-e-unblock.com"],
    dood: ["dood.la","dood.li","doods.to","doodstream.com","doodporn.xyz","ds2play.com","ds2video.com","dooood.com"],
    mixdrop: ["mixdrop.co","mixdrop.to","mixdrop.ch","mixdrop.ag","mixdrop.bz","mixdrop.club","mixdrop.cv","mdy48tn97.com","mdbekjwqa.pw"],
    streamtape: ["streamtape.com","streamtape.to","streamtape.net","streamta.pe","strtape.tech","strcloud.link"],
    uqload: ["uqload.com","uqload.co","uqload.io","uqload.to","uqload.cx","uqload.is","uqloads.xyz"],
    okru: ["ok.ru","www.ok.ru","odnoklassniki.ru","okru.link"],
    lulu: ["luluvdo.com","luluvdoo.com","luluvid.com","lulustream.com"],
    supervideo: ["supervideo.cc","supervideo.tv"],
    goodstream: ["goodstream.one","goodstream.se","goodstream.uno"],
    vidoza: ["vidoza.net","vidoza.org","vidoza.co"],
    mp4upload: ["mp4upload.com","mp4upload.org"],
    yourupload: ["yourupload.com","yucache.net"],
    vidmoly: ["vidmoly.to","vidmoly.me","vidmoly.net","vidmoly.org"],
    streamhub: ["streamhub.to","streamhub.gg","streamhub.ink"],
    vtube: ["vtube.to","vtube.network","vtbe.net","vtbe.to"],
    bigwarp: ["bigwarp.io","bigwarp.art","bigwarp.cc","bigwarp.pro","bgwp.cc"],
    nupload: ["nupload.me","nupload.top","nupupload.top","nuuuppp.com","ap.nupload.me"],
    streamsb: ["streamsb.net","streamsss.net","sbplay2.com","sbfull.com","lvturbo.com","sbchill.com"],
    dropload: ["dropload.io","dropload.tv","dropload.pro"],
    closeload: ["closeload.com","closeload.top","ridorapid.closeload.top"],
    gxplayer: ["gxplayer.com","watch.gxplayer.xyz","play.gxplayer.com"],
    vimeus: ["vimeus.com","vimeus.net","vimeus.to"],
    afterdark: ["afterdark.best","proxy.afterdark.baby"],
    chillx: ["chillx.top"],
    dailymotion: ["dailymotion.com","geo.dailymotion.com"],
    dokicloud: ["dokicloud.one"],
    frembed: ["frembed.casa"],
    fsvid: ["fsvid.lol"],
    gupload: ["gupload.xyz"],
    hxfile: ["hxfile.co"],
    lamovie: ["lamovie.link"],
    loadx: ["loadx.ws"],
    mstreamday: ["rpmstream.live"],
    magasavor: ["magasavor.net"],
    mailru: ["my.mail.ru","mail.ru"],
    maxstream: ["maxstream.video"],
    moviesapi: ["moviesapi.club"],
    myfilestorage: ["myfilestorage.xyz"],
    nekostream: ["nekostream"],
    oneupload: ["oneupload.net"],
    pdrain: ["pdrain"],
    pcloud: ["pcloud.link","pcloud.com"],
    pluspomla: ["pluspomla"],
    primesrc: ["primesrc.me"],
    rabbitstream: ["rabbitstream.net"],
    ridoo: ["ridoo.net"],
    rpmvid: ["rpmvid.com","cubeembed.rpmvid.com"],
    savefiles: ["savefiles.com"],
    sharecloudy: ["sharecloudy.com"],
    streamup: ["streamup"],
    streamix: ["streamix.so"],
    streamruby: ["streamruby.com"],
    twoembed: ["2embed","twoembed"],
    ustr: ["ustr"],
    upzur: ["upzur.com"],
    upzone: ["upzone.cc","upzone.link","upzone.net","upzone.to"],
    veev: ["veev.to"],
    vidguard: ["vidguard.to"],
    vidlink: ["vidlink.pro"],
    vidply: ["vidply.com"],
    vidara: ["vidara.so","vidara.to"],
    videasy: ["videasy.net","player.videasy.net"],
    vidflix: ["vidflix.club"],
    vidnest: ["vidnest.io"],
    vidora: ["vidora.stream"],
    vidplay: ["vidplay.online","vidplay.site","myvidplay.com"],
    vidrock: ["vidrock.net"],
    vidsonic: ["vidsonic.net"],
    vidsrc: ["vidsrc.to","vidsrc.ru","vidsrc-embed.ru","vidsrc.net"],
    vidxgo: ["vidxgo.co"],
    vidzee: ["vidzee.wtf","player.vidzee.wtf","core.vidzee.wtf"],
    vidzy: ["vidzy.org"],
    vixsrc: ["vixsrc.to"],
    vixcloud: ["vixcloud.co"],
    zilla: ["zilla-networks.com","player.zilla-networks.com"],
    jkplayer: ["jkdesu","jkanime"],
    amazon: ["drive.google.com","google.com/file"],
    googledrive: ["drive.google.com"]
};

function sfMatchFamily(h) {
    h = String(h || "").toLowerCase();
    var fam, i, list;
    for (fam in SF_ALL_HOSTS) {
        if (!SF_ALL_HOSTS.hasOwnProperty(fam)) continue;
        list = SF_ALL_HOSTS[fam];
        for (i = 0; i < list.length; i++) {
            if (h.indexOf(list[i].replace(/^www\./, "")) >= 0) return fam;
        }
    }
    return "";
}

function sfHostIn(h, list) {
    h = String(h || "").toLowerCase();
    var i;
    for (i = 0; i < list.length; i++) if (h.indexOf(String(list[i]).replace(/^www\./, "")) >= 0) return true;
    return false;
}

function exSfDood(url, label, ref) {
    var out = [], base, id, m, html, pass, token, finalUrl, i, hosts, u;
    m = /\/(?:e|d)\/([a-zA-Z0-9]+)/i.exec(url || "");
    if (!m) return extractPackedSources(httpGet(url, ref || originOf(url) + "/") || "", url, label || "Dood");
    id = m[1];
    hosts = [hostOf(url)].concat(SF_ALL_HOSTS.dood || []);
    for (i = 0; i < hosts.length && !out.length && budgetLeft(); i++) {
        if (!hosts[i]) continue;
        base = "https://" + hosts[i].replace(/^https?:\/\//, "");
        u = base + "/e/" + id;
        html = httpGet(u, ref || base + "/");
        if (!html) continue;
        pass = (/\/pass_md5\/([^"']+)/i.exec(html) || [])[0];
        if (!pass) { out = extractPackedSources(html, u, label || "Dood"); if (out.length) return out; continue; }
        token = httpGet(base + pass, u);
        if (!token) continue;
        finalUrl = cleanUrl(token);
        if (!/^https?:/i.test(finalUrl)) finalUrl = base + (finalUrl.charAt(0) == "/" ? "" : "/") + finalUrl;
        var s = mkSrc(finalUrl, label || "Dood", base + "/", "mp4");
        if (s) { out.push(s); return out; }
    }
    return out;
}

function exSfMixdrop(url, label, ref) {
    var u = String(url || "").replace(/\/f\//, "/e/"), base = "https://" + hostOf(u) + "/", html, un, i, m = null, out = [], v;
    html = httpGet(u, ref || base);
    if (!html) return out;
    un = [html].concat(unpackAll(html));
    for (i = 0; i < un.length && !m; i++) m = /wurl\s*=\s*["']([^"']+)["']/.exec(un[i]) || /MDCore\.wurl\s*=\s*["']([^"']+)["']/.exec(un[i]);
    if (!m) return extractPackedSources(html, u, label || "MixDrop");
    v = cleanUrl(m[1]);
    if (v.indexOf("//") == 0) v = "https:" + v;
    addSrc(out, mkSrc(v, label || "MixDrop", base, "mp4"));
    return out;
}

function exSfStreamtape(url, label, ref) {
    var html = httpGet(url, ref || originOf(url) + "/"), out = [], m, link;
    if (!html) return out;
    m = /get_video\?id=[^"'\s]+/.exec(html);
    if (m) {
        link = "https://" + hostOf(url) + "/" + m[0].replace(/amp;/g, "");
        addSrc(out, mkSrc(link, label || "Streamtape", originOf(url) + "/", "mp4"));
        if (out.length) return out;
    }
    m = /robotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)/.exec(html);
    if (m) {
        link = cleanUrl(m[1] + m[2]);
        if (link.indexOf("//") == 0) link = "https:" + link;
        addSrc(out, mkSrc(link, label || "Streamtape", originOf(url) + "/", "mp4"));
    }
    if (!out.length) out = extractPackedSources(html, url, label || "Streamtape");
    return out;
}

function exSfUqload(url, label, ref) {
    var html = httpGet(url, ref || originOf(url) + "/"), out = [], m;
    if (!html) return out;
    m = /sources\s*:\s*\[\s*["']([^"']+)["']/.exec(html);
    if (m) addSrc(out, mkSrc(cleanUrl(m[1]), label || "Uqload", originOf(url) + "/", "mp4"));
    if (!out.length) out = extractPackedSources(html, url, label || "Uqload");
    return out;
}

function exSfOkru(url, label, ref) {
    var html = httpGet(url, ref || "https://ok.ru/"), out = [], m, data, i, arr, best = "";
    if (!html) return out;
    m = /data-options="([^"]+)"/.exec(html);
    if (m) {
        try {
            data = parseJson(dec(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")));
            if (data && data.flashvars && data.flashvars.metadata) {
                var meta = parseJson(data.flashvars.metadata);
                arr = (meta && meta.videos) || [];
                for (i = 0; i < arr.length; i++) if (arr[i].url) best = arr[i].url;
                if (best) addSrc(out, mkSrc(cleanUrl(best), label || "OK.ru", "https://ok.ru/", "mp4"));
            }
        } catch (e) {}
    }
    if (!out.length) out = extractPackedSources(html, url, label || "OK.ru");
    return out;
}

function exSfVoe(url, label, ref) {
    var html = httpGet(url, ref || originOf(url) + "/"), out = [], m, raw;
    if (!html) return out;
    out = extractPackedSources(html, url, label || "VOE");
    if (out.length) return out;
    m = /(?:sources|hls)\s*[:=]\s*["']([^"']+)["']/i.exec(html);
    if (m) addMediaCandidate(out, m[1], label || "VOE", url, originOf(url) + "/");
    m = /atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/.exec(html);
    if (m && !out.length) {
        try { raw = b64decode(m[1]); if (/\.m3u8|\.mp4/i.test(raw)) addMediaCandidate(out, raw, label || "VOE", url, originOf(url) + "/"); } catch (e) {}
    }
    return out;
}

function exSfFilemoon(url, label, ref) {
    var hosts = [hostOf(url)].concat(SF_ALL_HOSTS.filemoon || []), path, i, u, html, out = [];
    path = String(url || "").replace(/^https?:\/\/[^\/]+/i, "");
    for (i = 0; i < hosts.length && !out.length && budgetLeft(); i++) {
        if (!hosts[i]) continue;
        u = "https://" + hosts[i].replace(/^https?:\/\//, "") + path;
        html = httpGet(u, ref || originOf(u) + "/");
        if (!html || html.length < 400) continue;
        out = extractPackedSources(html, u, label || "Filemoon");
        if (out.length) return out;
    }
    return out;
}

function exSfJwFamily(url, label, ref) {
    var html = httpGet(url, ref || originOf(url) + "/"), out;
    if (!html) return [];
    out = extractPackedSources(html, url, label || hostOf(url));
    if (!out.length) out = scanMedia(html, label || hostOf(url), url, url);
    return out;
}

function exSfNuupload(url, label, ref) {
    var u = unwrapEmbedUrl(url), out = [], html, links, i;
    if (u != url && /^https?:/i.test(u)) return resolveEmbed(u, label || "Nuupload", ref, 1);
    html = httpGet(url, ref || originOf(url) + "/");
    if (!html) return out;
    out = extractPackedSources(html, url, label || "Nuupload");
    if (!out.length) {
        links = discoverLinks(html, url);
        for (i = 0; i < links.length && !out.length; i++) out = resolveEmbed(links[i], label || "Nuupload", url, 1);
    }
    return out;
}

function resolveStreamflixExtractor(url, label, ref, depth) {
    var h = hostOf(url), fam = sfMatchFamily(h), lab = label || fam || h;
    if (!h) return null;

    if (fam == "wish" || /streamwish|swdyu|strwish|hlswish|playerwish|embedwish|awish|dwish|mwish|flaswish|sfastwish|wishembed|wishfast|vidwish/i.test(h))
        return typeof exStreamWish == "function" ? exStreamWish(url, lab || "StreamWish", ref) : exSfJwFamily(url, lab || "StreamWish", ref);

    if (fam == "vidhide" || /vidhide|callistanise|filelions|morencius|hglink|hgcloud|dintez|dingte|peytone|moflix-stream/i.test(h))
        return typeof exVidhide == "function" ? exVidhide(url, lab || "VidHide", ref) : exSfJwFamily(url, lab || "VidHide", ref);

    if (fam == "filemoon") return exSfFilemoon(url, lab || "Filemoon", ref);
    if (fam == "voe") return (typeof exVoe == "function" ? exVoe(url, lab || "VOE", ref) : null) || exSfVoe(url, lab || "VOE", ref);
    if (fam == "dood") return exSfDood(url, lab || "Dood", ref);
    if (fam == "mixdrop") return typeof exMixdrop == "function" ? exMixdrop(url, lab || "MixDrop", ref) : exSfMixdrop(url, lab || "MixDrop", ref);
    if (fam == "streamtape") return typeof exStreamTape == "function" ? exStreamTape(url, lab || "Streamtape") : exSfStreamtape(url, lab || "Streamtape", ref);
    if (fam == "uqload") return typeof exUqload == "function" ? exUqload(url, lab || "Uqload") : exSfUqload(url, lab || "Uqload", ref);
    if (fam == "okru") return typeof exOkRu == "function" ? exOkRu(url, lab || "OK.ru", ref) : exSfOkru(url, lab || "OK.ru", ref);
    if (fam == "nupload") return exSfNuupload(url, lab || "Nuupload", ref);

    if (fam) return exSfJwFamily(url, lab || fam, ref);

    if (/\/(?:e|v|embed|d|f|file|watch)\//i.test(url) || /player|stream|vid|embed|watch|play/i.test(h)) {
        return exSfJwFamily(url, lab || h, ref);
    }
    return null;
}


function resolveEmbed(url, label, ref, depth) {
    depth = depth || 0;
    try {
        url = cleanUrl(url);
        if (!/^https?:\/\//i.test(url) || depth > 3 || !budgetLeft()) return [];
        var unwrapped = unwrapEmbedUrl(url);
        if (unwrapped != url) {
            log("    wrapper -> " + unwrapped.substring(0, 120));
            return resolveEmbed(unwrapped, label, ref, depth + 1);
        }
        var h = hostOf(url), d;
        if (isDirectMediaUrl(url)) {
            var directType = inferMediaType(url);
            var direct = mkSrc(url, label || (directType == "hls" ? "HLS" : "Video"), ref, directType);
            if (direct) {
                log("    direct media -> " + h + " type=" + directType);
                return [direct];
            }
        }
        if (hostMatches(h, UNSUPPORTED)) { log("  skip unsupported: " + h); return []; }
        if (/fortamomar\.workers\.dev$/i.test(h) || /seriesplayer\./i.test(h) ||
            /onfilom\.com$/i.test(h) || /playspelis\.com$/i.test(h) || /321moviesfree\.com$/i.test(h) ||
            /flixlat\.com$/i.test(h)) {
            if (/\.m3u8/i.test(url) || inferMediaType(url) == "hls") {
                var s0 = mkSrc(url, label || "Juanita HLS", ref || "https://seriesplayer.fortamomar.workers.dev/", "hls");
                return s0 ? [s0] : [];
            }
            if (inferMediaType(url) == "mp4") {
                var s1 = mkSrc(url, label || "Juanita MP4", ref, "mp4");
                return s1 ? [s1] : [];
            }
            return exSeriesPlayer(url, label, ref);
        }
        if (isProxyPlayerHost(h) || /\/player\.php\?/i.test(url) || /player\.poseidonhd2\.co$/i.test(h) || /player\.cuevana3/i.test(h)) {
            return exPoseidonPlayer(url, label, ref);
        }
        d = mkSrc(url, label, ref);
        if (d) return [d];
        if (typeof resolveStreamflixExtractor == "function") {
            try {
                var sf = resolveStreamflixExtractor(url, label, ref, depth);
                if (sf && sf.length) return sf;
            } catch (eSf) { log("    sfExtractor -> " + eSf); }
        }
        if (hostIn(h, MIX_HOSTS) || (typeof SF_ALL_HOSTS != "undefined" && sfHostIn(h, SF_ALL_HOSTS.mixdrop || [])))
            return typeof exMixdrop == "function" ? exMixdrop(url, label, ref) : (typeof exSfMixdrop == "function" ? exSfMixdrop(url, label, ref) : []);
        if (hostIn(h, WISH_HOSTS) || /streamwish|swdyu|strwish|hlswish|wishembed|awish|embedwish|flaswish|sfastwish/i.test(h)) {
            return exStreamWish(url, label, ref);
        }
        if (isPackerFamily(h) || /filelions|callistanise|morencius|hglink|vidhide|bysejikuar|moon/i.test(h)) {
            var vh = exVidhide(url, label, ref);
            if (vh && vh.length) return vh;
            var fs = typeof exFileSources == "function" ? exFileSources(url, label, ref, depth) : [];
            if (fs && fs.length) return fs;
            return extractPackedSources(httpGet(url, ref || originOf(url) + "/") || "", url, label);
        }
        if (/vimeus\.|goodstream\./i.test(h)) {
            var vg = extractPackedSources(httpGet(url, ref || originOf(url) + "/") || "", url, label || "Vimeus");
            if (vg.length) return vg;
            return exGeneric(url, label, ref, depth);
        }
        if (h.indexOf("voe.") >= 0 || h.indexOf("voe.sx") >= 0 || hostIn(h, VOE_HOSTS)) return exVoe(url, label, ref);
        if (/(?:^|\.)(?:vk\.com|vkvideo\.ru|vk\.ru)$/.test(h)) return exVk(url, label, ref);
        if (h.indexOf("vimeo.com") >= 0) return exVimeo(url, label, ref);
        if (h.indexOf("uqload.") >= 0 || hostIn(h, UQLOAD_HOSTS)) return exUqload(url, label);
        if (h.indexOf("streamtape.") >= 0 || /(?:^|\.)tape\./.test(h) || hostIn(h, TAPE_HOSTS)) return exStreamTape(url, label);
        if (h.indexOf("dood") >= 0 || /d[o]{3,}d/.test(h) || hostIn(h, DOOD_HOSTS)) return exDood(url, label);
        if (h.indexOf("plusvip.") >= 0) return exPlusVip(url, label);
        if (h.indexOf("esplay.") >= 0) return exEsplay(url, label);
        if (h.indexOf("fastream.") >= 0) return exFastream(url, label);
        if (h == "ok.ru" || h.indexOf(".ok.ru") >= 0 || h.indexOf("odnoklassniki") >= 0) return exOkRu(url, label, ref);
        if (h.indexOf("vimeus.") >= 0) {
            log("    vimeus: host no-Vimeo real, usando extractor generico");
            return exGeneric(url, label, ref, depth);
        }
        if (hostIn(h, FILE_HOSTS)) return exFileSources(url, label, ref, depth);
        return exGeneric(url, label, ref, depth);
    } catch (e) {
        log("  resolveEmbed ERROR " + String(url).substring(0, 80) + " -> " + e);
        return [];
    }
}

function langOf(t) {
    t = normalizeTitle(t);
    if (/\bsub|subtitul|vose|vos\b/.test(t)) return "Subtitulado";
    if (/castell|espana|\besp\b|\bcast\b/.test(t)) return "Castellano";
    if (/latin|\blat\b|\bmx\b|mexic|argent/.test(t)) return "Latino";
    if (/ingles|english|\ben\b|\beng\b/.test(t)) return "Ingles";
    return "";
}
function langRank(l) { return l == "Latino" ? 0 : (l == "Subtitulado" ? 1 : (l == "Castellano" ? 2 : 3)); }
function prettyHost(u) {
    var h = hostOf(u).replace(/^www\./, "").split(".");
    return h.length > 1 ? h[h.length - 2] : (h[0] || "server");
}

/* ------------------------------------------------------------------ */
/* coincidencia de titulos                                             */
/* ------------------------------------------------------------------ */

var BAD_PATH = /\/(?:genero|genre|generos|category|categoria|categorias|tag|tags|page|pagina|wp-|author|search|buscar|year|release|network|cast|director|actor|estrenos|top|login|register|contacto|dmca|feed|xfsearch|country|pais|idioma|lang)(?:\/|$)/i;
var RE_TV = /\/(?:serie|series|tv|tvshows?|ver-serie|show|shows|anime|animes)\//i;
var RE_MOVIE = /\/(?:pelicula|peliculas|movie|movies|ver-pelicula|film|films|pelis|ver)\//i;

function findLinks(html, base, kind) {
    var out = [], byUrl = {}, re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi, m, host = hostOf(base);
    while ((m = re.exec(html || "")) != null) {
        var a = attrsOf(m[0].substring(0, m[0].indexOf(">") + 1)), href = a["href"];
        if (!href || href.charAt(0) == "#" || /^(?:javascript|mailto):/i.test(href)) continue;
        var u = absUrl(href.split("#")[0], base);
        if (hostOf(u) != host && hostOf(u).replace(/^www\./, "") != host.replace(/^www\./, "")) continue;
        var path = u.replace(/^https?:\/\/[^\/]+/, "");
        if (path.length < 3 || BAD_PATH.test(path)) continue;
        var type = RE_TV.test(path) ? "tv" : (RE_MOVIE.test(path) ? "movie" : "unknown");
        var inner = m[1], alt = (/<img\b[^>]*\balt=["']([^"']+)/i.exec(inner) || [])[1] || "";
        if (type == "unknown" && !alt && !a["title"] && inner.indexOf("<img") < 0) continue;
        var title = a["title"] || alt || strip(inner);
        if (title.length > 140) title = "";
        var tail = html.substring(m.index + m[0].length, m.index + m[0].length + 500);
        var yr = (/>\s*((?:19|20)\d\d)\s*</.exec(tail) || /\b((?:19|20)\d\d)\b/.exec(strip(inner)) || [])[1] || "";
        var c = byUrl[u];
        if (!c) { c = { url: u, titles: [], type: type, year: yr }; byUrl[u] = c; out.push(c); }
        if (title) c.titles.push(clean(title));
        if (yr && !c.year) c.year = yr;
        if (out.length >= 80) break;
    }
    for (var i = 0; i < out.length; i++) out[i].titles.push(slugWords(out[i].url));
    return out;
}
function scoreLink(c, ctx) {
    var want = ctx.titles, best = 0, i, j;
    for (i = 0; i < c.titles.length; i++) {
        var t = normalizeTitle(c.titles[i]);
        if (!t) continue;
        for (j = 0; j < want.length; j++) {
            var w = want[j], s = 0;
            if (t == w) s = 100;
            else if (t.indexOf(w) >= 0 || w.indexOf(t) >= 0) {
                var r = Math.min(t.length, w.length) / Math.max(t.length, w.length);
                s = r >= 0.85 ? 60 + r * 30 : 0;
            }
            if (!s) {
                var ts = tokenSimilarity(c.titles[i], want[j]);
                if (ts >= 80) s = 55 + (ts - 80);
            }
            if (s > best) best = s;
        }
    }
    if (!best) return 0;
    if (c.type != "unknown" && c.type != ctx.kind) best -= 40;
    if (c.year && ctx.year) {
        var d = Math.abs(parseInt(c.year, 10) - parseInt(ctx.year, 10));
        if (d === 0) best += 12;
        else if (d === 1) best += 4;
        else return 0;
    } else if (ctx.year && c.url.indexOf(ctx.year) >= 0) best += 8;
    return best;
}
function pickBest(links, ctx) {
    var best = null, sc = 0, i;
    for (i = 0; i < links.length; i++) { var s = scoreLink(links[i], ctx); if (s > sc) { sc = s; best = links[i]; } }
    if (best && sc >= 75) { log("  match " + sc + " -> " + best.url.substring(0, 100)); return best; }
    return null;
}

/* ------------------------------------------------------------------ */
/* candidatos -> fuentes                                               */
/* ------------------------------------------------------------------ */

function mkCand(url, lang, ref, prov) { return { url: url, lang: lang || "", ref: ref || "", prov: prov || "" }; }

function resolveCands(cands, out, prov, need) {
    var seen = {}, list = [], i, c;
    for (i = 0; i < cands.length; i++) {
        c = cands[i];
        var k = c.srcs ? "srcs" + i : c.url;
        if (!k || seen[k]) continue;
        seen[k] = 1; list.push(c);
    }
    list.sort(function (a, b) {
        function pri(u) {
            u = String(u || "");
            if (/fortamomar|seriesplayer/i.test(u)) return 0;
            if (/onfilom|playspelis|flixlat|321moviesfree/i.test(u)) return 1;
            if (/vimeus|goodstream/i.test(u)) return 2;
            if (/streamtape|voe\.|uqload/i.test(u)) return 3;
            if (/player\.php/i.test(u)) return 4;
            if (/streamwish|swdyu|filemoon|vidhide|callistanise|morencius/i.test(u)) return 6;
            return 5;
        }
        var pa = pri(a.url), pb = pri(b.url);
        if (pa != pb) return pa - pb;
        return langRank(a.lang) - langRank(b.lang);
    });
    var pre = [], spPre = [], pn = Math.min(list.length, MAX_CAND);
    for (i = 0; i < pn; i++) {
        if (list[i].url) {
            var pu = list[i].url;
            if (!/fortamomar|seriesplayer/i.test(pu)) {
                if (pu) pre.push(pu);
            } else if (spPre.length < 3) {
                spPre.push(encodePlayerUrl(String(pu).replace(/&amp;/g, "&")));
            }
        }
    }
    prefetchUrls(pre);
    if (spPre.length) prefetchUrls(spPre, "https://pelisjuanita.com/");
    var n = 0, good = 0;
    for (i = 0; i < list.length && n < MAX_CAND && budgetLeft() && (!need || good < need); i++) {
        c = list[i];
        var label = (c.lang ? c.lang + " \u00b7 " : "") + prov + " \u00b7 " + (c.url ? prettyHost(c.url) : "directo"), got = [], j;
        if (c.srcs) {
            for (j = 0; j < c.srcs.length; j++) {
                var orig = c.srcs[j].name || "";
                /* Si el extractor ya puso un nombre bueno (Odysee/Dailymotion/Archive/OK.ru), no duplicar. */
                if (orig && /^(OK\.ru|Odysee|Dailymotion|Archive\.org|YouTube)\b/i.test(orig)) {
                    c.srcs[j].name = orig;
                } else {
                    c.srcs[j].name = label + (orig.indexOf("OK.ru") >= 0 ? orig.replace("OK.ru", "") : (orig ? " " + orig : ""));
                }
                got.push(c.srcs[j]);
            }
        } else {
            var t0 = Date.now();
            got = resolveEmbed(c.url, label, c.ref || (originOf(c.url) + "/"), 0);
            var ms = Date.now() - t0;
            for (j = 0; j < got.length; j++) if (got[j] && got[j].url) _lat[got[j].url] = ms;
        }
        n++;
        var urlsFound = [];
        for (j = 0; j < got.length; j++) urlsFound.push(String(got[j].url || "").substring(0, 140));
        log("  " + label + " [" + (c.url || "").substring(0, 200) + "] -> " + got.length + (urlsFound.length ? " :: " + urlsFound.join(" | ") : ""));
        var before = out.length;
        for (j = 0; j < got.length; j++) { got[j].name = got[j].name && got[j].name.indexOf(prov) >= 0 ? got[j].name : label; addSrc(out, got[j]); }
        if (out.length > before) good++;
    }
    return good;
}

/* ------------------------------------------------------------------ */
/* PoseidonHD2                                                         */
/* ------------------------------------------------------------------ */

var _poseidonBuildId = "";
var _poseidonBuildAt = 0;
var POSEIDON_BASE = "https://www.poseidonhd2.co";
var POSEIDON_BUILD_TTL = 6 * 60 * 60 * 1000;

function poseidonBuildId() {
    if (_poseidonBuildId && (Date.now() - _poseidonBuildAt) < POSEIDON_BUILD_TTL) return _poseidonBuildId;
    var html = httpGet(POSEIDON_BASE + "/", POSEIDON_BASE + "/");
    var m = /"buildId"\s*:\s*"([^"]+)"/.exec(html || "");
    if (m && m[1]) {
        _poseidonBuildId = m[1];
        _poseidonBuildAt = Date.now();
        log("  Poseidon buildId=" + _poseidonBuildId);
    }
    return _poseidonBuildId || "Q-i_R7Z4xGx1ZLVEa6Zzs";
}

function poseidonLangLabel(key) {
    key = String(key || "").toLowerCase();
    if (key === "latino") return "Latino";
    if (key === "spanish" || key === "castellano") return "Castellano";
    if (key === "english" || key === "ingles") return "Ingles";
    return key ? (key.charAt(0).toUpperCase() + key.slice(1)) : "";
}

function cyberlockerRank(n) {
    n = String(n || "").toLowerCase();
    if (/vimeus|goodstream/.test(n)) return 0;
    if (/voe|vimeos/.test(n)) return 1;
    if (/streamtape|uqload/.test(n)) return 2;
    if (/filemoon|moon|bysejikuar/.test(n)) return 3;
    if (/streamwish|wishembed|hlswish|swdyu/.test(n)) return 4;
    if (/vidhide|callistanise|filelions|morencius|hglink/.test(n)) return 6;
    return 5;
}
function poseidonExtractVideos(block, ref) {
    var out = [], langs = ["latino", "spanish", "english"], i, j, list, v, lang, tmp = [];
    if (!block) return out;
    var videos = block.videos || {};
    for (i = 0; i < langs.length; i++) {
        list = videos[langs[i]] || [];
        lang = poseidonLangLabel(langs[i]);
        for (j = 0; j < list.length; j++) {
            v = list[j];
            if (!v || !v.result) continue;
            tmp.push({ cand: mkCand(v.result, lang, ref, "PoseidonHD"), rank: cyberlockerRank(v.cyberlocker || v.result) });
        }
    }
    tmp.sort(function (a, b) { return a.rank - b.rank; });
    for (i = 0; i < tmp.length; i++) out.push(tmp[i].cand);
    return out;
}

function poseidonUrl(ctx, bid) {
    var slug = "x", s = ctx.season || 1, e = ctx.episode || 1;
    if (ctx.kind == "movie") {
        return POSEIDON_BASE + "/_next/data/" + bid + "/es/pelicula/" + ctx.id + "/" + slug +
            ".json?tmdb=" + enc(ctx.id) + "&movie=" + slug;
    }
    return POSEIDON_BASE + "/_next/data/" + bid + "/es/serie/" + ctx.id + "/" + slug +
        "/temporada/" + s + "/episodio/" + e +
        ".json?tmdb=" + enc(ctx.id) + "&serie=" + slug + "&season=" + s + "&episode=" + e;
}
function poseidonByTmdb(ctx) {
    if (!ctx || !ctx.id) return [];
    var bid = poseidonBuildId();
    if (!bid) return [];
    var body, data, block, out = [], attempt, old;

    for (attempt = 0; attempt < 2; attempt++) {
        body = httpGet(poseidonUrl(ctx, bid), POSEIDON_BASE + "/");
        data = parseJson(body);
        if (data && data.pageProps) break;
        if (attempt == 0 && !body && (Date.now() - _poseidonBuildAt) > 120000) {
            old = bid;
            _poseidonBuildId = ""; _poseidonBuildAt = 0;
            bid = poseidonBuildId();
            if (bid && bid != old) { log("  Poseidon buildId renovado -> reintento"); continue; }
        }
        break;
    }
    if (!data || !data.pageProps) { log("  Poseidon JSON vacio tmdb=" + ctx.id + (ctx.kind == "tv" ? " S" + ctx.season + "E" + ctx.episode : "")); return []; }

    if (ctx.kind == "movie") {
        block = data.pageProps.thisMovie || null;
        if (!block || String(block.TMDbId || "") !== String(ctx.id)) {
            log("  Poseidon movie TMDbId no coincide");
            return [];
        }
        out = poseidonExtractVideos(block, POSEIDON_BASE + "/");
        log("  PoseidonHD JSON movie " + ctx.id + " -> " + out.length);
        return out;
    }
    block = data.pageProps.episode || null;
    if (!block) { log("  Poseidon ep sin bloque episode"); return []; }
    out = poseidonExtractVideos(block, POSEIDON_BASE + "/");
    log("  PoseidonHD JSON ep " + ctx.id + " S" + ctx.season + "E" + ctx.episode + " -> " + out.length);
    return out;
}

function provPoseidon(ctx) {
    return poseidonByTmdb(ctx);
}

/* ------------------------------------------------------------------ */
/* PelisJuanita (por TMDB)                                             */
/* ------------------------------------------------------------------ */

function normalizeJuanitaPlayerUrl(u) {
    u = cleanUrl(u);
    if (!u) return "";
    if (/fortamomar\.workers\.dev|seriesplayer\./i.test(u)) {
        try { return encodePlayerUrl(u); } catch (e) { return u; }
    }
    return u;
}
function parseJuanita(html, base) {
    var out = [], tags = findTags(html, /row-download/i), i, m, re, seen = {};
    function addU(u, lang) {
        u = cleanUrl(absUrl(u, base));
        if (!u || !/^https?:\/\//i.test(u) || seen[u]) return;
        seen[u] = 1;
        out.push(mkCand(u, lang || "", base + "/", "Juanita"));
    }
    for (i = 0; i < tags.length; i++) {
        var a = attrsOf(tags[i].tag);
        var tipo = (a["data-tipo"] || "").toLowerCase();
        if (tipo == "torrent" || tipo == "magnet") continue;
        var u = a["data-url"];
        if (!u) continue;
        if (!/^https?:|^\/\//i.test(u)) { var d = b64decode(u); if (/^https?:\/\//i.test(d)) u = d; }
        var lang = langOf(a["data-idioma"] || "") || langOf(strip(html.substring(tags[i].end, tags[i].end + 250)));
        addU(u, lang);
    }
    re = /https?:\/\/(?:seriesplayer\.)?fortamomar\.workers\.dev\/\?id=[^\s"'<>]*/gi;
    while ((m = re.exec(html || "")) != null) addU(m[0].replace(/&amp;/g, "&"), "Latino");
    re = /https?:\/\/seriesplayer\.[a-z0-9._-]+\/\?id=[^\s"'<>]*/gi;
    while ((m = re.exec(html || "")) != null) addU(m[0].replace(/&amp;/g, "&"), "Latino");
    re = /(?:data-url|href|src)=["']([^"']*fortamomar[^"']*|[^"']*seriesplayer[^"']*)["']/gi;
    while ((m = re.exec(html || "")) != null) addU(m[1].replace(/&amp;/g, "&"), "Latino");
    tags = findTags(html, /^<iframe\b/i);
    for (i = 0; i < tags.length; i++) {
        var a2 = attrsOf(tags[i].tag), src = a2["src"] || a2["data-src"] || "";
        if (/fortamomar|seriesplayer|onfilom|playspelis|flixlat/i.test(src)) addU(src, "");
    }
    return out;
}
function juanitaSearchCandidates(json, kind) {
    var arr = null;
    if (Array.isArray(json)) arr = json;
    else if (json) arr = json.results || json.data || json.movies || json.series || json.items || null;
    if (!arr || !arr.length) return [];
    var out = [], i;
    for (i = 0; i < arr.length && i < 20; i++) {
        var x = arr[i];
        if (!x) continue;
        var title = x.title || x.name || x.titulo || x.nombre || "";
        var slug = x.slug || x.url_slug || x.titleSlug || "";
        var yr = x.year || x.anio || yearOf(x.release_date || x.fecha || "");
        var tmdbId = x.tmdb_id || x.tmdbId || x.idTmdb || "";
        if (!slug && title) slug = slugJuanita(title);
        if (!slug) continue;
        out.push({ url: "juanita:" + slug, titles: [title, slugWords(slug)], type: kind, year: yr ? String(yr) : "", tmdbId: tmdbId, slug: slug });
    }
    return out;
}
function juanitaRememberSlug(ctx, slug) {
    if (ctx && ctx.id && slug) {
        _juanitaSlugIndex[String(ctx.id)] = String(slug);
        log("  Juanita index: tmdb=" + ctx.id + " -> " + slug);
    }
}
function juanitaCachedSlug(ctx) {
    return (ctx && ctx.id && _juanitaSlugIndex[String(ctx.id)]) ? _juanitaSlugIndex[String(ctx.id)] : "";
}
var JUANITA_ALIASES = {
    "the fresh prince of bel air": "el-principe-del-rap-en-bel-air",
    "el principe del rap de bel air": "el-principe-del-rap-en-bel-air"
};
function juanitaAliasSlug(ctx) {
    var raw = [ctx.titleEn, ctx.titleEs, ctx.titleOrig].concat(ctx.altTitles || []), i, k;
    for (i = 0; i < raw.length; i++) { k = normalizeTitle(raw[i]); if (k && JUANITA_ALIASES[k]) return JUANITA_ALIASES[k]; }
    return "";
}
function juanitaSlugCandidates(ctx) {
    var cached = juanitaCachedSlug(ctx);
    if (cached) return [cached];
    var alias = juanitaAliasSlug(ctx);
    var raw = uniq([ctx.titleEn, ctx.titleEs, ctx.titleOrig].concat(ctx.altTitles || [])), out = alias ? [alias] : [], i, s;
    for (i = 0; i < raw.length; i++) {
        s = trimDash(slugJuanita(raw[i]));
        if (!s) continue;
        if (ctx.year) out.push(s + "-" + ctx.year);
        out.push(s);
    }
    return uniq(out).slice(0, 4);
}
function provJuanita(ctx) {
    var base = "https://pelisjuanita.com", slugs = juanitaSlugCandidates(ctx), urls = [], i;
    var known = !!juanitaCachedSlug(ctx);
    for (i = 0; i < slugs.length; i++) {
        urls.push(ctx.kind == "movie" ? base + "/movies/movieInfo.php?title=" + slugs[i]
            : base + "/series/serieInfo.php?nombreSerie=" + slugs[i] + "&nroTemporada=" + ctx.season + "&nroEpisodio=" + ctx.episode);
    }
    var verSerieIdx = -1, verBase = urls.length;
    if (!known) {
        for (i = 0; i < slugs.length; i++) urls.push(ctx.kind == "movie" ? base + "/movies/pelicula/" + slugs[i] : base + "/series/ver-serie/" + slugs[i]);
        if (ctx.kind == "tv" && slugs.length) verSerieIdx = verBase;
    } else if (ctx.kind == "tv" && slugs.length) { verSerieIdx = urls.length; urls.push(base + "/series/ver-serie/" + slugs[0]); }
    var bodies = batchGet(urls, base + "/");
    var hits = [];
    for (i = 0; i < slugs.length; i++) {
        var items = parseJuanita(bodies[i], base);
        if (items.length) hits.push({ slug: slugs[i], items: items, si: i });
    }
    if (hits.length) {
        if (known) {
            log("  slug cacheado, sin verificar pagina: " + hits[0].slug);
            return hits[0].items;
        }
        var vBodies = [], j;
        for (j = 0; j < hits.length; j++) vBodies.push(bodies[verBase + hits[j].si]);
        for (j = 0; j < hits.length; j++) {
            var v = verifyPageTitle(vBodies[j], ctx);
            if (v.ok === false) { log("  descartado (no coincide t\u00edtulo/a\u00f1o) slug=" + hits[j].slug + (v.pageTitle ? " -> pagina real: '" + v.pageTitle + "'" : "")); continue; }
            log("  slug OK" + (v.ok === true ? " (verificado: '" + v.pageTitle + "')" : " (no se pudo verificar t\u00edtulo, se usa igual)") + ": " + hits[j].slug);
            juanitaRememberSlug(ctx, hits[j].slug);
            return hits[j].items;
        }
        log("  ning\u00fan slug con servidores pas\u00f3 la verificaci\u00f3n de t\u00edtulo/a\u00f1o, se intenta el buscador");
    }
    if (verSerieIdx >= 0 && bodies[verSerieIdx]) {
        var vs = bodies[verSerieIdx], out = [], links = discoverLinks(vs, urls[verSerieIdx]), j2;
        for (j2 = 0; j2 < links.length; j2++) out.push(mkCand(links[j2], "", base + "/", "Juanita"));
        var direct = scanMedia(vs, "", base + "/", base + "/"), k;
        for (k = 0; k < direct.length; k++) out.push({ url: "", lang: "", srcs: [direct[k]], prov: "Juanita" });
        if (out.length) { log("  ver-serie: " + out.length + " candidato(s) (marcado distinto de serieInfo.php)"); return out; }
    }
    log("  slugs probados: " + slugs.join(", "));
    if (budgetLeft()) {
        var titlesAll = uniq([ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || [])), queries = [], qi, ti, toks;
        for (ti = 0; ti < titlesAll.length; ti++) {
            if (!titlesAll[ti]) continue;
            queries.push(titlesAll[ti]);
            toks = titleTokens(titlesAll[ti]);
            if (toks.length > 3) { queries.push(toks.slice(0, 3).join(" ")); queries.push(toks.slice(-2).join(" ")); }
        }
        queries = uniq(queries).slice(0, 6);
        var seenSlug = {}, tried = 0;
        for (qi = 0; qi < queries.length && budgetLeft() && tried < 3; qi++) {
            var raws = juanitaSearchRaw(queries[qi], ctx.kind == "movie" ? "movie" : "tv");
            log("  buscador Juanita '" + queries[qi] + "' -> " + raws.length + " resultado(s)");
            var ranked = [], ri, wi;
            for (ri = 0; ri < raws.length; ri++) {
                var rw = raws[ri], sc = 0;
                if (!rw.slug || seenSlug[rw.slug]) continue;
                for (wi = 0; wi < titlesAll.length; wi++) {
                    sc = Math.max(sc, tokenSimilarity(rw.title, titlesAll[wi]), tokenSimilarity(slugWords(rw.slug), titlesAll[wi]));
                }
                if (rw.year && ctx.year && Math.abs(parseInt(rw.year, 10) - parseInt(ctx.year, 10)) > 1) sc -= 30;
                if (sc >= 70) ranked.push({ slug: rw.slug, sc: sc });
            }
            ranked.sort(function (a, b) { return b.sc - a.sc; });
            for (ri = 0; ri < ranked.length && ri < 2 && budgetLeft(); ri++) {
                var bs = ranked[ri].slug;
                seenSlug[bs] = 1; tried++;
                var finalUrl = ctx.kind == "movie" ? base + "/movies/movieInfo.php?title=" + bs
                    : base + "/series/serieInfo.php?nombreSerie=" + bs + "&nroTemporada=" + ctx.season + "&nroEpisodio=" + ctx.episode;
                var fh = httpGet(finalUrl, base + "/"), fi = parseJuanita(fh, base);
                log("  buscador Juanita: match slug=" + bs + " (score " + ranked[ri].sc + ") -> " + fi.length + " candidatos");
                if (fi.length) { juanitaRememberSlug(ctx, bs); return fi; }
            }
        }
    }
    return [];
}

/* ------------------------------------------------------------------ */
/* PelisJuanita — catálogo propio                                      */
/* ------------------------------------------------------------------ */

var JUANITA_BASE = "https://pelisjuanita.com";
var JUANITA_SCHEME = "juanita://";

function isJuanitaUrl(u) { return /^juanita:\/\//.test(String(u || "")); }
function juanitaAuthor() { return new PlatformAuthorLink(PPID, "PelisJuanita", JUANITA_BASE, "", 0); }
function juanitaMovieUrl(slug) { return JUANITA_SCHEME + "movie/" + slug; }
function juanitaShowUrl(slug) { return JUANITA_SCHEME + "show/" + slug; }
function juanitaEpUrl(slug, s, e) { return JUANITA_SCHEME + "tv/" + slug + "/" + s + "/" + e; }

function juanitaParseInternal(url) {
    var s = String(url || ""), m;
    m = s.match(/^juanita:\/\/movie\/([a-z0-9\-]+)$/i);
    if (m) return { kind: "movie", slug: m[1] };
    m = s.match(/^juanita:\/\/show\/([a-z0-9\-]+)$/i);
    if (m) return { kind: "show", slug: m[1] };
    m = s.match(/^juanita:\/\/tv\/([a-z0-9\-]+)\/(\d+)\/(\d+)$/i);
    if (m) return { kind: "tv", slug: m[1], season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
    return null;
}

function juanitaSearchRaw(query, kind) {
    var q = clean(query);
    if (!q) return [];
    var endpoint = kind == "tv"
        ? JUANITA_BASE + "/series/search?s=" + enc(q)
        : JUANITA_BASE + "/movies/search?s=" + enc(q);
    var body = httpGet(endpoint, JUANITA_BASE + "/");
    if (!body) return [];

    var json = parseJson(body);
    if (json) {
        var cands = juanitaSearchCandidates(json, kind == "tv" ? "tv" : "movie"), out = [], i;
        for (i = 0; i < cands.length; i++) {
            var c = cands[i], title = (c.titles && c.titles[0]) || c.slug, slug = c.slug;
            if (!slug) continue;
            out.push({
                kind: kind == "tv" ? "tv" : "movie",
                slug: slug,
                title: title,
                year: c.year || "",
                poster: ""
            });
        }
        if (out.length) return out;
    }

    var out2 = [], re, m, seen = {};
    if (kind == "tv") {
        re = /href=["']([^"']*\/series\/ver-serie\/([a-z0-9\-]+))["'][^>]*>/gi;
        while ((m = re.exec(body)) != null && out2.length < 30) {
            if (seen[m[2]]) continue;
            seen[m[2]] = 1;
            out2.push({ kind: "tv", slug: m[2], title: slugToTitle(m[2]), year: "", poster: "" });
        }
    } else {
        re = /href=["']([^"']*\/movies\/(?:pelicula|movie)\/([a-z0-9\-]+))["'][^>]*>/gi;
        while ((m = re.exec(body)) != null && out2.length < 30) {
            if (seen[m[2]]) continue;
            seen[m[2]] = 1;
            out2.push({ kind: "movie", slug: m[2], title: slugToTitle(m[2]), year: "", poster: "" });
        }
        re = /movieInfo\.php\?title=([a-z0-9\-]+)/gi;
        while ((m = re.exec(body)) != null && out2.length < 30) {
            if (seen[m[1]]) continue;
            seen[m[1]] = 1;
            out2.push({ kind: "movie", slug: m[1], title: slugToTitle(m[1]), year: "", poster: "" });
        }
    }
    return out2;
}

function juanitaCatalogVideo(item) {
    var isTv = item.kind == "tv";
    var name = (item.title || item.slug) + (item.year ? " (" + item.year + ")" : "") + (isTv ? " · Serie" : "");
    name = "[Juanita] " + name;
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, "juanita_" + (isTv ? "tv_" : "m_") + item.slug, PID),
        name: name,
        thumbnails: thumb(item.poster || ""),
        author: juanitaAuthor(),
        uploadDate: 0,
        viewCount: 0,
        duration: 0,
        isLive: false,
        url: isTv ? juanitaShowUrl(item.slug) : juanitaMovieUrl(item.slug)
    });
}

function juanitaSearch(query) {
    if (!budgetLeft()) startBudget();
    var movies = juanitaSearchRaw(query, "movie");
    var series = juanitaSearchRaw(query, "tv");
    var out = [], i, seen = {};
    for (i = 0; i < movies.length; i++) {
        if (seen["m" + movies[i].slug]) continue;
        seen["m" + movies[i].slug] = 1;
        out.push(juanitaCatalogVideo(movies[i]));
    }
    for (i = 0; i < series.length; i++) {
        if (seen["t" + series[i].slug]) continue;
        seen["t" + series[i].slug] = 1;
        out.push(juanitaCatalogVideo(series[i]));
    }
    log("Juanita catalog search '" + query + "' -> " + out.length + " (movies=" + movies.length + " series=" + series.length + ")");
    return out;
}

function juanitaMovieSources(slug) {
    var base = JUANITA_BASE, urls = [
        base + "/movies/movieInfo.php?title=" + slug,
        base + "/movies/pelicula/" + slug
    ], bodies = batchGet(urls, base + "/"), out = [], i, j;
    for (i = 0; i < bodies.length; i++) {
        if (!bodies[i]) continue;
        var items = parseJuanita(bodies[i], base);
        for (j = 0; j < items.length; j++) out.push(items[j]);
        if (!items.length) {
            var links = discoverLinks(bodies[i], urls[i]), k;
            for (k = 0; k < links.length; k++) out.push(mkCand(links[k], "", base + "/", "Juanita"));
        }
        if (out.length) break;
    }
    log("  Juanita movie slug=" + slug + " -> " + out.length);
    return out;
}

function juanitaEpisodeSources(slug, season, episode) {
    var base = JUANITA_BASE, s = season || 1, e = episode || 1;
    var urls = [
        base + "/series/serieInfo.php?nombreSerie=" + slug + "&nroTemporada=" + s + "&nroEpisodio=" + e,
        base + "/series/ver-serie/" + slug
    ], bodies = batchGet(urls, base + "/"), out = [], i, j;
    for (i = 0; i < bodies.length; i++) {
        if (!bodies[i]) continue;
        var items = parseJuanita(bodies[i], base);
        for (j = 0; j < items.length; j++) out.push(items[j]);
        if (!items.length) {
            var links = discoverLinks(bodies[i], urls[i]), k;
            for (k = 0; k < links.length; k++) out.push(mkCand(links[k], "", base + "/", "Juanita"));
            if (i === 1) {
                var epUrl = episodeLink(bodies[i], base, s, e);
                if (epUrl) {
                    var eh = httpGet(epUrl, base + "/");
                    items = parseJuanita(eh, base);
                    for (j = 0; j < items.length; j++) out.push(items[j]);
                    links = discoverLinks(eh, epUrl);
                    for (k = 0; k < links.length; k++) out.push(mkCand(links[k], "", base + "/", "Juanita"));
                }
            }
        }
        if (out.length) break;
    }
    log("  Juanita ep slug=" + slug + " S" + s + "E" + e + " -> " + out.length);
    return out;
}

function juanitaDetails(url) {
    var p = juanitaParseInternal(url);
    if (!p) return null;
    resetDebug();
    startBudget();

    if (p.kind == "movie") {
        var cands = juanitaMovieSources(p.slug);
        var sources = [];
        resolveCands(cands, sources, "Juanita");
        var title = slugToTitle(p.slug);
        return new PlatformVideoDetails({
            id: new PlatformID(PLATFORM, "juanita_m_" + p.slug, PID),
            name: title,
            thumbnails: new Thumbnails([]),
            author: juanitaAuthor(),
            uploadDate: 0, duration: 0, viewCount: 0, isLive: false,
            url: juanitaMovieUrl(p.slug),
            description: "Fuente: PelisJuanita (catálogo propio)\nSlug: " + p.slug + "\nFuentes: " + sources.length +
                (debugMode() ? ("\n\n=== DEBUG ===\n" + _debug) : ""),
            video: new VideoSourceDescriptor(sources)
        });
    }

    if (p.kind == "tv") {
        var cands2 = juanitaEpisodeSources(p.slug, p.season, p.episode);
        var sources2 = [];
        resolveCands(cands2, sources2, "Juanita");
        var title2 = slugToTitle(p.slug) + " · S" + p.season + "E" + p.episode;
        return new PlatformVideoDetails({
            id: new PlatformID(PLATFORM, "juanita_tv_" + p.slug + "_" + p.season + "_" + p.episode, PID),
            name: title2,
            thumbnails: new Thumbnails([]),
            author: juanitaAuthor(),
            uploadDate: 0, duration: 0, viewCount: 0, isLive: false,
            url: juanitaEpUrl(p.slug, p.season, p.episode),
            description: "Fuente: PelisJuanita (catálogo propio)\nSlug: " + p.slug + "\nFuentes: " + sources2.length +
                (debugMode() ? ("\n\n=== DEBUG ===\n" + _debug) : ""),
            video: new VideoSourceDescriptor(sources2)
        });
    }

    if (p.kind == "show") {
        return juanitaDetails(juanitaEpUrl(p.slug, 1, 1));
    }
    return null;
}

function juanitaShowChannel(url) {
    var p = juanitaParseInternal(url);
    if (!p || (p.kind != "show" && p.kind != "tv")) return null;
    var slug = p.slug, title = slugToTitle(slug);
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "juanita_show_" + slug, PID),
        name: "[Juanita] " + title,
        thumbnail: "",
        banner: "",
        subscribers: 0,
        description: "Serie desde el catálogo de PelisJuanita.\nSlug: " + slug + "\nAbrí episodios desde Recomendados o buscá el capítulo.",
        url: juanitaShowUrl(slug),
        urlAlternatives: [juanitaShowUrl(slug)],
        links: {}
    });
}

function juanitaShowContents(url) {
    var p = juanitaParseInternal(url);
    if (!p) return new VideoPager([], false, {});
    var slug = p.slug, title = slugToTitle(slug), out = [], i;
    for (i = 1; i <= 30; i++) {
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "juanita_tv_" + slug + "_1_" + i, PID),
            name: title + " · S1E" + i,
            thumbnails: new Thumbnails([]),
            author: juanitaAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: juanitaEpUrl(slug, 1, i)
        }));
    }
    return new VideoPager(out, false, {});
}

function juanitaRecommendations(url) {
    var p = juanitaParseInternal(url);
    if (!p) return [];
    var slug = p.slug, title = slugToTitle(slug), out = [], i, cur = p.kind == "tv" ? p.episode : 1;
    for (i = 1; i <= 40; i++) {
        if (i == cur && p.kind == "tv") continue;
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "juanita_tv_" + slug + "_1_" + i, PID),
            name: title + " · S1E" + i,
            thumbnails: new Thumbnails([]),
            author: juanitaAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: juanitaEpUrl(slug, 1, i)
        }));
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Cuevana3                                                            */
/* ------------------------------------------------------------------ */

function parseCuevana(html, base) {
    var out = [], tags = findTags(html, /data-tr=|data-link=|data-server=/i), marks = [], re = /(Espa[\u00f1n]ol\s+Latino|Latino|Espa[\u00f1n]ol\s+Castellano|Castellano|Subtitulad[oa]s?|Espa[\u00f1n]ol)/gi, m, i, j;
    while ((m = re.exec(html || "")) != null) marks.push({ at: m.index, lang: langOf(m[1]) || (/Espa/i.test(m[1]) ? "Castellano" : "") });
    var pbase = base.indexOf("cuevana3.eu") >= 0 ? "https://player.cuevana3.eu" : base;
    for (i = 0; i < tags.length; i++) {
        var a = attrsOf(tags[i].tag), v = a["data-tr"] || a["data-link"] || a["data-server"] || "";
        if (!v) continue;
        if (!/^https?:|^\/|^player\.php/i.test(v)) { var d = b64decode(v.split("?v=")[1] || v); if (/^https?:\/\//i.test(d)) v = d; else continue; }
        var lang = "";
        for (j = 0; j < marks.length; j++) if (marks[j].at < tags[i].index && tags[i].index - marks[j].at < 2500) lang = marks[j].lang;
        out.push(mkCand(absUrl(v, pbase), lang, base + "/", "Cuevana3"));
    }
    return out;
}
var CUEVANA_FAMILIES = [
    {
        bases: DOMAINS.cuevana_main,
        movie: function (base, slug) { return base + "/ver-pelicula/" + slug; },
        episode: function (base, slug, s, e) { return base + "/episodio/" + slug + "-temporada-" + s + "-episodio-" + e; },
        search: function (base, q) { return base + "/search?q=" + enc(q); }
    },
    {
        bases: DOMAINS.cuevana_alt,
        movie: function (base, slug) { return base + "/pelicula/" + slug; },
        episode: function (base, slug, s, e) { return base + "/serie/" + slug + "/episodio-" + s + "x" + e; },
        search: null
    }
];
function provCuevana(ctx) {
    var fi, bi, i;
    for (fi = 0; fi < CUEVANA_FAMILIES.length && budgetLeft(); fi++) {
        var fam = CUEVANA_FAMILIES[fi];
        for (bi = 0; bi < fam.bases.length && budgetLeft(); bi++) {
            var base = fam.bases[bi], baseSlugs = uniq([slugCuevana(ctx.titleEs), slugCuevana(ctx.titleEn)].concat(cuevanaAltSlugs(ctx))), slugs = [], reached = false;
            for (i = 0; i < baseSlugs.length; i++) { if (ctx.year) slugs.push(baseSlugs[i] + "-" + ctx.year); slugs.push(baseSlugs[i]); }
            slugs = uniq(slugs);
            var urls = [];
            for (i = 0; i < slugs.length; i++) urls.push(ctx.kind == "movie" ? fam.movie(base, slugs[i]) : fam.episode(base, slugs[i], ctx.season, ctx.episode));
            var bodies = batchGet(urls, base + "/"), html = "", pageUrl = "";
            var candIdx = [];
            for (i = 0; i < bodies.length; i++) { if (bodies[i]) reached = true; if (bodies[i] && /data-tr=|data-link=|data-server=/i.test(bodies[i])) candIdx.push(i); }
            for (i = 0; i < candIdx.length; i++) {
                var v = verifyPageTitle(bodies[candIdx[i]], ctx);
                if (v.ok === false) { log("  descartado (no coincide t\u00edtulo/a\u00f1o): " + urls[candIdx[i]].substring(0, 100) + (v.pageTitle ? " -> '" + v.pageTitle + "'" : "")); continue; }
                html = bodies[candIdx[i]]; pageUrl = urls[candIdx[i]];
                if (v.ok === true) log("  verificado: '" + v.pageTitle + "'");
                break;
            }
            if (!html && fam.search && budgetLeft()) {
                var sh = httpGet(fam.search(base, ctx.titleEs), base + "/");
                if (sh) {
                    reached = true;
                    var best = pickBest(findLinks(sh, base, ctx.kind), ctx);
                    if (best) {
                        pageUrl = best.url;
                        if (ctx.kind == "tv") {
                            var slug = String(best.url).split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop();
                            pageUrl = fam.episode(base, slug, ctx.season, ctx.episode);
                        }
                        html = httpGet(pageUrl, base + "/");
                    }
                }
            }
            if (!html && reached) {
                for (i = 0; i < bodies.length; i++) if (bodies[i]) { html = bodies[i]; pageUrl = urls[i]; break; }
            }
            if (html) {
                var items = parseCuevana(html, base);
                if (!items.length) {
                    var links = discoverLinks(html, pageUrl), j;
                    for (j = 0; j < links.length; j++) items.push(mkCand(links[j], "", pageUrl, "Cuevana3"));
                    var direct = scanMedia(html, "", pageUrl, pageUrl), k;
                    for (k = 0; k < direct.length; k++) items.push({ url: "", lang: "", srcs: [direct[k]], prov: "Cuevana3" });
                }
                log("  " + pageUrl.substring(0, 100) + " -> " + items.length + " players");
                if (items.length) return items;
            }
            if (reached) break;
        }
    }
    return [];
}
function cuevanaAltSlugs(ctx) {
    var out = [], i, alts = ctx.altTitles || [];
    for (i = 0; i < alts.length && i < 2; i++) { var s = slugCuevana(alts[i]); if (s) out.push(s); }
    return out;
}

/* ------------------------------------------------------------------ */
/* sitios WordPress / DooPlay / Toroflix                               */
/* ------------------------------------------------------------------ */

var SITES = [
    { id: "pelisplus", name: "PelisPlusHD", bases: DOMAINS.pelisplushd, search: ["/search?s={q}", "/search/{q}/1"], mode: "pelisplus" },
    { id: "cinecalidad", name: "Cinecalidad", bases: DOMAINS.cinecalidad, search: ["/?s={q}"], mode: "wp" },
    { id: "flixlatam", name: "FlixLatam", bases: DOMAINS.flixlatam, search: ["/?s={q}", "/search?s={q}"], mode: "wp" },
    { id: "pelisflixhd", name: "PelisflixHD", bases: DOMAINS.pelisflixhd, search: ["/busqueda/{q}"], mode: "wp" },
    { id: "gnula", name: "Gnula", bases: DOMAINS.gnula, search: ["/?s={q}", "/search/{q}"], mode: "wp" }
];

function siteQueries(ctx) {
    return uniq([ctx.titleEs, ctx.titleEn].concat((ctx.altTitles || []).slice(0, 2))).slice(0, 4);
}
function siteFind(site, ctx) {
    var qs = siteQueries(ctx), bi, qi, pi;
    for (bi = 0; bi < site.bases.length && budgetLeft(); bi++) {
        var base = site.bases[bi], reached = false;
        for (qi = 0; qi < qs.length && budgetLeft(); qi++) {
            for (pi = 0; pi < site.search.length; pi++) {
                var url = base + site.search[pi].replace("{q}", enc(qs[qi]).replace(/%20/g, "+")), html = httpGet(url, base + "/");
                if (!html) continue;
                reached = true;
                var best = pickBest(findLinks(html, base, ctx.kind), ctx);
                if (best) return { url: best.url, base: base };
                break;
            }
        }
        if (reached) break;
    }
    return null;
}

function episodeLink(html, base, s, e) {
    var re = /<a\b[^>]*href=["']([^"']+)["']/gi, m, S = String(s), E = String(e);
    var p1 = new RegExp("[-/]0*" + S + "x0*" + E + "(?:[/?#]|$)", "i");
    var p2 = new RegExp("(?:temporada|season)-0*" + S + "[-/]+(?:episodio|episode|capitulo)-0*" + E + "(?:[/?#]|$)", "i");
    var p3 = new RegExp("/season/0*" + S + "/episode/0*" + E + "(?:[/?#]|$)", "i");
    var p4 = new RegExp("/temporada/0*" + S + "/episodio/0*" + E + "(?:[/?#]|$)", "i");
    while ((m = re.exec(html || "")) != null) { if (p1.test(m[1]) || p2.test(m[1]) || p3.test(m[1]) || p4.test(m[1])) return absUrl(m[1], base); }
    return "";
}

function embedFromText(t) {
    t = String(t || "").replace(/\\\//g, "/").replace(/\\"/g, '"');
    var m = /<iframe[^>]+(?:src|data-src)=["']([^"']+)/i.exec(t);
    if (m) return cleanUrl(m[1]);
    m = /^\s*(https?:\/\/[^\s"'<>]+|\/\/[^\s"'<>]+)/i.exec(t);
    if (m) return cleanUrl(m[1]);
    m = /"(?:embed_url|url|link|file|iframe|src)"\s*:\s*"([^"]+)"/i.exec(t);
    if (m) return cleanUrl(m[1]);
    return "";
}
function deepUrls(node, out, depth) {
    if (!node || depth > 6 || out.length > 30) return;
    if (typeof node == "string") {
        var e = embedFromText(node);
        if (e) out.push(e);
        return;
    }
    if (typeof node != "object") return;
    var k;
    for (k in node) if (node.hasOwnProperty(k)) deepUrls(node[k], out, depth + 1);
}

function dooEmbed(base, post, nume, type, pageUrl) {
    var b = httpPost(base + "/wp-admin/admin-ajax.php", "action=doo_player_ajax&post=" + enc(post) + "&nume=" + enc(nume) + "&type=" + enc(type), pageUrl, { "X-Requested-With": "XMLHttpRequest", "Origin": base }), d = parseJson(b), u = "";
    if (d && d.embed_url) u = embedFromText(d.embed_url);
    if (!u && b) u = embedFromText(b);
    if (!u) {
        var r = httpGet(base + "/wp-json/dooplayer/v1/post/" + enc(post) + "?type=" + enc(type) + "&source=" + enc(nume), pageUrl);
        d = parseJson(r);
        if (d && d.embed_url) u = embedFromText(d.embed_url);
        if (!u && r) u = embedFromText(r);
    }
    return u ? absUrl(u, base) : "";
}

function pageCandidates(html, pageUrl, base, site, ctx) {
    var cands = [], tags, i, a, u, prov = site.name;
    if (!html) return cands;
    tags = findTags(html, /dooplayer|dooplay_player_option|data-nume=/i);
    var done = 0;
    for (i = 0; i < tags.length && done < 10 && budgetLeft(); i++) {
        a = attrsOf(tags[i].tag);
        if (!a["data-post"] || !a["data-nume"] || a["data-nume"] == "trailer") continue;
        var lbl = a["title"] + " " + strip(html.substring(tags[i].end, tags[i].end + 260).split(/<\/li>/i)[0]);
        u = dooEmbed(base, a["data-post"], a["data-nume"], a["data-type"] || (ctx.kind == "movie" ? "movie" : "tv"), pageUrl);
        done++;
        if (u) cands.push(mkCand(u, langOf(lbl), pageUrl, prov));
    }
    tags = findTags(html, /^<iframe\b/i);
    for (i = 0; i < tags.length && cands.length < 24; i++) {
        a = attrsOf(tags[i].tag);
        u = a["data-src"] || a["src"] || "";
        if (!u || /youtube|youtu\.be|facebook|twitter|google|disqus|recaptcha|doubleclick/i.test(u) || u.indexOf("about:") === 0) continue;
        cands.push(mkCand(absUrl(u, base), langOf(a["title"] || a["id"] || ""), pageUrl, prov));
    }
    tags = findTags(html, /data-video=|data-embed-url=|data-player-url=/i);
    for (i = 0; i < tags.length && cands.length < 24; i++) {
        a = attrsOf(tags[i].tag);
        u = a["data-video"] || a["data-embed-url"] || a["data-player-url"] || "";
        if (/^(?:https?:)?\/\//i.test(u)) cands.push(mkCand(absUrl(u, base), langOf(a["title"] || a["id"] || ""), pageUrl, prov));
    }
    var pm = /"post_id"\s*:\s*"(\d+)"/.exec(html);
    if (pm && budgetLeft()) {
        var pj = httpGet(base + "/wp-json/get/players?id=" + pm[1], pageUrl), urls = [], k;
        deepUrls(parseJson(pj) || pj, urls, 0);
        for (k = 0; k < urls.length; k++) cands.push(mkCand(absUrl(urls[k], base), "", pageUrl, prov));
    }
    var vm = /href=["']#video-(\d+)["']/i.exec(html), pid = /data-player-id=["'](\d+)["']/i.exec(html);
    if (vm && ctx.kind == "movie") cands.push(mkCand("https://www.rexpelis.com/player/embed/movie/" + vm[1], "", pageUrl, prov));
    if (pid && ctx.kind == "tv") cands.push(mkCand("https://www.rexpelis.com/player/embed/episode/" + pid[1], "", pageUrl, prov));
    tags = findTags(html, /data-embed=[^>]*data-issuer=|data-issuer=[^>]*data-embed=/i);
    for (i = 0; i < tags.length && i < 4 && budgetLeft(); i++) {
        a = attrsOf(tags[i].tag);
        if (!a["data-embed"] || !a["data-issuer"] || !a["data-signature"]) continue;
        var ed = httpPost("https://stream.repelis.red/edge-data/", "streaming=" + enc(a["data-embed"]) + "&validtime=" + enc(a["data-issuer"]) + "&token=" + enc(a["data-signature"]), "https://stream.repelis.red", { "Origin": "https://stream.repelis.red" });
        var eu = [], ej = parseJson(ed), es = scanMedia(ed, "", "https://stream.repelis.red/", "https://stream.repelis.red/");
        if (es.length) { cands.push({ url: "", lang: "", srcs: es, prov: prov }); continue; }
        deepUrls(ej || ed, eu, 0);
        for (var q = 0; q < eu.length; q++) cands.push(mkCand(eu[q], "", "https://stream.repelis.red/", prov));
    }
    if (base.indexOf("pelisplay") >= 0 && budgetLeft()) {
        var tk = (/name=["']csrf-token["'][^>]*content=["']([^"']+)/i.exec(html) || /_token["']?\s*[:=]\s*["']([^"']+)/i.exec(html) || /name=["']_token["'][^>]*value=["']([^"']+)/i.exec(html) || [])[1] || "";
        tags = findTags(html, /data-player=/i);
        for (i = 0; i < tags.length && i < 8 && tk; i++) {
            a = attrsOf(tags[i].tag);
            if (!a["data-player"] || /publicidad/i.test(a["data-lang"] || "")) continue;
            var pr = httpPost("https://www.pelisplay.co/entradas/procesar_player", "data=" + enc(a["data-player"]) + "&tipo=videohost&_token=" + enc(tk), pageUrl, { "X-Requested-With": "XMLHttpRequest", "Origin": "https://www.pelisplay.co" });
            var pu = embedFromText(pr);
            if (pu) cands.push(mkCand(absUrl(pu, base), langOf(a["data-lang"] || ""), pageUrl, prov));
        }
    }
    if (site.mode == "pelisplus") {
        var re = /https?:\/\/[^\s"'<>]+\/(?:video|embed\.php|ext\.php)[^\s"'<>]*/gi, mm;
        while ((mm = re.exec(html)) != null && cands.length < 24) cands.push(mkCand(cleanUrl(mm[0]), "", pageUrl, prov));
        re = /go_to_player\(['"]([^'"]+)/gi;
        while ((mm = re.exec(html)) != null && cands.length < 24) cands.push(mkCand(mm[1].indexOf("http") == 0 ? mm[1] : "https://api.mycdn.moe/player/?id=" + mm[1], "", pageUrl, prov));
    }
    tags = findTags(html, /data-option\s*=|data-server\s*=/i);
    for (i = 0; i < tags.length && cands.length < 30; i++) {
        if (/trailer/i.test(tags[i].tag)) continue;
        a = attrsOf(tags[i].tag);
        u = a["data-option"] || a["data-server"] || "";
        if (!u) continue;
        if (!/^(?:https?:)?\/\//i.test(u) && u.charAt(0) != "/") {
            var d64 = b64decode(u);
            if (/^https?:\/\//i.test(d64)) u = d64; else continue;
        }
        var lbl9 = strip(html.substring(tags[i].end, tags[i].end + 200).split(/<\/li>/i)[0]);
        cands.push(mkCand(absUrl(u, base), langOf(lbl9) || (base.indexOf("cinecalidad") >= 0 ? "Latino" : ""), pageUrl, prov));
    }
    return cands;
}

function provSite(site, ctx) {
    var f = siteFind(site, ctx), pageUrl, html;
    if (!f) { log("  sin resultado"); return []; }
    pageUrl = f.url;
    if (ctx.kind == "tv") {
        var ep = "";
        if (site.mode == "pelisplus" && /\/serie\//i.test(pageUrl)) ep = pageUrl.replace(/\/+$/, "") + "/season/" + ctx.season + "/episode/" + ctx.episode;
        else {
            var sh = httpGet(pageUrl, f.base + "/");
            ep = episodeLink(sh, f.base, ctx.season, ctx.episode);
        }
        if (!ep) { log("  episodio " + ctx.season + "x" + ctx.episode + " no encontrado"); return []; }
        pageUrl = ep;
    }
    html = httpGet(pageUrl, f.base + "/");
    if (!html) { log("  pagina vacia"); return []; }
    var c = pageCandidates(html, pageUrl, f.base, site, ctx);
    log("  " + pageUrl.substring(0, 100) + " -> " + c.length + " candidatos");
    return c;
}

/* ------------------------------------------------------------------ */
/* PlPro.org                                                           */
/* ------------------------------------------------------------------ */

function plproGet(path) {
    var sep = path.indexOf("?") >= 0 ? "&" : "?";
    var url = PLPRO_BASE + path + sep + "username=" + enc(PLPRO_USER) + "&password=" + enc(PLPRO_PASS);
    var b = httpGet(url, PLPRO_BASE + "/", { "User-Agent": "PLPro/8" });
    return parseJson(b);
}
function provPlPro(ctx) {
    var isTv = ctx.kind == "tv", data = plproGet(isTv ? "/series" : "/movies/resume");
    var list = data && (isTv ? data.series : data.movies);
    if (!list || !list.length) { log("  plpro: catalogo no disponible"); return []; }
    var links = [], i;
    for (i = 0; i < list.length; i++) {
        var x = list[i];
        if (!x || !x.a) continue;
        links.push({ url: "plpro:" + x.a, titles: [x.b || "", x.i || ""], type: isTv ? "tv" : "movie", year: x.f ? String(x.f) : "" });
    }
    var best = pickBest(links, ctx);
    if (!best) { log("  plpro: sin coincidencia en su cat\u00e1logo (" + list.length + " t\u00edtulos)"); return []; }
    var id = best.url.split(":")[1];
    var raw = isTv ? plproGet("/series/" + id + "/links/" + ctx.season + "/" + ctx.episode) : plproGet("/movies/" + id + "/links");
    if (!raw || !raw.length) { log("  plpro: id=" + id + " sin links"); return []; }
    var cands = [], j;
    for (j = 0; j < raw.length && cands.length < 12; j++) {
        var l = raw[j];
        if (!l || !l.a) continue;
        cands.push(mkCand(l.a, langOf(l.b || l.c || ""), PLPRO_BASE + "/", "PlPro"));
    }
    log("  plpro: id=" + id + " -> " + cands.length + " candidatos");
    return cands;
}

/* ------------------------------------------------------------------ */
/* prefetch por proveedor                                              */
/* ------------------------------------------------------------------ */

function poseidonPrefetchUrls(ctx) {
    var urls = [], bid, id;
    if (!ctx || !ctx.id) return urls;
    try {
        bid = poseidonBuildId();
        id = String(ctx.id);
        if (ctx.kind == "movie") {
            urls.push(POSEIDON_BASE + "/_next/data/" + bid + "/es/pelicula/" + id + "/x.json?tmdb=" + enc(id) + "&movie=x");
        } else {
            urls.push(POSEIDON_BASE + "/_next/data/" + bid + "/es/serie/" + id + "/x/temporada/" +
                (ctx.season || 1) + "/episodio/" + (ctx.episode || 1) +
                ".json?tmdb=" + enc(id) + "&serie=x&season=" + (ctx.season || 1) + "&episode=" + (ctx.episode || 1));
        }
    } catch (e) { log("prefetch poseidon -> " + e); }
    return urls;
}
function juanitaPrefetchUrls(ctx) {
    var urls = [], jslug;
    jslug = juanitaSlugCandidates(ctx)[0] || slugJuanita(ctx.titleEs || ctx.titleEn || "");
    if (!jslug) return urls;
    if (ctx.kind == "movie") urls.push("https://pelisjuanita.com/movies/movieInfo.php?title=" + enc(jslug));
    else urls.push("https://pelisjuanita.com/series/serieInfo.php?nombreSerie=" + enc(jslug) +
        "&nroTemporada=" + enc(ctx.season || 1) + "&nroEpisodio=" + enc(ctx.episode || 1));
    return urls;
}
function cuevanaPrefetchUrls(ctx) {
    var slug1 = slugCuevana(ctx.titleEs || ctx.titleEn || ""), fam = CUEVANA_FAMILIES[0];
    if (!slug1 || !fam) return [];
    return [ctx.kind == "movie" ? fam.movie(fam.bases[0], slug1) : fam.episode(fam.bases[0], slug1, ctx.season, ctx.episode)];
}

function provPelisflix1(ctx) {
    var bases = DOMAINS.pelisflix1;
    var searches = ["/search?s={q}", "/?s={q}", "/buscar/{q}", "/search/{q}"];
    var out = [], qi, bi, base, q, html, best, page, body, links, j, direct;
    var queries = siteQueries(ctx);
    for (bi = 0; bi < bases.length && budgetLeft() && !out.length; bi++) {
        base = bases[bi];
        for (qi = 0; qi < 1 && budgetLeft() && !out.length; qi++) {
            var sUrls = [], qx, jx;
            for (qx = 0; qx < queries.length && qx < 2; qx++) {
                q = enc(queries[qx]).replace(/%20/g, "+");
                for (jx = 0; jx < searches.length; jx++) sUrls.push(base + searches[jx].replace("{q}", q));
            }
            var sBodies = batchGet(sUrls, base + "/");
            for (j = 0; j < sBodies.length && budgetLeft(); j++) {
                html = sBodies[j];
                if (!html) continue;
                best = pickBest(findLinks(html, base, ctx.kind), ctx);
                if (!best) continue;
                page = best.url;
                body = httpGet(page, base + "/");
                if (!body) continue;
                if (ctx.kind == "tv") {
                    links = [];
                    var all = discoverLinks(body, page);
                    for (var z = 0; z < all.length; z++) {
                        if (new RegExp("(?:season|temporada)[-_]?0*" + ctx.season + "[^0-9]{0,12}(?:episode|episodio|capitulo)[-_]?0*" + ctx.episode, "i").test(all[z]) || /\/\d+x\d+(?:[/?#]|$)/i.test(all[z])) links.push(all[z]);
                    }
                    if (links.length) {
                        body = httpGet(links[0], page) || body;
                        page = links[0];
                    }
                }
                direct = scanMedia(body, "Pelisflix1", page, page);
                for (z = 0; z < direct.length; z++) out.push({ url: "", lang: "", srcs: [direct[z]], prov: "Pelisflix1" });
                if (!direct.length) {
                    var em = discoverLinks(body, page);
                    for (z = 0; z < em.length && z < 10; z++) out.push(mkCand(em[z], "", page, "Pelisflix1"));
                }
                if (out.length) { log("  Pelisflix1 " + base + " -> " + out.length + " candidato(s)"); return out; }
            }
        }
    }
    log("  Pelisflix1 -> 0 candidatos");
    return out;
}
function pelisflixPrefetchUrls(ctx) {
    var q = enc(ctx.titleEs || ctx.titleEn || "").replace(/%20/g, "+");
    if (!q) return [];
    return ["https://pelisflix1.tv/search?s=" + q];
}

/* ------------------------------------------------------------------ */
/* Proveedores Streamflix Reborn (grupo ES)                            */
/* ------------------------------------------------------------------ */

function qPlus(s) { return enc(s).replace(/%20/g, "+"); }
function jsonGet(url, ref) { return parseJson(httpGet(url, ref, { "Accept": "application/json" })); }

var SOLO_SITE = { id: "sololatino", name: "SoloLatino", bases: DOMAINS.sololatino, search: ["/buscar?q={q}"], mode: "solo" };
function soloLang(s) {
    s = String(s || "").toUpperCase();
    if (s == "LAT" || s.indexOf("LATIN") >= 0) return "Latino";
    if (s == "SUB" || s.indexOf("SUB") >= 0) return "Subtitulado";
    if (s == "ESP" || s == "CAST" || s.indexOf("CAST") >= 0) return "Castellano";
    return "";
}
function jwtLink(tok) {
    var parts = String(tok || "").split("."), p, m;
    if (parts.length < 2) return "";
    p = b64decode(parts[1]);
    m = /"link"\s*:\s*"([^"]+)"/.exec(p);
    return m ? cleanUrl(m[1].replace(/\\\//g, "/")) : "";
}
function soloIframeCands(iframeUrl, pageUrl, prov) {
    var html = httpGet(iframeUrl, pageUrl), out = [], m, arr, i, j, e, lang, embeds, link, re;
    if (!html) return out;
    m = /dataLink\s*=\s*(\[[\s\S]+?\])\s*;/.exec(html);
    arr = m ? parseJson(m[1]) : null;
    if (arr && arr.length) {
        for (i = 0; i < arr.length; i++) {
            e = arr[i] || {};
            lang = soloLang(e.video_language || e.language || e.lang || "");
            embeds = e.sortedEmbeds || e.embeds || [];
            for (j = 0; j < embeds.length; j++) {
                link = embeds[j] && (embeds[j].link || embeds[j].url) || "";
                if (link && !/^https?:\/\//i.test(link)) link = jwtLink(link);
                if (link && /^https?:\/\//i.test(link)) out.push(mkCand(link, lang, iframeUrl, prov));
            }
        }
    }
    if (!out.length) {
        re = /go_to_playerVast\(\s*'([^']+)'/g;
        while ((m = re.exec(html)) != null && out.length < 12) if (/^https?:\/\//i.test(m[1])) out.push(mkCand(m[1], "", iframeUrl, prov));
    }
    log("    iframe " + hostOf(iframeUrl) + " -> " + out.length + " servidores");
    return out;
}
function soloEpisodeLink(html, base, s, e) {
    var h = String(html || ""), m, start, next, part, tags, i, a, hrefs = [], re;
    m = new RegExp("data-season-panel\\s*=\\s*[\"']?" + s + "[\"']?", "i").exec(h);
    if (!m) return "";
    start = m.index;
    next = h.substring(start + 20).search(/data-season-panel/i);
    part = next >= 0 ? h.substring(start, start + 20 + next) : h.substring(start);
    tags = findTags(part, /ep-item/i);
    for (i = 0; i < tags.length; i++) { a = attrsOf(tags[i].tag); if (a["href"]) hrefs.push(absUrl(a["href"], base)); }
    if (!hrefs.length) return "";
    re = new RegExp("(?:^|[^0-9])0*" + s + "x0*" + e + "(?:[^0-9]|$)|episodio[-/]0*" + e + "(?:[^0-9]|$)", "i");
    for (i = 0; i < hrefs.length; i++) if (re.test(hrefs[i])) return hrefs[i];
    return hrefs[e - 1] || "";
}
function provSoloLatino(ctx) {
    var f = siteFind(SOLO_SITE, ctx), pageUrl, base, html, tags, i, a, u, sub, out = [], done = 0;
    if (!f) { log("  sin resultado"); return out; }
    base = f.base; pageUrl = f.url;
    if (ctx.kind == "tv") {
        var sh = httpGet(pageUrl, base + "/"), ep = soloEpisodeLink(sh, base, ctx.season, ctx.episode) || episodeLink(sh, base, ctx.season, ctx.episode);
        if (!ep) { log("  episodio " + ctx.season + "x" + ctx.episode + " no encontrado"); return out; }
        pageUrl = ep;
    }
    html = httpGet(pageUrl, base + "/");
    if (!html) { log("  pagina vacia"); return out; }
    tags = findTags(html, /data-server-url\s*=/i);
    for (i = 0; i < tags.length && done < 6 && budgetLeft(); i++) {
        a = attrsOf(tags[i].tag);
        u = a["data-server-url"] || "";
        if (!u) continue;
        u = absUrl(u, base);
        done++;
        sub = soloIframeCands(u, pageUrl, "SoloLatino");
        if (sub.length) out = out.concat(sub); else out.push(mkCand(u, "Latino", pageUrl, "SoloLatino"));
    }
    if (!out.length) log("  sololatino: sin data-server-url (el sitio usa /api/player-url con XSRF; no portado)");
    log("  " + pageUrl.substring(0, 100) + " -> " + out.length + " candidatos");
    return out;
}
function soloPrefetchUrls(ctx) {
    var q = ctx.titleEs || ctx.titleEn || "";
    return q ? [DOMAINS.sololatino[0] + "/buscar?q=" + qPlus(q)] : [];
}

var PPTO_SITE = { id: "pelisplusto", name: "PelisPlus", bases: DOMAINS.pelisplusto, search: ["/search/{q}"], mode: "pelisplusto" };
function pelisplusOnload(pg, base) {
    var s = String(pg || ""), m, re, host = hostOf(base);
    m = /window\.onload[\s\S]{0,600}?(https?:\/\/[^\s'"\\]+)/i.exec(s);
    if (m && hostOf(m[1]) != host) return cleanUrl(m[1]);
    re = /https?:\/\/[^\s'"\\<>]+/gi;
    while ((m = re.exec(s)) != null) { if (isServerUrl(m[0])) return cleanUrl(m[0]); }
    return "";
}
function provPelisplusTo(ctx) {
    var f = siteFind(PPTO_SITE, ctx), pageUrl, base, html, tags, i, a, ds, d64, u, pg, out = [];
    if (!f) { log("  sin resultado"); return out; }
    base = f.base; pageUrl = f.url;
    if (ctx.kind == "tv") pageUrl = pageUrl.replace(/\/+$/, "") + "/season/" + ctx.season + "/episode/" + ctx.episode;
    html = httpGet(pageUrl, base + "/");
    if (!html) { log("  pagina vacia"); return out; }
    tags = findTags(html, /data-server\s*=/i);
    for (i = 0; i < tags.length && out.length < 8 && budgetLeft(); i++) {
        a = attrsOf(tags[i].tag);
        ds = a["data-server"];
        if (!ds) continue;
        d64 = b64decode(ds);
        if (/^https?:\/\//i.test(d64)) u = d64;
        else { pg = httpGet(base + "/player/" + ds, pageUrl); u = pelisplusOnload(pg, base); }
        if (u) out.push(mkCand(u, "Latino", pageUrl, "PelisPlus"));
    }
    log("  " + pageUrl.substring(0, 100) + " -> " + out.length + " candidatos");
    return out;
}
function pptoPrefetchUrls(ctx) {
    var q = ctx.titleEs || ctx.titleEn || "";
    return q ? [DOMAINS.pelisplusto[0] + "/search/" + qPlus(q)] : [];
}

function pickId(o, depth) {
    var ks = ["_id", "id", "ID", "post_id", "postId"], i, v, r, k;
    depth = depth || 0;
    if (!o || typeof o != "object" || depth > 3) return "";
    for (i = 0; i < ks.length; i++) { v = o[ks[i]]; if (v != null && (typeof v == "number" || /^\d+$/.test(String(v)))) return String(v); }
    for (k in o) if (o.hasOwnProperty(k) && o[k] && typeof o[k] == "object") { r = pickId(o[k], depth + 1); if (r) return r; }
    return "";
}
function firstArray(o, depth) {
    var k, r;
    depth = depth || 0;
    if (!o || typeof o != "object" || depth > 3) return null;
    if (o instanceof Array) return o;
    for (k in o) if (o.hasOwnProperty(k) && o[k] && typeof o[k] == "object") { r = firstArray(o[k], depth + 1); if (r) return r; }
    return null;
}
function pickEpisodeId(list, ep) {
    var arr = firstArray(list, 0), i, j, it, n, ks = ["episode", "number", "episode_number", "num", "n"];
    if (!arr) return "";
    for (i = 0; i < arr.length; i++) {
        it = arr[i];
        if (!it || typeof it != "object") continue;
        for (j = 0; j < ks.length; j++) { n = it[ks[j]]; if (n != null && parseInt(n, 10) == ep) return pickId(it, 0); }
    }
    return arr[ep - 1] ? pickId(arr[ep - 1], 0) : "";
}
function playersFromJson(node, out, lang, depth) {
    var k, l = lang, lv, kl, e;
    if (!node || depth > 6 || out.length > 40) return;
    if (typeof node == "string") { e = embedFromText(node); if (e) out.push({ url: e, lang: lang || "" }); return; }
    if (typeof node != "object") return;
    if (!(node instanceof Array)) {
        lv = node.lang || node.language || node.idioma || node.audio || node.label || node.name;
        if (typeof lv == "string" && langOf(lv)) l = langOf(lv);
    }
    for (k in node) if (node.hasOwnProperty(k)) {
        kl = (node instanceof Array) ? "" : langOf(k);
        playersFromJson(node[k], out, kl || l, depth + 1);
    }
}
function cuevanaApiUrls(base, ctx) {
    var type = ctx.kind == "movie" ? "movies" : "tvshows", slugs = uniq([slugCuevana(ctx.titleEs), slugCuevana(ctx.titleEn)].concat(cuevanaAltSlugs(ctx))), urls = [], i, s;
    for (i = 0; i < slugs.length; i++) {
        s = slugs[i];
        if (ctx.year) urls.push(base + "/wp-api/v1/single/" + type + "?slug=" + enc(s + "-" + ctx.year) + "&postType=" + type);
        urls.push(base + "/wp-api/v1/single/" + type + "?slug=" + enc(s) + "&postType=" + type);
    }
    return uniq(urls);
}
function provCuevanaApi(ctx) {
    var bases = DOMAINS.cuevana_main, bi, base, api, urls, bodies, i, id, d, out = [], postId, pj, found, k, lst;
    for (bi = 0; bi < bases.length && budgetLeft(); bi++) {
        base = bases[bi]; api = base + "/wp-api/v1";
        urls = cuevanaApiUrls(base, ctx).slice(0, 6);
        if (!urls.length) return out;
        bodies = batchGet(urls, base + "/");
        id = "";
        for (i = 0; i < bodies.length && !id; i++) { if (bodies[i]) { d = parseJson(bodies[i]); id = pickId(d, 0); } }
        if (!id) continue;
        log("  cuevana-api " + hostOf(base) + " id=" + id);
        postId = id;
        if (ctx.kind == "tv") {
            lst = jsonGet(api + "/single/episodes/list?_id=" + enc(id) + "&season=" + ctx.season + "&page=1&postsPerPage=100", base + "/");
            postId = pickEpisodeId(lst, ctx.episode);
            if (!postId) { log("  cuevana-api: episodio " + ctx.season + "x" + ctx.episode + " no encontrado"); continue; }
        }
        pj = httpGet(api + "/player?postId=" + enc(postId) + "&demo=0", base + "/", { "Accept": "application/json" });
        d = parseJson(pj);
        found = [];
        playersFromJson(d || pj, found, "", 0);
        for (k = 0; k < found.length; k++) out.push(mkCand(absUrl(found[k].url, base), found[k].lang, base + "/", "Cuevana"));
        log("  cuevana-api " + hostOf(base) + " -> " + out.length + " candidatos");
        if (out.length) return out;
    }
    return out;
}
function cuevanaApiPrefetchUrls(ctx) {
    return cuevanaApiUrls(DOMAINS.cuevana_main[0], ctx).slice(0, 2);
}

/* ---- Esplay / mycdn - best effort ---- */
var ESPLAY_GQL = "https://api.esplay.one/graphql";
function esplayGql(query, variables) {
    var body = JSON.stringify({ query: query, variables: variables || {} });
    var b = httpPost(ESPLAY_GQL, body, "https://pelisplus.esplay.io/", {
        "Content-Type": "application/json",
        "Accept": "application/json"
    });
    return parseJson(b);
}
function provEsplay(ctx) {
    var out = [], data, links = [], i, L, lang, q;
    if (!ctx || !ctx.id || !budgetLeft()) return out;
    try {
        if (ctx.kind == "movie") {
            q = "query($id:Int!){movie(tmdbId:$id){id title sources{name url language quality}}}";
            data = esplayGql(q, { id: parseInt(ctx.id, 10) });
            if (data && data.data && data.data.movie && data.data.movie.sources) links = data.data.movie.sources;
            if (!links.length && data && data.data) {
                var m = data.data.movie || data.data.getMovie || data.data.Movie;
                if (m && (m.sources || m.servers || m.videos)) links = m.sources || m.servers || m.videos;
            }
        } else {
            q = "query($id:Int!,$s:Int!,$e:Int!){episode(tmdbId:$id,season:$s,episode:$e){id sources{name url language quality}}}";
            data = esplayGql(q, { id: parseInt(ctx.id, 10), s: ctx.season || 1, e: ctx.episode || 1 });
            if (data && data.data && data.data.episode && data.data.episode.sources) links = data.data.episode.sources;
        }
        if (data && data.errors) log("  Esplay GQL errors: " + JSON.stringify(data.errors).substring(0, 160));
    } catch (e) { log("  Esplay GQL -> " + e); }
    for (i = 0; i < links.length; i++) {
        L = links[i];
        if (!L) continue;
        var u = L.url || L.file || L.src || L.link || "";
        if (!u) continue;
        lang = langOf(L.language || L.lang || L.name || "") || "";
        out.push(mkCand(absUrl(u, "https://pelisplus.esplay.io/"), lang, "https://pelisplus.esplay.io/", "Esplay"));
    }
    log("  Esplay -> " + out.length + " players");
    return out;
}
function esplayPrefetchUrls(ctx) { return []; }

/* ---- LaCartoons ---- */
var LACARTOONS_BASE = "https://www.lacartoons.com";
function lacartoonsSearchSerieId(ctx) {
    var titles = uniq([ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []).filter(Boolean)), i, t, html, m;
    for (i = 0; i < titles.length && budgetLeft(); i++) {
        t = titles[i];
        if (!t || t.length < 3) continue;
        html = httpGet(LACARTOONS_BASE + "/?Titulo=" + enc(t), LACARTOONS_BASE + "/");
        if (!html) continue;
        m = /href=["'](\/serie\/(\d+))["']/i.exec(html);
        if (m) {
            var re = new RegExp("href=[\"']\\/serie\\/" + m[2] + "[\"'][\\s\\S]{0,400}", "i");
            var chunk = (re.exec(html) || [""])[0];
            var cov = Math.max(titleCoverage(chunk, ctx.titleEs || ""), titleCoverage(chunk, ctx.titleEn || ""), titleCoverage(html.substring(0, 8000), ctx.titleEs || ""));
            if (cov >= 50 || titleCoverage(html, t) >= 40) {
                log("  lacartoons match /serie/" + m[2] + " cov=" + cov);
                return m[2];
            }
            var all = html.match(/href=["']\/serie\/(\d+)["']/gi) || [];
            var ids = uniq(all.map(function (x) { var mm = /(\d+)/.exec(x); return mm ? mm[1] : ""; }).filter(Boolean));
            if (ids.length == 1) return ids[0];
            if (ids.length && cov >= 30) return m[2];
        }
    }
    return "";
}
function lacartoonsCapituloUrl(serieId, season, episode) {
    var html = httpGet(LACARTOONS_BASE + "/serie/" + serieId, LACARTOONS_BASE + "/");
    if (!html) return "";
    var re = /href=["'](\/serie\/capitulo\/(\d+)\?t=(\d+))["'][\s\S]{0,120}?Cap[ií]tulo\s*(\d+)/gi, m, best = "";
    while ((m = re.exec(html)) != null) {
        if (parseInt(m[3], 10) == (season || 1) && parseInt(m[4], 10) == (episode || 1)) {
            best = LACARTOONS_BASE + m[1];
            break;
        }
    }
    if (!best) {
        var list = [], re2 = /href=["'](\/serie\/capitulo\/\d+\?t=(\d+))["']/gi;
        while ((m = re2.exec(html)) != null) {
            if (parseInt(m[2], 10) == (season || 1)) list.push(LACARTOONS_BASE + m[1]);
        }
        if (list.length && (episode || 1) <= list.length) best = list[(episode || 1) - 1];
    }
    return best;
}
function provLaCartoons(ctx) {
    var out = [], serieId, capUrl, html, embeds, i, u;
    if (ctx.kind == "movie") return out;
    serieId = lacartoonsSearchSerieId(ctx);
    if (!serieId) { log("  lacartoons: sin serie"); return out; }
    capUrl = lacartoonsCapituloUrl(serieId, ctx.season || 1, ctx.episode || 1);
    if (!capUrl) { log("  lacartoons: sin capitulo S" + ctx.season + "E" + ctx.episode); return out; }
    log("  lacartoons " + capUrl);
    html = httpGet(capUrl, LACARTOONS_BASE + "/");
    if (!html) return out;
    embeds = [];
    var re = /<iframe[^>]+src=["']([^"']+)["']/gi, m;
    while ((m = re.exec(html)) != null) embeds.push(cleanUrl(m[1]));
    re = /https?:\/\/(?:www\.)?ok\.ru\/[^"'\s<>]+/gi;
    while ((m = re.exec(html)) != null) embeds.push(m[0]);
    re = /https?:\/\/[a-z0-9.-]+\/(?:embed|e|v)\/[a-zA-Z0-9_-]+/gi;
    while ((m = re.exec(html)) != null) embeds.push(m[0]);
    embeds = uniq(embeds);
    for (i = 0; i < embeds.length; i++) {
        u = embeds[i];
        if (!u || /profitable|newrelic|paypal|bit\.ly/i.test(u)) continue;
        out.push(mkCand(u, "Latino", LACARTOONS_BASE + "/", "LaCartoons"));
    }
    log("  lacartoons players " + out.length);
    return out;
}
function lacartoonsPrefetchUrls(ctx) {
    if (ctx.kind == "movie") return [];
    var t = ctx.titleEs || ctx.titleEn || "";
    return t ? [LACARTOONS_BASE + "/?Titulo=" + enc(t)] : [];
}

/* ------------------------------------------------------------------ */
/* Proveedor OK.ru — búsqueda global + coincidencia flexible de título    */
/* ------------------------------------------------------------------ */

function okruIsGenericTitle(t) {
    t = clean(String(t || "")).toLowerCase().replace(/[.\u2026:!]+$/g, "").trim();
    if (!t || t.length < 2) return true;
    if (/^[\d:\s]+$/.test(t)) return true;
    if (/^(view|views|ver|watch|play|reproducir|image|video|videos|more|next|menu|share|like|open|abrir)\b/.test(t) && t.length <= 28) return true;
    if (/^(view|ver|watch)(\s+video)?$/i.test(t)) return true;
    if (/^ok\.ru video\b/i.test(t)) return true;
    return false;
}
function okruTitleScore(pageTitle, want) {
    if (!pageTitle || !want) return 0;
    var cov = titleCoverage(pageTitle, want);
    var sim = tokenSimilarity(pageTitle, want);
    var score = Math.max(cov, sim);
    var wt = titleTokens(want), pt = titleTokens(pageTitle), i, j, soft = 0;
    if (wt.length) {
        for (i = 0; i < wt.length; i++) {
            var hit = false;
            for (j = 0; j < pt.length; j++) {
                if (pt[j] == wt[i] ||
                    (wt[i].length >= 4 && pt[j].indexOf(wt[i].substring(0, Math.max(3, wt[i].length - 1))) === 0) ||
                    (pt[j].length >= 4 && wt[i].indexOf(pt[j].substring(0, Math.max(3, pt[j].length - 1))) === 0)) {
                    hit = true; break;
                }
            }
            if (hit) soft++;
        }
        score = Math.max(score, Math.round((soft / wt.length) * 100));
    }
    return score;
}
function okruCleanPageTitle(t) {
    t = clean(String(t || ""));
    /* Prefijos comunes en OK.ru: "Latino - ...", "[LATINO]", "(Audio Latino)" */
    t = t.replace(/^\s*(?:latino|audio\s+latino|d\.?\s*latino|latam|castellano|subtitulado)\s*[-–—:|]+\s*/i, "");
    t = t.replace(/\s*[\[\(]\s*(?:latino|audio\s+latino|d\.?\s*latino|latam|castellano|m?\d{3,4}p|4k|hd|full\s*hd)\s*[\]\)]\s*/gi, " ");
    t = t.replace(/\s*[\[\(]?\s*(?:audio\s+)?latino\s*[\]\)]?\s*$/i, "");
    return clean(t);
}
function okruPad2(n) {
    n = parseInt(n, 10) || 0;
    return n < 10 ? "0" + n : String(n);
}
/* Capítulo absoluto: suma episode_count de temporadas anteriores + episodio actual (TMDB). */
function okruAbsEpisode(ctx) {
    if (!ctx || ctx.kind != "tv") return 0;
    var s = parseInt(ctx.season, 10) || 1, e = parseInt(ctx.episode, 10) || 1;
    if (ctx.absEpisode) return parseInt(ctx.absEpisode, 10) || e;
    var counts = ctx.seasonCounts || {}, abs = e, i;
    for (i = 1; i < s; i++) abs += parseInt(counts[i], 10) || 0;
    return abs;
}
/*
 * ¿El título OK.ru apunta a este episodio?
 * Acepta (case-insensitive):
 *   Capítulo/Capitulo/Capito/Cap/C 10
 *   Episodio/Ep/E 10
 *   S01E10 / S1E10 / T2E4 / 1x10
 *   Temporada 1 Capítulo 10
 *   Serie - 10   (número suelto con separador)
 * Numeración por temporada (e) y continua/absoluta (absEpisode).
 */
function okruEpisodeMatch(pageTitle, ctx) {
    if (!ctx || ctx.kind != "tv") return { ok: true, bonus: 0, season: 1, episode: 1, abs: 0 };
    var s = parseInt(ctx.season, 10) || 1, e = parseInt(ctx.episode, 10) || 1;
    var abs = okruAbsEpisode(ctx);
    var t = String(pageTitle || "");
    var hit = false, bonus = 0, how = "";

    function accept(n, b, label) {
        n = parseInt(n, 10);
        if (isNaN(n) || n < 1) return;
        if (n === e || (abs > 0 && n === abs)) {
            hit = true;
            if (b > bonus) { bonus = b; how = label; }
        }
    }

    /* S01E10 / T2E4 / s1e10 */
    var mSE = /\b[st]\s*0*(\d{1,2})\s*[xXeE]\s*0*(\d{1,4})\b/i.exec(t);
    if (mSE) {
        var ms = parseInt(mSE[1], 10), me = parseInt(mSE[2], 10);
        if (ms === s && me === e) { hit = true; bonus = 28; how = "SxEy"; }
    }

    /* 1x10 / 01x10 */
    var mX = /\b0*(\d{1,2})\s*[xX]\s*0*(\d{1,4})\b/.exec(t);
    if (mX) {
        if (parseInt(mX[1], 10) === s && parseInt(mX[2], 10) === e) {
            hit = true; bonus = Math.max(bonus, 26); how = how || "NxN";
        }
    }

    /* Temporada 2 Capítulo 4 / Temp 2 Ep 4 */
    var mTemp = /(?:temporada|temp\.?|season)\s*0*(\d{1,2})[^0-9]{0,24}(?:cap[ií]tulo|capito|cap\.?|c\.?|episodio|ep\.?|e\.?|chapter)\s*0*(\d{1,4})\b/i.exec(t);
    if (mTemp) {
        if (parseInt(mTemp[1], 10) === s && parseInt(mTemp[2], 10) === e) {
            hit = true; bonus = Math.max(bonus, 26); how = how || "TxCap";
        }
    }

    /* Capítulo / Capito / Cap / C / Episodio / Ep / E / Chapter N  (por temporada o absoluto) */
    var reCap = /(?:cap[ií]tulo|capito|cap\.?|c\.?|episodio|ep\.?|e\.?|chapter)\s*0*(\d{1,4})\b/gi, mCap;
    while ((mCap = reCap.exec(t)) != null) {
        /* Evitar capturar la "S" de S01E10 como E: si hay S/T justo antes, ya lo cubrió mSE */
        accept(mCap[1], 20, "cap/ep");
    }

    /* E10 / C10 sueltos (letra + número, no parte de palabra) */
    var reEC = /(?:^|[^a-z0-9])([ec])\s*0*(\d{1,4})\b/gi, mEC;
    while ((mEC = reEC.exec(t)) != null) {
        accept(mEC[2], 18, "E/C");
    }

    /* Número suelto tras separador: "Serie - 10", "Serie | 10", "Serie: 10" */
    if (!hit) {
        /* "Serie - 10", "Serie 10 Latino", "Serie | 10 HD" */
        var mNum = /(?:^|[\s\-–—:|·•])0*(\d{1,4})(?=\s*(?:\(|\[|$|[\-–—|·•]|latino|latam|hd|full|1080|720|480|audio|\b))/i.exec(t);
        if (mNum) {
            var nn = parseInt(mNum[1], 10);
            /* Evitar años */
            if (nn >= 1900 && nn <= 2100) nn = -1;
            if (nn === e || (abs > 0 && nn === abs)) {
                hit = true;
                bonus = Math.max(bonus, nn >= 10 ? 12 : 6);
                how = "num";
            }
        }
    }

    /* Si hay SxEy de OTRA temporada/episodio, no es hit (ya evaluado) */
    return { ok: hit, bonus: bonus, season: s, episode: e, abs: abs, how: how };
}
function okruBestScore(pageTitle, ctx) {
    var cleaned = okruCleanPageTitle(pageTitle);
    var best = Math.max(
        okruTitleScore(cleaned, ctx.titleEs || ""),
        okruTitleScore(cleaned, ctx.titleEn || ""),
        okruTitleScore(cleaned, ctx.titleOrig || ""),
        okruTitleScore(pageTitle, ctx.titleEs || ""),
        okruTitleScore(pageTitle, ctx.titleEn || ""),
        okruTitleScore(pageTitle, ctx.titleOrig || "")
    );
    var i, alts = ctx.altTitles || [];
    for (i = 0; i < alts.length; i++) {
        best = Math.max(best, okruTitleScore(cleaned, alts[i]), okruTitleScore(pageTitle, alts[i]));
    }
    /* Preferir copias que anuncian Latino en el título del video OK.ru */
    if (best >= 50 && /\b(?:latino|latam|audio\s+latino|d\.?\s*latino)\b/i.test(String(pageTitle || ""))) {
        best = Math.min(100, best + 12);
    }
    if (ctx && ctx.kind == "tv") {
        var em = okruEpisodeMatch(pageTitle, ctx);
        if (em.ok) best = Math.min(100, best + em.bonus);
        else if (best > 0 && best < 90) best = Math.max(0, best - 25); /* sin episodio claro: penalizar */
    }
    return best;
}
function okruExtractVideoIds(text) {
    var out = [], seen = {}, s = String(text || ""), m, id;
    if (!s) return out;

    /* Normaliza escapes HTML/JS/URL sin destruir los enlaces originales. */
    var variants = [
        s,
        htmlUnescape(s),
        htmlUnescape(s).replace(/\\u002F/gi, "/").replace(/\//g, "/").replace(/%2F/gi, "/").replace(/%3A/gi, ":"),
        s.replace(/\\u002F/gi, "/").replace(/\//g, "/")
    ];

    function add(v) {
        v = String(v || "");
        if (!/^\d{6,}$/.test(v) || seen[v]) return;
        seen[v] = 1;
        out.push(v);
    }

    function harvestDecoded(dec) {
        if (!dec) return;
        var mm, re2 = /(?:https?:\/\/)?(?:www\.|m\.)?ok\.ru\/(?:video|videoembed)\/(\d{6,})/gi;
        while ((mm = re2.exec(dec)) != null) add(mm[1]);
    }

    for (var vi = 0; vi < variants.length; vi++) {
        s = variants[vi];

        /* URLs completas, relativas y variantes codificadas. */
        var res = [
            /(?:https?:\/\/)?(?:www\.|m\.)?ok\.ru\/(?:video|videoembed)\/(\d{6,})/gi,
            /ok\.ru(?:%2F|\/)video(?:%2F|\/)(\d{6,})/gi,
            /(?:^|["'\s(>])\/video\/(\d{6,})(?:[?#"'\s)<]|$)/gi,
            /ok\.ru\s*(?:\u203a|&rsaquo;|&#8250;|&gt;|>|\/)\s*video\s*(?:\u203a|&rsaquo;|&#8250;|&gt;|>|\/)\s*(\d{6,})/gi,
            /ok\.ru(?:<[^>]*>|\s|&[a-z#0-9]+;|[\u203a>\/])+video(?:<[^>]*>|\s|&[a-z#0-9]+;|[\u203a>\/])+(\d{6,})/gi,
            /(?:movieId|videoId|video_id|movie_id|st\.mvId)["'\s:=]+["']?(\d{6,})/gi
        ];
        for (var ri = 0; ri < res.length; ri++) {
            while ((m = res[ri].exec(s)) != null) add(m[1]);
        }

        /* Bing SERP: enlaces reales van en u=a1 + base64(URL).
           Ej: u=a1aHR0cHM6Ly9tLm9rLnJ1L3ZpZGVvLzY5NDcxMjI4NDIxOTY
           -> https://m.ok.ru/video/6947122842196 */
        var b64re = /(?:[?&]u=a1|["']u["']\s*:\s*["']a1)?(aHR0c[A-Za-z0-9+\/=]{30,200})/gi;
        while ((m = b64re.exec(s)) != null) {
            var raw = m[1], pad, dec;
            while (raw.length % 4 === 1) raw = raw.substring(0, raw.length - 1);
            pad = "====".substring(0, (4 - (raw.length % 4)) % 4);
            try { dec = b64decode(raw + pad); } catch (eB) { dec = ""; }
            if (dec && /ok\.ru/i.test(dec)) harvestDecoded(dec);
        }
    }
    return out;
}

function okruSearchTitleNearId(html, pos) {
    var h = String(html || ""), start = Math.max(0, pos - 900), end = Math.min(h.length, pos + 1400);
    var block = h.substring(start, end), m, t = "";
    m = /(?:title|aria-label|data-title|data-name|alt)\s*=\s*["']([^"']{2,300})["']/i.exec(block);
    if (m) t = clean(htmlUnescape(m[1]));
    if (okruIsGenericTitle(t)) {
        m = /(?:"(?:title|name|movieName|videoTitle)"|(?:title|name|movieName|videoTitle))\s*:\s*["']([^"']{2,300})["']/i.exec(block);
        if (m) t = clean(htmlUnescape(m[1]));
    }
    return okruIsGenericTitle(t) ? "" : t;
}

function okruCollectSearchHits(html) {
    var list = [], seen = {}, m, re, id, title, start, end, block, attrs, inner, am;
    html = String(html || "");
    if (!html) return list;

    function addHit(vid, name) {
        vid = String(vid || "");
        if (!/^\d{6,}$/.test(vid) || seen[vid]) return;
        name = clean(htmlUnescape(name || ""));
        if (okruIsGenericTitle(name)) name = "";
        seen[vid] = 1;
        list.push({ id: vid, name: name });
    }

    /* 1) Anchors directos. */
    re = /<a\b([^>]*?href\s*=\s*["'](?:https?:\/\/[^"']+)?\/(?:video|videoembed)\/(\d+)(?:[?#][^"']*)?["'][^>]*)>([\s\S]*?)<\/a>/gi;
    while ((m = re.exec(html)) != null && list.length < 60) {
        id = m[2]; attrs = m[1]; inner = m[3];
        title = "";
        
        // 1. Buscar en atributos principales del enlace
        am = /(?:title|aria-label|data-title|data-name)\s*=\s*["']([^"']{2,300})["']/i.exec(attrs);
        if (am) title = clean(am[1]);
        
        // 2. Buscar en el atributo 'alt' de la imagen (la portada)
        if (okruIsGenericTitle(title)) {
            am = /alt\s*=\s*["']([^"']{2,300})["']/i.exec(inner);
            if (am) title = clean(am[1]);
        }
        
        // 3. Buscar en textos dentro de divs/spans de título
        if (okruIsGenericTitle(title)) {
            am = /<(?:span|div)[^>]*class=["'][^"']*(?:title|name|caption)[^"']*["'][^>]*>([\s\S]{1,300}?)<\/(?:span|div)>/i.exec(inner);
            if (am) title = clean(strip(am[1]));
        }
        
        // 4. Último recurso: texto plano dentro del enlace
        if (okruIsGenericTitle(title)) title = clean(strip(inner));
        
        addHit(id, title);
    }

    /* 2) IDs embebidos en atributos/JSON. */
    re = /(?:data-movie-id|data-video-id|data-content-id|st\.mvId|movieId|videoId|video_id|movie_id)\s*["':=]+\s*["']?(\d{6,})["']?/gi;
    while ((m = re.exec(html)) != null && list.length < 60) {
        id = m[1];
        title = okruSearchTitleNearId(html, m.index);
        addHit(id, title);
    }

    /* 3) Cualquier URL OK.ru que aparezca en el HTML, incluso si está
       rodeada de JSON, escapes JS o parámetros ?st._aid=... */
    var ids = okruExtractVideoIds(html);
    for (var ii = 0; ii < ids.length && list.length < 60; ii++) {
        id = ids[ii];
        title = "";
        var pos = html.indexOf(id);
        if (pos >= 0) title = okruSearchTitleNearId(html, pos);
        addHit(id, title);
    }

    /* 4) Resultado estructurado de <video-search-results>. */
    m = /<video-search-results[^>]*\svideos=(?:"([^"]+)"|'([^']+)')/i.exec(html);
    if (m) {
        try {
            var raw = htmlUnescape(m[1] != null ? m[1] : m[2]);
            var data = parseJson(raw);
            var rows = (data && data.table && data.table.data) || (data && data.data) || [];
            for (var ri = 0; ri < rows.length && list.length < 60; ri++) {
                var r = rows[ri];
                id = String((r && (r.id || r.movieId || r.videoId)) || "");
                addHit(id, r && (r.name || r.title || r.movieName || r.videoTitle) || "");
            }
        } catch (e1) { /* ignore */ }
    }
    return list;
}

function okruQualityRank(name) {
    var s = String(name || "").toLowerCase();
    if (/2160p|4k|ultra/.test(s)) return 100;
    if (/1440p|quad/.test(s)) return 90;
    if (/1080p|full.?hd|full/.test(s)) return 80;
    if (/720p|\bhd\b/.test(s)) return 60;
    if (/480p|sd/.test(s)) return 40;
    if (/360p|low/.test(s)) return 25;
    if (/240p/.test(s)) return 15;
    if (/144p|mobile|lowest/.test(s)) return 5;
    if (/\bhls\b/.test(s)) return 70;
    return 30; /* calidad desconocida: debajo de HD, encima de bajas */
}
function okruSortSourcesByQuality(srcs) {
    srcs.sort(function (a, b) {
        var ar = okruQualityRank(a && a.name), br = okruQualityRank(b && b.name);
        if (ar != br) return br - ar;
        return 0;
    });
    return srcs;
}
function okruSourcesFromMeta(meta, label) {
    var srcs = [], hls, vids, vi, vu, s, lab = label || "OK.ru";
    if (!meta) return srcs;
    vids = (meta.videos || []).slice(0);
    vids.sort(function (a, b) { return (OK_RANK[b.name] || 0) - (OK_RANK[a.name] || 0); });
    for (vi = 0; vi < vids.length; vi++) {
        vu = vids[vi] && vids[vi].url ? cleanUrl(String(vids[vi].url).replace(/\\u0026/gi, "&").replace(/\\\//g, "/")) : "";
        if (!vu) continue;
        s = mkSrcBare(vu, lab + " " + (OK_LABEL[vids[vi].name] || vids[vi].name || "MP4"), "mp4");
        if (s) srcs.push(s);
        if (srcs.length >= 3) break;
    }
    hls = meta.hlsManifestUrl || meta.hlsMasterPlaylistUrl || meta.ondemandHls || "";
    if (hls) {
        hls = cleanUrl(String(hls).replace(/\\u0026/gi, "&").replace(/\\\//g, "/"));
        s = mkSrcBare(hls, lab + " HLS", "hls");
        if (s) srcs.push(s);
    }
    return okruSortSourcesByQuality(srcs);
}
function okruFetchSearchPage(q) {
    /* Misma URL y cabeceras que el plugin OK.ru que ya funciona:
       ok.ru/dk?st.cmd=searchResult&st.mode=Movie&st.grmode=Groups&st.query=...
       (con st.grmode=Groups; sin eso m.ok.ru devolvia el feed general).
       Exige sesion: se piden con las cookies de GrayJay (httpGetAuth). */
    clearOkruFails();
    var url = "https://ok.ru/dk?st.cmd=searchResult&st.mode=Movie&st.grmode=Groups&st.query=" + enc(q);
    var html, hits, n;
    if (_okSearchDead) return "";
    if (!budgetLeft()) return "";

    html = httpGetAuth(url, "https://ok.ru/");
    n = html ? html.length : 0;
    hits = n > 500 ? okruCollectSearchHits(html) : [];
    log("  OK.ru search auth ok.ru bytes=" + n + " ids=" + hits.length);
    if (hits.length) return html;

    if (n > 500) okruDiag(html, q);
    if (!n || /st\.cmd=anonym|anonymLogin|anonymMain|st\.email|st\.password|field_email|unite a ok|join ok|people named|personas llamadas/i.test(html)) {
        log("  OK.ru: SIN SESION. Inicia sesion en OK.ru desde los ajustes del source PelisHub en GrayJay.");
    }
    _okSearchDead = true;
    return "";
}

var _okSearchDead = false;
function okruDiag(html, q) {
    var c = function (re) { return (html.match(re) || []).length; };
    var w = String(q || "").split(/\s+/)[0], pw = html.search(new RegExp(w.replace(/[^\w\u00C0-\u017F]/g, ""), "i"));
    var pv = html.search(/\/video\/\d/);
    log("  diag: /video/=" + c(/\/video\/\d/g) + " movieId=" + c(/movieId|mvId/g) + " q=" + c(new RegExp(w.replace(/[^\w\u00C0-\u017F]/g, ""), "gi")) +
        " anonym=" + c(/anonym|loginForm|st\.cmd=login/gi) + " vsr=" + c(/video-search-results/g));
    if (pw >= 0) log("  diag q@" + pw + ": " + html.substring(Math.max(0, pw - 60), pw + 140).replace(/\s+/g, " "));
    if (pv >= 0) log("  diag video@" + pv + ": " + html.substring(Math.max(0, pv - 80), pv + 120).replace(/\s+/g, " "));
}

function provOkruDirect(ctx) {
    var out = [], i, j, q, queries = [], seenQ = {}, hits = [], seenHit = {}, html, id, emb, meta, movieTitle, score, srcs, cand;
    /* Solo corre si servidoresPlus está activo (o modo legacy soloOkru) */
    if (!ctx || !budgetLeft() || (!servidoresPlus() && !onlyOkru())) return out;

    _okSearchDead = false;
    /* Fails de búsqueda no deben impedir videoembed / video page. */
    clearOkruFails();

    function addQ(s) {
        s = clean(String(s || ""));
        if (!s || s.length < 2) return;
        var k = normalizeTitle(s);
        if (!k || seenQ[k]) return;
        seenQ[k] = 1;
        queries.push(s);
    }

    /*
     * OK.ru no usa siempre el mismo nombre que TMDB.
     * Ejemplo real: TMDB puede entregar "Big", mientras OK.ru publica
     * "Quisiera Ser Grande", "Quisiera ser grande (Latino)" o
     * "Quisiera ser Grande (Audio Latino)".
     *
     * Orden (quality-first + Latino):
     *   1) ES + 1080p/Full HD/720p + año
     *   2) ES + Latino 1080p/720p + año
     *   3) ES + Latino / Audio Latino + año
     *   4) EN/original + calidad + Latino
     *   5+) alternativas TMDB y variantes Latino
     *
     * "latino" es ruido SOLO al comparar/deduplicar, no al descubrir.
     */
    var yq = ctx.year ? " " + ctx.year : "";
    var tq, primary = [], pi;
    var isTv = ctx.kind == "tv";
    var sn = parseInt(ctx.season, 10) || 1, en = parseInt(ctx.episode, 10) || 1;
    var sn2 = okruPad2(sn), en2 = okruPad2(en);

    /* Títulos en español latino primero (portada OK.ru suele usarlos). */
    if (ctx.titleEs) primary.push(ctx.titleEs);
    if (ctx.altTitles) {
        for (i = 0; i < ctx.altTitles.length && i < 5; i++) primary.push(ctx.altTitles[i]);
    }
    if (ctx.titleEn && normalizeTitle(ctx.titleEn) != normalizeTitle(ctx.titleEs)) primary.push(ctx.titleEn);
    if (ctx.titleOrig && normalizeTitle(ctx.titleOrig) != normalizeTitle(ctx.titleEs) && normalizeTitle(ctx.titleOrig) != normalizeTitle(ctx.titleEn)) primary.push(ctx.titleOrig);

    for (pi = 0; pi < primary.length; pi++) {
        tq = primary[pi];
        if (!tq) continue;
        if (isTv) {
            /*
             * Formatos habituales en OK.ru:
             *   "REBELDE WAY - Capítulo 71" / Cap 71 / C71 / Episodio 71 / E71
             *   "Serie S01E10" / "1x10" / "T1E10" / "Serie - 10"
             * También numeración continua (abs): Loki E10 ≈ S2E4.
             */
            var absN = okruAbsEpisode(ctx);
            var nums = [];
            function pushNum(n) {
                n = parseInt(n, 10);
                if (!n || n < 1) return;
                var k = String(n);
                if (nums.indexOf(k) < 0) nums.push(k);
            }
            pushNum(en);
            if (absN && absN != en) pushNum(absN);

            if (pi === 0) {
                var ni, num;
                for (ni = 0; ni < nums.length; ni++) {
                    num = nums[ni];
                    addQ(tq + " Capítulo " + num);
                    addQ(tq + " Capitulo " + num);
                    addQ(tq + " Cap " + num);
                    addQ(tq + " Capito " + num);
                    addQ(tq + " C" + num);
                    addQ(tq + " Episodio " + num);
                    addQ(tq + " Ep " + num);
                    addQ(tq + " E" + num);
                    addQ(tq + " - " + num);
                    addQ(tq + " " + num);
                    addQ(tq + " Capítulo " + num + " Latino");
                    addQ(tq + " Cap " + num + " Latino");
                    addQ(tq + " E" + num + " Latino");
                }
                addQ(tq + " S" + sn2 + "E" + en2);
                addQ(tq + " S" + sn + "E" + en);
                addQ(tq + " T" + sn2 + "E" + en2);
                addQ(tq + " T" + sn + "E" + en);
                addQ(tq + " " + sn + "x" + en2);
                addQ(tq + " " + sn + "x" + en);
                addQ(tq + " Temporada " + sn + " Capítulo " + en);
                addQ(tq + " Temp " + sn + " Cap " + en);
            } else {
                addQ(tq + " Capítulo " + en);
                addQ(tq + " Cap " + en);
                addQ(tq + " E" + en);
                addQ(tq + " S" + sn2 + "E" + en2);
                if (absN && absN != en) {
                    addQ(tq + " Capítulo " + absN);
                    addQ(tq + " E" + absN);
                }
            }
        } else {
            /* quality + Latino primero para el título principal (películas) */
            if (pi === 0) {
                addQ(tq + " Latino 1080p" + yq);
                addQ(tq + " Latino 720p" + yq);
                addQ(tq + " 1080p" + yq);
                addQ(tq + " Full HD" + yq);
                addQ(tq + " 720p" + yq);
            }
            addQ(tq + " Latino" + yq);
            addQ(tq + " Audio Latino" + yq);
            addQ(tq + yq);
            addQ(tq + " pelicula" + yq);
        }
    }
    if (!queries.length) return out;

    function pushHits(found) {
        for (j = 0; j < found.length; j++) {
            if (seenHit[found[j].id]) {
                if (!seenHit[found[j].id].name && found[j].name) seenHit[found[j].id].name = found[j].name;
                continue;
            }
            seenHit[found[j].id] = found[j];
            hits.push(found[j]);
        }
    }

    log("  OK.ru build v1.8.21 series-abs");
    log("  OK.ru queries: " + queries.slice(0, 6).join(" | "));

    /*
     * Búsqueda directa en OK.ru móvil.
     * Importante: no detenerse en el primer match. Primero debe ejecutarse
     * como mínimo una consulta con "Latino", porque la primera página puede
     * devolver una copia subtitulada/castellana aunque exista una copia
     * doblada al español latino.
     */
    var latinoQueriesRun = 0;
    var goodMatches = 0;
    for (i = 0; i < queries.length && hits.length < 24 && budgetLeft(); i++) {
        q = queries[i];
        if (/(?:^|\s)(?:latino|audio\s+latino)(?:\s|$)/i.test(q)) latinoQueriesRun++;
        html = okruFetchSearchPage(q);
        if (html) {
            pushHits(okruCollectSearchHits(html));
            log("  OK.ru internal '" + q.substring(0, 50) + "' -> hits: " + hits.length);
            goodMatches = 0;
            var gi;
            for (gi = 0; gi < hits.length; gi++) {
                if (hits[gi].name && okruBestScore(hits[gi].name, ctx) >= 55) goodMatches++;
            }
            if (goodMatches >= 1 && latinoQueriesRun >= 1) {
                log("  OK.ru: " + goodMatches + " coincidencia(s); ya se probó variante Latino");
                break;
            }
        }
        if (hits.length >= 16 && latinoQueriesRun >= 1 && goodMatches >= 1) break;
    }

    log("  OK.ru candidatos crudos: " + hits.length);
    for (i = 0; i < hits.length && i < 8; i++) log("  OK.ru hit " + hits[i].id + " '" + String(hits[i].name || "?").substring(0, 40) + "' sc=" + (hits[i].name ? okruBestScore(hits[i].name, ctx) : 0));

    var ranked = [];
    for (i = 0; i < hits.length; i++) {
        score = hits[i].name ? okruBestScore(hits[i].name, ctx) : 0;
        ranked.push({ id: hits[i].id, name: hits[i].name, pre: score });
    }
    /* Sin nombre (web-discover base64) va al final: se valida al abrir el embed. */
    ranked.sort(function (a, b) {
        if (a.pre != b.pre) return b.pre - a.pre;
        if (!!a.name != !!b.name) return a.name ? -1 : 1;
        return 0;
    });

    var okruVideosProcessed = 0;
    for (i = 0; i < ranked.length && okruVideosProcessed < 8 && budgetLeft(); i++) {
        id = ranked[i].id;
        movieTitle = ranked[i].name || "";
        if (movieTitle && ranked[i].pre > 0 && ranked[i].pre < 35) {
            log("  OK.ru pre-skip id=" + id + " pre=" + ranked[i].pre + " '" + movieTitle.substring(0, 40) + "'");
            continue;
        }

        /* Con sesion primero (el embed anonimo suele venir sin streams); luego anonimo. */
        emb = ""; meta = null;
        var tries = [
            ["auth", "https://ok.ru/videoembed/" + id, "https://ok.ru/"],
            ["anon", "https://ok.ru/videoembed/" + id, "https://ok.ru/"],
            ["auth", "https://ok.ru/video/" + id, "https://ok.ru/"],
            ["anon", "https://m.ok.ru/video/" + id, "https://m.ok.ru/"]
        ], tk, th, tm2, tn;
        for (tk = 0; tk < tries.length && budgetLeft(); tk++) {
            clearOkruFails();
            th = tries[tk][0] == "auth" ? httpGetAuth(tries[tk][1], tries[tk][2]) : httpGet(tries[tk][1], tries[tk][2]);
            if (!th) { log("  OK.ru embed " + id + " " + tries[tk][0] + " vacio"); continue; }
            tm2 = okParseMeta(th);
            tn = tm2 ? okruSourcesFromMeta(tm2, "OK.ru").length : 0;
            log("  OK.ru embed " + id + " " + tries[tk][0] + " bytes=" + th.length + " streams=" + tn);
            if (!emb) emb = th;
            if (tn > 0) { emb = th; meta = tm2; break; }
        }
        if (!emb) continue;
        if (!meta) meta = okParseMeta(emb);
        if (meta && meta.movie) {
            movieTitle = clean(meta.movie.title || meta.movie.name || "") || movieTitle;
        }
        if (!movieTitle || okruIsGenericTitle(movieTitle)) {
            var tm = /<title[^>]*>([^<]+)<\/title>/i.exec(emb);
            if (tm) {
                movieTitle = clean(strip(tm[1])
                    .replace(/^(?:see|watch|ver)\s+video\s+["'\u00ab\u201c]?(.+?)["'\u00bb\u201d]?\s+on\s+ok.*$/i, "$1")
                    .replace(/\s*[|\-\u2013]\s*OK\.?RU.*$/i, "")
                    .replace(/\s+on\s+OK\.?\s*Video Player\s*$/i, ""));
            }
        }
        if (okruIsGenericTitle(movieTitle)) movieTitle = ranked[i].name || "";

        score = okruBestScore(movieTitle, ctx);
        var yr = (/\b((?:19|20)\d{2})\b/.exec(movieTitle) || [])[1] || "";
        var yearDiff = yr && ctx.year ? Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) : null;
        /* Series: el año en el título suele ser el de emisión del capítulo o no estar; más laxo. */
        var yearOk = yearDiff === null || yearDiff <= 1 || (ctx.kind == "tv" && yearDiff <= 5);
        var exactTitle = false;
        var wantedTitles = [ctx.titleEs || "", ctx.titleEn || "", ctx.titleOrig || ""];
        for (var ti = 0; ti < wantedTitles.length; ti++) {
            if (wantedTitles[ti] && normalizeTitle(movieTitle) === normalizeTitle(wantedTitles[ti])) exactTitle = true;
        }
        if (ctx.altTitles) for (var ai = 0; ai < ctx.altTitles.length; ai++) {
            if (ctx.altTitles[ai] && normalizeTitle(movieTitle) === normalizeTitle(ctx.altTitles[ai])) exactTitle = true;
        }

        var epInfo = okruEpisodeMatch(movieTitle, ctx);
        if (ctx.kind == "tv" && !epInfo.ok) {
            log("  OK.ru skip id=" + id + " sin episodio S" + epInfo.season + "E" + epInfo.episode + (epInfo.abs ? "/abs" + epInfo.abs : "") + " score=" + score + " '" + String(movieTitle).substring(0, 50) + "'");
            continue;
        }

        /* Margen: título exacto puede pasar aunque OK.ru no publique el año;
           con año distinto se descarta; coincidencias parciales necesitan >=55.
           En series el score ya incorpora bonus de capítulo. */
        var minScore = ctx.kind == "tv" ? 45 : 55;
        if (!yearOk || (!exactTitle && score < minScore)) {
            log("  OK.ru skip id=" + id + " score=" + score + " exact=" + exactTitle + " yearOk=" + yearOk + " ep=" + epInfo.ok + " '" + String(movieTitle).substring(0, 50) + "'");
            continue;
        }
        if (yearDiff === 0) score = Math.min(100, score + 8);
        else if (yearDiff === 1) score = Math.min(100, score + 3);

        srcs = okruSourcesFromMeta(meta, "OK.ru");
        if (!srcs.length) {
            log("  OK.ru id=" + id + " match score=" + score + " pero sin stream '" + String(movieTitle).substring(0, 40) + "'");
            continue;
        }

        var groupKey = normalizeTitle(ctx.titleEs || ctx.titleEn || ctx.titleOrig || movieTitle || "");
        if (ctx.kind == "tv") groupKey += "|s" + (ctx.season || 1) + "e" + (ctx.episode || 1);
        var duplicate = out.length > 0;
        okruVideosProcessed++;
        if (!out.length) {
            cand = mkCand("https://ok.ru/video/" + id, "Latino", "https://ok.ru/", "OK.ru");
            cand.srcs = [];
            cand._okTitleKey = groupKey;
            cand.title = ctx.titleEs || ctx.titleEn || movieTitle;
            cand.okScore = score;
            out.push(cand);
        }
        /* Todos los IDs válidos de esta película quedan en una sola ficha.
           Se agregan las calidades de cada copia y luego se ordenan globalmente,
           de 4K/1080p hacia 720p/480p/360p; si no existe HD, quedan los streams disponibles. */
        var target = out[0];
        for (var si = 0; si < srcs.length; si++) {
            var already = false;
            for (var sj = 0; sj < target.srcs.length; sj++) {
                if (target.srcs[sj] && target.srcs[sj].url === srcs[si].url) { already = true; break; }
            }
            if (!already && target.srcs.length < 18) target.srcs.push(srcs[si]);
        }
        okruSortSourcesByQuality(target.srcs);
        log("  OK.ru HIT id=" + id + " score=" + score + " streams=" + srcs.length + " merged=" + duplicate + " '" + String(movieTitle).substring(0, 50) + "'");
    }

    if (!out.length) {
        log("  OK.ru RESULTADO: 0 fuentes");
    } else {
        log("  OK.ru RESULTADO: " + out.length + " fuente(s) OK");
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Servidores Plus: Odysee / Dailymotion / Archive.org (extractores propios) */
/* ------------------------------------------------------------------ */

var ODYSEE_API = "https://api.na-backend.odysee.com/api/v1/proxy";

function odyseeRpc(method, params) {
    if (!budgetLeft()) return null;
    try {
        var body = JSON.stringify({ jsonrpc: "2.0", method: method, params: params || {}, id: Date.now() });
        var r = http.POST(ODYSEE_API, body, hdr("https://odysee.com/", { "Content-Type": "application/json" }), false);
        var j = parseJson(readBody(r));
        if (j && j.error) { log("  Odysee RPC " + method + " error: " + (j.error.message || JSON.stringify(j.error))); return null; }
        return j ? j.result : null;
    } catch (e) { log("  Odysee RPC " + method + " -> " + e); return null; }
}

function odyseeSearch(q, pageSize) {
    var res = odyseeRpc("claim_search", {
        text: q,
        claim_type: ["stream"],
        stream_types: ["video"],
        page_size: pageSize || 8,
        page: 1,
        order_by: ["release_time"],
        has_source: true,
        no_totals: true
    });
    return (res && res.items) ? res.items : [];
}

function odyseeStreamingUrl(uri) {
    var res = odyseeRpc("get", { uri: uri, save_file: false });
    return (res && res.streaming_url) ? cleanUrl(res.streaming_url) : "";
}

function provOdysee(ctx) {
    var out = [], queries = [], seenQ = {}, i, j, items, it, title, score, uri, stream, src;
    if (!ctx || !budgetLeft() || !servidoresPlus()) return out;

    function addQ(s) {
        s = clean(String(s || ""));
        if (!s || s.length < 2) return;
        var k = normalizeTitle(s);
        if (!k || seenQ[k]) return;
        seenQ[k] = 1;
        queries.push(s);
    }

    var isTv = ctx.kind == "tv";
    var sn = parseInt(ctx.season, 10) || 1, en = parseInt(ctx.episode, 10) || 1;
    var primary = [ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []);
    for (i = 0; i < primary.length; i++) {
        if (!primary[i]) continue;
        if (isTv) {
            addQ(primary[i] + " S" + sn + "E" + en);
            addQ(primary[i] + " Capítulo " + en);
            addQ(primary[i] + " Cap " + en);
            addQ(primary[i] + " E" + en);
        } else {
            addQ(primary[i] + (ctx.year ? " " + ctx.year : ""));
            addQ(primary[i]);
        }
    }
    if (!queries.length) return out;

    log("  Odysee queries: " + queries.slice(0, 4).join(" | "));
    var seenId = {};
    for (i = 0; i < queries.length && out.length < 4 && budgetLeft(); i++) {
        items = odyseeSearch(queries[i], 6);
        log("  Odysee '" + queries[i] + "' -> " + items.length + " item(s)");
        for (j = 0; j < items.length && out.length < 4; j++) {
            it = items[j];
            if (!it || !it.claim_id || seenId[it.claim_id]) continue;
            title = clean((it.value && it.value.title) || it.name || "");
            score = Math.max(
                tokenSimilarity(title, ctx.titleEs || ""),
                tokenSimilarity(title, ctx.titleEn || ""),
                tokenSimilarity(title, ctx.titleOrig || "")
            );
            if (isTv) {
                var epOk = okruEpisodeMatch(title, ctx);
                if (!epOk || !epOk.ok) continue;
            } else if (ctx.year) {
                var yr = (/\b((?:19|20)\d{2})\b/.exec(title) || [])[1] || "";
                if (yr && Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) > 1) score -= 25;
            }
            if (score < 55) continue;
            seenId[it.claim_id] = 1;
            uri = it.permanent_url || it.canonical_url || ("lbry://" + it.name + "#" + it.claim_id);
            stream = odyseeStreamingUrl(uri);
            if (!stream) continue;
            src = mkSrcBare(stream, "Odysee · " + (score >= 80 ? "HD" : "SD") + " · " + title.substring(0, 40), /\.m3u8/i.test(stream) ? "hls" : "mp4");
            if (src) {
                out.push({ url: "", lang: "", srcs: [src], prov: "Odysee" });
                log("  Odysee HIT score=" + score + " '" + title.substring(0, 50) + "'");
            }
        }
    }
    log("  Odysee RESULTADO: " + out.length + " fuente(s)");
    return out;
}

/* --- Dailymotion --- */
function dmSearch(q, limit) {
    if (!budgetLeft()) return [];
    var url = "https://api.dailymotion.com/videos?search=" + enc(q) + "&limit=" + (limit || 10) + "&fields=id,title,url,duration,language&sort=relevance";
    var body = httpGet(url, "https://www.dailymotion.com/");
    var j = parseJson(body);
    if (!j) { log("  Dailymotion search sin JSON valido (" + String(body || "").length + " bytes)"); return []; }
    if (j.error) { log("  Dailymotion search error: " + JSON.stringify(j.error).substring(0, 160)); return []; }
    return j.list ? j.list : [];
}

function dmStreams(videoId) {
    if (!budgetLeft() || !videoId) return [];
    var metaUrl = "https://www.dailymotion.com/player/metadata/video/" + videoId;
    var body = httpGet(metaUrl, "https://www.dailymotion.com/");
    var j = parseJson(body);
    if (!j || !j.qualities) {
        /* 2do intento: con embedder (algunos videos lo exigen) */
        var embUrl = metaUrl + "?embedder=" + enc("https://www.dailymotion.com/video/" + videoId) + "&locale=es&is_native_app=0";
        body = httpGet(embUrl, "https://www.dailymotion.com/video/" + videoId);
        j = parseJson(body);
    }
    if (!j) { log("  Dailymotion metadata sin JSON id=" + videoId); return []; }
    if (j.error) { log("  Dailymotion metadata error id=" + videoId + ": " + JSON.stringify(j.error).substring(0, 160)); return []; }
    var out = [], q = j.qualities || {}, k, arr, i, u, src, type, label;
    var ref = "https://www.dailymotion.com/video/" + videoId;
    /* Preferir calidades numéricas (720, 480…) sobre "auto"; auto suele ser el manifiesto HLS. */
    var keys = [];
    for (k in q) if (q.hasOwnProperty(k)) keys.push(k);
    keys.sort(function (a, b) {
        var na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) return nb - na;
        if (!isNaN(na)) return -1;
        if (!isNaN(nb)) return 1;
        if (a === "auto") return 1;
        if (b === "auto") return -1;
        return 0;
    });
    for (var ki = 0; ki < keys.length; ki++) {
        k = keys[ki];
        arr = q[k];
        if (!arr || !arr.length) continue;
        for (i = 0; i < arr.length; i++) {
            u = cleanUrl(arr[i].url || "");
            if (!u) continue;
            type = /m3u8|\.m3u8/i.test(u) || (arr[i].type && /mpegURL/i.test(arr[i].type)) ? "hls" : "mp4";
            label = "Dailymotion · " + (k === "auto" ? "Auto" : k);
            /* Dailymotion exige Referer del propio sitio; mkSrcBare rompe la reproducción. */
            src = mkSrc(u, label, ref, type);
            if (src) out.push(src);
        }
        /* Con unas pocas calidades alcanza. */
        if (out.length >= 3) break;
    }
    return out;
}

function provDailymotion(ctx) {
    var out = [], queries = [], seenQ = {}, i, j, list, it, title, score, srcs;
    if (!ctx || !budgetLeft() || !servidoresPlus()) return out;

    function addQ(s) {
        s = clean(String(s || ""));
        if (!s || s.length < 2) return;
        var k = normalizeTitle(s);
        if (!k || seenQ[k]) return;
        seenQ[k] = 1;
        queries.push(s);
    }

    var isTv = ctx.kind == "tv";
    var sn = parseInt(ctx.season, 10) || 1, en = parseInt(ctx.episode, 10) || 1;
    var primary = [ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []);
    for (i = 0; i < primary.length; i++) {
        if (!primary[i]) continue;
        if (isTv) {
            addQ(primary[i] + " S" + sn + "E" + en);
            addQ(primary[i] + " Capítulo " + en);
            addQ(primary[i] + " Cap " + en);
        } else {
            addQ(primary[i] + (ctx.year ? " " + ctx.year : ""));
            addQ(primary[i]);
        }
    }
    if (!queries.length) return out;

    log("  Dailymotion queries: " + queries.slice(0, 4).join(" | "));
    var seenId = {};
    for (i = 0; i < queries.length && out.length < 3 && budgetLeft(); i++) {
        list = dmSearch(queries[i], 6);
        log("  Dailymotion '" + queries[i] + "' -> " + list.length + " item(s)");
        for (j = 0; j < list.length && out.length < 3; j++) {
            it = list[j];
            if (!it || !it.id || seenId[it.id]) continue;
            title = clean(it.title || "");
            score = Math.max(
                tokenSimilarity(title, ctx.titleEs || ""),
                tokenSimilarity(title, ctx.titleEn || ""),
                tokenSimilarity(title, ctx.titleOrig || "")
            );
            if (isTv) {
                var dmEp = okruEpisodeMatch(title, ctx);
                if (!dmEp || !dmEp.ok) continue;
            } else if (ctx.year) {
                var yr = (/\b((?:19|20)\d{2})\b/.exec(title) || [])[1] || "";
                if (yr && Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) > 1) score -= 25;
            }
            if (score < 55) continue;
            var dur = parseInt(it.duration, 10) || 0;
            if (dur && dur < (isTv ? 480 : 3000)) { log("  Dailymotion descarta clip corto (" + dur + "s) '" + title.substring(0, 40) + "'"); continue; }
            seenId[it.id] = 1;
            srcs = dmStreams(it.id);
            if (!srcs.length) continue;
            out.push({ url: "", lang: "", srcs: srcs, prov: "Dailymotion" });
            log("  Dailymotion HIT score=" + score + " streams=" + srcs.length + " '" + title.substring(0, 50) + "'");
        }
    }
    log("  Dailymotion RESULTADO: " + out.length + " fuente(s)");
    return out;
}

/* --- Archive.org --- */
function archiveSearch(q, rows) {
    if (!budgetLeft()) return [];
    var url = "https://archive.org/advancedsearch.php?q=" + enc("(" + q + ") AND mediatype:(movies)") + "&fl[]=identifier&fl[]=title&fl[]=year&sort[]=downloads+desc&rows=" + (rows || 8) + "&page=1&output=json";
    var body = httpGet(url, "https://archive.org/");
    var j = parseJson(body);
    if (!j) { log("  Archive.org search sin JSON (" + String(body || "").length + " bytes)"); return []; }
    return (j.response && j.response.docs) ? j.response.docs : [];
}

/* mp4/webm/mkv/m3u8 directo de archive.org (container correcto; antes todo se forzaba a video/mp4) */
function archiveSrc(u, label) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var o = { name: label, url: u, duration: 0, requestModifier: okRequestModifier() }, ext = (/\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(u) || [])[1] || "mp4";
    ext = ext.toLowerCase();
    if (ext == "m3u8") { try { return new HLSSource(o); } catch (e) { log("archiveSrc hls -> " + e); return null; } }
    o.width = 0; o.height = 0; o.codec = ""; o.bitrate = 0;
    o.container = ext == "webm" ? "video/webm" : (ext == "mkv" ? "video/x-matroska" : "video/mp4");
    try { return new VideoUrlSource(o); } catch (e2) { log("archiveSrc file -> " + e2); return null; }
}

function archiveStreams(identifier, ctx) {
    if (!budgetLeft() || !identifier) return [];
    var body = httpGet("https://archive.org/metadata/" + enc(identifier), "https://archive.org/");
    var j = parseJson(body);
    if (!j || !j.files) { log("  Archive.org metadata vacia id=" + identifier + " (" + String(body || "").length + " bytes)"); return []; }
    var isTv = ctx && ctx.kind == "tv";
    var out = [], i, f, name, base, fmt, u, src, rank, preferred = [], em;
    for (i = 0; i < j.files.length; i++) {
        f = j.files[i];
        name = String(f.name || "");
        fmt = String(f.format || "").toLowerCase();
        if (!/\.(mp4|mkv|webm|m3u8|avi|mov|m4v)$/i.test(name)) continue;
        if (/sample|preview|thumb|sprite|__ia|trailer/i.test(name)) continue;
        base = name.replace(/^.*\//, "").replace(/\.[a-z0-9]{2,4}$/i, "");
        if (isTv) {
            /* Serie en un solo item (ej. amigovios-canal13): elegir el archivo del episodio por su nombre, no el mas grande. */
            em = okruEpisodeMatch(base, ctx);
            if (!em || !em.ok) continue;
        }
        rank = 0;
        if (/1080|hd|hi/i.test(name + " " + fmt)) rank = 3;
        else if (/720/i.test(name + " " + fmt)) rank = 2;
        else if (/480|512/i.test(name + " " + fmt)) rank = 1;
        preferred.push({ name: name, rank: rank, size: parseInt(f.size, 10) || 0, bonus: isTv ? em.bonus : 0 });
    }
    if (isTv) log("  Archive.org " + identifier + ": " + j.files.length + " archivos, " + preferred.length + " coinciden con el episodio");
    preferred.sort(function (a, b) { return b.bonus - a.bonus || b.rank - a.rank || b.size - a.size; });
    for (i = 0; i < preferred.length && out.length < 3; i++) {
        u = "https://archive.org/download/" + identifier + "/" + encodeURIComponent(preferred[i].name).replace(/%2F/g, "/");
        src = archiveSrc(u, "Archive.org \u00b7 " + (preferred[i].rank >= 3 ? "1080p" : preferred[i].rank >= 2 ? "720p" : "SD") + (/\.webm$/i.test(preferred[i].name) ? " webm" : ""));
        if (src) out.push(src);
    }
    return out;
}

function provArchive(ctx) {
    var out = [], queries = [], seenQ = {}, i, j, docs, it, title, score, srcs;
    if (!ctx || !budgetLeft() || !servidoresPlus()) return out;

    function addQ(s) {
        s = clean(String(s || ""));
        if (!s || s.length < 2) return;
        var k = normalizeTitle(s);
        if (!k || seenQ[k]) return;
        seenQ[k] = 1;
        queries.push(s);
    }

    var isTv = ctx.kind == "tv";
    var primary = [ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []);
    for (i = 0; i < primary.length; i++) {
        if (!primary[i]) continue;
        /* Series: el item de archive.org suele ser TODA la serie, asi que se busca solo el titulo (sin "Capitulo N"). */
        addQ("title:(" + primary[i] + ")" + (!isTv && ctx.year ? " AND year:" + ctx.year : ""));
        addQ("title:(" + primary[i] + ") OR subject:(" + primary[i] + ") OR description:(" + primary[i] + ")");
        if (!isTv) addQ("title:(" + primary[i] + ")");
    }
    if (!queries.length) return out;

    log("  Archive.org queries: " + queries.slice(0, 3).join(" | "));
    var seenId = {};
    for (i = 0; i < queries.length && out.length < 3 && budgetLeft(); i++) {
        docs = archiveSearch(queries[i], 8);
        log("  Archive.org '" + queries[i].substring(0, 50) + "' -> " + docs.length + " item(s)");
        for (j = 0; j < docs.length && out.length < 3; j++) {
            it = docs[j];
            if (!it || !it.identifier || seenId[it.identifier]) continue;
            title = clean(it.title || "");
            var hay = title + " " + String(it.identifier).replace(/[-_.]+/g, " ");
            score = Math.max(
                tokenSimilarity(title, ctx.titleEs || ""), tokenSimilarity(title, ctx.titleEn || ""), tokenSimilarity(title, ctx.titleOrig || "")
            );
            if (isTv) {
                /* titulo del item = "Serie Canal 13" etc.: basta con que contenga todas las palabras del titulo buscado */
                score = Math.max(score,
                    titleCoverage(hay, ctx.titleEs || ""), titleCoverage(hay, ctx.titleEn || ""), titleCoverage(hay, ctx.titleOrig || ""));
            } else if (ctx.year && it.year) {
                if (Math.abs(parseInt(it.year, 10) - parseInt(ctx.year, 10)) > 1) score -= 25;
            }
            if (score < (isTv ? 80 : 50)) continue;
            seenId[it.identifier] = 1;
            srcs = archiveStreams(it.identifier, ctx);
            if (!srcs.length) continue;
            out.push({ url: "", lang: "", srcs: srcs, prov: "Archive.org" });
            log("  Archive.org HIT score=" + score + " streams=" + srcs.length + " '" + title.substring(0, 50) + "' (" + it.identifier + ")");
        }
    }
    log("  Archive.org RESULTADO: " + out.length + " fuente(s)");
    return out;
}

/* --- YouTube (InnerTube, sin API key): busca video completo/episodio y devuelve HLS o mp4 muxed --- */
var YT_CLIENTS = [
    { name: "ANDROID_VR", id: "28", ver: "1.60.19", ua: "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
      ctx: { clientName: "ANDROID_VR", clientVersion: "1.60.19", deviceMake: "Oculus", deviceModel: "Quest 3", osName: "Android", osVersion: "12L", androidSdkVersion: 32, hl: "es", gl: "MX" } },
    { name: "IOS", id: "5", ver: "19.45.4", ua: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
      ctx: { clientName: "IOS", clientVersion: "19.45.4", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.1.0.22B83", hl: "es", gl: "MX" } }
];

function ytWalk(o, found, depth) {
    if (!o || depth > 14 || found.length >= 40) return;
    var k, i;
    if (o instanceof Array) { for (i = 0; i < o.length; i++) ytWalk(o[i], found, depth + 1); return; }
    if (typeof o != "object") return;
    if (o.videoRenderer && o.videoRenderer.videoId) { found.push(o.videoRenderer); return; }
    for (k in o) if (o.hasOwnProperty(k)) ytWalk(o[k], found, depth + 1);
}
function ytDurSecs(t) {
    var p = String(t || "").split(":"), n = 0, i;
    if (!t || !p.length) return 0;
    for (i = 0; i < p.length; i++) n = n * 60 + (parseInt(p[i], 10) || 0);
    return n;
}
function ytSearch(q, longOnly) {
    if (!budgetLeft()) return [];
    try {
        var body = JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "es", gl: "MX" } }, query: q, params: longOnly ? "EgQQARgC" : "EgIQAQ==" });
        var r = http.POST("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", body, { "User-Agent": UA, "Content-Type": "application/json", "Origin": "https://www.youtube.com", "Accept-Language": "es-MX,es;q=0.9" }, false);
        var j = parseJson(readBody(r)), found = [], out = [], i, v;
        if (!j) { log("  YouTube search sin JSON (code " + (r && r.code) + ")"); return []; }
        ytWalk(j, found, 0);
        for (i = 0; i < found.length; i++) {
            v = found[i];
            out.push({
                id: v.videoId,
                title: clean((v.title && v.title.runs && v.title.runs[0] && v.title.runs[0].text) || (v.title && v.title.simpleText) || ""),
                dur: ytDurSecs(v.lengthText && v.lengthText.simpleText)
            });
        }
        return out;
    } catch (e) { log("  YouTube search -> " + e); return []; }
}
function ytUaMod(ua) {
    var h = { "User-Agent": ua };
    return { headers: h, modifyRequest: function (url, headers) { var nh = {}, k; headers = headers || {}; for (k in headers) if (headers.hasOwnProperty(k)) nh[k] = headers[k]; for (k in h) nh[k] = h[k]; return { url: url, headers: nh }; } };
}
function ytCodec(mime) { var m = /codecs="([^"]+)"/.exec(String(mime || "")); return m ? m[1].split(",")[0].replace(/^\s+/, "") : ""; }
function ytStreams(videoId) {
    if (!budgetLeft() || !videoId) return [];
    var ci, c, r, j, sd, muxed = [], hls = [], vids = [], auds = [], i, f, src, got, ctype, bestV, bestA;
    for (ci = 0; ci < YT_CLIENTS.length && budgetLeft(); ci++) {
        c = YT_CLIENTS[ci];
        got = 0;
        try {
            var body = JSON.stringify({ videoId: videoId, contentCheckOk: true, racyCheckOk: true, context: { client: c.ctx } });
            r = http.POST("https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false", body,
                { "User-Agent": c.ua, "Content-Type": "application/json", "X-YouTube-Client-Name": c.id, "X-YouTube-Client-Version": c.ver, "Origin": "https://www.youtube.com" }, false);
            j = parseJson(readBody(r));
            if (!j) { log("  YouTube " + c.name + " sin JSON id=" + videoId + " (code " + (r && r.code) + ")"); continue; }
            var st = j.playabilityStatus ? j.playabilityStatus.status : "";
            if (st && st != "OK") { log("  YouTube " + c.name + " id=" + videoId + " status=" + st + " " + String((j.playabilityStatus.reason || "")).substring(0, 80)); continue; }
            if (j.videoDetails && !_ytMeta) _ytMeta = { id: videoId, title: clean(j.videoDetails.title || ""), len: parseInt(j.videoDetails.lengthSeconds, 10) || 0, desc: String(j.videoDetails.shortDescription || "").substring(0, 400) };
            else if (j.videoDetails && _ytMeta && _ytMeta.id != videoId) _ytMeta = { id: videoId, title: clean(j.videoDetails.title || ""), len: parseInt(j.videoDetails.lengthSeconds, 10) || 0, desc: String(j.videoDetails.shortDescription || "").substring(0, 400) };
            sd = j.streamingData;
            if (!sd) { log("  YouTube " + c.name + " sin streamingData id=" + videoId); continue; }
            /* audio+video juntos (itag 18 etc.) */
            for (i = 0; sd.formats && i < sd.formats.length; i++) {
                f = sd.formats[i];
                if (!f.url || /^audio\//i.test(String(f.mimeType || ""))) continue;
                src = mkSrcUA(f.url, "YouTube \u00b7 " + (f.height ? f.height + "p" : "MP4") + " \u00b7 " + c.name, "mp4", c.ua);
                if (src) { muxed.push({ s: src, h: f.height || 0 }); got++; }
            }
            if (sd.hlsManifestUrl) {
                src = mkSrcUA(sd.hlsManifestUrl, "YouTube \u00b7 HLS \u00b7 " + c.name, "hls", c.ua);
                if (src) { hls.push(src); got++; }
            }
            /* adaptativos (video y audio separados): mp4/avc1 + m4a, solo del primer cliente que los entregue */
            if (!vids.length) {
                for (i = 0; sd.adaptiveFormats && i < sd.adaptiveFormats.length; i++) {
                    f = sd.adaptiveFormats[i];
                    if (!f.url) continue;
                    ctype = String(f.mimeType || "");
                    if (/^video\/mp4/i.test(ctype) && /avc1/i.test(ctype) && f.height && f.height <= 1080) {
                        try {
                            src = new VideoUrlSource({ name: "YouTube \u00b7 " + f.height + "p \u00b7 " + c.name + " (video)", url: f.url, width: f.width || 0, height: f.height, container: "video/mp4", codec: ytCodec(ctype), bitrate: f.bitrate || 0, duration: parseInt(f.approxDurationMs, 10) ? Math.round(parseInt(f.approxDurationMs, 10) / 1000) : 0, requestModifier: ytUaMod(c.ua) });
                            vids.push({ s: src, h: f.height, b: f.bitrate || 0 });
                        } catch (ev) { log("  YouTube video-only -> " + ev); }
                    } else if (/^audio\/mp4/i.test(ctype) && typeof AudioUrlSource == "function") {
                        try {
                            src = new AudioUrlSource({ name: "YouTube \u00b7 audio " + Math.round((f.bitrate || 0) / 1000) + "k", url: f.url, bitrate: f.bitrate || 0, container: "audio/mp4", codec: ytCodec(ctype), duration: parseInt(f.approxDurationMs, 10) ? Math.round(parseInt(f.approxDurationMs, 10) / 1000) : 0, language: "Unknown", requestModifier: ytUaMod(c.ua) });
                            auds.push({ s: src, b: f.bitrate || 0 });
                        } catch (ea) { log("  YouTube audio-only -> " + ea); }
                    }
                }
                if (vids.length) got++;
            }
            log("  YouTube " + c.name + " id=" + videoId + ": muxed=" + muxed.length + " hls=" + hls.length + " video-only=" + vids.length + " audio-only=" + auds.length);
        } catch (e) { log("  YouTube " + c.name + " -> " + e); }
    }
    var out = [];
    muxed.sort(function (x, y) { return y.h - x.h; });
    for (i = 0; i < muxed.length && i < 2; i++) out.push(muxed[i].s);
    for (i = 0; i < hls.length; i++) out.push(hls[i]);
    /* video+audio separados: solo si hay audio; se distinguen luego en makeDescriptor */
    if (vids.length && auds.length) {
        vids.sort(function (x, y) { return y.h - x.h || y.b - x.b; });
        auds.sort(function (x, y) { return y.b - x.b; });
        var seenH = {};
        for (i = 0; i < vids.length && out.length < 8; i++) { if (!seenH[vids[i].h]) { seenH[vids[i].h] = 1; out.push(vids[i].s); } }
        out.push(auds[0].s);
        if (auds.length > 1) out.push(auds[auds.length - 1].s);
    }
    if (!out.length) log("  YouTube sin fuentes id=" + videoId + " (posible PO token/cipher)");
    return out;
}
/* Descriptor: si hay audio suelto (YouTube adaptativo) y TODO lo demas es video sin audio, usa UnMux; si no, solo fuentes con audio propio. */
function makeDescriptor(sources) {
    var vid = [], aud = [], i, isAud, noAudio = true;
    sources = sources || [];
    for (i = 0; i < sources.length; i++) {
        isAud = (typeof AudioUrlSource == "function") && (sources[i] instanceof AudioUrlSource);
        if (isAud) aud.push(sources[i]); else vid.push(sources[i]);
    }
    if (!aud.length) return new VideoSourceDescriptor(vid);
    var withAudio = [], videoOnly = [];
    for (i = 0; i < vid.length; i++) { if (/\(video\)$/.test(String(vid[i].name || ""))) videoOnly.push(vid[i]); else withAudio.push(vid[i]); }
    var allYt = true;
    for (i = 0; i < withAudio.length; i++) if (!/^YouTube/.test(String(withAudio[i].name || ""))) allYt = false;
    /* video-only primero (es lo que mas probablemente reproduce); HLS/muxed de YouTube quedan como alternativas */
    if (typeof UnMuxVideoSourceDescriptor == "function" && videoOnly.length && allYt) return new UnMuxVideoSourceDescriptor(videoOnly.concat(withAudio), aud);
    return new VideoSourceDescriptor(withAudio);
}
function mkSrcUA(u, label, force, ua) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var h = { "User-Agent": ua || UA };
    var o = { name: label, url: u, duration: 0, requestModifier: { headers: h, modifyRequest: function (url, headers) { var nh = {}, k; headers = headers || {}; for (k in headers) if (headers.hasOwnProperty(k)) nh[k] = headers[k]; for (k in h) nh[k] = h[k]; return { url: url, headers: nh }; } } };
    if (force == "hls") { try { return new HLSSource(o); } catch (e) { log("mkSrcUA hls -> " + e); return null; } }
    o.width = 0; o.height = 0; o.container = "video/mp4"; o.codec = ""; o.bitrate = 0;
    try { return new VideoUrlSource(o); } catch (e2) { log("mkSrcUA mp4 -> " + e2); return null; }
}


/* ------------------------------------------------------------------ */
/* YouTube como catalogo propio (buscador + playlists)                  */
/* ------------------------------------------------------------------ */
var YT_SCHEME = "ytplay://";
var YT_WEB = { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "es", gl: "MX" };
var _ytMeta = null;
/* Playlists conocidas (clave = titulo normalizado). Agregá las tuyas aca. */
var YT_KNOWN_PLAYLISTS = {
    "cebollitas": { id: "PL1N7BKTuLUGvu8t-4AcgbpXZO6_QA05wN", title: "Cebollitas (Telefe)" }
};

function ytAuthor() { return new PlatformAuthorLink(PPID, "YouTube", "https://www.youtube.com", "", 0); }
function ytMakeShow(l) { return YT_SCHEME + "list/" + l; }
function ytMakeVideo(id, l) { return YT_SCHEME + "v/" + id + (l ? "/" + l : ""); }
function ytParseInternal(url) {
    var t = String(url || ""), m = t.match(/^ytplay:\/\/list\/([A-Za-z0-9_-]+)$/);
    if (m) return { kind: "ytshow", list: m[1] };
    m = t.match(/^ytplay:\/\/v\/([A-Za-z0-9_-]{11})(?:\/([A-Za-z0-9_-]+))?$/);
    if (m) return { kind: "ytvideo", id: m[1], list: m[2] || "" };
    return null;
}
function ytText(t) {
    if (!t) return "";
    if (typeof t == "string") return t;
    if (t.simpleText) return t.simpleText;
    if (t.content) return t.content;
    if (t.runs) { var s = "", i; for (i = 0; i < t.runs.length; i++) s += t.runs[i].text || ""; return s; }
    return "";
}
function ytThumbFrom(o) { var a = o && o.thumbnails; return (a && a.length) ? a[a.length - 1].url : ""; }
function ytLockupThumb(l) {
    try {
        var ci = l.contentImage || {}, im = (ci.collectionThumbnailViewModel && ci.collectionThumbnailViewModel.primaryThumbnail && ci.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel) || ci.thumbnailViewModel || {};
        var src = im.image && im.image.sources;
        return (src && src.length) ? src[src.length - 1].url : "";
    } catch (e) { return ""; }
}
function ytLockupDur(l) {
    try {
        var ov = (l.contentImage && l.contentImage.thumbnailViewModel && l.contentImage.thumbnailViewModel.overlays) || [], i, j, b, t;
        for (i = 0; i < ov.length; i++) {
            b = ov[i].thumbnailBottomOverlayViewModel && ov[i].thumbnailBottomOverlayViewModel.badges;
            for (j = 0; b && j < b.length; j++) {
                t = ytText(b[j].thumbnailBadgeViewModel && b[j].thumbnailBadgeViewModel.text);
                if (/^\d+(?::\d+)+$/.test(t)) return ytDurSecs(t);
            }
        }
    } catch (e) { }
    return 0;
}
/* recorre cualquier respuesta InnerTube y junta videos, playlists y token de continuacion */
function ytCollect(o, acc, depth) {
    if (!o || depth > 20 || typeof o != "object") return;
    var k, i, v, l, ct, md;
    if (o instanceof Array) { for (i = 0; i < o.length; i++) ytCollect(o[i], acc, depth + 1); return; }
    if (o.playlistVideoRenderer && o.playlistVideoRenderer.videoId) {
        v = o.playlistVideoRenderer;
        acc.videos.push({ id: v.videoId, title: clean(ytText(v.title)), dur: parseInt(v.lengthSeconds, 10) || ytDurSecs(ytText(v.lengthText)), thumb: ytThumbFrom(v.thumbnail) });
        return;
    }
    if (o.videoRenderer && o.videoRenderer.videoId) {
        v = o.videoRenderer;
        acc.videos.push({ id: v.videoId, title: clean(ytText(v.title)), dur: ytDurSecs(ytText(v.lengthText)), thumb: ytThumbFrom(v.thumbnail) });
        return;
    }
    if (o.playlistRenderer && o.playlistRenderer.playlistId) {
        v = o.playlistRenderer;
        acc.lists.push({ id: v.playlistId, title: clean(ytText(v.title)), count: parseInt(ytText(v.videoCount), 10) || 0, thumb: ytThumbFrom((v.thumbnails && v.thumbnails[0]) || null) });
        return;
    }
    if (o.lockupViewModel && o.lockupViewModel.contentId) {
        l = o.lockupViewModel; ct = String(l.contentType || "");
        md = l.metadata && l.metadata.lockupMetadataViewModel;
        if (/PLAYLIST/i.test(ct) && !/^RD/.test(l.contentId)) acc.lists.push({ id: l.contentId, title: clean(ytText(md && md.title)), count: 0, thumb: ytLockupThumb(l) });
        else if (/VIDEO/i.test(ct)) acc.videos.push({ id: l.contentId, title: clean(ytText(md && md.title)), dur: ytLockupDur(l), thumb: ytLockupThumb(l) });
        return;
    }
    if (o.continuationItemRenderer) {
        v = o.continuationItemRenderer.continuationEndpoint && o.continuationItemRenderer.continuationEndpoint.continuationCommand;
        if (v && v.token) acc.token = v.token;
        return;
    }
    for (k in o) if (o.hasOwnProperty(k)) ytCollect(o[k], acc, depth + 1);
}
function ytPost(endpoint, bodyObj) {
    if (!budgetLeft()) return null;
    try {
        var r = http.POST("https://www.youtube.com/youtubei/v1/" + endpoint + "?prettyPrint=false", JSON.stringify(bodyObj),
            { "User-Agent": UA, "Content-Type": "application/json", "Origin": "https://www.youtube.com", "Accept-Language": "es-MX,es;q=0.9" }, false);
        var j = parseJson(readBody(r));
        if (!j) log("  YouTube " + endpoint + " sin JSON (code " + (r && r.code) + ")");
        return j;
    } catch (e) { log("  YouTube " + endpoint + " -> " + e); return null; }
}
/* videos de una playlist (hasta max, con paginacion) */
function ytPlaylistVideos(listId, max) {
    var acc = { videos: [], lists: [], token: "" }, j, pages = 0, title = "", seen = {}, out = [], i;
    max = max || 250;
    j = ytPost("browse", { context: { client: YT_WEB }, browseId: "VL" + listId });
    if (j) {
        try { title = clean((j.metadata && j.metadata.playlistMetadataRenderer && j.metadata.playlistMetadataRenderer.title) || ""); } catch (e0) { }
        ytCollect(j, acc, 0);
    }
    if (!acc.videos.length && budgetLeft()) {
        /* respaldo: pagina HTML con ytInitialData */
        var html = httpGet("https://www.youtube.com/playlist?list=" + listId + "&hl=es", "https://www.youtube.com/", { "Cookie": "CONSENT=YES+1; SOCS=CAI" });
        var a = html ? html.indexOf("ytInitialData = ") : -1, b, jd;
        if (a >= 0) {
            a += 16; b = html.indexOf(";</script>", a);
            jd = b > a ? parseJson(html.substring(a, b)) : null;
            if (jd) ytCollect(jd, acc, 0); else log("  YouTube playlist HTML: ytInitialData ilegible");
        } else log("  YouTube playlist HTML sin ytInitialData (" + String(html || "").length + " bytes)");
    }
    while (acc.token && acc.videos.length < max && pages < 8 && budgetLeft()) {
        var tok = acc.token; acc.token = "";
        j = ytPost("browse", { context: { client: YT_WEB }, continuation: tok });
        if (!j) break;
        ytCollect(j, acc, 0);
        pages++;
    }
    for (i = 0; i < acc.videos.length; i++) { if (!seen[acc.videos[i].id]) { seen[acc.videos[i].id] = 1; out.push(acc.videos[i]); } }
    log("  YouTube playlist " + listId + ": " + out.length + " video(s)" + (title ? " '" + title + "'" : ""));
    return { title: title, videos: out };
}
function ytSearchRaw(q, params) {
    var j = ytPost("search", { context: { client: YT_WEB }, query: q, params: params }), acc = { videos: [], lists: [], token: "" };
    if (j) ytCollect(j, acc, 0);
    return acc;
}
function ytVideoItem(v, listId, label) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, "yt_" + v.id, PID),
        name: (label || "") + v.title,
        thumbnails: thumb(v.thumb || ("https://i.ytimg.com/vi/" + v.id + "/hqdefault.jpg")),
        author: ytAuthor(), uploadDate: 0, viewCount: 0, duration: v.dur || 0, isLive: false,
        url: ytMakeVideo(v.id, listId)
    });
}
function ytListItem(l) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, "ytl_" + l.id, PID),
        name: "[YouTube \u00b7 Serie] " + l.title + (l.count ? " (" + l.count + " videos)" : ""),
        thumbnails: thumb(l.thumb || ""),
        author: ytAuthor(), uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
        url: ytMakeShow(l.id)
    });
}
/* resultados de YouTube para el buscador del plugin */
function ytSearchCatalog(q) {
    var out = [], ids = {}, key = normalizeTitle(q), k, i, acc, l, m;
    function addList(l) { if (!l || !l.id || ids[l.id]) return; ids[l.id] = 1; out.push(ytListItem(l)); }
    m = /[?&]list=([A-Za-z0-9_-]{12,})/.exec(q) || /^\s*(PL[A-Za-z0-9_-]{16,})\s*$/.exec(q);
    if (m) { addList({ id: m[1], title: "Playlist " + m[1], count: 0, thumb: "" }); return out; }
    for (k in YT_KNOWN_PLAYLISTS) if (YT_KNOWN_PLAYLISTS.hasOwnProperty(k) && key && (key == k || key.indexOf(k) >= 0 || k.indexOf(key) == 0 && key.length >= 4)) {
        addList({ id: YT_KNOWN_PLAYLISTS[k].id, title: YT_KNOWN_PLAYLISTS[k].title, count: 0, thumb: "" });
    }
    acc = ytSearchRaw(q + " serie completa", "EgIQAw==");
    log("  YouTube buscador: " + acc.lists.length + " playlist(s)");
    for (i = 0; i < acc.lists.length && out.length < 6; i++) {
        l = acc.lists[i];
        if (titleCoverage(l.title, q) >= 100 && (!l.count || l.count >= 4)) addList(l);
    }
    acc = ytSearchRaw(q, "EgIQAQ==");
    log("  YouTube buscador: " + acc.videos.length + " video(s)");
    var nv = 0;
    for (i = 0; i < acc.videos.length && nv < 4; i++) {
        if (acc.videos[i].dur >= 900 && titleCoverage(acc.videos[i].title, q) >= 100) { out.push(ytVideoItem(acc.videos[i], "", "[YouTube] ")); nv++; }
    }
    return out;
}
function ytShowChannel(url) {
    var p = ytParseInternal(url);
    if (!p || p.kind != "ytshow") return null;
    resetDebug(); startBudget();
    var pl = ytPlaylistVideos(p.list, 5), title = pl.title || "Playlist de YouTube";
    for (var k in YT_KNOWN_PLAYLISTS) if (YT_KNOWN_PLAYLISTS.hasOwnProperty(k) && YT_KNOWN_PLAYLISTS[k].id == p.list) title = YT_KNOWN_PLAYLISTS[k].title;
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "ytl_" + p.list, PID),
        name: "[YouTube] " + title,
        thumbnail: pl.videos.length ? ("https://i.ytimg.com/vi/" + pl.videos[0].id + "/hqdefault.jpg") : "",
        banner: "", subscribers: 0,
        description: "Playlist de YouTube.\nID: " + p.list,
        url: ytMakeShow(p.list), urlAlternatives: [ytMakeShow(p.list)], links: {}
    });
}
function ytShowContents(url) {
    var p = ytParseInternal(url), i, out = [];
    if (!p || p.kind != "ytshow") return new VideoPager([], false, {});
    resetDebug(); startBudget();
    var pl = ytPlaylistVideos(p.list, 250);
    for (i = 0; i < pl.videos.length; i++) out.push(ytVideoItem(pl.videos[i], p.list, ""));
    return new VideoPager(out, false, {});
}
function ytRecommendations(url) {
    var p = ytParseInternal(url), i, out = [], pl;
    if (!p || !p.list) return [];
    startBudget();
    pl = ytPlaylistVideos(p.list, 250);
    for (i = 0; i < pl.videos.length; i++) if (pl.videos[i].id != p.id) out.push(ytVideoItem(pl.videos[i], p.list, ""));
    return out;
}
function ytDetails(url) {
    var p = ytParseInternal(url), id, listId = "", firstTitle = "", firstDur = 0;
    if (!p) return null;
    resetDebug(); startBudget();
    if (p.kind == "ytshow") {
        var pl = ytPlaylistVideos(p.list, 250);
        if (!pl.videos.length) return errorDetails(url, "La playlist de YouTube no devolvi\u00f3 videos");
        id = pl.videos[0].id; listId = p.list; firstTitle = pl.videos[0].title; firstDur = pl.videos[0].dur;
    } else { id = p.id; listId = p.list; }
    _ytMeta = null;
    var srcs = ytStreams(id), meta = (_ytMeta && _ytMeta.id == id) ? _ytMeta : null;
    var name = (meta && meta.title) || firstTitle || "YouTube";
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "yt_" + id, PID),
        name: name,
        thumbnails: thumb("https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"),
        author: ytAuthor(), uploadDate: 0, duration: (meta && meta.len) || firstDur || 0, viewCount: 0, isLive: false,
        url: ytMakeVideo(id, listId),
        description: ((meta && meta.desc) || "") + "\n\nFuentes: " + srcs.length + (debugMode() ? ("\n\n=== DEBUG ===\n" + _debug) : ""),
        video: makeDescriptor(srcs)
    });
}
/* episodio de una serie dentro de una playlist: por titulo; en playlists conocidas tambien por posicion */
function ytEpisodeFromPlaylist(listId, ctx, trusted) {
    var pl = ytPlaylistVideos(listId, 250), i, em, abs = okruAbsEpisode(ctx), best = null;
    for (i = 0; i < pl.videos.length; i++) {
        em = okruEpisodeMatch(pl.videos[i].title, ctx);
        if (em && em.ok && pl.videos[i].dur >= 300) { if (!best || em.bonus > best.bonus) best = { v: pl.videos[i], bonus: em.bonus, how: em.how }; }
    }
    if (best) { log("  YouTube playlist: episodio por titulo (" + best.how + ") '" + best.v.title.substring(0, 50) + "'"); return best.v; }
    if (trusted && abs > 0 && abs <= pl.videos.length) { log("  YouTube playlist: episodio por posicion " + abs); return pl.videos[abs - 1]; }
    return null;
}

function provYouTube(ctx) {
    var out = [], queries = [], seenQ = {}, i, j, list, it, title, score, srcs, seenId = {};
    if (!ctx || !budgetLeft() || !servidoresPlus()) return out;

    function addQ(s) {
        s = clean(String(s || ""));
        if (!s || s.length < 2) return;
        var k = normalizeTitle(s);
        if (!k || seenQ[k]) return;
        seenQ[k] = 1;
        queries.push(s);
    }

    var isTv = ctx.kind == "tv";
    var sn = parseInt(ctx.season, 10) || 1, en = parseInt(ctx.episode, 10) || 1;
    var primary = [ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []);
    for (i = 0; i < primary.length && i < 3; i++) {
        if (!primary[i]) continue;
        if (isTv) {
            addQ(primary[i] + " capitulo " + en);
            addQ(primary[i] + " temporada " + sn + " capitulo " + en);
        } else {
            addQ(primary[i] + (ctx.year ? " " + ctx.year : "") + " pelicula completa espa\u00f1ol latino");
            addQ(primary[i] + " pelicula completa");
        }
    }
    if (isTv) {
        /* 1) playlists conocidas  2) playlist encontrada por busqueda */
        var plIds = [], plTrusted = {}, kk, tt, nt, pa, ev, ss;
        var titlesN = [normalizeTitle(ctx.titleEs), normalizeTitle(ctx.titleEn), normalizeTitle(ctx.titleOrig)];
        for (kk in YT_KNOWN_PLAYLISTS) if (YT_KNOWN_PLAYLISTS.hasOwnProperty(kk)) for (tt = 0; tt < titlesN.length; tt++) {
            if (titlesN[tt] && titlesN[tt] == kk && !plTrusted[YT_KNOWN_PLAYLISTS[kk].id]) { plTrusted[YT_KNOWN_PLAYLISTS[kk].id] = 1; plIds.push(YT_KNOWN_PLAYLISTS[kk].id); }
        }
        if (!plIds.length && primary[0]) {
            pa = ytSearchRaw(primary[0] + " serie completa", "EgIQAw==");
            log("  YouTube playlists para '" + primary[0] + "': " + pa.lists.length);
            for (tt = 0; tt < pa.lists.length && plIds.length < 2; tt++) {
                if (titleCoverage(pa.lists[tt].title, primary[0]) >= 100 && (!pa.lists[tt].count || pa.lists[tt].count >= 6)) plIds.push(pa.lists[tt].id);
            }
        }
        for (tt = 0; tt < plIds.length && out.length < 2 && budgetLeft(); tt++) {
            ev = ytEpisodeFromPlaylist(plIds[tt], ctx, !!plTrusted[plIds[tt]]);
            if (!ev) continue;
            ss = ytStreams(ev.id);
            if (ss.length) { out.push({ url: "", lang: "", srcs: ss, prov: "YouTube" }); seenId[ev.id] = 1; log("  YouTube HIT playlist " + plIds[tt] + " '" + ev.title.substring(0, 50) + "'"); }
        }
        if (out.length) return out;
    }
    if (!queries.length) return out;
    log("  YouTube queries: " + queries.slice(0, 4).join(" | "));
    for (i = 0; i < queries.length && out.length < 2 && budgetLeft(); i++) {
        list = ytSearch(queries[i], !isTv);
        log("  YouTube '" + queries[i] + "' -> " + list.length + " item(s)");
        for (j = 0; j < list.length && out.length < 2; j++) {
            it = list[j];
            if (!it || !it.id || seenId[it.id]) continue;
            title = it.title;
            /* en YouTube el titulo trae ruido ("pelicula completa en espanol"): se mide cuantas palabras del titulo buscado aparecen */
            score = Math.max(titleCoverage(title, ctx.titleEs || ""), titleCoverage(title, ctx.titleEn || ""), titleCoverage(title, ctx.titleOrig || ""));
            if (isTv) {
                var ye = okruEpisodeMatch(title, ctx);
                if (!ye || !ye.ok) continue;
                if (it.dur && it.dur < 480) continue;
            } else {
                if (it.dur && it.dur < 3000) continue; /* trailers/clips */
                var yr = (/\b((?:19|20)\d{2})\b/.exec(title) || [])[1] || "";
                if (yr && ctx.year && Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) > 1) score -= 30;
            }
            if (score < 100) continue;
            seenId[it.id] = 1;
            srcs = ytStreams(it.id);
            if (!srcs.length) continue;
            out.push({ url: "", lang: "", srcs: srcs, prov: "YouTube" });
            log("  YouTube HIT score=" + score + " dur=" + it.dur + "s streams=" + srcs.length + " '" + title.substring(0, 50) + "'");
        }
    }
    log("  YouTube RESULTADO: " + out.length + " fuente(s)");
    return out;
}

/* ------------------------------------------------------------------ */
/* orquestador                                                         */
/* ------------------------------------------------------------------ */

var PROVIDERS = [
    /* Servidores Plus: solo se ejecutan si servidoresPlus() === true (ver collectSources) */
    { id: "okrudirect", name: "OK.ru", fast: 1, early: 1, plus: 1, cap: 18000, prefetch: function () { return []; }, candidates: provOkruDirect },
    { id: "odysee", name: "Odysee", fast: 1, early: 1, plus: 1, cap: 12000, prefetch: function () { return []; }, candidates: provOdysee },
    { id: "dailymotion", name: "Dailymotion", fast: 1, early: 1, plus: 1, cap: 10000, prefetch: function () { return []; }, candidates: provDailymotion },
    { id: "archive", name: "Archive.org", fast: 1, early: 1, plus: 1, cap: 12000, prefetch: function () { return []; }, candidates: provArchive },
    { id: "youtube", name: "YouTube", fast: 1, early: 1, plus: 1, cap: 12000, prefetch: function () { return []; }, candidates: provYouTube },
    /* Proveedores normales */
    { id: "poseidon", name: "PoseidonHD", fast: 1, early: 1, cap: 7000, prefetch: poseidonPrefetchUrls, candidates: provPoseidon },
    { id: "juanita", name: "PelisJuanita", fast: 1, early: 1, cap: 8000, prefetch: juanitaPrefetchUrls, candidates: provJuanita },
    { id: "cuevanaapi", name: "Cuevana", fast: 1, early: 1, cap: 6000, prefetch: cuevanaApiPrefetchUrls, candidates: provCuevanaApi },
    { id: "lacartoons", name: "LaCartoons", fast: 1, early: 1, cap: 5000, prefetch: lacartoonsPrefetchUrls, candidates: provLaCartoons },
    { id: "esplay", name: "Esplay", fast: 0, early: 0, cap: 4000, prefetch: esplayPrefetchUrls, candidates: provEsplay },
    { id: "pelisplusto", name: "PelisPlus", fast: 0, early: 0, cap: 5000, prefetch: pptoPrefetchUrls, candidates: provPelisplusTo },
    { id: "sololatino", name: "SoloLatino", fast: 0, early: 0, cap: 5000, prefetch: soloPrefetchUrls, candidates: provSoloLatino },
    { id: "pelisflix1", name: "Pelisflix1", fast: 1, early: 0, cap: 4000, prefetch: pelisflixPrefetchUrls, candidates: provPelisflix1 },
    { id: "cuevana", name: "Cuevana3", fast: 0, early: 0, cap: 5000, prefetch: cuevanaPrefetchUrls, candidates: provCuevana }
];

function prefetchProviders(ctx) {
    var urls = [], i, extra;
    for (i = 0; i < PROVIDERS.length; i++) {
        if (!PROVIDERS[i].early) continue;
        try { extra = PROVIDERS[i].prefetch(ctx) || []; } catch (e) { extra = []; }
        urls = urls.concat(extra);
    }
    prefetchUrls(urls);
}

function sortSourcesByLang(out) {
    var idx = [], j, sorted = [];
    for (j = 0; j < out.length; j++) {
        idx.push({ s: out[j], i: j, r: langRank(String(out[j].name || "").split(" \u00b7 ")[0]), u: /voe|vimeos|vimeus/i.test(String(out[j].name || "")) ? 1 : 0, ms: _lat.hasOwnProperty(out[j].url) ? _lat[out[j].url] : 0 });
    }
    idx.sort(function (a, b) {
        if (a.r != b.r) return a.r - b.r;
        if (a.u != b.u) return a.u - b.u;
        if (a.ms != b.ms) return a.ms - b.ms;
        return a.i - b.i;
    });
    for (j = 0; j < idx.length; j++) sorted.push(idx[j].s);
    return sorted;
}

function capResults(out, n) {
    /* el audio suelto (YouTube adaptativo) no cuenta para el tope: sin el, el video-only queda mudo */
    var auds = [], rest = [], q;
    for (q = 0; q < out.length; q++) {
        if (typeof AudioUrlSource == "function" && out[q] instanceof AudioUrlSource) auds.push(out[q]); else rest.push(out[q]);
    }
    if (auds.length) return capResultsBase(rest, n).concat(auds);
    return capResultsBase(out, n);
}
function capResultsBase(out, n) {
    var res = [], seen = {}, i, k;
    for (i = 0; i < out.length && res.length < n; i++) {
        k = String(out[i].name || "");
        if (!seen[k]) { seen[k] = 1; res.push(out[i]); }
    }
    for (i = 0; i < out.length && res.length < n; i++) if (res.indexOf(out[i]) < 0) res.push(out[i]);
    return res;
}

function collectSources(ctx) {
    var out = [], i, servers = 0, site, wp = 0, wpPlan = [], want = wantServers(), maxRes = maxResults();
    log("modo: buscar " + want + " servidores, mostrar hasta " + maxRes);

    var soloOk = onlyOkru();
    var plusOn = servidoresPlus();
    if (soloOk) log("modo SOLO OK.ru (sin Poseidon/Cuevana/Juanita/...)");
    if (plusOn) log("modo SERVIDORES PLUS activo (OK.ru + Odysee + Dailymotion + Archive.org + YouTube como prioridad)");

    for (i = 0; i < SITES.length && !soloOk; i++) {
        site = SITES[i];
        if (!site || site.id == "poseidonhd") continue;
        if (!CORE_SITE_IDS[site.id] && !extraSites()) continue;
        if (!extraSites() && wp >= MAX_WP_PROVIDERS) continue;
        wp++;
        wpPlan.push({
            name: site.name,
            candidates: (function (s) { return function (c) { return provSite(s, c); }; })(site)
        });
    }

    if (!soloOk) { try { prefetchProviders(ctx); } catch (e) { log("prefetchProviders -> " + e); } }

    function runPlan(list) {
        var k, cands;
        for (k = 0; k < list.length; k++) {
            if (!budgetLeft()) { log("Tiempo agotado antes de " + list[k].name); break; }
            if (servers >= want) {
                log("Early-stop: " + servers + " fuente(s), se omite " + list[k].name);
                break;
            }
            log("> " + list[k].name);
            var globalDeadline = _deadline;
            _deadline = Math.min(globalDeadline, Date.now() + (list[k].cap || 5000));
            try {
                cands = list[k].candidates(ctx) || [];
                servers += resolveCands(cands, out, list[k].name, want - servers);
            } catch (e) { log("  ERROR " + list[k].name + ": " + e); }
            if (Date.now() >= _deadline && Date.now() < globalDeadline) log("  (tope de tiempo de " + list[k].name + ")");
            _deadline = globalDeadline;
        }
    }

    var plusEarly = [], normalEarly = [], late = [], pi, p;
    for (pi = 0; pi < PROVIDERS.length; pi++) {
        p = PROVIDERS[pi];
        if (soloOk) {
            /* Legacy: solo OK.ru */
            if (p.id == "okrudirect") plusEarly.push({ id: "okrudirect", name: "OK.ru", cap: 30000, prefetch: p.prefetch, candidates: p.candidates });
            continue;
        }
        if (p.plus) {
            /* Servidores Plus: solo si el setting está activo */
            if (plusOn) plusEarly.push(p);
            continue;
        }
        if (p.early) normalEarly.push(p);
        else late.push(p);
    }

    /* 1) Primero los servidores plus (si están activos) */
    if (plusEarly.length) {
        log("Plan Plus: " + plusEarly.map(function (x) { return x.name; }).join(", "));
        runPlan(plusEarly);
    }
    /* 2) Luego los early normales */
    if (servers < want && budgetLeft() && normalEarly.length) {
        runPlan(normalEarly);
    }
    /* 3) Luego late */
    if (servers < want && budgetLeft() && late.length) {
        runPlan(late);
    }
    /* 4) Plan B: sitios WP */
    if (servers < want && budgetLeft() && wpPlan.length) {
        log("Plan B: sitios WP (" + wpPlan.length + ")");
        runPlan(wpPlan);
    }

    out = capResults(sortSourcesByLang(out), maxRes);
    log("TOTAL reproducibles: " + out.length + " (hits ~" + servers + ")");
    return out;
}

/* ------------------------------------------------------------------ */
/* JKAnime                                                             */
/* ------------------------------------------------------------------ */

var JK = "https://jkanime.net";
var JK_SCHEME = "jkanime://";

function jkAuthor() { return new PlatformAuthorLink(PPID, "JKAnime", JK, "", 0); }
function jkMakeSeries(slug) { return JK_SCHEME + "serie/" + slug; }
function jkMakeEpisode(slug, n) { return JK_SCHEME + "ep/" + slug + "/" + n; }
function jkParseInternal(url) {
    var s = String(url || ""), m = s.match(/^jkanime:\/\/serie\/([a-z0-9-]+)$/);
    if (m) return { kind: "jkshow", slug: m[1] };
    m = s.match(/^jkanime:\/\/ep\/([a-z0-9-]+)\/(\d+)$/);
    if (m) return { kind: "jkep", slug: m[1], num: parseInt(m[2], 10) };
    return null;
}
function isJkUrl(u) { return /^jkanime:\/\//.test(String(u || "")); }

function jkSearch(query) {
    var slug = normalizeTitle(query).replace(/\s+/g, "-");
    if (!slug) return [];
    if (!budgetLeft()) startBudget();
    var html = httpGet(JK + "/buscar/" + enc(slug) + "/", JK + "/");
    if (!html) return [];
    var out = [];
    var re = /<div\s+class=["']anime__item["'][^>]*>[\s\S]{0,20}?<a\s+href=["'](https?:\/\/jkanime\.net\/([a-z0-9-]+)\/)["'][^>]*>[\s\S]*?data-setbg=["']([^"']*)["'][\s\S]*?<h5>\s*<a[^>]*>([^<]+)<\/a>/gi, m;
    while ((m = re.exec(html)) != null && out.length < 30) {
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "jk_" + m[2], PID),
            name: "[Anime] " + clean(strip(m[4])),
            thumbnails: thumb(absUrl(m[3], JK)),
            author: jkAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: jkMakeSeries(m[2])
        }));
    }
    return out;
}

function jkEpisodeSources(slug, num) {
    var epUrl = JK + "/" + slug + "/" + num + "/", html = httpGet(epUrl, JK + "/"), out = [];
    if (!html) { log("  jkanime: episodio sin HTML"); return out; }
    var m = /video\[\d+\]\s*=\s*'[^']*(?:src|href)=["'](https?:\/\/jkanime\.net\/jkplayer\/um[^"']*)["']/i.exec(html);
    if (!m) {
        var tags = findTags(html, /^<iframe\b/i), i;
        for (i = 0; i < tags.length && !m; i++) { var a = attrsOf(tags[i].tag); if (/jkplayer/i.test(a["src"] || "")) m = [null, a["src"]]; }
    }
    if (!m) { log("  jkanime: sin reproductor jkplayer"); return out; }
    var playerUrl = htmlUnescape(m[1]), ph = httpGet(playerUrl, epUrl);
    if (!ph) { log("  jkanime: player sin HTML"); return out; }
    out = scanMedia(ph, "JKAnime", playerUrl, playerUrl);
    if (!out.length) { var links = discoverLinks(ph, playerUrl), i2; for (i2 = 0; i2 < links.length && !out.length; i2++) out = out.concat(resolveEmbed(links[i2], "JKAnime", playerUrl, 0)); }
    log("  jkanime: " + out.length + " fuente(s) en ep " + num);
    return out;
}

function jkSeriesInfo(slug) {
    var url = JK + "/" + slug + "/", html = httpGet(url, JK + "/");
    if (!html) return null;
    var tm = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html), title = tm ? strip(tm[1]).replace(/\s*-\s*anime.*$/i, "").trim() : slugToTitle(slug);
    var im = /<img[^>]*src=["']([^"']*animes\/(?:image|video)\/[^"']+)["']/i.exec(html), poster = im ? absUrl(im[1], JK) : "";
    var syn = "", sm = /<p[^>]+class=["'][^"']*(?:synopsis|sinopsis)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(html);
    if (sm) syn = strip(sm[1]);
    var re = new RegExp('href=["\']\\/?' + slug + '\\/(\\d+)\\/?["\']', "gi"), m, nums = [], seen = {};
    while ((m = re.exec(html)) != null) { var n = parseInt(m[1], 10); if (!seen[n]) { seen[n] = 1; nums.push(n); } }
    nums.sort(function (a, b) { return a - b; });
    return { title: title, poster: poster, synopsis: syn, episodes: nums };
}

function slugToTitle(s) { return String(s || "").replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
function jkEpisodeVideo(slug, title, poster, n) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, "jk_" + slug + "_" + n, PID),
        name: title + " \u00b7 Ep " + n,
        thumbnails: thumb(poster),
        author: jkAuthor(),
        uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
        url: jkMakeEpisode(slug, n)
    });
}

function jkDetails(url) {
    var p = jkParseInternal(url);
    if (!p) return null;
    resetDebug(); startBudget();
    var info = jkSeriesInfo(p.slug);
    if (!info) return errorDetails(url, "JKAnime no respondi\u00f3");
    var num = p.kind == "jkep" ? p.num : (info.episodes.length ? info.episodes[0] : 1);
    log("JKAnime: " + info.title + " (" + info.episodes.length + " episodios), reproduciendo Ep " + num);
    var sources = jkEpisodeSources(p.slug, num);
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "jk_" + p.slug + "_" + num, PID),
        name: info.title + " \u00b7 Ep " + num,
        thumbnails: thumb(info.poster),
        author: jkAuthor(),
        uploadDate: 0, duration: 0, viewCount: 0, isLive: false,
        url: jkMakeEpisode(p.slug, num),
        description: (info.synopsis || "") + "\n\nFuentes: " + sources.length + (debugMode() ? ("\n\n=== DEBUG ===\n" + _debug) : ""),
        video: new VideoSourceDescriptor(sources)
    });
}
function jkRecommendations(url) {
    var p = jkParseInternal(url);
    if (!p) return [];
    var info = jkSeriesInfo(p.slug), i, out = [];
    if (!info) return [];
    var current = p.kind == "jkep" ? p.num : (info.episodes.length ? info.episodes[0] : -1);
    for (i = 0; i < info.episodes.length; i++) {
        if (info.episodes[i] == current) continue;
        out.push(jkEpisodeVideo(p.slug, info.title, info.poster, info.episodes[i]));
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* objetos GrayJay                                                     */
/* ------------------------------------------------------------------ */

function thumb(u) { return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]); }
function tmdbAuthor() { return new PlatformAuthorLink(PPID, "PelisHub", "https://www.themoviedb.org", "", 0); }
function showAuthor(id, name, poster) {
    return new PlatformAuthorLink(new PlatformID(PLATFORM, "show_" + id, PID), name || "Serie", makeShowUrl(id), poster || "", 0);
}
function catalogVideo(x) {
    var isTv = x.kind == "tv", yr = yearOf(x.date);
    var name = (x.title || "Sin t\u00edtulo") + (yr ? " (" + yr + ")" : "") + (isTv ? " \u00b7 Serie" : "");
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, (isTv ? "tv_" : "movie_") + x.id, PID),
        name: name,
        thumbnails: thumb(x.poster),
        author: isTv ? showAuthor(x.id, x.title, x.poster) : tmdbAuthor(),
        uploadDate: unixOf(x.date),
        viewCount: 0,
        duration: 0,
        isLive: false,
        url: isTv ? makeTvUrl(x.id, 1, 1) : makeMovieUrl(x.id)
    });
}
function episodeVideo(showId, showName, poster, s, e) {
    var sn = s, num = e.episode_number;
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, "tv_" + showId + "_" + sn + "_" + num, PID),
        name: "S" + sn + "E" + num + " \u00b7 " + (e.name || ("Episodio " + num)),
        thumbnails: thumb(e.still_path ? img(e.still_path, TMDB_STILL) : poster),
        author: showAuthor(showId, showName, poster),
        uploadDate: unixOf(e.air_date),
        viewCount: 0,
        duration: (e.runtime || 0) * 60,
        isLive: false,
        url: makeTvUrl(showId, sn, num)
    });
}
function normKey(name) {
    return normalizeTitle(String(name || "").replace(/\s*\(\d{4}\)\s*/g, " ").replace(/\s*\u00b7\s*Serie\s*$/i, ""));
}
function cleanCatalog(list, seen) {
    var out = [], a = [], b = [], i, x, kind, key, tk;
    seen = seen || {};
    for (i = 0; i < (list || []).length; i++) {
        x = list[i];
        if (!x) continue;
        kind = x.media_type == "tv" ? "tv" : (x.media_type == "movie" ? "movie" : "");
        if (!kind) continue;
        key = kind + x.id;
        if (seen[key]) continue;
        tk = kind + "|" + normalizeTitle(x.title || x.name || "") + "|" + yearOf(x.release_date || x.first_air_date);
        if (seen[tk]) continue;
        seen[key] = 1; seen[tk] = 1;
        out.push(x);
    }
    for (i = 0; i < out.length; i++) (out[i].poster_path ? a : b).push(out[i]);
    return a.length >= 3 ? a : a.concat(b);
}
function mapTmdbList(list, seen) {
    var out = [], c = cleanCatalog(list, seen), i, x, kind;
    for (i = 0; i < c.length && out.length < MAX_ITEMS; i++) {
        x = c[i];
        kind = x.media_type == "tv" ? "tv" : "movie";
        out.push(catalogVideo({ id: x.id, kind: kind, title: x.title || x.name, poster: img(x.poster_path), date: x.release_date || x.first_air_date }));
    }
    return out;
}
function withKind(list, kind) {
    var i, out = [];
    for (i = 0; i < (list || []).length; i++) { if (list[i]) { list[i].media_type = kind; out.push(list[i]); } }
    return out;
}

function makePager(first, hasMore, loadNext) {
    var pager = new VideoPager(first, hasMore, {}), page = 1;
    pager.nextPage = function () {
        page++;
        var r;
        try { r = loadNext(page); } catch (e) { r = { results: [], hasMore: false }; }
        this.results = r.results || [];
        this.hasMore = !!r.hasMore;
        return this;
    };
    return pager;
}

/* ------------------------------------------------------------------ */
/* home / busqueda                                                     */
/* ------------------------------------------------------------------ */

function homePage(page) {
    var d = tmdbGet("/trending/all/week?page=" + page);
    var res = d && d.results ? d.results : [];
    return {
        results: mapTmdbList(res),
        hasMore: !!(d && d.total_pages && page < Math.min(d.total_pages, 10))
    };
}
function translateEs2En(q) {
    if (!q) return "";
    try {
        var b = httpGet("https://api.mymemory.translated.net/get?q=" + enc(q) + "&langpair=es|en", "");
        var r = parseJson(b);
        var t = r && r.responseData && r.responseData.translatedText ? clean(r.responseData.translatedText) : "";
        log("translateEs2En('" + q + "') -> '" + t + "'");
        return t;
    } catch (e) { log("translateEs2En error " + e); return ""; }
}
function searchPage(q, page, seen) {
    var d = tmdbGet("/search/multi?query=" + enc(q) + "&page=" + page + "&include_adult=false"), raw = d && d.results ? d.results : [];
    var nq = normalizeTitle(q), ex = [], rest = [], c = cleanCatalog(raw, seen || {}), i, t, o;
    for (i = 0; i < c.length; i++) {
        t = normalizeTitle(c[i].title || c[i].name || "");
        o = normalizeTitle(c[i].original_title || c[i].original_name || "");
        ((t && t == nq) || (o && o == nq) ? ex : rest).push(c[i]);
    }
    return { results: mapTmdbList(ex.concat(rest), {}), hasMore: !!(d && d.total_pages && page < Math.min(d.total_pages, 10)) };
}

/* ------------------------------------------------------------------ */
/* detalles                                                            */
/* ------------------------------------------------------------------ */

function errorDetails(url, msg) {
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "error", PID), name: "StreamflixHub: " + msg, thumbnails: new Thumbnails([]), author: tmdbAuthor(),
        uploadDate: 0, viewCount: 0, isLive: false, url: String(url || ""), video: new VideoSourceDescriptor([]),
        description: msg + "\n\n=== DEBUG ===\n" + _debug
    });
}

var ALT_TITLE_COUNTRIES = { "ES": 1, "MX": 1, "AR": 1, "CO": 1, "CL": 1, "PE": 1, "VE": 1, "US": 1, "UY": 1, "EC": 1, "BO": 1, "CR": 1, "PA": 1, "GT": 1, "HN": 1, "NI": 1, "SV": 1, "DO": 1, "PR": 1 };
function pickLocalizedTitle(obj) {
    if (!obj) return "";
    return clean(obj.title || obj.name || "");
}
function titlesFromTranslations(trData, baseTitles) {
    var arr = (trData && trData.translations) || [], out = [], i, seen = {}, t, n, iso, lang, data;
    for (i = 0; i < (baseTitles || []).length; i++) seen[normalizeTitle(baseTitles[i])] = 1;
    for (i = 0; i < arr.length && out.length < 6; i++) {
        iso = String((arr[i] && arr[i].iso_3166_1) || "").toUpperCase();
        lang = String((arr[i] && arr[i].iso_639_1) || "").toLowerCase();
        if (lang != "es" && !ALT_TITLE_COUNTRIES[iso]) continue;
        if (lang && lang != "es" && lang != "en") continue;
        data = (arr[i] && arr[i].data) || {};
        t = clean(data.title || data.name || "");
        n = normalizeTitle(t);
        if (!n || seen[n]) continue;
        /* Prefer Spanish locales for Latino catalog matching */
        if (lang == "es" || ALT_TITLE_COUNTRIES[iso]) {
            seen[n] = 1;
            out.push(t);
        }
    }
    return out;
}
function ctxFromTmdb(p, es, en, altData, extIds, base, mx, trData) {
    var titleEn = pickLocalizedTitle(en) || pickLocalizedTitle(base);
    var titleOrig = clean((base && (base.original_title || base.original_name)) || "") || titleEn;
    var titleAr = pickLocalizedTitle(es);
    var titleMx = pickLocalizedTitle(mx);
    /* es-AR a menudo deja el título original (ej. Big); es-MX suele traer el nombre latino. */
    var titleEs = titleMx || titleAr || titleEn;
    if (titleAr && titleMx && normalizeTitle(titleAr) != normalizeTitle(titleMx)) {
        /* Si AR ya es distinto del original, úsalo; si no, MX gana. */
        if (normalizeTitle(titleAr) != normalizeTitle(titleOrig) && normalizeTitle(titleAr) != normalizeTitle(titleEn))
            titleEs = titleAr;
        else
            titleEs = titleMx;
    } else if (titleAr && normalizeTitle(titleAr) != normalizeTitle(titleOrig) && normalizeTitle(titleAr) != normalizeTitle(titleEn)) {
        titleEs = titleAr;
    }
    var ctx = {
        kind: p.kind, id: p.id, season: p.season || 1, episode: p.episode || 1,
        titleEs: titleEs, titleEn: titleEn, titleOrig: titleOrig,
        year: yearOf(base.release_date || base.first_air_date),
        imdbId: (extIds && extIds.imdb_id) || ""
    };
    var baseList = [ctx.titleEs, ctx.titleEn, ctx.titleOrig, titleAr, titleMx];
    ctx.altTitles = extractAltTitles(altData, baseList);
    var fromTr = titlesFromTranslations(trData, baseList.concat(ctx.altTitles));
    var k, seenN = {}, merged = [], all = ctx.altTitles.concat(fromTr);
    if (titleMx && normalizeTitle(titleMx) != normalizeTitle(ctx.titleEs)) all.unshift(titleMx);
    if (titleAr && normalizeTitle(titleAr) != normalizeTitle(ctx.titleEs)) all.unshift(titleAr);
    for (k = 0; k < all.length && merged.length < 8; k++) {
        var nn = normalizeTitle(all[k]);
        if (!nn || seenN[nn]) continue;
        if (nn == normalizeTitle(ctx.titleEs) || nn == normalizeTitle(ctx.titleEn) || nn == normalizeTitle(ctx.titleOrig)) continue;
        seenN[nn] = 1;
        merged.push(clean(all[k]));
    }
    ctx.altTitles = merged;
    ctx.titles = uniq([normalizeTitle(ctx.titleEs), normalizeTitle(ctx.titleEn), normalizeTitle(ctx.titleOrig)].concat(
        (function () { var o = [], i; for (i = 0; i < ctx.altTitles.length; i++) o.push(normalizeTitle(ctx.altTitles[i])); return o; })()
    ));
    return ctx;
}
function extractAltTitles(altData, baseTitles) {
    var arr = (altData && (altData.titles || altData.results)) || [], out = [], i, seen = {};
    for (i = 0; i < (baseTitles || []).length; i++) seen[normalizeTitle(baseTitles[i])] = 1;
    for (i = 0; i < arr.length && out.length < 6; i++) {
        var it = arr[i], t = it && (it.title || it.name);
        if (!t || !ALT_TITLE_COUNTRIES[it.iso_3166_1]) continue;
        var n = normalizeTitle(t);
        if (!n || seen[n]) continue;
        seen[n] = 1; out.push(clean(t));
    }
    return out;
}

function details(url) {
    var p = parseInternal(url);
    if (!p || p.kind == "show") return null;
    resetDebug();
    startBudget();
    var isTv = p.kind == "tv", path = (isTv ? "/tv/" : "/movie/") + p.id;
    var tmdbReqs = [
        { path: path, lang: "es-AR" },
        { path: path, lang: "en-US" },
        { path: path + "/alternative_titles", lang: "en-US" },
        { path: path + "/external_ids", lang: "en-US" },
        { path: path, lang: "es-MX" },
        { path: path + "/translations", lang: "en-US" }
    ];
    if (isTv) tmdbReqs.push({ path: path + "/season/" + (p.season || 1), lang: "es-AR" });
    var batch = tmdbGetBatch(tmdbReqs);
    var es = batch[0], en = batch[1], altData = batch[2], extIds = batch[3], mx = batch[4], trData = batch[5];
    var base = es || mx || en;
    if (!base) return errorDetails(url, "TMDB no respondi\u00f3");

    var ctx = ctxFromTmdb(p, es, en, altData, extIds, base, mx, trData);
    /* Conteos por temporada → capítulo absoluto (OK.ru a veces numera en continuo). */
    if (isTv) {
        var sc = {}, si, seas = (es && es.seasons) || (mx && mx.seasons) || (en && en.seasons) || (base && base.seasons) || [];
        for (si = 0; si < seas.length; si++) {
            if (seas[si] && seas[si].season_number > 0)
                sc[seas[si].season_number] = seas[si].episode_count || 0;
        }
        ctx.seasonCounts = sc;
        ctx.absEpisode = okruAbsEpisode(ctx);
    }
    var poster = img(base.poster_path), title = ctx.titleEs || ctx.titleEn || "Sin t\u00edtulo";
    log("TMDB: es='" + ctx.titleEs + "' en='" + ctx.titleEn + "' orig='" + ctx.titleOrig + "' year=" + ctx.year + (ctx.imdbId ? " imdb=" + ctx.imdbId : "") + (isTv ? " S" + ctx.season + "E" + ctx.episode + " abs=" + (ctx.absEpisode || "?") : ""));
    if (ctx.altTitles.length) log("TMDB AKAs usados para busqueda: " + ctx.altTitles.join(" | "));

    var epName = "", epOverview = "", epDate = 0, runtime = 0, i;
    if (isTv) {
        var sd = tmdbGet("/tv/" + p.id + "/season/" + ctx.season, "es-AR");
        if (sd && sd.episodes) for (i = 0; i < sd.episodes.length; i++) {
            if (sd.episodes[i].episode_number == ctx.episode) { epName = sd.episodes[i].name || ""; epOverview = sd.episodes[i].overview || ""; epDate = unixOf(sd.episodes[i].air_date); runtime = (sd.episodes[i].runtime || 0) * 60; }
        }
        if (!epName) {
            var sdEn = tmdbGet("/tv/" + p.id + "/season/" + ctx.season, "en-US");
            if (sdEn && sdEn.episodes) for (i = 0; i < sdEn.episodes.length; i++) if (sdEn.episodes[i].episode_number == ctx.episode) epName = sdEn.episodes[i].name || "";
        }
    } else runtime = (base.runtime || 0) * 60;

    var sources, ce = _srcCache[url];
    if (ce && (Date.now() - ce.at) < SRC_CACHE_MS && ce.hits < 2 && ce.s.length) {
        ce.hits++;
        sources = ce.s;
        log("cache de fuentes (" + ce.s.length + ")");
    } else {
        sources = collectSources(ctx);
        if (sources.length) _srcCache[url] = { at: Date.now(), s: sources, hits: 0 };
    }
    log("TOTAL fuentes: " + sources.length);

    var name = isTv ? (title + " \u00b7 S" + ctx.season + "E" + ctx.episode + (epName ? " \u00b7 " + epName : "")) : (title + (ctx.year ? " (" + ctx.year + ")" : ""));
    var desc = (isTv && epOverview ? epOverview : (base.overview || "")) + "\n\nFuentes: " + sources.length + (sources.length ? "" : " (no se encontr\u00f3 ninguna reproducible)");
    if (_debug && (!sources.length || debugMode())) {
        var lines = String(_debug).split("\n"), n = (!sources.length || debugMode()) ? 60 : 40;
        var tail = lines.slice(Math.max(0, lines.length - n)).join("\n");
        desc += "\n\n=== DEBUG ===\n" + tail;
    }

    /* GrayJay: con 0 fuentes NO muestra la ficha; ScriptException muestra el texto. */
    if (!sources.length) {
        var dbg = "", ls, line, picked = [], seenL = {}, li;
        try {
            ls = String(_debug).split("\n");
            for (li = 0; li < ls.length; li++) {
                line = ls[li];
                if (/OK\.ru|DDG |via DDG|web-discover|diag|rss|Poseidon|Juanita|TOTAL |modo:|TMDB:|queries/i.test(line)) {
                    if (!seenL[line]) { seenL[line] = 1; picked.push(line); }
                }
            }
            for (li = 0; li < ls.length && li < 12; li++) {
                if (!seenL[ls[li]]) { seenL[ls[li]] = 1; picked.push(ls[li]); }
            }
            for (li = Math.max(0, ls.length - 18); li < ls.length; li++) {
                if (!seenL[ls[li]]) { seenL[ls[li]] = 1; picked.push(ls[li]); }
            }
            dbg = picked.join("\n");
            if (dbg.length > 3500) dbg = dbg.substring(0, 3500) + "\n\u2026";
        } catch (e0) { dbg = String(_debug || "").substring(0, 3000); }
        var msg = "Sin fuentes reproducibles: " + name + "\n\n" + dbg;
        try { throw new ScriptException(msg); } catch (eThrow) {
            if (eThrow && eThrow.message === msg) throw eThrow;
            throw new Error(msg);
        }
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, isTv ? ("tv_" + p.id + "_" + ctx.season + "_" + ctx.episode) : ("movie_" + p.id), PID),
        name: name,
        thumbnails: thumb(poster),
        author: isTv ? showAuthor(p.id, title, poster) : tmdbAuthor(),
        uploadDate: isTv ? epDate : unixOf(base.release_date),
        duration: runtime,
        viewCount: 0,
        isLive: false,
        url: url,
        description: desc,
        video: makeDescriptor(sources)
    });
}

/* ------------------------------------------------------------------ */
/* series: canal = temporadas / episodios                              */
/* ------------------------------------------------------------------ */

function getShow(id) { return tmdbGet("/tv/" + id, "es-AR"); }
function seasonList(d) {
    var out = [], i, s;
    if (d && d.seasons) for (i = 0; i < d.seasons.length; i++) { s = d.seasons[i]; if (s && s.season_number > 0 && (s.episode_count || 0) > 0) out.push(s.season_number); }
    if (!out.length) out.push(1);
    return out;
}
function seasonEpisodes(id, name, poster, sn) {
    var sd = tmdbGet("/tv/" + id + "/season/" + sn, "es-AR"), out = [], i;
    if (sd && sd.episodes) for (i = 0; i < sd.episodes.length; i++) out.push(episodeVideo(id, name, poster, sn, sd.episodes[i]));
    return out;
}
function channelOf(url) {
    var p = parseInternal(url);
    if (!p || p.kind != "show") return null;
    var d = getShow(p.id);
    if (!d) return null;
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "show_" + p.id, PID),
        name: d.name || "Serie",
        thumbnail: img(d.poster_path),
        banner: img(d.backdrop_path, TMDB_BACK),
        subscribers: 0,
        description: (d.overview || "") + "\n\nTemporadas: " + (d.number_of_seasons || "?") + " \u00b7 Episodios: " + (d.number_of_episodes || "?"),
        url: url,
        urlAlternatives: [url],
        links: {}
    });
}
function channelContents(url) {
    var p = parseInternal(url);
    if (!p || p.kind != "show") return new VideoPager([], false, {});
    var d = getShow(p.id), seasons = seasonList(d), name = d ? d.name : "Serie", poster = d ? img(d.poster_path) : "", idx = 0;
    var first = seasonEpisodes(p.id, name, poster, seasons[0]);
    return makePager(first, seasons.length > 1, function () {
        idx++;
        return { results: seasonEpisodes(p.id, name, poster, seasons[idx]), hasMore: idx + 1 < seasons.length };
    });
}
function recommendations(url) {
    var p = parseInternal(url), out = [], i, j;
    if (!p) return [];
    if (p.kind == "tv") {
        var d = getShow(p.id), name = d ? d.name : "Serie", poster = d ? img(d.poster_path) : "";
        var seasons = seasonList(d), sn;
        for (i = 0; i < seasons.length && out.length < 300; i++) {
            sn = seasons[i];
            var sd = tmdbGet("/tv/" + p.id + "/season/" + sn, "es-AR");
            if (!sd || !sd.episodes) continue;
            for (j = 0; j < sd.episodes.length; j++) {
                if (sn == p.season && sd.episodes[j].episode_number == p.episode) continue;
                out.push(episodeVideo(p.id, name, poster, sn, sd.episodes[j]));
            }
        }
        return out;
    }
    if (p.kind == "movie") {
        var r = tmdbGet("/movie/" + p.id + "/recommendations?page=1");
        return mapTmdbList(withKind(r && r.results, "movie")).slice(0, 20);
    }
    return [];
}

/* ------------------------------------------------------------------ */
/* API de GrayJay                                                      */
/* ------------------------------------------------------------------ */

var FEED_MIXED = (typeof Type !== "undefined" && Type && Type.Feed && Type.Feed.Mixed) ? Type.Feed.Mixed : "MIXED";
var ORDER_CHRONO = (typeof Type !== "undefined" && Type && Type.Order && Type.Order.Chronological) ? Type.Order.Chronological : "CHRONOLOGICAL";

if (typeof source != "undefined") {
    source.enable = function (conf, settings, savedState) {
        _settings = settings || {};
        _fail = {};
        _okh = {};
        _pre = {};
        _spCache = {};
        _tmdbCache = {};
        _srcCache = {};
        _juanitaSlugIndex = {};
        _lat = {};
        _poseidonBuildId = "";
        _poseidonBuildAt = 0;
        try {
            var st = savedState ? JSON.parse(savedState) : null;
            if (st && st.pb && st.pat && (Date.now() - st.pat) < POSEIDON_BUILD_TTL) { _poseidonBuildId = String(st.pb); _poseidonBuildAt = st.pat; }
        } catch (e) { /* estado ilegible: se ignora */ }
    };
    source.setSettings = function (s) { _settings = s || {}; };
    source.saveState = function () { return _poseidonBuildId ? JSON.stringify({ pb: _poseidonBuildId, pat: _poseidonBuildAt }) : ""; };
    source.getHome = function () {
        try { var r = homePage(1); return makePager(r.results, r.hasMore, function (pg) { return homePage(pg); }); }
        catch (e) { return new VideoPager([], false, {}); }
    };
    source.searchSuggestions = function (q) { return []; };
    source.getSearchCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.search = function (q, type, order, filters) {
        try {
            resetDebug();
            startBudget();
            q = q || "";
            var seen = {}, usedQ = q, r = searchPage(q, 1, seen), first = r.results, extra = [], keys = {}, i, k;
            if (!first.length && q) {
                var tq = translateEs2En(q);
                if (tq && normalizeTitle(tq) != normalizeTitle(q)) {
                    var r2 = searchPage(tq, 1, seen);
                    if (r2.results.length) { first = r2.results; r = r2; usedQ = tq; }
                }
            }
            if (servidoresPlus() && q) {
                try { first = first.concat(ytSearchCatalog(q)); } catch (ey) { log("ytSearchCatalog -> " + ey); }
            }
            if (extraSites() && q) {
                for (i = 0; i < first.length; i++) keys[normKey(first[i].name)] = 1;
                try { extra = extra.concat(jkSearch(q)); } catch (e2) { extra = extra; }
                try { extra = extra.concat(juanitaSearch(q)); } catch (e3) { log("juanitaSearch -> " + e3); }
                for (i = 0; i < extra.length; i++) { k = normKey(extra[i].name); if (k && !keys[k]) { keys[k] = 1; first.push(extra[i]); } }
            }
            return makePager(first, r.hasMore, function (pg) { return searchPage(usedQ, pg, seen); });
        } catch (e) { return new VideoPager([], false, {}); }
    };
    source.getSearchChannelContentsCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.searchChannels = function (q) {
        try {
            if (!extraSites()) return new ChannelPager([], false, {});
            startBudget();
            var ju = juanitaSearch(q || ""), ch = [], i;
            for (i = 0; i < ju.length; i++) {
                if (/juanita:\/\/show\//.test(ju[i].url)) {
                    ch.push(juanitaShowChannel(ju[i].url));
                }
            }
            return new ChannelPager(ch.filter(Boolean), false, {});
        } catch (e) { return new ChannelPager([], false, {}); }
    };

    source.isChannelUrl = function (u) {
        var x = parseAny(u);
        return !!(x && ((x.origin == "tmdb" && x.p.kind == "show") || (x.origin == "juanita" && x.p.kind == "show") || (x.origin == "yt" && x.p.kind == "ytshow")));
    };
    source.getChannel = function (u) {
        var x = parseAny(u);
        if (x && x.origin == "juanita") return juanitaShowChannel(u);
        if (x && x.origin == "yt") return ytShowChannel(u);
        return channelOf(u);
    };
    source.getChannelCapabilities = function () { return { types: [FEED_MIXED], sorts: [ORDER_CHRONO], filters: [] }; };
    source.getChannelContents = function (u, type, order, filters) {
        try {
            var x = parseAny(u);
            if (x && x.origin == "juanita") return juanitaShowContents(u);
            if (x && x.origin == "yt") return ytShowContents(u);
            return channelContents(u);
        } catch (e) { return new VideoPager([], false, {}); }
    };

    source.isContentDetailsUrl = function (u) {
        var x = parseAny(u);
        if (!x) return false;
        if (x.origin == "tmdb") return x.p.kind == "movie" || x.p.kind == "tv";
        return x.origin == "jk" || x.origin == "juanita" || x.origin == "yt";
    };
    source.getContentDetails = function (u) {
        try {
            var x = parseAny(u);
            if (!x) return errorDetails(u, "URL desconocida");
            if (x.origin == "jk") return jkDetails(u);
            if (x.origin == "juanita") return juanitaDetails(u);
            if (x.origin == "yt") return ytDetails(u);
            return details(u);
        } catch (e) {
            log("DETAIL " + e);
            var em = String((e && e.message) ? e.message : e);
            if (em.indexOf("Sin fuentes reproducibles") === 0) throw e;
            try { if (typeof ScriptException !== "undefined" && e instanceof ScriptException) throw e; } catch (e2) { if (e2 === e) throw e; }
            return errorDetails(u, em);
        }
    };
    source.getContentRecommendations = function (u) {
        try {
            var x = parseAny(u);
            if (x && x.origin == "jk") return new VideoPager(jkRecommendations(u), false, {});
            if (x && x.origin == "juanita") return new VideoPager(juanitaRecommendations(u), false, {});
            if (x && x.origin == "yt") return new VideoPager(ytRecommendations(u), false, {});
            return new VideoPager(recommendations(u), false, {});
        } catch (e) { return new VideoPager([], false, {}); }
    };
}
