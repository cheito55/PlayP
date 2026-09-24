// PlayPelis GrayJay Source v42
// Multi-servidor + HLS + diagnóstico
// Cambios v42:
//  - fixImg: soporta paths tipo TMDB con barra inicial ("/xxx.jpg") que antes devolvían "" (portadas rotas)
//  - Nuevo source.getContentRecommendations: expone cada episodio como PlatformVideo navegable
//  - ppSerieDetails: ahora resuelve y precarga las fuentes del Episodio 1 (S1E1) para que la serie
//    arranque reproduciendo directamente al tocarla, en vez de quedar sin video
var PID = "8a2f4b7e-3c1d-4f6a-9b8e-5d2c1a9f6e40";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

var PPID = new PlatformID("PlayPelis", "PlayPelis", PID);
var _settings = {};
var _debugLog = "";

var IPTV_URL = "https://plpro.org";
var IPTV_USER = "p";
var IPTV_PASS = "p";
var JK = "https://jkanime.net";
var TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// =========================================================
// CONFIGURACIÓN
// =========================================================

// Ahora prueba hasta 10 servidores.
// Si hay menos, prueba los que existan.
var MAX_TRY = 10;

// =========================================================
// DEBUG
// =========================================================

function addDebug(msg) {
    _debugLog += String(msg) + "\n";
}

// =========================================================
// HTTP
// =========================================================

function httpGet(url, headers) {
    try {
        var h = headers || {};

        if (!h["User-Agent"] && !h["user-agent"]) {
            h["User-Agent"] = UA;
        }

        var r = http.GET(url, h);

        return (r && r.body) ? r.body : "";
    } catch (e) {
        addDebug("HTTP Exception en " + url + ": " + String(e));
        return "";
    }
}

// =========================================================
// UTILIDADES
// =========================================================

function getHost(url) {
    try {
        var m = String(url).match(/^https?:\/\/([^\/?#]+)/i);
        return m ? m[1].toLowerCase() : "";
    } catch (e) {
        return "";
    }
}

function slugify(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function slugToTitle(s) {
    return String(s || "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, function(c) {
            return c.toUpperCase();
        });
}

function b64decode(s) {
    try {
        return decodeURIComponent(
            atob(s).split("").map(function(c) {
                return "%" +
                    ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            }).join("")
        );
    } catch (e) {
        try {
            return atob(s);
        } catch (e2) {
            return "";
        }
    }
}

function htmlDecode(s) {
    if (!s) return "";

    return String(s)
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#(\d+);/g, function(m, d) {
            return String.fromCharCode(parseInt(d, 10));
        })
        .replace(/&#x([0-9a-fA-F]+);/g, function(m, x) {
            return String.fromCharCode(parseInt(x, 16));
        });
}

function stripTags(s) {
    if (!s) return "";

    return htmlDecode(
        String(s)
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
    ).trim();
}

// FIX v42: antes, cualquier path que contuviera una "/" (por ejemplo
// "/9BBTtGToQIz3lyIt.jpg", el formato típico que devuelve TMDB) fallaba
// la condición y la función devolvía "" -> portada rota. Ahora se
// interpreta como path relativo estilo TMDB independientemente de si
// trae o no la barra inicial.
function fixImg(u) {
    if (!u) return "";

    var s = String(u).trim();

    if (s.indexOf("ttps://") === 0) {
        s = "https" + s.substring(4);
    }

    if (/^https?:\/\//i.test(s)) {
        return s;
    }

    s = s.replace(/^\/+/, "");

    if (!s) return "";

    if (
        s.indexOf(".jpg") === -1 &&
        s.indexOf(".png") === -1 &&
        s.indexOf(".webp") === -1
    ) {
        s += ".jpg";
    }

    return TMDB_IMG + "/" + s;
}

// =========================================================
// VIDEO OBJECTS
// =========================================================

function mkThumb(url) {
    if (!url) {
        return new Thumbnails([]);
    }

    return new Thumbnails([
        new Thumbnail(url, 100)
    ]);
}

function mkVideo(id, title, thumb, url, authorName) {
    return new PlatformVideo({
        id: new PlatformID(
            "PlayPelis",
            String(id),
            PID
        ),

        name: title || "Sin titulo",

        thumbnails: mkThumb(thumb),

        author: new PlatformAuthorLink(
            PPID,
            authorName || "PlayPelis",
            "https://playpelis.app",
            "",
            0
        ),

        uploadDate: 0,
        url: url,
        duration: 0,
        viewCount: 0,
        isLive: false
    });
}

function mkHls(url, name, duration) {
    if (!url) return null;

    return new HLSSource({
        name: name || "HLS",
        url: url,
        duration: duration || 0
    });
}

// =========================================================
// URL / HLS
// =========================================================

