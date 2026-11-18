// Support contact shown on the payment dialog.
// To show your WeChat QR code, put the image at
//   src/extensions/recharge/assets/support-wechat.png  (.jpg / .jpeg / .webp also work)
// and optionally fill in the WeChat ID below. Without an image or ID the block is hidden.
export const SUPPORT_WECHAT_ID = ''
// Link encoded in the personal WeChat QR code. Inside the WeChat app it opens the
// "add friend" card directly; other browsers cannot open it.
export const SUPPORT_ADD_URL = 'https://u.wechat.com/MCbcwNY2M1Fn8vg1cOMGS58?s=2'

const images = import.meta.glob<string>('./assets/support-wechat.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' })
export const SUPPORT_QR: string = Object.values(images)[0] || ''
export const SUPPORT_AVAILABLE = Boolean(SUPPORT_QR || SUPPORT_WECHAT_ID || SUPPORT_ADD_URL)
