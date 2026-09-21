/*
 * PlayPelis GrayJay Source v10 - TMDB catalog + provider playback
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
 * toda esa capa headless; v10 hace descubrimiento HTTP y porta los resolvers HTTP observados en la APK de enlaces directos y
 * de embeds, y deja trazas de lo que encontró.
 */

var PID = "f1a0c9d8-6e72-4b35-a941-2c7d8e5f3019";
var PLATFORM = "PlayPelis";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);

var TMDB_KEY = "26c168179ae6b5445f36aca260e00d48";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_IMG = "https://image.tmdb.org/t/p/w500";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

var MAX_ITEMS = 60;
var MAX_SOURCES = 24;
var MAX_CRAWL = 10;
var MAX_SERVER_CANDIDATES = 12;
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

function log(s) { _debug += String(s) + "\n"; }
function resetDebug() { _debug = ""; }
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
    try {
        var r = http.GET(url, {"User-Agent":UA,"Accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8","Referer":(base || url)});
        var b = readBody(r);
        if (b && b.length > MAX_HTML) b = b.substring(0, MAX_HTML);
        return b;
    } catch(e) { log("GET " + url + " -> " + String(e)); return ""; }
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
function fetchFirst(p, paths){var i,h,u;for(i=0;i<paths.length;i++){u=p.base+paths[i];h=httpGet(u,p.base);if(h&&h.length>800){_lastProvider=p.name;log(p.name+" OK "+paths[i]+" len="+h.length);return {html:h,url:u,base:p.base};}log(p.name+" no usable HTML "+paths[i]);}return null;}
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

function tmdbGet(path){var u=TMDB_API+path+(path.indexOf("?")>=0?"&":"?")+"api_key="+enc(TMDB_KEY)+"&language=es-AR";try{var r=http.GET(u,{"User-Agent":UA,"Accept":"application/json"}),b=readBody(r);return b?JSON.parse(b):null;}catch(e){log("TMDB "+String(e));return null;}}
function tmdbPoster(p){return p?TMDB_IMG+p:"";}
function tmdbList(path){var d=tmdbGet(path),out=[],i,x;if(!d||!d.results)return out;for(i=0;i<d.results.length&&out.length<MAX_ITEMS;i++){x=d.results[i];if(x&&(x.media_type=="movie"||x.media_type=="tv"))out.push({title:x.title||x.name,url:"ppv12://tmdb/"+(x.media_type=="tv"?"tvshow":"movie")+"/"+x.id,poster:tmdbPoster(x.poster_path),type:x.media_type=="tv"?"tvshow":"movie",tmdbId:x.id});}return out;}

function makeWeb(kind,url){return "ppv12://web/"+kind+"/"+enc(url);}
function parseInternal(url){var s=String(url||""),m=s.match(/^ppv12:\/\/web\/(movie|tvshow|episode)\/(.+)$/);if(m)return{mode:"web",kind:m[1],url:dec(m[2])};m=s.match(/^ppv12:\/\/tmdb\/(movie|tvshow)\/(\d+)$/);if(m)return{mode:"tmdb",kind:m[1],id:m[2]};return null;}
function author(){return new PlatformAuthorLink(PPID,"PlayPelis", "https://github.com/cheito55/PlayP", "", 0);}
function thumb(u){return u?new Thumbnails([new Thumbnail(u,100)]):new Thumbnails([]);}
function catalogVideo(id,title,poster,url){return new PlatformVideo({id:new PlatformID(PLATFORM,id,PID),name:title||"Sin título",thumbnails:thumb(poster),author:author(),uploadDate:0,viewCount:0,duration:0,isLive:false,url:url});}

