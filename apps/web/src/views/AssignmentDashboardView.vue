<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type AssignmentDashboard, type SubmissionVersion } from '../api/client'
import { describeError } from '../api/error-messages'
import { copyToClipboard } from '../utils/clipboard'

const props = defineProps<{ assignmentId: string }>()
const router = useRouter()
const dashboard = ref<AssignmentDashboard | null>(null)
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const notice = ref('')
const feedbackDrafts = reactive<Record<string, { score: string; feedbackText: string }>>({})
const feedbackSaved = ref<string | null>(null)
interface VersionState {
  items: SubmissionVersion[]
  loading: boolean
  error: string
  empty: string
}
const versionStates = reactive<Record<string, VersionState>>({})
// C1：批改草稿是否已由教师改动；只有未改动的草稿才在刷新时按服务端最新值重建。
const feedbackDirty = reactive<Record<string, boolean>>({})
// C1：按操作粒度去重，避免重复点击产生并发写入 / 重复下载 / 重复导出。
const inFlight = reactive<Record<string, boolean>>({})
const typeName: Record<string, string> = { online: '线上作业', offline: '线下完成', checkin: '签到', relay: '接龙' }
const statusName: Record<string, string> = { missing: '未完成', submitted: '已提交', late: '迟交', completed: '已完成', checked_in: '已签到', joined: '已接龙' }

function isBusy(key: string): boolean {
  return !!inFlight[key]
}

async function exclusive(key: string, action: () => Promise<void>): Promise<void> {
  if (inFlight[key]) return
  inFlight[key] = true
  try { await action() } finally { delete inFlight[key] }
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  for (const key of Object.keys(versionStates)) delete versionStates[key]
  try {
    const result = await api.dashboard(props.assignmentId)
    // C1：客户端已验证看板契约；合法空名单通过明确的 items: [] 表达。
    dashboard.value = result
    for (const student of dashboard.value.items) {
      // C1：学生重新提交后服务端会清空 feedback；未改动的草稿必须跟着回到未批改状态。
      if (student.submissionId && !feedbackDirty[student.submissionId]) {
        feedbackDrafts[student.submissionId] = {
          score: student.score == null ? '' : String(student.score),
          feedbackText: student.feedbackText ?? '',
        }
      }
    }
  } catch (error) {
    errorMessage.value = describeError(error, '看板暂时无法读取。')
  } finally {
    loading.value = false
  }
}

async function copyText(text: string, success: string): Promise<void> {
  try {
    await copyToClipboard(text)
    notice.value = success
  } catch {
    notice.value = '剪贴板不可用，请手动选择并复制。'
  }
  window.setTimeout(() => { notice.value = '' }, 2600)
}

async function changeState(state: 'published' | 'closed'): Promise<void> {
  if (!dashboard.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await api.setAssignmentState(props.assignmentId, state)
    notice.value = state === 'closed' ? '已停止收取。' : '作业已发布。'
    await load()
  } catch (error) {
    errorMessage.value = describeError(error, '状态未能更新。')
  } finally {
    saving.value = false
  }
}

async function toggleCompletion(studentId: string, completed: boolean): Promise<void> {
  errorMessage.value = ''
  await exclusive(`completion:${studentId}`, async () => {
    try {
      await api.setCompletion(props.assignmentId, studentId, completed)
      await load()
    } catch (error) {
      errorMessage.value = describeError(error, '登记状态未能更新。')
    }
  })
}

async function saveFeedback(submissionId: string): Promise<void> {
  const key = `feedback:${submissionId}`
  if (isBusy(key)) return
  const draft = feedbackDrafts[submissionId]
  if (!draft) return
  const score = draft.score.trim() ? Number(draft.score) : undefined
  if (score !== undefined && (!Number.isFinite(score) || score < 0 || score > 100)) {
    errorMessage.value = '分数应在 0 到 100 之间。'
    return
  }
  errorMessage.value = ''
  await exclusive(key, async () => {
    try {
      await api.feedback(submissionId, { score, feedbackText: draft.feedbackText.trim() })
      feedbackDirty[submissionId] = false
      feedbackSaved.value = submissionId
      await load()
      window.setTimeout(() => { feedbackSaved.value = null }, 2400)
    } catch (error) {
      errorMessage.value = describeError(error, '反馈未能保存。')
    }
  })
}