function isM3u8Url(url) {
    try {
        if (!url) return false;

        return /\.m3u8(?:[?#]|$)/i.test(
            String(url)
        );
    } catch (e) {
        return false;
    }
}

function cleanUrl(url) {
    if (!url) return "";

    var s = String(url).trim();

    s = htmlDecode(s);

    s = s.replace(/\\u0026/g, "&");
    s = s.replace(/\\\//g, "/");

    return s;
}

function directHls(url) {
    try {
        url = cleanUrl(url);

        if (!isM3u8Url(url)) {
            return null;
        }

        addDebug("[hls] m3u8 directa detectada");

        return url;
    } catch (e) {
        addDebug("[hls] EXCEPTION: " + String(e));
        return null;
    }
}

// =========================================================
// Vidhide
// =========================================================

function vidhideExtract(pageUrl) {
    try {
        var fetchUrl = pageUrl;

        if (
            fetchUrl.indexOf("vidhidefast.com") !== -1
        ) {
            fetchUrl = fetchUrl.replace(
                "vidhidefast.com",
                "callistanise.com"
            );
        }

        if (
            fetchUrl.indexOf("vidhide.com") !== -1 &&
            fetchUrl.indexOf("callistanise") === -1
        ) {
            fetchUrl = fetchUrl.replace(
                "vidhide.com",
                "callistanise.com"
            );
        }

        var embedHost = getHost(fetchUrl);

        var refererBase =
            "https://" + embedHost + "/";

        addDebug(
            "[vidhide] fetch=" + fetchUrl
        );

        var html = httpGet(
            fetchUrl,
            {
                "User-Agent": UA,
                "Referer": refererBase
            }
        );

        addDebug(
            "[vidhide] htmlLen=" +
            (html ? html.length : 0)
        );

        if (
            !html ||
            html.length < 500
        ) {
            addDebug(
                "[vidhide] HTML insuficiente"
            );

            return null;
        }

        var splitIdx =
            html.lastIndexOf(".split('|')");

        addDebug(
            "[vidhide] splitIdx=" +
            splitIdx
        );

        if (splitIdx === -1) {
            addDebug(
                "[vidhide] No se encontró .split('|')"
            );

            return null;
        }

        var keyEnd =
            html.lastIndexOf(
                "'",
                splitIdx
            );

        var keyStart =
            html.lastIndexOf(
                "'",
                keyEnd - 1
            ) + 1;

        var key =
            html.substring(
                keyStart,
                keyEnd
            );

        var keyArr =
            key.split("|");

        addDebug(
            "[vidhide] keyArrLen=" +
            keyArr.length
        );

        if (keyArr.length < 50) {
            addDebug(
                "[vidhide] Array demasiado corto"
            );

            return null;
        }

        function decode(str) {
            return str.replace(
                /[a-z0-9]+/g,
                function(token) {
                    var val =
                        parseInt(token, 36);

                    if (
                        !isNaN(val) &&
                        val > 0 &&
                        val < keyArr.length &&
                        keyArr[val] &&
                        keyArr[val].length > 1
                    ) {
                        return keyArr[val];
                    }

                    return token;
                }
            );
        }

        var urls =
            html.match(
                /["'][a-z0-9]+:\/\/[^"']+["']/gi
            ) || [];

        addDebug(
            "[vidhide] candidateUrls=" +
            urls.length
        );

        var best = null;

        for (
            var i = 0;
            i < urls.length;
            i++
        ) {
            var raw =
                urls[i].substring(
                    1,
                    urls[i].length - 1
                );

            var dec =
                cleanUrl(
                    decode(raw)
                );

            if (
                dec.indexOf("master.") !== -1 &&
                dec.indexOf(".m3u8") !== -1
            ) {
                best = dec;
                break;
            }

            if (
                !best &&
                dec.indexOf("master.") !== -1 &&
                dec.indexOf(".txt") !== -1
            ) {
                best = dec;
            }
        }

        addDebug(
            "[vidhide] best=" +
            (best || "none")
        );

        if (!best) {
            return null;
        }

        // Si ya es M3U8, devolver directamente.
        if (isM3u8Url(best)) {
            return best;
        }

        // Algunos servidores entregan master.txt.
        if (/\.txt(?:[?#]|$)/i.test(best)) {
            addDebug(
                "[vidhide] master.txt detectado"
            );

            var txt = httpGet(
                best,
                {
                    "User-Agent": UA,
                    "Referer": refererBase
                }
            );

            addDebug(
                "[vidhide] txtLen=" +
                (txt ? txt.length : 0)
            );

            if (txt) {
                var m3u =
                    txt.match(
                        /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i
                    );

                if (m3u && m3u[0]) {
                    var finalUrl =
                        cleanUrl(m3u[0]);

                    addDebug(
                        "[vidhide] m3u8 encontrada dentro de master.txt"
                    );

                    return finalUrl;
                }
            }
        }

        addDebug(
            "[vidhide] No se pudo convertir la fuente"
        );

        return null;

    } catch (e) {
        addDebug(
            "[vidhide] EXCEPTION: " +
            String(e)
        );

        return null;
    }
}

// =========================================================
// VOE
// =========================================================

function voeExtract(pageUrl) {
    try {
        addDebug(
            "[voe] fetch=" + pageUrl
        );

        var html = httpGet(
            pageUrl,
            {
                "User-Agent": UA,
                "Referer": pageUrl
            }
        );

        addDebug(
            "[voe] htmlLen=" +
            (html ? html.length : 0)
        );

        if (!html) {
            return null;
        }

        var m =
            html.match(
                /hls\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i
            );

        if (m && m[1]) {
            addDebug(
                "[voe] match directo hls"
            );

            return cleanUrl(m[1]);
        }

        var am =
            html.match(
                /atob\(['"]([^'"]+)['"]\)/
            );

        addDebug(
            "[voe] atobMatch=" +
            (am ? "si" : "no")
        );

        if (am) {
            try {
                var d =
                    b64decode(am[1]);

                var u =
                    d.match(
                        /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i
                    );

                addDebug(
                    "[voe] atob m3u8=" +
                    (u ? "si" : "no")
                );

                if (u) {
                    return cleanUrl(u[0]);
                }
            } catch (e) {
                addDebug(
                    "[voe] atob exception=" +
                    String(e)
                );
            }
        }

        var fm =
            html.match(
                /file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i
            );

        if (fm && fm[1]) {
            addDebug(
                "[voe] match file"
            );

            return cleanUrl(fm[1]);
        }

        addDebug(
            "[voe] ningun patron encontro nada"
        );

        return null;

    } catch (e) {
        addDebug(
            "[voe] EXCEPTION: " +
            String(e)
        );

        return null;
    }
}

// =========================================================
// DOOD / DO7GO
// =========================================================

function doodExtract(pageUrl) {
    try {
        addDebug(
            "[dood] fetch=" + pageUrl
        );

        var html = httpGet(
            pageUrl,
            {
                "User-Agent": UA,
                "Referer": pageUrl
            }
        );

        addDebug(
            "[dood] htmlLen=" +
            (html ? html.length : 0)
        );

        if (!html) {
            return null;
        }

        var m =
            html.match(
                /(?:file|link|source)\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i
            );

        if (m && m[1]) {
            addDebug(
                "[dood] match m3u8"
            );

            return cleanUrl(m[1]);
        }

        var mp4 =
            html.match(
                /(?:file|link|source)\s*[:=]\s*['"]([^'"]+\.mp4[^'"]*)['"]/i
            );

        if (mp4 && mp4[1]) {
            addDebug(
                "[dood] match mp4"
            );

            return cleanUrl(mp4[1]);
        }

        addDebug(
            "[dood] ningun patron encontro nada"
        );

        return null;

    } catch (e) {
        addDebug(
            "[dood] EXCEPTION: " +
            String(e)
        );

        return null;
    }
}

// =========================================================
// GENERIC
// =========================================================

function genericExtract(pageUrl) {
    try {
        addDebug(
            "[generic] fetch=" + pageUrl
        );

        var html = httpGet(
            pageUrl,
            {
                "User-Agent": UA,
                "Referer": pageUrl
            }
        );

        addDebug(
            "[generic] htmlLen=" +
            (html ? html.length : 0)
        );

        if (!html) {
            return null;
        }

        var m =
            html.match(
                /file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i
            );

        if (m && m[1]) {
            addDebug(
                "[generic] match file"
            );

            return cleanUrl(m[1]);
        }

        m =
            html.match(
                /source\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i
            );

        if (m && m[1]) {
            addDebug(
                "[generic] match source"
            );

            return cleanUrl(m[1]);
        }

        m =
            html.match(
                /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i
            );

        if (m) {
            addDebug(
                "[generic] match suelto m3u8"
            );

            return cleanUrl(m[0]);
        }

        addDebug(
            "[generic] ningun patron encontro nada"
        );

        return null;

    } catch (e) {
        addDebug(
            "[generic] EXCEPTION: " +
            String(e)
        );

        return null;
    }
}

// =========================================================
// EXTRACTOR UNIFICADO
// =========================================================

function extractVideo(pageUrl) {
    if (!pageUrl) {
        addDebug(
            "[extract] URL vacia"
        );

        return null;
    }

    pageUrl = cleanUrl(pageUrl);

    // Si ya es un manifest HLS.
    if (isM3u8Url(pageUrl)) {
        return directHls(pageUrl);
    }

    var host = getHost(pageUrl);

    addDebug(
        "[extract] host=" + host
    );

    if (
        host.indexOf("vidhide") !== -1 ||
        host.indexOf("callistanise") !== -1
    ) {
        return vidhideExtract(pageUrl);
    }

    if (
        host.indexOf("voe") !== -1
    ) {
        return voeExtract(pageUrl);
    }

    if (
        host.indexOf("dood") !== -1 ||
        host.indexOf("do7go") !== -1
    ) {
        return doodExtract(pageUrl);
    }

    return genericExtract(pageUrl);
}

// =========================================================
// DETAIL
// =========================================================

function mkDetail(
    id,
    name,
    thumb,
    url,
    videoSources,
    description
) {
    var valid = [];
    var src = videoSources || [];

    for (
        var i = 0;
        i < src.length;
        i++
    ) {
        if (src[i]) {
            valid.push(src[i]);
        }
    }

    var desc =
        description || "";

    // IMPORTANTE:
    // Ya no se agrega el vídeo de prueba.
    if (valid.length === 0) {
        desc +=
            "\n\n⚠️ No se encontró una fuente de vídeo reproducible.";
    } else {
        desc +=
            "\n\n✅ Fuentes reproducibles encontradas: " +
            valid.length;
    }

    if (_debugLog.length > 0) {
        desc +=
            "\n\n=== REPORTE TÉCNICO ===\n" +
            _debugLog;
    }

    return new PlatformVideoDetails({
        id: new PlatformID(
            "PlayPelis",
            String(id),
            PID
        ),

        name: name || "Sin titulo",

        thumbnails: mkThumb(thumb),

        author: new PlatformAuthorLink(
            PPID,
            "PlayPelis",
            "https://playpelis.app",
            "",
            0
        ),

        uploadDate: 0,
        url: url,
        duration: 0,
        viewCount: 0,
        isLive: false,

        video:
            new VideoSourceDescriptor(valid),

        description: desc
    });
}

// =========================================================
// PLAYERPRO
// =========================================================

function ppGet(path) {
    try {
        var sep =
            path.indexOf("?") !== -1
                ? "&"
                : "?";

        var url =
            IPTV_URL +
            path +
            sep +
            "username=" +
            encodeURIComponent(IPTV_USER) +
            "&password=" +
            encodeURIComponent(IPTV_PASS);

        var response =
            http.GET(
                url,
                {
                    "User-Agent": "PLPro/8"
                }
            );

        if (
            !response ||
            !response.body
        ) {
            return null;
        }

        return JSON.parse(
            response.body
        );

    } catch (e) {
        return null;
    }
}

function ppHome() {
    var videos = [];

    try {
        var data =
            ppGet("/movies/resume");

        if (
            !data ||
            !data.movies
        ) {
            return videos;
        }

        for (
            var i = 0;
            i < data.movies.length &&
            i < 40;
            i++
        ) {
            var m =
                data.movies[i];

            if (m.b) {
                videos.push(
                    mkVideo(
                        "pp_m_" + m.a,

                        (m.l
                            ? "[" + m.l + "] "
                            : "") +
                        m.b +
                        (m.f
                            ? " (" + m.f + ")"
                            : ""),

                        fixImg(m.d) ||
                        fixImg(m.c) ||
                        "",

                        "pp://movie/" +
                        m.a,

                        "PlayPelis"
                    )
                );
            }
        }

    } catch (e) {}

    return videos;
}

function ppSearch(query) {
    var videos = [];

    var q =
        String(query || "")
            .toLowerCase();

    try {
        var data =
            ppGet("/movies/resume");

        if (
            data &&
            data.movies
        ) {
            for (
                var i = 0;
                i < data.movies.length &&
                videos.length < 30;
                i++
            ) {
                var m =
                    data.movies[i];

                if (
                    String(m.b || "")
                        .toLowerCase()
                        .indexOf(q) !== -1 ||

                    String(m.i || "")
                        .toLowerCase()
                        .indexOf(q) !== -1
                ) {
                    videos.push(
                        mkVideo(
                            "pp_m_" + m.a,

                            (m.l
                                ? "[" + m.l + "] "
                                : "") +
                            m.b +
                            (m.f
                                ? " (" + m.f + ")"
                                : ""),

                            fixImg(m.d) ||
                            fixImg(m.c) ||
                            "",

                            "pp://movie/" +
                            m.a,

                            "PlayPelis"
                        )
                    );
                }
            }
        }

        var sdata =
            ppGet("/series");

        if (
            sdata &&
            sdata.series
        ) {
            for (
                var j = 0;
                j < sdata.series.length &&
                videos.length < 60;
                j++
            ) {
                var s =
                    sdata.series[j];

                if (
                    String(s.b || "")
                        .toLowerCase()
                        .indexOf(q) !== -1 ||

                    String(s.i || "")
                        .toLowerCase()
                        .indexOf(q) !== -1
                ) {
                    videos.push(
                        mkVideo(
                            "pp_s_" + s.a,
                            "[Serie] " + s.b,
                            fixImg(s.d) ||
                            fixImg(s.c) ||
                            "",
                            "pp://serie/" +
                            s.a,
                            "PlayPelis"
                        )
                    );
                }
            }
        }

    } catch (e) {}

    return videos;
}

// =========================================================
// PELÍCULA
// =========================================================

function ppMovieDetails(id) {
    _debugLog = "";

    var data =
        ppGet("/movies/" + id);

    if (!data) {
        return mkDetail(
            "pp_m_" + id,
            "Sin resultado",
            "",
            "pp://movie/" + id,
            [],
            ""
        );
    }

    var title =
        data.b || "";

    var thumb =
        fixImg(data.d) ||
        fixImg(data.c) ||
        "";

    var desc =
        data.e || "";

    var linksData =
        ppGet(
            "/movies/" +
            id +
            "/links"
        );

    var sources = [];

    if (
        linksData &&
        linksData.length
    ) {
        desc +=
            "\n\n--- Servidores ---";

        var tried = 0;

        for (
            var i = 0;
            i < linksData.length &&
            tried < MAX_TRY;
            i++
        ) {
            var link =
                linksData[i];

            var linkUrl =
                link.a || "";

            if (!linkUrl) {
                continue;
            }

            tried++;

            var serverName =
                (link.b || "Servidor") +
                " [" +
                (link.c || "") +
                "]";

            desc +=
                "\n" +
                serverName +
                " → " +
                linkUrl;

            addDebug(
                "[movie] probando " +
                tried +
                "/" +
                MAX_TRY +
                ": " +
                linkUrl
            );

            var extracted =
                extractVideo(
                    linkUrl
                );

            if (extracted) {
                var source =
                    mkHls(
                        extracted,
                        serverName
                    );

                if (source) {
                    sources.push(
                        source
                    );

                    addDebug(
                        "[movie] FUENTE OK: " +
                        serverName
                    );
                }
            } else {
                addDebug(
                    "[movie] FALLÓ: " +
                    serverName
                );
            }
        }

        if (
            linksData.length >
            tried
        ) {
            desc +=
                "\n\n(" +
                (
                    linksData.length -
                    tried
                ) +
                " servidores más sin probar)";
        }
    }

    return mkDetail(
        "pp_m_" + id,
        title,
        thumb,
        "pp://movie/" + id,
        sources,
        desc
    );
}

// =========================================================
// EPISODIO (resolución de fuentes reutilizable)
// =========================================================

// FIX v42: extraída de ppEpisodeLinks para poder reutilizarla desde
// ppSerieDetails y precargar el Episodio 1 sin duplicar código.
function resolveEpisodeSources(id, season, episode) {
    var linksData =
        ppGet(
            "/series/" +
            id +
            "/links/" +
            season +
            "/" +
            episode
        );

    var sources = [];
    var desc = "";

    if (
        linksData &&
        linksData.length
    ) {
        desc +=
            "\n\n--- Servidores ---";

        var tried = 0;

        for (
            var i = 0;
            i < linksData.length &&
            tried < MAX_TRY;
            i++
        ) {
            var link =
                linksData[i];

            var linkUrl =
                link.a || "";

            if (!linkUrl) {
                continue;
            }

            tried++;

            var serverName =
                (link.b || "Servidor") +
                " [" +
                (link.c || "") +
                "]";

            desc +=
                "\n" +
                serverName +
                " → " +
                linkUrl;

            addDebug(
                "[episode] probando " +
                tried +
                "/" +
                MAX_TRY +
                ": " +
                linkUrl
            );

            var extracted =
                extractVideo(
                    linkUrl
                );

            if (extracted) {
                var source =
                    mkHls(
                        extracted,
                        serverName
                    );

                if (source) {
                    sources.push(
                        source
                    );

                    addDebug(
                        "[episode] FUENTE OK: " +
                        serverName
                    );
                }
            } else {
                addDebug(
                    "[episode] FALLÓ: " +
                    serverName
                );
            }
        }
    }

    return {
        sources: sources,
        desc: desc
    };
}

// =========================================================
// SERIES
// =========================================================

// FIX v42: antes devolvía sources=[] siempre (solo texto con la lista
// de episodios en la descripción, nada tocable ni reproducible). Ahora
// resuelve y precarga el Episodio 1 de la Temporada 1 para que la
// serie arranque reproduciendo directo al tocarla. La navegación al
// resto de episodios se hace vía source.getContentRecommendations.
function ppSerieDetails(id) {
    _debugLog = "";

    var data =
        ppGet("/series/" + id);

    if (!data) {
        return mkDetail(
            "pp_s_" + id,
            "Sin resultado",
            "",
            "pp://serie/" + id,
            [],
            ""
        );
    }

    var title =
        data.b || "";

    var thumb =
        fixImg(data.d) ||
        fixImg(data.c) ||
        "";

    var desc =
        (data.e || "") +
        "\n\n--- Temporadas y Episodios ---";

    var seasons =
        data.seasons ||
        data.f ||
        [];

    if (
        typeof seasons === "number"
    ) {
        seasons = [];
    }

    var firstSeasonNum = null;
    var firstEpisodeNum = null;

    for (
        var si = 0;
        si < seasons.length;
        si++
    ) {
        var season =
            seasons[si];

        var seasonNum =
            season.num ||
            season.a ||
            (si + 1);

        var episodes =
            season.episodes ||
            season.b ||
            [];

        desc +=
            "\n\nTemporada " +
            seasonNum +
            ":";

        for (
            var ei = 0;
            ei < episodes.length;
            ei++
        ) {
            var ep =
                episodes[ei];

            var epNum =
                ep.num ||
                ep.a ||
                (ei + 1);

            if (firstSeasonNum === null) {
                firstSeasonNum = seasonNum;
                firstEpisodeNum = epNum;
            }

            desc +=
                "\n  Ep " +
                epNum +
                " → pp://serie/" +
                id +
                "/" +
                seasonNum +
                "/" +
                epNum;
        }
    }

    var sources = [];

    if (firstSeasonNum !== null) {
        desc +=
            "\n\n--- Reproduciendo por defecto: T" +
            firstSeasonNum +
            "E" +
            firstEpisodeNum +
            " ---";

        var resolved =
            resolveEpisodeSources(
                id,
                firstSeasonNum,
                firstEpisodeNum
            );

        sources = resolved.sources;
        desc += resolved.desc;
    }

    return mkDetail(
        "pp_s_" + id,
        title,
        thumb,
        "pp://serie/" + id,
        sources,
        desc
    );
}

// =========================================================
// EPISODIO
// =========================================================

function ppEpisodeLinks(
    id,
    season,
    episode
) {
    _debugLog = "";

    var data =
        ppGet("/series/" + id);

    if (!data) {
        return mkDetail(
            "pp_se_" + id,
            "Sin resultado",
            "",
            "",
            [],
            ""
        );
    }

    var title =
        (data.b || "") +
        " S" +
        season +
        "E" +
        episode;

    var thumb =
        fixImg(data.d) ||
        fixImg(data.c) ||
        "";

    var resolved =
        resolveEpisodeSources(
            id,
            season,
            episode
        );

    var sources = resolved.sources;
    var desc = title + resolved.desc;

    var epNum =
        parseInt(
            episode,
            10
        );

    if (epNum > 1) {
        desc +=
            "\n\n← Ep Anterior: pp://serie/" +
            id +
            "/" +
            season +
            "/" +
            (epNum - 1);
    }

    desc +=
        "\n→ Ep Siguiente: pp://serie/" +
        id +
        "/" +
        season +
        "/" +
        (epNum + 1);

    return mkDetail(
        "pp_se_" +
        id +
        "_" +
        season +
        "_" +
        episode,

        title,

        thumb,

        "pp://serie/" +
        id +
        "/" +
        season +
        "/" +
        episode,

        sources,

        desc
    );
}

// =========================================================
// JKANIME
// =========================================================

function jkaSearch(query) {
    var out = [];

    try {
        var slug =
            slugify(query);

        if (!slug) {
            return out;
        }

        var html =
            httpGet(
                JK +
                "/buscar/" +
                slug +
                "/",
                {
                    "Referer":
                        JK + "/"
                }
            );

        if (!html) {
            return out;
        }

        var re =
            /<div class="anime__item">\s*<a\s+href="(https?:\/\/jkanime\.net\/[a-z0-9-]+\/)"[^>]*>[\s\S]*?<div[^>]*data-setbg="([^"]*)"[\s\S]*?<h5><a[^>]*>([^<]+)<\/a><\/h5>/gi;

        var m;

        while (
            (m = re.exec(html)) &&
            out.length < 30
        ) {
            out.push({
                title:
                    htmlDecode(m[3]),

                url:
                    m[1],

                thumb:
                    m[2]
            });
        }

    } catch (e) {}

    return out;
}

function jkaExtractVideo(
    episodeUrl
) {
    addDebug(
        "JKA: Extrayendo episodio " +
        episodeUrl
    );

    var html =
        httpGet(
            episodeUrl,
            {
                "Referer":
                    JK + "/"
            }
        );

    if (!html) {
        addDebug(
            "JKA: HTML nulo"
        );

        return null;
    }

    var re =
        /video\[\d+\]\s*=\s*'[^']*src="(https?:\/\/jkanime\.net\/jkplayer\/um[^"]*)"/i;

    var m =
        html.match(re);

    if (
        !m ||
        !m[1]
    ) {
        addDebug(
            "JKA: No se encontró iframe"
        );

        return null;
    }

    var playerUrl =
        m[1].replace(
            /&amp;/g,
            "&"
        );

    addDebug(
        "JKA: Cargando reproductor: " +
        playerUrl
    );

    var playerHtml =
        httpGet(
            playerUrl,
            {
                "Referer":
                    episodeUrl
            }
        );

    if (!playerHtml) {
        addDebug(
            "JKA: Player HTML nulo"
        );

        return null;
    }

    addDebug(
        "JKA Player HTML length: " +
        playerHtml.length
    );

    var m3u8 =
        playerHtml.match(
            /url\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i
        );

    if (
        m3u8 &&
        m3u8[1]
    ) {
        return mkHls(
            cleanUrl(m3u8[1]),
            "JkAnime"
        );
    }

    addDebug(
        "JKA: No se encontró m3u8"
    );

    return null;
}

