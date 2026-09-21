/*
 * PelisHub v1 - GrayJay source (ES5)
 *
 * Unifica lo aprendido de PlayPelis, EpixPlay y FilmPlus:
 *  - Catalogo: TMDB (Home / Busqueda no dependen de webs externas).
 *  - Fuentes por TMDB (sin buscar por titulo en la web):
 *      PelisJuanita  -> movieInfo.php?title=<slug>  /  serieInfo.php?nombreSerie=<slug>&nroTemporada=&nroEpisodio=
 *      Cuevana3.eu   -> /ver-pelicula/<slug>  /  /episodio/<slug>-temporada-S-episodio-E  (+ busqueda como plan B)
 *  - Fuentes por busqueda en sitios WordPress/DooPlay/Toroflix (dominios de FilmPlus y PlayPelis):
 *      pelisplushd, pelishouse, cinetux, pelispedia, pelisxd, allpeliculas, repelis, rexpelis, ...
 *  - Extractores de embeds: voe, uqload, streamtape, dood, plusvip, esplay, fastream, ok.ru,
 *    y un extractor generico con desempaquetador P.A.C.K.E.R. (streamwish, filemoon, mixdrop, supervideo, vidhide...).
 *  - Series: cada serie tiene un "canal" con sus temporadas/episodios.
 *
 * Todo lo que se prueba/resuelve queda anotado en la descripcion (=== DEBUG ===).
 */

var PLATFORM = "PelisHub";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e34";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "pelishub://";

var TMDB_KEY = "26c168179ae6b5445f36aca260e00d48";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_IMG = "https://image.tmdb.org/t/p/w500";
var TMDB_STILL = "https://image.tmdb.org/t/p/w300";
var TMDB_BACK = "https://image.tmdb.org/t/p/w780";

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

var MAX_ITEMS = 60;
var MAX_HTML = 2500000;
var MAX_CAND = 8;          /* embeds a resolver por proveedor */
var WANT_SOURCES = 4;      /* con esto se corta la busqueda (salvo modo "sitios extra") */
var BUDGET_MS = 50000;     /* tiempo maximo por pelicula/episodio */

var _settings = {};
var _debug = "";
var _fail = {};
var _okh = {};
var _deadline = 0;

function log(s) { _debug += String(s) + "\n"; }
function resetDebug() { _debug = ""; }
function budgetLeft() { return Date.now() < _deadline; }
function startBudget() { _deadline = Date.now() + BUDGET_MS; }
function extraSites() { var v = _settings && _settings.extraSites; return v === true || v === "true" || v === 1 || v === "1"; }

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
function markFail(h) { _fail[h] = (_fail[h] || 0) + 1; }
function hostDead(h) { return (_fail[h] || 0) >= 2 && !_okh[h]; }

function httpGet(url, referer, extra) {
    var h = hostOf(url), r, b;
    if (!h) return "";
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
    var out = [], i;
    try {
        if (typeof http.batch == "function" && urls.length > 1 && budgetLeft()) {
            var b = http.batch();
            for (i = 0; i < urls.length; i++) b = b.GET(urls[i], hdr(referer || (originOf(urls[i]) + "/")), false);
            var res = b.execute();
            for (i = 0; i < urls.length; i++) {
                var body = readBody(res[i]);
                if (body) _okh[hostOf(urls[i])] = 1;
                out.push(body && body.length > MAX_HTML ? body.substring(0, MAX_HTML) : body);
            }
            return out;
        }
    } catch (e) { log("batch -> " + e); out = []; }
    for (i = 0; i < urls.length; i++) out.push(httpGet(urls[i], referer));
    return out;
}
function parseJson(t) { try { return JSON.parse(t); } catch (e) { return null; } }

/* ------------------------------------------------------------------ */
/* TMDB                                                                */
/* ------------------------------------------------------------------ */

