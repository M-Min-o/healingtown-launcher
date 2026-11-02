/*
 * 힐링타운 런처 - 서버 정보 파일(distribution.json) 만들기
 *
 *   사용법:  (런처 폴더에서)  npm run distro
 *
 *   1) distro/config.json        서버 주소 · 마크 버전 · Fabric 버전 · 올릴 주소(baseUrl)
 *   2) distro/files/mods/required      꼭 깔리는 모드 (.jar)  예) Fabric API, Sodium
 *      distro/files/mods/optional-on   유저가 끌 수 있는 모드 (기본 켜짐)
 *      distro/files/mods/optional-off  유저가 켤 수 있는 모드 (기본 꺼짐)
 *      distro/files/config/...         게임 폴더에 그대로 복사될 파일 (예: config/sodium-options.json)
 *   3) distro/news.json          런처 '공지사항' 글 목록
 *
 *   → distro/out 폴더가 만들어짐. 이 폴더 안의 파일을 전부 baseUrl 주소(GitHub Pages 등)에 올리면 끝.
 *     유저 런처는 다음 실행 때 자동으로 새 모드 · 설정 · 공지를 받음 (런처를 다시 배포할 필요 없음)
 *
 *   Fabric 라이브러리는 Fabric 공식 저장소(maven.fabricmc.net)에서 바로 받게 해서 따로 올릴 필요 없음.
 *   필요 프로그램: Node.js 22 이상 (런처 빌드할 때 쓰는 것과 같음), 인터넷 연결
 */
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = __dirname
const OUT = path.join(ROOT, 'out')
const CACHE = path.join(ROOT, '.cache')

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')) }
function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex') }
function slug(s) { return s.toLowerCase().replace(/\.jar$/i, '').replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'mod' }
function url(base, rel) { return new URL(rel.split(path.sep).map(encodeURIComponent).join('/'), base).toString() }
function walk(dir) {
    if (!fs.existsSync(dir)) return []
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) out.push(...walk(p)); else out.push(p)
    }
    return out
}
function copy(src, rel) {
    const dst = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
}
async function get(u, asJson) {
    const res = await fetch(u)
    if (!res.ok) throw new Error(`${u} 받기 실패 (${res.status})`)
    return asJson ? res.json() : Buffer.from(await res.arrayBuffer())
}
/** 받아 둔 파일이 있으면 그것을, 없으면 받아서 저장 */
async function cached(u, name) {
    const p = path.join(CACHE, name)
    if (fs.existsSync(p)) return fs.readFileSync(p)
    const buf = await get(u)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, buf)
    return buf
}
function mavenPath(id) {
    // group:artifact:version[:classifier]  →  group/path/artifact/version/artifact-version[-classifier].jar
    const [g, a, v, c] = id.split(':')
    return `${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}${c ? '-' + c : ''}.jar`
}
function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

