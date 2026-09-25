#!/usr/bin/env node
/*
 * probar_todo.js - prueba masiva del plugin (en vez de mirar titulo por titulo).
 *
 * Carga TU plugin (el mismo .js), lo corre con una version "de escritorio" de la API de GrayJay y llama a details() sobre
 * una lista de peliculas/series: casos dificiles (homonimos, secuelas) + los mas populares de TMDB. Al final imprime una
 * tabla con: estado, cuantas fuentes, de que proveedor/host salio la primera y si esa primera fuente REALMENTE responde.
 * Los que fallan quedan con su log completo en la carpeta de salida: eso es lo que hay que pasarme.
 *
 * Requisitos: Node 16+ y curl (Termux: pkg install nodejs curl | Linux/macOS/WSL: ya suelen estar).
 *
 * Uso:
 *   node probar_todo.js PlayPelis_GrayJay_simple.js                       (casos dificiles + 12 peliculas y 8 series populares)
 *   node probar_todo.js PlayPelis_GrayJay_simple.js --movies 30 --series 15
 *   node probar_todo.js PlayPelis_GrayJay_simple.js --only-hard           (solo los casos dificiles)
 *   node probar_todo.js PlayPelis_GrayJay_simple.js --ids movie:1241982,tv:84958:1:1
 *   node probar_todo.js PlayPelis_GrayJay_simple.js --out resultados --no-verify
 *
 * Ojo: corre en TU red con curl, no en GrayJay. Si un sitio bloquea a curl y no a la app (o al reves), el resultado difiere.
 */
"use strict";
var fs = require("fs"), vm = require("vm"), cp = require("child_process"), os = require("os"), path = require("path");

var HARD = [
    { q: "Moana 2", year: 2024 }, { q: "Moana", year: 2016 },
    { q: "Pinocho", year: 1940 }, { q: "Pinocho", year: 2019 }, { q: "Pinocho", year: 2022 },
    { q: "Loki", tv: true, s: 1, e: 1 },
    { q: "Spider-Man: No Way Home", year: 2021 },
    { q: "Toy Story 3", year: 2010 }, { q: "Toy Story 4", year: 2019 },
    { q: "Blade Runner", year: 1982 }, { q: "Blade Runner 2049", year: 2017 },
    { q: "El Rey Leon", year: 1994 }, { q: "El Rey Leon", year: 2019 },
    { q: "Halloween", year: 1978 }, { q: "Halloween", year: 2018 }
];

/* ---------------------------------------------------------------- HTTP sincrono con curl */
function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
function curlCmd(method, url, headers, body, outFile, hdrFile) {
    var a = ["curl", "-s", "-L", "-m", "25", "--compressed", "-o", shq(outFile), "-D", shq(hdrFile), "-w", "'%{http_code}'"];
    if (method == "HEAD") a.push("-I");
    else if (method != "GET") a.push("-X", method);
    Object.keys(headers || {}).forEach(function (k) { a.push("-H", shq(k + ": " + headers[k])); });
    if (body != null && method != "GET" && method != "HEAD") a.push("--data-binary", shq(body));
    a.push(shq(url));
    return a.join(" ");
}
function readResult(code, outFile) {
    var body = "";
    try { body = fs.readFileSync(outFile, "utf8"); } catch (e) { }
    try { fs.unlinkSync(outFile); } catch (e) { }
    return { code: parseInt(code, 10) || 0, body: body, isOk: /^2/.test(String(code)) };
}
var _n = 0;
function tmp() { return path.join(os.tmpdir(), "pt_" + process.pid + "_" + (_n++)); }
var curlImpl = {
    one: function (method, url, headers, body) {
        var f = tmp(), h = f + ".h", code = "0";
        try { code = cp.execSync(curlCmd(method, url, headers, body, f, h), { stdio: ["ignore", "pipe", "ignore"], timeout: 40000 }).toString().trim(); } catch (e) { code = "0"; }
        try { fs.unlinkSync(h); } catch (e) { }
        return readResult(code, f);
    },
    many: function (list) {     /* en paralelo: un solo sh con procesos en segundo plano */
        var files = list.map(function () { var f = tmp(); return { o: f, h: f + ".h", c: f + ".c" }; });
        var script = list.map(function (r, i) { return "(" + curlCmd("GET", r.url, r.headers, null, files[i].o, files[i].h) + " > " + shq(files[i].c) + " 2>/dev/null) &"; }).join("\n") + "\nwait\n";
        try { cp.execSync(script, { shell: "/bin/sh", stdio: ["ignore", "ignore", "ignore"], timeout: 60000 }); } catch (e) { }
        return files.map(function (f, i) {
            var code = "0";
            try { code = fs.readFileSync(f.c, "utf8").trim(); fs.unlinkSync(f.c); } catch (e) { }
            try { fs.unlinkSync(f.h); } catch (e) { }
            return readResult(code, f.o);
        });
    }
};

