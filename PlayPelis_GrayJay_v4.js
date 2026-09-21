/*
 * PlayPelis GrayJay Source v4
 *
 * Recovered from the PlayPelis APK's web-provider path.
 *
 * PRIMARY:
 *   https://pelisplushd.nu
 *
 * The APK's Pelisplushd provider uses HTML scraping for:
 *   /search/{query}/{page}
 *   /genres-1/{page}
 *   /genre/{genre}/{page}
 *   detail pages
 *   /ajax/v2/tv/seasons/{id}
 *   /ajax/v2/season/episodes/{id}
 *   player/server links embedded in the detail/player HTML
 *
 * IMPORTANT:
 *   This version DOES NOT use api.esplay.one.
 *
 * ES5 only: var, classic functions/loops.
 */

var PID = "c1d7a4e2-8f36-4b90-a125-63e9d7f10482";
var PLATFORM = "PlayPelisScrape";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);

var BASE = "https://pelisplushd.nu";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

var MAX_SEARCH = 40;
var MAX_EPISODES = 300;
var MAX_SOURCES = 16;

var _settings = {};
var _debug = "";

/* Ponlo en false cuando todo funcione. */
var DEBUG_THROW = true;

function log(s) {
    _debug += String(s) + "\n";
}

function resetDebug() {
    _debug = "";
}

function clean(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/")
        .trim();
}

function absUrl(u) {
    u = clean(u);
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.charAt(0) === "/") return BASE + u;
    return BASE + "/" + u;
}

function htmlGet(url) {
    try {
        var r = http.GET(url, {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": BASE + "/"
        }, false);

        if (r && r.code !== undefined && r.code !== 200) {
            log("HTTP " + r.code + " en " + url);
        }

        if (!r) {
            log("GET sin respuesta: " + url);
            return "";
        }

        if (typeof r == "string") return r;
        if (r.body != null) return String(r.body);
        if (r.data != null && typeof r.data == "string") return r.data;

        log("GET sin body: " + url);
        return "";
    } catch (e) {
        log("GET exception " + url + " -> " + String(e));
        return "";
    }
}

/*
 * Small HTML tag scanner. It is used because GrayJay sources do not
 * expose the browser DOM APIs that the APK's Flutter WebView has.
 */
function elementsByClass(html, className) {
    var out = [];
    if (!html) return out;

    var re = /<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^>]*)?>/g;
    var starts = [];
    var m;

    while ((m = re.exec(html)) != null) {
        var tag = m[0];
        if (tag.charAt(1) == "/") continue;

        var cls = getAttr(tag, "class");
        if (!cls) continue;

        var has = false;
        var parts = cls.split(/\s+/);
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] == className) {
                has = true;
                break;
            }
        }

        if (!has) continue;

        var tagName = m[1].toLowerCase();
        var start = m.index;
        var end = findBalancedTag(html, start, tagName);

        if (end > start) {
            out.push(html.substring(start, end));
        }
    }

    return out;
}

function findBalancedTag(html, start, tagName) {
    var re = new RegExp("<\\/?"+tagName+"\\b[^>]*>", "gi");
    re.lastIndex = start;

    var depth = 0;
    var m;

    while ((m = re.exec(html)) != null) {
        var token = m[0];

        if (/^<\//.test(token)) {
            depth--;
            if (depth <= 0) {
                return re.lastIndex;
            }
        } else if (!/\/>$/.test(token)) {
            depth++;
        }
    }

    return -1;
}

function getAttr(tag, name) {
    var re = new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i");
    var m = re.exec(tag);
    return m ? clean(m[1]) : "";
}

function firstAttr(block, tagName, attr) {
    var re = new RegExp("<" + tagName + "\\b[^>]*\\b" + attr + "\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>", "i");
    var m = re.exec(block);
    return m ? clean(m[1]) : "";
}

function firstText(block, tagName) {
    var re = new RegExp("<" + tagName + "\\b[^>]*>([\\s\\S]*?)<\\/" + tagName + ">", "i");
    var m = re.exec(block);
    if (!m) return "";
    return stripTags(m[1]);
}

