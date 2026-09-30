/*
 * StreamflixHub v1.3.0 - GrayJay source (ES5)
 * Replica del modelo Streamflix Reborn para contenido ES/LAT:
 *
 *  - Busqueda estilo Streamflix GlobalSearching:
 *      Cuevana3 Next.js (__NEXT_DATA__ + TMDbId) en paralelo con TMDB.
 *      1 portada por TMDbId (sin duplicados entre proveedores).
 *  - Catalogo Home: TMDB trending (portadas limpias).
 *  - Fuentes multi-proveedor (estilo Streamflix getServers + extractors):
 *      PoseidonHD2  -> JSON Next.js por TMDB ID (mas rapido)
 *      PelisJuanita -> movieInfo/serieInfo + buscador propio
 *      Pelisflix1   -> busqueda multi-dominio
 *      Cuevana3     -> slug / busqueda (familia .eu/.ai/.me/.cc)
 *      Cinecalidad / PelisPlus (WP, plan B)
 *  - Mejor servidor primero (Latino > Sub > Castellano; VOE/Vidhide prioritarios).
 *    Si falla, el player de GrayJay pasa al siguiente de la lista.
 *  - Descripcion: lista de dominios que encontraron ese VOD.
 *  - Early-stop al tener WANT_SERVERS fuentes reproducibles.
 *
 * Dominios tomados de PelisHub optimizado + providers ES de Streamflix 1.7.231.
 * Debug: debugMode en settings -> bloque === DEBUG === en la descripcion.
 * Anime/Cartoon: JKAnime, TioAnime, Latanime, La Cartoons (Streamflix).
 * VOD ES: Poseidon, Juanita, FlixLatam, SoloLatino (embed69 PoW+AES),
 *          PelisflixHD, SeriesFlix, Pelisflix1, Cuevana, Cinecalidad, PelisPlus.
 * extraSites: catalogo Juanita + sitios WP extra.
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
var WANT_SERVERS = 2;      /* early-stop rapido: 2 fuentes bastan */      /* 3 fuentes reproducibles y se corta (early-stop) */
var MAX_RESULTS = 4;       /* maximo de fuentes que se muestran en el reproductor */
var SRC_CACHE_MS = 20 * 60 * 1000; /* los tokens hdnts duran ~24h, 20 min es seguro */
var BUDGET_MS = 28000;  /* app Streamflix ~pocos s; sin PoW en camino caliente */
var CORE_SITE_IDS = { "pelisplus": 1, "cinecalidad": 1 }; /* plan B WP siempre */
var MAX_WP_PROVIDERS = 3;

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
var _spCache = {};          /* seriesplayer → m3u8 */
var _tmdbCache = {};        /* path|lang → json */
var _srcCache = {};         /* url de detalle → fuentes ya resueltas */
var _juanitaSlugIndex = {}; /* tmdbId → slug Juanita que ya matcheó */
var _foundDomains = []; /* proveedores que devolvieron stream para el VOD actual */

function log(s) { _debug += String(s) + "\n"; }
function resetDebug() { _debug = ""; }
function budgetLeft() { return Date.now() < _deadline; }
function startBudget() { _deadline = Date.now() + BUDGET_MS; }
function extraSites() { var v = _settings && _settings.extraSites; return v === true || v === "true" || v === 1 || v === "1"; }
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
/* tokens de un titulo normalizado, filtrando "ruido" (calidad/idioma/formato) que
   aparece pegado a titulos sacados de <title>/alt de paginas de resultados y que
   antes podia bajar el score de coincidencias validas */
var TITLE_NOISE = { "1080p": 1, "720p": 1, "480p": 1, "2160p": 1, "4k": 1, "uhd": 1, "hd": 1, "hdtv": 1,
    "latino": 1, "latam": 1, "castellano": 1, "espanol": 1, "doblado": 1, "doblaje": 1, "subtitulado": 1,
    "sub": 1, "subs": 1, "vose": 1, "vos": 1, "dual": 1, "audio": 1, "webdl": 1, "webrip": 1, "bluray": 1, "brrip": 1,
    "online": 1, "gratis": 1, "completa": 1, "pelicula": 1, "peliculas": 1, "serie": 1, "series": 1, "capitulo": 1, "temporada": 1 };
function titleTokens(s) {
    var n = normalizeTitle(s), parts = n ? n.split(" ") : [], out = [], i;
    for (i = 0; i < parts.length; i++) if (parts[i].length > 1 && !TITLE_NOISE[parts[i]]) out.push(parts[i]);
    return out;
}
/* similitud 0-100 por solapamiento de tokens (independiente del orden de las
   palabras y tolerante a titulos "distintos mas alla del idioma", ej.
   "Un Nuevo Dia" vs "Brand New Day" no van a matchear por texto -eso lo resuelve
   alimentar varias variantes de titulo desde TMDB, ver tmdbTitleVariants- pero
   "Spider Man Un Nuevo Dia" vs "Spider-Man: Un Nuevo Día (2026)" si matchea 100). */
function tokenSimilarity(a, b) {
    var ta = titleTokens(a), tb = titleTokens(b), i, hit = 0, used = {};
    if (!ta.length || !tb.length) return 0;
    for (i = 0; i < ta.length; i++) { if (!used[ta[i]] && tb.indexOf(ta[i]) >= 0) { hit++; used[ta[i]] = 1; } }
    return Math.round((hit / Math.max(ta.length, tb.length)) * 100);
}
/* % de las palabras de "want" (el titulo que buscamos) que aparecen en "pageTitle"
   (el <title>/h1 de la pagina que la web realmente devolvio). A diferencia de
   tokenSimilarity, NO se divide por el largo de pageTitle -que suele traer ruido
   del sitio ("Ver X Online Gratis - Cuevana3")-, sino solo por el largo de want,
   asi un titulo corto no se ve penalizado por texto extra alrededor. */
function titleCoverage(pageTitle, want) {
    var pt = titleTokens(pageTitle), wt = titleTokens(want), i, hit = 0;
    if (!wt.length) return 0;
    for (i = 0; i < wt.length; i++) if (pt.indexOf(wt[i]) >= 0) hit++;
    return Math.round((hit / wt.length) * 100);
}
/* saca un titulo "humano" (title/og:title/h1) de una pagina ya descargada y lo
   compara contra ctx (titulo + año) para confirmar que la pagina que devolvio el
   sitio es realmente la pelicula/serie pedida, y no otra con el mismo slug base
   (remakes: Pinocho 1940/2019/2022, Moana/Moana 2, etc). Devuelve ok=true/false
   cuando se pudo verificar, u ok=null si la pagina no traia un titulo reconocible
   (en ese caso el llamador decide si igual confia en el resultado). */