function jkaDetails(url) {
    _debugLog = "";

    var html =
        httpGet(
            url,
            {
                "Referer":
                    JK + "/"
            }
        );

    if (!html) {
        return mkDetail(
            "jk_" + url,
            "Sin resultado",
            "",
            url,
            [],
            "No se pudo cargar"
        );
    }

    var title = "";

    var tm =
        html.match(
            /<h1[^>]*>([\s\S]*?)<\/h1>/i
        );

    if (tm) {
        title =
            stripTags(tm[1]);
    }

    title =
        (title || "")
            .replace(
                /\s*-\s*anime.*JkAnime/i,
                ""
            )
            .replace(
                /JkAnime/i,
                ""
            )
            .trim();

    var thumb = "";

    var im =
        html.match(
            /<img[^>]*src=["']([^"']*animes\/(?:image|video)\/[^"']+)["']/i
        );

    if (im) {
        thumb =
            im[1].indexOf("http") === 0
                ? im[1]
                : JK +
                  "/" +
                  im[1].replace(
                      /^\/+/,
                      ""
                  );
    }

    var desc = "";

    var seriesMatch =
        url.match(
            /jkanime\.net\/([a-z0-9-]+)\/?$/i
        );

    var episodeMatch =
        url.match(
            /jkanime\.net\/([a-z0-9-]+)\/(\d+)\/?$/i
        );

    if (
        seriesMatch &&
        !episodeMatch
    ) {
        var episodes = [];

        var re =
            /<a[^>]*href="\/([a-z0-9-]+)\/(\d+)\/?"[^>]*>/gi;

        var slug =
            seriesMatch[1];

        var m;

        while (
            (m = re.exec(html)) &&
            episodes.length < 200
        ) {
            if (
                m[1] === slug
            ) {
                episodes.push({
                    number:
                        parseInt(
                            m[2],
                            10
                        ),

                    url:
                        JK +
                        "/" +
                        m[1] +
                        "/" +
                        m[2] +
                        "/"
                });
            }
        }

        episodes.sort(
            function(a, b) {
                return (
                    a.number -
                    b.number
                );
            }
        );

        desc +=
            "\n\n--- Episodios (" +
            episodes.length +
            ") ---";

        for (
            var ei = 0;
            ei < episodes.length;
            ei++
        ) {
            desc +=
                "\nEp " +
                episodes[ei].number +
                " → " +
                episodes[ei].url;
        }

        var sources = [];

        if (
            episodes.length > 0
        ) {
            var firstSrc =
                jkaExtractVideo(
                    episodes[0].url
                );

            if (firstSrc) {
                sources.push(
                    firstSrc
                );
            }
        }

        return mkDetail(
            "jk_" + url,
            title ||
                slugToTitle(slug),
            thumb,
            url,
            sources,
            desc
        );
    }

    var episodeSources =
        jkaExtractVideo(url);

    var srcArray =
        episodeSources
            ? [episodeSources]
            : [];

    return mkDetail(
        "jk_" + url,
        title || "Anime",
        thumb,
        url,
        srcArray,
        desc
    );
}