function stripTags(s) {
    return clean(String(s || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "));
}

function getType(url) {
    return String(url || "").toLowerCase().indexOf("/series/") >= 0
        ? "tvshow"
        : "movie";
}

function posterUrl(u) {
    u = clean(u);
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    return absUrl(u);
}

function thumb(url) {
    if (!url) return new Thumbnails([]);
    return new Thumbnails([new Thumbnail(url, 100)]);
}

function author() {
    return new PlatformAuthorLink(
        PPID,
        "PlayPelis",
        BASE,
        "",
        0
    );
}

function catalogVideo(id, title, poster, url) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, String(id), PID),
        name: title || "Sin título",
        thumbnails: thumb(poster),
        author: author(),
        uploadDate: 0,
        url: url,
        duration: 0,
        viewCount: 0,
        isLive: false
    });
}

var SCRIPT_VERSION = "v5-diag";

function debugItem(title) {
    var text = "Script " + SCRIPT_VERSION + "\nBASE: " + BASE + "\n" + _debug;
    if (text.length > 1500) text = text.substring(0, 1500);

    return catalogVideo(
        "debug_" + Math.floor(Math.random() * 1000000),
        title,
        "",
        "ppscrape://debug/" + encodeURIComponent(text)
    );
}

function detailId(url) {
    return encodeURIComponent(url);
}

function makeInternal(kind, externalUrl) {
    return "ppscrape://" + kind + "/" + encodeURIComponent(externalUrl);
}

function parseInternal(url) {
    var s = String(url || "");

    if (s.indexOf("ppscrape://") !== 0) return null;

    var m = s.match(/^ppscrape:\/\/(movie|tvshow|episode|debug)\/(.+)$/);
    if (!m) return null;

    return {
        kind: m[1],
        url: decodeURIComponent(m[2])
    };
}

function extractCards(html) {
    log("HTML recibido: " + (html ? html.length : 0) + " bytes");
    var blocks = elementsByClass(html, "mouCgDQMxDwt");
    log("Bloques con clase de tarjeta: " + blocks.length);
    var out = [];
    var seen = {};

    for (var i = 0; i < blocks.length && out.length < MAX_SEARCH; i++) {
        var b = blocks[i];

        var aHref = firstAttr(b, "a", "href");
        var img = firstAttr(b, "img", "data-src");

        if (!img) img = firstAttr(b, "img", "src");

        var title = firstText(b, "p");

        if (!title) {
            var mt = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(b);
            if (mt) title = stripTags(mt[1]);
        }

        var u = absUrl(aHref);
        title = clean(title);

        if (!u || !title) continue;

        var key = u;
        if (seen[key]) continue;
        seen[key] = true;

        var type = getType(u);

        /*
         * Same cancellation rule recovered from the APK.
         */
        var low = (title + " " + stripTags(b)).toLowerCase();

        if (low.indexOf("erotic") >= 0 ||
            low.indexOf("+18") >= 0 ||
            low.indexOf("18+") >= 0 ||
            low.indexOf("kokuhaku") >= 0) {
            continue;
        }

        out.push({
            title: title,
            url: u,
            poster: posterUrl(img),
            type: type
        });
    }

    log("SCRAPE cards: " + out.length);
    return out;
}

function searchSite(query, page) {
    query = clean(query);
    page = page || 1;

    var q = encodeURIComponent(query).replace(/%20/g, "+");
    var url = BASE + "/search/" + q + "/" + page;

    log("SEARCH URL: " + url);

    var html = htmlGet(url);

    if (!html) return [];

    return extractCards(html);
}

function homeSite() {
    var html = htmlGet(BASE + "/genres-1/1");
    if (!html) {
        html = htmlGet(BASE + "/");
    }

    return extractCards(html);
}