function directMedia(u,label){
    u=clean(u).replace(/[),;'\\]+$/g,"");
    if(/^https?:\/\//i.test(u)&&/\.m3u8(?:[?#]|$)/i.test(u))return new HLSSource({name:label||"HLS",url:u,duration:0});
    if(/^https?:\/\//i.test(u)&&/\.mp4(?:[?#]|$)/i.test(u))return new VideoUrlSource({width:0,height:0,container:"mp4",codec:"",name:label||"MP4",bitrate:0,duration:0,url:u});
    return null;
}
function isServer(u){var h=hostOf(u),i;for(i=0;i<SERVER_HOSTS.length;i++)if(h==SERVER_HOSTS[i]||h.slice(-SERVER_HOSTS[i].length-1)=="."+SERVER_HOSTS[i])return true;return false;}
function addSource(arr,s,label){if(!s)return;var u=String(s.url||"");if(!u)return;if(label&&s.name==null)s.name=label;var i;for(i=0;i<arr.length;i++)if(String(arr[i].url||"")==u)return;arr.push(s);}
function addDirectFromText(arr,text,label){var re=/https?:\/\/[^\s"'<>\\]+/gi,m,s;while((m=re.exec(String(text||"")))!=null){s=directMedia(m[0],label);if(s)addSource(arr,s,label);}}
function b64decode(s){
    var chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",out="",i=0,c1,c2,c3,c4,n;
    s=String(s||"").replace(/[^A-Za-z0-9+\/=]/g,"");
    while(i<s.length){c1=chars.indexOf(s.charAt(i++));c2=chars.indexOf(s.charAt(i++));c3=chars.indexOf(s.charAt(i++));c4=chars.indexOf(s.charAt(i++));if(c1<0||c2<0)break;n=(c1<<18)|(c2<<12)|((c3<0?0:c3)<<6)|(c4<0?0:c4);out+=String.fromCharCode((n>>16)&255);if(c3>=0&&s.charAt(i-2)!="=")out+=String.fromCharCode((n>>8)&255);if(c4>=0&&s.charAt(i-1)!="=")out+=String.fromCharCode(n&255);}return out;
}
function extractJsonMedia(text,label){
    var out=[], re=/(?:"|')?(?:file|url|src|source|hls|mp4|m3u8)(?:"|')?\s*[:=]\s*(?:"|')([^"']+)(?:"|')/gi,m,s;
    while((m=re.exec(String(text||"")))!=null){s=directMedia(clean(m[1]),label);if(s)addSource(out,s,label);}
    return out;
}
function extractorVoe(url,label){
    var h=httpGet(url,"https://voe.sx"),m,re=/['\"](hls|mp4)['\"]\s*:\s*['\"]([^'\"]+)['\"]/gi,out=[];
    while((m=re.exec(h||""))!=null){var s=directMedia(m[2],label||("VMinds "+m[1]));if(s)addSource(out,s,label||"VMinds");}
    return out;
}
function extractorUqload(url,label){
    var u=String(url||"");if(u.indexOf(".html")<0)u+=".html";var h=httpGet(u,"https://uqload.com"),m=/sources\s*:\s*\[([^\]]+)\]/i.exec(h||""),out=[],parts,i,s;
    if(!m)return out;parts=m[1].replace(/\\"/g,'').replace(/"/g,'').split(',');for(i=0;i<parts.length;i++){s=directMedia(clean(parts[i]),label||("Uqload "+(i+1)));if(s)addSource(out,s,label||"Uqload");}return out;
}
function extractorStreamTape(url,label){
    var h=httpGet(url,"https://streamtape.com"),m=/robotlink'\)\.innerHTML\s*=\s*'(.+?)'\+\s*\('(.+?)'\)/i.exec(h||"");if(!m)return[];
    var u="https:"+m[1]+m[2].substring(3),s=directMedia(u,label||"CreativeWave");return s?[s]:[];
}
function extractorDood(url,label){
    var host=hostOf(url)||"dood.wf",id=(String(url).split("/e/")[1]||"").split(/[?#]/)[0];if(!id)return[];var base="https://"+host,h=httpGet(base+"/e/"+id,base),m=/\/pass_md5\/[^']*/g.exec(h||"");if(!m)return[];
    var pass=base+m[0],r,body;try{r=http.GET(pass,{"User-Agent":UA,"Referer":base+"/"});}catch(e){return[];}body=readBody(r);if(!body)return[];
    var token=(m[0].split("/").pop()||""),u=body+"zUEJeL3mUN?token="+token,s=directMedia(u,label||"DoodStream");return s?[s]:[];
}
function extractorPlusVip(url,label){
    var h=httpGet(url,"https://plusvip.net"),m=/['\"]\/sources\/([^'\"]+)/i.exec(h||"");if(!m)return[];var linkPart=(String(url).split("?data=")[1]||""),body="link="+encodeURIComponent(linkPart),out=[];
    try{var r=http.POST("https://plusvip.net/sources/"+m[1],body,{"User-Agent":UA,"Referer":url,"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},false),b=readBody(r),x=/\{link:\s*([^}]+)\}/i.exec(b||"");if(x){var s=directMedia(x[1].replace(/\\/g,""),label||"Cinematrix");if(s)addSource(out,s,label||"Cinematrix");}}catch(e){log("PlusVip POST "+String(e));}return out;
}
function extractorResolo(url,label){var h=httpGet(url,"https://re.sololatino.net"),m=/file\s*:\s*['\"]([^'\"]+)['\"]/i.exec(h||""),s=m?directMedia(m[1],label||"tIllumaries"):null;return s?[s]:[];}
function extractorEsplay(url,label){var id=(String(url).split("#")[1]||"");if(!id)return[];try{var r=http.GET("https://pelisplus.esplay.one/video/"+id,{"User-Agent":UA,"Referer":"https://pelisplus.esplay.io/"}),b=readBody(r),d=JSON.parse(b),s=d&&d.file?directMedia(d.file,label||"EchoVision"):null;return s?[s]:[];}catch(e){return[];}}
function extractorFastream(url,label){
    var n=String(url).indexOf("embed-")>=0?(String(url).split("embed-").pop()||"").replace(".html",""):(String(url).split("html?").pop()||"");if(!n)return[];
    try{var r=http.POST("https://fastream.to/dl","op=embed&file_code="+encodeURIComponent(n)+"&auto=1&referer=",{"User-Agent":UA,"Origin":"https://fastream.to","Referer":"https://fastream.to/emb.html?"+n,"Content-Type":"application/x-www-form-urlencoded"},false),h=readBody(r),out=extractJsonMedia(h,label||"sFTekh");if(out.length)return out;addDirectFromText(out,h,label||"sFTekh");return out;}catch(e){return[];}
}
function extractorDirectPage(url,label){
    var h=httpGet(url,baseFor(url)),out=[];if(!h)return out;addDirectFromText(out,h,label);var j=extractJsonMedia(h,label);var i;for(i=0;i<j.length;i++)addSource(out,j[i],label);return out;
}
function extractorMyCdn(url,depth,label){
    if(depth>2)return[];var out=[],h=httpGet(url,baseFor(url));if(!h)return out;addDirectFromText(out,h,label||"MyCDN");var re=/go_to_player\(['\"]([^'\"]+)/gi,m;
    while((m=re.exec(h))!=null&&out.length<MAX_SOURCES){var p=m[1];if(p.indexOf("http")!==0)p="https://api.mycdn.moe/player/?id="+p;var ph=httpGet(p,"https://api.mycdn.moe");addDirectFromText(out,ph,label||"MyCDN");var got=extractJsonMedia(ph,label||"MyCDN"),i;for(i=0;i<got.length;i++)addSource(out,got[i],label||"MyCDN");var ir=/iframe[^>]+src=['\"]([^'\"]+)/i.exec(ph||"");if(ir){var more=extractServerUrl(absUrl(ir[1],"https://api.mycdn.moe"),depth+1,label||"MyCDN"),j;for(j=0;j<more.length;j++)addSource(out,more[j],label||"MyCDN");}}
    return out;
}
function extractorStreamSB(url,label){
    var id=(String(url).split("/").pop()||"").replace(/\.html.*$/i,"").replace(/^embed-/i,"");if(!id)return[];
    var p="https://lvturbo.com/e/"+id,h=httpGet(p,"https://lvturbo.com"),out=[];addDirectFromText(out,h,label||"StrmWorks");
    if(out.length)return out;
    var m=/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i.exec(h||"");if(m){var s=directMedia(m[0],label||"StrmWorks");if(s)addSource(out,s,label||"StrmWorks");}
    return out;
}
function extractorZplayer(url,label){var h=httpGet(url,baseFor(url)),out=[];if(!h)return out;addDirectFromText(out,h,label||"MorphMdia");return out;}
function extractorGeneric(url,label,depth){
    if(depth>2)return[];var h=httpGet(url,baseFor(url)),out=[],i,m,links=[];if(!h)return out;
    addDirectFromText(out,h,label);var jm=extractJsonMedia(h,label);for(i=0;i<jm.length;i++)addSource(out,jm[i],label);if(out.length)return out;
    var ifr=/<iframe\b[^>]*(?:src|data-src)=["']([^"']+)/gi;while((m=ifr.exec(h))!=null&&links.length<MAX_CRAWL)links.push(absUrl(m[1],baseFor(url)));
    var ds=/data-(?:server|video|link)=["']([^"']+)/gi;while((m=ds.exec(h))!=null&&links.length<MAX_CRAWL){var x=m[1],bd=b64decode(x.split("?v=")[1]||x);links.push(bd&&/^https?:\/\//i.test(bd)?bd:absUrl(x,baseFor(url)));}
    for(i=0;i<links.length&&out.length<MAX_SOURCES;i++){var more=extractServerUrl(links[i],depth+1,label),j;for(j=0;j<more.length;j++)addSource(out,more[j],label);}
    return out;
}
function extractServerUrl(url,depth,label){
    if(depth>2)return[];var u=clean(url),h=hostOf(u),s=[];
    var direct=directMedia(u,label||"Direct");if(direct)return[direct];
    if(h.indexOf("voe.")>=0)return extractorVoe(u,label||"VMinds");
    if(h.indexOf("uqload.")>=0)return extractorUqload(u,label||"PlRealm");
    if(h.indexOf("streamtape.")>=0)return extractorStreamTape(u,label||"CreativeWave");
    if(h.indexOf("dood.")>=0)return extractorDood(u,label||"DgSpectrum");
    if(h.indexOf("plusvip.")>=0)return extractorPlusVip(u,label||"Cinematrix");
    if(h.indexOf("re.sololatino.")>=0)return extractorResolo(u,label||"tIllumaries");
    if(h.indexOf("pelisplus.esplay")>=0)return extractorEsplay(u,label||"EchoVision");
    if(h.indexOf("fastream.")>=0)return extractorFastream(u,label||"sFTekh");
    if(h.indexOf("api.mycdn.moe")>=0)return extractorMyCdn(u,depth,label||"MyCDN");
    if(h.indexOf("watchsb.")>=0||h.indexOf("sbplay")>=0||h.indexOf("sbfast")>=0||h.indexOf("sbanh")>=0||h.indexOf("sbembed")>=0||h.indexOf("lvturbo")>=0)return extractorStreamSB(u,label||"StrmWorks");
    if(h.indexOf("zplayer")>=0)return extractorZplayer(u,label||"MorphMdia");
    return extractorGeneric(u,label||h,depth);
}
function pelisAjax(url,isEpisode){var p=providerFor(url);if(!p||p.name!="Pelisplushd")return[];var s=String(url).split("?")[0].replace(/\/+$/," ").trim().split("/"),id=s[s.length-1].split("-").pop(),path=isEpisode?"/ajax/v2/episode/servers/":"/ajax/movie/episodes/",h=httpGet(p.base+path+id,p.base);if(!h)return[];var out=[],re=/<a\b[^>]*>/gi,m;while((m=re.exec(h))!=null&&out.length<MAX_SOURCES){var did=attr(m[0],"data-id")||attr(m[0],"data-linkid");if(!did)continue;var watch=(isEpisode?url.replace("/episode/","/watch-tv/"):url.replace("/movie/","/watch-movie/"))+"."+did;out.push({url:watch,label:clean(strip(m[0]))||"PelisPlus"});}return out;}
function parseNextData(h){var m=/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(h||"");if(!m)return null;try{return JSON.parse(m[1]);}catch(e){return null;}}
function cuevana2Candidates(h){var out=[],d=parseNextData(h),p=d&&d.props&&d.props.pageProps,players=p&&(p.episode&&p.episode.players||p.post&&p.post.players),k,x,i,j; if(!players)return out;for(k in players){x=players[k];if(!x||!x.length)continue;for(i=0;i<x.length;i++){j=x[i];if(j&&j.result)out.push({url:j.result,label:clean(String(j.cyberlocker||"server"))+" "+clean(String(j.quality||""))});}}return out;}
function cuevana3Candidates(h,base){var out=[],re=/<(?:li|div)[^>]+(?:class=["'][^"']*option[^"']*["'][^>]+)?data-link=["']([^"']+)["'][^>]*>/gi,m;while((m=re.exec(h||""))!=null)out.push({url:absUrl(m[1],base),label:"Cuevana3"});var r=/data-server=["']([^"']+)["']/gi;while((m=r.exec(h||""))!=null){var d=b64decode(m[1]);if(d&&/^https?:\/\//i.test(d))out.push({url:d,label:"Cuevana3"});}return out;}
function providerPageSources(url,kind){
    var candidates=[],p=providerFor(url),i,h,m,seen={};
    function addCandidate(x,label){var u=typeof x=="string"?x:x&&x.url;label=label||(x&&x.label)||"Server";u=clean(u);if(!u||!/^https?:\/\//i.test(u)||seen[u]||candidates.length>=MAX_SERVER_CANDIDATES)return;seen[u]=1;candidates.push({url:u,label:label});}
    if(p&&p.name=="Pelisplushd"){var pa=pelisAjax(url,kind=="episode");for(i=0;i<pa.length;i++)addCandidate(pa[i]);}
    h=httpGet(url,p?p.base:baseFor(url));
    if(h){
        var direct=/https?:\/\/[^\s"'<>\\]+/gi;while((m=direct.exec(h))!=null&&candidates.length<MAX_SERVER_CANDIDATES)if(/\.m3u8(?:\?|$)|\.mp4(?:\?|$)/i.test(m[0]))addCandidate(m[0],"Direct");
        if(p&&p.name=="Cuevana2"){var c2=cuevana2Candidates(h);for(i=0;i<c2.length;i++)addCandidate(c2[i]);}
        if(p&&p.name.indexOf("Cuevana3")==0){var c3=cuevana3Candidates(h,p.base);for(i=0;i<c3.length;i++)addCandidate(c3[i]);}
        var ifr=/iframe[^>]+(?:src|data-src)=["']([^"']+)/gi;while((m=ifr.exec(h))!=null&&candidates.length<MAX_SERVER_CANDIDATES)addCandidate(absUrl(m[1],p?p.base:baseFor(url)),"Iframe");
        var dat=/data-video=["']([^"']+)/gi;while((m=dat.exec(h))!=null&&candidates.length<MAX_SERVER_CANDIDATES)addCandidate(absUrl(m[1],p?p.base:baseFor(url)),"Video");
        var ds=/data-server=["']([^"']+)/gi;while((m=ds.exec(h))!=null&&candidates.length<MAX_SERVER_CANDIDATES){var raw=m[1].split("?v=")[1]||m[1],dd=b64decode(raw);if(dd)addCandidate(dd,"Server");}
        var oc=/onclick=["'][^"']*go_to_player\(['"]([^'"]+)/gi;while((m=oc.exec(h))!=null&&candidates.length<MAX_SERVER_CANDIDATES)addCandidate(m[1].indexOf("http")==0?m[1]:"https://api.mycdn.moe/player/?id="+m[1],"MyCDN");
    }
    addCandidate(url,p?p.name:hostOf(url));
    var sources=[],seenS={};
    for(i=0;i<candidates.length&&sources.length<MAX_SOURCES;i++){
        var got=extractServerUrl(candidates[i].url,0,candidates[i].label),j;
        for(j=0;j<got.length&&sources.length<MAX_SOURCES;j++){var key=String(got[j].url||"");if(key&&!seenS[key]){seenS[key]=1;sources.push(got[j]);}}
        log("RESOLVE "+candidates[i].label+" -> "+got.length);
    }
    log("SOURCE candidates="+candidates.length+" resolved="+sources.length);
    return sources;
}
function genericDetail(url){var p=providerFor(url),b=baseFor(url),h=httpGet(url,b);if(!h)return null;var title=firstTag(h,"h1")||textIn(h,"entry-title")||textIn(h,"heading-name")||textIn(h,"title"),poster=firstImg(h,b),syn=textIn(h,"description")||textIn(h,"sinopsis")||textIn(h,"overview");if(!title){var og=/property=["']og:title["'][^>]*content=["']([^"']+)/i.exec(h);if(og)title=clean(og[1]);}if(!poster){var om=/property=["']og:image["'][^>]*content=["']([^"']+)/i.exec(h);if(om)poster=absUrl(om[1],b);}return{title:clean(title),poster:poster,synopsis:clean(syn),provider:p?p.name:hostOf(url),sources:providerPageSources(url,typeFor(url))};}
function tmdbDetails(kind,id){var d=tmdbGet("/"+(kind=="tvshow"?"tv":"movie")+"/"+id);if(!d)return null;return{title:d.title||d.name,poster:tmdbPoster(d.poster_path),synopsis:d.overview||"",year:String(d.release_date||d.first_air_date||"").substring(0,4),kind:kind};}
function findProviderMatch(title,kind){
    var q=normalizeTitle(title),best=null,score=-1,i,j,r,t,s;
    var order=["Cuevana3Me","Cuevana3","Cuevana3CC","PeliSmart","SmartPelis","Bflix","Gnula","Cuevana2","EntrePeliculas"];
    for(i=0;i<order.length;i++){
        for(j=0;j<PROVIDERS.length;j++)if(PROVIDERS[j].name==order[i]){r=parseProviderSearch(PROVIDERS[j],title);for(var k=0;k<r.length;k++){t=normalizeTitle(r[k].title);if(!t)continue;s=(t==q?120:((t.indexOf(q)>=0||q.indexOf(t)>=0)?75:0));if(kind==r[k].type)s+=10;if(s>score){score=s;best=r[k];}}if(score>=130)return best;break;}
    }
    if(!best){
        for(i=0;i<PROVIDERS.length;i++){r=parseProviderSearch(PROVIDERS[i],title);for(j=0;j<r.length;j++){t=normalizeTitle(r[j].title);s=(t==q?120:((t.indexOf(q)>=0||q.indexOf(t)>=0)?70:0));if(kind==r[j].type)s+=10;if(s>score){score=s;best=r[j];}}if(score>=130)break;}
    }
    if(best)log("MATCH "+title+" -> "+best.provider+" / "+best.title+" score="+score);else log("NO PROVIDER MATCH for "+title);
    return best;
}
function search(query){
    resetDebug();
    var t=tmdbList("/search/multi?query="+enc(query)+"&page=1&include_adult=false");
    var r=[],i;
    for(i=0;i<t.length;i++)r.push(catalogVideo("tmdb_"+i,t[i].title,t[i].poster,t[i].url));
    if(!r.length) log("TMDB SEARCH returned 0 results");
    return r;
}
function home(){
    resetDebug();
    var t=tmdbList("/trending/all/day");
    var r=[],i;
    for(i=0;i<t.length;i++)r.push(catalogVideo("tmdbhome_"+i,t[i].title,t[i].poster,t[i].url));
    if(!r.length) log("TMDB HOME returned 0 results");
    return r;
}
function details(url){var p=parseInternal(url);if(!p)return null;if(p.mode=="tmdb"){var td=tmdbDetails(p.kind,p.id);if(!td)return null;var m=findProviderMatch(td.title,p.kind);if(m){var gd=genericDetail(m.url);if(gd&&gd.sources.length)return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"tmdb_"+p.id,PID),name:gd.title||td.title,thumbnails:thumb(gd.poster||td.poster),author:author(),uploadDate:0,viewCount:0,isLive:false,url:makeWeb(p.kind,m.url),video:new VideoSourceDescriptor(gd.sources),description:td.synopsis+"\n\nProveedor: "+gd.provider+"\nFuentes: "+gd.sources.length+"\n\n=== DEBUG ===\n"+_debug});}return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"tmdb_"+p.id,PID),name:td.title,thumbnails:thumb(td.poster),author:author(),uploadDate:0,viewCount:0,isLive:false,url:url,video:new VideoSourceDescriptor([]),description:td.synopsis+"\n\nNo se encontró una fuente reproducible.\n\n=== DEBUG ===\n"+_debug});}
    var d=genericDetail(p.url);if(!d)return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"err_"+enc(p.url),PID),name:"PlayPelis: sin respuesta",thumbnails:new Thumbnails([]),author:author(),uploadDate:0,viewCount:0,isLive:false,url:p.url,video:new VideoSourceDescriptor([]),description:"El proveedor no devolvió HTML.\n\n=== DEBUG ===\n"+_debug});return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"web_"+enc(p.url),PID),name:d.title||"Sin título",thumbnails:thumb(d.poster),author:author(),uploadDate:0,viewCount:0,isLive:false,url:p.url,video:new VideoSourceDescriptor(d.sources),description:(d.synopsis||"")+"\n\nCatálogo/proveedor: "+d.provider+"\nFuentes descubiertas: "+d.sources.length+"\n\n=== DEBUG ===\n"+_debug});
}
if(typeof source!="undefined"){
 source.setSettings=function(s){_settings=s||{};};
 source.enable=function(c,s){_settings=s||{};};
 source.getSearchCapabilities=function(){return{types:[2],sorts:[],filters:[]};};
 source.search=function(q){try{return new VideoPager(search(q||""),false,null);}catch(e){return new VideoPager([],false,null);}};
 source.searchSuggestions=function(q){return[];};
 source.getHome=function(){try{return new VideoPager(home(),false,null);}catch(e){return new VideoPager([],false,null);}};
 source.isChannelUrl=function(){return false;};
 source.isContentDetailsUrl=function(u){return /^ppv12:\/\/(web|tmdb)\//.test(String(u||""));};
 source.isVideoDetailsUrl=function(u){return source.isContentDetailsUrl(u);};
 source.getVideoDetails=function(u){return source.getContentDetails(u);};
 source.getContentDetails=function(u){try{return details(u);}catch(e){log("DETAIL "+String(e));return new PlatformVideoDetails({id:new PlatformID(PLATFORM,"err",PID),name:"PlayPelis error",thumbnails:new Thumbnails([]),author:author(),uploadDate:0,viewCount:0,isLive:false,url:String(u||""),video:new VideoSourceDescriptor([]),description:String(e)+"\n\n"+_debug});}};
 source.getContentRecommendations=function(){return new VideoPager([],false,null);};
}
