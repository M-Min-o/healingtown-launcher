const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// ★ 서버 정보 파일(distribution.json) 주소 ★
//  서버 주소 · 마크 버전 · Fabric · 모드 목록 · 공지사항(RSS) 이 이 파일에 들어 있음
//  파일을 바꿔서 다시 올리기만 하면 모든 유저의 런처가 다음 실행 때 자동으로 맞춤 (런처 재배포 필요 없음)
//  만드는 법: distro/README.md  (npm run distro)
exports.REMOTE_DISTRO_URL = 'https://M-Min-o.github.io/healingtown-files/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api