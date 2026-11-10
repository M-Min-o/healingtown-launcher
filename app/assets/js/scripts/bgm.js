/**
 * 힐링타운 런처 배경 음악
 *  - 곡: assets/audio/healingtown-bgm.ogg (런처용으로 직접 만든 잔잔한 곡 · 저작권 없음, 2분 · 끊김 없이 반복)
 *  - 시작 화면 왼쪽 위 ♪ 버튼: 누르면 켜기 · 끄기, 마우스를 올리면 크기 조절 막대
 *  - 설정 → 런처 → 배경 음악 에서도 조절 (값은 런처 설정에 저장)
 *  - 게임을 하는 동안은 자동으로 멈추고, 게임이 꺼지면 다시 나옴
 */
/* global ConfigManager */
const HTBgm = (() => {
    const MAX_GAIN = 0.5                     // 100% 일 때 실제 크기 (곡 자체가 커서 줄여 둠)
    // 귀에 들리는 크기는 막대 값과 비례하지 않음 → 제곱으로 (막대를 낮추면 소리가 그만큼 확 작아지게, 작은 쪽을 세밀하게)
    //  15% ≈ 예전 2%, 25%(처음 값) ≈ 예전 5%, 50% ≈ 예전 21%, 100% ≈ 예전 83%
    const DEFAULT_PERCENT = 25
    // 런처는 ejs-electron 이 file: 주소를 통째로 가로채서 주는데, 이렇게 받은 소리 파일은 크롬이 못 틀어줌
    // (MEDIA_ELEMENT_ERROR: Format error) → 파일을 직접 읽어서 blob 주소로 넘김 (반복 재생 · 되감기도 됨)
    function source(){
        try {
            const fs = require('fs'), p = require('path')
            const buf = fs.readFileSync(p.join(__dirname, 'assets', 'audio', 'healingtown-bgm.ogg'))
            return URL.createObjectURL(new Blob([buf], { type: 'audio/ogg' }))
        } catch(e) {
            console.warn('[배경 음악] 파일을 직접 못 읽어서 주소로 엽니다.', e)
            return './assets/audio/healingtown-bgm.ogg'
        }
    }
    const audio = new Audio(source())
    audio.addEventListener('error', () => console.warn('[배경 음악] 재생 오류', audio.error && audio.error.code, audio.error && audio.error.message))
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 0
    let inGame = false
    let fadeTimer = null
    let started = false

    const cm = () => (typeof ConfigManager !== 'undefined' ? ConfigManager : null)
    const percent = () => { try { return cm() ? cm().getBgmVolume() : DEFAULT_PERCENT } catch(e) { return DEFAULT_PERCENT } }
    const muted = () => { try { return cm() ? cm().getBgmMuted() : false } catch(e) { return false } }
    const target = () => (muted() || inGame || percent() <= 0) ? 0 : Math.pow(percent() / 100, 2) * MAX_GAIN

    function fadeTo(v, ms, done){
        if(fadeTimer) clearInterval(fadeTimer)
        const from = audio.volume, steps = Math.max(1, Math.round(ms / 40))
        let i = 0
        fadeTimer = setInterval(() => {
            i++
            audio.volume = Math.max(0, Math.min(1, from + (v - from) * (i / steps)))
            if(i >= steps){ clearInterval(fadeTimer); fadeTimer = null; if(done) done() }
        }, 40)
    }

    function play(){
        const p = audio.play()
        if(p && p.catch) p.catch(() => {                 // 자동 재생이 막힌 경우: 처음 클릭할 때 다시
            const once = () => { document.removeEventListener('mousedown', once, true); sync(800) }
            document.addEventListener('mousedown', once, true)
        })
    }

    /** 지금 설정에 맞게 (ms 동안 부드럽게) */
    function sync(ms = 600){
        const t = target()
        if(t > 0){
            if(audio.paused) play()
            fadeTo(t, ms)
        } else {
            fadeTo(0, ms, () => { if(target() === 0) audio.pause() })
        }
        render()
    }

    function save(){ try { cm() && cm().save() } catch(e) { /* 저장 실패는 무시 */ } }

    function setVolume(p){
        if(!cm()) return
        cm().setBgmVolume(p)
        if(p > 0 && muted()) cm().setBgmMuted(false)
        save()
        sync(120)
    }

    function setOn(on){
        if(!cm()) return
        cm().setBgmMuted(!on)
        if(on && percent() <= 0) cm().setBgmVolume(DEFAULT_PERCENT)
        save()
        sync(400)
    }

    /** 게임 실행 → 멈춤, 게임 종료 → 다시 */
    function gameStarted(proc){
        inGame = true
        sync(1500)
        if(proc && proc.on) proc.on('close', () => { inGame = false; sync(2000) })
    }

    // ------------------------------------------------------------------ 화면
    const NOTE = '<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><path fill="currentColor" d="M6 2h8v2H8v7H7v1H6v1H3v-1H2v-2h1V9h3V2zm6 2h2v7h-1v1h-1v1H9v-1H8v-2h1V9h3V4z"/></svg>'
    const NOTE_OFF = '<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><path fill="currentColor" opacity=".45" d="M6 2h8v2H8v7H7v1H6v1H3v-1H2v-2h1V9h3V2zm6 2h2v7h-1v1h-1v1H9v-1H8v-2h1V9h3V4z"/><path fill="#ff6b5b" d="M2 1h2v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v2h-2v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1V9H9V8H8V7H7V6H6V5H5V4H4V3H3V2H2V1z"/></svg>'

    function build(){
        if(document.getElementById('htBgm')) return
        const box = document.createElement('div')
        box.id = 'htBgm'
        box.innerHTML = '<button id="htBgmBtn" title="배경 음악 켜기 · 끄기"></button>'
            + '<div id="htBgmPanel"><input type="range" id="htBgmRange" min="0" max="100" step="1"><span id="htBgmText"></span></div>'
        document.body.appendChild(box)
        document.getElementById('htBgmBtn').addEventListener('click', () => setOn(muted() || percent() <= 0))
        const range = document.getElementById('htBgmRange')
        range.addEventListener('input', () => setVolume(Number(range.value)))

        // 설정 → 런처 → 배경 음악
        const sRange = document.getElementById('settingsBgmVolume')
        const sOn = document.getElementById('settingsBgmOn')
        if(sRange) sRange.addEventListener('input', () => setVolume(Number(sRange.value)))
        if(sOn) sOn.addEventListener('change', () => setOn(sOn.checked))
        render()
        // ♪ 버튼은 시작 화면에서만 (설정 화면은 설정 → 런처 → 배경 음악)
        setInterval(() => {
            const land = document.getElementById('landingContainer')
            const show = !!land && land.offsetParent !== null && getComputedStyle(land).display !== 'none'
            box.style.display = show ? 'flex' : 'none'
        }, 400)
    }

    function render(){
        const on = !muted() && percent() > 0
        const btn = document.getElementById('htBgmBtn')
        if(btn){ btn.innerHTML = on ? NOTE : NOTE_OFF; btn.classList.toggle('off', !on) }
        const range = document.getElementById('htBgmRange')
        if(range && document.activeElement !== range) range.value = percent()
        const txt = document.getElementById('htBgmText')
        if(txt) txt.textContent = on ? percent() + '%' : '끔'
        const sRange = document.getElementById('settingsBgmVolume')
        if(sRange && document.activeElement !== sRange) sRange.value = percent()
        const sTxt = document.getElementById('settingsBgmVolumeText')
        if(sTxt) sTxt.textContent = percent() + '%'
        const sOn = document.getElementById('settingsBgmOn')
        if(sOn) sOn.checked = on
    }

    document.addEventListener('DOMContentLoaded', () => {
        build()
        if(!started){ started = true; setTimeout(() => sync(2500), 600) }     // 천천히 커지면서 시작
    })

    return { sync, setVolume, setOn, gameStarted }
})()