function tmdbGet(path, lang) {
    var u = TMDB_API + path + (path.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + enc(TMDB_KEY) + "&language=" + (lang || "es-AR");
    try {
        var r = http.GET(u, { "User-Agent": UA, "Accept": "application/json" }, false), b = readBody(r);
        return b ? JSON.parse(b) : null;
    } catch (e) { log("TMDB " + path + " -> " + e); return null; }
}
function img(p, base) { return p ? (base || TMDB_IMG) + p : ""; }
function yearOf(s) { var m = /^(\d{4})/.exec(String(s || "")); return m ? m[1] : ""; }
function unixOf(s) { if (!s) return 0; var t = new Date(String(s)).getTime(); return isNaN(t) ? 0 : Math.floor(t / 1000); }

function makeMovieUrl(id) { return SCHEME + "movie/" + id; }
function makeTvUrl(id, s, e) { return SCHEME + "tv/" + id + "/" + s + "/" + e; }
function makeShowUrl(id) { return SCHEME + "show/" + id; }
function parseInternal(url) {
    var s = String(url || ""), m = s.match(/^pelishub:\/\/movie\/(\d+)$/);
    if (m) return { kind: "movie", id: m[1] };
    m = s.match(/^pelishub:\/\/tv\/(\d+)\/(\d+)\/(\d+)$/);
    if (m) return { kind: "tv", id: m[1], season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
    m = s.match(/^pelishub:\/\/show\/(\d+)$/);
    if (m) return { kind: "show", id: m[1] };
    return null;
}

/* ------------------------------------------------------------------ */
/* fuentes de video                                                    */
/* ------------------------------------------------------------------ */

function mkSrc(u, label, ref) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var rm = ref ? { headers: { "Referer": ref, "User-Agent": UA } } : null, o;
    if (/\.m3u8(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=m3u8/i.test(u)) {
        o = { name: label || "HLS", url: u, duration: 0 };
        if (rm) o.requestModifier = rm;
        return new HLSSource(o);
    }
    if (/\.mp4(?:[?#]|$)/i.test(u)) {
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
function scanMedia(text, label, ref, pageUrl) {
    var out = [], texts = [String(text || "")], i, m, s, re, base = originOf(pageUrl);
    var un = unpackAll(text);
    for (i = 0; i < un.length; i++) texts.push(un[i]);
    for (i = 0; i < texts.length; i++) {
        var t = texts[i].replace(/\\\//g, "/").replace(/\\u0026/g, "&").replace(/\\u002F/gi, "/");
        re = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi;
        while ((m = re.exec(t)) != null) addSrc(out, mkSrc(m[0], label, ref));
        re = /["']?(?:file|src|source|hls\d*|url|link|stream|playlist)["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi;
        while ((m = re.exec(t)) != null) {
            var v = m[1];
            if (v.charAt(0) == "/" && v.charAt(1) != "/" && base) v = base + v;
            else if (v.indexOf("//") === 0) v = "https:" + v;
            s = mkSrc(v, label, ref);
            if (s) addSrc(out, s);
        }
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
    "vimeos", "streamhub", "embedwish", "callistanise", "dhcplay", "minochinos", "lulustream", "luluvdo", "vtube", "vidguard", "bigwarp", "player.cuevana3"];
var UNSUPPORTED = ["waaw.", "netu.", "hqq.", "younetu.", "hqtv.", "biribup.", "cuevana3.download"];

function hostMatches(h, list) {
    var i;
    for (i = 0; i < list.length; i++) if (h.indexOf(list[i]) >= 0) return true;
    return false;
}
function isServerUrl(u) { return hostMatches(hostOf(u), SERVER_HOSTS); }

/* --- extractores especificos (portados de PlayPelis) --- */
function exVoe(url, label, ref) {
    var h = httpGet(url, ref), m, re = /['"](hls|mp4)['"]\s*:\s*['"]([^'"]+)['"]/gi, out = [];
    while ((m = re.exec(h || "")) != null) {
        var v = m[2];
        if (!/^https?:/i.test(v)) { var d = b64decode(v); if (/^https?:/i.test(d)) v = d; }
        addSrc(out, mkSrc(v, label, url));
    }
    if (!out.length && h) { var g = scanMedia(h, label, url, url), i; for (i = 0; i < g.length; i++) addSrc(out, g[i]); }
    return out;
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
function exOkRu(url, label) {
    var id = (String(url).match(/(?:videoembed|video)\/(\d+)/) || [])[1];
    if (!id) return [];
    var h = httpGet("https://ok.ru/videoembed/" + id, "https://ok.ru/"), out = [];
    if (!h) return out;
    var t = h.replace(/&quot;/g, '"').replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\"/g, '"'), m;
    m = /"hlsManifestUrl"\s*:\s*"([^"]+)"/i.exec(t);
    if (m) addSrc(out, mkSrc(m[1], (label || "OK.ru") + " HLS", "https://ok.ru/"));
    if (!out.length) { m = /"ondemandHls"\s*:\s*"([^"]+)"/i.exec(t); if (m) addSrc(out, mkSrc(m[1], (label || "OK.ru") + " HLS", "https://ok.ru/")); }
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
    if (out.length || depth >= 3) return out;
    links = discoverLinks(h, url);
    for (i = 0; i < links.length && budgetLeft() && out.length < 6; i++) {
        var more = resolveEmbed(links[i], label, url, depth + 1), j;
        for (j = 0; j < more.length; j++) addSrc(out, more[j]);
    }
    return out;
}

/* punto de entrada para cualquier URL de embed */
function resolveEmbed(url, label, ref, depth) {
    depth = depth || 0;
    url = cleanUrl(url);
    if (!/^https?:\/\//i.test(url) || depth > 3 || !budgetLeft()) return [];
    var h = hostOf(url), d;
    d = mkSrc(url, label, ref);
    if (d) return [d];
    if (hostMatches(h, UNSUPPORTED)) { log("  sin soporte: " + h); return []; }
    if (h.indexOf("voe.") >= 0) return exVoe(url, label, ref);
    if (h.indexOf("uqload.") >= 0) return exUqload(url, label);
    if (h.indexOf("streamtape.") >= 0 || /(?:^|\.)tape\./.test(h)) return exStreamTape(url, label);
    if (h.indexOf("dood") >= 0 || /d[o]{3,}d/.test(h)) return exDood(url, label);
    if (h.indexOf("plusvip.") >= 0) return exPlusVip(url, label);
    if (h.indexOf("esplay.") >= 0) return exEsplay(url, label);
    if (h.indexOf("fastream.") >= 0) return exFastream(url, label);
    if (h == "ok.ru" || h.indexOf(".ok.ru") >= 0 || h.indexOf("okru.link") >= 0) return exOkRu(url, label);
    return exGeneric(url, label, ref, depth);
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
                s = r >= 0.6 ? 60 + r * 30 : 0;
            }
            if (s > best) best = s;
        }
    }
    if (!best) return 0;
    if (c.type != "unknown" && c.type != ctx.kind) best -= 40;
    if (c.year && ctx.year) {
        var d = Math.abs(parseInt(c.year, 10) - parseInt(ctx.year, 10));
        best += d === 0 ? 12 : (d === 1 ? 4 : -25);
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

function resolveCands(cands, out, prov) {
    var seen = {}, list = [], i, c;
    for (i = 0; i < cands.length; i++) {
        c = cands[i];
        var k = c.srcs ? "srcs" + i : c.url;
        if (!k || seen[k]) continue;
        seen[k] = 1; list.push(c);
    }
    list.sort(function (a, b) { return langRank(a.lang) - langRank(b.lang); });
    var n = 0;
    for (i = 0; i < list.length && n < MAX_CAND && budgetLeft(); i++) {
        c = list[i];
        var label = (c.lang ? c.lang + " \u00b7 " : "") + prov + " \u00b7 " + (c.url ? prettyHost(c.url) : "directo"), got = [], j;
        if (c.srcs) {
            for (j = 0; j < c.srcs.length; j++) { c.srcs[j].name = label; got.push(c.srcs[j]); }
        } else {
            got = resolveEmbed(c.url, label, c.ref || (originOf(c.url) + "/"), 0);
        }
        n++;
        log("  " + label + " [" + (c.url || "").substring(0, 70) + "] -> " + got.length);
        for (j = 0; j < got.length; j++) { got[j].name = got[j].name && got[j].name.indexOf(prov) >= 0 ? got[j].name : label; addSrc(out, got[j]); }
    }
}

/* ------------------------------------------------------------------ */
/* PelisJuanita (por TMDB, sin busqueda)                               */
/* ------------------------------------------------------------------ */

function parseJuanita(html, base) {
    var out = [], tags = findTags(html, /row-download/i), i;
    for (i = 0; i < tags.length; i++) {
        var a = attrsOf(tags[i].tag);
        if ((a["data-tipo"] || "").toLowerCase() != "stream") continue;
        var u = a["data-url"];
        if (!u) continue;
        if (!/^https?:|^\/\//i.test(u)) { var d = b64decode(u); if (/^https?:\/\//i.test(d)) u = d; }
        var lang = langOf(a["data-idioma"] || "") || langOf(strip(html.substring(tags[i].end, tags[i].end + 250)));
        out.push(mkCand(absUrl(u, base), lang, base + "/", "Juanita"));
    }
    return out;
}
function provJuanita(ctx) {
    var base = "https://pelisjuanita.com", slugs = [], urls = [], i, raw = [ctx.titleEn, ctx.titleEs, ctx.titleOrig];
    for (i = 0; i < raw.length; i++) { var s = slugJuanita(raw[i]); if (s) { slugs.push(s); slugs.push(trimDash(s)); } }
    slugs = uniq(slugs).slice(0, 4);
    for (i = 0; i < slugs.length; i++) {
        urls.push(ctx.kind == "movie" ? base + "/movies/movieInfo.php?title=" + slugs[i]
            : base + "/series/serieInfo.php?nombreSerie=" + slugs[i] + "&nroTemporada=" + ctx.season + "&nroEpisodio=" + ctx.episode);
    }
    var bodies = batchGet(urls, base + "/");
    for (i = 0; i < bodies.length; i++) {
        var items = parseJuanita(bodies[i], base);
        if (items.length) { log("  slug OK: " + slugs[i]); return items; }
    }
    log("  slugs probados: " + slugs.join(", "));
    return [];
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
function provCuevana(ctx) {
    var bases = ["https://www.cuevana3.eu", "https://cuevana3.ai", "https://cuevana3.me", "https://cuevana3.cc"], bi, i;
    for (bi = 0; bi < bases.length && budgetLeft(); bi++) {
        var base = bases[bi], slugs = uniq([slugCuevana(ctx.titleEs), slugCuevana(ctx.titleEn)]), urls = [], reached = false;
        for (i = 0; i < slugs.length; i++) {
            urls.push(ctx.kind == "movie" ? base + "/ver-pelicula/" + slugs[i] : base + "/episodio/" + slugs[i] + "-temporada-" + ctx.season + "-episodio-" + ctx.episode);
        }
        var bodies = batchGet(urls, base + "/"), html = "", pageUrl = "";
        for (i = 0; i < bodies.length; i++) {
            if (bodies[i]) reached = true;
            if (bodies[i] && /data-tr=|data-link=|data-server=/i.test(bodies[i])) { html = bodies[i]; pageUrl = urls[i]; break; }
        }
        if (!html && budgetLeft()) {
            var sh = httpGet(base + "/search?q=" + enc(ctx.titleEs), base + "/");
            if (sh) {
                reached = true;
                var best = pickBest(findLinks(sh, base, ctx.kind), ctx);
                if (best) {
                    pageUrl = best.url;
                    if (ctx.kind == "tv") {
                        var slug = String(best.url).split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop();
                        pageUrl = base + "/episodio/" + slug + "-temporada-" + ctx.season + "-episodio-" + ctx.episode;
                    }
                    html = httpGet(pageUrl, base + "/");
                }
            }
        }
        if (html) {
            var items = parseCuevana(html, base);
            log("  " + pageUrl.substring(0, 100) + " -> " + items.length + " players");
            if (items.length) return items;
        }
        if (reached) break;
    }
    return [];
}

/* ------------------------------------------------------------------ */
/* sitios WordPress / DooPlay / Toroflix (dominios de FilmPlus/PlayPelis) */
/* ------------------------------------------------------------------ */

var SITES = [
    { id: "pelisplus", name: "PelisPlus", bases: ["https://pelisplushd.bz", "https://pelisplushd.nu", "https://pelisplusgo.vip"], search: ["/search?s={q}", "/search/{q}/1"], mode: "pelisplus" },
    { id: "pelishouse", name: "PelisHouse", bases: ["https://pelishouse.com"], search: ["/?s={q}"], mode: "wp" },
    { id: "cinetux", name: "Cinetux", bases: ["https://www.cinetux.nu"], search: ["/?s={q}"], mode: "wp" },
    { id: "pelispedia", name: "Pelispedia", bases: ["https://www.pelispedia.mobi"], search: ["/?s={q}"], mode: "wp" },
    { id: "pelisxd", name: "PelisXD", bases: ["https://www.pelisxd.com"], search: ["/?s={q}"], mode: "wp" },
    { id: "allpeliculas", name: "AllPeliculas", bases: ["https://allpeliculas.mx"], search: ["/?s={q}"], mode: "wp" },
    { id: "repelis", name: "Repelis", bases: ["https://repelis.red", "https://repelis.io"], search: ["/?s={q}"], mode: "wp" },
    /* extras (Ajustes > sitios extra) */
    { id: "pelisplay", name: "PelisPlay", bases: ["https://www.pelisplay.co"], search: ["/search?s={q}", "/?s={q}"], mode: "wp", extra: true },
    { id: "gnula", name: "Gnula", bases: ["https://gnula.uno"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "entrepeliculas", name: "EntrePeliculas", bases: ["https://entrepeliculasyseries.nz"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "smartpelis", name: "SmartPelis", bases: ["https://smartpelis.tv", "https://smartpeli.tv"], search: ["/page/1/?s={q}", "/?s={q}"], mode: "wp", extra: true },
    { id: "pelisplus2", name: "PelisPlus2", bases: ["https://pelisplus2.ai"], search: ["/search/{q}"], mode: "wp", extra: true }
];

function siteFind(site, ctx) {
    var qs = uniq([ctx.titleEs, ctx.titleEn]).slice(0, 2), bi, qi, pi;
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
/* orquestador                                                         */
/* ------------------------------------------------------------------ */

function collectSources(ctx) {
    var out = [], plan = [], i;
    plan.push({ n: "PelisJuanita", f: provJuanita });
    plan.push({ n: "Cuevana3", f: provCuevana });
    function mk(site) { return { n: site.name, f: function () { return provSite(site, ctx); } }; }
    for (i = 0; i < SITES.length; i++) { if (!SITES[i].extra || extraSites()) plan.push(mk(SITES[i])); }
    for (i = 0; i < plan.length; i++) {
        if (!budgetLeft()) { log("Tiempo agotado antes de " + plan[i].n); break; }
        if (out.length >= WANT_SOURCES && !extraSites()) { log("Suficientes fuentes (" + out.length + "), no se buscan mas sitios"); break; }
        log("> " + plan[i].n);
        try {
            var c = plan[i].f(ctx);
            resolveCands(c, out, plan[i].n);
        } catch (e) { log("  ERROR " + e); }
    }
    var idx = [];
    for (i = 0; i < out.length; i++) idx.push({ s: out[i], i: i, r: langRank(String(out[i].name || "").split(" \u00b7 ")[0]) });
    idx.sort(function (a, b) { return a.r != b.r ? a.r - b.r : a.i - b.i; });
    out = [];
    for (i = 0; i < idx.length; i++) out.push(idx[i].s);
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
    /* x: {id, kind, title, poster} */
    var isTv = x.kind == "tv";
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, (isTv ? "tv_" : "movie_") + x.id, PID),
        name: (x.title || "Sin t\u00edtulo") + (isTv ? " (Serie)" : ""),
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
    var d = tmdbGet("/trending/all/week?page=" + page), res = d && d.results ? d.results : [], extra = [];
    if (page == 1) {
        var m = tmdbGet("/movie/popular?page=1"), t = tmdbGet("/tv/popular?page=1");
        extra = withKind(m && m.results, "movie").concat(withKind(t && t.results, "tv"));
    }
    return { results: mapTmdbList(res.concat(extra)), hasMore: !!(d && d.total_pages && page < Math.min(d.total_pages, 10)) };
}
function searchPage(q, page) {
    var d = tmdbGet("/search/multi?query=" + enc(q) + "&page=" + page + "&include_adult=false");
    return { results: mapTmdbList(d && d.results ? d.results : []), hasMore: !!(d && d.total_pages && page < Math.min(d.total_pages, 10)) };
}

/* ------------------------------------------------------------------ */
/* detalles                                                            */
/* ------------------------------------------------------------------ */

function errorDetails(url, msg) {
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "error", PID), name: "PelisHub: " + msg, thumbnails: new Thumbnails([]), author: tmdbAuthor(),
        uploadDate: 0, viewCount: 0, isLive: false, url: String(url || ""), video: new VideoSourceDescriptor([]),
        description: msg + "\n\n=== DEBUG ===\n" + _debug
    });
}

function details(url) {
    var p = parseInternal(url);
    if (!p || p.kind == "show") return null;
    resetDebug();
    startBudget();
    var isTv = p.kind == "tv", path = (isTv ? "/tv/" : "/movie/") + p.id;
    var es = tmdbGet(path, "es-AR"), en = tmdbGet(path, "en-US");
    var base = es || en;
    if (!base) return errorDetails(url, "TMDB no respondi\u00f3");

    var ctx = {
        kind: p.kind, id: p.id, season: p.season || 1, episode: p.episode || 1,
        titleEs: (es && (es.title || es.name)) || "", titleEn: (en && (en.title || en.name)) || "",
        titleOrig: (base.original_title || base.original_name) || "",
        year: yearOf(base.release_date || base.first_air_date)
    };
    ctx.titles = uniq([normalizeTitle(ctx.titleEs), normalizeTitle(ctx.titleEn), normalizeTitle(ctx.titleOrig)]);
    var poster = img(base.poster_path), title = ctx.titleEs || ctx.titleEn || "Sin t\u00edtulo";
    log("TMDB: es='" + ctx.titleEs + "' en='" + ctx.titleEn + "' year=" + ctx.year + (isTv ? " S" + ctx.season + "E" + ctx.episode : ""));

    var epName = "", epOverview = "", epDate = 0, runtime = 0;
    if (isTv) {
        var sd = tmdbGet("/tv/" + p.id + "/season/" + ctx.season, "es-AR"), i;
        if (sd && sd.episodes) for (i = 0; i < sd.episodes.length; i++) {
            if (sd.episodes[i].episode_number == ctx.episode) { epName = sd.episodes[i].name || ""; epOverview = sd.episodes[i].overview || ""; epDate = unixOf(sd.episodes[i].air_date); runtime = (sd.episodes[i].runtime || 0) * 60; }
        }
    } else runtime = (base.runtime || 0) * 60;

    var sources = collectSources(ctx);
    log("TOTAL fuentes: " + sources.length);

    var name = isTv ? (title + " \u00b7 S" + ctx.season + "E" + ctx.episode + (epName ? " \u00b7 " + epName : "")) : (title + (ctx.year ? " (" + ctx.year + ")" : ""));
    var desc = (isTv && epOverview ? epOverview : (base.overview || "")) + "\n\nFuentes: " + sources.length + (sources.length ? "" : " (no se encontr\u00f3 ninguna reproducible)") + "\n\n=== DEBUG ===\n" + _debug;
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
    var p = parseInternal(url), out = [], i;
    if (!p) return [];
    if (p.kind == "tv") {
        var d = getShow(p.id), name = d ? d.name : "Serie", poster = d ? img(d.poster_path) : "";
        var sd = tmdbGet("/tv/" + p.id + "/season/" + p.season, "es-AR");
        if (sd && sd.episodes) for (i = 0; i < sd.episodes.length; i++) if (sd.episodes[i].episode_number > p.episode) out.push(episodeVideo(p.id, name, poster, p.season, sd.episodes[i]));
        return out.slice(0, 20);
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
    source.enable = function (conf, settings, savedState) { _settings = settings || {}; _fail = {}; _okh = {}; };
    source.setSettings = function (s) { _settings = s || {}; };
    source.saveState = function () { return ""; };
    source.getHome = function () {
        try { var r = homePage(1); return makePager(r.results, r.hasMore, function (pg) { return homePage(pg); }); }
        catch (e) { return new VideoPager([], false, {}); }
    };
    source.searchSuggestions = function (q) { return []; };
    source.getSearchCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.search = function (q, type, order, filters) {
        try { var r = searchPage(q || "", 1); return makePager(r.results, r.hasMore, function (pg) { return searchPage(q || "", pg); }); }
        catch (e) { return new VideoPager([], false, {}); }
    };
    source.getSearchChannelContentsCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.searchChannels = function (q) { return new ChannelPager([], false, {}); };

    source.isChannelUrl = function (u) { return /^pelishub:\/\/show\/\d+$/.test(String(u || "")); };
    source.getChannel = function (u) { return channelOf(u); };
    source.getChannelCapabilities = function () { return { types: [FEED_MIXED], sorts: [ORDER_CHRONO], filters: [] }; };
    source.getChannelContents = function (u, type, order, filters) {
        try { return channelContents(u); } catch (e) { return new VideoPager([], false, {}); }
    };

    source.isContentDetailsUrl = function (u) { return /^pelishub:\/\/(?:movie\/\d+|tv\/\d+\/\d+\/\d+)$/.test(String(u || "")); };
    source.getContentDetails = function (u) {
        try { return details(u); }
        catch (e) { log("DETAIL " + e); return errorDetails(u, String(e)); }
    };
    source.getContentRecommendations = function (u) {
        try { return new VideoPager(recommendations(u), false, {}); }
        catch (e) { return new VideoPager([], false, {}); }
    };
}