function extractDetail(html, url) {
    if (!html) return null;

    var title = "";
    var poster = "";
    var synopsis = "";

    /*
     * Exact selectors recovered from the APK:
     * .moKEdauRAOhR
     * h1.moYugPFSkwSi
     * .moaOIKFNogbT img
     * .moQPQhZEVIyX
     */
    var detailBlocks = elementsByClass(html, "moKEdauRAOhR");
    var detail = detailBlocks.length ? detailBlocks[0] : html;

    title = firstText(detail, "h1");

    poster = firstAttr(detail, "img", "data-src");
    if (!poster) poster = firstAttr(detail, "img", "src");

    var syn = elementsByClass(detail, "moQPQhZEVIyX");
    if (syn.length) synopsis = stripTags(syn[0]);

    /*
     * Fallback title patterns.
     */
    if (!title) {
        var mt = /<h1[^>]*class=["'][^"']*moYugPFSkwSi[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html);
        if (mt) title = stripTags(mt[1]);
    }

    if (!poster) {
        var mp = /<img[^>]*class=["'][^"']*moaOIKFNogbT[^"']*["'][^>]*>/i.exec(html);
        if (mp) poster = getAttr(mp[0], "data-src") || getAttr(mp[0], "src");
    }

    if (!synopsis) {
        var ms = /<[^>]*class=["'][^"']*moQPQhZEVIyX[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(html);
        if (ms) synopsis = stripTags(ms[1]);
    }

    var seasons = [];
    var seasonRe = /<a\b[^>]*id=["'][^"']*["'][^>]*data-number=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    var m;

    while ((m = seasonRe.exec(html)) != null) {
        var num = parseInt(String(m[1]).replace(/\D/g, ""), 10);
        var href = absUrl(m[2]);

        if (!isNaN(num) && href) {
            seasons.push({
                number: num,
                url: href
            });
        }
    }

    /*
     * Some pages place data-number after href.
     */
    if (seasons.length == 0) {
        var seasonRe2 = /<a\b([^>]*)>/gi;
        while ((m = seasonRe2.exec(html)) != null) {
            var attrs = m[1];
            if (attrs.indexOf("moSxCSIJWWnO") < 0) continue;

            var dn = getAttr(m[0], "data-number");
            var dh = getAttr(m[0], "href");

            if (dn && dh) {
                var nn = parseInt(String(dn).replace(/\D/g, ""), 10);
                if (!isNaN(nn)) seasons.push({
                    number: nn,
                    url: absUrl(dh)
                });
            }
        }
    }

    return {
        title: clean(title),
        poster: posterUrl(poster),
        synopsis: clean(synopsis),
        type: getType(url),
        seasons: seasons
    };
}

function extractEpisodes(html, poster) {
    var out = [];
    var seen = {};

    /*
     * Exact APK path: div.tab-pane a
     */
    var anchors = [];
    var tabBlocks = elementsByClass(html, "tab-pane");

    for (var t = 0; t < tabBlocks.length; t++) {
        var block = tabBlocks[t];
        var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
        var m;

        while ((m = re.exec(block)) != null) {
            var href = getAttr(m[0], "href");
            var text = stripTags(m[2]);

            if (!href) continue;

            var u = absUrl(href);
            var parts = u.split("/");

            if (parts.length < 3) continue;

            var ep = parseInt(parts[parts.length - 1], 10);
            var season = parseInt(parts[parts.length - 3], 10);

            if (isNaN(ep) || isNaN(season)) continue;

            var key = u;
            if (seen[key]) continue;
            seen[key] = true;

            out.push({
                title: text || ("Episodio " + ep),
                url: u,
                poster: poster,
                season: season,
                episode: ep
            });

            if (out.length >= MAX_EPISODES) return out;
        }
    }

    /*
     * Fallback recovered from the APK for pages where #moFHVogrVLMH
     * contains the episode anchors directly.
     */
    if (out.length == 0) {
        var direct = elementsByIdLike(html, "moFHVogrVLMH");

        for (var d = 0; d < direct.length; d++) {
            var rr = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
            var mm;

            while ((mm = rr.exec(direct[d])) != null) {
                var hh = getAttr(mm[0], "href");
                if (!hh) continue;

                var uu = absUrl(hh);
                var tt = getAttr(mm[0], "title") || stripTags(mm[2]);

                if (seen[uu]) continue;
                seen[uu] = true;

                out.push({
                    title: tt || "Episodio",
                    url: uu,
                    poster: poster,
                    season: 1,
                    episode: out.length + 1
                });

                if (out.length >= MAX_EPISODES) break;
            }
        }
    }

    return out;
}

function elementsByIdLike(html, id) {
    var out = [];
    var re = new RegExp("<([a-zA-Z][a-zA-Z0-9:-]*)\\b[^>]*id=[\"'][^\"']*" + id + "[^\"']*[\"'][^>]*>", "gi");
    var m;

    while ((m = re.exec(html)) != null) {
        var end = findBalancedTag(html, m.index, m[1].toLowerCase());
        if (end > m.index) out.push(html.substring(m.index, end));
    }

    return out;
}

function episodesFromSeries(detailUrl, poster) {
    var html = htmlGet(detailUrl);
    if (!html) return [];

    var detail = extractDetail(html, detailUrl);
    var out = [];
    var seen = {};

    /*
     * First try direct episode links from the detail page.
     */
    var direct = extractEpisodes(html, poster);

    for (var i = 0; i < direct.length; i++) {
        if (!seen[direct[i].url]) {
            seen[direct[i].url] = true;
            out.push(direct[i]);
        }
    }

    /*
     * APK behavior: fetch each season page, then div.tab-pane a.
     */
    if (detail && detail.seasons) {
        for (var s = 0; s < detail.seasons.length && out.length < MAX_EPISODES; s++) {
            var sh = htmlGet(detail.seasons[s].url);
            if (!sh) continue;

            var eps = extractEpisodes(sh, poster);

            for (var e = 0; e < eps.length && out.length < MAX_EPISODES; e++) {
                if (!seen[eps[e].url]) {
                    seen[eps[e].url] = true;
                    out.push(eps[e]);
                }
            }
        }
    }

    return out;
}

/*
 * Collect candidate URLs from player HTML.
 *
 * The APK's Pelisplushd provider scans the player page and maps hosts such as:
 * sbfast, plusvip, zplay/zfast, plusto, rem, doodstream, voex, stp,
 * slare/streamlare, uwu and also direct URLs.
 *
 * We collect only http(s) URLs and later resolve a subset with lightweight
 * extractors.
 */
function extractUrls(html) {
    var out = [];
    var seen = {};
    var re = /https?:\/\/[^"'\\\s<>]+/gi;
    var m;

    while ((m = re.exec(html)) != null) {
        var u = clean(m[0])
            .replace(/[),;]+$/g, "");

        if (!u || seen[u]) continue;
        seen[u] = true;
        out.push(u);

        if (out.length >= 80) break;
    }

    return out;
}

function hostOf(url) {
    var m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i);
    return m ? m[1].toLowerCase() : "";
}

function mediaFromUrl(url, label) {
    url = clean(url);

    if (!url || !/^https?:\/\//i.test(url)) return null;

    if (/\.m3u8(?:[?#]|$)/i.test(url)) {
        return new HLSSource({
            name: label || "HLS",
            url: url,
            duration: 0
        });
    }

    if (/\.mp4(?:[?#]|$)/i.test(url)) {
        return new VideoUrlSource({
            width: 0,
            height: 0,
            container: "mp4",
            codec: "",
            name: label || "MP4",
            bitrate: 0,
            duration: 0,
            url: url
        });
    }

    return null;
}

function extractVoe(url) {
    var html = htmlGet(url);
    if (!html) return null;

    var m = /'(?:hls|mp4)'\s*:\s*'([^']+)'/i.exec(html);
    if (!m) {
        m = /"(?:hls|mp4)"\s*:\s*"([^"]+)"/i.exec(html);
    }

    if (m) {
        return mediaFromUrl(clean(m[1]), "Voe");
    }

    return null;
}

function extractUqload(url) {
    if (url.indexOf(".html") < 0) url += ".html";

    var html = htmlGet(url);
    if (!html) return null;

    var m = /sources\s*:\s*\[\s*([^\]]+)\]/i.exec(html);
    if (!m) return null;

    var urls = m[1].match(/https?:\/\/[^"',\s]+/gi);
    if (!urls || !urls.length) return null;

    for (var i = 0; i < urls.length; i++) {
        var src = mediaFromUrl(clean(urls[i]), "Uqload");
        if (src) return src;
    }

    return null;
}

function extractStreamTape(url) {
    var html = htmlGet(url);
    if (!html) return null;

    /*
     * Exact regex recovered from the APK:
     * robotlink').innerHTML = '...'+('...')
     */
    var m = /robotlink'\)\.innerHTML\s*=\s*'(.+?)'\+\s*\('(.+?)'\)/i.exec(html);

    if (m) {
        var u = "https:" + m[1] + m[2].substring(3);
        return mediaFromUrl(clean(u), "StreamTape");
    }

    return null;
}

function extractDood(url) {
    var idParts = String(url).split("/");
    var id = idParts[idParts.length - 1] || "";

    id = id.replace(/[^A-Za-z0-9_-]/g, "");
    if (!id) return null;

    var embed = "https://dood.wf/e/" + id;
    var html = htmlGet(embed);

    if (!html) return null;

    var m = /\/pass_md5\/[^'"\s<]+/i.exec(html);
    if (!m) return null;

    var pass = "https://dood.wf" + m[0];

    var r = null;
    try {
        r = http.GET(pass, {
            "User-Agent": UA,
            "Referer": "https://dood.wf/"
        }, false);
    } catch (e) {
        log("Dood GET: " + String(e));
        return null;
    }

    var tokenText = "";

    if (r) {
        if (typeof r == "string") tokenText = r;
        else if (r.body != null) tokenText = String(r.body);
        else if (r.data != null) tokenText = String(r.data);
    }

    if (!tokenText) return null;

    var finalUrl =
        tokenText +
        "zUEJeL3mUN?token=" +
        id;

    return mediaFromUrl(finalUrl, "DoodStream");
}

function resolveCandidate(url) {
    var host = hostOf(url);

    if (/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url)) {
        return mediaFromUrl(url, "Direct");
    }

    if (host.indexOf("voe.") >= 0) return extractVoe(url);

    if (host.indexOf("uqload.") >= 0) return extractUqload(url);

    if (host.indexOf("streamtape.") >= 0) return extractStreamTape(url);

    if (host.indexOf("dood.") >= 0 ||
        host.indexOf("doodstream.") >= 0) {
        return extractDood(url);
    }

    /*
     * Some APK providers return a direct URL on these domains. If the
     * collected page already contains a media URL it is handled above.
     */
    return null;
}

function resolvePageSources(pageUrl) {
    var html = htmlGet(pageUrl);
    if (!html) return [];

    var candidates = extractUrls(html);
    var out = [];
    var seen = {};

    for (var i = 0; i < candidates.length && out.length < MAX_SOURCES; i++) {
        var u = candidates[i];

        var src = resolveCandidate(u);

        if (!src) continue;

        var key = u;
        if (seen[key]) continue;

        seen[key] = true;
        out.push(src);

        log("SOURCE OK: " + hostOf(u));
    }

    /*
     * If the player HTML itself contains a direct manifest, use it.
     */
    if (out.length == 0) {
        var direct = html.match(/https?:\/\/[^"'\\\s<>]+\.m3u8(?:\?[^"'\\\s<>]+)?/ig);

        if (direct) {
            for (var d = 0; d < direct.length && out.length < MAX_SOURCES; d++) {
                var ds = mediaFromUrl(clean(direct[d]), "Direct HLS");
                if (ds) out.push(ds);
            }
        }
    }

    return out;
}

function detailMovieOrSeries(url) {
    resetDebug();

    var html = htmlGet(url);
    if (!html) return null;

    var d = extractDetail(html, url);
    if (!d || !d.title) {
        log("DETAIL: no se pudo extraer título");
        return null;
    }

    return d;
}

function movieDetails(url) {
    var d = detailMovieOrSeries(url);
    if (!d) return null;

    var sources = resolvePageSources(url);

    var desc = d.synopsis || "";
    desc += "\n\nFuente de catálogo: Pelisplushd HTML";
    desc += "\nFuentes reproducibles encontradas: " + sources.length;

    if (_debug) desc += "\n\n=== DEBUG ===\n" + _debug;

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "movie_" + detailId(url), PID),
        name: d.title,
        thumbnails: thumb(d.poster),
        author: author(),
        uploadDate: 0,
        url: makeInternal("movie", url),
        duration: 0,
        viewCount: 0,
        isLive: false,
        video: new VideoSourceDescriptor(sources),
        description: desc
    });
}

function seriesDetails(url) {
    var d = detailMovieOrSeries(url);
    if (!d) return null;

    var desc = d.synopsis || "";
    desc += "\n\nFuente de catálogo: Pelisplushd HTML";
    desc += "\nTemporadas detectadas: " + (d.seasons ? d.seasons.length : 0);

    if (_debug) desc += "\n\n=== DEBUG ===\n" + _debug;

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "tv_" + detailId(url), PID),
        name: d.title,
        thumbnails: thumb(d.poster),
        author: author(),
        uploadDate: 0,
        url: makeInternal("tvshow", url),
        duration: 0,
        viewCount: 0,
        isLive: false,
        video: new VideoSourceDescriptor([]),
        description: desc
    });
}

