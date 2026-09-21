/*
 * PlayPelis / ESPlay GraphQL - GrayJay Source v3.1
 * ES5 compatible.
 *
 * Cambios v3.1:
 * - PID igual al id del JSON.
 * - types: [Type.Feed.Mixed] en getSearchCapabilities.
 * - http.POST con 4 argumentos (useAuth = false).
 * - Modo diagnóstico (DEBUG_THROW): si Home o búsqueda quedan vacíos,
 *   se lanza un ScriptException con el motivo para verlo en la app.
 * - La URL de episodio incluye el slug de la serie (ya no depende de
 *   una búsqueda vacía).
 */

var PID = "b7c1e4d2-6a91-4f38-9c25-73e8b1a4d650";
var PLATFORM = "PlayPelis";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);

var API = "https://api.esplay.one/graphql";
var WEB = "https://pelisplus2.ai";
var STATIC = "https://static.esplay.one";

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/* Ponlo en false cuando todo funcione. */
var DEBUG_THROW = true;

var _settings = {};
var _debug = "";

var MAX_SOURCES = 16;
var MAX_SEARCH = 40;
var MAX_EPISODES = 500;
var MAX_SEASONS = 50;

function log(s) {
    _debug += String(s) + "\n";
}

function resetDebug() {
    _debug = "";
}

function cleanUrl(s) {
    if (!s) return "";
    return String(s)
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&")
        .trim();
}

function httpPostJson(url, obj) {
    var body = JSON.stringify(obj);
    var headers = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": WEB,
        "Referer": WEB + "/"
    };

    var r = null;

    try {
        r = http.POST(url, body, headers, false);
    } catch (e1) {
        log("HTTP POST exception: " + String(e1));
        return null;
    }

    if (!r) {
        log("HTTP POST sin respuesta");
        return null;
    }

    if (r.code !== undefined && r.code !== 200) {
        log("HTTP code " + r.code + ": " +
            String(r.body || "").substring(0, 300));
    }

    var text = "";

    try {
        if (typeof r === "string") {
            text = r;
        } else if (r.body != null) {
            text = String(r.body);
        } else {
            text = JSON.stringify(r);
        }
    } catch (e3) {
        log("No se pudo leer respuesta HTTP: " + String(e3));
        return null;
    }

    if (!text) {
        log("Respuesta vacía de " + url);
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (e4) {
        log("JSON inválido: " + text.substring(0, 500));
        return null;
    }
}

function gql(query, variables) {
    var r = httpPostJson(API, {
        query: query,
        variables: variables || {}
    });

    if (!r) return null;

    if (r.errors && r.errors.length) {
        log("GraphQL error: " + JSON.stringify(r.errors).substring(0, 500));
        return null;
    }

    if (!r.data) {
        log("GraphQL sin data: " + JSON.stringify(r).substring(0, 500));
        return null;
    }

    return r.data;
}

/* ---------- Carátulas ---------- */

function coverCandidates(type, path, small) {
    var out = [];
    var seen = {};
    var p = cleanUrl(path);

    if (!p) return out;

    function add(u) {
        u = cleanUrl(u);
        if (!u || seen[u]) return;
        seen[u] = true;
        out.push(u);
    }

    if (/^https?:\/\//i.test(p)) {
        add(p);
        return out;
    }

    p = p.replace(/^\/+/, "");

    if (small) {
        add(STATIC + "/" + type + "/episode/small/" + p);
        add(STATIC + "/" + type + "/cover/small/" + p);
    }

    add(STATIC + "/" + type + "/cover/original/" + p);
    add(STATIC + "/" + type + "/cover/small/" + p);

    if (p.indexOf(type + "/") === 0) {
        add(STATIC + "/" + p);
    }

    return out;
}

function thumb(urls) {
    var arr = [];

    if (!urls) return new Thumbnails([]);

    if (typeof urls === "string") {
        urls = [urls];
    }

    for (var i = 0; i < urls.length && arr.length < 5; i++) {
        if (urls[i]) {
            arr.push(new Thumbnail(urls[i], 100));
        }
    }

    return new Thumbnails(arr);
}

function author() {
    return new PlatformAuthorLink(
        PPID,
        "PlayPelis",
        WEB,
        "",
        0
    );
}

