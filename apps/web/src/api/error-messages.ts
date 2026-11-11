/**
 * B2 UX 文案：把接口错误统一成「问题 + 恢复动作」。
 *
 * 依据 `docs/frontend-skill-prompts.md` B2、`docs/frontend-decisions.md` T8 / T9 / T11：
 * - 仅 429 / 413 / 503 使用差异化、可恢复的中文文案；
 * - 其余错误码沿用后端统一信封的 `message`，再补一段状态级恢复动作，不逐条编造业务事实；
 * - 不消费 `GET /health`、不新增多语言 / 深色模式维度。
 *
 * 本模块刻意不 import `../api/client`：组件测试普遍 `vi.mock('../api/client')` 且只提供 `api`，
 * 若依赖该模块的导出会在 mock 环境里拿到 undefined。这里改为结构化判定，保持与客户端解耦。
 */

interface StructuredApiError extends Error {
  code?: string
  status?: number
  retryAfter?: number | null
}

function isStructuredApiError(error: unknown): error is StructuredApiError {
  return error instanceof Error
    && typeof (error as StructuredApiError).code === 'string'
    && typeof (error as StructuredApiError).status === 'number'
}

/** 后端错误信封中会出现、因此需要本地解释的 code（见 `docs/api.md` 第 1 节）。 */
const ENVELOPE_CODES = new Set([
  'BAD_REQUEST', 'VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND',
  'CONFLICT', 'FILE_TOO_LARGE', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR', 'REQUEST_FAILED',
])

const GENERIC_RECOVERY = '请核对信息后重试；若仍无法完成，请联系教师。'
const NETWORK_RECOVERY = '网络连接失败，请检查网络后重试；若一直无法使用，请联系教师。'

/**
 * C1：`fetch` 自身失败（断网、DNS、CORS、代理中断）时不会返回响应，
 * 因此没有接口信封，抛出的通常是 `TypeError: Failed to fetch`。
 * 这类错误不能把浏览器英文原文直接显示给学生，统一转成简体中文恢复动作。
 */
function isNetworkFailure(error: Error): boolean {
  return /fetch|network|网络|econn|enotfound/i.test(`${error.name} ${error.message}`)
}

function problemLabel(status: number): string {
  switch (status) {
    case 400:
    case 422: return '填写内容未被接受'
    case 401: return '管理密钥无效或未保存'
    case 403: return '当前操作没有权限'
    case 404: return '未找到对应的作业、提交或文件'
    case 409: return '当前状态与操作冲突'
    case 500: return '服务处理时出错'
    default: return '操作未能完成'
  }
}

function recoveryAction(status: number): string {
  switch (status) {
    case 401: return '请到「班级名单」重新保存管理密钥后重试。'
    case 403: return '请确认使用的是教师入口，且管理密钥正确。'
    case 404: return '请检查分享链接或回执链接是否完整；若作业已停止收取，请联系教师。'
    case 409: return '请刷新页面，确认最新状态后再试。'
    case 500: return '请稍后重试；若一直无法使用，请联系教师。'
    default: return GENERIC_RECOVERY
  }
}

/**
 * 生成可直接展示的错误文案。
 * - 结构化接口错误 → 中文「问题 + 恢复动作」；
 * - 客户端自行抛出的错误（下载 / 导出、空响应 / 空 Blob）与普通中文 Error → 原样保留；
 * - 浏览器网络层失败（`TypeError: Failed to fetch`）→ 统一简体中文网络恢复动作；
 * - 非 Error → 使用调用方给出的兜底文案。
 */
export function describeError(error: unknown, fallback: string): string {
  if (!isStructuredApiError(error)) {
    if (error instanceof Error && error.message) {
      return isNetworkFailure(error) ? NETWORK_RECOVERY : error.message
    }
    return fallback
  }
  const code = error.code ?? ''
  if (!ENVELOPE_CODES.has(code)) return error.message || fallback

  // T8：三类差异化、可恢复文案。
  if (code === 'RATE_LIMITED' || error.status === 429) {
    const seconds = error.retryAfter
    return `操作太频繁，已暂时限制请求。${seconds != null && seconds > 0 ? `请约 ${seconds} 秒后重试。` : '请稍等片刻再重试。'}`
  }
  if (code === 'FILE_TOO_LARGE' || error.status === 413) {
    return '附件或导出内容超出大小上限。请减小文件、分开提交，或分批导出后重试。'
  }
  if (code === 'SERVICE_UNAVAILABLE' || error.status === 503) {
    return '服务暂时不可用。请稍后重试；若一直无法使用，请联系教师检查运行环境。'
  }

  // T8：其余沿用统一 `message`，只补状态级问题标签与恢复动作，不翻译业务细节。
  const message = error.message.trim()
  const problem = message ? `${problemLabel(error.status ?? 0)}：${message}` : `${problemLabel(error.status ?? 0)}。`
  return `${problem} ${recoveryAction(error.status ?? 0)}`
}
