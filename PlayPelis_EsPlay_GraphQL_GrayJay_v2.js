/*
 * PlayPelis / EsPlay GraphQL - GrayJay Source v2
 * API recovered from PlayPelis 1.4.8 APK.
 *
 * Backend:
 *   https://api.esplay.one/graphql
 *
 * Web/catalog:
 *   https://pelisplus2.ai
 *
 * Covers:
 *   https://static.esplay.one/{movie|tvshow}/cover/original/{coverPath}
 *
 * GraphQL operations recovered from the APK:
 *   - showSearch
 *   - showList
 *   - show
 *   - seasonList
 *   - seasonEpisodesList
 *   - videoLinks
 *   - videos
 *
 * This source talks directly to the GraphQL backend recovered from the APK.
 * It does not bypass provider protections or scrape arbitrary third-party pages.
 */

var PID = "f8c3b1e7-6a42-4d9e-b205-71c8a4f9306d";
var PLATFORM = "PlayPelis";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);

var API = "https://api.esplay.one/graphql";
var WEB = "https://pelisplus2.ai";
var STATIC = "https://static.esplay.one";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

var _settings = {};
var _debug = "";

var MAX_SOURCES = 12;
var MAX_SEARCH = 40;
var MAX_EPISODES = 500;
var MAX_SEASONS = 50;

function log(s) {
    _debug += String(s) + "\n";
}

function httpPostJson(url, obj) {
    try {
        var body = JSON.stringify(obj);
        var r = http.POST(
            url,
            body,
            {
                "User-Agent": UA,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Origin": WEB,
                "Referer": WEB + "/"
            },
            false,
            false
        );

        if (!r || !r.body) {
            log("POST vacío: " + url);
            return null;
        }

        return JSON.parse(r.body);
    } catch (e) {
        log("POST exception: " + String(e));
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
        log("GraphQL error: " + JSON.stringify(r.errors));
        return null;
    }

    return r.data || null;
}

function esc(s) {
    return String(s == null ? "" : s);
}

function cleanUrl(s) {
    if (!s) return "";
    return String(s)
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&")
        .trim();
}

function cover(type, path, small) {
    if (!path) return "";
    var p = String(path).replace(/^\/+/, "");

    if (/^https?:\/\//i.test(p)) {
        return p;
    }

    if (small) {
        return STATIC + "/" + type + "/episode/small/" + p;
    }

    return STATIC + "/" + type + "/cover/original/" + p;
}

function thumb(url) {
    if (!url) return new Thumbnails([]);
    return new Thumbnails([new Thumbnail(url, 100)]);
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

function video(id, title, image, url) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, String(id), PID),
        name: title || "Sin título",
        thumbnails: thumb(image),
        author: author(),
        uploadDate: 0,
        url: url,
        duration: 0,
        viewCount: 0,
        isLive: false
    });
}