// =========================================================
// UNIFIED
// =========================================================

function doSearch(query) {
    var results = [];

    try {
        var r =
            ppSearch(query);

        for (
            var i = 0;
            i < r.length;
            i++
        ) {
            results.push(
                r[i]
            );
        }
    } catch (e) {}

    try {
        var jka =
            jkaSearch(query);

        for (
            var j = 0;
            j < jka.length;
            j++
        ) {
            results.push(
                mkVideo(
                    "jk_" +
                    jka[j].url,

                    "[Anime] " +
                    jka[j].title,

                    jka[j].thumb,

                    jka[j].url,

                    "JkAnime"
                )
            );
        }

    } catch (e) {}

    return results;
}

function doDetails(url) {
    if (!url) {
        return mkDetail(
            "",
            "",
            "",
            "",
            [],
            "URL vacía"
        );
    }

    if (
        url.indexOf(
            "jkanime.net"
        ) !== -1
    ) {
        return jkaDetails(url);
    }

    if (
        url.indexOf(
            "pp://movie/"
        ) === 0
    ) {
        var mm =
            url.match(
                /pp:\/\/movie\/(\d+)/
            );

        if (mm) {
            return ppMovieDetails(
                mm[1]
            );
        }
    }

    if (
        url.indexOf(
            "pp://serie/"
        ) === 0
    ) {
        var se =
            url.match(
                /pp:\/\/serie\/(\d+)\/(\d+)\/(\d+)/
            );

        if (se) {
            return ppEpisodeLinks(
                se[1],
                se[2],
                se[3]
            );
        }

        var ss =
            url.match(
                /pp:\/\/serie\/(\d+)/
            );

        if (ss) {
            return ppSerieDetails(
                ss[1]
            );
        }
    }

    return mkDetail(
        "",
        "",
        "",
        url,
        [],
        ""
    );
}

