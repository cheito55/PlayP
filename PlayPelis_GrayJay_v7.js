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
var MAX_CAND = 16;         /* no cortar pronto: queremos alternativas reales */
var WANT_SERVERS = 999;     /* nunca detener la exploracion por cantidad de servidores */
var BUDGET_MS = 45000;     /* limite total; las busquedas independientes usan batch() */

var PLPRO_BASE = "https://plpro.org";
var PLPRO_USER = "p";
var PLPRO_PASS = "p";

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

function batchGet(reqs) {
    var out = [], i, b, r, h, q = [];
    if (!reqs || !reqs.length) return out;
    /* GrayJay Http.batch() ejecuta las solicitudes en paralelo. */
    try {
        var bb = http.batch();
        for (i = 0; i < reqs.length; i++) {
            if (!reqs[i] || !reqs[i].url) continue;
            bb.GET(reqs[i].url, hdr(reqs[i].referer || (originOf(reqs[i].url) + "/"), reqs[i].extra || {}), false);
        }
        r = bb.execute();
        for (i = 0; i < r.length; i++) {
            b = readBody(r[i]);
            if (b && b.length > MAX_HTML) b = b.substring(0, MAX_HTML);
            out.push({ body: b, response: r[i], url: reqs[i] ? reqs[i].url : "" });
            h = hostOf(reqs[i] ? reqs[i].url : "");
            if (b) _okh[h] = 1; else if (h) markFail(h);
        }
        return out;
    } catch (e) {
        log("batch no disponible/fallo: " + e + " -> fallback secuencial");
        for (i = 0; i < reqs.length && budgetLeft(); i++) {
            b = httpGet(reqs[i].url, reqs[i].referer, reqs[i].extra);
            out.push({ body: b, response: null, url: reqs[i].url });
        }
        return out;
    }
}

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
/* force = "hls" | "mp4": para URLs sin extension (ok.ru, vk, vimeo...) */
function mkSrc(u, label, ref, force) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var rm = reqMod(ref), o, type = force || "";
    if (!type) {
        if (/\.m3u8(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=m3u8/i.test(u)) type = "hls";
        else if (/\.mp4(?:[?#]|$)/i.test(u)) type = "mp4";
    }
    if (type == "hls") {
        o = { name: label || "HLS", url: u, duration: 0 };
        if (rm) o.requestModifier = rm;
        return new HLSSource(o);
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
function scanMedia(text, label, ref, pageUrl) {
    var out = [], texts = [String(text || "")], i, m, s, re, base = originOf(pageUrl);
    var un = unpackAll(text);
    for (i = 0; i < un.length; i++) texts.push(un[i]);
    for (i = 0; i < texts.length && out.length < 20; i++) {
        var t = htmlUnescape(texts[i]).replace(/\\\//g, "/").replace(/\\u0026/g, "&").replace(/\\u002F/gi, "/").replace(/&amp;/gi, "&");
        /* URLs directas: m3u8/mp4 y manifests que no llevan extension visible */
        re = /https?:\/\/[^\s"'<>\\]+/gi;
        while ((m = re.exec(t)) != null && out.length < 20) {
            var raw = cleanUrl(m[0]).replace(/[),;]+$/, "");
            if (/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(raw)) addSrc(out, mkSrc(raw, label, ref));
            else if (/(?:\/master(?:\.m3u8)?|\/playlist(?:\.m3u8)?|\/manifest(?:\.m3u8)?|[?&](?:file|url|src|stream|format|type)=.*(?:m3u8|mp4)|\.(?:m3u8|mp4)(?:\?|$))/i.test(raw)) {
                s = mkSrc(raw, label, ref, /mp4/i.test(raw) && !/m3u8/i.test(raw) ? "mp4" : "hls"); if (s) addSrc(out, s);
            }
        }
        re = /["']?(?:file|src|source|hls\d*|url|link|stream|playlist|manifest|contentUrl|videoUrl)["']?\s*[:=]\s*["']([^"']+)["']/gi;
        while ((m = re.exec(t)) != null && out.length < 20) {
            var v = m[1];
            if (v.charAt(0) == "/" && v.charAt(1) != "/" && base) v = base + v;
            else if (v.indexOf("//") === 0) v = "https:" + v;
            if (/^https?:\/\//i.test(v)) {
                var typ = /\.mp4(?:[?#]|$)/i.test(v) && !/m3u8/i.test(v) ? "mp4" : "hls";
                s = mkSrc(v, label, ref, typ); if (s) addSrc(out, s);
            }
        }
        /* JSON/JS con URL escapada dentro de comillas */
        re = /(?:https?:)?\/\/[^"'\s<>]+(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/gi;
        while ((m = re.exec(t)) != null && out.length < 20) {
            var q = m[0].indexOf("//") === 0 ? "https:" + m[0] : m[0];
            s = mkSrc(q, label, ref); if (s) addSrc(out, s);
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
    "vimeos", "vidhide", "callistanise", "vimeo.com", "vk.com", "vkvideo.ru", "odnoklassniki", "streamhub", "embedwish", "callistanise", "dhcplay", "minochinos", "lulustream", "luluvdo", "vtube", "vidguard", "bigwarp", "player.cuevana3"];
var UNSUPPORTED = ["waaw.", "netu.", "hqq.", "younetu.", "hqtv.", "biribup.", "cuevana3.download"];

function hostMatches(h, list) {
    var i;
    for (i = 0; i < list.length; i++) if (h.indexOf(list[i]) >= 0) return true;
    return false;
}
function isServerUrl(u) { return hostMatches(hostOf(u), SERVER_HOSTS); }

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
        if (!out.length) log("    voe: sin bloque cifrado (largo html=" + (h || "").length + ")");
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
    var u = String(url || "");
    if (u.indexOf("vidhidefast.com") >= 0) u = u.replace("vidhidefast.com", "callistanise.com");
    else if (u.indexOf("vidhide.com") >= 0 && u.indexOf("callistanise") < 0) u = u.replace("vidhide.com", "callistanise.com");
    var base = "https://" + hostOf(u) + "/", html = httpGet(u, ref || base);
    if (!html || html.length < 500) { log("    vidhide: html insuficiente (" + (html ? html.length : 0) + ")"); return []; }
    var splitIdx = html.lastIndexOf(".split('|')");
    if (splitIdx < 0) { log("    vidhide: no se encontr\u00f3 .split('|')"); return []; }
    var keyEnd = html.lastIndexOf("'", splitIdx), keyStart = html.lastIndexOf("'", keyEnd - 1) + 1;
    var keyArr = html.substring(keyStart, keyEnd).split("|");
    if (keyArr.length < 50) { log("    vidhide: array de claves corto (" + keyArr.length + ")"); return []; }
    function decode(s) {
        return s.replace(/[a-z0-9]+/g, function (tok) {
            var v = parseInt(tok, 36);
            return (!isNaN(v) && v > 0 && v < keyArr.length && keyArr[v] && keyArr[v].length > 1) ? keyArr[v] : tok;
        });
    }
    var cands = html.match(/["'][a-z0-9]+:\/\/[^"']+["']/gi) || [], out = [], i, best = "";
    for (i = 0; i < cands.length; i++) {
        var dec = cleanUrl(decode(cands[i].substring(1, cands[i].length - 1)));
        if (dec.indexOf("master.") >= 0 && dec.indexOf(".m3u8") >= 0) { best = dec; break; }
        if (!best && dec.indexOf("master.") >= 0 && dec.indexOf(".txt") >= 0) best = dec;
    }
    if (!best) { log("    vidhide: sin master.m3u8/.txt entre " + cands.length + " candidatos"); return []; }
    if (/\.txt(?:[?#]|$)/i.test(best)) {
        var txt = httpGet(best, base), m = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i.exec(txt || "");
        best = m ? cleanUrl(m[0]) : "";
    }
    if (best) addSrc(out, mkSrc(best, label, base, "hls"));
    log("    vidhide: " + (out.length ? "ok" : "no se pudo convertir la fuente"));
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
    re = /data-(?:video|link|url|tr|server|embed-url|player-url|src|file)=["']([^"']+)["']/gi;
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
    if (out.length || depth >= 2) return out;
    links = discoverLinks(h, url);
    for (i = 0; i < links.length && budgetLeft() && out.length < 8; i++) {
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
    if (h.indexOf("vidhide") >= 0 || h.indexOf("callistanise") >= 0) return exVidhide(url, label, ref);
    if (h.indexOf("voe.") >= 0) return exVoe(url, label, ref);
    if (/(?:^|\.)(?:vk\.com|vkvideo\.ru|vk\.ru)$/.test(h)) return exVk(url, label, ref);
    if (h.indexOf("vimeo.com") >= 0) return exVimeo(url, label, ref);
    if (h.indexOf("uqload.") >= 0) return exUqload(url, label);
    if (h.indexOf("streamtape.") >= 0 || /(?:^|\.)tape\./.test(h)) return exStreamTape(url, label);
    if (h.indexOf("dood") >= 0 || /d[o]{3,}d/.test(h)) return exDood(url, label);
    if (h.indexOf("plusvip.") >= 0) return exPlusVip(url, label);
    if (h.indexOf("esplay.") >= 0) return exEsplay(url, label);
    if (h.indexOf("fastream.") >= 0) return exFastream(url, label);
    if (h == "ok.ru" || h.indexOf(".ok.ru") >= 0 || h.indexOf("odnoklassniki") >= 0) return exOkRu(url, label, ref);
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
    var want = ctx.titles || [], best = 0, i, j;
    for (i = 0; i < c.titles.length; i++) {
        var t = normalizeTitle(c.titles[i]); if (!t) continue;
        var tw = t.split(" "), ts = {}; for (j = 0; j < tw.length; j++) if (tw[j].length > 2) ts[tw[j]] = 1;
        for (j = 0; j < want.length; j++) {
            var w = normalizeTitle(want[j]), score = 0; if (!w) continue;
            if (t == w) score = 100;
            else {
                var ww = w.split(" "), hit = 0, k;
                for (k = 0; k < ww.length; k++) if (ww[k].length > 2 && ts[ww[k]]) hit++;
                var ratio = ww.length ? hit / ww.length : 0;
                if (ratio >= 0.75) score = 72 + ratio * 18;
                else if (ratio >= 0.55) score = 55 + ratio * 20;
                else if (t.indexOf(w) >= 0 || w.indexOf(t) >= 0) score = 65;
            }
            if (score > best) best = score;
        }
    }
    if (!best) return 0;
    if (c.type != "unknown" && c.type != ctx.kind) best -= 45;
    if (c.year && ctx.year) {
        var d = Math.abs(parseInt(c.year, 10) - parseInt(ctx.year, 10));
        if (d === 0) best += 12; else if (d === 1) best += 3; else if (d > 2) best -= 18;
    }
    return best;
}
function pickBest(links, ctx) {
    var best = null, sc = 0, i;
    for (i = 0; i < links.length; i++) { var s = scoreLink(links[i], ctx); if (s > sc) { sc = s; best = links[i]; } }
    /* tolera traducciones/slug distintos y años ausentes; el tipo sigue pesando */
    var threshold = ctx.kind == "tv" ? 62 : 64;
    if (best && sc >= threshold) { log("  match " + sc + " -> " + best.url.substring(0, 100)); return best; }
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
        log("  " + label + " [" + (c.url || "").substring(0, 70) + "] -> " + got.length);
        var before = out.length;
        for (j = 0; j < got.length; j++) { got[j].name = got[j].name && got[j].name.indexOf(prov) >= 0 ? got[j].name : label; addSrc(out, got[j]); }
        if (out.length > before) good++;
    }
    return good;
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
    /* pagina "ver-serie" (la que da el usuario): puede traer el reproductor con otro
       marcado, distinto del fragmento AJAX de serieInfo.php */
    var verSerieIdx = -1;
    if (ctx.kind == "tv" && slugs.length) {
        verSerieIdx = urls.length;
        urls.push(base + "/series/ver-serie/" + slugs[0] + "/" + (ctx.season < 10 ? "0" : "") + ctx.season + "x" + (ctx.episode < 10 ? "0" : "") + ctx.episode);
        urls.push(base + "/series/ver-serie/" + slugs[0]);
    }
    var bodies = batchGet(urls, base + "/");
    for (i = 0; i < bodies.length; i++) {
        if (i == verSerieIdx) continue;
        var items = parseJuanita(bodies[i], base);
        if (items.length) { log("  slug OK: " + urls[i]); return items; }
    }
    if (verSerieIdx >= 0 && bodies[verSerieIdx]) {
        var vs = bodies[verSerieIdx], out = [], links = discoverLinks(vs, urls[verSerieIdx]), j;
        for (j = 0; j < links.length; j++) out.push(mkCand(links[j], "", base + "/", "Juanita"));
        var direct = scanMedia(vs, "", base + "/", base + "/"), k;
        for (k = 0; k < direct.length; k++) out.push({ url: "", lang: "", srcs: [direct[k]], prov: "Juanita" });
        if (out.length) { log("  ver-serie: " + out.length + " candidato(s) (marcado distinto de serieInfo.php)"); return out; }
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
    var fi, bi, i;
    for (fi = 0; fi < CUEVANA_FAMILIES.length && budgetLeft(); fi++) {
        var fam = CUEVANA_FAMILIES[fi];
        for (bi = 0; bi < fam.bases.length && budgetLeft(); bi++) {
            var base = fam.bases[bi], slugs = uniq([slugCuevana(ctx.titleEs), slugCuevana(ctx.titleEn)]), urls = [], reached = false;
            for (i = 0; i < slugs.length; i++) urls.push(ctx.kind == "movie" ? fam.movie(base, slugs[i]) : fam.episode(base, slugs[i], ctx.season, ctx.episode));
            var bodies = batchGet(urls, base + "/"), html = "", pageUrl = "";
            for (i = 0; i < bodies.length; i++) {
                if (bodies[i]) reached = true;
                if (bodies[i] && /data-tr=|data-link=|data-server=/i.test(bodies[i])) { html = bodies[i]; pageUrl = urls[i]; break; }
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
                /* variante sin data-tr visible (front-end distinto, ej. cuevana3e.pro):
                   usar la primera pagina alcanzada y dejar que el escaneo generico
                   busque iframes/medios sueltos en vez del parser especifico */
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

/* ------------------------------------------------------------------ */
/* sitios WordPress / DooPlay / Toroflix (dominios de FilmPlus/PlayPelis) */
/* ------------------------------------------------------------------ */

var SITES = [
    { id: "poseidonhd", name: "PoseidonHD", bases: ["https://www.poseidonhd2.co"], search: ["/?s={q}"], mode: "wp" }, /* prioridad alta: confirmado por el usuario con muy buena cobertura de TMDB */
    { id: "pelisplus", name: "PelisPlus", bases: ["https://pelisplushd.bz", "https://pelisplushd.nu", "https://pelisplusgo.vip"], search: ["/search?s={q}", "/search/{q}/1"], mode: "pelisplus" },
    { id: "pelishouse", name: "PelisHouse", bases: ["https://pelishouse.com"], search: ["/?s={q}"], mode: "wp" },
    { id: "cinetux", name: "Cinetux", bases: ["https://www.cinetux.nu"], search: ["/?s={q}"], mode: "wp" },
    { id: "pelispedia", name: "Pelispedia", bases: ["https://pelispedia.mov", "https://pelispedia.soy"], search: ["/?s={q}"], mode: "wp" },
    { id: "pelisxd", name: "PelisXD", bases: ["https://www.pelisxd.com"], search: ["/?s={q}"], mode: "wp" },
    { id: "allpeliculas", name: "AllPeliculas", bases: ["https://allpeliculas.mx", "https://allpeliculas.se"], search: ["/?s={q}"], mode: "wp" },
    { id: "repelis", name: "Repelis", bases: ["https://repelis.red", "https://repelis.io"], search: ["/?s={q}"], mode: "wp" },
    /* extras (Ajustes > sitios extra). Verificados con web_fetch al agregarlos (sep-2026);
       los que no pude verificar (bloqueados por bot-detection o robots.txt para mi
       herramienta, o de los que no tengo certeza del rubro) llevan nota. */
    { id: "pelisplay", name: "PelisPlay", bases: ["https://www.pelisplay.co"], search: ["/search?s={q}", "/?s={q}"], mode: "wp", extra: true },
    { id: "gnula", name: "Gnula", bases: ["https://gnula.uno"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "entrepeliculas", name: "EntrePeliculas", bases: ["https://entrepeliculasyseries.nz"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "smartpelis", name: "SmartPelis", bases: ["https://smartpelis.tv", "https://smartpeli.tv"], search: ["/page/1/?s={q}", "/?s={q}"], mode: "wp", extra: true },
    { id: "pelisplus2", name: "PelisPlus2", bases: ["https://pelisplus2.ai", "https://pelisplushd.lat", "https://pelisplus.to"], search: ["/search/{q}"], mode: "wp", extra: true },

    /* --- dominios que pasaste (sep-2026) --- */
    { id: "cuevana33", name: "Cuevana33", bases: ["https://cuevana33.plus"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelisplusnuevo", name: "PelisPlusNuevo", bases: ["https://pelisplusnuevo.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelisflix1", name: "Pelisflix1", bases: ["https://pelisflix1.fans", "https://pelisflix1.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "vien2pelis", name: "Vien2Pelis", bases: ["https://vien2pelis.net"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "cineplus123", name: "CinePlus123", bases: ["https://cineplus123.org"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelispop", name: "PelisPop", bases: ["https://pelispop.mov"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "peelink2", name: "Peelink2", bases: ["https://www.peelink2.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "verpeliculasultra", name: "VerPeliculasUltra", bases: ["https://verpeliculasultra.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelisenhd", name: "PelisEnHD", bases: ["https://pelisenhd.me"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "cinemitas", name: "Cinemitas", bases: ["https://cinemitas.org"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "cinecalidad", name: "Cinecalidad", bases: ["https://cinecalidad.onl"], search: ["/?s={q}"], mode: "wp", extra: true }, /* verificado: alive, WordPress */
    { id: "detodopeliculas", name: "DeTodoPeliculas", bases: ["https://detodopeliculas.nu"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "locopelis", name: "LocoPelis", bases: ["https://locopelis.lat"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelismax", name: "PelisMax", bases: ["https://pelismax.one"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "gnulahd", name: "GnulaHD", bases: ["https://gnulahd.org"], search: ["/?s={q}"], mode: "wp", extra: true }, /* bloqueado por robots.txt para mi herramienta, no verificable desde aca */
    { id: "kindor", name: "Kindor", bases: ["https://kindor.pro"], search: ["/?s={q}"], mode: "wp", extra: true }, /* verificado: alive, /pelicula/ y /serie/ propios; el buscador ?s= no esta confirmado */
    { id: "cinemascampo", name: "CinemasCampo", bases: ["https://cinemascampo.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelis44", name: "Pelis44", bases: ["https://www.pelis44.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "repelishd", name: "RepelisHD", bases: ["https://repelishd.buzz"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelisyseries", name: "PelisYSeries", bases: ["https://www2.pelisyseries.net"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelisonline", name: "PelisOnline", bases: ["https://pelisonline.club"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelisforte", name: "PelisForte", bases: ["https://www1.pelisforte.se"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelicinehd", name: "PelicineHD", bases: ["https://pelicinehd.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelisplayhd", name: "PelisPlayHD", bases: ["https://pelisplayhd.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "peliculaspanda", name: "PeliculasPanda", bases: ["https://peliculaspanda.net"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "pelisen1080p", name: "PelisEn1080p", bases: ["https://pelisen1080p.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "repelis24", name: "Repelis24", bases: ["https://repelis24.onl"], search: ["/?s={q}"], mode: "wp", extra: true }, /* usa slugs numerados (564-titulo-2025.html); no confirme si comparte motor con Repelis */
    { id: "peliculas8k", name: "Peliculas8K", bases: ["https://peliculas8k.com"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "peliculasstore", name: "Peliculas.store", bases: ["https://www.peliculas.store"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "movies4site", name: "Movies4.site", bases: ["https://movies4.site"], search: ["/?s={q}"], mode: "wp", extra: true }, /* no pude confirmar el rubro/estructura */
    { id: "fulltv", name: "FullTV", bases: ["https://www.fulltv.com.mx"], search: ["/?s={q}"], mode: "wp", extra: true }, /* baja confianza: puede ser una guia de TV, no un catalogo de embeds */

    /* Cristianas (verificado peliculascristianas.es: alive, WordPress/DooPlay) */
    { id: "peliculascristianas", name: "PeliculasCristianas", bases: ["https://peliculascristianas.es"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "verpeliculascristianas", name: "VerPeliculasCristianas", bases: ["https://verpeliculascristianas.net"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "seriesbiblicas", name: "SeriesBiblicas", bases: ["https://seriesbiblicas.net"], search: ["/?s={q}"], mode: "wp", extra: true },

    /* Antiguas/clasico (no verificadas, catalogos chicos de cine clasico) */
    { id: "tucineclasico", name: "TuCineClasico", bases: ["https://online.tucineclasico.es"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "cinetimes", name: "CineTimes", bases: ["https://cinetimes.org"], search: ["/?s={q}"], mode: "wp", extra: true },
    { id: "historiadelcine", name: "HistoriaDelCine", bases: ["https://online.historiadelcine.es"], search: ["/?s={q}"], mode: "wp", extra: true }
];

function titleQueries(ctx) {
    var a = [], i, t;
    function add(x) {
        x = clean(x || ""); if (!x) return;
        if (a.indexOf(x) < 0) a.push(x);
        t = x.replace(/[:\-–—]+/g, " ").replace(/\b(19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
        if (t && a.indexOf(t) < 0) a.push(t);
    }
    add(ctx.titleEs); add(ctx.titleEn); add(ctx.titleOrig);
    if (ctx.titleEs) add(ctx.titleEs.replace(/^el\s+/i, ""));
    if (ctx.titleEn) add(ctx.titleEn.replace(/\s*:\s*/g, " "));
    return a.slice(0, 7);
}
function siteFind(site, ctx) {
    var qs = titleVariants(ctx), reqs = [], i, j, k, res, best = null, score = 0;
    for (i = 0; i < site.bases.length; i++) {
        for (j = 0; j < qs.length; j++) {
            for (k = 0; k < site.search.length; k++) {
                reqs.push({
                    url: site.bases[i] + site.search[k].replace("{q}", enc(qs[j]).replace(/%20/g, "+")),
                    referer: site.bases[i] + "/"
                });
            }
        }
    }
    reqs = reqs.slice(0, 24);
    res = batchGet(reqs);
    for (i = 0; i < res.length; i++) {
        if (!res[i].body) continue;
        var links = findLinks(res[i].body, originOf(res[i].url), ctx.kind);
        var x = pickBest(links, ctx);
        if (x) return { url: x.url, base: originOf(res[i].url) };
        /* Algunos sitios no exponen enlaces como tarjetas: intenta slugs directos. */
        var guessed = directTitleLink(res[i].body, originOf(res[i].url), ctx);
        if (guessed) return { url: guessed, base: originOf(res[i].url) };
    }
    return null;
}

function titleVariants(ctx) {
    var a = [], base = String(ctx.titleEs || ""), en = String(ctx.titleEn || ""), y = String(ctx.year || "");
    function add(x) {
        x = clean(x); if (!x) return;
        x = x.replace(/\s*\(\s*\d{4}\s*\)\s*$/i, "").trim();
        if (x && a.indexOf(x) < 0) a.push(x);
    }
    add(base); add(en);
    add(base.replace(/[:–—-]+/g, " ")); add(en.replace(/[:–—-]+/g, " "));
    add(base.replace(/\b(la|el|los|las|de|del)\b/gi, " ").replace(/\s+/g, " "));
    add(en.replace(/\b(the|a|an|of|and)\b/gi, " ").replace(/\s+/g, " "));
    if (y) { add(base + " " + y); add(en + " " + y); }
    return uniq(a).slice(0, 8);
}

function directTitleLink(html, base, ctx) {
    var links = findLinks(html, base, ctx.kind), i, u, n;
    for (i = 0; i < links.length; i++) {
        u = links[i].url || ""; n = normalizeTitle(links[i].title || slugWords(u));
        if (n && (n == normalizeTitle(ctx.titleEs) || n == normalizeTitle(ctx.titleEn))) return u;
    }
    return "";
}

function episodeLink(html, base, s, e) {
    var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, m, S = String(s), E = String(e), txt, u;
    var pats = [
        new RegExp("(?:^|[-_/])0*" + S + "x0*" + E + "(?:[/?#._-]|$)", "i"),
        new RegExp("(?:temporada|season)[-_ /]*0*" + S + "[-_ /]*(?:episodio|episode|capitulo|capítulo)[-_ /]*0*" + E, "i"),
        new RegExp("/season/0*" + S + "/episode/0*" + E, "i"),
        new RegExp("(?:episodio|episode)[-_ /]*0*" + E + "(?:[/?#._-]|$)", "i")
    ];
    while ((m = re.exec(html || "")) != null) {
        u = absUrl(m[1], base); txt = m[1] + " " + strip(m[2]);
        for (var i = 0; i < pats.length; i++) if (pats[i].test(txt)) return u;
    }
    /* algunos sitios no codifican SxE en el href pero sí en el texto/data-* */
    var tags = findTags(html, /(?:episode|episodio|capitulo|season|temporada|data-episode|data-number)/i), a, v, j;
    for (j = 0; j < tags.length; j++) {
        a = attrsOf(tags[j].tag); v = (a["href"] || a["data-url"] || a["data-link"] || a["data-episode"] || a["data-number"] || "");
        if (!v) continue;
        if ((new RegExp("(?:^|[-_/])0*" + S + "x0*" + E + "(?:[/?#._-]|$)", "i")).test(v) || (String(a["data-season"] || "") == S && String(a["data-number"] || a["data-episode"] || "") == E)) return absUrl(v, base);
    }
    return "";
}

/* extrae una URL de embed de un texto (iframe, url suelta o JSON) */
function embedFromText(t) {
    t = String(t || "").replace(/\\\//g, "/").replace(/\\"/g, '"');
    var m = /<iframe[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)/i.exec(t);
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

function provSite(site, ctx, found) {
    var f = found || siteFind(site, ctx), pageUrl, html;
    if (!f) { log("  " + site.name + ": sin resultado"); return []; }
    pageUrl = f.url;
    if (ctx.kind == "tv") {
        var ep = "", sh = "";
        if (site.mode == "pelisplus" && /\/serie\//i.test(pageUrl)) ep = pageUrl.replace(/\/+$/, "") + "/season/" + ctx.season + "/episode/" + ctx.episode;
        else {
            sh = httpGet(pageUrl, f.base + "/");
            ep = episodeLink(sh, f.base, ctx.season, ctx.episode);
            if (!ep) ep = directEpisodeLink(sh, f.base, ctx.season, ctx.episode);
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

function directEpisodeLink(html, base, s, e) {
    var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, m, u, t, target = "S" + s + "E" + e;
    while ((m = re.exec(html || "")) != null) {
        u = absUrl(m[1], base); t = normalizeTitle(strip(m[2]));
        if (new RegExp("(?:^|[^0-9])0*" + s + "[^0-9]{0,4}0*" + e + "(?:$|[^0-9])", "i").test(u + " " + t) || new RegExp("s0*" + s + "e0*" + e, "i").test(u + " " + t) || normalizeTitle(t).indexOf(normalizeTitle(target)) >= 0) return u;
    }
    return "";
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

function collectSources(ctx) {
    var out = [], i, sites = [], reqs = [], pages = [], servers = 0;
    /* Fase 1: proveedores prioritarios. */
    try { servers += resolveCands(provJuanita(ctx), out, "PelisJuanita"); } catch (e1) { log("Juanita ERROR " + e1); }
    try { servers += resolveCands(provCuevana(ctx), out, "Cuevana3"); } catch (e2) { log("Cuevana ERROR " + e2); }

    /* Fase 2: TODO el resto de catalogos en paralelo. Antes se hacia uno por uno. */
    for (i = 0; i < SITES.length; i++) sites.push(SITES[i]);
    for (i = 0; i < sites.length; i++) {
        var qs = titleVariants(ctx), si, qj, sk;
        for (si = 0; si < sites[i].bases.length; si++) {
            for (qj = 0; qj < qs.length; qj++) {
                for (sk = 0; sk < sites[i].search.length; sk++) {
                    reqs.push({ site: sites[i], url: sites[i].bases[si] + sites[i].search[sk].replace("{q}", enc(qs[qj]).replace(/%20/g, "+")), referer: sites[i].bases[si] + "/" });
                }
            }
        }
    }
    /* No más de 90 búsquedas simultáneas: suficiente cobertura sin saturar GrayJay. */
    reqs = reqs.slice(0, 90);
    var br = batchGet(reqs), bestBySite = {}, bi;
    for (bi = 0; bi < br.length; bi++) {
        if (!br[bi].body) continue;
        var rq = reqs[bi], links = findLinks(br[bi].body, originOf(rq.url), ctx.kind), best = pickBest(links, ctx);
        if (!best) best = { url: directTitleLink(br[bi].body, originOf(rq.url), ctx), _dummy: true };
        if (best && best.url && !bestBySite[rq.site.id]) bestBySite[rq.site.id] = { url: best.url, base: originOf(rq.url) };
    }
    for (i = 0; i < sites.length && budgetLeft(); i++) {
        var f = bestBySite[sites[i].id];
        if (!f) continue;
        try {
            var c = provSite(sites[i], ctx, f);
            servers += resolveCands(c, out, sites[i].name);
        } catch (e3) { log(sites[i].name + " ERROR " + e3); }
    }
    /* PlPro siempre, independientemente de cuántas fuentes haya dado el scraping. */
    try { servers += resolveCands(provPlPro(ctx), out, "PlPro"); } catch (e4) { log("PlPro ERROR " + e4); }

    /* deduplicación final por URL + nombre. */
    var finalOut = [], seen = {};
    for (i = 0; i < out.length; i++) {
        var key = String(out[i].url || "") + "|" + String(out[i].name || "");
        if (!seen[key]) { seen[key] = 1; finalOut.push(out[i]); }
    }
    return finalOut;
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
    ctx.titles = uniq([normalizeTitle(ctx.titleEs), normalizeTitle(ctx.titleEn), normalizeTitle(ctx.titleOrig),
        normalizeTitle((ctx.titleEn || "").replace(/\s*:\s*/g, " ")),
        normalizeTitle((ctx.titleEs || "").replace(/\s*:\s*/g, " "))]);
    var poster = img(base.poster_path), title = ctx.titleEs || ctx.titleEn || "Sin t\u00edtulo";
    log("TMDB: es='" + ctx.titleEs + "' en='" + ctx.titleEn + "' year=" + ctx.year + (isTv ? " S" + ctx.season + "E" + ctx.episode : ""));

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

    var sources = collectSources(ctx);
    log("TOTAL fuentes: " + sources.length);

    var name = isTv ? (title + " \u00b7 S" + ctx.season + "E" + ctx.episode + (epName ? " \u00b7 " + epName : "")) : (title + (ctx.year ? " (" + ctx.year + ")" : ""));
    var desc = (isTv && epOverview ? epOverview : (base.overview || "")) + "\n\nFuentes: " + sources.length + (sources.length ? "" : " (no se encontr\u00f3 ninguna reproducible)");
    /* NOTA: un texto "pelishub://..." en la descripcion NO es tocable en GrayJay (solo
       autodetecta http/https), asi que no sirve como reemplazo de los botones ant/sig.
       La forma real de saltar de episodio es la lista de "Recomendados" (getContentRecommendations,
       mas abajo), que GrayJay muestra como videos tocables fuera del panel de Description. */
    if (debugMode()) desc += "\n\n=== DEBUG ===\n" + _debug;
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
        try {
            var r = searchPage(q || "", 1), jk = [];
            try { jk = jkSearch(q || ""); } catch (e2) { jk = []; }
            var first = r.results.concat(jk);
            return makePager(first, r.hasMore, function (pg) { return searchPage(q || "", pg); });
        } catch (e) { return new VideoPager([], false, {}); }
    };
    source.getSearchChannelContentsCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.searchChannels = function (q) { return new ChannelPager([], false, {}); };

    source.isChannelUrl = function (u) { return /^pelishub:\/\/show\/\d+$/.test(String(u || "")); };
    source.getChannel = function (u) { return channelOf(u); };
    source.getChannelCapabilities = function () { return { types: [FEED_MIXED], sorts: [ORDER_CHRONO], filters: [] }; };
    source.getChannelContents = function (u, type, order, filters) {
        try { return channelContents(u); } catch (e) { return new VideoPager([], false, {}); }
    };

    source.isContentDetailsUrl = function (u) { return /^pelishub:\/\/(?:movie\/\d+|tv\/\d+\/\d+\/\d+)$/.test(String(u || "")) || isJkUrl(u); };
    source.getContentDetails = function (u) {
        try { return isJkUrl(u) ? jkDetails(u) : details(u); }
        catch (e) { log("DETAIL " + e); return errorDetails(u, String(e)); }
    };
    source.getContentRecommendations = function (u) {
        try { return new VideoPager(isJkUrl(u) ? jkRecommendations(u) : recommendations(u), false, {}); }
        catch (e) { return new VideoPager([], false, {}); }
    };
}