function episodeDetails(url) {
    var d = detailMovieOrSeries(url);
    if (!d) return null;

    var sources = resolvePageSources(url);

    var desc =
        (d.synopsis || "") +
        "\n\nFuente: Pelisplushd" +
        "\nFuentes reproducibles: " + sources.length;

    if (_debug) desc += "\n\n=== DEBUG ===\n" + _debug;

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "episode_" + detailId(url), PID),
        name: d.title || "Episodio",
        thumbnails: thumb(d.poster),
        author: author(),
        uploadDate: 0,
        url: makeInternal("episode", url),
        duration: 0,
        viewCount: 0,
        isLive: false,
        video: new VideoSourceDescriptor(sources),
        description: desc
    });
}

function search(query) {
    resetDebug();

    var items = searchSite(query, 1);
    var out = [];

    for (var i = 0; i < items.length && out.length < MAX_SEARCH; i++) {
        var x = items[i];

        out.push(
            catalogVideo(
                "search_" + i + "_" + x.url,
                x.title,
                x.poster,
                makeInternal(x.type, x.url)
            )
        );
    }

    log("SEARCH -> " + out.length + " resultados");
    return out;
}

function home() {
    resetDebug();

    var items = homeSite();
    var out = [];

    for (var i = 0; i < items.length && i < MAX_SEARCH; i++) {
        var x = items[i];

        out.push(
            catalogVideo(
                "home_" + i + "_" + x.url,
                x.title,
                x.poster,
                makeInternal(x.type, x.url)
            )
        );
    }

    log("HOME -> " + out.length + " resultados");
    return out;
}

