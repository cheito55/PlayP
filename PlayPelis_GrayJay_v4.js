/*
 * PlayPelis GrayJay Source v7 - TMDB catalog + provider playback
 *
 * Catálogos descubiertos en el APK PlayPelis:
 * Pelisplushd, Cuevana3, PeliSmart, Movie123, Bflix, New Movies 123,
 * Cuevana2, Gnula, EntrePeliculasYSeries y PelisPlus2 (solo web; sin ESPlay GraphQL).
 *
 * Diseño:
 *  - NO consulta los proveedores durante Home/Search; esto evita esperas de 1 minuto cuando un dominio devuelve 0 bytes;
 *  - TMDB es el catálogo principal para que Home/Search no dependan de webs externas;
 *  - el proveedor de reproducción se descubre desde la página encontrada;
 *  - reconoce HLS/MP4 directos, iframes y URLs de servidores del APK;
 *  - Pelisplushd mantiene sus endpoints AJAX conocidos como fallback;
 *  - ES5 compatible.
 *
 * Nota: el APK usa extractores/headless propios. GrayJay no reproduce aquí
 * toda esa capa headless; v6 hace descubrimiento HTTP de enlaces directos y
 * de embeds, y deja trazas de lo que encontró.
 */

var PID = "d7b2e9c1-4f63-48a1-a5e7-91c3b6d82470";
var PLATFORM = "PlayPelis";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);

var TMDB_KEY = "26c168179ae6b5445f36aca260e00d48";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_IMG = "https://image.tmdb.org/t/p/w500";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

var MAX_ITEMS = 60;
var MAX_SOURCES = 24;
var MAX_CRAWL = 16;
var MAX_EPISODES = 300;
var MAX_HTML = 2500000;

/* Orden basado en los proveedores presentes en el APK. */
var PROVIDERS = [
    { name: "Pelisplushd", alias: "PelisPlusHD", base: "https://pelisplushd.nu", search: ["/search/{q}/1", "/search/{q}/1/"], home: ["/home.html", "/genres-1/1"], card: ["mouCgDQMxDwt"] },
    { name: "Cuevana3", alias: "Cuevana3Me", base: "https://cuevana3.ai", search: ["/search/{q}/", "/search/{q}"], home: ["/"], card: ["movie-item", "TPost", "film_list-wrap"] },
    { name: "Cuevana3Me", alias: "Cuevana3Me", base: "https://cuevana3.me", search: ["/search/{q}/", "/search/{q}"], home: ["/"], card: ["movie-item", "TPost", "film_list-wrap"] },
    { name: "Cuevana3CC", alias: "Cuevana3CC", base: "https://cuevana3.cc", search: ["/search/{q}/", "/search/{q}"], home: ["/"], card: ["movie-item", "TPost", "film_list-wrap"] },
    { name: "Cuevana3So", alias: "Cuevana3So", base: "https://cuevana3.so", search: ["/search/{q}/", "/search/{q}"], home: ["/"], card: ["movie-item", "TPost", "film_list-wrap"] },
    { name: "PeliSmart", alias: "PlayPelis9", base: "https://smartpeli.tv", search: ["/page/1/?s={q}", "/search?q={q}"], home: ["/"], card: ["post"] },
    { name: "SmartPelis", alias: "PlayPelis9", base: "https://smartpelis.tv", search: ["/page/1/?s={q}", "/search?q={q}"], home: ["/"], card: ["post"] },
    { name: "Movie123", alias: "PlayPelis5", base: "https://0123movie.net", search: ["/buscar/{q}/1", "/search/{q}/1"], home: ["/"], card: ["anime__item"] },
    { name: "Bflix", alias: "Bflix", base: "https://bflix.gg", search: ["/search/{q}", "/search?keyword={q}"], home: ["/home"], card: ["film-poster"] },
    { name: "NewMovies123", alias: "PlayPelis11", base: "https://new-movies123.link", search: ["/search/{q}", "/search/{q}/"], home: ["/"], card: ["film-poster", "movie-item"] },
    { name: "Cuevana2", alias: "PlayPelis7", base: "https://cuevana2.biz", search: ["/page/1/?s={q}", "/search/{q}/"], home: ["/peliculas/estrenos/page/1", "/series/estrenos/page/1"], card: ["item", "film_list-wrap"] },
    { name: "Gnula", alias: "PlayPelis3", base: "https://gnula.uno", search: ["/?s={q}", "/buscar/{q}"], home: ["/"] , card: ["movie-item", "item"] },
    { name: "EntrePeliculas", alias: "PlayPelis2", base: "https://entrepeliculasyseries.nz", search: ["/?s={q}", "/search/{q}"], home: ["/"] , card: ["item", "movie-item"] },
    { name: "PelisPlus2AI", alias: "PlayPelis13", base: "https://pelisplus2.ai", search: ["/search/{q}", "/search?q={q}"], home: ["/"] , card: ["movie-item", "mouCgDQMxDwt"] }
];

