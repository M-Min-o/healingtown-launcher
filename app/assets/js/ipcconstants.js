// ★ 마이크로소프트 로그인용 Azure 앱 아이디 ★
//  직접 만든 앱 아이디로 바꿔야 함 (만드는 법: 런처설정가이드.md 2단계)
//  아래는 원본 Helios 런처의 아이디 (테스트용, 정식 배포 전에 꼭 바꾸기)
exports.AZURE_CLIENT_ID = '1ce6e35a-126f-48fd-97fb-54d143ac6d45'
// SEE NOTE ABOVE.


// Opcodes
exports.MSFT_OPCODE = {
    OPEN_LOGIN: 'MSFT_AUTH_OPEN_LOGIN',
    OPEN_LOGOUT: 'MSFT_AUTH_OPEN_LOGOUT',
    REPLY_LOGIN: 'MSFT_AUTH_REPLY_LOGIN',
    REPLY_LOGOUT: 'MSFT_AUTH_REPLY_LOGOUT'
}
// Reply types for REPLY opcode.
exports.MSFT_REPLY_TYPE = {
    SUCCESS: 'MSFT_AUTH_REPLY_SUCCESS',
    ERROR: 'MSFT_AUTH_REPLY_ERROR'
}
// Error types for ERROR reply.
exports.MSFT_ERROR = {
    ALREADY_OPEN: 'MSFT_AUTH_ERR_ALREADY_OPEN',
    NOT_FINISHED: 'MSFT_AUTH_ERR_NOT_FINISHED'
}

exports.SHELL_OPCODE = {
    TRASH_ITEM: 'TRASH_ITEM'
}