/**
 * 힐링타운 런처 배경 - 2D 도트 마을
 *  집(안이 보이는 단면) · 침대 · 작은 밀밭 · 물방울 해파리 · 슈크림 고양이
 *  - 둘이 왔다갔다 돌아다니고, 가끔 낮잠, 밤이 되면 집 침대에서 잠
 *  - 시간이 흐름: 런처를 켠 시각(실제 시각)에서 시작해서 하루 = DAY_MINUTES 분
 *  - 밀은 시간이 지나며 자라고 다 익으면 다시 심어짐
 */
(function () {
    'use strict'

    const W = 320, H = 180          // 도트 해상도 (화면에 맞춰 확대)
    const GY = 128                  // 땅 높이
    const DAY_MINUTES = 8           // 게임 하루 길이 (분)
    const FPS = 30
    const CS = 3                    // 캔버스 배율 (배경 한 칸 = 3px)
    const SP = 2                    // "Z" 글자 도트 크기

    // ------------------------------------------------------------ 위치
    const HOUSE = { x0: 40, x1: 130, top: 84 }          // 벽 기둥 바깥쪽 기준
    const BED = { x: 48, w: 36 }                        // 침대 (왼쪽 = 베개)
    const LANTERN = { x: 92, y: 97 }
    const FARM = { x0: 160, n: 11, water: 5 }           // 8px 칸 n개, water 번째 칸은 물
    const WALK = { min: 50, max: 304 }

    let cv, ctx, nv, nctx, groundCv
    let last = 0, acc = 0
    const startReal = Date.now()
    const now0 = new Date()
    const tod0 = (now0.getHours() * 3600 + now0.getMinutes() * 60 + now0.getSeconds()) / 86400

    // ------------------------------------------------------------ 유틸
    const rnd = (a, b) => a + Math.random() * (b - a)
    const lerp = (a, b, t) => a + (b - a) * t
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
    function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
    function mix(c1, c2, t) { return [0, 1, 2].map(i => Math.round(lerp(c1[i], c2[i], t))) }
    const rgb = (c, a) => a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`
    function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 } }

    function R(c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) }

    // ------------------------------------------------------------ 시간 · 하늘
    function gameDays() { return tod0 + (Date.now() - startReal) / (DAY_MINUTES * 60000) }
    // tod: 0 = 자정, 0.25 = 아침 6시, 0.5 = 정오, 0.75 = 저녁 6시
    const SKY = [
        [0.00, '#0b1030', '#1b2552', 1],
        [0.20, '#0b1030', '#1b2552', 1],
        [0.25, '#3d4f93', '#f2a684', 0.45],
        [0.31, '#5aa2ea', '#b4e0fa', 0],
        [0.69, '#5aa2ea', '#b4e0fa', 0],
        [0.75, '#4b3d82', '#f28a62', 0.45],
        [0.81, '#0b1030', '#1b2552', 1],
        [1.00, '#0b1030', '#1b2552', 1],
    ]
    function skyAt(tod) {
        for (let i = 0; i < SKY.length - 1; i++) {
            const a = SKY[i], b = SKY[i + 1]
            if (tod >= a[0] && tod <= b[0]) {
                const t = (tod - a[0]) / (b[0] - a[0] || 1)
                return { top: mix(hex(a[1]), hex(b[1]), t), bot: mix(hex(a[2]), hex(b[2]), t), night: lerp(a[3], b[3], t) }
            }
        }
        return { top: hex('#0b1030'), bot: hex('#1b2552'), night: 1 }
    }

    // ------------------------------------------------------------ 정적인 것 (별 · 언덕 · 땅) 미리 만들기
    const r0 = seeded(7)
    const STARS = Array.from({ length: 55 }, () => ({ x: Math.floor(r0() * W), y: Math.floor(r0() * 95), p: r0() * 6.28, big: r0() < 0.15 }))
    const CLOUDS = Array.from({ length: 5 }, (_, i) => ({ x: i * 70 + r0() * 30, y: 10 + r0() * 38, w: 18 + Math.floor(r0() * 22), s: 2 + r0() * 2.5 }))
    const HILL_FAR = [], HILL_NEAR = []
    {
        let h = 30
        for (let x = 0; x < W; x += 6) { h = clamp(h + Math.floor(r0() * 9) - 4, 18, 44); HILL_FAR.push([x, h]) }
        h = 14
        for (let x = 0; x < W; x += 8) { h = clamp(h + Math.floor(r0() * 7) - 3, 6, 22); HILL_NEAR.push([x, h]) }
    }
    const TREES = [[14, 0], [146, 1], [292, 0], [262, 1]]   // [x, 종류] 뒤쪽 나무
    const FLOWERS = [[258, '#f5d33a'], [270, '#e8463c'], [279, '#f5d33a'], [298, '#c86cf0'], [310, '#e8463c'], [26, '#f5d33a']]

    function buildGround() {
        groundCv = document.createElement('canvas'); groundCv.width = W; groundCv.height = H - GY
        const g = groundCv.getContext('2d'), rr = seeded(42)
        const grass = ['#5cb847', '#4fa63d', '#69c653'], dirt = ['#8a5a32', '#7a4e2a', '#96653a', '#6d4424']
        for (let x = 0; x < W; x++) {
            for (let y = 0; y < H - GY; y++) {
                let c
                const lip = 3 + ((x * 7 + Math.floor(x / 8) * 3) % 3 === 0 ? 1 : 0)   // 마크 잔디 블록처럼 삐죽
                if (y < lip) c = grass[Math.floor(rr() * 3)]
                else c = dirt[Math.floor(rr() * 4)]
                if (y >= lip && (y - lip) % 8 === 7) c = '#5e3a1e'
                g.fillStyle = c; g.fillRect(x, y, 1, 1)
            }
            if (x % 16 === 15) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 4, 1, H - GY) }
        }
    }

    // ------------------------------------------------------------ 배경 그리기
    function drawSky(s, t, days) {
        const gr = ctx.createLinearGradient(0, 0, 0, GY)
        gr.addColorStop(0, rgb(s.top)); gr.addColorStop(1, rgb(s.bot))
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, GY)
        // 별
        if (s.night > 0.05) for (const st of STARS) {
            const a = s.night * (0.55 + 0.45 * Math.sin(t * 1.7 + st.p))
            R(`rgba(255,250,220,${a.toFixed(2)})`, st.x, st.y, 1, 1)
            if (st.big) { R(`rgba(255,250,220,${(a * 0.5).toFixed(2)})`, st.x - 1, st.y, 3, 1); R(`rgba(255,250,220,${(a * 0.5).toFixed(2)})`, st.x, st.y - 1, 1, 3) }
        }
        // 해 · 달 (네모)
        const tod = days % 1, ang = (tod - 0.25) * Math.PI * 2
        const sx = W / 2 - Math.cos(ang) * 140, sy = 112 - Math.sin(ang) * 95
        if (sy < GY + 6) { R('#fff3a8', sx - 7, sy - 7, 14, 14); R('#ffd84a', sx - 5, sy - 5, 10, 10); R('#fff8d0', sx - 3, sy - 3, 4, 4) }
        const mx = W / 2 + Math.cos(ang) * 140, my = 112 + Math.sin(ang) * 95
        if (my < GY + 6) { R('#e8ecf8', mx - 5, my - 5, 10, 10); R('#c4cae0', mx - 2, my - 3, 3, 3); R('#c4cae0', mx + 1, my + 1, 2, 2) }
        // 구름
        const cc = mix(hex('#ffffff'), hex('#3a4570'), s.night)
        for (const c of CLOUDS) {
            const x = ((c.x + t * c.s) % (W + 60)) - 50
            R(rgb(cc, 0.92), x, c.y, c.w, 5); R(rgb(cc, 0.92), x + 4, c.y - 3, c.w - 10, 3); R(rgb(cc, 0.92), x + 8, c.y - 5, Math.max(4, c.w - 20), 2)
            R(rgb(mix(cc, hex('#9aaccc'), 0.35), 0.9), x, c.y + 4, c.w, 1)
        }
    }

    function drawHills(s) {
        const far = mix(hex('#7fb4d8'), hex('#1a2448'), s.night), near = mix(hex('#4f9a54'), hex('#16301e'), s.night)
        for (const [x, h] of HILL_FAR) R(rgb(far), x, GY - h, 6, h)
        // 뒤쪽 나무 (참나무 · 자작나무)
        for (const [x, k] of TREES) {
            const trunk = k ? mix(hex('#e8e4d8'), hex('#3a3a44'), s.night) : mix(hex('#6b4a2a'), hex('#1e1610'), s.night)
            const leaf = k ? mix(hex('#7cb342'), hex('#1c3018'), s.night) : mix(hex('#3f8f3a'), hex('#12281a'), s.night)
            const leaf2 = mix(leaf, [0, 0, 0], 0.18)
            R(rgb(trunk), x - 1, GY - 22, 3, 22)
            if (k) { R(rgb(mix(trunk, [0, 0, 0], 0.5)), x - 1, GY - 16, 1, 1); R(rgb(mix(trunk, [0, 0, 0], 0.5)), x + 1, GY - 9, 1, 1) }
            R(rgb(leaf2), x - 8, GY - 34, 17, 12); R(rgb(leaf), x - 7, GY - 35, 15, 11); R(rgb(leaf), x - 4, GY - 39, 9, 4)
            R(rgb(leaf2), x - 5, GY - 30, 2, 2); R(rgb(leaf2), x + 3, GY - 33, 2, 2)
        }
        for (const [x, h] of HILL_NEAR) R(rgb(near), x, GY - h, 8, h)
    }

    function plank(x, y, w, h, c1, c2, seam) {
        R(c1, x, y, w, h)
        for (let yy = y; yy < y + h; yy += 4) {
            R(c2, x, yy + 3, w, 1)
            const off = ((yy / 4) % 2) ? 0 : 8
            for (let xx = x + off; xx < x + w; xx += 16) R(seam || c2, xx, yy, 1, 3)
        }
    }

    function drawHouse(s, t) {
        const { x0, x1, top } = HOUSE
        // 지붕 (계단식)
        const roofA = '#9c3b2c', roofB = '#7a2a20', roofC = '#c4523e'
        for (let i = 0; i < 7; i++) {
            const y = top - 4 - i * 4, l = x0 - 7 + i * 7, r = x1 + 7 - i * 7
            if (r - l < 6) break
            R(roofB, l, y, r - l, 4); R(roofA, l, y, r - l, 3); R(roofC, l, y, r - l, 1)
        }
        // 굴뚝
        R('#6e6e78', 108, top - 26, 8, 14); R('#8a8a96', 108, top - 26, 8, 2); R('#55555e', 113, top - 24, 2, 12)
        // 안쪽 벽 (판자)
        plank(x0 + 5, top + 4, x1 - x0 - 10, GY - top - 4, '#7d5530', '#674526', '#5a3b20')
        // 창문 (바깥 하늘이 보임)
        for (const wx of [56, 104]) {
            const g = ctx.createLinearGradient(0, 94, 0, 108)
            g.addColorStop(0, rgb(s.top)); g.addColorStop(1, rgb(s.bot))
            R('#4a2e16', wx - 1, 93, 16, 16)
            ctx.fillStyle = g; ctx.fillRect(wx, 94, 14, 14)
            R('rgba(255,255,255,0.35)', wx + 2, 96, 1, 4); R('rgba(255,255,255,0.35)', wx + 3, 95, 1, 1)
            R('#4a2e16', wx + 6, 94, 2, 14); R('#4a2e16', wx, 100, 14, 2)
            R('#5a3b20', wx - 2, 108, 18, 2)        // 창틀
        }
        // 들보 · 기둥 (참나무 원목)
        R('#5a3c22', x0, top, x1 - x0, 5); R('#6f4b2b', x0, top + 1, x1 - x0, 2)
        const log = (x, y, h) => { R('#4e341d', x, y, 5, h); R('#6b4a2a', x + 1, y, 3, h); for (let yy = y + 2; yy < y + h; yy += 5) R('#4e341d', x + 2, yy, 1, 2) }
        log(x0, top, GY - top)
        log(x1 - 5, top, GY - top - 24)               // 오른쪽 = 문
        // 열린 문
        R('#4e341d', x1 - 2, GY - 24, 3, 24); R('#8a6236', x1 - 1, GY - 23, 2, 22); R('#c9a24a', x1, GY - 12, 1, 1)
        // 바닥
        R('#9a6a3a', x0 + 5, GY - 1, x1 - x0 - 5, 1)
        // 침대 (빨간 침대 · 흰 베개)
        const bx = BED.x, bw = BED.w
        R('#5a3b20', bx, GY - 3, 2, 3); R('#5a3b20', bx + bw - 2, GY - 3, 2, 3)
        R('#8a6236', bx, GY - 5, bw, 2)
        R('#eeeeee', bx, GY - 8, 8, 3); R('#cfcfcf', bx, GY - 6, 8, 1)
        R('#b8312f', bx + 8, GY - 8, bw - 8, 3); R('#d84a3c', bx + 8, GY - 8, bw - 8, 1); R('#8e2422', bx + 8, GY - 6, bw - 8, 1)
        // 작업대 · 상자 · 화분
        R('#3a2614', 88, GY - 11, 10, 11); R('#a87a44', 89, GY - 10, 8, 2); R('#6b4a2a', 89, GY - 8, 8, 7); R('#a0a0a8', 90, GY - 7, 2, 3); R('#c08a50', 94, GY - 6, 2, 4)
        R('#3a2614', 101, GY - 9, 11, 9); R('#a5732f', 102, GY - 8, 9, 7); R('#7d5520', 102, GY - 5, 9, 1); R('#d9d9d9', 106, GY - 6, 2, 2)
        R('#8a4a2a', 115, GY - 4, 5, 4); R('#3f8f3a', 116, GY - 8, 1, 4); R('#e8463c', 115, GY - 10, 3, 2); R('#3f8f3a', 118, GY - 7, 1, 2)
        // 랜턴 (줄에 매달림)
        R('#3a3a40', LANTERN.x, top + 5, 1, 6)
        R('#2e2e34', LANTERN.x - 2, LANTERN.y - 6, 5, 7); R('#3a3a40', LANTERN.x - 1, LANTERN.y - 7, 3, 1)
        const flick = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3)
        R(`rgba(255,${Math.round(200 * flick)},90,1)`, LANTERN.x - 1, LANTERN.y - 5, 3, 4)
        // 안쪽 그늘
        R('rgba(10,6,20,0.10)', x0 + 5, top + 5, x1 - x0 - 10, GY - top - 5)
    }

    function drawSmoke(t, s) {
        for (let i = 0; i < 6; i++) {
            const p = ((t * 0.18 + i / 6) % 1)
            const x = 111 + Math.sin(p * 6 + i) * 3 + p * 10, y = HOUSE.top - 28 - p * 34
            const c = mix(hex('#e8e8ee'), hex('#4a5070'), s.night)
            R(rgb(c, (0.55 * (1 - p)).toFixed(2)), x, y, 3 + Math.floor(p * 3), 3 + Math.floor(p * 3))
        }
    }

    function drawFarm(t, days) {
        // 울타리 (뒤쪽)
        for (let x = FARM.x0 - 4; x <= FARM.x0 + FARM.n * 8 + 2; x += 8) { R('#5a3b20', x, GY - 10, 2, 10); R('#7a5530', x, GY - 10, 1, 9) }
        R('#6b4a2a', FARM.x0 - 4, GY - 8, FARM.n * 8 + 6, 1); R('#6b4a2a', FARM.x0 - 4, GY - 4, FARM.n * 8 + 6, 1)
        for (let i = 0; i < FARM.n; i++) {
            const x = FARM.x0 + i * 8
            if (i === FARM.water) {               // 물 칸
                R('#2a4fbf', x, GY, 8, 7)
                for (let k = 0; k < 8; k++) R(`rgba(140,190,255,${(0.35 + 0.35 * Math.sin(t * 2.5 + k)).toFixed(2)})`, x + k, GY + 1 + ((k + Math.floor(t * 3)) % 3), 1, 1)
                R('#5d84e8', x, GY, 8, 1)
                continue
            }
            // 경작지
            R('#4a2c14', x, GY + 1, 8, 7); R('#5e3a1c', x, GY + 1, 8, 1)
            for (let k = 0; k < 8; k += 2) R('#3a2210', x + k, GY + 3 + (k % 4 ? 1 : 0), 1, 1)
            // 밀: 날마다 자라고, 다 익으면 다시 심어짐
            const g = (days * 1.6 + i * 0.13) % 1.25
            const stage = Math.min(7, Math.floor(g * 8))
            const ripe = stage >= 7
            const h = 2 + Math.round(stage * 1.5)
            const sway = Math.round(Math.sin(t * 1.6 + i * 0.7) * (stage > 3 ? 1 : 0))
            const stem = ripe ? '#c9a23a' : (stage > 4 ? '#8fae3a' : '#5aa02c')
            const head = ripe ? '#e3c04e' : '#79b93a'
            for (const [dx, dh] of [[1, 0], [3, -1], [5, 0], [6, -2]]) {
                const hh = Math.max(1, h + dh)
                R(stem, x + dx, GY + 1 - hh, 1, hh)
                if (stage >= 4) { R(head, x + dx + sway, GY + 1 - hh - 2, 1, 3); if (ripe) R('#b88a20', x + dx + sway, GY - hh, 1, 1) }
            }
        }
    }

    function drawFlowers(t) {
        for (const [x, c] of FLOWERS) {
            const sw = Math.round(Math.sin(t * 1.3 + x) * 0.6)
            R('#3f8f3a', x, GY - 5, 1, 5); R('#3f8f3a', x - 1, GY - 2, 1, 1)
            R(c, x - 1 + sw, GY - 7, 3, 2); R('#ffe9a0', x + sw, GY - 7, 1, 1)
        }
    }

    // ------------------------------------------------------------ 친구들
    // 친구들 그림: app/assets/images/buddies/*.png (그림 한 칸 = 캔버스 1px, 배경보다 3배 촘촘)
    //  고양이: cat_stand(오른쪽 봄) · cat_walk1/2 · cat_left(왼쪽 봄) · cat_front · cat_sit · cat_loaf · cat_sleep
    //  해파리: jelly_1/2/3(둥실) · jelly_move(왼쪽으로 헤엄) · jelly_blink · jelly_happy · jelly_sleepy · jelly_sleep
    const BUDDY_IMGS = ['cat_stand', 'cat_walk1', 'cat_walk2', 'cat_left', 'cat_front', 'cat_sit', 'cat_loaf', 'cat_sleep',
        'jelly_1', 'jelly_2', 'jelly_3', 'jelly_move', 'jelly_blink', 'jelly_happy', 'jelly_sleepy', 'jelly_sleep']
    const IMG = {}
    function loadBuddies() {
        for (const n of BUDDY_IMGS) { const im = new Image(); im.src = 'assets/images/buddies/' + n + '.png'; IMG[n] = im }
    }
    // 그림의 아래 가운데를 배경 좌표 (x, y) 에 맞춰 그림
    function drawImg(n, x, y, flip, sx, sy) {
        const im = IMG[n]
        if (!im || !im.complete || !im.naturalWidth) return
        const w = Math.round(im.naturalWidth * (sx || 1)), h = Math.round(im.naturalHeight * (sy || 1))
        const dx = Math.round(x * CS), dy = Math.round(y * CS)
        ctx.setTransform(flip ? -1 : 1, 0, 0, 1, dx, 0)
        ctx.drawImage(im, -Math.round(w / 2), dy - h, w, h)
        ctx.setTransform(CS, 0, 0, CS, 0, 0)
    }

    function shadow(x, y, ground) {
        const alt = Math.max(0, ground - y)
        const sw = Math.max(6, 16 - alt * 0.3), sa = Math.max(0.06, 0.22 - alt * 0.006)
        R('rgba(20,30,60,' + sa.toFixed(2) + ')', x - sw / 2, ground - 1, sw, 1)
        R('rgba(20,30,60,' + (sa * 0.6).toFixed(2) + ')', x - sw / 2 + 2, ground, sw - 4, 1)
    }

    const ZMAP = ['xxxxx', '...x.', '..x..', '.x...', 'xxxxx']
    function drawZ(x, y, t, seed) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        for (let i = 0; i < 3; i++) {
            const p = ((t * 0.3 + i / 3 + seed) % 1)
            const sz = p > 0.55 ? SP + 1 : SP
            const zx = Math.round((x + p * 9 + Math.sin(p * 6)) * CS), zy = Math.round((y - p * 15) * CS)
            ctx.fillStyle = `rgba(255,255,255,${(1 - p).toFixed(2)})`
            ZMAP.forEach((r, yy) => { for (let xx = 0; xx < 5; xx++) if (r[xx] === 'x') ctx.fillRect(zx + xx * sz, zy + yy * sz, sz, sz) })
        }
        ctx.setTransform(CS, 0, 0, CS, 0, 0)
    }

    // ------------------------------------------------------------ 움직임
    // 각자 따로 움직임: 좋아하는 곳 · 자는 시간 · 낮잠 버릇이 다름
    //  zones = [[왼쪽, 오른쪽, 가중치], ...] (배경 x 좌표)
    function makeBuddy(kind, x, speed, bedX, o) {
        return Object.assign({ kind, x, y: 0, dir: 1, speed, bedX, state: 'idle', timer: rnd(1, 4), target: x, napUntil: 0, hop: 0, seed: Math.random() * 4, vx: 0, alt: 20, altNow: 20, glow: false }, o)
    }
    const buddies = [
        // 고양이: 집 안 · 꽃밭을 좋아하고 낮잠을 자주 잠, 일찍 자고 늦게 일어남
        makeBuddy('cat', 92, 15, BED.x + 27, { zones: [[56, 122, 3], [255, 304, 3], [150, 250, 1]], nap: 0.18, sleepAt: 0.80, wakeAt: 0.26, idle: [3, 8] }),
        // 해파리: 밭 · 물가 위를 둥실둥실, 늦게 자고 일찍 일어남
        makeBuddy('jelly', 205, 9, BED.x + 7, { zones: [[150, 250, 4], [255, 304, 1], [56, 122, 1]], nap: 0.06, sleepAt: 0.89, wakeAt: 0.21, idle: [1.5, 4] }),
    ]

    function isNight(tod, b) { return b ? (tod > b.sleepAt || tod < b.wakeAt) : (tod > 0.83 || tod < 0.24) }
    // 해파리는 밤마다 다름: 어떤 밤은 침대에서 자고, 어떤 밤은 밖에서 반짝이며 떠다님
    function sleepsTonight(b) {
        if (b.kind !== 'jelly') return true
        const n = Math.floor(gameDays() + 0.5)
        return ((n * 9301 + 49297) % 233280) / 233280 < 0.55
    }
    function pickZone(b) {
        const total = b.zones.reduce((a, z) => a + z[2], 0)
        let r = Math.random() * total
        for (const z of b.zones) { if ((r -= z[2]) <= 0) return rnd(z[0], z[1]) }
        return rnd(WALK.min, WALK.max)
    }

    function updateBuddy(b, dt, tod, t) {
        const night = isNight(tod, b) && sleepsTonight(b)
        b.glow = b.kind === 'jelly' && isNight(tod, b) && !night
        const wantBed = night || t < b.napUntil
        if (b.state === 'sleep') {
            if (!wantBed) { b.state = 'wake'; b.timer = b.kind === 'jelly' ? 1.4 : 0.4 }
            return
        }
        if (b.state === 'wake') {
            b.timer -= dt; b.hop = clamp(b.timer / (b.kind === 'jelly' ? 1.4 : 0.4), 0, 1)
            if (b.timer <= 0) { b.hop = 0; b.state = 'idle'; b.timer = rnd(0.5, 2) }
            return
        }
        if (b.state === 'climb') {
            b.timer -= dt; b.hop = clamp(1 - b.timer / (b.kind === 'jelly' ? 1.4 : 0.4), 0, 1)
            if (b.timer <= 0) { b.hop = 1; b.state = 'sleep' }
            return
        }
        if (wantBed && b.state !== 'toBed') { b.state = 'toBed'; b.target = b.bedX }
        if (b.state === 'idle') {
            b.timer -= dt
            if (b.timer <= 0) {
                if (Math.random() < b.nap) { b.napUntil = t + rnd(20, 40); b.state = 'toBed'; b.target = b.bedX }
                else { b.target = pickZone(b); b.state = 'walk'; if (b.kind === 'jelly') b.alt = rnd(14, 30) }
            }
        }
        if (b.state === 'walk' || b.state === 'toBed') {
            const d = b.target - b.x
            if (b.kind === 'jelly') {                                   // 해파리: 부드럽게 가속 · 감속
                const want = Math.sign(d) * b.speed * Math.min(1, Math.abs(d) / 14)
                b.vx += (want - b.vx) * Math.min(1, dt * 1.4)
                b.x += b.vx * dt
                if (Math.abs(b.vx) > 0.4) b.dir = Math.sign(b.vx)
                if (Math.abs(d) < 0.6 && Math.abs(b.vx) < 0.6) arrive(b)
            } else if (Math.abs(d) < 1) {
                b.x = b.target; arrive(b)
            } else {
                b.dir = Math.sign(d)
                b.x += b.dir * Math.min(Math.abs(d), b.speed * dt)
            }
        } else if (b.kind === 'jelly') b.vx *= Math.max(0, 1 - dt * 2)
        if (b.kind === 'jelly') b.altNow += (b.alt - b.altNow) * Math.min(1, dt * 0.5)
    }
    function arrive(b) {
        if (b.state === 'toBed') { b.state = 'climb'; b.timer = b.kind === 'jelly' ? 1.4 : 0.4; b.dir = 1 }
        else {
            b.state = 'idle'; b.timer = rnd(b.idle[0], b.idle[1])
            if (b.kind === 'cat') b.pose = pickPose()
            else if (Math.random() < 0.35) b.happyUntil = performance.now() / 1000 + 2.5
        }
    }

    const CAT_POSES = [['stand', 4], ['front', 2], ['sit', 3], ['loaf', 2]]
    function pickPose() {
        let r = Math.random() * 11
        for (const [p, w] of CAT_POSES) if ((r -= w) <= 0) return p
        return 'stand'
    }

    function drawBuddy(b, t) {
        const sleeping = b.state === 'sleep'
        const moving = b.state === 'walk' || b.state === 'toBed'
        const between = b.state === 'climb' || b.state === 'wake'
        const lift = b.hop * 7                                      // 침대 위 높이
        const hopArc = between ? Math.sin(b.hop * Math.PI) * 4 : 0
        if (b.kind === 'cat') {
            const y = GY - lift - hopArc
            if (sleeping) { drawImg('cat_sleep', b.x, y + (Math.sin(t * 2) > 0.3 ? -0.34 : 0), false); drawZ(b.x - 10, y - 17, t, 0); return }
            if (between) { drawImg('cat_loaf', b.x, y, false); return }
            if (moving) {
                const f = ['cat_walk1', 'cat_stand', 'cat_walk2', 'cat_stand'][Math.floor(t * 7) % 4]
                drawImg(f, b.x, y, b.dir < 0)
                return
            }
            const pose = b.pose || 'stand'
            drawImg(pose === 'stand' ? (b.dir < 0 ? 'cat_left' : 'cat_stand') : 'cat_' + pose, b.x, y, false)
        } else {
            // 공중에 둥실 (집 안에선 천장에 안 닿게 낮게), 침대로 갈 땐 천천히 내려앉음 · (x, yb) = 촉수 끝
            const inside = b.x > HOUSE.x0 && b.x < HOUSE.x1
            const air = (inside ? Math.min(10, b.altNow - 6) : b.altNow - 6) + 3 * Math.sin(t * 0.33 + b.seed) + Math.sin(t * 2.4 + b.seed) * 1.4
            const smooth = b.hop * b.hop * (3 - 2 * b.hop)
            const yb = GY - lerp(Math.max(4, air), 8, smooth)
            b.yb = yb
            const onBed = b.x > BED.x - 2 && b.x < BED.x + BED.w + 2
            shadow(b.x, yb, onBed ? GY - 8 : GY)
            const pulse = Math.sin(t * 2.6 + b.seed)
            let n, flip = false, sx = 1 + pulse * 0.025, sy = 1 - pulse * 0.025
            if (sleeping) { n = 'jelly_sleep'; sx = 1 + Math.sin(t * 1.6) * 0.02; sy = 1 - Math.sin(t * 1.6) * 0.02 }
            else if (between) n = 'jelly_sleepy'
            else if (moving && Math.abs(b.vx) > 2.5) { n = 'jelly_move'; flip = b.vx > 0 }
            else if (t < (b.happyUntil || 0)) n = 'jelly_happy'
            else if (((t + b.seed) % 4.2) < 0.18) n = 'jelly_blink'
            else n = ['jelly_1', 'jelly_2', 'jelly_3', 'jelly_2'][Math.floor(t * 2.6 + b.seed) % 4]
            drawImg(n, b.x, yb, flip, sx, sy)
            if (sleeping) drawZ(b.x + 7, yb - 20, t, 0.5)
        }
    }

    // 반딧불이 (밤)
    const FLIES = Array.from({ length: 9 }, (_, i) => ({ x: 150 + i * 17, y: GY - 12 - (i % 3) * 7, p: i * 1.3 }))

    // ------------------------------------------------------------ 밤 그림자 + 불빛
    function drawNight(s, t, tod) {
        const dark = s.night * 0.62
        if (dark < 0.01) return
        nctx.globalCompositeOperation = 'source-over'
        nctx.clearRect(0, 0, W, H)
        nctx.fillStyle = `rgba(8,10,34,${dark.toFixed(3)})`
        nctx.fillRect(0, 0, W, H)
        nctx.globalCompositeOperation = 'destination-out'
        const hole = (x, y, r, a) => {
            const g = nctx.createRadialGradient(x, y, 0, x, y, r)
            g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)')
            nctx.fillStyle = g; nctx.fillRect(x - r, y - r, r * 2, r * 2)
        }
        const flick = 0.9 + 0.1 * Math.sin(t * 9) * Math.sin(t * 5.3)
        hole(LANTERN.x, LANTERN.y - 2, 52 * flick, 0.95)
        hole(LANTERN.x, LANTERN.y - 2, 20, 1)
        for (const b of buddies) if (b.glow && b.yb) hole(b.x, b.yb - 16, 24, 0.75 * s.night)
        if (s.night > 0.5) for (const f of FLIES) {
            const fx = f.x + Math.sin(t * 0.7 + f.p) * 6, fy = f.y + Math.sin(t * 1.1 + f.p * 2) * 4
            hole(fx, fy, 7, 0.8 * (0.5 + 0.5 * Math.sin(t * 2 + f.p)))
        }
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(nv, 0, 0)
        ctx.imageSmoothingEnabled = false
        // 따뜻한 불빛 색
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const g = ctx.createRadialGradient(LANTERN.x, LANTERN.y, 0, LANTERN.x, LANTERN.y, 46)
        g.addColorStop(0, `rgba(255,160,60,${(0.22 * s.night * flick).toFixed(3)})`); g.addColorStop(1, 'rgba(255,160,60,0)')
        ctx.fillStyle = g; ctx.fillRect(LANTERN.x - 46, LANTERN.y - 46, 92, 92)
        for (const b of buddies) if (b.glow && b.yb) {                 // 밤에 깨어 있는 해파리는 은은하게 빛남
            const p = 0.8 + 0.2 * Math.sin(t * 2.4 + b.seed)
            const jg = ctx.createRadialGradient(b.x, b.yb - 16, 0, b.x, b.yb - 16, 22)
            jg.addColorStop(0, `rgba(120,210,255,${(0.30 * s.night * p).toFixed(3)})`); jg.addColorStop(1, 'rgba(120,210,255,0)')
            ctx.fillStyle = jg; ctx.fillRect(b.x - 22, b.yb - 38, 44, 44)
        }
        ctx.restore()
        if (s.night > 0.5) for (const f of FLIES) {
            const fx = f.x + Math.sin(t * 0.7 + f.p) * 6, fy = f.y + Math.sin(t * 1.1 + f.p * 2) * 4
            const a = (s.night * (0.5 + 0.5 * Math.sin(t * 2 + f.p))).toFixed(2)
            R(`rgba(220,255,120,${a})`, fx, fy, 1, 1)
        }
    }

    // ------------------------------------------------------------ 메인
    function frame(nowMs) {
        const t = nowMs / 1000
        const days = gameDays(), tod = days % 1
        const s = skyAt(tod)
        ctx.setTransform(CS, 0, 0, CS, 0, 0)
        drawSky(s, t, days)
        drawHills(s)
        drawSmoke(t, s)
        drawHouse(s, t)
        ctx.drawImage(groundCv, 0, GY)
        drawFarm(t, days)
        drawFlowers(t)
        for (const b of buddies) drawBuddy(b, t)
        drawNight(s, t, tod)
    }

    function loop(ms) {
        requestAnimationFrame(loop)
        if (document.hidden) { last = ms; return }
        const dt = Math.min(0.1, (ms - last) / 1000 || 0); last = ms
        acc += dt
        if (acc < 1 / FPS) return
        const step = acc; acc = 0
        const t = ms / 1000, tod = gameDays() % 1
        for (const b of buddies) updateBuddy(b, step, tod, t)
        frame(ms)
    }

    function start() {
        if (document.getElementById('bgScene')) return
        cv = document.createElement('canvas')
        cv.id = 'bgScene'; cv.width = W * CS; cv.height = H * CS
        document.body.insertBefore(cv, document.body.firstChild)
        ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false
        nv = document.createElement('canvas'); nv.width = W; nv.height = H; nctx = nv.getContext('2d')
        buildGround()
        loadBuddies()
        // 켰을 때 밤이면 처음부터 침대에서 자고 있음
        for (const b of buddies) if (isNight(gameDays() % 1, b) && sleepsTonight(b)) { b.x = b.bedX; b.state = 'sleep'; b.hop = 1; b.dir = 1 }
        requestAnimationFrame(loop)
    }

    window.HealingScene = { start }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
    else start()
})()