function makeVideo(id, title, images, url) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, String(id), PID),
        name: title || "Sin título",
        thumbnails: thumb(images),
        author: author(),
        uploadDate: 0,
        url: url,
        duration: 0,
        viewCount: 0,
        isLive: false
    });
}

/* ---------- Fuentes de video ---------- */

function isHls(url, item) {
    var u = String(url || "").toLowerCase();
    var t = item && item.type ? String(item.type).toLowerCase() : "";

    return u.indexOf(".m3u8") >= 0 ||
        u.indexOf("m3u8") >= 0 ||
        t == "hls" ||
        t == "m3u8";
}

function isMp4(url, item) {
    var u = String(url || "").toLowerCase();
    var t = item && item.type ? String(item.type).toLowerCase() : "";

    return /\.mp4(?:[?#]|$)/i.test(u) ||
        t == "mp4" ||
        t == "video/mp4";
}

function mediaSource(item) {
    if (!item || !item.url) return null;

    var u = cleanUrl(item.url);
    if (!/^https?:\/\//i.test(u)) return null;

    var label =
        (item.server ? String(item.server) : "Servidor") +
        (item.quality ? " [" + String(item.quality) + "]" : "") +
        (item.language ? " [" + String(item.language) + "]" : "");

    if (isHls(u, item)) {
        return new HLSSource({
            name: label || "HLS",
            url: u,
            duration: 0
        });
    }

    if (isMp4(u, item)) {
        return new VideoUrlSource({
            width: 0,
            height: 0,
            container: "mp4",
            codec: "",
            name: label || "MP4",
            bitrate: 0,
            duration: 0,
            url: u
        });
    }

    return null;
}

function sourceList(items) {
    var out = [];
    var seen = {};

    if (!items) return out;

    for (var i = 0; i < items.length && out.length < MAX_SOURCES; i++) {
        var x = items[i];
        if (!x || !x.url) continue;

        var u = cleanUrl(x.url);
        if (!u || seen[u]) continue;
        seen[u] = true;

        var src = mediaSource(x);

        if (src) {
            out.push(src);
            log("SOURCE OK: " + u);
        } else {
            log("SOURCE no-directa [" + x.server + " type=" + x.type +
                " sandbox=" + x.sandbox + "]: " + u);
        }
    }

    return out;
}

/* ---------- Queries GraphQL ---------- */

var Q_SEARCH =
'query mySearchItems($query: String!) {' +
' movies: showSearch(query: $query, type: "movie", limit: 20) {' +
'  totalCount items { id title originalTitle slug coverPath year overview type }' +
' }' +
' tvshows: showSearch(query: $query, type: "tvshow", limit: 20) {' +
'  totalCount items { id title originalTitle slug coverPath year overview type }' +
' }' +
'}';

var Q_LIST =
'query myShowListPage($page: Int!, $type: String!, $genreSlug: String) {' +
' showList(page: $page, type: $type, limit: 20, genreSlug: $genreSlug) {' +
'  totalCount items { id title originalTitle slug coverPath year overview type }' +
' }' +
'}';

var Q_DETAILS =
'query showItem($type: String!, $slug: String!) {' +
' show(type: $type, slug: $slug) {' +
'  id title originalTitle type coverPath duration overview popularity slug year' +
'  quality { type language } genres { id slug name } country { name } cast { name }' +
' }' +
'}';

var Q_SEASONS =
'query getSeason($showId: String!) {' +
' seasonList(showId: $showId, limit: 500, page: 1) {' +
'  totalCount items { episodeCount number }' +
' }' +
'}';

var Q_EPISODES =
'query season($showId: String!, $seasonNumber: Int!, $limit: Int, $page: Int) {' +
' seasonEpisodesList(showId: $showId, number: $seasonNumber, limit: $limit, page: $page) {' +
'  totalCount season { title slug }' +
'  items { id title slug number overview coverPath releaseDate }' +
' }' +
'}';

var Q_MOVIE_LINKS =
'query videoLinks($itemId: String!) {' +
' links(itemId: $itemId) {' +
'  mirrors { language url quality sandbox type server updatedAt status }' +
' }' +
'}';

var Q_EPISODE_VIDEOS =
'query queryVideos($itemId: String!) {' +
' videos(itemId: $itemId) {' +
'  language url quality sandbox type server updatedAt status' +
' }' +
'}';

/* ---------- URLs internas ----------
 *   pp://movie/<slug>
 *   pp://tvshow/<slug>
 *   pp://episode/<epId>/<showId>/<season>/<ep>/<slug>
 */

function episodeUrl(epId, showId, season, number, slug) {
    return "pp://episode/" +
        encodeURIComponent(epId) + "/" +
        encodeURIComponent(showId) + "/" +
        season + "/" + number + "/" +
        encodeURIComponent(slug || "");
}

function parseItemUrl(url) {
    var m;
    url = String(url || "");

    m = url.match(/^pp:\/\/movie\/(.+)$/);
    if (m) {
        return { kind: "movie", slug: decodeURIComponent(m[1]) };
    }

    m = url.match(/^pp:\/\/tvshow\/(.+)$/);
    if (m) {
        return { kind: "tvshow", slug: decodeURIComponent(m[1]) };
    }

    m = url.match(
        /^pp:\/\/episode\/([^\/]+)\/([^\/]+)\/(\d+)\/(\d+)(?:\/([^\/]*))?$/
    );

    if (m) {
        return {
            kind: "episode",
            episodeId: decodeURIComponent(m[1]),
            showId: decodeURIComponent(m[2]),
            season: parseInt(m[3], 10),
            episode: parseInt(m[4], 10),
            slug: m[5] ? decodeURIComponent(m[5]) : ""
        };
    }

    return null;
}

/* ---------- Catálogo ---------- */

function makeCatalogItem(x) {
    if (!x || !x.slug) return null;

    var type = x.type || "movie";
    var internal;

    if (type == "movie") {
        internal = "pp://movie/" + encodeURIComponent(x.slug);
    } else {
        internal = "pp://tvshow/" + encodeURIComponent(x.slug);
    }

    return makeVideo(
        type + "_" + x.id,
        x.title || x.originalTitle || "Sin título",
        coverCandidates(type, x.coverPath, false),
        internal
    );
}

function search(query) {
    var q = String(query || "").trim();

    if (!q) return [];

    var d = gql(Q_SEARCH, { query: q });
    if (!d) return [];

    var out = [];
    var seen = {};

    var groups = [
        d.movies && d.movies.items ? d.movies.items : [],
        d.tvshows && d.tvshows.items ? d.tvshows.items : []
    ];

    for (var g = 0; g < groups.length; g++) {
        for (var i = 0; i < groups[g].length && out.length < MAX_SEARCH; i++) {
            var x = groups[g][i];
            if (!x) continue;

            var key = String(x.type || "") + ":" + String(x.id || x.slug || "");
            if (seen[key]) continue;
            seen[key] = true;

            var v = makeCatalogItem(x);
            if (v) out.push(v);
        }
    }

    log("SEARCH '" + q + "' -> " + out.length + " resultados");
    return out;
}

function home() {
    var out = [];
    var seen = {};

    var lists = [
        { page: 1, type: "movie", genreSlug: null },
        { page: 1, type: "tvshow", genreSlug: null }
    ];

    for (var k = 0; k < lists.length; k++) {
        var d = gql(Q_LIST, lists[k]);

        if (!d || !d.showList || !d.showList.items) {
            log("HOME lista '" + lists[k].type + "' sin items");
            continue;
        }

        for (var i = 0; i < d.showList.items.length && out.length < 40; i++) {
            var x = d.showList.items[i];
            if (!x) continue;

            var key = String(x.type) + ":" + String(x.id);
            if (seen[key]) continue;
            seen[key] = true;

            var v = makeCatalogItem(x);
            if (v) out.push(v);
        }
    }

    log("HOME -> " + out.length + " items");
    return out;
}

/* ---------- Detalles ---------- */

function getShow(slug, type) {
    var d = gql(Q_DETAILS, {
        type: type,
        slug: slug
    });

    return d && d.show ? d.show : null;
}

function movieDetails(x, slug) {
    var sourcesData = gql(Q_MOVIE_LINKS, {
        itemId: String(x.id)
    });

    var mirrors =
        sourcesData &&
        sourcesData.links &&
        sourcesData.links.mirrors
            ? sourcesData.links.mirrors
            : [];

    var sources = sourceList(mirrors);

    var desc = x.overview || "";

    if (x.originalTitle && x.originalTitle != x.title) {
        desc += "\n\nTítulo original: " + x.originalTitle;
    }

    if (x.year) {
        desc += "\nAño: " + x.year;
    }

    desc +=
        "\n\nMirrors recibidos: " + mirrors.length +
        "\nFuentes reproducibles: " + sources.length;

    if (_debug) {
        desc += "\n\n=== DEBUG ===\n" + _debug;
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "movie_" + x.id, PID),
        name: x.title || x.originalTitle || "Película",
        thumbnails: thumb(coverCandidates("movie", x.coverPath, false)),
        author: author(),
        uploadDate: 0,
        url: "pp://movie/" + encodeURIComponent(slug),
        duration: x.duration ? x.duration * 60 : 0,
        viewCount: 0,
        isLive: false,
        video: new VideoSourceDescriptor(sources),
        description: desc
    });
}

function episodeSources(id) {
    var d = gql(Q_EPISODE_VIDEOS, {
        itemId: String(id)
    });

    var videos = d && d.videos ? d.videos : [];

    return {
        raw: videos,
        sources: sourceList(videos)
    };
}

function detailEpisode(show, ep, season, number) {
    var r = episodeSources(ep.id);

    var desc =
        (show.overview || "") +
        "\n\nTemporada " + season +
        " · Episodio " + number +
        "\n" + (ep.title || "") +
        "\n\nVideos recibidos: " + r.raw.length +
        "\nFuentes reproducibles: " + r.sources.length;

    if (_debug) {
        desc += "\n\n=== DEBUG ===\n" + _debug;
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "episode_" + ep.id, PID),
        name:
            (show.title || "Serie") +
            " S" + season +
            "E" + number +
            (ep.title ? " - " + ep.title : ""),
        thumbnails: thumb(
            coverCandidates("tvshow", show.coverPath, false)
        ),
        author: author(),
        uploadDate: 0,
        url: episodeUrl(ep.id, show.id, season, number, show.slug),
        duration: 0,
        viewCount: 0,
        isLive: false,
        video: new VideoSourceDescriptor(r.sources),
        description: desc
    });
}

