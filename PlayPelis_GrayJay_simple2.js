/*
 * PelisHub v1 - GrayJay Source Unificado
 * Combina la velocidad de extractor de simple2, la cobertura de v4
 * y la API de Google Apps Script para PelisJuanita con fallback nativo.
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
var MAX_CAND = 5;          /* embeds a resolver por proveedor */
var BUDGET_MS = 50000;     /* tiempo maximo por pelicula/episodio */
var FAST_STOP_ON_SOURCE = true; /* detener el scraping al hallar fuente funcional */

var PLPRO_BASE = "https://plpro.org";
var PLPRO_USER = "p";
var PLPRO_PASS = "p";

var _settings = {};
var _debug = "";
var _fail = {};        
var _okh = {};
var FAIL_EXPIRE_MS = 20000;   
var _deadline = 0;
var _pre = {};          

function log(s) { _debug += String(s) + "\n"; }
function resetDebug() { _debug = ""; }
function budgetLeft() { return Date.now() < _deadline; }
function startBudget() { _deadline = Date.now() + BUDGET_MS; }
function extraSites() { var v = _settings && _settings.extraSites; return v === true || v === "true" || v === 1 || v === "1"; }
function debugMode() { var v = _settings && _settings.debugMode; return v === true || v === "true" || v === 1 || v === "1"; }