// =========================================================
// HOME
// =========================================================

function doHome() {
    var videos = [];

    try {
        var r =
            ppHome();

        for (
            var i = 0;
            i < r.length;
            i++
        ) {
            videos.push(
                r[i]
            );
        }

    } catch (e) {}

    try {
        var jkHtml =
            httpGet(
                JK + "/",
                {
                    "Referer":
                        JK + "/"
                }
            );

        if (jkHtml) {
            var re =
                /data-setbg="([^"]*)"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/gi;

            var m;

            while (
                (m = re.exec(jkHtml)) &&
                videos.length < 60
            ) {
                var linkRe =
                    /href="(https?:\/\/jkanime\.net\/[a-z0-9-]+\/?)"/i;

                var pos =
                    jkHtml.indexOf(
                        m[0]
                    );

                var anchor =
                    jkHtml.substring(
                        Math.max(
                            0,
                            pos - 500
                        ),
                        pos +
                        m[0].length
                    );

                var lm =
                    anchor.match(
                        linkRe
                    );

                videos.push(
                    mkVideo(
                        "jk_home_" +
                        (
                            lm
                                ? lm[1]
                                : JK + "/"
                        ),

                        "[Anime] " +
                        stripTags(m[2]),

                        m[1],

                        lm
                            ? lm[1]
                            : JK + "/",

                        "JkAnime"
                    )
                );
            }
        }

    } catch (e) {}

    return videos;
}