async function exportFile(format: 'csv' | 'zip' | 'docx' | 'xlsx', submissionId?: string): Promise<void> {
  errorMessage.value = ''
  await exclusive(`export:${format}:${submissionId ?? ''}`, async () => {
    try {
      await api.exportFile(props.assignmentId, format, submissionId)
    } catch (error) {
      errorMessage.value = describeError(error, '导出暂时失败，请稍后重试；若持续失败，请联系教师。')
    }
  })
}

function downloadSubmissionFile(submissionId: string | null, fileId: string): void {
  errorMessage.value = ''
  if (!submissionId) return
  void exclusive(`download:${submissionId}:${fileId}`, () =>
    api.downloadSubmissionFile(props.assignmentId, submissionId, fileId).catch((error) => {
      errorMessage.value = describeError(error, '附件暂时无法下载，请稍后重试；若持续失败，请联系教师。')
    }))
}

function versionState(submissionId: string | null): VersionState | undefined {
  return submissionId ? versionStates[submissionId] : undefined
}

function versionItems(submissionId: string | null): SubmissionVersion[] {
  return versionState(submissionId)?.items ?? []
}

function versionActionLabel(submissionId: string | null): string {
  const state = versionState(submissionId)
  if (!state) return '查看历次修改'
  if (state.loading) return '正在读取…'
  return state.items.length ? '刷新历次修改' : '查看历次修改'
}

async function loadVersions(submissionId: string | null): Promise<void> {
  if (!submissionId) return
  if (!versionStates[submissionId]) {
    versionStates[submissionId] = { items: [], loading: false, error: '', empty: '' }
  }
  const state = versionStates[submissionId]
  if (state.loading) return
  state.loading = true
  state.error = ''
  state.empty = ''
  try {
    const result = await api.listSubmissionVersions(submissionId)
    state.items = result.items
    state.empty = result.items.length ? '' : '这项目前只有一版提交；重新提交后才会出现历次修改。'
  } catch (error) {
    state.error = describeError(error, '历次修改暂时无法读取。')
  } finally {
    state.loading = false
  }
}