function recommendations(url) {
    var p = parseInternal(url);

    if (!p || p.kind != "tvshow") return [];

    var d = detailMovieOrSeries(p.url);
    if (!d) return [];

    var eps = episodesFromSeries(p.url, d.poster);
    var out = [];

    for (var i = 0; i < eps.length && i < MAX_EPISODES; i++) {
        var e = eps[i];

        out.push(
            catalogVideo(
                "ep_" + e.url,
                e.title,
                e.poster,
                makeInternal("episode", e.url)
            )
        );
    }

    log("EPISODIOS -> " + out.length);
    return out;
}

function getDetails(url) {
    var p = parseInternal(url);
    if (!p) return null;

    if (p.kind == "debug") {
        _debug = p.url;
        return errorDetails(url, "Diagnóstico");
    }

    if (p.kind == "movie") return movieDetails(p.url);
    if (p.kind == "tvshow") return seriesDetails(p.url);
    if (p.kind == "episode") return episodeDetails(p.url);

    return null;
}

function errorDetails(url, msg) {
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "error_" + encodeURIComponent(url || ""), PID),
        name: "PlayPelis - " + msg,
        thumbnails: new Thumbnails([]),
        author: author(),
        uploadDate: 0,
        url: url || BASE,
        video: new VideoSourceDescriptor([]),
        description:
            msg +
            "\n\nCatálogo: " + BASE +
            "\n\n=== DEBUG ===\n" + _debug
    });
}

