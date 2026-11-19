/**
 * 힐링타운 런처 업데이트 버튼 (시작 화면 오른쪽 아래, 게임 시작 버튼 위)
 *  - 평소: 작게 "런처 v1.2.5 · 업데이트 확인" → 누르면 바로 새 버전 확인
 *  - 새 버전을 찾으면: "새 버전 v1.2.6 받는 중 45%" (막대) → 누르면 다 받는 대로 바로 설치
 *  - 다 받으면: 반짝이는 "지금 업데이트" 버튼 → 누르면 런처가 잠깐 꺼졌다가 새 버전으로 다시 켜짐
 *  - 게임을 하는 중이면 설치는 게임을 끈 다음에 (게임이 같이 꺼지지 않게)
 *  - 설정 → 업데이트 로 들어가지 않아도 여기서 다 됨 (uicore.js 의 자동 업데이트 알림을 그대로 받아서 보여 줌)
 */
/* global isDev, ipcRenderer, shell, remote, updatePopup, updatePopupInstall */
const HTUpdate = (() => {
    const ARROW = '<svg viewBox="0 0 12 12" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M5 1h2v1h1v1h1v1h1v1h1v2H8v4H4V7H1V5h1V4h1V3h1V2h1V1z"/></svg>'
    const CHECK = '<svg viewBox="0 0 12 12" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M10 2h2v2h-1v1h-1v1H9v1H8v1H7v1H6v1H5v1H4v-1H3V9H2V8H1V7H0V5h2v1h1v1h1v1h1V7h1V6h1V5h1V4h1V3h1V2z"/></svg>'
    const SPIN = '<svg viewBox="0 0 12 12" width="14" height="14" shape-rendering="crispEdges" class="htUpdSpin"><path fill="currentColor" d="M4 0h4v2H4zM10 4h2v4h-2zM4 10h4v2H4zM0 4h2v4H0z"/><path fill="currentColor" opacity=".45" d="M2 1h2v2H2zM8 1h2v2H8zM8 9h2v2H8zM2 9h2v2H2z"/></svg>'
    const WARN = '<svg viewBox="0 0 12 12" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M5 0h2v8H5zM5 9h2v2H5z"/></svg>'

    // idle · checking · latest · downloading · ready · error · mac(새 버전 받으러 가기)
    const s = { state: 'idle', version: null, percent: 0, manual: false, installWhenReady: false, installing: false, macUrl: null, flash: null }

    function current(){
        try { return remote.app.getVersion() } catch(e) { return '' }
    }

    /** 게임이 켜져 있는지 (landing.js 의 proc) */
    function inGame(){
        try {
            // eslint-disable-next-line no-undef
            const p = typeof proc !== 'undefined' ? proc : null
            return !!p && p.exitCode === null && !p.killed
        } catch(e) { return false }
    }

    function el(id){ return document.getElementById(id) }

    function build(){
        if(el('htUpdate')) return
        const host = document.querySelector('#landingContainer > #lower > #right')
        if(!host) return
        const box = document.createElement('div')
        box.id = 'htUpdate'
        box.innerHTML = '<button id="htUpdateBtn" type="button">'
            + '<span id="htUpdateIcon"></span>'
            + '<span id="htUpdateTexts"><span id="htUpdateText"></span><span id="htUpdateSub"></span></span>'
            + '</button>'
            + '<div id="htUpdateBar"><div id="htUpdateFill"></div></div>'
        host.appendChild(box)
        el('htUpdateBtn').addEventListener('click', click)
        render()
    }

    function render(){
        const box = el('htUpdate')
        if(!box) return
        const v = s.version ? 'v' + s.version : ''
        let icon = ARROW, text = '', sub = '', title = ''
        switch(s.state){
            case 'checking':
                icon = SPIN; text = '새 버전 확인 중...'
                break
            case 'latest':
                icon = CHECK; text = '최신 버전이에요'; sub = '런처 v' + current()
                break
            case 'downloading':
                icon = SPIN
                text = `새 버전 ${v} 받는 중 ${Math.floor(s.percent)}%`
                sub = s.installWhenReady ? '다 받으면 바로 설치돼요' : '눌러 두면 다 받는 대로 설치'
                title = '받는 동안에도 런처는 그대로 쓸 수 있어요'
                break
            case 'ready':
                icon = s.installing ? SPIN : ARROW
                text = s.installing ? '설치하는 중...' : `새 버전 ${v} · 지금 업데이트`
                sub = s.installing ? '런처가 잠깐 꺼졌다가 다시 켜져요'
                    : inGame() ? '게임을 끄면 설치할 수 있어요' : '누르면 잠깐 꺼졌다가 다시 켜져요'
                break
            case 'error':
                icon = WARN; text = '업데이트를 못 받았어요'; sub = '눌러서 다시 시도'
                break
            case 'mac':
                icon = ARROW; text = `새 버전 ${v} 받기`; sub = '누르면 받는 곳이 열려요'
                break
            default:
                icon = ARROW; text = '런처 v' + current(); sub = '업데이트 확인'
                title = '누르면 새 버전이 있는지 바로 확인해요'
        }
        box.className = s.state
        el('htUpdateIcon').innerHTML = icon
        el('htUpdateText').textContent = text
        el('htUpdateSub').textContent = sub
        el('htUpdateSub').style.display = sub ? '' : 'none'
        el('htUpdateBtn').title = title
        el('htUpdateBtn').disabled = s.state === 'checking' || s.installing
        el('htUpdateFill').style.width = (s.state === 'downloading' ? Math.max(2, Math.min(100, s.percent)) : 0) + '%'
    }

    function set(state){
        s.state = state
        if(s.flash){ clearTimeout(s.flash); s.flash = null }
        render()
    }

    function check(){
        if(typeof isDev !== 'undefined' && isDev){ set('latest'); backToIdle(); return }
        s.manual = true
        set('checking')
        ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
        // 답이 안 오면 (인터넷 끊김 등) 다시 누를 수 있게
        s.flash = setTimeout(() => { if(s.state === 'checking'){ s.manual = false; set('error') } }, 30000)
    }

    function backToIdle(){
        s.flash = setTimeout(() => { if(s.state === 'latest') set('idle') }, 4000)
    }

    function showInstalling(){
        s.installing = true
        set('ready')
        // 혹시 설치가 안 되고 런처가 그대로면 (권한 거부 등) 다시 누를 수 있게
        setTimeout(() => { if(s.installing){ s.installing = false; render() } }, 20000)
    }

    function install(){
        if(inGame()){ render(); return }
        showInstalling()
        if(typeof updatePopupInstall === 'function') updatePopupInstall()
        else ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
    }

    function click(){
        switch(s.state){
            case 'idle': case 'latest': case 'error':
                check()
                break
            case 'downloading':
                s.installWhenReady = !s.installWhenReady
                if(typeof updatePopup !== 'undefined') updatePopup.installWhenReady = s.installWhenReady
                render()
                break
            case 'ready':
                install()
                break
            case 'mac':
                if(s.macUrl) shell.openExternal(s.macUrl)
                break
        }
    }

    // ------------------------------------------------------------------ uicore.js 가 부르는 곳
    /** 자동 업데이트 알림 (checking-for-update · update-available · download-progress · update-downloaded · update-not-available · realerror) */
    function notify(arg, info){
        switch(arg){
            case 'checking-for-update':
                if(s.manual && s.state !== 'downloading' && s.state !== 'ready') set('checking')
                break
            case 'update-available':
                s.version = info && info.version
                s.manual = false
                if(info && info.darwindownload){ s.macUrl = info.darwindownload; set('mac') }
                else if(s.state !== 'ready') set('downloading')
                break
            case 'download-progress':
                if(info && typeof info.percent === 'number'){
                    s.percent = info.percent
                    if(s.state !== 'ready' && s.state !== 'mac') { s.state = 'downloading'; render() }
                }
                break
            case 'update-downloaded':
                s.version = (info && info.version) || s.version
                s.percent = 100
                set('ready')
                if(s.installWhenReady){
                    // 설치는 uicore.js 가 함 (updatePopup.installWhenReady 를 같이 맞춰 둠) → 여기서는 글자만
                    if(typeof updatePopup !== 'undefined') showInstalling()
                    else install()
                }
                break
            case 'update-not-available':
                if(s.manual){ s.manual = false; set('latest'); backToIdle() }
                else if(s.state === 'checking') set('idle')
                break
            case 'realerror':
                // 손으로 확인했거나 받는 중이었으면 '다시 시도' 로, 아니면 (자동 확인 실패) 그냥 조용히
                if(s.manual || s.state === 'downloading' || s.state === 'checking'){ s.manual = false; set('error') }
                break
        }
    }

    /** 알림 창에서 '다 받으면 설치' 를 눌렀을 때 버튼도 같이 */
    function setInstallWhenReady(v){
        s.installWhenReady = !!v
        render()
    }

    document.addEventListener('DOMContentLoaded', build)
    // 게임이 켜졌다 꺼지면 "게임을 끄면 설치" 문구를 바꿔 줌
    setInterval(() => { if(s.state === 'ready') render() }, 2000)

    return { notify, setInstallWhenReady, check }
})()