function seasonsFor(showId) {
    var d = gql(Q_SEASONS, {
        showId: String(showId)
    });

    return d && d.seasonList && d.seasonList.items
        ? d.seasonList.items
        : [];
}

function episodesFor(showId, season) {
    var d = gql(Q_EPISODES, {
        showId: String(showId),
        seasonNumber: parseInt(season, 10),
        limit: MAX_EPISODES,
        page: 1
    });

    return d &&
        d.seasonEpisodesList &&
        d.seasonEpisodesList.items
        ? d.seasonEpisodesList.items
        : [];
}

function seriesDetails(show, slug) {
    var seasons = seasonsFor(show.id);
    var desc = show.overview || "";

    desc += "\n\nTemporadas: ";

    var nums = [];
    for (var i = 0; i < seasons.length && i < MAX_SEASONS; i++) {
        nums.push(String(seasons[i].number));
    }

    desc += nums.length ? nums.join(", ") : "sin datos";

    var sources = [];

    if (seasons.length) {
        var eps = episodesFor(show.id, seasons[0].number);

        if (eps.length) {
            var r = episodeSources(eps[0].id);
            sources = r.sources;

            desc +=
                "\n\nPrimera fuente: S" +
                seasons[0].number +
                "E" +
                eps[0].number +
                "\nFuentes reproducibles: " +
                sources.length;
        }
    }

    if (_debug) {
        desc += "\n\n=== DEBUG ===\n" + _debug;
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "tv_" + show.id, PID),
        name: show.title || "Serie",
        thumbnails: thumb(
            coverCandidates("tvshow", show.coverPath, false)
        ),
        author: author(),
        uploadDate: 0,
        url: "pp://tvshow/" + encodeURIComponent(slug),
        duration: 0,
        viewCount: 0,
        isLive: false,
        video: new VideoSourceDescriptor(sources),
        description: desc
    });
}