if (typeof source != "undefined") {

    source.setSettings = function(s) {
        _settings = s || {};
    };

    source.enable = function(c, s) {
        _settings = s || {};
    };

    source.getSearchCapabilities = function() {
        return {
            types: [Type.Feed.Mixed],
            sorts: [],
            filters: []
        };
    };

    source.search = function(query) {
        var items = [];

        try {
            items = search(query || "");
        } catch (e) {
            log("SEARCH exception: " + String(e));
        }

        if (!items.length && DEBUG_THROW) {
            items = [debugItem("[DIAG] Búsqueda sin resultados - toca para ver el motivo")];
        }

        return new VideoPager(items, false, null);
    };

    source.searchSuggestions = function(query) {
        return [];
    };

    source.getHome = function() {
        var items = [];

        try {
            items = home();
        } catch (e) {
            log("HOME exception: " + String(e));
        }

        if (DEBUG_THROW) {
            var t = items.length
                ? "[DIAG " + SCRIPT_VERSION + "] Home OK con " + items.length + " items - toca para ver log"
                : "[DIAG " + SCRIPT_VERSION + "] Home VACÍO - toca para ver el motivo";
            items.unshift(debugItem(t));
        }

        return new VideoPager(items, false, null);
    };

    source.isChannelUrl = function(url) {
        return false;
    };

    source.isContentDetailsUrl = function(url) {
        return String(url || "").indexOf("ppscrape://") === 0;
    };

    source.isVideoDetailsUrl = function(url) {
        return source.isContentDetailsUrl(url);
    };

    source.getVideoDetails = function(url) {
        return source.getContentDetails(url);
    };

    source.getContentDetails = function(url) {
        try {
            var d = getDetails(url);
            return d || errorDetails(url, "No se pudo extraer el contenido");
        } catch (e) {
            log("DETAIL exception: " + String(e));
            return errorDetails(url, String(e));
        }
    };

    source.getContentRecommendations = function(url) {
        try {
            return new VideoPager(
                recommendations(url),
                false,
                null
            );
        } catch (e) {
            log("EPISODE exception: " + String(e));
            return new VideoPager([], false, null);
        }
    };
}