/* ---------------------------------------------------------------- entorno GrayJay simulado */
function makeContext(code, impl) {
    var http = {
        GET: function (u, h) { return impl.one("GET", u, h); },
        POST: function (u, b, h) { return impl.one("POST", u, h, b); },
        request: function (m, u, h) { return impl.one(m, u, h); },
        batch: function () {
            var list = [], b = { GET: function (u, h) { list.push({ url: u, headers: h }); return b; }, execute: function () { return impl.many(list); } };
            return b;
        }
    };
    function Obj(o) { for (var k in o) this[k] = o[k]; }
    var ctx = {
        console: console, http: http, Date: Date, JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, RegExp: RegExp, parseInt: parseInt, isNaN: isNaN,
        encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, Error: Error, config: { id: "probar-todo" }, source: {},
        PlatformID: function (a, b) { this.platform = a; this.value = b; }, Thumbnails: function (a) { this.sources = a; }, Thumbnail: function (u) { this.url = u; },
        PlatformVideo: Obj, PlatformVideoDetails: Obj, VideoSourceDescriptor: function (s) { this.videoSources = s; }, HLSSource: Obj, VideoUrlSource: Obj,
        PlatformAuthorLink: Obj, PlatformChannel: Obj, VideoPager: function (r, m) { this.results = r; this.hasMore = m; }, ChannelPager: Obj,
        Type: { Feed: { Mixed: "MIXED" }, Order: { Chronological: "CHRONOLOGICAL" } }
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    if (ctx.source.enable) ctx.source.enable({}, {}, null);
    return ctx;
}

/* ---------------------------------------------------------------- lista de titulos */
function tmdb(ctx, p) {
    var run = function (s) { return vm.runInContext(s, ctx); };
    var key = run("TMDB_KEY"), api = run("TMDB_API");
    var r = ctx.http.GET(api + p + (p.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + key + "&language=es-AR", { "Accept": "application/json" });
    try { return JSON.parse(r.body); } catch (e) { return null; }
}
function buildItems(ctx, o) {
    var items = [], i, d, r;
    function add(x) { items.push(x); }
    if (o.ids) {
        o.ids.forEach(function (s) {
            var p = s.split(":");
            add(p[0] == "tv" ? { kind: "tv", id: p[1], s: p[2] || 1, e: p[3] || 1 } : { kind: "movie", id: p[1] });
        });
        return items;
    }
    HARD.forEach(function (h) {
        var kind = h.tv ? "tv" : "movie", d = tmdb(ctx, "/search/" + kind + "?query=" + encodeURIComponent(h.q) + (h.year ? (kind == "tv" ? "&first_air_date_year=" : "&year=") + h.year : "")), r = d && d.results && d.results[0];
        if (r) add({ kind: kind, id: String(r.id), s: h.s || 1, e: h.e || 1, want: h.q + (h.year ? " (" + h.year + ")" : "") });
        else console.log("  (no se pudo resolver en TMDB: " + h.q + ")");
    });
    if (!o.onlyHard) {
        d = tmdb(ctx, "/movie/popular?page=1"); r = (d && d.results) || [];
        for (i = 0; i < r.length && i < o.movies; i++) add({ kind: "movie", id: String(r[i].id) });
        d = tmdb(ctx, "/tv/popular?page=1"); r = (d && d.results) || [];
        for (i = 0; i < r.length && i < o.series; i++) add({ kind: "tv", id: String(r[i].id), s: 1, e: 1 });
    }
    return items;
}

/* ---------------------------------------------------------------- verificacion independiente de la 1a fuente */
function verifyFirst(ctx, src, impl) {
    if (!src) return "-";
    var info = vm.runInContext("_srcInfo", ctx)[src.url] || {}, h = info.h || { "User-Agent": "Mozilla/5.0" }, r;
    if (info.t == "hls" || /\.m3u8/i.test(src.url)) {
        r = impl.one("GET", src.url, h);
        if (/^\s*#EXTM3U/.test(r.body)) return "OK (m3u8 valido)";
        return "CAIDA (HTTP " + r.code + (/^\s*</.test(r.body) ? ", devuelve HTML" : "") + ")";
    }
    r = impl.one("HEAD", src.url, h);
    if (r.code == 404 || r.code == 410) return "CAIDA (HTTP " + r.code + ")";
    return r.code >= 200 && r.code < 300 ? "OK (HEAD " + r.code + ")" : "? (HEAD " + r.code + ")";
}
function hostOf(u) { var m = /^https?:\/\/([^\/?#]+)/i.exec(u || ""); return m ? m[1].replace(/^www\./, "") : ""; }
function pad(s, n) { s = String(s); return s.length >= n ? s.substring(0, n) : s + new Array(n - s.length + 1).join(" "); }

/* ---------------------------------------------------------------- main */
function runAll(code, o, impl) {
    var ctx = makeContext(code, impl), items = buildItems(ctx, o), rows = [], i, it, t0, det, err, srcs, first, ver, status, dbg, url, name;
    fs.mkdirSync(path.join(o.out, "logs"), { recursive: true });
    console.log("\nProbando " + items.length + " titulos (puede tardar varios minutos)...\n");
    console.log(pad("#", 3) + pad("estado", 13) + pad("fuentes", 8) + pad("titulo", 38) + pad("1a fuente (proveedor/servidor / host)", 46) + pad("verif. 1a fuente", 32) + "seg");
    for (i = 0; i < items.length; i++) {
        it = items[i];
        url = "pelishub://" + (it.kind == "tv" ? "tv/" + it.id + "/" + it.s + "/" + it.e : "movie/" + it.id);
        t0 = Date.now(); det = null; err = "";
        try { det = vm.runInContext("details(" + JSON.stringify(url) + ")", ctx); } catch (e) { err = String(e && e.stack || e); }
        dbg = vm.runInContext("_debug", ctx);
        srcs = (det && det.video && det.video.videoSources) || [];
        first = srcs[0];
        name = det && det.name ? String(det.name) : ("(id " + it.id + ")");
        if (err) status = "ERROR";
        else if (!srcs.length) status = "SIN_FUENTES";
        else { ver = o.verify ? verifyFirst(ctx, first, impl) : "-"; status = /^CAIDA/.test(ver) ? "1a_CAIDA" : "OK"; }
        if (!first) ver = "-";
        var prov = first ? String(first.name || "").split(" \u00b7 ").slice(-2).join("/") + " / " + hostOf(first.url) : "-";
        var secs = Math.round((Date.now() - t0) / 100) / 10;
        rows.push({ n: i + 1, kind: it.kind, id: it.id, titulo: name, want: it.want || "", status: status, fuentes: srcs.length, primera: prov, verif: ver || "-", seg: secs, url: first ? first.url : "" });
        console.log(pad(i + 1, 3) + pad(status, 13) + pad(srcs.length, 8) + pad(name, 38) + pad(prov, 46) + pad(ver || "-", 32) + secs);
        if (status != "OK" || o.allLogs) fs.writeFileSync(path.join(o.out, "logs", it.kind + "_" + it.id + ".txt"), name + "\n" + url + "\n\n" + (err ? err + "\n" : "") + dbg);
    }
    /* informe */
    var byStatus = {}, byProv = {}, causes = { "HTTP 403/429 (bloqueo)": 0, "descartado (otra pelicula/año/ID)": 0, "sin resultado": 0, "sin soporte (host)": 0, "tiempo agotado": 0 };
    rows.forEach(function (r) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; if (r.status == "OK") { var p = r.primera.split(" / ")[0]; byProv[p] = (byProv[p] || 0) + 1; } });
    rows.filter(function (r) { return r.status != "OK"; }).forEach(function (r) {
        var log = ""; try { log = fs.readFileSync(path.join(o.out, "logs", r.kind + "_" + r.id + ".txt"), "utf8"); } catch (e) { }
        if (/HTTP 40[39]|HTTP 429/.test(log)) causes["HTTP 403/429 (bloqueo)"]++;
        if (/descartad/.test(log)) causes["descartado (otra pelicula/año/ID)"]++;
        if (/sin resultado/.test(log)) causes["sin resultado"]++;
        if (/sin soporte/.test(log)) causes["sin soporte (host)"]++;
        if (/Tiempo agotado/.test(log)) causes["tiempo agotado"]++;
    });
    var lines = ["RESUMEN (" + rows.length + " titulos)", ""];
    Object.keys(byStatus).forEach(function (k) { lines.push("  " + pad(k, 14) + byStatus[k]); });
    lines.push("", "1a fuente por proveedor (solo OK):");
    Object.keys(byProv).forEach(function (k) { lines.push("  " + pad(k, 30) + byProv[k]); });
    lines.push("", "En los que fallaron, el log menciona:");
    Object.keys(causes).forEach(function (k) { if (causes[k]) lines.push("  " + pad(k, 40) + causes[k] + " titulos"); });
    var slow = rows.filter(function (r) { return r.seg > 20; });
    if (slow.length) lines.push("", "Lentos (>20 s): " + slow.map(function (r) { return r.titulo + " " + r.seg + "s"; }).join(" | "));
    var csv = ["n,tipo,id,titulo,estado,fuentes,primera_fuente,verificacion,segundos,url"].concat(rows.map(function (r) {
        return [r.n, r.kind, r.id, '"' + r.titulo.replace(/"/g, "'") + '"', r.status, r.fuentes, '"' + r.primera + '"', '"' + r.verif + '"', r.seg, '"' + r.url.substring(0, 200) + '"'].join(",");
    }));
    fs.writeFileSync(path.join(o.out, "resultados.csv"), csv.join("\n"));
    fs.writeFileSync(path.join(o.out, "resumen.txt"), lines.join("\n") + "\n");
    console.log("\n" + lines.join("\n") + "\n\nArchivos en " + o.out + "/: resumen.txt, resultados.csv y logs/ (un .txt por cada titulo que fallo).");
    console.log("Pasame resumen.txt, resultados.csv y los logs/ de los que fallaron.");
    return rows;
}
function parseArgs(argv) {
    var o = { plugin: "", movies: 12, series: 8, onlyHard: false, ids: null, out: "resultados", verify: true, allLogs: false }, i, a;
    for (i = 2; i < argv.length; i++) {
        a = argv[i];
        if (a == "--movies") o.movies = parseInt(argv[++i], 10);
        else if (a == "--series") o.series = parseInt(argv[++i], 10);
        else if (a == "--only-hard") o.onlyHard = true;
        else if (a == "--ids") o.ids = argv[++i].split(",");
        else if (a == "--out") o.out = argv[++i];
        else if (a == "--no-verify") o.verify = false;
        else if (a == "--all-logs") o.allLogs = true;
        else if (!o.plugin) o.plugin = a;
    }
    return o;
}
if (require.main === module) {
    var o = parseArgs(process.argv);
    if (!o.plugin) { console.log("Uso: node probar_todo.js <plugin.js> [--movies N] [--series N] [--only-hard] [--ids movie:ID,tv:ID:S:E] [--out carpeta] [--no-verify]"); process.exit(1); }
    runAll(fs.readFileSync(o.plugin, "utf8"), o, curlImpl);
}
module.exports = { runAll: runAll, makeContext: makeContext, parseArgs: parseArgs };