function recommendations(url) {
    var p = parseItemUrl(url);

    if (!p || p.kind != "tvshow") return [];

    var show = getShow(p.slug, "tvshow");
    if (!show) return [];

    var seasons = seasonsFor(show.id);
    var out = [];

    for (var s = 0; s < seasons.length && out.length < MAX_EPISODES; s++) {
        var seasonNumber = parseInt(seasons[s].number, 10);
        var eps = episodesFor(show.id, seasonNumber);

        for (var e = 0; e < eps.length && out.length < MAX_EPISODES; e++) {
            var ep = eps[e];

            out.push(
                makeVideo(
                    "episode_" + ep.id,
                    (show.title || "Serie") +
                        " S" + seasonNumber +
                        "E" + ep.number +
                        (ep.title ? " - " + ep.title : ""),
                    coverCandidates(
                        "tvshow",
                        ep.coverPath || show.coverPath,
                        true
                    ),
                    episodeUrl(ep.id, show.id, seasonNumber, ep.number, show.slug)
                )
            );
        }
    }

    return out;
}

function getDetails(url) {
    resetDebug();

    var p = parseItemUrl(url);
    if (!p) return null;

    if (p.kind == "movie") {
        var movie = getShow(p.slug, "movie");

        if (!movie) {
            return errorDetails(url, "Película no encontrada");
        }

        return movieDetails(movie, p.slug);
    }

    if (p.kind == "tvshow") {
        var show = getShow(p.slug, "tvshow");

        if (!show) {
            return errorDetails(url, "Serie no encontrada");
        }

        return seriesDetails(show, p.slug);
    }

    if (p.kind == "episode") {
        if (!p.slug) {
            return errorDetails(url, "URL de episodio sin slug de serie");
        }

        var show2 = getShow(p.slug, "tvshow");

        if (!show2) {
            return errorDetails(url, "No se pudo localizar la serie del episodio");
        }

        var eps = episodesFor(p.showId, p.season);
        var target = null;

        for (var i = 0; i < eps.length; i++) {
            if (String(eps[i].id) == String(p.episodeId)) {
                target = eps[i];
                break;
            }

            if (parseInt(eps[i].number, 10) == p.episode) {
                target = eps[i];
            }
        }

        if (!target) {
            return errorDetails(url, "Episodio no encontrado");
        }

        return detailEpisode(
            show2,
            target,
            p.season,
            p.episode
        );
    }

    return null;
}

