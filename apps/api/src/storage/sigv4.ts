import { createHash, createHmac } from 'node:crypto'

/**
 * 手写 AWS SigV4 查询串预签名（GET 对象），避免额外依赖 @aws-sdk/s3-request-presigner
 * （npm workspace 下 arborist 安装异常，且服务器侧免去一次依赖安装）。
 * 兼容任何 S3 协议端点（Cloudflare R2 的 region 固定为 auto）。
 */
export interface SigV4PresignInput {
  /** 端点主机名，例如 `<account>.r2.cloudflarestorage.com`；虚拟主机式部署时可含 bucket 前缀 */
  host: string
  /** 路径式访问时必填（如 R2）；虚拟主机式（bucket 在域名中）传空串 */
  bucket: string
  key: string
  accessKeyId: string
  secretAccessKey: string
  /** R2 使用 'auto'；其他 S3 兼容端点为地域名 */
  region: string
  expiresSeconds: number
  /** 例如 `attachment; filename*=UTF-8''report.pdf`，作为签名参数下发给对象存储 */
  responseContentDisposition?: string
  /** 测试注入用；默认当前时间 */
  now?: Date
}

/** RFC 3986 严格编码：encodeURIComponent 会放过 ! ' ( ) *，AWS 要求一并转义。 */
function awsUriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => awsUriEncode(segment)).join('/')
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

export function presignS3GetUrl(input: SigV4PresignInput): string {
  const now = input.now ?? new Date()
  // ISO: 2026-11-13T00:10:10.123Z → 20261113T001010Z
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`
  const canonicalUri = '/' + [input.bucket, input.key].filter(Boolean).map((part) => encodePath(part)).join('/')

  const query: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${input.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, input.expiresSeconds))],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  if (input.responseContentDisposition) query.push(['ResponseContentDisposition', input.responseContentDisposition])
  query.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const canonicalQuery = query.map(([name, value]) => `${awsUriEncode(name)}=${awsUriEncode(value)}`).join('&')

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    `host:${input.host}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')

  return `https://${input.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