// =========================================================
// RECOMENDACIONES (lista de episodios navegable)
// =========================================================

// FIX v42: nuevo. GrayJay usa este hook para mostrar la lista de
// "siguientes videos" debajo del detalle. Sin esto, los episodios de
// una serie solo existían como texto suelto en la descripción y no
// eran tocables.
function doRecommendations(url) {
    var videos = [];

    try {
        var se =
            String(url || "").match(
                /pp:\/\/serie\/(\d+)$/
            );

        if (!se) {
            return videos;
        }

        var id = se[1];

        var data =
            ppGet("/series/" + id);

        if (!data) {
            return videos;
        }

        var thumb =
            fixImg(data.d) ||
            fixImg(data.c) ||
            "";

        var seriesTitle =
            data.b || "Serie";

        var seasons =
            data.seasons ||
            data.f ||
            [];

        if (
            typeof seasons === "number"
        ) {
            seasons = [];
        }

        for (
            var si = 0;
            si < seasons.length;
            si++
        ) {
            var season =
                seasons[si];

            var seasonNum =
                season.num ||
                season.a ||
                (si + 1);

            var episodes =
                season.episodes ||
                season.b ||
                [];

            for (
                var ei = 0;
                ei < episodes.length;
                ei++
            ) {
                var ep =
                    episodes[ei];

                var epNum =
                    ep.num ||
                    ep.a ||
                    (ei + 1);

                videos.push(
                    mkVideo(
                        "pp_se_" +
                        id +
                        "_" +
                        seasonNum +
                        "_" +
                        epNum,

                        seriesTitle +
                        " S" +
                        seasonNum +
                        "E" +
                        epNum,

                        thumb,

                        "pp://serie/" +
                        id +
                        "/" +
                        seasonNum +
                        "/" +
                        epNum,

                        "PlayPelis"
                    )
                );
            }
        }

    } catch (e) {}

    return videos;
}