async function fabricModule(cfg) {
    const mc = cfg.server.minecraftVersion
    let loader = cfg.fabric.loader
    if (!loader || loader === 'latest') {
        const list = await get(`https://meta.fabricmc.net/v2/versions/loader/${mc}`, true)
        const stable = list.find(e => e.loader.stable) || list[0]
        loader = stable.loader.version
    }
    console.log(`  Fabric 로더 ${loader} (마크 ${mc})`)
    const profileBuf = await cached(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${loader}/profile/json`, `fabric/${mc}-${loader}.json`)
    const profile = JSON.parse(profileBuf.toString())

    const manifestId = `${mc}-fabric-${loader}`
    const manifestRel = `fabric/versions/${manifestId}/${manifestId}.json`
    fs.mkdirSync(path.dirname(path.join(OUT, manifestRel)), { recursive: true })
    fs.writeFileSync(path.join(OUT, manifestRel), profileBuf)

    const subs = [{
        id: manifestId,
        name: 'Fabric (version.json)',
        type: 'VersionManifest',
        artifact: { size: profileBuf.length, MD5: md5(profileBuf), url: url(cfg.baseUrl, manifestRel) }
    }]
    let loaderLib = null
    for (const lib of profile.libraries) {
        const rel = mavenPath(lib.name)
        const libUrl = new URL(rel, lib.url || 'https://maven.fabricmc.net/').toString()
        const buf = await cached(libUrl, 'lib/' + rel)
        const mod = { id: lib.name, name: `Fabric (${lib.name.split(':')[1]})`, type: 'Library', artifact: { size: buf.length, MD5: md5(buf), url: libUrl } }
        if (lib.name.startsWith('net.fabricmc:fabric-loader:')) loaderLib = mod
        else subs.push(mod)
    }
    if (!loaderLib) throw new Error('Fabric 로더 라이브러리를 찾지 못했습니다.')
    loaderLib.type = 'Fabric'
    loaderLib.name = `Fabric 로더 ${loader}`
    loaderLib.subModules = subs
    return loaderLib
}

function modModules(cfg) {
    const out = []
    const groups = [
        ['required', null],
        ['optional-on', { value: false, def: true }],
        ['optional-off', { value: false, def: false }]
    ]
    for (const [dir, required] of groups) {
        for (const f of walk(path.join(ROOT, 'files', 'mods', dir))) {
            if (!f.toLowerCase().endsWith('.jar')) continue
            const buf = fs.readFileSync(f)
            const hash = md5(buf)
            const name = path.basename(f)
            const rel = `mods/${name}`
            copy(f, rel)
            const m = {
                id: `kr.healingtown.mods:${slug(name)}:${hash.slice(0, 10)}`,     // 파일이 바뀌면 아이디도 바뀜 → 유저 쪽에서 새로 받음
                name: name.replace(/\.jar$/i, ''),
                type: 'FabricMod',
                artifact: { size: buf.length, MD5: hash, url: url(cfg.baseUrl, rel) }
            }
            if (required) m.required = required
            out.push(m)
            console.log(`  모드: ${name}${required ? (required.def ? ' (선택, 기본 켜짐)' : ' (선택, 기본 꺼짐)') : ''}`)
        }
    }
    return out
}

function fileModules(cfg) {
    const out = []
    const base = path.join(ROOT, 'files')
    for (const f of walk(base)) {
        const rel = path.relative(base, f)
        if (rel.split(path.sep)[0] === 'mods') continue
        const buf = fs.readFileSync(f)
        const relUrl = 'files/' + rel.split(path.sep).join('/')
        copy(f, relUrl)
        out.push({
            id: `kr.healingtown.files:${slug(rel.split(path.sep).join('-'))}:${md5(buf).slice(0, 10)}`,
            name: rel.split(path.sep).join('/'),
            type: 'File',
            artifact: { size: buf.length, MD5: md5(buf), url: url(cfg.baseUrl, relUrl), path: rel.split(path.sep).join('/') }
        })
        console.log(`  파일: ${rel.split(path.sep).join('/')}`)
    }
    return out
}

function newsRss(cfg) {
    const p = path.join(ROOT, 'news.json')
    if (!fs.existsSync(p)) return null
    const news = readJson(p)
    const items = news.map(n => {
        const body = (n.content || '').split('\n').map(l => l.trim() === '' ? '<br>' : `<p>${escXml(l)}</p>`).join('')
        return `    <item>
      <title>${escXml(n.title)}</title>
      <link>${escXml(n.link || cfg.baseUrl)}</link>
      <pubDate>${new Date(n.date).toUTCString()}</pubDate>
      <dc:creator>${escXml(n.author || cfg.server.name)}</dc:creator>
      <content:encoded><![CDATA[${n.html || body}]]></content:encoded>
    </item>`
    }).join('\n')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escXml(cfg.server.name)} 공지사항</title>
    <link>${escXml(cfg.baseUrl)}</link>
    <description>${escXml(cfg.server.name)}</description>
${items}
  </channel>
</rss>
`
    fs.writeFileSync(path.join(OUT, 'news.xml'), xml)
    console.log(`  공지사항 ${news.length}개 → news.xml`)
    return url(cfg.baseUrl, 'news.xml')
}

async function main() {
    const cfg = readJson(path.join(ROOT, 'config.json'))
    if (!cfg.baseUrl.endsWith('/')) cfg.baseUrl += '/'
    fs.rmSync(OUT, { recursive: true, force: true })
    fs.mkdirSync(OUT, { recursive: true })
    console.log('서버 정보 파일을 만드는 중..')

    let icon = cfg.server.icon || ''
    if (icon && !/^https?:/.test(icon)) {
        const src = path.join(ROOT, icon)
        if (fs.existsSync(src)) { copy(src, path.basename(icon)); icon = url(cfg.baseUrl, path.basename(icon)) }
    }

    const modules = []
    if (cfg.fabric && cfg.fabric.enabled !== false) modules.push(await fabricModule(cfg))
    modules.push(...modModules(cfg))
    modules.push(...fileModules(cfg))
    const rss = newsRss(cfg)

    const server = {
        id: cfg.server.id,
        name: cfg.server.name,
        description: cfg.server.description || '',
        icon,
        version: cfg.server.version,
        address: cfg.server.address,
        minecraftVersion: cfg.server.minecraftVersion,
        javaOptions: cfg.java || { suggestedMajor: 21 },
        mainServer: true,
        autoconnect: cfg.server.autoconnect !== false,
        modules
    }
    const dist = { version: '1.0.0', rss: rss || cfg.rss || '', servers: [server] }
    if (cfg.discord && cfg.discord.clientId) dist.discord = cfg.discord
    fs.writeFileSync(path.join(OUT, 'distribution.json'), JSON.stringify(dist, null, 2))
    console.log(`완료! → ${path.join(OUT, 'distribution.json')}`)
    console.log(`out 폴더의 내용을 전부 ${cfg.baseUrl} 에 올리세요.`)
    console.log('※ 모드를 바꿨으면 config.json 의 server.version 도 올려 주세요 (예: 1.0.0 → 1.0.1).')
}

main().catch(e => { console.error('오류:', e.message); process.exit(1) })