function verifyPageTitle(html, ctx) {
    if (!html) return { ok: null, pageTitle: "" };
    var tm = /<title[^>]*>([^<]+)<\/title>/i.exec(html) || /property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = tm ? clean(strip(tm[1])) : "";
    if (!pageTitle) return { ok: null, pageTitle: "" };
    var cov = Math.max(titleCoverage(pageTitle, ctx.titleEs || ""), titleCoverage(pageTitle, ctx.titleEn || ""), titleCoverage(pageTitle, ctx.titleOrig || ""));
    var yr = (/\b((?:19|20)\d{2})\b/.exec(pageTitle) || [])[1] || "";
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

/* atributos de una etiqueta -> mapa */
function attrsOf(tag) {
    var out = {}, re = /([a-zA-Z0-9_:\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, m;
    while ((m = re.exec(String(tag || ""))) != null) out[m[1].toLowerCase()] = clean(m[2] != null ? m[2] : m[3]);
    return out;
}
function attr(tag, name) { return attrsOf(tag)[String(name).toLowerCase()] || ""; }
/* todas las etiquetas de apertura que cumplan test(tagString) */
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
function hostDead(h) {
    /* NO se limpia con un reset global (evita pisar el estado de otra busqueda que
       pueda estar corriendo al mismo tiempo); un fallo se "olvida" solo, pasado
       FAIL_EXPIRE_MS sin fallar de nuevo. Esto evita que un tropezon puntual (timeout,
       rate-limit) deje un dominio bloqueado para el resto de la sesion. */
    var e = _fail[h];
    if (!e || Date.now() - e.at > FAIL_EXPIRE_MS) return false;
    return e.count >= 2 && !_okh[h];
}

/* descarga varias URLs en paralelo (http.batch) y las deja en cache (_pre) para
   que la primera llamada a httpGet() sobre cada una de ellas sea instantanea.
   Es "fire and forget": si una URL nunca se pide via httpGet, simplemente se
   descarta sin costo funcional -> es seguro llamarla especulativamente para
   adelantar trabajo que de otro modo se haria en serie. */
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
    /* sin http.batch disponible: no hay ganancia posible, se deja que httpGet
       normal las pida una por una cuando hagan falta (comportamiento anterior). */
}

function httpGet(url, referer, extra) {
    var h = hostOf(url), r, b;
    if (!h) return "";
    if (_pre.hasOwnProperty(url)) { b = _pre[url]; delete _pre[url]; if (b) return b; /* si vino vacio, reintentar en vivo por si fue un fallo transitorio del batch */ }
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
/* varias GET en paralelo (http.batch) con caida a modo secuencial */
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
/* pide varios endpoints de TMDB EN PARALELO (mismo round-trip) en vez de uno
   por uno; esto es lo que mas tiempo ahorra al abrir una ficha, porque antes
   se esperaba es-AR, despues en-US, despues alternative_titles, etc. en serie. */
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
function makeUrl(kind, id, s, e) {
    if (kind == "tv") return makeTvUrl(id, s || 1, e || 1);
    return makeMovieUrl(id);
}
function elapsed() { return (typeof _budgetStart != "undefined" && _budgetStart) ? (Date.now() - _budgetStart) : 0; }
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
    if (typeof lcParseInternal == "function") {
        p = lcParseInternal(url);
        if (p) return { origin: "lc", p: p };
    }
    if (typeof tioParseInternal == "function") {
        p = tioParseInternal(url);
        if (p) return { origin: "tio", p: p };
    }
    if (typeof latParseInternal == "function") {
        p = latParseInternal(url);
        if (p) return { origin: "lat", p: p };
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
/* force = "hls" | "mp4" | "dash": para URLs sin extension (ok.ru, vk, vimeo...) */
function mkSrc(u, label, ref, force) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var rm = reqMod(ref), o, type = force || inferMediaType(u);
    if (type == "hls") {
        o = { name: label || "HLS", url: u, duration: 0 };
        if (rm) o.requestModifier = rm;
        return new HLSSource(o);
    }
    if (type == "dash" && typeof DashSource == "function") {
        o = { name: label || "DASH", url: u, duration: 0 };
        if (rm) o.requestModifier = rm;
        try { return new DashSource(o); } catch (e) { log("mkSrc dash -> " + e); }
    }
    if (type == "mp4") {
        o = { width: 0, height: 0, container: "video/mp4", codec: "", name: label || "MP4", bitrate: 0, duration: 0, url: u };
        if (rm) o.requestModifier = rm;
        return new VideoUrlSource(o);
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
    function e(n) { return (n < a ? "" : e(parseInt(n / a, 10))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36)); }
    var d = {};
    p = p.replace(/\\(['\\])/g, "$1");
    while (c--) d[e(c)] = k[c] || e(c);
    return p.replace(/\b\w+\b/g, function (w) { return d.hasOwnProperty(w) ? d[w] : w; });
}
function unpackAll(text) {
    var out = [], re = /eval\(function\(p,a,c,k,e,(?:d|r)\)[\s\S]*?\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g, m;
    while ((m = re.exec(String(text || ""))) != null) {
        try { out.push(unpackOne(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4].split("|"))); } catch (e) { log("unpack " + e); }
        if (out.length >= 4) break;
    }
    return out;
}

/* busca m3u8/mp4 en un texto (y en su version desempaquetada) */
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
        /* URL desnuda: soporta query strings firmadas largas (hdnts, hmac, acl, etc.). */
        re = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[0], label, ref, base);
        /* Protocol-relative y URLs con ruta HLS sin que el CDN figure en SERVER_HOSTS. */
        re = /(?:^|["'\s=(])((?:\/\/)[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?)/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        /* Claves habituales de JWPlayer/VideoJS/Clappr, tanto JS como JSON. */
        re = /["']?(?:file|src|source|hls\d*|url|link|stream|playlist|dash|hlsManifestUrl|hlsMasterPlaylistUrl)["']?\s*[:=]\s*["']([^"']+)["']/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        /* JSON escapado donde la URL contiene \" o secuencias unicode. */
        re = /(?:file|src|source|url|link|stream|playlist|hlsManifestUrl|hlsMasterPlaylistUrl)\s*[:=]\s*\\?["'](https?:[^\\"']+)/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        /* sources:[{file:"..."}] / playlist:[{src:"..."}] */
        re = /\{[^{}]{0,500}?(?:file|src|source|url|hls)\s*[:=]\s*["'](https?:[^"']+)["']/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* hosts de embeds                                                     */
/* ------------------------------------------------------------------ */

var SERVER_HOSTS = ["streamsb.net", "streamsss.net", "ssbstream.net", "watchsb.com", "sbanh.com", "sbfast.com", "sbplay.one", "sbplay.org", "sbplay2.com", "sbfull.com", "lvturbo.com",
    "dood.", "doodstream.", "dooood.", "uqload.", "voe.sx", "streamtape.", "upstream.to", "streamlare.", "plusvip.net", "sololatino.net", "zplayer.live", "fastream.to", "vidcloud9.org",
    "okru.link", "ok.ru", "moonplayer.", "esplay.", "mycdn.moe", "acek-cdn.com", "dramiyos-cdn.com", "solo-latino.com",
    "streamwish", "hlswish", "wishembed", "awish", "vidhide", "filelions", "filemoon", "mixdrop", "mxdrop", "supervideo", "xupalace", "nuuuppp", "playhubconnect", "saidochesto",
    "vimeos", "vidhide", "callistanise", "hgcloud.", "vimeo.com", "vk.com", "vkvideo.ru", "odnoklassniki", "streamhub", "embedwish", "callistanise", "dhcplay", "minochinos", "lulustream", "luluvdo", "vtube", "vidguard", "bigwarp", "player.cuevana3", "vimeus.", "goodstream.",
    "fortamomar.workers.dev", "seriesplayer.", "onfilom.com", "playspelis.com", "nupload.", "321moviesfree.com", "flixlat.com",
    "hglink.to", "morencius.com", "acek-cdn.com", "futuretravelroute.space"];
/* 1fichier.com es un portal de descarga directa (cyberlocker) con captcha/espera,
   no un embed de video con m3u8/mp4 -> no vale la pena gastar tiempo/requests en
   intentarlo, se descarta antes de llegar al extractor generico. */
var UNSUPPORTED = ["waaw.", "netu.", "hqq.", "younetu.", "hqtv.", "biribup.", "cuevana3.download", "1fichier."];

function hostMatches(h, list) {
    var i;
    for (i = 0; i < list.length; i++) if (h.indexOf(list[i]) >= 0) return true;
    return false;
}
function isServerUrl(u) { return hostMatches(hostOf(u), SERVER_HOSTS); }
function isPackerFamily(h) {
    h = String(h || "");
    return h.indexOf("morencius") >= 0 || h.indexOf("hglink") >= 0 || h.indexOf("hgcloud") >= 0 ||
        h.indexOf("vidhide") >= 0 || h.indexOf("callistanise") >= 0 ||
        h.indexOf("filelions") >= 0 || h.indexOf("lulustream") >= 0 || h.indexOf("luluvdo") >= 0 ||
        h.indexOf("streamwish") >= 0 || h.indexOf("hlswish") >= 0 || h.indexOf("wishembed") >= 0 ||
        h.indexOf("awish") >= 0 || h.indexOf("embedwish") >= 0 || h.indexOf("filemoon") >= 0;
}
/* Wrappers de player (query v= en base64, etc.) → URL real del host. Sin GET extra. */
function unwrapEmbedUrl(url) {
    var u = cleanUrl(url), m, real;
    m = /[?&]v=([^&]+)/.exec(u);
    if (m) {
        real = cleanUrl(b64decode(dec(m[1])));
        if (/^https?:\/\//i.test(real) && real != u) return real;
    }
    /* nupload.my/iframe/?url=https%3A%2F%2Fvoe.sx%2F... */
    m = /[?&]url=([^&]+)/i.exec(u);
    if (m && /nupload\./i.test(u)) {
        real = cleanUrl(dec(m[1]));
        if (/^https?:\/\//i.test(real) && real != u) return real;
    }
    return u;
}

/* --- extractores especificos (portados de PlayPelis) --- */
/* ---- utilidades para los extractores nuevos ---- */
function htmlUnescape(s) {
    return String(s || "").replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, function (c) { var b = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
}
function reverseStr(s) { return String(s).split("").reverse().join(""); }
/* JSON que empieza despues de "marker" (balanceando llaves) */
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

/* ---- VOE (varios dominios espejo) ---- */
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
        /* variante vieja: 'hls': 'base64' / "mp4": "..." */
        var re = /['"](hls|mp4)['"]\s*:\s*['"]([^'"]+)['"]/gi, mm;
        while ((mm = re.exec(h || "")) != null) {
            var v = mm[2];
            if (!/^https?:/i.test(v)) { var d = b64decode(v); if (/^https?:/i.test(d)) v = d; }
            addSrc(out, mkSrc(v, label, ref, mm[1].toLowerCase() == "mp4" ? "mp4" : "hls"));
        }
        if (!out.length) {
            /* si no aparece ninguna de las dos variantes conocidas, intentar
               un escaneo generico de m3u8/mp4 en la pagina antes de rendirse (Voe
               cambia el formato del bloque cifrado con cierta frecuencia). */
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
/* ---- Vidhide / Callistanise / VidhideFast ----
 * Formato propio (no es el packer p,a,c,k,e,d): el HTML trae un array
 * "clave" separado por '|' seguido de .split('|'), y todas las URLs de
 * la pagina estan escritas con tokens en base36 que hay que reemplazar
 * por las palabras de ese array. Portado de PlPro.js (vidhideExtract). */
function exVidhide(url, label, ref) {
    /* Vidhide / callistanise / morencius / hglink (packer Dean Edwards → acek-cdn m3u8) */
    var u = String(url || ""), out = [], base, html, i, best = "", m, txt;
    if (u.indexOf("vidhidefast.com") >= 0) u = u.replace("vidhidefast.com", "callistanise.com");
    else if (u.indexOf("vidhide.com") >= 0 && u.indexOf("callistanise") < 0) u = u.replace("vidhide.com", "callistanise.com");
    base = "https://" + hostOf(u) + "/";
    html = httpGet(u, ref || base);
    if (!html || html.length < 200) {
        log("    vidhide: html insuficiente (" + (html ? html.length : 0) + ") " + hostOf(u));
        return out;
    }
    /* 1) Desempaquetar P.A.C.K.E.R. (morencius y clones) */
    var un = unpackAll(html);
    for (i = 0; i < un.length; i++) {
        m = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i.exec(un[i]);
        if (m) { best = cleanUrl(m[0]); break; }
        m = /https?:\/\/[^\s"'<>\\]+master\.[^\s"'<>\\]+/i.exec(un[i]);
        if (m && !best) best = cleanUrl(m[0]);
    }
    /* 2) Metodo clasico vidhide: array | + tokens base36 */
    if (!best) {
        var splitIdx = html.lastIndexOf(".split('|')");
        if (splitIdx >= 0) {
            var keyEnd = html.lastIndexOf("'", splitIdx), keyStart = html.lastIndexOf("'", keyEnd - 1) + 1;
            var keyArr = html.substring(keyStart, keyEnd).split("|");
            if (keyArr.length >= 50) {
                function decode(s) {
                    return s.replace(/[a-z0-9]+/g, function (tok) {
                        var v = parseInt(tok, 36);
                        return (!isNaN(v) && v > 0 && v < keyArr.length && keyArr[v] && keyArr[v].length > 1) ? keyArr[v] : tok;
                    });
                }
                var cands = html.match(/["'][a-z0-9]+:\/\/[^"']+["']/gi) || [];
                for (i = 0; i < cands.length; i++) {
                    var dec = cleanUrl(decode(cands[i].substring(1, cands[i].length - 1)));
                    if (dec.indexOf("master.") >= 0 && dec.indexOf(".m3u8") >= 0) { best = dec; break; }
                    if (!best && dec.indexOf("master.") >= 0 && dec.indexOf(".txt") >= 0) best = dec;
                }
            }
        }
    }
    /* 3) scanMedia directo sobre el HTML */
    if (!best) {
        var scanned = scanMedia(html, label, base, u);
        if (scanned.length) return scanned;
    }
    if (!best) {
        log("    vidhide/morencius: sin m3u8 en " + hostOf(u));
        return out;
    }
    if (/\.txt(?:[?#]|$)/i.test(best)) {
        txt = httpGet(best, base);
        m = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i.exec(txt || "");
        best = m ? cleanUrl(m[0]) : "";
    }
    if (best) addSrc(out, mkSrc(best, label || "Vidhide", base, "hls"));
    log("    vidhide: " + (out.length ? "ok " + String(best).substring(0, 80) : "fallo"));
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
    var id = String(url).split("#")[1] || "";
    if (!id) return [];
    var b = httpGet("https://pelisplus.esplay.one/video/" + id, "https://pelisplus.esplay.io/"), d = parseJson(b), s = d && d.file ? mkSrc(d.file, label, "https://pelisplus.esplay.io/") : null;
    return s ? [s] : [];
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
function exOkRu(url, label, ref) {
    var id = (String(url).match(/(?:videoembed|video|live)\/(\d+)/) || String(url).match(/[?&](?:id|mid)=(\d+)/) || [])[1];
    if (!id) { log("    ok.ru: sin id en " + url.substring(0, 80)); return []; }
    var R = "https://ok.ru/", out = [], h = httpGet("https://ok.ru/videoembed/" + id, R);
    if (!h) h = httpGet("https://ok.ru/video/" + id, R);
    if (!h) return out;
    var m = /data-options=(?:"([^"]*)"|'([^']*)')/i.exec(h), meta = null, o, fv;
    if (m) {
        o = parseJson(htmlUnescape(m[1] != null ? m[1] : m[2]));
        fv = o && o.flashvars;
        if (fv) {
            meta = fv.metadata;
            if (typeof meta == "string") meta = parseJson(meta);
            if (!meta && fv.metadataUrl) {
                var mu = fv.metadataUrl;
                meta = parseJson(httpGet(mu, R)) || parseJson(httpPost(mu, "", R));
            }
        }
    }
    if (!meta) {
        /* plan B: buscar las claves directo en el texto */
        var t = htmlUnescape(h).replace(/\\\\u0026/g, "&").replace(/\\u0026/g, "&").replace(/\\\\\//g, "/").replace(/\\\//g, "/").replace(/\\"/g, '"'), mm = /"hlsManifestUrl"\s*:\s*"([^"]+)"/i.exec(t);
        if (mm) addSrc(out, mkSrc(mm[1], label + " HLS", R, "hls"));
        log("    ok.ru: sin metadata (data-options " + (m ? "presente" : "ausente") + ") plan B -> " + out.length);
        return out;
    }
    var hls = meta.hlsManifestUrl || meta.hlsMasterPlaylistUrl || meta.ondemandHls || "";
    if (hls) addSrc(out, mkSrc(hls, label + " HLS", R, "hls"));
    var vids = (meta.videos || []).slice(0);
    vids.sort(function (a, b) { return (OK_RANK[b.name] || 0) - (OK_RANK[a.name] || 0); });
    var i;
    for (i = 0; i < vids.length; i++) if (vids[i].url) addSrc(out, mkSrc(vids[i].url, label + " " + (OK_LABEL[vids[i].name] || vids[i].name || "MP4"), R, "mp4"));
    log("    ok.ru: hls=" + (hls ? "si" : "no") + " mp4=" + vids.length + (meta.error ? " error=" + meta.error : ""));
    return out;
}

/* ---- VK / VK Video ---- */
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

/* enlaces que aparecen dentro de una pagina de embed */
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

/* punto de entrada para cualquier URL de embed */
/* PelisJuanita seriesplayer (Cloudflare Worker + JWPlayer con m3u8 en claro).
 * URL típica:
 *   https://seriesplayer.fortamomar.workers.dev/?id=<hash>-<slug>-Season-N[Audio…]-E
 * El HTML trae jwplayer().setup({ file: "https://…onfilom.com/….m3u8?…" })
 * Los corchetes del id DEBEN ir URL-encoded o curl/http fallan. */
function encodePlayerUrl(url) {
    /* El Worker usa / dentro del id para algunos episodios. Codificarlo como %2F
       hace que ciertos deployments de Cloudflare reciban una ruta/query diferente.
       Codificamos corchetes/espacios y preservamos /, probando luego la variante
       totalmente codificada si el primer request no devuelve contenido. */
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

/* HLS dinamico de Juanita: el CDN puede cambiar por episodio. No se usa una
 * lista cerrada de hosts; cualquier URL HTTPS con .m3u8 es valida y conserva
 * la query firmada completa (hdnts/exp/acl/hmac). */
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
    /* segunda variante: id totalmente codificado, útil para deployments que exigen query RFC */
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
        /* Primero: detectar el HLS real del episodio, sin importar el CDN. */
        out = extractJuanitaDynamicHls(html, (label || "Juanita") + " HLS", fetchUrl);
        /* Segundo: extractor general para MP4/DASH y otros formatos. */
        if (!out.length) out = scanMedia(html, label || "Juanita", fetchUrl, fetchUrl);
        if (!out.length) {
            /* Buscar campos playerConfig/setup/source aunque la sintaxis use comillas simples. */
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

function exPoseidonPlayer(url, label, ref) {
    var html = httpGet(url, ref || "https://www.poseidonhd2.co/"), out = [], links = [], i, j, more, m, re;
    if (!html) return out;
    re = /https?:\/\/[^\s"'<>\\]+/gi;
    while ((m = re.exec(html)) != null) {
        var u = cleanUrl(m[0]);
        if (!u || u === url) continue;
        if (hostMatches(hostOf(u), UNSUPPORTED)) continue;
        if (isServerUrl(u) || /\/e\/[a-z0-9]+/i.test(u) || /\/d\/[a-z0-9]+/i.test(u)) {
            if (links.indexOf(u) < 0) links.push(u);
        }
        if (links.length >= 6) break;
    }
    var disc = discoverLinks(html, url);
    for (i = 0; i < disc.length; i++) if (links.indexOf(disc[i]) < 0) links.push(disc[i]);
    for (i = 0; i < links.length && budgetLeft() && out.length < 4; i++) {
        more = resolveEmbed(links[i], label, url, 1);
        for (j = 0; j < more.length; j++) addSrc(out, more[j]);
    }
    if (!out.length) out = scanMedia(html, label, url, url);
    log("    poseidon-player -> " + out.length);
    return out;
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
        /* Un CDN de video no necesita estar en SERVER_HOSTS si la URL ya es
           un recurso multimedia directo. Esto cubre CDNs rotativos como
           flixlat, onfilom, solo-latino y cualquier dominio nuevo.
           IMPORTANTE: se conserva la query completa (hdnts/exp/acl/hmac). */
        if (isDirectMediaUrl(url)) {
            var directType = inferMediaType(url);
            var direct = mkSrc(url, label || (directType == "hls" ? "HLS" : "Video"), ref, directType);
            if (direct) {
                log("    direct media -> " + h + " type=" + directType);
                return [direct];
            }
        }
        if (hostMatches(h, UNSUPPORTED)) { log("  skip unsupported: " + h); return []; }
        /* Juanita seriesplayer / fortamomar / CDNs de m3u8 directo */
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
        if (/player\.poseidonhd2\.co$/i.test(h) || (/poseidonhd2\.co$/i.test(h) && /\/(?:player|download)\.php/i.test(url))) {
            return exPoseidonPlayer(url, label, ref);
        }
        d = mkSrc(url, label, ref);
        if (d) return [d];
        /* familia packer (vidhide / wish / filemoon / filelions): mismo camino, luego genérico */
        if (isPackerFamily(h)) {
            var vh = exVidhide(url, label, ref);
            if (vh && vh.length) return vh;
            return exGeneric(url, label, ref, depth);
        }
        if (h.indexOf("voe.") >= 0 || h.indexOf("voe.sx") >= 0) return exVoe(url, label, ref);
        if (/(?:^|\.)(?:vk\.com|vkvideo\.ru|vk\.ru)$/.test(h)) return exVk(url, label, ref);
        if (h.indexOf("vimeo.com") >= 0) return exVimeo(url, label, ref);
        if (h.indexOf("uqload.") >= 0) return exUqload(url, label);
        if (h.indexOf("streamtape.") >= 0 || /(?:^|\.)tape\./.test(h)) return exStreamTape(url, label);
        if (h.indexOf("dood") >= 0 || /d[o]{3,}d/.test(h)) return exDood(url, label);
        if (h.indexOf("plusvip.") >= 0) return exPlusVip(url, label);
        if (h.indexOf("esplay.") >= 0) return exEsplay(url, label);
        if (h.indexOf("fastream.") >= 0) return exFastream(url, label);
        if (h == "ok.ru" || h.indexOf(".ok.ru") >= 0 || h.indexOf("odnoklassniki") >= 0) return exOkRu(url, label, ref);
        if (h.indexOf("vimeus.") >= 0) {
            log("    vimeus: host no-Vimeo real, usando extractor generico");
            return exGeneric(url, label, ref, depth);
        }
        return exGeneric(url, label, ref, depth);
    } catch (e) {
        log("  resolveEmbed ERROR " + String(url).substring(0, 80) + " -> " + e);
        return [];
    }
}

/* lenguaje a partir de texto libre */
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

/* enlaces candidatos de una pagina de resultados */
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
/* score de un link candidato contra el contexto (ctx.titles = variantes normalizadas
   del titulo real, alimentadas con TMDB es/en/original + AKAs -ver tmdbTitleVariants-).
   Combina: (a) coincidencia fuerte por substring/igualdad (como antes) y (b) similitud
   por solapamiento de tokens (tokenSimilarity) como red de contencion cuando el orden
   de palabras o algun articulo/conector difiere pero el titulo es "el mismo" en el
   mismo idioma. Esto último es lo que evita falsos-negativos por "nombrado distinto"
   dentro de un mismo idioma; el caso de titulos en OTRO idioma (ES vs EN) se resuelve
   dandole a ctx.titles ambas variantes desde TMDB, no por fuzzy-matching. */
function scoreLink(c, ctx) {
    var want = ctx.titles, best = 0, i, j;
    for (i = 0; i < c.titles.length; i++) {
        var t = normalizeTitle(c.titles[i]);
        if (!t) continue;
        for (j = 0; j < want.length; j++) {
            var w = want[j], s = 0;
            if (t == w) s = 100;
            else if (t.indexOf(w) >= 0 || w.indexOf(t) >= 0) {
                /* "Rebelde" adentro de "Rebelde Way" (ratio 0.63) enganchaba cualquier
                   resultado corto de busqueda; exigir un solapamiento fuerte evita que
                   un titulo truncado o un enlace de menu se acepte como coincidencia. */
                var r = Math.min(t.length, w.length) / Math.max(t.length, w.length);
                s = r >= 0.85 ? 60 + r * 30 : 0;
            }
            if (!s) {
                /* red de contencion por tokens: solo cuenta si el solapamiento es muy
                   alto (>=80%), para no reabrir la puerta a falsos positivos */
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
        else return 0; /* año no coincide: se descarta, no se resta (evita falsos positivos entre remakes/versiones) */
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
    /* Priorizar seriesplayer/fortamomar (m3u8 directo) sobre cyberlockers lentos */
    list.sort(function (a, b) {
        function pri(u) {
            u = String(u || "");
            if (/fortamomar|seriesplayer/i.test(u)) return 0;
            if (/voe\.sx|uqload|streamtape/i.test(u)) return 1;
            if (/onfilom|playspelis|flixlat|321moviesfree|filemoon|streamwish/i.test(u)) return 2;
            if (/morencius|vidhide|callistanise|hglink/i.test(u)) return 9; /* lentos/saturados al final */
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
            /* SeriesPlayer/Fortamomar se resuelve directamente en
               exSeriesPlayer(). No hacer prefetch: evita peticiones duplicadas
               y, sobre todo, diferencias de codificación del parámetro id. */
            if (!/fortamomar|seriesplayer/i.test(pu)) {
                if (pu) pre.push(pu);
            } else if (spPre.length < 3) {
                /* misma URL codificada que usa exSeriesPlayer() en su 1er intento */
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
            for (j = 0; j < c.srcs.length; j++) { c.srcs[j].name = label; got.push(c.srcs[j]); }
        } else {
            got = resolveEmbed(c.url, label, c.ref || (originOf(c.url) + "/"), 0);
        }
        n++;
        /* loguear tambien la(s) URL(s) resueltas, no solo la cantidad -
           asi se puede ver si un proveedor esta devolviendo una fuente valida
           o solo un match "falso positivo" del escaneo generico. */
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
/* ------------------------------------------------------------------ */
/* PoseidonHD2 — JSON por TMDB ID (rapido, sin scrapear titulo)         */
/* ------------------------------------------------------------------ */

var _poseidonBuildId = "";
var _poseidonBuildAt = 0;
var POSEIDON_BASE = "https://www.poseidonhd2.co";
var POSEIDON_BUILD_TTL = 6 * 60 * 60 * 1000; /* si el sitio redespliega, poseidonByTmdb reintenta con uno nuevo */

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

function poseidonExtractVideos(block, ref) {
    var out = [], langs = ["latino", "spanish", "english"], i, j, list, v, lang;
    if (!block) return out;
    var videos = block.videos || {};
    for (i = 0; i < langs.length; i++) {
        list = videos[langs[i]] || [];
        lang = poseidonLangLabel(langs[i]);
        for (j = 0; j < list.length; j++) {
            v = list[j];
            if (!v || !v.result) continue;
            out.push(mkCand(v.result, lang, ref, "PoseidonHD"));
        }
    }
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
        /* respuesta vacia / no-JSON: puede ser un buildId viejo (el sitio redesplego).
           Se reintenta UNA vez con uno nuevo, salvo que el actual sea recien obtenido. */
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

/* PelisJuanita (por TMDB, sin busqueda)                               */
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
    /* Acepta stream + download. También captura seriesplayer/fortamomar aunque
       no vengan en row-download (a veces están en iframe o JS). */
    var out = [], tags = findTags(html, /row-download/i), i, m, re, seen = {};
    function addU(u, lang) {
        /* Conservar la URL original. SeriesPlayer se codifica una sola vez
           en exSeriesPlayer(), justo antes de hacer la petición al Worker. */
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
    /* seriesplayer: capturar id completo aunque traiga [Audio…] o /episodio */
    re = /https?:\/\/(?:seriesplayer\.)?fortamomar\.workers\.dev\/\?id=[^\s"'<>]*/gi;
    while ((m = re.exec(html || "")) != null) addU(m[0].replace(/&amp;/g, "&"), "Latino");
    re = /https?:\/\/seriesplayer\.[a-z0-9._-]+\/\?id=[^\s"'<>]*/gi;
    while ((m = re.exec(html || "")) != null) addU(m[0].replace(/&amp;/g, "&"), "Latino");
    /* data-url / href con id=…[Audio…]… (por si el HTML no trae dominio completo) */
    re = /(?:data-url|href|src)=["']([^"']*fortamomar[^"']*|[^"']*seriesplayer[^"']*)["']/gi;
    while ((m = re.exec(html || "")) != null) addU(m[1].replace(/&amp;/g, "&"), "Latino");
    /* iframes del player */
    tags = findTags(html, /^<iframe\b/i);
    for (i = 0; i < tags.length; i++) {
        var a2 = attrsOf(tags[i].tag), src = a2["src"] || a2["data-src"] || "";
        if (/fortamomar|seriesplayer|onfilom|playspelis|flixlat/i.test(src)) addU(src, "");
    }
    return out;
}
/* /movies/search?s=<q> (y /series/search?s=<q>) - buscador propio de PelisJuanita
   que SI encuentra titulos recientes que el slug adivinado (movieInfo.php?title=)
   todavia no tiene armado en su lado (ver nota del usuario: "Spider-Man" 2026 no
   aparecia por slug pero si por este buscador). Se usa SOLO como plan B cuando el
   slug directo no trajo nada, y el resultado se valida con scoreLink (titulo+año)
   antes de confiar en el, nunca a ciegas. El formato exacto de la respuesta no esta
   100% confirmado (Juanita no documenta su API), asi que el parser es tolerante a
   varios nombres de campo comunes y deja rastro en el debug para poder ajustarlo
   rapido si hiciera falta. */
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
/* variantes de slug para un titulo dado, con el año pegado PRIMERO (ej. "pinocho-2022"
   antes que "pinocho"). Esto es clave: el sitio comparte el mismo slug base para
   remakes/homonimos (Pinocho 1940/2019/2022, Moana/Moana 2 sin el "2" no aplica
   pero si el caso de peliculas con el mismo nombre en distinto año), y sin esta
   variante el codigo siempre terminaba pidiendo el slug corto -que en el sitio
   corresponde a UNA sola pelicula fija- sin importar cual version se habia pedido. */
function juanitaRememberSlug(ctx, slug) {
    if (ctx && ctx.id && slug) {
        _juanitaSlugIndex[String(ctx.id)] = String(slug);
        log("  Juanita index: tmdb=" + ctx.id + " -> " + slug);
    }
}
function juanitaCachedSlug(ctx) {
    return (ctx && ctx.id && _juanitaSlugIndex[String(ctx.id)]) ? _juanitaSlugIndex[String(ctx.id)] : "";
}
/* Alias manuales (opcional): titulo TMDB normalizado -> slug real en PelisJuanita.
   Solo hace falta para casos raros; el buscador automatico (plan B) cubre casi todo. */
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
    /* Slug ya confirmado para este TMDB id: no adivinar otras 4 variantes. */
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
    /* pagina "ver-serie" (la que da el usuario): puede traer el reproductor con otro
       marcado, distinto del fragmento AJAX de serieInfo.php */
    var verSerieIdx = -1, verBase = urls.length;
    if (!known) {
        /* paginas de verificacion en el MISMO batch (evita una 2da ronda de red) */
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
        /* de todos los slugs que devolvieron servidores, verificar en paralelo la
           pagina real (/movies/pelicula/<slug>, confirmada por el usuario) y
           quedarse con el primero -en orden de prioridad- que confirme titulo/año.
           Esto es lo que evita el bug de "Pinocho" (distintas versiones sirviendo
           siempre el mismo contenido porque el slug sin año coincidia con otra
           pelicula del catalogo del sitio). */
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
        var vs = bodies[verSerieIdx], out = [], links = discoverLinks(vs, urls[verSerieIdx]), j;
        for (j = 0; j < links.length; j++) out.push(mkCand(links[j], "", base + "/", "Juanita"));
        var direct = scanMedia(vs, "", base + "/", base + "/"), k;
        for (k = 0; k < direct.length; k++) out.push({ url: "", lang: "", srcs: [direct[k]], prov: "Juanita" });
        if (out.length) { log("  ver-serie: " + out.length + " candidato(s) (marcado distinto de serieInfo.php)"); return out; }
    }
    log("  slugs probados: " + slugs.join(", "));
    /* plan B: buscador propio de Juanita (JSON o HTML) con consultas variadas y
       comparacion por palabras, tolerante a titulos distintos entre TMDB y Juanita
       (ej. "...del Rap de Bel-Air" vs "...del Rap en Bel Air", o titulo en ingles). */
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
/* PelisJuanita — catálogo propio (fuera de TMDB)                       */
/* ------------------------------------------------------------------
 * Muchos títulos de Juanita no están bien indexados en TMDB (telenovelas,
 * doblajes regionales, packs). Si el Home/Search solo usa TMDB, nunca
 * aparecen en GrayJay. Este bloque expone el buscador interno de Juanita
 * como resultados tocables con esquema juanita://...
 *
 * Esquema:
 *   juanita://movie/{slug}
 *   juanita://show/{slug}          -> canal (lista de episodios si se puede)
 *   juanita://tv/{slug}/{S}/{E}    -> episodio concreto
 * ------------------------------------------------------------------ */

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

/* Parsea respuesta del buscador JSON o HTML de Juanita a tarjetas de catálogo */
function juanitaSearchRaw(query, kind) {
    var q = clean(query);
    if (!q) return [];
    var endpoint = kind == "tv"
        ? JUANITA_BASE + "/series/search?s=" + enc(q)
        : JUANITA_BASE + "/movies/search?s=" + enc(q);
    var body = httpGet(endpoint, JUANITA_BASE + "/");
    if (!body) return [];

    /* JSON preferido */
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

    /* HTML fallback: enlaces a /movies/pelicula/ o /series/ver-serie/ */
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
        /* también movieInfo?title= */
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

/* Fuentes de una película Juanita por slug (sin pasar por TMDB) */
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

/* Fuentes de un episodio Juanita por slug + S/E */
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
            /* en ver-serie a veces hay links a episodios concretos */
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

    /* show: abrir S1E1 por defecto (lista de episodios vía recommendations) */
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

/* Genera una grilla simple de episodios S1E1..S1E30 (Juanita no siempre expone el listado completo) */
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
/* Cuevana3 (eu + espejos)                                             */
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
/* Distintas "familias" de Cuevana: mismo negocio, plantillas de URL diferentes.
   La familia .eu/.ai/.me/.cc son espejos entre si (mismo motor); cuevana3e.pro
   (alias cuevana3l.biz) es un sitio hermano con otro front-end (sin /ver-pelicula/,
   usa /pelicula/ y /serie/<slug>/episodio-SxE) y sin endpoint de busqueda conocido. */
var CUEVANA_FAMILIES = [
    {
        bases: ["https://www.cuevana3.eu", "https://cuevana3.ai", "https://cuevana3.me", "https://cuevana3.cc"],
        movie: function (base, slug) { return base + "/ver-pelicula/" + slug; },
        episode: function (base, slug, s, e) { return base + "/episodio/" + slug + "-temporada-" + s + "-episodio-" + e; },
        search: function (base, q) { return base + "/search?q=" + enc(q); }
    },
    {
        bases: ["https://cuevana3e.pro"],
        movie: function (base, slug) { return base + "/pelicula/" + slug; },
        episode: function (base, slug, s, e) { return base + "/serie/" + slug + "/episodio-" + s + "x" + e; },
        search: null
    }
];
function provCuevana(ctx) {
    /* Cuevana3 por TMDB ID: /ver-pelicula/{slug} o /episodio/{slug}-temporada-S-episodio-E
       y se VERIFICA thisMovie/serie.TMDbId === ctx.id (como Streamflix). */
    if (!ctx || !ctx.id) return [];
    var bases = ["https://wv3.cuevana3.eu", "https://www.cuevana3.eu"], bi, base, cands = [];
    var titles = [ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []);
    var slugs = [], i, t, slug;
    for (i = 0; i < titles.length; i++) {
        t = titles[i];
        if (!t) continue;
        slug = slugCuevana(t);
        if (slug && slugs.indexOf(slug) < 0) slugs.push(slug);
        slug = String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (slug && slugs.indexOf(slug) < 0) slugs.push(slug);
    }
    if (!slugs.length) return [];

    function extractVideosFromProps(pp, pageUrl) {
        var out = [], block = null, lang, arr, j, v, langKey;
        if (!pp) return out;
        if (pp.thisMovie && String(pp.thisMovie.TMDbId) === String(ctx.id)) block = pp.thisMovie;
        else if (pp.episode && pp.serie && String(pp.serie.TMDbId) === String(ctx.id)) block = pp.episode;
        else if (pp.thisEpisode && pp.thisSerie && String(pp.thisSerie.TMDbId) === String(ctx.id)) block = pp.thisEpisode;
        else if (pp.thisMovie && String(pp.thisMovie.TMDbId) !== String(ctx.id)) {
            log("  Cuevana: TMDbId " + pp.thisMovie.TMDbId + " != " + ctx.id + " (descartado)");
            return out;
        } else if (pp.serie && String(pp.serie.TMDbId) !== String(ctx.id)) {
            log("  Cuevana: serie TMDbId " + pp.serie.TMDbId + " != " + ctx.id + " (descartado)");
            return out;
        }
        if (!block || !block.videos) return out;
        for (langKey in block.videos) {
            if (!block.videos.hasOwnProperty(langKey)) continue;
            lang = langOf(langKey);
            arr = block.videos[langKey] || [];
            for (j = 0; j < arr.length; j++) {
                v = arr[j];
                if (!v || !v.result) continue;
                out.push(mkCand(v.result, lang, pageUrl, "Cuevana3"));
            }
        }
        return out;
    }

    function parseNext(html) {
        var m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html || "");
        if (!m) return null;
        try {
            var j = parseJson(m[1]);
            return j && j.props ? j.props.pageProps : null;
        } catch (e) { return null; }
    }

    for (bi = 0; bi < bases.length && !cands.length && budgetLeft(); bi++) {
        base = bases[bi];
        for (i = 0; i < Math.min(slugs.length, 4) && !cands.length && budgetLeft(); i++) {
            slug = slugs[i];
            var pageUrl, html, pp;
            if (ctx.kind == "movie") {
                pageUrl = base + "/ver-pelicula/" + slug;
                html = httpGet(pageUrl, base + "/");
                pp = parseNext(html);
                cands = extractVideosFromProps(pp, pageUrl);
            } else {
                /* serie: verificar TMDbId en ficha, luego episodio exacto */
                pageUrl = base + "/ver-serie/" + slug;
                html = httpGet(pageUrl, base + "/");
                pp = parseNext(html);
                if (pp && pp.thisSerie && String(pp.thisSerie.TMDbId) !== String(ctx.id)) {
                    log("  Cuevana serie TMDbId " + pp.thisSerie.TMDbId + " != " + ctx.id);
                    continue;
                }
                if (!pp || !pp.thisSerie) continue;
                var epUrl = base + "/episodio/" + slug + "-temporada-" + (ctx.season || 1) + "-episodio-" + (ctx.episode || 1);
                html = httpGet(epUrl, pageUrl);
                pp = parseNext(html);
                cands = extractVideosFromProps(pp, epUrl);
            }
            if (cands.length) log("  Cuevana3 ID=" + ctx.id + " " + slug + " -> " + cands.length);
        }
    }
    if (!cands.length) log("  Cuevana3 tmdb=" + ctx.id + " -> 0");
    return cands;
}
/* variantes extra de slug de Cuevana usando los titulos alternativos de TMDB
   (AKAs), capadas para no multiplicar demasiado los intentos de red */
function cuevanaAltSlugs(ctx) {
    var out = [], i, alts = ctx.altTitles || [];
    for (i = 0; i < alts.length && i < 2; i++) { var s = slugCuevana(alts[i]); if (s) out.push(s); }
    return out;
}

/* ------------------------------------------------------------------ */
/* sitios WordPress / DooPlay / Toroflix (dominios de FilmPlus/PlayPelis) */
/* ------------------------------------------------------------------ */

var SITES = [
    { id: "pelisplus", name: "PelisPlus", bases: ["https://pelisplushd.bz", "https://pelisplushd.nu", "https://pelisplus.to"], search: ["/search?s={q}", "/search/{q}/1"], mode: "pelisplus" },
    { id: "cinecalidad", name: "Cinecalidad", bases: ["https://cinecalidad.am", "https://www.cinecalidad.ec", "https://cinecalidad.onl"], search: ["/?s={q}"], mode: "wp" }
];

/* variantes de consulta para buscar en un sitio: titulo es/en + hasta 2 AKAs de
   TMDB, asi un titulo "nombrado distinto" en el sitio (doblaje/region) igual
   aparece en alguna de las busquedas */
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
    while ((m = re.exec(html || "")) != null) { if (p1.test(m[1]) || p2.test(m[1]) || p3.test(m[1])) return absUrl(m[1], base); }
    return "";
}

/* extrae una URL de embed de un texto (iframe, url suelta o JSON) */
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
    /* 1) DooPlay */
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
    /* 2) iframes (incluye ?trembed= de Toroflix) */
    tags = findTags(html, /^<iframe\b/i);
    for (i = 0; i < tags.length && cands.length < 24; i++) {
        a = attrsOf(tags[i].tag);
        u = a["data-src"] || a["src"] || "";
        if (!u || /youtube|youtu\.be|facebook|twitter|google|disqus|recaptcha|doubleclick/i.test(u) || u.indexOf("about:") === 0) continue;
        cands.push(mkCand(absUrl(u, base), langOf(a["title"] || a["id"] || ""), pageUrl, prov));
    }
    /* 3) data-video / data-embed-url en cualquier etiqueta */
    tags = findTags(html, /data-video=|data-embed-url=|data-player-url=/i);
    for (i = 0; i < tags.length && cands.length < 24; i++) {
        a = attrsOf(tags[i].tag);
        u = a["data-video"] || a["data-embed-url"] || a["data-player-url"] || "";
        if (/^(?:https?:)?\/\//i.test(u)) cands.push(mkCand(absUrl(u, base), langOf(a["title"] || a["id"] || ""), pageUrl, prov));
    }
    /* 4) allpeliculas: /wp-json/get/players?id=<post_id> */
    var pm = /"post_id"\s*:\s*"(\d+)"/.exec(html);
    if (pm && budgetLeft()) {
        var pj = httpGet(base + "/wp-json/get/players?id=" + pm[1], pageUrl), urls = [], k;
        deepUrls(parseJson(pj) || pj, urls, 0);
        for (k = 0; k < urls.length; k++) cands.push(mkCand(absUrl(urls[k], base), "", pageUrl, prov));
    }
    /* 5) rexpelis: #video-<id> (pelicula) / data-player-id (episodio) */
    var vm = /href=["']#video-(\d+)["']/i.exec(html), pid = /data-player-id=["'](\d+)["']/i.exec(html);
    if (vm && ctx.kind == "movie") cands.push(mkCand("https://www.rexpelis.com/player/embed/movie/" + vm[1], "", pageUrl, prov));
    if (pid && ctx.kind == "tv") cands.push(mkCand("https://www.rexpelis.com/player/embed/episode/" + pid[1], "", pageUrl, prov));
    /* 6) repelis edge-data */
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
    /* 7) pelisplay: procesar_player */
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
    /* 8) pelisplushd: enlaces /video/, embed.php, ext.php, go_to_player */
    if (site.mode == "pelisplus") {
        var re = /https?:\/\/[^\s"'<>]+\/(?:video|embed\.php|ext\.php)[^\s"'<>]*/gi, mm;
        while ((mm = re.exec(html)) != null && cands.length < 24) cands.push(mkCand(cleanUrl(mm[0]), "", pageUrl, prov));
        re = /go_to_player\(['"]([^'"]+)/gi;
        while ((mm = re.exec(html)) != null && cands.length < 24) cands.push(mkCand(mm[1].indexOf("http") == 0 ? mm[1] : "https://api.mycdn.moe/player/?id=" + mm[1], "", pageUrl, prov));
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
/* PlPro.org (API propia, ultimo recurso si nada del scraping resulta) */
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
/* orquestador                                                         */
/* ------------------------------------------------------------------ */

/* antes de recorrer los proveedores en serie, se lanza en paralelo la PRIMERA
   consulta que cada uno va a hacer (la busqueda de PoseidonHD/PelisPlus/PelisHouse
   con la primer variante de titulo, y las URLs directas de Cuevana3.eu con el
   primer slug). Como quedan en cache (_pre), cuando el codigo de cada proveedor
   llegue a pedir esa misma URL con httpGet() la va a tener lista al instante en
   vez de esperar su turno -> el "cuello de botella" deja de ser la suma de cada
   request y pasa a ser, aproximadamente, el mas lento de ellos. */
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
    var urls = [], slug = slugCuevana(ctx.titleEs || ctx.titleEn || "");
    if (!slug) return urls;
    if (ctx.kind == "movie") urls.push("https://wv3.cuevana3.eu/ver-pelicula/" + slug);
    else {
        urls.push("https://wv3.cuevana3.eu/ver-serie/" + slug);
        urls.push("https://wv3.cuevana3.eu/episodio/" + slug + "-temporada-" + (ctx.season || 1) + "-episodio-" + (ctx.episode || 1));
    }
    return urls;
}

function provPelisflix1(ctx) {
    /* Pelisflix1 cambia de dominio con frecuencia. Se prueban primero los
       dominios observados recientemente y el parser generico de SITES se encarga
       de localizar la ficha y sus embeds. */
    var bases = [
        "https://pelisflix1.tv",
        "https://pelisflix1.de",
        "https://pelisflix1.link",
        "https://pelisflix1.at",
        "https://pelisflix1.surf"
    ];
    var searches = ["/search?s={q}", "/?s={q}", "/buscar/{q}", "/search/{q}"];
    var out = [], qi, bi, base, q, html, best, page, body, links, j, direct;
    var queries = siteQueries(ctx);
    for (bi = 0; bi < bases.length && budgetLeft() && !out.length; bi++) {
        base = bases[bi];
        for (qi = 0; qi < 1 && budgetLeft() && !out.length; qi++) {
            /* todas las variantes de busqueda de este dominio en paralelo */
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
/* SeriesFlix HD + Pelisflix HD (Streamflix) - data-url/data-server b64 */
/* ------------------------------------------------------------------ */

var SERIESFLIX_BASES = ["https://seriesflixhd.casa", "https://seriesflixhd.team", "https://seriesflixhd.lol"];
var PELISFLIXHD_BASES = ["https://pelisflixhd1.top", "https://pelisflixhd.blog", "https://pelisflixhd.win"];

function b64urlDecode(s) {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    try { return b64decode(s); } catch (e) { return ""; }
}

function extractB64ServerUrls(html, base) {
    var out = [], re = /data-(?:server|url|link|embed)=["']([^"']+)["']/gi, m, raw, dec, u, qm;
    while ((m = re.exec(html || "")) != null) {
        raw = m[1];
        dec = b64urlDecode(raw);
        if (!dec) continue;
        u = cleanUrl(dec);
        qm = /[?&]url=([^&]+)/i.exec(dec);
        if (qm) {
            try { u = cleanUrl(decodeURIComponent(qm[1])); } catch (e) { u = cleanUrl(qm[1]); }
        }
        if (/^https?:\/\//i.test(u)) out.push(u);
    }
    return uniq(out);
}

function seriesflixPrefetchUrls(ctx) {
    var q = enc(ctx.titleEs || ctx.titleEn || "").replace(/%20/g, "+");
    if (!q) return [];
    return [SERIESFLIX_BASES[0] + "/?s=" + q, PELISFLIXHD_BASES[0] + "/?s=" + q];
}

function provSeriesFlix(ctx) {
    var out = [], bi, base, q, html, links, best, page, body, i, urls, u, cands = [];
    var queries = [ctx.titleEs || "", ctx.titleEn || ""].filter(Boolean);
    for (bi = 0; bi < SERIESFLIX_BASES.length && budgetLeft() && !cands.length; bi++) {
        base = SERIESFLIX_BASES[bi];
        for (i = 0; i < queries.length && !cands.length && budgetLeft(); i++) {
            q = enc(queries[i]).replace(/%20/g, "+");
            html = httpGet(base + "/?s=" + q, base + "/");
            if (!html) continue;
            links = [];
            var re = /href=["']((?:https?:\/\/[^"']+)?\/(?:serie|pelicula)\/[^"']+)["']/gi, m;
            while ((m = re.exec(html)) != null) links.push(absUrl(m[1], base));
            links = uniq(links);
            best = null;
            for (var li = 0; li < links.length; li++) {
                var score = Math.max(titleCoverage(slugWords(links[li]), ctx.titleEs || ""), titleCoverage(slugWords(links[li]), ctx.titleEn || ""));
                if (score >= 75 && (!best || score > best.score)) best = { url: links[li], score: score };
            }
            if (!best) continue;
            page = best.url;
            if (ctx.kind == "tv") {
                var seasonUrl = page.replace(/\/$/, "") + "/";
                /* ir a temporada: /temporada/slug-N/ */
                var slug = (page.split("/serie/")[1] || "").replace(/\/$/, "");
                if (slug) {
                    var tUrl = base.replace("seriesflixhd.casa", "seriesflixhd.team") + "/temporada/" + slug + "-" + (ctx.season || 1) + "/";
                    var th = httpGet(tUrl, page) || httpGet(SERIESFLIX_BASES[0] + "/temporada/" + slug + "-" + (ctx.season || 1) + "/", page);
                    var epRe = new RegExp("href=[\"']([^\"']*episodio[^\"']*" + (ctx.season || 1) + "x" + (ctx.episode || 1) + "[^\"']*)[\"']", "i");
                    var em = epRe.exec(th || "");
                    if (!em) em = new RegExp("href=[\"']([^\"']*" + slug + "-" + (ctx.season || 1) + "x" + (ctx.episode || 1) + "[^\"']*)[\"']", "i").exec(th || "");
                    if (em) {
                        page = absUrl(em[1], base);
                        var want = String(ctx.season || 1) + "x" + String(ctx.episode || 1);
                        if (page.toLowerCase().indexOf(want.toLowerCase()) < 0) {
                            log("  SeriesFlix: episodio no coincide (" + want + ")");
                            continue;
                        }
                    } else { log("  SeriesFlix: ep no encontrado"); continue; }
                }
            }
            body = httpGet(page, base + "/");
            if (!body) continue;
            urls = extractB64ServerUrls(body, base);
            for (var ui = 0; ui < urls.length; ui++) {
                u = unwrapEmbedUrl(urls[ui]);
                cands.push(mkCand(u, "", page, "SeriesFlix"));
            }
            /* iframes directos */
            var tags = findTags(body, /^<iframe\b/i);
            for (var ti = 0; ti < tags.length; ti++) {
                var a = attrsOf(tags[ti].tag);
                if (a["src"] && isServerUrl(a["src"])) cands.push(mkCand(absUrl(a["src"], base), "", page, "SeriesFlix"));
            }
            if (cands.length) log("  SeriesFlix " + page.substring(0, 80) + " -> " + cands.length);
        }
    }
    return cands;
}

function provPelisflixHd(ctx) {
    var out = [], bi, base, q, html, links, best, page, body, i, urls, u, cands = [];
    var queries = [ctx.titleEs || "", ctx.titleEn || ""].filter(Boolean);
    for (bi = 0; bi < PELISFLIXHD_BASES.length && budgetLeft() && !cands.length; bi++) {
        base = PELISFLIXHD_BASES[bi];
        for (i = 0; i < Math.min(queries.length, 2) && !cands.length && budgetLeft(); i++) {
            q = enc(queries[i]).replace(/%20/g, "+");
            html = httpGet(base + "/?s=" + q, base + "/");
            if (!html) continue;
            links = [];
            var re = /href=["']((?:https?:\/\/[^"']+)?\/(?:pelicula|serie)\/[^"']+)["']/gi, m;
            while ((m = re.exec(html)) != null) {
                var hu = absUrl(m[1], base);
                if (!/\/(?:peliculas|series)\/?$/i.test(hu)) links.push(hu);
            }
            links = uniq(links);
            best = null;
            for (var li = 0; li < links.length; li++) {
                var score = Math.max(titleCoverage(slugWords(links[li]), ctx.titleEs || ""), titleCoverage(slugWords(links[li]), ctx.titleEn || ""));
                if (ctx.kind == "tv" && /\/pelicula\//i.test(links[li])) continue;
                if (ctx.kind == "movie" && /\/serie\//i.test(links[li])) continue;
                if (score >= 70 && (!best || score > best.score)) best = { url: links[li], score: score };
            }
            if (!best) continue;
            page = best.url;
            body = httpGet(page, base + "/");
            if (!body) continue;
            if (ctx.kind == "tv") {
                var epRe = new RegExp("href=[\"']([^\"']*(?:season|temporada)[^\"']*" + (ctx.season || 1) + "[^\"']*(?:episode|episodio|capitulo)[^\"']*" + (ctx.episode || 1) + "[^\"']*)[\"']", "i");
                var em = epRe.exec(body);
                if (!em) em = new RegExp("href=[\"']([^\"']*" + (ctx.season || 1) + "x" + (ctx.episode || 1) + "[^\"']*)[\"']", "i").exec(body);
                if (em) {
                    page = absUrl(em[1], base);
                    body = httpGet(page, best.url) || body;
                }
            }
            urls = extractB64ServerUrls(body, base);
            for (var ui = 0; ui < urls.length; ui++) {
                u = unwrapEmbedUrl(urls[ui]);
                cands.push(mkCand(u, "", page, "PelisflixHD"));
            }
            if (cands.length) log("  PelisflixHD " + page.substring(0, 80) + " -> " + cands.length);
        }
    }
    return cands;
}



/* ------------------------------------------------------------------ */
/* embed69 / FlixLatam / SoloLatino (Streamflix) - URL + PoW + AES     */
/* Misma forma que tus dominios: buscar por URL, ficha, embeds.        */
/* Los links vienen cifrados AES-CBC; la clave sale del PoW SHA-256.   */
/* ------------------------------------------------------------------ */

var EMBED69 = "https://embed69.org";
var FLIXLATAM = "https://flixlatam.com";
var SOLOLATINO = "https://sololatino.net";

/* --- SHA-256 (ES5, bytes in / hex out) --- */
function sha256Hex(str) {
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    function toWords(msg) {
        var l = msg.length, n = (((l + 8) >>> 6) + 1) * 16, w = [], i;
        for (i = 0; i < n; i++) w[i] = 0;
        for (i = 0; i < l; i++) w[i >> 2] |= msg.charCodeAt(i) << (24 - (i % 4) * 8);
        w[i >> 2] |= 0x80 << (24 - (i % 4) * 8);
        w[n - 1] = l * 8;
        return w;
    }
    var K = [
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var words = toWords(String(str)), i, j, w = [], a, b, c, d, e, f, g, h, t1, t2, ch, maj, s0, s1;
    for (i = 0; i < words.length; i += 16) {
        for (j = 0; j < 16; j++) w[j] = words[i + j];
        for (j = 16; j < 64; j++) {
            s0 = rotr(7, w[j - 15]) ^ rotr(18, w[j - 15]) ^ (w[j - 15] >>> 3);
            s1 = rotr(17, w[j - 2]) ^ rotr(19, w[j - 2]) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
        for (j = 0; j < 64; j++) {
            s1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
            ch = (e & f) ^ (~e & g);
            t1 = (h + s1 + ch + K[j] + w[j]) | 0;
            s0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
            maj = (a & b) ^ (a & c) ^ (b & c);
            t2 = (s0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var hex = "", k;
    for (k = 0; k < 8; k++) {
        var v = H[k] >>> 0;
        hex += ("00000000" + v.toString(16)).slice(-8);
    }
    return hex;
}
function sha256Bytes(str) {
    var hex = sha256Hex(str), out = [], i;
    for (i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
}

/* --- AES-128/256 CBC decrypt (ES5) --- */
function aesDecryptCbc(cipherBytes, keyBytes) {
    /* S-box */
    var S = [
        0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
        0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
        0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
        0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
        0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
        0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
        0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
        0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
        0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
        0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
        0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
        0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
        0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
        0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
        0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
        0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
    ];
    var RCON = [0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];
    function subWord(w) { return (S[(w>>>24)&255]<<24)|(S[(w>>>16)&255]<<16)|(S[(w>>>8)&255]<<8)|S[w&255]; }
    function rotWord(w) { return ((w<<8)|(w>>>24))>>>0; }
    function keyExpand(key) {
        var nk = key.length / 4, nr = nk + 6, w = [], i, t;
        for (i = 0; i < nk; i++) w[i] = ((key[4*i]<<24)|(key[4*i+1]<<16)|(key[4*i+2]<<8)|key[4*i+3])>>>0;
        for (i = nk; i < 4 * (nr + 1); i++) {
            t = w[i - 1];
            if (i % nk === 0) t = (subWord(rotWord(t)) ^ (RCON[i / nk] << 24)) >>> 0;
            else if (nk > 6 && i % nk === 4) t = subWord(t) >>> 0;
            w[i] = (w[i - nk] ^ t) >>> 0;
        }
        return { w: w, nr: nr };
    }
    var invS = [];
    (function () { var i; for (i = 0; i < 256; i++) invS[S[i]] = i; })();
    function gmul(a, b) {
        var p = 0, i;
        for (i = 0; i < 8; i++) {
            if (b & 1) p ^= a;
            var hi = a & 0x80;
            a = (a << 1) & 255;
            if (hi) a ^= 0x1b;
            b >>= 1;
        }
        return p;
    }
    function decryptBlock(input, exp) {
        var state = [], i, r, nr = exp.nr, w = exp.w;
        for (i = 0; i < 16; i++) state[i] = input[i];
        for (i = 0; i < 4; i++) {
            state[4*i] ^= (w[4*nr+i]>>>24)&255;
            state[4*i+1] ^= (w[4*nr+i]>>>16)&255;
            state[4*i+2] ^= (w[4*nr+i]>>>8)&255;
            state[4*i+3] ^= w[4*nr+i]&255;
        }
        for (r = nr - 1; r >= 1; r--) {
            /* inv shift rows */
            var t = state[13]; state[13]=state[9]; state[9]=state[5]; state[5]=state[1]; state[1]=t;
            t=state[2]; state[2]=state[10]; state[10]=t; t=state[6]; state[6]=state[14]; state[14]=t;
            t=state[3]; state[3]=state[7]; state[7]=state[11]; state[11]=state[15]; state[15]=t;
            for (i = 0; i < 16; i++) state[i] = invS[state[i]];
            for (i = 0; i < 4; i++) {
                state[4*i] ^= (w[4*r+i]>>>24)&255;
                state[4*i+1] ^= (w[4*r+i]>>>16)&255;
                state[4*i+2] ^= (w[4*r+i]>>>8)&255;
                state[4*i+3] ^= w[4*r+i]&255;
            }
            for (i = 0; i < 4; i++) {
                var a0=state[4*i], a1=state[4*i+1], a2=state[4*i+2], a3=state[4*i+3];
                state[4*i]   = gmul(a0,14)^gmul(a1,11)^gmul(a2,13)^gmul(a3,9);
                state[4*i+1] = gmul(a0,9)^gmul(a1,14)^gmul(a2,11)^gmul(a3,13);
                state[4*i+2] = gmul(a0,13)^gmul(a1,9)^gmul(a2,14)^gmul(a3,11);
                state[4*i+3] = gmul(a0,11)^gmul(a1,13)^gmul(a2,9)^gmul(a3,14);
            }
        }
        t=state[13]; state[13]=state[9]; state[9]=state[5]; state[5]=state[1]; state[1]=t;
        t=state[2]; state[2]=state[10]; state[10]=t; t=state[6]; state[6]=state[14]; state[14]=t;
        t=state[3]; state[3]=state[7]; state[7]=state[11]; state[11]=state[15]; state[15]=t;
        for (i = 0; i < 16; i++) state[i] = invS[state[i]];
        for (i = 0; i < 4; i++) {
            state[4*i] ^= (w[i]>>>24)&255;
            state[4*i+1] ^= (w[i]>>>16)&255;
            state[4*i+2] ^= (w[i]>>>8)&255;
            state[4*i+3] ^= w[i]&255;
        }
        return state;
    }
    var key = keyBytes.slice(0, 32);
    if (key.length < 16) return null;
    if (key.length > 16 && key.length < 24) key = key.slice(0, 16);
    else if (key.length > 24 && key.length < 32) key = key.slice(0, 24);
    var exp = keyExpand(key);
    var iv = cipherBytes.slice(0, 16), data = cipherBytes.slice(16);
    if (data.length % 16 !== 0 || !data.length) return null;
    var out = [], prev = iv, i, j, block, plain, xored;
    for (i = 0; i < data.length; i += 16) {
        block = data.slice(i, i + 16);
        plain = decryptBlock(block, exp);
        xored = [];
        for (j = 0; j < 16; j++) xored[j] = plain[j] ^ prev[j];
        for (j = 0; j < 16; j++) out.push(xored[j]);
        prev = block;
    }
    /* PKCS7 */
    var pad = out[out.length - 1];
    if (pad > 0 && pad <= 16) out = out.slice(0, out.length - pad);
    var s = "";
    for (i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
    return s;
}

function embed69SolvePow(challenge, difficulty, salt) {
    var prefix = "", i, nonce = 0, hash, keyHash;
    for (i = 0; i < difficulty; i++) prefix += "0";
    while (nonce < 120000) {
        hash = sha256Hex(challenge + String(nonce));
        if (hash.indexOf(prefix) === 0) {
            keyHash = sha256Bytes(challenge + String(nonce) + salt);
            return keyHash;
        }
        nonce++;
    }
    return null;
}

function embed69DecryptLink(encB64, aesKey) {
    try {
        var raw = b64decode(encB64), bytes = [], i;
        for (i = 0; i < raw.length; i++) bytes.push(raw.charCodeAt(i) & 255);
        return aesDecryptCbc(bytes, aesKey);
    } catch (e) { return null; }
}

function embed69ExtractSources(html, provName, pageUrl) {
    var out = [], cm = /POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/.exec(html || "");
    var dm = /POW_DIFFICULTY\s*=\s*(\d+)/.exec(html || "");
    var sm = /POW_SALT\s*=\s*['"]([^'"]+)['"]/.exec(html || "");
    var lm = /let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/.exec(html || "");
    if (!cm || !dm || !sm || !lm) { log("  embed69: sin PoW/dataLink"); return out; }
    var key = embed69SolvePow(cm[1], parseInt(dm[1], 10), sm[1]);
    if (!key) { log("  embed69: PoW fallo"); return out; }
    var data = parseJson(lm[1]);
    if (!data || !data.length) return out;
    var fi, ei, file, embeds, emb, link, lang;
    for (fi = 0; fi < data.length; fi++) {
        file = data[fi];
        lang = langOf(file.video_language || file.language || "LAT");
        embeds = file.sortedEmbeds || [];
        for (ei = 0; ei < embeds.length && out.length < 12; ei++) {
            emb = embeds[ei];
            if (!emb || !emb.link) continue;
            link = emb.link;
            if (!/^https?:\/\//i.test(link)) link = embed69DecryptLink(link, key);
            if (!link || !/^https?:\/\//i.test(link)) continue;
            out.push(mkCand(cleanUrl(link), lang, pageUrl || EMBED69 + "/", provName || "Embed69"));
        }
    }
    log("  embed69 -> " + out.length + " embeds (" + (provName || "") + ")");
    return out;
}

function embed69ByImdb(imdbId, provName) {
    if (!imdbId) return [];
    var id = String(imdbId).indexOf("tt") === 0 ? String(imdbId) : ("tt" + imdbId);
    var url = EMBED69 + "/f/" + id + "/";
    var html = httpGet(url, EMBED69 + "/") || httpGet(EMBED69 + "/vidurl/" + id + "/", EMBED69 + "/");
    if (!html) { log("  embed69: sin HTML para " + id); return []; }
    return embed69ExtractSources(html, provName || "Embed69", url);
}

function flixlatamPrefetchUrls(ctx) {
    var q = enc(ctx.titleEs || ctx.titleEn || "").replace(/%20/g, "+");
    var urls = [];
    if (q) urls.push(FLIXLATAM + "/?s=" + q);
    if (ctx.imdbId) urls.push(EMBED69 + "/f/" + (String(ctx.imdbId).indexOf("tt")===0?ctx.imdbId:("tt"+ctx.imdbId)) + "/");
    return urls;
}

function provFlixLatam(ctx) {
    /* Solo por IMDb de TMDB external_ids (misma clave que Streamflix). Sin fuzzy title. */
    if (!ctx || !ctx.imdbId) { log("  FlixLatam: sin imdb_id TMDB"); return []; }
    var cands = embed69ByImdb(ctx.imdbId, "FlixLatam");
    log("  FlixLatam imdb=" + ctx.imdbId + " -> " + cands.length);
    return cands;
}

function provSoloLatino(ctx) {
    /* Solo por IMDb de TMDB external_ids. Sin fuzzy title / sin CF search. */
    if (!ctx || !ctx.imdbId) { log("  SoloLatino: sin imdb_id TMDB"); return []; }
    var cands = embed69ByImdb(ctx.imdbId, "SoloLatino");
    log("  SoloLatino imdb=" + ctx.imdbId + " -> " + cands.length);
    return cands;
}


var PROVIDERS = [
    /* === FASE ID (como Streamflix: catalogo TMDB -> servers por ID) === */
    { id: "poseidon", name: "PoseidonHD", fast: 1, early: 1, idBased: 1, cap: 6000, prefetch: poseidonPrefetchUrls, candidates: provPoseidon },
    { id: "cuevana", name: "Cuevana3", fast: 1, early: 1, idBased: 1, cap: 7000, prefetch: cuevanaPrefetchUrls, candidates: provCuevana },
    { id: "flixlatam", name: "FlixLatam", fast: 1, early: 1, idBased: 1, cap: 9000, prefetch: flixlatamPrefetchUrls, candidates: provFlixLatam },
    { id: "sololatino", name: "SoloLatino", fast: 1, early: 1, idBased: 1, cap: 9000, prefetch: flixlatamPrefetchUrls, candidates: provSoloLatino },
    /* === Fallback por titulo (solo si faltan fuentes; umbral alto) === */
    { id: "juanita", name: "PelisJuanita", fast: 0, early: 0, idBased: 0, cap: 8000, prefetch: juanitaPrefetchUrls, candidates: provJuanita },
    { id: "pelisflixhd", name: "PelisflixHD", fast: 0, early: 0, idBased: 0, cap: 6000, prefetch: seriesflixPrefetchUrls, candidates: provPelisflixHd },
    { id: "seriesflix", name: "SeriesFlix", fast: 0, early: 0, idBased: 0, cap: 6000, prefetch: seriesflixPrefetchUrls, candidates: provSeriesFlix },
    { id: "pelisflix1", name: "Pelisflix1", fast: 0, early: 0, idBased: 0, cap: 5000, prefetch: pelisflixPrefetchUrls, candidates: provPelisflix1 }
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

function hostPriority(name) {
    /* Menor = mejor. Morencius/Vidhide suelen ir lentos o saturados. */
    var n = String(name || "").toLowerCase();
    if (/voe|vimeos|vimeus/.test(n)) return 0;
    if (/streamtape|uqload|goodstream|filemoon/.test(n)) return 1;
    if (/streamwish|hlswish|wishembed|supervideo|lulu/.test(n)) return 2;
    if (/dood|mixdrop|ok\.ru|okru|nupload/.test(n)) return 3;
    if (/vidhide|callistanise|morencius|hglink|hgcloud/.test(n)) return 6; /* al final: lentos */
    return 4;
}
function sortSourcesByLang(out) {
    var idx = [], j, sorted = [];
    for (j = 0; j < out.length; j++) {
        var nm = String(out[j].name || "");
        idx.push({
            s: out[j], i: j,
            r: langRank(nm.split(" \u00b7 ")[0]),
            h: hostPriority(nm)
        });
    }
    idx.sort(function (a, b) {
        if (a.r != b.r) return a.r - b.r;
        if (a.h != b.h) return a.h - b.h;
        return a.i - b.i;
    });
    for (j = 0; j < idx.length; j++) sorted.push(idx[j].s);
    return sorted;
}

/* hasta n fuentes, priorizando que sean de servidores distintos (mismo nombre = misma fuente) */
function capResults(out, n) {
    var res = [], seen = {}, i, k;
    for (i = 0; i < out.length && res.length < n; i++) {
        k = String(out[i].name || "");
        if (!seen[k]) { seen[k] = 1; res.push(out[i]); }
    }
    for (i = 0; i < out.length && res.length < n; i++) if (res.indexOf(out[i]) < 0) res.push(out[i]);
    return res;
}

function collectSources(ctx) {
    /* Streamflix model:
         1) Providers anclados a TMDB/IMDb ID
         2) Early-stop al tener WANT_SERVERS
         3) Fallback fuzzy solo si falta y queda presupuesto
    */
    var out = [], servers = 0, list, k, cands, i;
    if (!ctx || !ctx.id) { log("collectSources: sin TMDB id"); return out; }
    log("collectSources tmdb=" + ctx.id + " kind=" + ctx.kind + (ctx.kind == "tv" ? (" S" + ctx.season + "E" + ctx.episode) : "") + (ctx.imdbId ? (" imdb=" + ctx.imdbId) : ""));

    function runList(arr, onlyId) {
        for (k = 0; k < arr.length && budgetLeft() && servers < WANT_SERVERS; k++) {
            if (onlyId && !arr[k].idBased) continue;
            if (!onlyId && arr[k].idBased) continue;
            try {
                cands = arr[k].candidates(ctx) || [];
            } catch (e) {
                log("  " + arr[k].name + " ERROR " + e);
                cands = [];
            }
            if (cands.length) {
                servers += resolveCands(cands, out, arr[k].name, WANT_SERVERS - servers);
                log("  +" + arr[k].name + " totalSrc=" + out.length + " servers=" + servers);
            }
            if (servers >= WANT_SERVERS) {
                log("early-stop @" + arr[k].name + " (" + servers + " fuentes)");
                return;
            }
        }
    }

    runList(PROVIDERS, true);
    if (servers < WANT_SERVERS && budgetLeft()) {
        log("fallback fuzzy (faltan fuentes)");
        runList(PROVIDERS, false);
    }
    /* plan B WP */
    if (servers < WANT_SERVERS && budgetLeft() && typeof provSite == "function") {
        try {
            for (i = 0; i < SITES.length && budgetLeft() && servers < WANT_SERVERS; i++) {
                cands = provSite(SITES[i], ctx) || [];
                if (cands.length) servers += resolveCands(cands, out, SITES[i].name, WANT_SERVERS - servers);
            }
        } catch (e2) { log("WP planB " + e2); }
    }

    out = sortSourcesByLang(out);
    log("collectSources FIN -> " + out.length + " src, " + elapsed() + "ms");
    return capResults(out);
}

/* ------------------------------------------------------------------ */
/* JKAnime (adaptado de PlPro.js) - catalogo propio, fuera de TMDB      */
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
    var out = [], tags = findTags(html, /^<div\b/i), i;
    /* tarjetas: <div class="anime__item"><a href=".../slug/">...data-setbg="img"...<h5><a>Titulo</a></h5> */
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

/* la pagina de episodio tiene un iframe jkplayer propio con el m3u8 en texto plano */
function jkEpisodeSources(slug, num) {
    var epUrl = JK + "/" + slug + "/" + num + "/", html = httpGet(epUrl, JK + "/"), out = [];
    if (!html) { log("  jkanime: episodio sin HTML"); return out; }
    var m = /video\[\d+\]\s*=\s*'[^']*(?:src|href)=["'](https?:\/\/jkanime\.net\/jkplayer\/um[^"']*)["']/i.exec(html);
    if (!m) {
        /* plan B: cualquier iframe del reproductor propio */
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
/* La Cartoons (Streamflix LaCartoonsProvider) - series clasicas/cartoon */
/* ------------------------------------------------------------------ */

var LC = "https://www.lacartoons.com";
var LC_SCHEME = "lacartoons://";

function lcAuthor() { return new PlatformAuthorLink(PPID, "La Cartoons", LC, "", 0); }
function lcMakeShow(id) { return LC_SCHEME + "show/" + id; }
function lcMakeEp(sid, epId, season) { return LC_SCHEME + "ep/" + sid + "/" + epId + "/" + (season || 1); }
function lcParseInternal(url) {
    var s = String(url || ""), m = s.match(/^lacartoons:\/\/show\/(\d+)$/);
    if (m) return { kind: "lcshow", id: m[1] };
    m = s.match(/^lacartoons:\/\/ep\/(\d+)\/(\d+)\/(\d+)$/);
    if (m) return { kind: "lcep", sid: m[1], epId: m[2], season: parseInt(m[3], 10) };
    return null;
}

function lcSeriesInfo(id) {
    var url = LC + "/serie/" + id, html = httpGet(url, LC + "/");
    if (!html) return null;
    var h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
    var title = h2 ? strip(h2[1]).replace(/\s+/g, " ").trim() : ("Serie " + id);
    title = title.replace(/\s*(Cartoon Network|Nickelodeon|Hanna Barbera|Disney|Fox Kids|Boomerang)\s*$/i, "").trim();
    var im = /<div[^>]*class=["']imagen-serie["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)/i.exec(html);
    var poster = im ? absUrl(im[1], LC) : "";
    var syn = "", sm = /Rese[nñ]a:\s*<br\s*\/?>\s*<span>([\s\S]*?)<\/span>/i.exec(html);
    if (sm) syn = strip(sm[1]);
    var eps = [], re = /href=["']\/serie\/capitulo\/(\d+)\?t=(\d+)["']/gi, m, seen = {};
    while ((m = re.exec(html)) != null) {
        var key = m[1] + ":" + m[2];
        if (seen[key]) continue;
        seen[key] = 1;
        eps.push({ epId: m[1], season: parseInt(m[2], 10) });
    }
    return { id: id, title: title, poster: poster, synopsis: syn, episodes: eps };
}

function lcEpisodeSources(epId, season, referer) {
    var epUrl = LC + "/serie/capitulo/" + epId + "?t=" + (season || 1);
    var html = httpGet(epUrl, referer || (LC + "/")), out = [];
    if (!html) return out;
    var tags = findTags(html, /^<iframe\b/i), i, a, src;
    for (i = 0; i < tags.length; i++) {
        a = attrsOf(tags[i].tag);
        src = a["src"] || "";
        if (!src) continue;
        src = absUrl(src, LC);
        out = out.concat(resolveEmbed(src, "LaCartoons", epUrl, 0));
        if (!out.length && /ok\.ru|odnoklassniki/i.test(src)) {
            var ok = exOkRu(src, "LaCartoons · OK.ru", epUrl);
            for (var k = 0; k < ok.length; k++) out.push(ok[k]);
        }
    }
    if (!out.length) out = scanMedia(html, "LaCartoons", epUrl, epUrl);
    log("  lacartoons ep " + epId + " -> " + out.length);
    return out;
}

function lcSearch(query) {
    if (!query) return [];
    if (!budgetLeft()) startBudget();
    var qn = normalizeTitle(query), out = [], page, html, ids = [], seen = {}, i, info, cov;
    /* listado + busqueda: extrae /serie/N y filtra por titulo en detalle */
    /* La Cartoons: el listado no filtra bien por ?s=; se toman IDs y se
       resuelven titulos en detalle, limitando peticiones al presupuesto. */
    for (page = 1; page <= 2 && budgetLeft() && ids.length < 12; page++) {
        html = httpGet(LC + "/?s=" + enc(query) + "&page=" + page, LC + "/");
        if (!html) html = httpGet(LC + "/?page=" + page, LC + "/");
        if (!html) break;
        var re = /href=["']\/serie\/(\d+)["']/g, m;
        while ((m = re.exec(html)) != null) {
            if (!seen[m[1]] && m[1] !== "0") { seen[m[1]] = 1; ids.push(m[1]); }
        }
    }
    for (i = 0; i < ids.length && out.length < 8 && budgetLeft(); i++) {
        info = lcSeriesInfo(ids[i]);
        if (!info || !info.title) continue;
        cov = titleCoverage(info.title, query);
        if (qn && cov < 50 && tokenSimilarity(info.title, query) < 50) continue;
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "lc_" + ids[i], PID),
            name: "[Cartoon] " + info.title,
            thumbnails: thumb(info.poster),
            author: lcAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: lcMakeShow(ids[i])
        }));
    }
    log("lacartoons search '" + query + "' -> " + out.length);
    return out;
}

function lcDetails(url) {
    var p = lcParseInternal(url);
    if (!p) return null;
    resetDebug(); startBudget();
    var sid = p.kind == "lcep" ? p.sid : p.id;
    var info = lcSeriesInfo(sid);
    if (!info) return errorDetails(url, "La Cartoons no respondio");
    var ep = null, i;
    if (p.kind == "lcep") {
        for (i = 0; i < info.episodes.length; i++) {
            if (String(info.episodes[i].epId) == String(p.epId)) { ep = info.episodes[i]; break; }
        }
    }
    if (!ep && info.episodes.length) ep = info.episodes[0];
    if (!ep) return errorDetails(url, "Sin episodios en La Cartoons");
    log("LaCartoons: " + info.title + " ep=" + ep.epId + " t=" + ep.season);
    var sources = lcEpisodeSources(ep.epId, ep.season, LC + "/serie/" + sid);
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "lc_" + sid + "_" + ep.epId, PID),
        name: info.title + " · Cap " + ep.epId,
        thumbnails: thumb(info.poster),
        author: lcAuthor(),
        uploadDate: 0, duration: 0, viewCount: 0, isLive: false,
        url: lcMakeEp(sid, ep.epId, ep.season),
        description: (info.synopsis || "") + "\n\nDominios con este VOD: La Cartoons\nFuentes: " + sources.length + (debugMode() ? ("\n\n=== DEBUG ===\n" + _debug) : ""),
        video: new VideoSourceDescriptor(sources)
    });
}

function lcRecommendations(url) {
    var p = lcParseInternal(url);
    if (!p) return [];
    var sid = p.kind == "lcep" ? p.sid : p.id;
    var info = lcSeriesInfo(sid), i, out = [], cur = p.kind == "lcep" ? String(p.epId) : "";
    if (!info) return [];
    for (i = 0; i < info.episodes.length && out.length < 80; i++) {
        if (String(info.episodes[i].epId) == cur) continue;
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "lc_" + sid + "_" + info.episodes[i].epId, PID),
            name: info.title + " · Cap " + info.episodes[i].epId + (info.episodes[i].season > 1 ? (" (T" + info.episodes[i].season + ")") : ""),
            thumbnails: thumb(info.poster),
            author: lcAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: lcMakeEp(sid, info.episodes[i].epId, info.episodes[i].season)
        }));
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* TioAnime (Streamflix TioAnimeProvider) - anime latino              */
/* ------------------------------------------------------------------ */

var TIO = "https://tioanime.com";
var TIO_SCHEME = "tioanime://";

function tioAuthor() { return new PlatformAuthorLink(PPID, "TioAnime", TIO, "", 0); }
function tioMakeShow(slug) { return TIO_SCHEME + "serie/" + slug; }
function tioMakeEp(slug, n) { return TIO_SCHEME + "ep/" + slug + "/" + n; }
function tioParseInternal(url) {
    var s = String(url || ""), m = s.match(/^tioanime:\/\/serie\/([a-z0-9-]+)$/);
    if (m) return { kind: "tioshow", slug: m[1] };
    m = s.match(/^tioanime:\/\/ep\/([a-z0-9-]+)\/(\d+)$/);
    if (m) return { kind: "tioep", slug: m[1], num: parseInt(m[2], 10) };
    return null;
}

function tioSearch(query) {
    if (!query) return [];
    if (!budgetLeft()) startBudget();
    var html = httpGet(TIO + "/directorio?q=" + enc(query), TIO + "/"), out = [], re, m;
    if (!html) return out;
    re = /href=["'](?:https?:\/\/tioanime\.com)?\/anime\/([a-z0-9-]+)["'][^>]*>[\s\S]{0,300}?alt=["']([^"']+)/gi;
    while ((m = re.exec(html)) != null && out.length < 25) {
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "tio_" + m[1], PID),
            name: "[Anime] " + clean(m[2]),
            thumbnails: thumb(""),
            author: tioAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: tioMakeShow(m[1])
        }));
    }
    if (!out.length) {
        re = /href=["'](?:https?:\/\/tioanime\.com)?\/anime\/([a-z0-9-]+)["']/gi;
        var seen = {};
        while ((m = re.exec(html)) != null && out.length < 25) {
            if (seen[m[1]]) continue;
            seen[m[1]] = 1;
            out.push(new PlatformVideo({
                id: new PlatformID(PLATFORM, "tio_" + m[1], PID),
                name: "[Anime] " + slugToTitle(m[1]),
                thumbnails: thumb(""),
                author: tioAuthor(),
                uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
                url: tioMakeShow(m[1])
            }));
        }
    }
    /* posters */
    for (var i = 0; i < out.length; i++) {
        var im = new RegExp("/anime/" + out[i].url.split("/").pop() + "[\"'][\\s\\S]{0,200}?src=[\"']([^\"']+)", "i").exec(html);
        if (!im) im = new RegExp("src=[\"']([^\"']+)[\"'][\\s\\S]{0,200}?/anime/" + out[i].url.split("/").pop(), "i").exec(html);
        if (im) out[i].thumbnails = thumb(absUrl(im[1], TIO));
    }
    log("tioanime search -> " + out.length);
    return out;
}

function tioSeriesInfo(slug) {
    var url = TIO + "/anime/" + slug, html = httpGet(url, TIO + "/");
    if (!html) return null;
    var tm = /<h1[^>]*>([^<]+)/i.exec(html), title = tm ? clean(tm[1]) : slugToTitle(slug);
    var im = /<div[^>]*class=["'][^"']*thumb[^"']*["'][^>]*>[\s\S]{0,100}?<img[^>]+src=["']([^"']+)/i.exec(html)
        || /<img[^>]+class=["'][^"']*cover[^"']*["'][^>]+src=["']([^"']+)/i.exec(html)
        || /property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html);
    var poster = im ? absUrl(im[1], TIO) : "";
    var syn = "", sm = /class=["'][^"']*sinopsis[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(html);
    if (sm) syn = strip(sm[1]);
    var nums = [], em = /episodes\s*=\s*\[([^\]]+)\]/i.exec(html);
    if (em) {
        var parts = em[1].split(","), i, n;
        for (i = 0; i < parts.length; i++) {
            n = parseInt(parts[i], 10);
            if (!isNaN(n)) nums.push(n);
        }
        nums.sort(function (a, b) { return a - b; });
    }
    if (!nums.length) {
        var re = new RegExp("href=[\"'][^\"']*/ver/" + slug + "-(\\d+)[\"']", "gi"), m;
        var seen = {};
        while ((m = re.exec(html)) != null) {
            n = parseInt(m[1], 10);
            if (!seen[n]) { seen[n] = 1; nums.push(n); }
        }
        nums.sort(function (a, b) { return a - b; });
    }
    return { title: title, poster: poster, synopsis: syn, episodes: nums, slug: slug };
}

function tioEpisodeSources(slug, num) {
    var epUrl = TIO + "/ver/" + slug + "-" + num, html = httpGet(epUrl, TIO + "/anime/" + slug), out = [];
    if (!html) return out;
    var vm = /var\s+videos\s*=\s*(\[[\s\S]*?\]);/i.exec(html);
    if (vm) {
        var arr = parseJson(vm[1].replace(/'/g, '"')) || [];
        var i, name, u, resolved;
        for (i = 0; i < arr.length; i++) {
            if (!arr[i] || !arr[i].length) continue;
            name = String(arr[i][0] || "Tio");
            u = String(arr[i][1] || "");
            if (!u) continue;
            u = u.replace(/\\\//g, "/");
            if (/mega\.nz/i.test(u)) continue; /* mega no reproducible en GrayJay facilmente */
            resolved = resolveEmbed(u, "TioAnime · " + name, epUrl, 0);
            if (resolved && resolved.length) {
                for (var k = 0; k < resolved.length; k++) out.push(resolved[k]);
            } else {
                var s = mkSrc(u, "TioAnime · " + name, epUrl);
                if (s) out.push(s);
            }
            if (out.length >= WANT_SERVERS) break;
        }
    }
    if (!out.length) {
        var tags = findTags(html, /^<iframe\b/i), j, a;
        for (j = 0; j < tags.length; j++) {
            a = attrsOf(tags[j].tag);
            if (a["src"]) out = out.concat(resolveEmbed(absUrl(a["src"], TIO), "TioAnime", epUrl, 0));
        }
    }
    log("  tioanime " + slug + "-" + num + " -> " + out.length);
    return out;
}

function tioDetails(url) {
    var p = tioParseInternal(url);
    if (!p) return null;
    resetDebug(); startBudget();
    var info = tioSeriesInfo(p.slug);
    if (!info) return errorDetails(url, "TioAnime no respondio");
    var num = p.kind == "tioep" ? p.num : (info.episodes.length ? info.episodes[0] : 1);
    log("TioAnime: " + info.title + " Ep " + num);
    var sources = tioEpisodeSources(p.slug, num);
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "tio_" + p.slug + "_" + num, PID),
        name: info.title + " · Ep " + num,
        thumbnails: thumb(info.poster),
        author: tioAuthor(),
        uploadDate: 0, duration: 0, viewCount: 0, isLive: false,
        url: tioMakeEp(p.slug, num),
        description: (info.synopsis || "") + "\n\nDominios con este VOD: TioAnime\nFuentes: " + sources.length + (debugMode() ? ("\n\n=== DEBUG ===\n" + _debug) : ""),
        video: new VideoSourceDescriptor(sources)
    });
}

function tioRecommendations(url) {
    var p = tioParseInternal(url);
    if (!p) return [];
    var info = tioSeriesInfo(p.slug), i, out = [], cur = p.kind == "tioep" ? p.num : -1;
    if (!info) return [];
    for (i = 0; i < info.episodes.length && out.length < 100; i++) {
        if (info.episodes[i] == cur) continue;
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "tio_" + p.slug + "_" + info.episodes[i], PID),
            name: info.title + " · Ep " + info.episodes[i],
            thumbnails: thumb(info.poster),
            author: tioAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: tioMakeEp(p.slug, info.episodes[i])
        }));
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Latanime (Streamflix LatanimeProvider)                             */
/* ------------------------------------------------------------------ */

var LAT = "https://latanime.org";
var LAT_SCHEME = "latanime://";

function latAuthor() { return new PlatformAuthorLink(PPID, "Latanime", LAT, "", 0); }
function latMakeShow(slug) { return LAT_SCHEME + "serie/" + slug; }
function latMakeEp(slug, n) { return LAT_SCHEME + "ep/" + slug + "/" + n; }
function latParseInternal(url) {
    var s = String(url || ""), m = s.match(/^latanime:\/\/serie\/([a-z0-9-]+)$/);
    if (m) return { kind: "latshow", slug: m[1] };
    m = s.match(/^latanime:\/\/ep\/([a-z0-9-]+)\/(\d+)$/);
    if (m) return { kind: "latep", slug: m[1], num: parseInt(m[2], 10) };
    return null;
}

function latSearch(query) {
    if (!query) return [];
    if (!budgetLeft()) startBudget();
    var html = httpGet(LAT + "/buscar?q=" + enc(query), LAT + "/"), out = [], re, m, seen = {};
    if (!html) return out;
    re = /href=["'](?:https?:\/\/latanime\.org)?\/anime\/([a-z0-9-]+)["'][^>]*>/gi;
    while ((m = re.exec(html)) != null && out.length < 25) {
        if (seen[m[1]]) continue;
        seen[m[1]] = 1;
        var title = slugToTitle(m[1]);
        var im = new RegExp("/anime/" + m[1] + "[\\s\\S]{0,250}?src=[\"']([^\"']+)", "i").exec(html);
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "lat_" + m[1], PID),
            name: "[Anime] " + title,
            thumbnails: thumb(im ? absUrl(im[1], LAT) : ""),
            author: latAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: latMakeShow(m[1])
        }));
    }
    log("latanime search -> " + out.length);
    return out;
}

function latSeriesInfo(slug) {
    var url = LAT + "/anime/" + slug, html = httpGet(url, LAT + "/");
    if (!html) return null;
    var tm = /<h1[^>]*>([^<]+)/i.exec(html) || /property=["']og:title["'][^>]*content=["']([^"']+)/i.exec(html);
    var title = tm ? clean(tm[1]) : slugToTitle(slug);
    var im = /property=["']og:image["'][^>]*content=["']([^"']+)/i.exec(html);
    var poster = im ? absUrl(im[1], LAT) : "";
    var syn = "", sm = /class=["'][^"']*(?:sinopsis|synopsis|description)[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(html);
    if (sm) syn = strip(sm[1]);
    var nums = [], seen = {}, re = new RegExp("href=[\"'][^\"']*/ver/" + slug + "-(\\d+)[\"']", "gi"), m, n;
    while ((m = re.exec(html)) != null) {
        n = parseInt(m[1], 10);
        if (!seen[n]) { seen[n] = 1; nums.push(n); }
    }
    if (!nums.length) {
        re = /href=["'][^"']*\/ver\/[^"']*-(\d+)["']/gi;
        while ((m = re.exec(html)) != null) {
            n = parseInt(m[1], 10);
            if (!seen[n]) { seen[n] = 1; nums.push(n); }
        }
    }
    nums.sort(function (a, b) { return a - b; });
    return { title: title, poster: poster, synopsis: syn, episodes: nums, slug: slug };
}

function latEpisodeSources(slug, num) {
    var epUrl = LAT + "/ver/" + slug + "-" + num, html = httpGet(epUrl, LAT + "/anime/" + slug), out = [];
    if (!html) {
        epUrl = LAT + "/ver/" + slug + "/" + num;
        html = httpGet(epUrl, LAT + "/anime/" + slug);
    }
    if (!html) return out;
    var vm = /var\s+videos\s*=\s*(\[[\s\S]*?\]);/i.exec(html);
    if (vm) {
        var arr = parseJson(vm[1].replace(/'/g, '"')) || [], i, name, u, resolved;
        for (i = 0; i < arr.length; i++) {
            if (!arr[i] || !arr[i].length) continue;
            name = String(arr[i][0] || "Lat");
            u = String(arr[i][1] || "").replace(/\\\//g, "/");
            if (!u || /mega\.nz/i.test(u)) continue;
            resolved = resolveEmbed(u, "Latanime · " + name, epUrl, 0);
            if (resolved && resolved.length) {
                for (var k = 0; k < resolved.length; k++) out.push(resolved[k]);
            }
            if (out.length >= WANT_SERVERS) break;
        }
    }
    if (!out.length) {
        var urls = extractB64ServerUrls(html, LAT), j;
        for (j = 0; j < urls.length; j++) out = out.concat(resolveEmbed(unwrapEmbedUrl(urls[j]), "Latanime", epUrl, 0));
        var tags = findTags(html, /^<iframe\b/i);
        for (j = 0; j < tags.length; j++) {
            var a = attrsOf(tags[j].tag);
            if (a["src"]) out = out.concat(resolveEmbed(absUrl(a["src"], LAT), "Latanime", epUrl, 0));
        }
    }
    log("  latanime " + slug + "-" + num + " -> " + out.length);
    return out;
}

function latDetails(url) {
    var p = latParseInternal(url);
    if (!p) return null;
    resetDebug(); startBudget();
    var info = latSeriesInfo(p.slug);
    if (!info) return errorDetails(url, "Latanime no respondio");
    var num = p.kind == "latep" ? p.num : (info.episodes.length ? info.episodes[0] : 1);
    var sources = latEpisodeSources(p.slug, num);
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "lat_" + p.slug + "_" + num, PID),
        name: info.title + " · Ep " + num,
        thumbnails: thumb(info.poster),
        author: latAuthor(),
        uploadDate: 0, duration: 0, viewCount: 0, isLive: false,
        url: latMakeEp(p.slug, num),
        description: (info.synopsis || "") + "\n\nDominios con este VOD: Latanime\nFuentes: " + sources.length + (debugMode() ? ("\n\n=== DEBUG ===\n" + _debug) : ""),
        video: new VideoSourceDescriptor(sources)
    });
}

function latRecommendations(url) {
    var p = latParseInternal(url);
    if (!p) return [];
    var info = latSeriesInfo(p.slug), i, out = [], cur = p.kind == "latep" ? p.num : -1;
    if (!info) return [];
    for (i = 0; i < info.episodes.length && out.length < 100; i++) {
        if (info.episodes[i] == cur) continue;
        out.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "lat_" + p.slug + "_" + info.episodes[i], PID),
            name: info.title + " · Ep " + info.episodes[i],
            thumbnails: thumb(info.poster),
            author: latAuthor(),
            uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
            url: latMakeEp(p.slug, info.episodes[i])
        }));
    }
    return out;
}



/* ------------------------------------------------------------------ */
/* objetos GrayJay                                                     */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* objetos GrayJay                                                     */
/* ------------------------------------------------------------------ */

function thumb(u) { return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]); }
function tmdbAuthor() { return new PlatformAuthorLink(PPID, "StreamflixHub", "https://www.themoviedb.org", "", 0); }
function showAuthor(id, name, poster) {
    return new PlatformAuthorLink(new PlatformID(PLATFORM, "show_" + id, PID), name || "Serie", makeShowUrl(id), poster || "", 0);
}
function catalogVideo(x) {
    /* x: {id, kind, title, poster} */
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
function mapTmdbList(list) {
    var out = [], seen = {}, i, x, kind;
    for (i = 0; i < (list || []).length && out.length < MAX_ITEMS; i++) {
        x = list[i];
        if (!x) continue;
        kind = x.media_type == "tv" ? "tv" : (x.media_type == "movie" ? "movie" : "");
        if (!kind) continue;
        var key = kind + x.id;
        if (seen[key]) continue;
        seen[key] = 1;
        out.push(catalogVideo({ id: x.id, kind: kind, title: x.title || x.name, poster: img(x.poster_path), date: x.release_date || x.first_air_date }));
    }
    return out;
}
function withKind(list, kind) {
    var i, out = [];
    for (i = 0; i < (list || []).length; i++) { if (list[i]) { list[i].media_type = kind; out.push(list[i]); } }
    return out;
}

/* pager con paginas siguientes */
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
    /* Home estilo Streamflix: TMDB trending (portadas limpias) + toques del catalogo Poseidon */
    var d = tmdbGet("/trending/all/week?page=" + page);
    var res = d && d.results ? d.results : [];
    var results = mapTmdbList(res);
    if (page == 1 && extraSites()) {
        try {
            var native = poseidonHomeNative(1);
            if (native.length) {
                var merged = mergeProviderResults([native, []]);
                /* no duplicar: mapTmdbList ya tiene trending; solo relleno si vacio */
            }
        } catch (e) { log("poseidonHomeNative " + e); }
    }
    return {
        results: results,
        hasMore: !!(d && d.total_pages && page < Math.min(d.total_pages, 10))
    };
}
/* traduce ES->EN con MyMemory (gratis, sin key) como plan B cuando la
   busqueda en espanol no encuentra nada en TMDB (titulos muy recientes/sin
   traducir todavia, ej. "Spider-Man: Un Nuevo Dia" vs "Brand New Day"). */
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

/* ------------------------------------------------------------------ */
/* Busqueda estilo Streamflix (GlobalSearching)                        */
/* Parallel en proveedores nativos + TMDB; 1 portada por TMDbId.       */
/* ------------------------------------------------------------------ */

var CUEVANA_SEARCH_BASES = [
    "https://wv3.cuevana3.eu",
    "https://www.cuevana3.eu",
    "https://cuevana3.ai",
    "https://cuevana3.me"
];

function nextDataProps(html) {
    var m = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html || "");
    if (!m) return null;
    var j = parseJson(m[1]);
    return j && j.props && j.props.pageProps ? j.props.pageProps : null;
}

/* Cuevana / espejos Next.js: /search?q= -> __NEXT_DATA__.movies|series con TMDbId */
function cuevanaSearchNative(q, page) {
    var out = [], bi, html, pp, list, i, x, kind, id, title, poster, urlSlug;
    if (!q) return out;
    for (bi = 0; bi < Math.min(CUEVANA_SEARCH_BASES.length, 2) && !out.length && budgetLeft(); bi++) {
        html = httpGet(CUEVANA_SEARCH_BASES[bi] + "/search?q=" + enc(q) + (page > 1 ? "&page=" + page : ""), CUEVANA_SEARCH_BASES[bi] + "/");
        pp = nextDataProps(html);
        if (!pp) continue;
        list = [].concat(pp.movies || []).concat(pp.series || pp.tvs || []);
        for (i = 0; i < list.length && out.length < MAX_ITEMS; i++) {
            x = list[i];
            if (!x) continue;
            id = String(x.TMDbId || x.tmdbId || x.tmdb_id || "");
            if (!id) continue;
            title = (x.titles && (x.titles.name || x.titles.title)) || x.name || x.title || "";
            poster = (x.images && (x.images.poster || x.images.backdrop)) || x.poster || "";
            urlSlug = (x.url && x.url.slug) || (x.slug && (x.slug.name || x.slug)) || "";
            kind = /series?\//i.test(String(urlSlug)) || /\/tv\//i.test(String(urlSlug)) || (pp.series && pp.series.indexOf(x) >= 0) ? "tv" : "movie";
            if (/series|tv/i.test(String(urlSlug))) kind = "tv";
            if (/movies?\//i.test(String(urlSlug))) kind = "movie";
            out.push({
                id: id, kind: kind, title: clean(title), poster: poster,
                date: "", source: "Cuevana3"
            });
        }
        if (out.length) log("Streamflix-search Cuevana " + CUEVANA_SEARCH_BASES[bi] + " -> " + out.length);
    }
    return out;
}

/* Poseidon home trending via Next (catalogo nativo del proveedor) */
function poseidonHomeNative(page) {
    var out = [], html = httpGet(POSEIDON_BASE + "/", POSEIDON_BASE + "/"), pp = nextDataProps(html), list, i, x, id, title, poster;
    if (!pp) return out;
    list = [].concat(pp.movies || []).concat(pp.series || []).concat(pp.topMoviesDay || []).concat(pp.topMoviesWeek || []);
    for (i = 0; i < list.length && out.length < MAX_ITEMS; i++) {
        x = list[i];
        if (!x) continue;
        id = String(x.TMDbId || x.tmdbId || x.tmdb || x.id || "");
        if (!id || !/^\d+$/.test(id)) continue;
        title = (x.titles && (x.titles.name || x.titles.title)) || x.name || x.title || "";
        poster = (x.images && x.images.poster) || (x.poster_path ? img(x.poster_path) : "") || x.poster || "";
        out.push({ id: id, kind: (x.media_type == "tv" || x.type == "tv") ? "tv" : "movie", title: clean(title), poster: poster, date: "", source: "PoseidonHD" });
    }
    return out;
}

/* Fusiona resultados de varios proveedores: 1 portada por TMDbId (como Streamflix unificado) */
function mergeProviderResults(groups) {
    var seen = {}, out = [], g, i, x, key;
    for (g = 0; g < groups.length; g++) {
        for (i = 0; i < (groups[g] || []).length; i++) {
            x = groups[g][i];
            if (!x || !x.id) continue;
            key = (x.kind || "movie") + ":" + x.id;
            if (seen[key]) {
                if (x.source && seen[key].sources.indexOf(x.source) < 0) seen[key].sources.push(x.source);
                continue;
            }
            seen[key] = x;
            x.sources = x.source ? [x.source] : [];
            out.push(x);
        }
    }
    return out;
}

function catalogFromMerged(list) {
    var out = [], i, x, name;
    for (i = 0; i < list.length && out.length < MAX_ITEMS; i++) {
        x = list[i];
        name = (x.title || "Sin titulo");
        if (x.sources && x.sources.length) name = name; /* una sola portada; dominios van al reproducir */
        out.push(catalogVideo({
            id: x.id, kind: x.kind || "movie", title: x.title,
            poster: x.poster || "", date: x.date || ""
        }));
    }
    return out;
}

function searchPage(q, page) {
    /* Catalogo = solo TMDB (como Streamflix: el ID es la verdad).
       1 portada por id. Los streams se resuelven luego por ese mismo ID. */
    page = page || 1;
    var out = [], data, i, it, media, kind, title, year, poster, id, seen = {};
    data = tmdbGet("/search/multi?query=" + enc(q) + "&page=" + page + "&include_adult=false", "es-AR")
        || tmdbGet("/search/multi?query=" + enc(q) + "&page=" + page + "&include_adult=false", "en-US");
    if (data && data.results) {
        for (i = 0; i < data.results.length && out.length < MAX_ITEMS; i++) {
            it = data.results[i];
            media = it.media_type;
            if (media != "movie" && media != "tv") continue;
            id = String(it.id || "");
            if (!id || seen[media + ":" + id]) continue;
            seen[media + ":" + id] = 1;
            kind = media == "tv" ? "tv" : "movie";
            title = it.title || it.name || "";
            year = yearOf(it.release_date || it.first_air_date);
            poster = img(it.poster_path);
            out.push(new PlatformVideo({
                id: new PlatformID(PLATFORM, kind + "_" + id, PID),
                name: title + (year ? " (" + year + ")" : "") + (kind == "tv" ? " · Serie" : ""),
                thumbnails: thumb(poster),
                author: tmdbAuthor(),
                uploadDate: unixOf(it.release_date || it.first_air_date),
                viewCount: 0, duration: 0, isLive: false,
                url: kind == "tv" ? makeShowUrl(id) : makeMovieUrl(id)
            }));
        }
    }
    log("search TMDB '" + q + "' p" + page + " -> " + out.length + " (por ID, sin duplicados)");
    return { results: out, hasMore: !!(data && data.page < data.total_pages) };
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

/* junta las variantes de titulo "oficiales" que da TMDB (titulos alternativos /
   AKAs por pais) para alimentar las busquedas en los sitios y el buscador de
   PelisJuanita. Esto es lo que realmente saca el "margen de error por idioma o
   nombrado distinto": en vez de adivinar un slug a partir de UN titulo, se prueban
   todas las formas en que el catalogo (TMDB) sabe que esa pelicula/serie es
   conocida en paises de habla hispana. */
var ALT_TITLE_COUNTRIES = { "ES": 1, "MX": 1, "AR": 1, "CO": 1, "CL": 1, "PE": 1, "VE": 1, "US": 1 };
function ctxFromTmdb(p, es, en, altData, extIds, base) {
    var ctx = {
        kind: p.kind, id: p.id, season: p.season || 1, episode: p.episode || 1,
        titleEs: (es && (es.title || es.name)) || "", titleEn: (en && (en.title || en.name)) || "",
        titleOrig: (base.original_title || base.original_name) || "",
        year: yearOf(base.release_date || base.first_air_date),
        imdbId: (extIds && extIds.imdb_id) || ""
    };
    ctx.altTitles = extractAltTitles(altData, [ctx.titleEs, ctx.titleEn, ctx.titleOrig]);
    ctx.titles = uniq([normalizeTitle(ctx.titleEs), normalizeTitle(ctx.titleEn), normalizeTitle(ctx.titleOrig)].concat(
        (function () { var o = [], i; for (i = 0; i < ctx.altTitles.length; i++) o.push(normalizeTitle(ctx.altTitles[i])); return o; })()
    ));
    return ctx;
}
function extractAltTitles(altData, baseTitles) {
    var arr = (altData && (altData.titles || altData.results)) || [], out = [], i, seen = {};
    for (i = 0; i < baseTitles.length; i++) seen[normalizeTitle(baseTitles[i])] = 1;
    for (i = 0; i < arr.length && out.length < 4; i++) {
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
    /* es-AR + en-US + alternative_titles + external_ids en UNA sola tanda paralela
       en vez de 2 a 4 pedidos secuenciales -> menos latencia antes de empezar
       siquiera a buscar en los proveedores */
    var tmdbReqs = [
        { path: path, lang: "es-AR" },
        { path: path, lang: "en-US" },
        { path: path + "/alternative_titles", lang: "en-US" },
        { path: path + "/external_ids", lang: "en-US" }
    ];
    /* la temporada viaja en la misma tanda (luego tmdbGet la toma de cache) */
    if (isTv) tmdbReqs.push({ path: path + "/season/" + (p.season || 1), lang: "es-AR" });
    var batch = tmdbGetBatch(tmdbReqs);
    var es = batch[0], en = batch[1], altData = batch[2], extIds = batch[3];
    var base = es || en;
    if (!base) return errorDetails(url, "TMDB no respondi\u00f3");

    var ctx = ctxFromTmdb(p, es, en, altData, extIds, base);
    var poster = img(base.poster_path), title = ctx.titleEs || ctx.titleEn || "Sin t\u00edtulo";
    log("TMDB ID=" + ctx.id + " es='" + ctx.titleEs + "' en='" + ctx.titleEn + "' year=" + ctx.year + (ctx.imdbId ? " imdb=" + ctx.imdbId : "") + (isTv ? " S" + ctx.season + "E" + ctx.episode : ""));
    if (ctx.altTitles.length) log("TMDB AKAs usados para busqueda: " + ctx.altTitles.join(" | "));

    var epName = "", epOverview = "", epDate = 0, runtime = 0;
    if (isTv) {
        var sd = tmdbGet("/tv/" + p.id + "/season/" + ctx.season, "es-AR"), i;
        if (sd && sd.episodes) for (i = 0; i < sd.episodes.length; i++) {
            if (sd.episodes[i].episode_number == ctx.episode) { epName = sd.episodes[i].name || ""; epOverview = sd.episodes[i].overview || ""; epDate = unixOf(sd.episodes[i].air_date); runtime = (sd.episodes[i].runtime || 0) * 60; }
        }
        if (!epName) {
            /* TMDB no siempre tiene el nombre del episodio traducido al espanol */
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
    var domainsLine = _foundDomains && _foundDomains.length
        ? ("\nDominios con este VOD: " + _foundDomains.join(" · "))
        : "";
    var desc = (isTv && epOverview ? epOverview : (base.overview || ""))
        + "\n\nServidores: " + sources.length
        + (sources.length ? " (mejor primero; si falla pasa al siguiente)" : " (no se encontr\u00f3 ninguna reproducible)")
        + domainsLine;
    if (debugMode() && _debug) {
        var lines = String(_debug).split("\n"), tail = lines.slice(Math.max(0, lines.length - 40)).join("\n");
        desc += "\n\n=== DEBUG ===\n" + tail;
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
        video: new VideoSourceDescriptor(sources)
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
        /* Todos los episodios de la serie (todas las temporadas), para que se pueda
           saltar a cualquiera desde "Recomendados/Siguientes". El actual va al final
           de su temporada para no repetirlo primero. */
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
            var extras = extraSites();
            var warm = [
                tmdbUrl("/search/multi?query=" + enc(q) + "&page=1&include_adult=false"),
                "https://wv3.cuevana3.eu/search?q=" + enc(q)
            ];
            if (extras && q) {
                warm.push(JUANITA_BASE + "/movies/search?s=" + enc(q));
                warm.push(JUANITA_BASE + "/series/search?s=" + enc(q));
            }
            prefetchUrls(warm);
            var r = searchPage(q, 1), jk = [], ju = [], lc = [], tio = [], lat = [];
            /* Busqueda: solo TMDB (IDs). Anime/cartoon condicional. Anime/cartoon solo si parece anime/dibujo
               o extraSites (La Cartoons es caro: pide muchas fichas). */
            var ql = normalizeTitle(q);
            var wantAnime = /anime|naruto|one piece|dragon ball|bleach|jujutsu|kimetsu|shingeki|boruto|hunter|pokemon|digimon|sailormoon|sailor moon/.test(ql);
            var wantCartoon = /simpson|simpsons|cartoon|padres de familia|family guy|futurama|south park|bob esponja|spongebob|american dad|king of the hill|phineas|gravity falls/.test(ql);
            if (wantAnime || extras) {
                try { jk = jkSearch(q); } catch (e2) { jk = []; }
                try { tio = tioSearch(q); } catch (e4) { log("tioSearch -> " + e4); tio = []; }
                try { lat = latSearch(q); } catch (e6) { log("latSearch -> " + e6); lat = []; }
            }
            if (wantCartoon || extras) {
                try { lc = lcSearch(q); } catch (e5) { log("lcSearch -> " + e5); lc = []; }
            }
            if (extras) {
                try { ju = juanitaSearch(q); } catch (e3) { log("juanitaSearch -> " + e3); ju = []; }
            }
            var first = r.results.concat(tio).concat(lat).concat(jk).concat(lc).concat(ju);
            /* traduccion solo si TMDB no trajo nada (no se paga en el camino bueno) */
            if (!r.results.length && q) {
                var tq = translateEs2En(q);
                if (tq && normalizeTitle(tq) != normalizeTitle(q)) {
                    var r2 = searchPage(tq, 1);
                    if (r2.results.length) { first = first.concat(r2.results); r = r2; }
                }
            }
            return makePager(first, r.hasMore, function (pg) { return searchPage(q, pg); });
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
        return !!(x && ((x.origin == "tmdb" && x.p.kind == "show") || (x.origin == "juanita" && x.p.kind == "show")));
    };
    source.getChannel = function (u) {
        var x = parseAny(u);
        if (x && x.origin == "juanita") return juanitaShowChannel(u);
        return channelOf(u);
    };
    source.getChannelCapabilities = function () { return { types: [FEED_MIXED], sorts: [ORDER_CHRONO], filters: [] }; };
    source.getChannelContents = function (u, type, order, filters) {
        try {
            var x = parseAny(u);
            if (x && x.origin == "juanita") return juanitaShowContents(u);
            return channelContents(u);
        } catch (e) { return new VideoPager([], false, {}); }
    };

    source.isContentDetailsUrl = function (u) {
        var x = parseAny(u);
        if (!x) return false;
        if (x.origin == "tmdb") return x.p.kind == "movie" || x.p.kind == "tv";
        return x.origin == "jk" || x.origin == "juanita" || x.origin == "lc" || x.origin == "tio" || x.origin == "lat";
    };
    source.getContentDetails = function (u) {
        try {
            var x = parseAny(u);
            if (!x) return errorDetails(u, "URL desconocida");
            if (x.origin == "jk") return jkDetails(u);
            if (x.origin == "juanita") return juanitaDetails(u);
            if (x.origin == "lc") return lcDetails(u);
            if (x.origin == "tio") return tioDetails(u);
            if (x.origin == "lat") return latDetails(u);
            return details(u);
        } catch (e) { log("DETAIL " + e); return errorDetails(u, String(e)); }
    };
    source.getContentRecommendations = function (u) {
        try {
            var x = parseAny(u);
            if (x && x.origin == "jk") return new VideoPager(jkRecommendations(u), false, {});
            if (x && x.origin == "juanita") return new VideoPager(juanitaRecommendations(u), false, {});
            if (x && x.origin == "lc") return new VideoPager(lcRecommendations(u), false, {});
            if (x && x.origin == "tio") return new VideoPager(tioRecommendations(u), false, {});
            if (x && x.origin == "lat") return new VideoPager(latRecommendations(u), false, {});
            return new VideoPager(recommendations(u), false, {});
        } catch (e) { return new VideoPager([], false, {}); }
    };
}