var SERVER_HOSTS = [
    "streamsb.net","streamsss.net","ssbstream.net","watchsb.com","sbanh.com","sbfast.com","sbfast.live","sbfull.com","sbplay.one","sbplay.org","sbplay1.com","sbplay2.com","sbplay2.xyz","sbplay3.com","sblongvu.com","lvturbo.com",
    "dood.cx","dood.la","dood.pm","dood.sh","dood.so","dood.to","dood.watch","dood.wf","dood.ws","dood.yt","doodstream.com",
    "uqload.co","uqload.com","voe.sx","streamtape.com","upstream.to","streamlare.com","plusvip.net","re.sololatino.net","v2.zplayer.live","zplayer.live","fastream.to","vidcloud9.org","doc.vidcloud9.org","okru.link","playhide.online","moonplayer.lat","pelisplay.cc","pelisplus.esplay.io","pelisplus.esplay.one","api.mycdn.moe","pelisplus.esplay.io","pelisplus.esplay.one"
];

var _settings = {};
var _debug = "";
var _lastProvider = "";
var _dead = {};
var _hostFail = {};
var _hostOk = {};
var _deadline = 0;
var _lastDetailDebug = "";
var DEBUG_ON = true;
var SCRIPT_VERSION = "v9-diag";

function log(s) { _debug += String(s) + "\n"; }
function resetDebug() { _debug = ""; _dead = {}; _deadline = 0; }
function clean(s) {
    if (s == null) return "";
    return String(s).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'").replace(/\\u0026/g,"&").replace(/\\\//g,"/").replace(/\s+/g," ").trim();
}
function enc(s) { return encodeURIComponent(String(s || "")); }
function dec(s) { try { return decodeURIComponent(String(s || "")); } catch(e) { return String(s || ""); } }
function readBody(r) { if (!r) return ""; if (typeof r == "string") return r; if (r.body != null) return String(r.body); if (r.data != null && typeof r.data == "string") return r.data; return ""; }
function absUrl(u, base) {
    u = clean(u); if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.charAt(0) === "/") return base + u;
    return base + "/" + u;
}
function hostOf(url) { var m = String(url || "").match(/^https?:\/\/([^\/]+)/i); return m ? m[1].toLowerCase() : ""; }
function providerFor(url) {
    var h = hostOf(url), i;
    for (i=0;i<PROVIDERS.length;i++) if (h == hostOf(PROVIDERS[i].base) || h.slice(-hostOf(PROVIDERS[i].base).length-1) == "."+hostOf(PROVIDERS[i].base)) return PROVIDERS[i];
    return null;
}
function baseFor(url) { var p=providerFor(url); return p ? p.base : (url.match(/^https?:\/\/[^\/]+/i)||[""])[0]; }
function httpGet(url, base) {
    var host = hostOf(url);
    if (_dead[host]) return "";
    if (_hostFail[host] && (Date.now() - _hostFail[host]) < 300000) { _dead[host] = 1; return ""; }
    if (_deadline && Date.now() > _deadline) { if (!_dead["__budget"]) { _dead["__budget"] = 1; log("Tiempo agotado, se omiten más peticiones"); } return ""; }
    try {
        var r = http.GET(url, {"User-Agent":UA,"Accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8","Referer":(base || url)}, false);
        if (r && r.code !== undefined && r.code !== 200) log("HTTP " + r.code + " " + host);
        var b = readBody(r);
        if (b && b.length > MAX_HTML) b = b.substring(0, MAX_HTML);
        return b;
    } catch(e) {
        _dead[host] = 1;
        _hostFail[host] = Date.now();
        var msg = String(e).replace(/^Error:\s*/, "");
        if (/resolve host|UnknownHost/i.test(msg)) msg = "DNS no resuelve";
        log("X " + host + " : " + msg.substring(0, 50));
        return "";
    }
}
function blocksByClass(html, className) {
    var out=[], re=/<([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*class=["']([^"']*)["'][^>]*>/gi, m;
    while((m=re.exec(html))!=null) {
        var cs=m[2].split(/\s+/), ok=false, i;
        for(i=0;i<cs.length;i++) if(cs[i]==className){ok=true;break;}
        if(!ok) continue;
        var tag=m[1], rr=new RegExp("<\\/?"+tag+"\\b[^>]*>","gi"); rr.lastIndex=m.index; var depth=0,z;
        while((z=rr.exec(html))!=null){ if(/^<\//.test(z[0])){depth--;if(depth<=0){out.push(html.substring(m.index,rr.lastIndex));break;}} else if(!/\/>$/.test(z[0])) depth++; }
        if(out.length>=150) break;
    }
    return out;
}
function tagBlocks(html, tag) {
    var out=[], re=new RegExp("<"+tag+"\\b[^>]*>","gi"),m;
    while((m=re.exec(html))!=null){var rr=new RegExp("<\\/?"+tag+"\\b[^>]*>","gi");rr.lastIndex=m.index;var d=0,z;while((z=rr.exec(html))!=null){if(/^<\//.test(z[0])){d--;if(d<=0){out.push(html.substring(m.index,rr.lastIndex));break;}}else if(!/\/>$/.test(z[0]))d++;}if(out.length>=100)break;}
    return out;
}
function attr(tag,name){var r=new RegExp("\\b"+name+"\\s*=\\s*[\\\"']([^\\\"']*)[\\\"']","i"),m=r.exec(tag);return m?clean(m[1]):"";}
function strip(s){return clean(String(s||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));}
function textIn(block, cls) { var a=blocksByClass(block,cls); return a.length?strip(a[0]):""; }
function firstTag(block, tag){var m=new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/"+tag+">","i").exec(block);return m?strip(m[1]):"";}
function firstHref(block, base){var m=/<a\b[^>]*>/i.exec(block);return m?absUrl(attr(m[0],"href"),base):"";}
function firstImg(block, base){var re=/<img\b[^>]*>/gi,m;while((m=re.exec(block))!=null){var u=attr(m[0],"data-src")||attr(m[0],"data-original")||attr(m[0],"data-lazy-src")||attr(m[0],"src");if(u)return absUrl(u,base);}var bg=/data-setbg=["']([^"']+)["']/i.exec(block);return bg?absUrl(bg[1],base):"";}
function normalizeTitle(s){return clean(s).toLowerCase().replace(/&[^;]+;/g," ").replace(/[^a-z0-9áéíóúüñ]+/gi," ").replace(/\s+/g," ").trim();}
function typeFor(url){var x=String(url||"").toLowerCase();if(/\/tv(?:show)?\//.test(x)||/\/serie(?:s)?\//.test(x)||/\/episodio\//.test(x)||/\/episode\//.test(x))return "tvshow";return "movie";}
function isBadTitle(t){var x=normalizeTitle(t);return !x || x.indexOf("erotic")>=0 || x.indexOf("xxx")>=0 || x.indexOf("18 plus")>=0 || x.indexOf("18+")>=0;}
function cardFromBlock(b, base){var u=firstHref(b,base), t=firstTag(b,"h1")||firstTag(b,"h2")||firstTag(b,"h3")||firstTag(b,"h4")||textIn(b,"entry-title")||textIn(b,"item-title")||textIn(b,"lnk-blk"); if(!t){var a=/<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(b);if(a)t=strip(a[1]);} var img=firstImg(b,base); if(!u||isBadTitle(t))return null; return {title:clean(t),url:u,poster:img,type:typeFor(u)};}
function extractCards(html, base, classes){var out=[],seen={},i,j,blocks=[];for(i=0;i<(classes||[]).length;i++){blocks=blocks.concat(blocksByClass(html,classes[i]));}if(!blocks.length){blocks=tagBlocks(html,"article");blocks=blocks.concat(tagBlocks(html,"li"));}for(i=0;i<blocks.length&&out.length<MAX_ITEMS;i++){var x=cardFromBlock(blocks[i],base);if(x&&!seen[x.url]){seen[x.url]=1;out.push(x);}}return out;}
function getPathVariants(p, q, home){var a=home?p.home:p.search,i,out=[];for(i=0;i<a.length;i++)out.push(a[i].replace(/\{q\}/g,encodeURIComponent(q).replace(/%20/g,"+")));return out;}
function fetchFirst(p, paths){var i,h,u;for(i=0;i<paths.length;i++){u=p.base+paths[i];h=httpGet(u,p.base);if(h&&h.length>800){_lastProvider=p.name;_hostOk[hostOf(p.base)]=1;log("OK "+p.name+" "+paths[i]+" len="+h.length);return {html:h,url:u,base:p.base};}if(_dead[hostOf(p.base)])return null;}log("SIN HTML "+p.name);return null;}
function parseProviderSearch(p,q){var r=fetchFirst(p,getPathVariants(p,q,false));if(!r)return[];var out=[],i,sites,cards,b,x;
    if(p.name=="Pelisplushd"){sites=tagBlocks(r.html,"web-site");for(i=0;i<sites.length;i++){cards=blocksByClass(sites[i],"mouCgDQMxDwt");for(var j=0;j<cards.length&&out.length<MAX_ITEMS;j++){b=cardFromBlock(cards[j],r.base);if(b)out.push(b);}}}
    if(!out.length) out=extractCards(r.html,r.base,p.card);
    for(i=0;i<out.length;i++)out[i].provider=p.name;
    log(p.name+" search="+out.length);return out;
}
function parseProviderHome(p){var r=fetchFirst(p,getPathVariants(p,"",true));if(!r)return[];var out=extractCards(r.html,r.base,p.card),i;for(i=0;i<out.length;i++)out[i].provider=p.name;log(p.name+" home="+out.length);return out;}
function mergeUnique(items){var out=[],seen={},i,key;for(i=0;i<items.length&&out.length<MAX_ITEMS;i++){key=normalizeTitle(items[i].title)+"|"+normalizeTitle(items[i].type);if(!seen[key]){seen[key]=1;out.push(items[i]);}}return out;}
function searchProviders(q){var all=[],i,r;for(i=0;i<PROVIDERS.length&&all.length<MAX_ITEMS*2;i++){r=parseProviderSearch(PROVIDERS[i],q);all=all.concat(r);}return mergeUnique(all);}
function homeProviders(){var all=[],i,r;for(i=0;i<PROVIDERS.length&&all.length<MAX_ITEMS*2;i++){r=parseProviderHome(PROVIDERS[i]);all=all.concat(r);}return mergeUnique(all);}

function tmdbGet(path){var u=TMDB_API+path+(path.indexOf("?")>=0?"&":"?")+"api_key="+enc(TMDB_KEY)+"&language=es-AR";try{var r=http.GET(u,{"User-Agent":UA,"Accept":"application/json"},false),b=readBody(r);return b?JSON.parse(b):null;}catch(e){log("TMDB "+String(e));return null;}}
function tmdbPoster(p){return p?TMDB_IMG+p:"";}
function tmdbList(path){var d=tmdbGet(path),out=[],i,x;if(!d||!d.results)return out;for(i=0;i<d.results.length&&out.length<MAX_ITEMS;i++){x=d.results[i];if(x&&(x.media_type=="movie"||x.media_type=="tv"))out.push({title:x.title||x.name,url:"ppv7://tmdb/"+(x.media_type=="tv"?"tvshow":"movie")+"/"+x.id,poster:tmdbPoster(x.poster_path),type:x.media_type=="tv"?"tvshow":"movie",tmdbId:x.id});}return out;}

function debugItems(header){
    var out=[], lines=(SCRIPT_VERSION+"\n"+_lastDetailDebug+"\n"+_debug).split("\n"), n=0, i, l;
    out.push(catalogVideo("diag_h_"+Math.floor(Math.random()*1000000),"[DIAG] "+header,"","ppv7://debug/x"));
    for(i=0;i<lines.length&&n<40;i++){
        l=String(lines[i]).replace(/^\s+|\s+$/g,"");
        if(!l) continue;
        out.push(catalogVideo("diag_"+i+"_"+Math.floor(Math.random()*1000000),"[DIAG] "+l.substring(0,90),"","ppv7://debug/"+i));
        n++;
    }
    return out;
}
function makeWeb(kind,url){return "ppv7://web/"+kind+"/"+enc(url);}
function parseInternal(url){var s=String(url||""),m=s.match(/^ppv7:\/\/web\/(movie|tvshow|episode)\/(.+)$/);if(m)return{mode:"web",kind:m[1],url:dec(m[2])};m=s.match(/^ppv7:\/\/tmdb\/(movie|tvshow)\/(\d+)$/);if(m)return{mode:"tmdb",kind:m[1],id:m[2]};return null;}
function author(){return new PlatformAuthorLink(PPID,"PlayPelis", "https://github.com/cheito55/PlayP", "", 0);}
function thumb(u){return u?new Thumbnails([new Thumbnail(u,100)]):new Thumbnails([]);}
function catalogVideo(id,title,poster,url){return new PlatformVideo({id:new PlatformID(PLATFORM,id,PID),name:title||"Sin título",thumbnails:thumb(poster),author:author(),uploadDate:0,viewCount:0,duration:0,isLive:false,url:url});}

function directMedia(u,label){u=clean(u).replace(/[),;'\\]+$/g,"");if(/\.m3u8(?:[?#]|$)/i.test(u))return new HLSSource({name:label||"HLS",url:u,duration:0});if(/\.mp4(?:[?#]|$)/i.test(u))return new VideoUrlSource({width:0,height:0,container:"mp4",codec:"",name:label||"MP4",bitrate:0,duration:0,url:u});return null;}
function isServer(u){var h=hostOf(u),i;for(i=0;i<SERVER_HOSTS.length;i++)if(h==SERVER_HOSTS[i]||h.slice(-SERVER_HOSTS[i].length-1)=="."+SERVER_HOSTS[i])return true;return false;}
function urlsFromHtml(h,base){var out=[],seen={},re=/(?:https?:)?\/\/[^"'<>\\\s]+/gi,m,u,i,attrs=[/\b(?:src|data-src|data-video|data-link|data-server)=["']([^"']+)["']/gi];
    while((m=re.exec(h))!=null&&out.length<MAX_CRAWL){u=clean(m[0]);if(u.indexOf("//")==0)u="https:"+u;if(!seen[u]){seen[u]=1;out.push(u);}}
    for(i=0;i<attrs.length;i++){re=attrs[i];while((m=re.exec(h))!=null&&out.length<MAX_CRAWL){u=absUrl(m[1],base);if(!seen[u]){seen[u]=1;out.push(u);}}}
    return out;
}
function extractDirect(h,label){var out=[],seen={},re=/https?:\/\/[^"'<>\\\s]+/gi,m,s;while((m=re.exec(h))!=null&&out.length<MAX_SOURCES){s=directMedia(m[0],label);if(s){var k=m[0];if(!seen[k]){seen[k]=1;out.push(s);}}}return out;}
function crawlForSources(startUrl){var queue=[startUrl],seen={},sources=[],depth=0;while(queue.length&&sources.length<MAX_SOURCES&&depth<MAX_CRAWL){var u=queue.shift();if(seen[u])continue;seen[u]=1;var b=baseFor(u),h=httpGet(u,b);if(!h){depth++;continue;}var d=extractDirect(h,"PlayPelis");sources=sources.concat(d);if(sources.length>=MAX_SOURCES)break;var links=urlsFromHtml(h,b),i;for(i=0;i<links.length&&queue.length<MAX_CRAWL;i++){var v=links[i];if(/^(?:https?:\/\/)/i.test(v)&&(!seen[v])&&(isServer(v)||/\/embed|\/e\/|\/player|\/watch|\/video\//i.test(v)))queue.push(v);}depth++;}return sources;}
function pelisAjax(url,isEpisode){var p=providerFor(url);if(!p||p.name!="Pelisplushd")return[];var s=String(url).split("?")[0].replace(/\/+$/,"").split("/");var id=s[s.length-1].split("-").pop(), path=isEpisode?"/ajax/v2/episode/servers/":"/ajax/movie/episodes/";var h=httpGet(p.base+path+id,p.base);if(!h)return[];var out=[],re=/<a\b[^>]*>/gi,m;while((m=re.exec(h))!=null&&out.length<MAX_SOURCES){var did=attr(m[0],"data-id")||attr(m[0],"data-linkid");if(!did)continue;var watch=(isEpisode?url.replace("/episode/","/watch-tv/"):url.replace("/movie/","/watch-movie/"))+"."+did;out.push(watch);}return out;}
function b64decode(s){
    var chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", out="", i=0, c1,c2,c3,c4,n;
    s=String(s||"").replace(/[^A-Za-z0-9+\/=]/g,"");
    while(i<s.length){c1=chars.indexOf(s.charAt(i++));c2=chars.indexOf(s.charAt(i++));c3=chars.indexOf(s.charAt(i++));c4=chars.indexOf(s.charAt(i++));if(c1<0||c2<0)break;n=(c1<<18)|(c2<<12)|((c3<0?0:c3)<<6)|(c4<0?0:c4);out+=String.fromCharCode((n>>16)&255);if(c3>=0&&s.charAt(i-2)!="=")out+=String.fromCharCode((n>>8)&255);if(c4>=0&&s.charAt(i-1)!="=")out+=String.fromCharCode(n&255);}return out;
}
function addSource(arr, s){if(!s)return;var u=String(s.url||"");if(!u)return;var i;for(i=0;i<arr.length;i++)if(String(arr[i].url||"")==u)return;arr.push(s);}
function addDirectFromText(arr,text,label){var re=/https?:\/\/[^\s"'<>\\]+/gi,m,s;while((m=re.exec(String(text||"")))!=null){s=directMedia(m[0],label);if(s)addSource(arr,s);} }
function extractorVoe(url){var h=httpGet(url,"https://voe.sx"),m,re=/['\"](hls|mp4)['\"]\s*:\s*['\"]([^'\"]+)['\"]/gi;while((m=re.exec(h))!=null){var s=directMedia(m[2],"Voe "+m[1]);if(s)return s;}return null;}
function extractorUqload(url){var u=String(url||"");if(u.indexOf(".html")<0)u += ".html";var h=httpGet(u,"https://uqload.com"),m=re=/sources\s*:\s*\[([^\]]+)\]/i.exec(h);if(!m)return[];var parts=m[1].replace(/\\"/g,'').replace(/\"/g,'').split(','),out=[],i,s;for(i=0;i<parts.length;i++){s=directMedia(clean(parts[i]),"Uqload "+(i+1));if(s)addSource(out,s);}return out;}
function extractorStreamTape(url){var h=httpGet(url,"https://streamtape.com"),m=/robotlink'\)\.innerHTML\s*=\s*'(.+?)'\+\s*\('(.+?)'\)/i.exec(h);if(!m)return null;return new VideoUrlSource({width:0,height:0,container:"mp4",codec:"",name:"StreamTape",bitrate:0,duration:0,url:"https:"+m[1]+m[2].substring(3)});}
function extractorDood(url){var host=hostOf(url)||"dood.wf", id=(String(url).split("/e/")[1]||"").split(/[?#]/)[0];if(!id)return null;var base="https://"+host,h=httpGet(base+"/e/"+id,base),m=/\/pass_md5\/[^']*/g.exec(h);if(!m)return null;var pass=base+m[0],r;try{r=http.GET(pass,{"User-Agent":UA,"Referer":base+"/"},false);}catch(e){return null;}var body=readBody(r);if(!body)return null;var token=(m[0].split("/").pop()||"");var u=body+"zUEJeL3mUN?token="+token;return new VideoUrlSource({width:0,height:0,container:"mp4",codec:"",name:"DoodStream",bitrate:0,duration:0,url:u});}
function extractorPlusVip(url){var h=httpGet(url,"https://plusvip.net"),m=/['\"]\/sources\/([^'\"]+)/i.exec(h);if(!m)return null;var linkPart=(String(url).split("?data=")[1]||"");var body="link="+encodeURIComponent(linkPart);try{var r=http.POST("https://plusvip.net/sources/"+m[1],body,{"User-Agent":UA,"Referer":url,"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},false);var b=readBody(r),x=/\{link:\s*([^}]+)\}/i.exec(b);if(x)return directMedia(x[1].replace(/\\/g,""),"PlusVip");}catch(e){log("PlusVip POST "+String(e));}return null;}
function extractorResolo(url){var h=httpGet(url,"https://re.sololatino.net"),m=/file\s*:\s*['\"]([^'\"]+)['\"]/i.exec(h);return m?directMedia(m[1],"ReSololatino"):null;}
function extractorEsplay(url){var id=(String(url).split("#")[1]||"");if(!id)return null;try{var r=http.GET("https://pelisplus.esplay.one/video/"+id,{"User-Agent":UA,"Referer":"https://pelisplus.esplay.io/"},false),b=readBody(r);if(!b)return null;var d=JSON.parse(b);return d&&d.file?directMedia(d.file,"Esplay"):null;}catch(e){return null;}}
function extractorMyCdn(url,depth){if(depth>2)return[];var out=[],h=httpGet(url,baseFor(url));if(!h)return out;addDirectFromText(out,h,"MyCDN");var re=/go_to_player\(['\"]([^'\"]+)/gi,m;while((m=re.exec(h))!=null&&out.length<MAX_SOURCES){var p=m[1];if(p.indexOf("http")!==0)p="https://api.mycdn.moe/player/?id="+p;var ph=httpGet(p,"https://api.mycdn.moe");addDirectFromText(out,ph,"MyCDN");var ir=/iframe[^>]+src=['\"]([^'\"]+)/i.exec(ph);if(ir){var got=extractServerUrl(absUrl(ir[1],"https://api.mycdn.moe"),depth+1);var j;for(j=0;j<got.length;j++)addSource(out,got[j]);}}return out;}
function extractServerUrl(url,depth){if(depth>3)return[];var out=[],u=clean(url),h=hostOf(u),s;
    s=directMedia(u,"Direct");if(s){addSource(out,s);return out;}
    if(h.indexOf("voe.")>=0){s=extractorVoe(u);if(s)addSource(out,s);return out;}
    if(h.indexOf("uqload.")>=0){var uq=extractorUqload(u),i;for(i=0;i<uq.length;i++)addSource(out,uq[i]);return out;}
    if(h.indexOf("streamtape.")>=0){s=extractorStreamTape(u);if(s)addSource(out,s);return out;}
    if(h.indexOf("dood.")>=0){s=extractorDood(u);if(s)addSource(out,s);return out;}
    if(h.indexOf("plusvip.")>=0){s=extractorPlusVip(u);if(s)addSource(out,s);return out;}
    if(h.indexOf("re.sololatino.")>=0){s=extractorResolo(u);if(s)addSource(out,s);return out;}
    if(h.indexOf("pelisplus.esplay")>=0){s=extractorEsplay(u);if(s)addSource(out,s);return out;}
    if(h.indexOf("api.mycdn.moe")>=0)return extractorMyCdn(u,depth);
    var hh=httpGet(u,baseFor(u));if(!hh)return out;addDirectFromText(out,hh,h||"Server");
    var ifr=/iframe[^>]+(?:src|data-src)=['\"]([^'\"]+)/gi,m;while((m=ifr.exec(hh))!=null&&out.length<MAX_SOURCES){var v=absUrl(m[1],baseFor(u));var more=extractServerUrl(v,depth+1);var j;for(j=0;j<more.length;j++)addSource(out,more[j]);}
    var ds=/data-server=['\"]([^'\"]+)/gi;while((m=ds.exec(hh))!=null&&out.length<MAX_SOURCES){var raw=m[1].split("?v=")[1]||m[1];var dec=b64decode(raw);if(dec&&dec.indexOf("http")===0){var more2=extractServerUrl(dec,depth+1),k;for(k=0;k<more2.length;k++)addSource(out,more2[k]);}}
    return out;
}
function providerPageSources(url,kind){
    var candidates=[],p=providerFor(url),i,h,re,m;
    if(p&&p.name=="Pelisplushd"){var links=pelisAjax(url,kind=="episode");for(i=0;i<links.length;i++)candidates.push(links[i]);}
    h=httpGet(url,p?p.base:baseFor(url));
    if(h){
        var ifr=/iframe[^>]+(?:src|data-src)=['\"]([^'\"]+)/gi;while((m=ifr.exec(h))!=null)candidates.push(absUrl(m[1],p?p.base:baseFor(url)));
        var dat=/data-video=['\"]([^'\"]+)/gi;while((m=dat.exec(h))!=null)candidates.push(absUrl(m[1],p?p.base:baseFor(url)));
        var ds=/data-server=['\"]([^'\"]+)/gi;while((m=ds.exec(h))!=null){var raw=m[1].split("?v=")[1]||m[1],dec=b64decode(raw);if(dec)candidates.push(dec);}
        var oc=/onclick=['\"][^'\"]*go_to_player\(['\"]([^'\"]+)/gi;while((m=oc.exec(h))!=null)candidates.push(m[1].indexOf("http")===0?m[1]:"https://api.mycdn.moe/player/?id="+m[1]);
        if(p&&(p.name.indexOf("Cuevana3")===0)){var aa=/li[^>]+class=['\"][^'\"]*option[^'\"]*['\"][^>]+data-link=['\"]([^'\"]+)/gi;while((m=aa.exec(h))!=null)candidates.push(absUrl(m[1],p.base));}
    }
    candidates.push(url);
    var sources=[],seen={};
    for(i=0;i<candidates.length&&sources.length<MAX_SOURCES;i++){
        var got=extractServerUrl(candidates[i],0),j;
        for(j=0;j<got.length&&sources.length<MAX_SOURCES;j++){var key=String(got[j].url||"");if(!seen[key]){seen[key]=1;sources.push(got[j]);}}
    }
    log("SOURCE candidates="+candidates.length+" resolved="+sources.length);
    return sources;
}
function genericDetail(url){var p=providerFor(url),b=baseFor(url),h=httpGet(url,b);if(!h)return null;var title=firstTag(h,"h1")||textIn(h,"entry-title")||textIn(h,"heading-name")||textIn(h,"title"),poster=firstImg(h,b),syn=textIn(h,"description")||textIn(h,"sinopsis")||textIn(h,"overview");if(!title){var og=/property=["']og:title["'][^>]*content=["']([^"']+)/i.exec(h);if(og)title=clean(og[1]);}if(!poster){var om=/property=["']og:image["'][^>]*content=["']([^"']+)/i.exec(h);if(om)poster=absUrl(om[1],b);}return{title:clean(title),poster:poster,synopsis:clean(syn),provider:p?p.name:hostOf(url),sources:providerPageSources(url,typeFor(url))};}
function tmdbDetails(kind,id){var d=tmdbGet("/"+(kind=="tvshow"?"tv":"movie")+"/"+id);if(!d)return null;return{title:d.title||d.name,poster:tmdbPoster(d.poster_path),synopsis:d.overview||"",year:String(d.release_date||d.first_air_date||"").substring(0,4),kind:kind};}
function findProviderMatch(title,kind){
    var q=normalizeTitle(title),best=null,score=-1,i,j,k,r,t,s2,p,tried=0,skipped=0,seen={},list=[];
    var order=["Cuevana3","Cuevana3Me","Cuevana3CC","PeliSmart","SmartPelis","Gnula","Bflix","Cuevana2","EntrePeliculas"];
    function add(pr){if(pr&&!seen[pr.name]){seen[pr.name]=1;list.push(pr);}}
    /* 1) sitios que ya respondieron antes, 2) orden preferido, 3) el resto */
    for(j=0;j<PROVIDERS.length;j++)if(_hostOk[hostOf(PROVIDERS[j].base)])add(PROVIDERS[j]);
    for(i=0;i<order.length;i++)for(j=0;j<PROVIDERS.length;j++)if(PROVIDERS[j].name==order[i])add(PROVIDERS[j]);
    for(j=0;j<PROVIDERS.length;j++)add(PROVIDERS[j]);
    for(i=0;i<list.length;i++){
        p=list[i];
        if(_dead[hostOf(p.base)]||(_hostFail[hostOf(p.base)]&&(Date.now()-_hostFail[hostOf(p.base)])<300000)){skipped++;continue;}
        if(_deadline&&Date.now()>_deadline){log("Tiempo agotado en "+p.name);break;}
        tried++;
        r=parseProviderSearch(p,title);
        for(k=0;k<r.length;k++){
            t=normalizeTitle(r[k].title);if(!t)continue;
            s2=(t==q?120:((t.indexOf(q)>=0||q.indexOf(t)>=0)?75:0));
            if(kind==r[k].type)s2+=10;
            if(s2>score){score=s2;best=r[k];}
        }
        if(score>=120)break;
    }
    if(best)log("MATCH "+title+" -> "+best.provider+" / "+best.title+" score="+score);else log("SIN COINCIDENCIA para "+title+" (probados "+tried+", omitidos "+skipped+")");
    return best;
}
function search(query){
    resetDebug();
    var t=tmdbList("/search/multi?query="+enc(query)+"&page=1&include_adult=false");
    var r=[],i;
    for(i=0;i<t.length;i++)r.push(catalogVideo("tmdb_"+i,t[i].title,t[i].poster,t[i].url));
    if(!r.length) log("TMDB SEARCH returned 0 results");
    if(DEBUG_ON&&!r.length){r=debugItems("Búsqueda sin resultados");}
    return r;
}
function home(){
    resetDebug();
    var t=tmdbList("/trending/all/day");
    var r=[],i;
    for(i=0;i<t.length;i++)r.push(catalogVideo("tmdbhome_"+i,t[i].title,t[i].poster,t[i].url));
    if(!r.length) log("TMDB HOME returned 0 results");
    if(DEBUG_ON){r=debugItems(r.length?"Home OK ("+r.length+") - log del último video abierto":"Home VACÍO").concat(r);}
    return r;
}
function details(url){
    if(String(url||"").indexOf("ppv7://debug/")===0){return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"diag",PID),name:"Diagnóstico",thumbnails:new Thumbnails([]),author:author(),uploadDate:0,viewCount:0,isLive:false,url:String(url),video:new VideoSourceDescriptor([]),description:_lastDetailDebug});}
    resetDebug();
    _deadline=Date.now()+35000;
    var res=null;
    try{res=detailsInner(url);}catch(e){log("DETAIL exc "+String(e).substring(0,80));throw e;}finally{_lastDetailDebug=_debug;}
    return res;
}
function detailsInner(url){var p=parseInternal(url);if(!p)return null;if(p.mode=="tmdb"){var td=tmdbDetails(p.kind,p.id);if(!td)return null;var m=findProviderMatch(td.title,p.kind);if(m){var gd=genericDetail(m.url);if(gd&&gd.sources.length)return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"tmdb_"+p.id,PID),name:gd.title||td.title,thumbnails:thumb(gd.poster||td.poster),author:author(),uploadDate:0,viewCount:0,isLive:false,url:makeWeb(p.kind,m.url),video:new VideoSourceDescriptor(gd.sources),description:td.synopsis+"\n\nProveedor: "+gd.provider+"\nFuentes: "+gd.sources.length+"\n\n=== DEBUG ===\n"+_debug});}return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"tmdb_"+p.id,PID),name:td.title,thumbnails:thumb(td.poster),author:author(),uploadDate:0,viewCount:0,isLive:false,url:url,video:new VideoSourceDescriptor([]),description:td.synopsis+"\n\nNo se encontró una fuente reproducible.\n\n=== DEBUG ===\n"+_debug});}
    var d=genericDetail(p.url);if(!d)return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"err_"+enc(p.url),PID),name:"PlayPelis: sin respuesta",thumbnails:new Thumbnails([]),author:author(),uploadDate:0,viewCount:0,isLive:false,url:p.url,video:new VideoSourceDescriptor([]),description:"El proveedor no devolvió HTML.\n\n=== DEBUG ===\n"+_debug});return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"web_"+enc(p.url),PID),name:d.title||"Sin título",thumbnails:thumb(d.poster),author:author(),uploadDate:0,viewCount:0,isLive:false,url:p.url,video:new VideoSourceDescriptor(d.sources),description:(d.synopsis||"")+"\n\nCatálogo/proveedor: "+d.provider+"\nFuentes descubiertas: "+d.sources.length+"\n\n=== DEBUG ===\n"+_debug});
}
if(typeof source!="undefined"){
 source.setSettings=function(s){_settings=s||{};};
 source.enable=function(c,s){_settings=s||{};};
 source.getSearchCapabilities=function(){return{types:[Type.Feed.Mixed],sorts:[],filters:[]};};
 source.search=function(q){try{return new VideoPager(search(q||""),false,null);}catch(e){return new VideoPager([],false,null);}};
 source.searchSuggestions=function(q){return[];};
 source.getHome=function(){try{return new VideoPager(home(),false,null);}catch(e){return new VideoPager([],false,null);}};
 source.isChannelUrl=function(){return false;};
 source.isContentDetailsUrl=function(u){return /^ppv7:\/\/(web|tmdb|debug)\//.test(String(u||""));};
 source.isVideoDetailsUrl=function(u){return source.isContentDetailsUrl(u);};
 source.getVideoDetails=function(u){return source.getContentDetails(u);};
 source.getContentDetails=function(u){try{return details(u);}catch(e){log("DETAIL "+String(e));return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"err",PID),name:"PlayPelis error",thumbnails:new Thumbnails([]),author:author(),uploadDate:0,viewCount:0,isLive:false,url:String(u||""),video:new VideoSourceDescriptor([]),description:String(e)+"\n\n"+_debug});}};
 source.getContentRecommendations=function(){return new VideoPager([],false,null);};
}