function submittedAt(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

onMounted(load)
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand-lockup"><span class="brand-mark">收</span><span>班级工作台</span></RouterLink>
      <nav aria-label="主导航"><RouterLink class="nav-link router-link-active" to="/">作业</RouterLink><RouterLink class="nav-link" to="/class/setup">班级名单</RouterLink></nav>
      <RouterLink class="topbar-action" to="/assignments/new">发布作业</RouterLink>
    </header>

    <main class="page-wrap">
      <p><RouterLink class="button quiet" to="/">‹ 返回作业列表</RouterLink></p>
      <div v-if="loading && !dashboard" class="surface empty-state" aria-live="polite">正在读取提交情况…</div>
      <div v-else-if="errorMessage && !dashboard" class="surface empty-state" role="alert"><h2>看板暂不可用</h2><p>{{ errorMessage }}</p><RouterLink class="button primary" to="/class/setup">检查管理密钥</RouterLink></div>
      <template v-else-if="dashboard">
        <div class="dashboard-head">
          <div class="page-heading" style="margin:0"><div><p class="eyebrow">{{ typeName[dashboard.assignment.type] }} · 教师看板</p><h1>{{ dashboard.assignment.title }}</h1><p>{{ dashboard.assignment.dueAt ? `截止 ${new Date(dashboard.assignment.dueAt).toLocaleString('zh-CN')}` : '未设置截止时间' }}</p></div></div>
          <span class="status-pill" :class="dashboard.assignment.state">{{ dashboard.assignment.state === 'published' ? '收取中' : dashboard.assignment.state === 'draft' ? '草稿' : '已结束' }}</span>
        </div>
        <p v-if="dashboard.assignment.state !== 'published'" class="field-note" role="status">{{ dashboard.assignment.state === 'draft' ? '草稿状态：学生还打不开分享链接，确认无误后点「发布」。' : '已停止收取：不再接受新提交，仍可查看与批改已有提交。' }}</p>

        <section class="stats-grid" aria-label="提交统计">
          <div class="surface stat-block"><span class="stat-value">{{ dashboard.summary.expected }}</span><span class="stat-label">应完成</span></div>
          <div class="surface stat-block accent"><span class="stat-value">{{ dashboard.summary.submitted }}</span><span class="stat-label">已完成</span></div>
          <div class="surface stat-block"><span class="stat-value">{{ dashboard.summary.missing }}</span><span class="stat-label">未完成</span></div>
          <div class="surface stat-block"><span class="stat-value">{{ dashboard.summary.late }}</span><span class="stat-label">迟交</span></div>
        </section>

        <section class="surface panel" style="max-width:none; padding:17px 19px">
          <div class="dashboard-toolbar">
            <div class="copy-field"><input :value="dashboard.assignment.shareUrl" readonly aria-label="学生分享链接" /><button class="button secondary" type="button" @click="copyText(dashboard.assignment.shareUrl, '分享链接已复制。')">复制链接</button></div>
            <button class="button secondary" type="button" @click="copyText(dashboard.missingMentionText || '全部完成', '未完成名单已复制。')">复制未完成名单</button>
            <button v-if="dashboard.assignment.type === 'online' || dashboard.assignment.type === 'leave'" class="button secondary" type="button" :disabled="isBusy('export:zip:')" @click="exportFile('zip')">{{ isBusy('export:zip:') ? '正在导出…' : '导出提交文件 ZIP' }}</button>
            <button v-if="dashboard.assignment.type === 'form'" class="button primary" type="button" :disabled="isBusy('export:xlsx:')" @click="exportFile('xlsx')">{{ isBusy('export:xlsx:') ? '正在导出…' : '导出 Excel 表格' }}</button>
            <button class="button secondary" type="button" :disabled="isBusy('export:csv:')" @click="exportFile('csv')">{{ isBusy('export:csv:') ? '正在导出…' : '导出名单 CSV' }}</button>
            <button v-if="dashboard.assignment.state === 'draft'" class="button primary" type="button" :disabled="saving" @click="changeState('published')">发布</button>
            <button v-if="dashboard.assignment.state === 'published'" class="button danger" type="button" :disabled="saving" @click="changeState('closed')">停止收取</button>
          </div>
        </section>

        <div class="summary-strip"><strong>还没完成：</strong><span v-if="dashboard.missingMentionText" class="count-chip">{{ dashboard.missingMentionText }}</span><span v-else class="count-chip">全部完成</span></div>

        <!-- 表单作业：数据文件里的全部收集记录 -->
        <section v-if="dashboard.assignment.type === 'form' && dashboard.form" class="surface form-records-wrap" style="overflow:auto" aria-label="表单收集记录">
          <div class="section-heading" style="margin-bottom:6px"><div><p class="eyebrow">已收集 {{ dashboard.records?.length ?? 0 }} 行</p><h2>收集记录</h2></div></div>
          <table class="student-table form-records">
            <thead><tr><th>学号</th><th>姓名</th><th v-for="field in dashboard.form.fields" :key="field.name">{{ field.name }}</th></tr></thead>
            <tbody>
              <tr v-if="!dashboard.records?.length"><td :colspan="dashboard.form.fields.length + 2" class="muted-copy">还没有人填写。</td></tr>
              <tr v-for="record in dashboard.records" :key="record.studentNo">
                <td>{{ record.studentNo }}</td>
                <td><strong>{{ record.name }}</strong></td>
                <td v-for="field in dashboard.form!.fields" :key="field.name">{{ record.values[field.name] || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <p v-if="notice" class="form-message success-text" role="status">{{ notice }}</p>
        <p v-if="errorMessage" class="form-message error-text" role="alert">{{ errorMessage }}</p>
        <p v-if="!dashboard.items.length" class="field-note" role="status">这项作业还没有目标学生；请到「班级名单」导入名单后重新发布，已有统计与导出暂时没有内容。</p>

        <section class="surface student-table-wrap" style="overflow:auto">
          <table class="student-table">
            <thead><tr><th>学生</th><th>状态</th><th>提交时间</th><th v-if="dashboard.assignment.type === 'online' || dashboard.assignment.type === 'leave'">提交内容</th></tr></thead>
            <tbody>
              <tr v-for="student in dashboard.items" :key="student.studentId">
                <td><strong>{{ student.name }}</strong><span class="student-number">　{{ student.studentNo }}</span></td>
                <td>
                  <label v-if="dashboard.assignment.type === 'offline'" class="check-option student-done"><input type="checkbox" :checked="student.status === 'completed'" :disabled="isBusy('completion:' + student.studentId)" @change="toggleCompletion(student.studentId, ($event.target as HTMLInputElement).checked)" /><span>{{ student.status === 'completed' ? '已完成' : '待登记' }}</span></label>
                  <span v-else class="status-pill" :class="student.status === 'missing' ? '' : 'published'">{{ statusName[student.status] ?? student.status }}</span>
                </td>
                <td>{{ submittedAt(student.submittedAt) }}</td>
                <td v-if="dashboard.assignment.type === 'online' || dashboard.assignment.type === 'leave'">
                  <form v-if="dashboard.assignment.type === 'online' && student.submissionId && feedbackDrafts[student.submissionId]" class="feedback-form" @submit.prevent="saveFeedback(student.submissionId)">
                    <input v-model="feedbackDrafts[student.submissionId].score" type="number" min="0" max="100" step="1" aria-label="分数" placeholder="分" @input="feedbackDirty[student.submissionId] = true" />
                    <input v-model="feedbackDrafts[student.submissionId].feedbackText" maxlength="5000" aria-label="教师反馈" placeholder="写反馈" @input="feedbackDirty[student.submissionId] = true" />
                    <button class="button secondary" type="submit" :disabled="isBusy('feedback:' + student.submissionId)">{{ feedbackSaved === student.submissionId ? '已保存' : '保存反馈' }}</button>
                  </form>
                  <div v-else-if="dashboard.assignment.type === 'online' && !student.submissionId" class="muted-copy">尚未提交</div>
                  <p v-if="dashboard.assignment.type === 'online' && student.submissionId && student.score == null && !student.feedbackText" class="field-note">尚未批改；填写分数或反馈后保存即可。</p>
                  <details v-if="student.submissionId && (student.textContent || student.files.length)" class="submission-detail">
                    <summary>查看提交内容</summary>
                    <pre v-if="student.textContent" class="submission-text">{{ student.textContent }}</pre>
                    <p v-if="!student.files.length" class="muted-copy">当前提交版本没有附件。</p>
                    <ul v-if="student.files.length" class="submission-files">
                      <li v-for="file in student.files" :key="file.id">
                        <button class="button quiet" type="button" :disabled="isBusy('download:' + student.submissionId + ':' + file.id)" @click="downloadSubmissionFile(student.submissionId, file.id)">{{ isBusy('download:' + student.submissionId + ':' + file.id) ? '正在下载…' : file.originalName }}</button>
                        <small>{{ (file.sizeBytes / 1024).toFixed(1) }} KB<template v-if="file.slipDate"> · 请假日期 {{ file.slipDate.slice(0, 10) }}</template></small>
                      </li>
                    </ul>
                  </details>
                  <div v-if="student.submissionId" class="version-history">
                    <button class="button quiet" type="button" :disabled="versionState(student.submissionId)?.loading" @click="loadVersions(student.submissionId)">{{ versionActionLabel(student.submissionId) }}</button>
                    <p v-if="versionState(student.submissionId)?.error" class="field-message error-text" role="alert">{{ versionState(student.submissionId)?.error }}</p>
                    <p v-else-if="versionState(student.submissionId)?.empty" class="field-message field-note" role="status">{{ versionState(student.submissionId)?.empty }}</p>
                    <div v-for="version in versionItems(student.submissionId)" :key="version.version" class="version-item">
                      <p class="version-label">第 {{ version.version }} 版 · {{ new Date(version.submittedAt).toLocaleString('zh-CN') }}</p>
                      <pre v-if="version.textContent" class="submission-text">{{ version.textContent }}</pre>
                      <ul v-if="version.files.length" class="submission-files">
                        <li v-for="file in version.files" :key="file.id">
                          <button class="button quiet" type="button" :disabled="isBusy('download:' + student.submissionId + ':' + file.id)" @click="downloadSubmissionFile(student.submissionId, file.id)">{{ isBusy('download:' + student.submissionId + ':' + file.id) ? '正在下载…' : file.originalName }}</button>
                          <small>{{ (file.sizeBytes / 1024).toFixed(1) }} KB<template v-if="file.slipDate"> · 请假日期 {{ file.slipDate.slice(0, 10) }}</template></small>
                        </li>
                      </ul>
                    </div>
                  </div>
                  <button v-if="dashboard.assignment.type === 'online' && student.submissionId" class="button quiet" type="button" :disabled="isBusy('export:docx:' + student.submissionId)" @click="exportFile('docx', student.submissionId)">{{ isBusy('export:docx:' + student.submissionId) ? '正在导出…' : '导出 Word' }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="mobile-student-list" aria-label="学生状态">
          <article v-for="student in dashboard.items" :key="student.studentId" class="mobile-student-row">
            <div><strong>{{ student.name }}</strong><span class="student-no">{{ student.studentNo }}　{{ submittedAt(student.submittedAt) }}</span></div>
            <label v-if="dashboard.assignment.type === 'offline'" class="check-option"><input type="checkbox" :checked="student.status === 'completed'" :disabled="isBusy('completion:' + student.studentId)" @change="toggleCompletion(student.studentId, ($event.target as HTMLInputElement).checked)" /><span>{{ student.status === 'completed' ? '已完成' : '待登记' }}</span></label>
            <span v-else class="status-pill" :class="student.status === 'missing' ? '' : 'published'">{{ statusName[student.status] ?? student.status }}</span>
            <details v-if="student.submissionId && (student.textContent || student.files.length)" class="submission-detail">
              <summary>查看提交内容</summary>
              <pre v-if="student.textContent" class="submission-text">{{ student.textContent }}</pre>
              <p v-if="!student.files.length" class="muted-copy">当前提交版本没有附件。</p>
              <ul v-if="student.files.length" class="submission-files">
                <li v-for="file in student.files" :key="file.id">
                  <button class="button quiet" type="button" :disabled="isBusy('download:' + student.submissionId + ':' + file.id)" @click="downloadSubmissionFile(student.submissionId, file.id)">{{ isBusy('download:' + student.submissionId + ':' + file.id) ? '正在下载…' : file.originalName }}</button>
                  <small>{{ (file.sizeBytes / 1024).toFixed(1) }} KB<template v-if="file.slipDate"> · 请假日期 {{ file.slipDate.slice(0, 10) }}</template></small>
                </li>
              </ul>
            </details>
            <div v-if="student.submissionId" class="version-history">
              <button class="button quiet" type="button" :disabled="versionState(student.submissionId)?.loading" @click="loadVersions(student.submissionId)">{{ versionActionLabel(student.submissionId) }}</button>
              <p v-if="versionState(student.submissionId)?.error" class="field-message error-text" role="alert">{{ versionState(student.submissionId)?.error }}</p>
              <p v-else-if="versionState(student.submissionId)?.empty" class="field-message field-note" role="status">{{ versionState(student.submissionId)?.empty }}</p>
              <div v-for="version in versionItems(student.submissionId)" :key="version.version" class="version-item">
                <p class="version-label">第 {{ version.version }} 版 · {{ new Date(version.submittedAt).toLocaleString('zh-CN') }}</p>
                <pre v-if="version.textContent" class="submission-text">{{ version.textContent }}</pre>
                <ul v-if="version.files.length" class="submission-files">
                  <li v-for="file in version.files" :key="file.id">
                    <button class="button quiet" type="button" :disabled="isBusy('download:' + student.submissionId + ':' + file.id)" @click="downloadSubmissionFile(student.submissionId, file.id)">{{ isBusy('download:' + student.submissionId + ':' + file.id) ? '正在下载…' : file.originalName }}</button>
                    <small>{{ (file.sizeBytes / 1024).toFixed(1) }} KB<template v-if="file.slipDate"> · 请假日期 {{ file.slipDate.slice(0, 10) }}</template></small>
                  </li>
                </ul>
              </div>
            </div>
            <form v-if="dashboard.assignment.type === 'online' && student.submissionId && feedbackDrafts[student.submissionId]" class="feedback-form mobile-feedback" @submit.prevent="saveFeedback(student.submissionId)">
              <input v-model="feedbackDrafts[student.submissionId].score" type="number" min="0" max="100" step="1" aria-label="分数" placeholder="分" @input="feedbackDirty[student.submissionId] = true" />
              <input v-model="feedbackDrafts[student.submissionId].feedbackText" maxlength="5000" aria-label="教师反馈" placeholder="写反馈" @input="feedbackDirty[student.submissionId] = true" />
              <button class="button secondary" type="submit" :disabled="isBusy('feedback:' + student.submissionId)">{{ feedbackSaved === student.submissionId ? '已保存' : '保存反馈' }}</button>
            </form>
            <p v-if="dashboard.assignment.type === 'online' && student.submissionId && student.score == null && !student.feedbackText" class="field-note">尚未批改；填写分数或反馈后保存即可。</p>
            <button v-if="dashboard.assignment.type === 'online' && student.submissionId" class="button quiet mobile-feedback" type="button" :disabled="isBusy('export:docx:' + student.submissionId)" @click="exportFile('docx', student.submissionId)">{{ isBusy('export:docx:' + student.submissionId) ? '正在导出…' : '导出 Word' }}</button>
          </article>
        </section>
      </template>
    </main>
  </div>
</template>