function hls(url, name, duration) {
    url = cleanUrl(url);
    if (!url) return null;

    if (/\.m3u8(?:[?#]|$)/i.test(url)) {
        return new HLSSource({
            name: name || "HLS",
            url: url,
            duration: duration || 0
        });
    }

    return null;
}

function directSource(url, name, duration) {
    url = cleanUrl(url);
    if (!url) return null;

    if (/\.m3u8(?:[?#]|$)/i.test(url)) {
        return hls(url, name, duration);
    }

    if (/\.mp4(?:[?#]|$)/i.test(url)) {
        return new VideoUrlSource({
            width: 0,
            height: 0,
            container: "mp4",
            codec: "",
            name: name || "MP4",
            bitrate: 0,
            duration: duration || 0,
            url: url
        });
    }

    /*
     * Some providers return an embed/deep-link rather than the final
     * manifest. Keep it as a URL only when it is already a media URL.
     * We deliberately do not scrape arbitrary provider pages here.
     */
    return null;
}

function sourceList(items) {
    var out = [];
    if (!items) return out;

    var seen = {};

    for (var i = 0; i < items.length && out.length < MAX_SOURCES; i++) {
        var x = items[i];
        if (!x || !x.url) continue;

        var u = cleanUrl(x.url);
        if (!u || seen[u]) continue;
        seen[u] = true;

        var label =
            (x.server ? String(x.server) : "Servidor") +
            (x.quality ? " [" + String(x.quality) + "]" : "") +
            (x.language ? " [" + String(x.language) + "]" : "");

        var src = directSource(
            u,
            label,
            0
        );

        if (src) {
            out.push(src);
            log("SOURCE OK: " + label + " -> " + u);
        } else {
            log("SOURCE no-directa: " + label + " -> " + u);
        }
    }

    return out;
}

var Q_SEARCH =
'query mySearchItems($query: String!) {' +
'  movies: showSearch(query: $query, type: "movie", limit: 20) {' +
'    totalCount items { id title slug coverPath year overview type quality { type language } }' +
'  }' +
'  tvshows: showSearch(query: $query, type: "tvshow", limit: 20) {' +
'    totalCount items { id title slug coverPath year overview type quality { type language } }' +
'  }' +
'}';

var Q_LIST =
'query myShowListPage($page: Int!, $type: String!, $genreSlug: String) {' +
'  showList(page: $page, type: $type, limit: 20, genreSlug: $genreSlug) {' +
'    totalCount items {' +
'      id title slug coverPath year overview type quality { type language }' +
'    }' +
'  }' +
'}';

var Q_DETAILS =
'query showItem($type: String!, $slug: String!) {' +
'  show(type: $type, slug: $slug) {' +
'    id title originalTitle type coverPath duration overview popularity slug year' +
'    quality { type language } genres { id slug name } country { name } cast { name }' +
'  }' +
'}';

var Q_SEASONS =
'query getSeason($showId: String!) {' +
'  seasonList(showId: $showId, limit: 500, page: 1) {' +
'    totalCount items { episodeCount number }' +
'  }' +
'}';

var Q_EPISODES =
'query season($showId: String!, $seasonNumber: Int!, $limit: Int, $page: Int) {' +
'  seasonEpisodesList(showId: $showId, number: $seasonNumber, limit: $limit, page: $page) {' +
'    totalCount season { title slug }' +
'    items { id title slug number overview coverPath releaseDate }' +
'  }' +
'}';

var Q_MOVIE_LINKS =
'query videoLinks($itemId: String!) {' +
'  links(itemId: $itemId) {' +
'    mirrors { language url quality sandbox type server updatedAt status }' +
'  }' +
'}';

var Q_EPISODE_VIDEOS =
'query queryVideos($itemId: String!) {' +
'  videos(itemId: $itemId) {' +
'    language url quality sandbox type server updatedAt status' +
'  }' +
'}';

function itemTypeFromUrl(url) {
    return url.indexOf("/movie/") >= 0 ? "movie" : "tvshow";
}

function parseItemUrl(url) {
    /*
     * Internal format:
     *   pp://movie/<slug>
     *   pp://tvshow/<slug>
     *   pp://episode/<episodeId>/<showId>/<season>/<episode>
     */
    var m;

    m = String(url || "").match(/^pp:\/\/movie\/(.+)$/);
    if (m) return {
        kind: "movie",
        slug: decodeURIComponent(m[1])
    };

    m = String(url || "").match(/^pp:\/\/tvshow\/(.+)$/);
    if (m) return {
        kind: "tvshow",
        slug: decodeURIComponent(m[1])
    };

    m = String(url || "").match(
        /^pp:\/\/episode\/([^\/]+)\/([^\/]+)\/(\d+)\/(\d+)$/
    );

    if (m) return {
        kind: "episode",
        episodeId: m[1],
        showId: m[2],
        season: parseInt(m[3], 10),
        episode: parseInt(m[4], 10)
    };

    return null;
}

function makeCatalogItem(x) {
    if (!x) return null;

    var type = x.type || "movie";
    var internal =
        type == "movie"
            ? "pp://movie/" + encodeURIComponent(x.slug)
            : "pp://tvshow/" + encodeURIComponent(x.slug);

    return video(
        type + "_" + x.id,
        x.title || "Sin título",
        cover(type, x.coverPath, false),
        internal
    );
}

function search(query) {
    var d = gql(Q_SEARCH, { query: String(query || "").trim() });
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
            if (!x || seen[x.type + ":" + x.id]) continue;
            seen[x.type + ":" + x.id] = true;

            var v = makeCatalogItem(x);
            if (v) out.push(v);
        }
    }

    return out;
}

function home() {
    var out = [];
    var seen = {};

    var lists = [
        { type: "movie", page: 1, genreSlug: null },
        { type: "tvshow", page: 1, genreSlug: null }
    ];

    for (var k = 0; k < lists.length; k++) {
        var d = gql(Q_LIST, lists[k]);
        if (!d || !d.showList || !d.showList.items) continue;

        for (var i = 0; i < d.showList.items.length && out.length < 40; i++) {
            var x = d.showList.items[i];
            var key = String(x.type) + ":" + String(x.id);
            if (seen[key]) continue;
            seen[key] = true;

            var v = makeCatalogItem(x);
            if (v) out.push(v);
        }
    }

    return out;
}

function detailForMovie(x, slug) {
    var desc = x.overview || "";

    if (x.originalTitle && x.originalTitle != x.title) {
        desc += "\n\nTítulo original: " + x.originalTitle;
    }

    if (x.year) desc += "\nAño: " + x.year;

    if (x.genres && x.genres.length) {
        var gs = [];
        for (var i = 0; i < x.genres.length; i++) {
            gs.push(x.genres[i].name);
        }
        desc += "\nGéneros: " + gs.join(", ");
    }

    var d = gql(Q_MOVIE_LINKS, { itemId: String(x.id) });
    var mirrors =
        d && d.links && d.links.mirrors
            ? d.links.mirrors
            : [];

    var sources = sourceList(mirrors);

    desc +=
        "\n\nAPI: GraphQL / videoLinks" +
        "\nMirrors recibidos: " + mirrors.length +
        "\nFuentes directas utilizables: " + sources.length;

    if (_debug) {
        desc += "\n\n=== DEBUG ===\n" + _debug;
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "movie_" + x.id, PID),
        name: x.title || "Sin título",
        thumbnails: thumb(cover("movie", x.coverPath, false)),
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

function episodeSources(episodeId) {
    var d = gql(Q_EPISODE_VIDEOS, {
        itemId: String(episodeId)
    });

    var videos = d && d.videos ? d.videos : [];
    return {
        raw: videos,
        sources: sourceList(videos)
    };
}

function detailForEpisode(show, ep, season, number) {
    var r = episodeSources(ep.id);
    var desc =
        (show.overview || "") +
        "\n\nTemporada " + season +
        " · Episodio " + number +
        "\n" + (ep.title || "");

    if (ep.overview) desc += "\n\n" + ep.overview;

    desc +=
        "\n\nAPI: GraphQL / queryVideos" +
        "\nVideos recibidos: " + r.raw.length +
        "\nFuentes directas utilizables: " + r.sources.length;

    if (_debug) {
        desc += "\n\n=== DEBUG ===\n" + _debug;
    }

    return new PlatformVideoDetails({
        id: new PlatformID(
            PLATFORM,
            "episode_" + ep.id,
            PID
        ),
        name:
            (show.title || "Serie") +
            " S" + season +
            "E" + number +
            " - " + (ep.title || ""),
        thumbnails: thumb(
            cover("tvshow", show.coverPath, false)
        ),
        author: author(),
        uploadDate: 0,
        url:
            "pp://episode/" +
            encodeURIComponent(ep.id) + "/" +
            encodeURIComponent(show.id) + "/" +
            season + "/" + number,
        duration: 0,
        viewCount: 0,
        isLive: false,
        video: new VideoSourceDescriptor(r.sources),
        description: desc
    });
}

function getShow(slug, type) {
    var d = gql(Q_DETAILS, {
        type: type,
        slug: slug
    });

    return d && d.show ? d.show : null;
}

function getDetails(url) {
    _debug = "";

    var p = parseItemUrl(url);
    if (!p) return null;

    if (p.kind == "movie") {
        var movie = getShow(p.slug, "movie");
        if (!movie) return errorDetails(url, "Película no encontrada");
        return detailForMovie(movie, p.slug);
    }

    if (p.kind == "tvshow") {
        var show = getShow(p.slug, "tvshow");
        if (!show) return errorDetails(url, "Serie no encontrada");

        var desc = show.overview || "";
        desc += "\n\nTemporadas: ";

        var sd = gql(Q_SEASONS, { showId: String(show.id) });
        var seasons =
            sd && sd.seasonList && sd.seasonList.items
                ? sd.seasonList.items
                : [];

        var nums = [];
        for (var i = 0; i < seasons.length && i < MAX_SEASONS; i++) {
            nums.push(String(seasons[i].number));
        }

        desc += nums.length ? nums.join(", ") : "sin datos";

        /*
         * GrayJay can load the episode list through recommendations.
         * To make the series immediately playable, resolve S1E1 when it exists.
         */
        var first = null;
        if (seasons.length) {
            var firstSeason = seasons[0].number;
            var ed = gql(Q_EPISODES, {
                showId: String(show.id),
                seasonNumber: parseInt(firstSeason, 10),
                limit: MAX_EPISODES,
                page: 1
            });

            var eps =
                ed && ed.seasonEpisodesList &&
                ed.seasonEpisodesList.items
                    ? ed.seasonEpisodesList.items
                    : [];

            if (eps.length) {
                first = {
                    ep: eps[0],
                    season: firstSeason,
                    number: eps[0].number
                };
            }
        }

        var sources = [];
        if (first) {
            var er = episodeSources(first.ep.id);
            sources = er.sources;
            desc +=
                "\n\nReproduciendo por defecto: T" +
                first.season + "E" +
                first.number +
                "\nFuentes directas: " +
                sources.length;
        }

        if (_debug) desc += "\n\n=== DEBUG ===\n" + _debug;

        return new PlatformVideoDetails({
            id: new PlatformID(PLATFORM, "tv_" + show.id, PID),
            name: show.title || "Serie",
            thumbnails: thumb(
                cover("tvshow", show.coverPath, false)
            ),
            author: author(),
            uploadDate: 0,
            duration: 0,
            viewCount: 0,
            isLive: false,
            url: "pp://tvshow/" + encodeURIComponent(p.slug),
            video: new VideoSourceDescriptor(sources),
            description: desc
        });
    }

    if (p.kind == "episode") {
        var show2 = getShowById(p.showId);
        if (!show2) {
            return errorDetails(url, "Serie no encontrada");
        }

        var ed2 = gql(Q_EPISODES, {
            showId: String(p.showId),
            seasonNumber: p.season,
            limit: MAX_EPISODES,
            page: 1
        });

        var eps2 =
            ed2 && ed2.seasonEpisodesList &&
            ed2.seasonEpisodesList.items
                ? ed2.seasonEpisodesList.items
                : [];

        var target = null;
        for (var j = 0; j < eps2.length; j++) {
            if (String(eps2[j].id) == String(p.episodeId)) {
                target = eps2[j];
                break;
            }
            if (parseInt(eps2[j].number, 10) == p.episode) {
                target = eps2[j];
            }
        }

        if (!target) {
            return errorDetails(url, "Episodio no encontrado");
        }

        return detailForEpisode(
            show2,
            target,
            p.season,
            p.episode
        );
    }

    return null;
}

function getShowById(id) {
    /*
     * The API's show() query is slug based. For episode details we
     * therefore discover the show through a small search only when
     * the caller opened an episode URL directly.
     */
    var d = gql(Q_SEARCH, { query: "" });
    /*
     * Empty search is not guaranteed to work. Prefer the episode's
     * cover/title path when available; if this fails, recommendations
     * still expose playable episode URLs.
     */
    if (!d) return null;

    var groups = [
        d.movies && d.movies.items ? d.movies.items : [],
        d.tvshows && d.tvshows.items ? d.tvshows.items : []
    ];

    for (var i = 0; i < groups.length; i++) {
        for (var j = 0; j < groups[i].length; j++) {
            if (String(groups[i][j].id) == String(id)) {
                return getShow(
                    groups[i][j].slug,
                    "tvshow"
                );
            }
        }
    }

    return null;
}

function recommendations(url) {
    var p = parseItemUrl(url);
    if (!p || p.kind != "tvshow") return [];

    var show = getShow(p.slug, "tvshow");
    if (!show) return [];

    var sd = gql(Q_SEASONS, {
        showId: String(show.id)
    });

    var seasons =
        sd && sd.seasonList && sd.seasonList.items
            ? sd.seasonList.items
            : [];

    var out = [];

    for (var s = 0; s < seasons.length; s++) {
        if (out.length >= MAX_EPISODES) break;

        var seasonNumber =
            parseInt(seasons[s].number, 10);

        var ed = gql(Q_EPISODES, {
            showId: String(show.id),
            seasonNumber: seasonNumber,
            limit: MAX_EPISODES,
            page: 1
        });

        var eps =
            ed && ed.seasonEpisodesList &&
            ed.seasonEpisodesList.items
                ? ed.seasonEpisodesList.items
                : [];

        for (var e = 0; e < eps.length && out.length < MAX_EPISODES; e++) {
            var ep = eps[e];

            out.push(
                video(
                    "episode_" + ep.id,
                    (show.title || "Serie") +
                        " S" + seasonNumber +
                        "E" + ep.number +
                        (ep.title ? " - " + ep.title : ""),
                    cover("tvshow", ep.coverPath, true) ||
                        cover("tvshow", show.coverPath, false),
                    "pp://episode/" +
                        encodeURIComponent(ep.id) + "/" +
                        encodeURIComponent(show.id) + "/" +
                        seasonNumber + "/" +
                        ep.number
                )
            );
        }
    }

    return out;
}

function errorDetails(url, msg) {
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "error_" + String(url), PID),
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
            "\n\nGraphQL: " + API +
            (_debug ? "\n\n=== DEBUG ===\n" + _debug : "")
    });
}

if (typeof source !== "undefined") {

    source.setSettings = function(s) {
        _settings = s || {};
    };

    source.enable = function(c, s) {
        _settings = s || {};
    };

    source.getSearchCapabilities = function() {
        return {
            types: [2],
            sorts: [],
            filters: []
        };
    };

    source.search = function(query) {
        try {
            return new VideoPager(
                search(query || ""),
                false,
                null
            );
        } catch (e) {
            return new VideoPager([], false, null);
        }
    };

    source.searchSuggestions = function(query) {
        return [];
    };

    source.getHome = function() {
        try {
            return new VideoPager(
                home(),
                false,
                null
            );
        } catch (e) {
            return new VideoPager([], false, null);
        }
    };

    source.isChannelUrl = function(url) {
        return false;
    };

    source.isContentDetailsUrl = function(url) {
        if (!url) return false;

        return (
            String(url).indexOf("pp://movie/") === 0 ||
            String(url).indexOf("pp://tvshow/") === 0 ||
            String(url).indexOf("pp://episode/") === 0
        );
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
            return errorDetails(url, "No se pudo obtener el contenido");
        } catch (e) {
            _debug += "DETAIL exception: " + String(e) + "\n";
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
