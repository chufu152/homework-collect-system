import { describe, expect, it } from 'vitest'
import { presignS3GetUrl } from './sigv4.js'

/**
 * AWS S3 官方文档「Authenticating Requests: Using Query Parameters (AWS Signature Version 4)」
 * 的示例向量：已知输入与期望签名，用于验证 SigV4 实现的正确性。
 */
const AWS_DOC_VECTOR = {
  host: 'examplebucket.s3.amazonaws.com',
  bucket: 'examplebucket',
  key: 'test.txt',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  expiresSeconds: 86400,
  now: new Date('2013-05-24T00:00:00.000Z'),
  expectedSignature: 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
}

describe('presignS3GetUrl', () => {
  it('matches the AWS documentation SigV4 query-auth vector (virtual-host style)', () => {
    const url = presignS3GetUrl({ ...AWS_DOC_VECTOR, bucket: '' })
    expect(url).toContain(`https://${AWS_DOC_VECTOR.host}/test.txt?`)
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256')
    expect(url).toContain(`X-Amz-Credential=${AWS_DOC_VECTOR.accessKeyId}%2F20130524%2Fus-east-1%2Fs3%2Faws4_request`)
    expect(url).toContain('X-Amz-Date=20130524T000000Z')
    expect(url).toContain('X-Amz-Expires=86400')
    expect(url).toContain(`X-Amz-Signature=${AWS_DOC_VECTOR.expectedSignature}`)
  })

  it('builds path-style URIs for R2-style endpoints (bucket in the path)', () => {
    const url = presignS3GetUrl({ ...AWS_DOC_VECTOR, host: 'acct.r2.cloudflarestorage.com', region: 'auto' })
    expect(url).toContain('https://acct.r2.cloudflarestorage.com/examplebucket/test.txt?')
    expect(url).toContain('%2Fauto%2Fs3%2Faws4_request')
  })

  it('signs the content-disposition parameter so object storage can set the download name', () => {
    const url = presignS3GetUrl({
      ...AWS_DOC_VECTOR,
      bucket: '',
      responseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent('作业 答案(1).pdf')}`,
    })
    expect(url).toContain('/test.txt?ResponseContentDisposition=')
    expect(url).toContain('%281%29')
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/)
  })

  it('encodes special characters in object keys strictly (RFC 3986)', () => {
    const url = presignS3GetUrl({ ...AWS_DOC_VECTOR, key: 'a b/c!d(e).txt' })
    expect(url).toContain('/examplebucket/a%20b/c%21d%28e%29.txt?')
  })
})