// =========================================================
// BINDINGS
// =========================================================

if (
    typeof source !== "undefined"
) {
    source.setSettings =
        function(s) {
            _settings =
                s || {};
        };

    source.enable =
        function(c, s) {
            _settings =
                s || {};
        };

    source.getSearchCapabilities =
        function() {
            return {
                types: [2],
                sorts: [],
                filters: []
            };
        };

    source.search =
        function(query) {
            try {
                return new VideoPager(
                    doSearch(
                        query || ""
                    ),
                    false,
                    null
                );
            } catch (e) {
                return new VideoPager(
                    [],
                    false,
                    null
                );
            }
        };

    source.isContentDetailsUrl =
        function(url) {
            return (
                url &&
                (
                    url.indexOf(
                        "jkanime.net"
                    ) !== -1 ||

                    url.indexOf(
                        "pp://"
                    ) !== -1
                )
            );
        };

    source.isVideoDetailsUrl =
        function(url) {
            return source
                .isContentDetailsUrl(
                    url
                );
        };

    source.getVideoDetails =
        function(url) {
            return source
                .getContentDetails(
                    url
                );
        };

    source.getHome =
        function() {
            try {
                return new VideoPager(
                    doHome(),
                    false,
                    null
                );
            } catch (e) {
                return new VideoPager(
                    [],
                    false,
                    null
                );
            }
        };

    source.isChannelUrl =
        function(url) {
            return false;
        };

    source.searchSuggestions =
        function(query) {
            return [];
        };

    // FIX v42: nuevo binding. Ver doRecommendations().
    source.getContentRecommendations =
        function(url) {
            try {
                return new VideoPager(
                    doRecommendations(url),
                    false,
                    null
                );
            } catch (e) {
                return new VideoPager(
                    [],
                    false,
                    null
                );
            }
        };

    source.getContentDetails =
        function(url) {
            try {
                var r =
                    doDetails(url);

                if (r) {
                    return r;
                }

                throw new Error(
                    "doDetails retornó null"
                );

            } catch (e) {
                return new PlatformVideoDetails({
                    id: new PlatformID(
                        "PlayPelis",
                        "error_fallo",
                        PID
                    ),

                    name:
                        "Error de Extractor",

                    thumbnails:
                        new Thumbnails([
                            new Thumbnail(
                                TMDB_IMG +
                                "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png",
                                100
                            )
                        ]),

                    author:
                        new PlatformAuthorLink(
                            PPID,
                            "PlayPelis",
                            "https://playpelis.app",
                            "",
                            0
                        ),

                    uploadDate: 0,
                    url:
                        url ||
                        "https://playpelis.app",
                    duration: 0,
                    viewCount: 0,
                    isLive: false,

                    description:
                        "CRASH CRÍTICO: " +
                        String(e) +
                        "\n\nLOG TÉCNICO:\n" +
                        _debugLog,

                    // Sin vídeo falso.
                    video:
                        new VideoSourceDescriptor([])
                });
            }
        };
}