/* ------------------------------------------------------------------ */
/* Utilidades de texto                                                */
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
    "online": 1, "gratis": 1, "completa": 1, "pelicula": 1, "peliculas": 1, "serie": 1, "series": 1, "capitulo": 1, "temporada": 1 };

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
function findTags(html, test) {
    var out = [], re = /<[a-zA-Z][^>]*>/g, m, t;
    while ((m = re.exec(html || "")) != null) {
        t = m[0];
        if (test.test(t)) { out.push({ tag: t, index: m.index, end: re.lastIndex }); if (out.length >= 300) break; }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                               */
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
/* TMDB                                                               */
/* ------------------------------------------------------------------ */

function tmdbUrl(path, lang) {
    return TMDB_API + path + (path.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + enc(TMDB_KEY) + "&language=" + (lang || "es-AR");
}
function tmdbGet(path, lang) {
    try {
        var r = http.GET(tmdbUrl(path, lang), { "User-Agent": UA, "Accept": "application/json" }, false), b = readBody(r);
        return b ? JSON.parse(b) : null;
    } catch (e) { log("TMDB " + path + " -> " + e); return null; }
}
function tmdbGetBatch(reqs) {
    var i, out = [];
    try {
        if (typeof http.batch == "function" && reqs.length > 1) {
            var b = http.batch();
            for (i = 0; i < reqs.length; i++) b = b.GET(tmdbUrl(reqs[i].path, reqs[i].lang), { "User-Agent": UA, "Accept": "application/json" }, false);
            var res = b.execute();
            for (i = 0; i < reqs.length; i++) { var body = readBody(res[i]); out.push(body ? parseJson(body) : null); }
            return out;
        }
    } catch (e) { log("TMDB batch -> " + e); out = []; }
    for (i = 0; i < reqs.length; i++) out.push(tmdbGet(reqs[i].path, reqs[i].lang));
    return out;
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
/* Extractor Rápido Unificado HLS / MP4                               */
/* ------------------------------------------------------------------ */

var FAST_QUALITY = {
    "2160": 2160, "4k": 2160, "uhd": 2160,
    "1440": 1440, "2k": 1440,
    "1080": 1080, "fullhd": 1080, "full-hd": 1080,
    "720": 720, "hd": 720,
    "576": 576, "sd": 576,
    "480": 480, "360": 360, "240": 240, "144": 144
};

function fastQualityFromText(s) {
    s = String(s || "").toLowerCase();
    var m = /(2160|1440|1080|720|576|480|360|240|144)p\b/.exec(s);
    if (m) return parseInt(m[1], 10);
    var keys = Object.keys(FAST_QUALITY), i;
    for (i = 0; i < keys.length; i++) if (new RegExp("(?:^|[^a-z0-9])" + keys[i] + "(?:[^a-z0-9]|$)", "i").test(s)) return FAST_QUALITY[keys[i]];
    return 0;
}
function fastSourceType(u, hint) {
    u = String(u || ""); hint = String(hint || "");
    if (/\.m3u8(?:[?#]|$)/i.test(u) || /(?:^|[?&/_.-])(?:hls|m3u8|master|playlist)(?:[?&/_.-]|$)/i.test(u) || /\b(?:hls|m3u8)\b/i.test(hint)) return "hls";
    if (/\.(?:mp4|m4v)(?:[?#]|$)/i.test(u)) return "mp4";
    if (/\.(?:webm)(?:[?#]|$)/i.test(u)) return "webm";
    return "";
}
function fastHeaders(ref) {
    if (!ref) return null;
    var o = originOf(ref), h = { "User-Agent": UA };
    if (ref) h["Referer"] = ref;
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
function mkFastSrc(u, label, ref, force, quality) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var type = force || fastSourceType(u, label), q = quality || fastQualityFromText(label + " " + u), rm = fastHeaders(ref), o;
    if (type == "hls") {
        o = { name: label || (q ? q + "p HLS" : "HLS"), url: u, duration: 0 };
        if (rm) o.requestModifier = rm;
        return new HLSSource(o);
    }
    if (type == "mp4" || type == "webm") {
        var ext = type == "webm" ? "video/webm" : "video/mp4";
        o = { width: q ? Math.round(q * 16 / 9) : 0, height: q || 0, container: ext, codec: "", name: label || (q ? q + "p" : "MP4"), bitrate: q >= 1080 ? 5000000 : (q >= 720 ? 2500000 : 0), duration: 0, url: u };
        if (rm) o.requestModifier = rm;
        return new VideoUrlSource(o);
    }
    return null;
}
function mkSrc(u, label, ref, force) { return mkFastSrc(u, label, ref, force); }
function addSrc(arr, s) {
    if (!s || !s.url) return;
    for (var i = 0; i < arr.length; i++) if (arr[i].url == s.url) return;
    arr.push(s);
}

/* --- Desempaquetador Dean Edwards (p.a.c.k.e.r) --- */
function unpackOne(p, a, c, k) {
    function e(n) { return (n < a ? "" : e(parseInt(n / a, 10))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36)); }
    var d = {}; p = p.replace(/\\(['\\])/g, "$1");
    while (c--) d[e(c)] = k[c] || e(c);
    return p.replace(/\b\w+\b/g, function (w) { return d.hasOwnProperty(w) ? d[w] : w; });
}
function unpackAll(text) {
    var out = [], re = /eval\(function\(p,a,c,k,e,(?:d|r)\)[\s\S]*?\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g, m;
    while ((m = re.exec(String(text || ""))) != null) {
        try { out.push(unpackOne(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4].split("|"))); } catch (e) {}
        if (out.length >= 4) break;
    }
    return out;
}

function scanMedia(text, label, ref, pageUrl) {
    var out = [], texts = [String(text || "")], i, m, s, re, base = originOf(pageUrl);
    var un = unpackAll(text);
    for (i = 0; i < un.length; i++) texts.push(un[i]);

    for (i = 0; i < texts.length; i++) {
        var t = texts[i].replace(/\\\//g, "/").replace(/\\u0026/g, "&").replace(/\\u002F/gi, "/");
        re = /https?:\/\/[^\s"'<>\\]+?(?:\.m3u8|\.mp4|\.m4v|\.webm)(?:\?[^\s"'<>\\]*)?/gi;
        while ((m = re.exec(t)) != null) addSrc(out, mkFastSrc(m[0], label, ref));

        re = /["'](?:file|src|source|hls\d*|url|link|stream|playlist|manifest|fileUrl|videoUrl)["']\s*[:=]\s*["']([^"']+)["']/gi;
        while ((m = re.exec(t)) != null) {
            var v = m[1];
            if (v.charAt(0) == "/" && v.charAt(1) != "/" && base) v = base + v;
            else if (v.indexOf("//") === 0) v = "https:" + v;
            s = mkFastSrc(v, label, ref);
            if (s) addSrc(out, s);
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Hosts y Extractores de Embeds                                      */
/* ------------------------------------------------------------------ */

var SERVER_HOSTS = ["streamsb.net", "streamsss.net", "ssbstream.net", "watchsb.com", "sbanh.com", "sbfast.com", "sbplay.one", "sbplay.org", "sbplay2.com", "sbfull.com", "lvturbo.com",
    "dood.", "doodstream.", "dooood.", "uqload.", "voe.sx", "streamtape.", "upstream.to", "streamlare.", "plusvip.net", "sololatino.net", "zplayer.live", "fastream.to", "vidcloud9.org",
    "okru.link", "ok.ru", "moonplayer.", "esplay.", "mycdn.moe", "acek-cdn.com", "dramiyos-cdn.com", "solo-latino.com",
    "streamwish", "hlswish", "wishembed", "awish", "vidhide", "filelions", "filemoon", "mixdrop", "mxdrop", "supervideo", "xupalace", "nuuuppp", "playhubconnect", "saidochesto",
    "vimeos", "vidhide", "callistanise", "hgcloud.", "vimeo.com", "vk.com", "vkvideo.ru", "odnoklassniki", "streamhub", "embedwish", "callistanise", "dhcplay", "minochinos", "lulustream", "luluvdo", "vtube", "vidguard", "bigwarp", "player.cuevana3", "vimeus.", "goodstream."];
var UNSUPPORTED = ["waaw.", "netu.", "hqq.", "younetu.", "hqtv.", "biribup.", "cuevana3.download", "1fichier."];

function hostMatches(h, list) {
    for (var i = 0; i < list.length; i++) if (h.indexOf(list[i]) >= 0) return true;
    return false;
}
function isServerUrl(u) { return hostMatches(hostOf(u), SERVER_HOSTS); }

function htmlUnescape(s) {
    return String(s || "").replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, function (c) { var b = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
}
function reverseStr(s) { return String(s).split("").reverse().join(""); }

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
    if (!m) return scanMedia(h, label, ref, pageUrl);
    if (m[2]) {
        var js = httpGet(absUrl(m[2], pageUrl), pageUrl), lm = /(\[(?:'\W{2}'[,\]]){1,9})/.exec(js || "");
        if (lm) { var arr = lm[1].slice(2, -2).split("','"); if (arr.length) luts.push(arr); }
    }
    luts.push(VOE_LUT);
    for (i = 0; i < luts.length; i++) {
        var o = null;
        try { o = voeDecodeWith(m[1], luts[i]); } catch (e) {}
        if (o) {
            out = srcsFromVoeJson(o, label, ref);
            if (out.length) return out;
        }
    }
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
        h = httpGet(cur, url);
        tries++;
    }
    return [];
}
function exVidhide(url, label, ref) {
    var u = String(url || "");
    if (u.indexOf("vidhidefast.com") >= 0) u = u.replace("vidhidefast.com", "callistanise.com");
    else if (u.indexOf("vidhide.com") >= 0 && u.indexOf("callistanise") < 0) u = u.replace("vidhide.com", "callistanise.com");
    var base = "https://" + hostOf(u) + "/", html = httpGet(u, ref || base);
    if (!html || html.length < 500) return [];
    var splitIdx = html.lastIndexOf(".split('|')");
    if (splitIdx < 0) return [];
    var keyEnd = html.lastIndexOf("'", splitIdx), keyStart = html.lastIndexOf("'", keyEnd - 1) + 1;
    var keyArr = html.substring(keyStart, keyEnd).split("|");
    if (keyArr.length < 50) return [];
    function decode(s) {
        return s.replace(/[a-z0-9]+/g, function (tok) {
            var v = parseInt(tok, 36);
            return (!isNaN(v) && v > 0 && v < keyArr.length && keyArr[v] && keyArr[v].length > 1) ? keyArr[v] : tok;
        });
    }
    var cands = html.match(/["'][a-z0-9]+:\/\/[^"']+["']/gi) || [], out = [], i, best = "";
    for (i = 0; i < cands.length; i++) {
        var decStr = cleanUrl(decode(cands[i].substring(1, cands[i].length - 1)));
        if (decStr.indexOf("master.") >= 0 && decStr.indexOf(".m3u8") >= 0) { best = decStr; break; }
        if (!best && decStr.indexOf("master.") >= 0 && decStr.indexOf(".txt") >= 0) best = decStr;
    }
    if (!best) return [];
    if (/\.txt(?:[?#]|$)/i.test(best)) {
        var txt = httpGet(best, base), m = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i.exec(txt || "");
        best = m ? cleanUrl(m[0]) : "";
    }
    if (best) addSrc(out, mkSrc(best, label, base, "hls"));
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
    return s ? [s] : [];
}
function exOkRu(url, label, ref) {
    var id = (String(url).match(/(?:videoembed|video|live)\/(\d+)/) || String(url).match(/[?&](?:id|mid)=(\d+)/) || [])[1];
    if (!id) return [];
    var R = "https://ok.ru/", out = [], h = httpGet("https://ok.ru/videoembed/" + id, R);
    if (!h) h = httpGet("https://ok.ru/video/" + id, R);
    if (!h) return out;
    var m = /data-options\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(h), meta = null, o, fv;
    if (m) {
        o = parseJson(htmlUnescape(m[1] != null ? m[1] : m[2]));
        fv = o && o.flashvars;
        if (fv) {
            meta = fv.metadata;
            if (typeof meta == "string") meta = parseJson(meta);
            if (!meta && (fv.metadataUrl || fv.metadataURL)) {
                var mu = fv.metadataUrl || fv.metadataURL;
                meta = parseJson(httpGet(mu, R)) || parseJson(httpPost(mu, "", R));
            }
        }
    }
    if (!meta) {
        var t = htmlUnescape(h).replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\"/g, '"');
        var mm = /"hlsManifestUrl"\s*:\s*"([^"]+)"/i.exec(t);
        if (mm) addSrc(out, mkFastSrc(mm[1], label + " HLS", R, "hls"));
        return out;
    }
    var hls = meta.hlsManifestUrl || meta.hlsMasterPlaylistUrl || meta.ondemandHls || "";
    if (hls) addSrc(out, mkFastSrc(hls, label + " HLS", R, "hls"));
    var vids = Array.isArray(meta.videos) ? meta.videos.slice(0) : [];
    vids.sort(function (a, b) { return fastQualityFromText((b && (b.name || b.type || b.quality)) || "") - fastQualityFromText((a && (a.name || a.type || a.quality)) || ""); });
    for (var i = 0; i < vids.length; i++) if (vids[i] && vids[i].url) {
        var q = fastQualityFromText(vids[i].name || vids[i].type || vids[i].quality || vids[i].url);
        addSrc(out, mkFastSrc(vids[i].url, label + " " + (q ? q + "p" : (vids[i].name || "MP4")), R, "mp4", q));
    }
    return out;
}

function discoverLinks(html, pageUrl) {
    var out = [], re, u, i, tags;
    function add(x) {
        x = cleanUrl(x); if (!x) return;
        x = absUrl(x, pageUrl);
        if (/^https?:\/\//i.test(x) && x != pageUrl && out.indexOf(x) < 0 && out.length < 12) out.push(x);
    }
    tags = findTags(html, /^<iframe\b/i);
    for (i = 0; i < tags.length; i++) { var a = attrsOf(tags[i].tag); add(a["data-src"] || a["src"] || ""); }
    re = /data-(?:video|link|url|tr|server|embed-url)=["']([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) {
        u = m[1];
        if (!/^https?:|^\//.test(u)) { var d = b64decode(u.split("?v=")[1] || u); if (/^https?:\/\//i.test(d)) u = d; }
        add(u);
    }
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

function resolveEmbed(url, label, ref, depth) {
    depth = depth || 0; url = cleanUrl(url);
    if (!/^https?:\/\//i.test(url) || depth > 3 || !budgetLeft()) return [];
    var h = hostOf(url), d = mkSrc(url, label, ref);
    if (d) return [d];
    if (hostMatches(h, UNSUPPORTED)) return [];
    if (h.indexOf("vidhide") >= 0 || h.indexOf("callistanise") >= 0 || h.indexOf("hgcloud.") >= 0) return exVidhide(url, label, ref);
    if (h.indexOf("voe.") >= 0) return exVoe(url, label, ref);
    if (h.indexOf("uqload.") >= 0) return exUqload(url, label);
    if (h.indexOf("streamtape.") >= 0 || /(?:^|\.)tape\./.test(h)) return exStreamTape(url, label);
    if (h.indexOf("dood") >= 0 || /d[o]{3,}d/.test(h)) return exDood(url, label);
    if (h == "ok.ru" || h.indexOf(".ok.ru") >= 0 || h.indexOf("odnoklassniki") >= 0) return exOkRu(url, label, ref);
    return exGeneric(url, label, ref, depth);
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
    var pre = [], pn = Math.min(list.length, MAX_CAND);
    for (i = 0; i < pn; i++) { if (list[i].url) pre.push(list[i].url); }
    prefetchUrls(pre);
    var n = 0, good = 0;
    for (i = 0; i < list.length && n < MAX_CAND && budgetLeft(); i++) {
        c = list[i];
        var label = (c.lang ? c.lang + " \u00b7 " : "") + prov + " \u00b7 " + (c.url ? prettyHost(c.url) : "directo"), got = [], j;
        if (c.srcs) {
            for (j = 0; j < c.srcs.length; j++) { c.srcs[j].name = label; got.push(c.srcs[j]); }
        } else {
            got = resolveEmbed(c.url, label, c.ref || (originOf(c.url) + "/"), 0);
        }
        n++;
        var before = out.length;
        for (j = 0; j < got.length; j++) { got[j].name = got[j].name && got[j].name.indexOf(prov) >= 0 ? got[j].name : label; addSrc(out, got[j]); }
        if (out.length > before) {
            good++;
            if (FAST_STOP_ON_SOURCE) break;
        }
    }
    return good;
}

/* ------------------------------------------------------------------ */
/* PelisJuanita (GAS API + Fallback Nativo)                          */
/* ------------------------------------------------------------------ */

function juanitaSlugCandidates(ctx) {
    var raw = uniq([ctx.titleEn, ctx.titleEs, ctx.titleOrig].concat(ctx.altTitles || [])), out = [], i, s;
    for (i = 0; i < raw.length; i++) {
        s = trimDash(slugJuanita(raw[i]));
        if (!s) continue;
        if (ctx.year) out.push(s + "-" + ctx.year);
        out.push(s);
    }
    return uniq(out).slice(0, 8);
}

function parseJuanita(html, base) {
    var out = [], tags = findTags(html, /row-download/i), i;
    for (i = 0; i < tags.length; i++) {
        var a = attrsOf(tags[i].tag);
        var tipo = (a["data-tipo"] || "").toLowerCase();
        if (tipo == "torrent" || tipo == "magnet") continue;
        var u = a["data-url"];
        if (!u) continue;
        if (!/^https?:|^\/\//i.test(u)) { var d = b64decode(u); if (/^https?:\/\//i.test(d)) u = d; }
        var lang = langOf(a["data-idioma"] || "") || langOf(strip(html.substring(tags[i].end, tags[i].end + 250)));
        out.push(mkCand(absUrl(u, base), lang, base + "/", "Juanita"));
    }
    return out;
}

function juanitaSearchCandidates(json, kind) {
    var arr = Array.isArray(json) ? json : (json ? json.results || json.data || json.movies || json.series || json.items : null);
    if (!arr || !arr.length) return [];
    var out = [], i;
    for (i = 0; i < arr.length && i < 20; i++) {
        var x = arr[i]; if (!x) continue;
        var title = x.title || x.name || x.titulo || x.nombre || "";
        var slug = x.slug || x.url_slug || x.titleSlug || (title ? slugJuanita(title) : "");
        if (!slug) continue;
        var yr = x.year || x.anio || yearOf(x.release_date || x.fecha || "");
        out.push({ url: "juanita:" + slug, titles: [title, slugWords(slug)], type: kind, year: yr ? String(yr) : "", slug: slug });
    }
    return out;
}

/* Paso 1: Intentar API de Google Apps Script */
function provJuanitaGAS(ctx) {
    var base = "https://pelisjuanita.com";
    var slugs = juanitaSlugCandidates(ctx).slice(0, 4);
    if (!slugs.length) return [];

    var workerUrl = "https://script.google.com/macros/s/AKfycbwl5G52UH8jFQXjl95YiFYZY1DygYoh9CERzJYX9jI3-siivWuqBYEdlMb8JFif9Nk9/exec";
    var urls = [], i;
    for (i = 0; i < slugs.length; i++) {
        urls.push(workerUrl + "?type=" + (ctx.kind == "movie" ? "movie" : "tv") + 
                  "&slug=" + enc(slugs[i]) + 
                  "&season=" + (ctx.season || 1) + 
                  "&episode=" + (ctx.episode || 1));
    }

    log("  Consultando GAS Juanita API...");
    var bodies = batchGet(urls, "");
    var out = [];

    for (i = 0; i < bodies.length; i++) {
        var json = parseJson(bodies[i]);
        if (json && json.success && json.sources && json.sources.length) {
            for (var j = 0; j < json.sources.length; j++) {
                var src = json.sources[j];
                out.push(mkCand(src.url, src.lang, base + "/", src.prov || "Juanita-GAS"));
            }
            log("  Éxito en GAS con slug: " + slugs[i]);
            return out;
        }
    }
    return [];
}

/* Paso 2: Scraping Nativo Directo si GAS no encuentra nada */
function provJuanitaNative(ctx) {
    var base = "https://pelisjuanita.com", slugs = juanitaSlugCandidates(ctx), urls = [], i;
    for (i = 0; i < slugs.length; i++) {
        urls.push(ctx.kind == "movie" ? base + "/movies/movieInfo.php?title=" + slugs[i]
            : base + "/series/serieInfo.php?nombreSerie=" + slugs[i] + "&nroTemporada=" + ctx.season + "&nroEpisodio=" + ctx.episode);
    }
    var verSerieIdx = -1;
    if (ctx.kind == "tv" && slugs.length) { verSerieIdx = urls.length; urls.push(base + "/series/ver-serie/" + slugs[0]); }
    var bodies = batchGet(urls, base + "/");

    var hits = [];
    for (i = 0; i < bodies.length; i++) {
        if (i == verSerieIdx) continue;
        var items = parseJuanita(bodies[i], base);
        if (items.length) hits.push({ slug: slugs[i], items: items });
    }
    if (hits.length) {
        var vUrls = [], j;
        for (j = 0; j < hits.length; j++) vUrls.push(ctx.kind == "movie" ? base + "/movies/pelicula/" + hits[j].slug : base + "/series/ver-serie/" + hits[j].slug);
        var vBodies = batchGet(vUrls, base + "/");
        for (j = 0; j < hits.length; j++) {
            var v = verifyPageTitle(vBodies[j], ctx);
            if (v.ok === false) continue;
            log("  Juanita Nativo Slug OK: " + hits[j].slug);
            return hits[j].items;
        }
    }

    /* Buscador interno como Plan B de Juanita */
    if (budgetLeft()) {
        var qEndpoint = ctx.kind == "movie" ? "/movies/search?s=" : "/series/search?s=";
        var queries = uniq([ctx.titleEs, ctx.titleEn].concat(ctx.altTitles || [])).slice(0, 3), qi;
        for (qi = 0; qi < queries.length && budgetLeft(); qi++) {
            var sj = parseJson(httpGet(base + qEndpoint + enc(queries[qi]), base + "/"));
            if (!sj) continue;
            var cands = juanitaSearchCandidates(sj, ctx.kind);
            var best = pickBest(cands, ctx);
            if (!best) continue;
            var finalUrl = ctx.kind == "movie" ? base + "/movies/movieInfo.php?title=" + best.slug
                : base + "/series/serieInfo.php?nombreSerie=" + best.slug + "&nroTemporada=" + ctx.season + "&nroEpisodio=" + ctx.episode;
            var fh = httpGet(finalUrl, base + "/"), fi = parseJuanita(fh, base);
            if (fi.length) return fi;
        }
    }
    return [];
}

/* Orquestador de PelisJuanita */
function provJuanita(ctx) {
    var cands = provJuanitaGAS(ctx);
    if (cands && cands.length) return cands;
    log("  GAS API sin resultados. Pasando a scraping nativo de Juanita...");
    return provJuanitaNative(ctx);
}

/* ------------------------------------------------------------------ */
/* Cuevana3 & Otros Sitios de Respaldo                                */
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
    var bases = ["https://www.cuevana3.eu", "https://cuevana3.ai", "https://cuevana3.me"], bi, i;
    for (bi = 0; bi < bases.length && budgetLeft(); bi++) {
        var base = bases[bi], baseSlugs = uniq([slugCuevana(ctx.titleEs), slugCuevana(ctx.titleEn)]), slugs = [];
        for (i = 0; i < baseSlugs.length; i++) { if (ctx.year) slugs.push(baseSlugs[i] + "-" + ctx.year); slugs.push(baseSlugs[i]); }
        slugs = uniq(slugs);
        var urls = [];
        for (i = 0; i < slugs.length; i++) urls.push(ctx.kind == "movie" ? base + "/ver-pelicula/" + slugs[i] : base + "/episodio/" + slugs[i] + "-temporada-" + ctx.season + "-episodio-" + ctx.episode);
        var bodies = batchGet(urls, base + "/"), html = "", pageUrl = "";
        for (i = 0; i < bodies.length; i++) {
            if (bodies[i] && /data-tr=|data-link=|data-server=/i.test(bodies[i])) {
                var v = verifyPageTitle(bodies[i], ctx);
                if (v.ok !== false) { html = bodies[i]; pageUrl = urls[i]; break; }
            }
        }
        if (html) {
            var items = parseCuevana(html, base);
            if (items.length) return items;
        }
    }
    return [];
}

/* ------------------------------------------------------------------ */
/* Orquestador General                                                */
/* ------------------------------------------------------------------ */

function collectSources(ctx) {
    var out = [], plan = [], i, servers = 0;

    plan.push({ n: "PelisJuanita", f: provJuanita });
    plan.push({ n: "Cuevana3", f: provCuevana });

    for (i = 0; i < plan.length; i++) {
        if (!budgetLeft()) break;
        if (out.length > 0 && FAST_STOP_ON_SOURCE) {
            log("FAST: fuente encontrada en " + plan[i - 1].n + ", se detiene el scraping adicional");
            break;
        }

        log("> " + plan[i].n);
        try {
            var c = plan[i].f(ctx);
            if (c && c.length) {
                var before = out.length;
                servers += resolveCands(c, out, plan[i].n);
                if (out.length > before) log("  FAST: " + plan[i].n + " entregó " + (out.length - before) + " fuente(s)");
            }
        } catch (e) { log("  ERROR " + e); }
    }

    var idx = [];
    for (i = 0; i < out.length; i++) idx.push({ s: out[i], i: i, r: langRank(String(out[i].name || "").split(" · ")[0]) });
    idx.sort(function (a, b) { return a.r != b.r ? a.r - b.r : a.i - b.i; });
    out = [];
    for (i = 0; i < idx.length; i++) out.push(idx[i].s);
    return out;
}

/* ------------------------------------------------------------------ */
/* Objetos e Interfaz GrayJay                                         */
/* ------------------------------------------------------------------ */

function thumb(u) { return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]); }
function tmdbAuthor() { return new PlatformAuthorLink(PPID, "PelisHub", "https://www.themoviedb.org", "", 0); }
function showAuthor(id, name, poster) {
    return new PlatformAuthorLink(new PlatformID(PLATFORM, "show_" + id, PID), name || "Serie", makeShowUrl(id), poster || "", 0);
}
function catalogVideo(x) {
    var isTv = x.kind == "tv", yr = yearOf(x.date);
    var name = (x.title || "Sin título") + (yr ? " (" + yr + ")" : "") + (isTv ? " · Serie" : "");
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, (isTv ? "tv_" : "movie_") + x.id, PID),
        name: name,
        thumbnails: thumb(x.poster),
        author: isTv ? showAuthor(x.id, x.title, x.poster) : tmdbAuthor(),
        uploadDate: unixOf(x.date), viewCount: 0, duration: 0, isLive: false,
        url: isTv ? makeTvUrl(x.id, 1, 1) : makeMovieUrl(x.id)
    });
}
function episodeVideo(showId, showName, poster, s, e) {
    var sn = s, num = e.episode_number;
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, "tv_" + showId + "_" + sn + "_" + num, PID),
        name: "S" + sn + "E" + num + " · " + (e.name || ("Episodio " + num)),
        thumbnails: thumb(e.still_path ? img(e.still_path, TMDB_STILL) : poster),
        author: showAuthor(showId, showName, poster),
        uploadDate: unixOf(e.air_date), viewCount: 0, duration: (e.runtime || 0) * 60, isLive: false,
        url: makeTvUrl(showId, sn, num)
    });
}
function mapTmdbList(list) {
    var out = [], seen = {}, i, x, kind;
    for (i = 0; i < (list || []).length && out.length < MAX_ITEMS; i++) {
        x = list[i]; if (!x) continue;
        kind = x.media_type == "tv" ? "tv" : (x.media_type == "movie" ? "movie" : "");
        if (!kind) continue;
        var key = kind + x.id; if (seen[key]) continue; seen[key] = 1;
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
        page++; var r;
        try { r = loadNext(page); } catch (e) { r = { results: [], hasMore: false }; }
        this.results = r.results || [];
        this.hasMore = !!r.hasMore;
        return this;
    };
    return pager;
}

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
    resetDebug(); startBudget();
    var isTv = p.kind == "tv", path = (isTv ? "/tv/" : "/movie/") + p.id;

    var batch = tmdbGetBatch([
        { path: path, lang: "es-AR" },
        { path: path, lang: "en-US" }
    ]);
    var es = batch[0], en = batch[1], base = es || en;
    if (!base) return errorDetails(url, "TMDB no respondió");

    var ctx = {
        kind: p.kind, id: p.id, season: p.season || 1, episode: p.episode || 1,
        titleEs: (es && (es.title || es.name)) || "", titleEn: (en && (en.title || en.name)) || "",
        titleOrig: (base.original_title || base.original_name) || "",
        year: yearOf(base.release_date || base.first_air_date)
    };
    ctx.titles = uniq([normalizeTitle(ctx.titleEs), normalizeTitle(ctx.titleEn), normalizeTitle(ctx.titleOrig)]);
    var poster = img(base.poster_path), title = ctx.titleEs || ctx.titleEn || "Sin título";
    log("TMDB: " + title + " (" + ctx.year + ")" + (isTv ? " S" + ctx.season + "E" + ctx.episode : ""));

    var sources = collectSources(ctx);
    log("TOTAL fuentes: " + sources.length);

    var name = isTv ? (title + " · S" + ctx.season + "E" + ctx.episode) : (title + (ctx.year ? " (" + ctx.year + ")" : ""));
    var desc = (base.overview || "") + "\n\nFuentes: " + sources.length;
    if (debugMode()) desc += "\n\n=== DEBUG ===\n" + _debug;

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, isTv ? ("tv_" + p.id + "_" + ctx.season + "_" + ctx.episode) : ("movie_" + p.id), PID),
        name: name, thumbnails: thumb(poster), author: isTv ? showAuthor(p.id, title, poster) : tmdbAuthor(),
        uploadDate: unixOf(base.release_date || base.first_air_date), duration: (base.runtime || 0) * 60,
        viewCount: 0, isLive: false, url: url, description: desc, video: new VideoSourceDescriptor(sources)
    });
}

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
        id: new PlatformID(PLATFORM, "show_" + p.id, PID), name: d.name || "Serie",
        thumbnail: img(d.poster_path), banner: img(d.backdrop_path, TMDB_BACK), subscribers: 0,
        description: (d.overview || "") + "\n\nTemporadas: " + (d.number_of_seasons || "?"), url: url, urlAlternatives: [url], links: {}
    });
}
function channelContents(url) {
    var p = parseInternal(url);
    if (!p || p.kind != "show") return new VideoPager([], false, {});
    var d = getShow(p.id), seasons = seasonList(d), name = d ? d.name : "Serie", poster = d ? img(d.poster_path) : "", idx = 0;
    var first = seasonEpisodes(p.id, name, poster, seasons[0]);
    return makePager(first, seasons.length > 1, function () {
        idx++; return { results: seasonEpisodes(p.id, name, poster, seasons[idx]), hasMore: idx + 1 < seasons.length };
    });
}
function recommendations(url) {
    var p = parseInternal(url);
    if (!p) return [];
    if (p.kind == "movie") {
        var r = tmdbGet("/movie/" + p.id + "/recommendations?page=1");
        return mapTmdbList(withKind(r && r.results, "movie")).slice(0, 20);
    }
    return [];
}

var FEED_MIXED = (typeof Type !== "undefined" && Type && Type.Feed && Type.Feed.Mixed) ? Type.Feed.Mixed : "MIXED";
var ORDER_CHRONO = (typeof Type !== "undefined" && Type && Type.Order && Type.Order.Chronological) ? Type.Order.Chronological : "CHRONOLOGICAL";

if (typeof source != "undefined") {
    source.enable = function (conf, settings, savedState) { _settings = settings || {}; _fail = {}; _okh = {}; _pre = {}; };
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
        try { return details(u); } catch (e) { return errorDetails(u, String(e)); }
    };
    source.getContentRecommendations = function (u) {
        try { return new VideoPager(recommendations(u), false, {}); } catch (e) { return new VideoPager([], false, {}); }
    };
}