function errorDetails(url, msg) {
    return new PlatformVideoDetails({
        id: new PlatformID(
            PLATFORM,
            "error_" + String(url),
            PID
        ),
        name: "PlayPelis - " + msg,
        thumbnails: new Thumbnails([]),
        author: author(),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        isLive: false,
        url: url || WEB,
        video: new VideoSourceDescriptor([]),
        description:
            msg +
            "\n\nAPI: " + API +
            (_debug ? "\n\n=== DEBUG ===\n" + _debug : "")
    });
}

/* ---------- Interfaz de GrayJay ---------- */

if (typeof source !== "undefined") {

    source.setSettings = function(s) {
        _settings = s || {};
    };

    source.enable = function(conf, settings, savedState) {
        _settings = settings || {};
    };

    source.getSearchCapabilities = function() {
        return {
            types: [Type.Feed.Mixed],
            sorts: [],
            filters: []
        };
    };

    source.search = function(query) {
        resetDebug();

        var items = [];

        try {
            items = search(query || "");
        } catch (e) {
            log("SEARCH exception: " + String(e));
        }

        if (!items.length && DEBUG_THROW) {
            throw new ScriptException("Búsqueda vacía. " + _debug);
        }

        return new VideoPager(items, false, null);
    };

    source.searchSuggestions = function(query) {
        return [];
    };

    source.getHome = function() {
        resetDebug();

        var items = [];

        try {
            items = home();
        } catch (e) {
            log("HOME exception: " + String(e));
        }

        if (!items.length && DEBUG_THROW) {
            throw new ScriptException("Home vacío. " + _debug);
        }

        return new VideoPager(items, false, null);
    };

    source.isChannelUrl = function(url) {
        return false;
    };

    source.isContentDetailsUrl = function(url) {
        if (!url) return false;

        return String(url).indexOf("pp://movie/") === 0 ||
            String(url).indexOf("pp://tvshow/") === 0 ||
            String(url).indexOf("pp://episode/") === 0;
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

            if (d) return d;

            return errorDetails(
                url,
                "No se pudo obtener el contenido"
            );
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
            log("RECOMMENDATIONS exception: " + String(e));
            return new VideoPager([], false, null);
        }
    };
}
