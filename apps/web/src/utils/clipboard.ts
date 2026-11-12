// 剪贴板写入：优先标准 Clipboard API（仅 HTTPS/localhost 可用），
// HTTP 部署（如公网 IP 直访）自动降级为隐藏 textarea + execCommand('copy')。
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('copy command rejected')
  } finally {
    textarea.remove()
  }
}
