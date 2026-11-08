<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type AssignmentDashboard } from '../api/client'

const props = defineProps<{ assignmentId: string }>()
const router = useRouter()
const dashboard = ref<AssignmentDashboard | null>(null)
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const notice = ref('')
const feedbackDrafts = reactive<Record<string, { score: string; feedbackText: string }>>({})
const feedbackSaved = ref<string | null>(null)
const typeName: Record<string, string> = { online: '线上作业', offline: '线下完成', checkin: '签到', relay: '接龙' }
const statusName: Record<string, string> = { missing: '未完成', submitted: '已提交', late: '迟交', completed: '已完成', checked_in: '已签到', joined: '已接龙' }

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    dashboard.value = await api.dashboard(props.assignmentId)
    for (const student of dashboard.value.items) {
      if (student.submissionId && !feedbackDrafts[student.submissionId]) {
        feedbackDrafts[student.submissionId] = {
          score: student.score == null ? '' : String(student.score),
          feedbackText: student.feedbackText ?? '',
        }
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '看板暂时无法读取。'
  } finally {
    loading.value = false
  }
}

async function copyText(text: string, success: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
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
    errorMessage.value = error instanceof Error ? error.message : '状态未能更新。'
  } finally {
    saving.value = false
  }
}

async function toggleCompletion(studentId: string, completed: boolean): Promise<void> {
  errorMessage.value = ''
  try {
    await api.setCompletion(props.assignmentId, studentId, completed)
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登记状态未能更新。'
  }
}

async function saveFeedback(submissionId: string): Promise<void> {
  const draft = feedbackDrafts[submissionId]
  if (!draft) return
  const score = draft.score.trim() ? Number(draft.score) : undefined
  if (score !== undefined && (!Number.isFinite(score) || score < 0 || score > 100)) {
    errorMessage.value = '分数应在 0 到 100 之间。'
    return
  }
  errorMessage.value = ''
  try {
    await api.feedback(submissionId, { score, feedbackText: draft.feedbackText.trim() })
    feedbackSaved.value = submissionId
    await load()
    window.setTimeout(() => { feedbackSaved.value = null }, 2400)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '反馈未能保存。'
  }
}

async function exportFile(format: 'csv' | 'zip' | 'docx', submissionId?: string): Promise<void> {
  errorMessage.value = ''
  try {
    await api.exportFile(props.assignmentId, format, submissionId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '导出失败，请稍后重试。'
  }
}

function downloadSubmissionFile(submissionId: string | null, fileId: string): void {
  errorMessage.value = ''
  if (!submissionId) return
  void api.downloadSubmissionFile(props.assignmentId, submissionId, fileId).catch((error) => {
    errorMessage.value = error instanceof Error ? error.message : '附件暂时无法下载。'
  })
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
            <button v-if="dashboard.assignment.type === 'online'" class="button secondary" type="button" @click="exportFile('zip')">导出提交文件 ZIP</button>
            <button class="button secondary" type="button" @click="exportFile('csv')">导出名单 CSV</button>
            <button v-if="dashboard.assignment.state === 'draft'" class="button primary" type="button" :disabled="saving" @click="changeState('published')">发布</button>
            <button v-if="dashboard.assignment.state === 'published'" class="button danger" type="button" :disabled="saving" @click="changeState('closed')">停止收取</button>
          </div>
        </section>

        <div class="summary-strip"><strong>还没完成：</strong><span v-if="dashboard.missingMentionText" class="count-chip">{{ dashboard.missingMentionText }}</span><span v-else class="count-chip">全部完成</span></div>
        <p v-if="notice" class="form-message success-text" role="status">{{ notice }}</p>
        <p v-if="errorMessage" class="form-message error-text" role="alert">{{ errorMessage }}</p>

        <section class="surface student-table-wrap" style="overflow:auto">
          <table class="student-table">
            <thead><tr><th>学生</th><th>状态</th><th>提交时间</th><th v-if="dashboard.assignment.type === 'online'">分数与反馈</th></tr></thead>
            <tbody>
              <tr v-for="student in dashboard.items" :key="student.studentId">
                <td><strong>{{ student.name }}</strong><span class="student-number">　{{ student.studentNo }}</span></td>
                <td>
                  <label v-if="dashboard.assignment.type === 'offline'" class="check-option student-done"><input type="checkbox" :checked="student.status === 'completed'" @change="toggleCompletion(student.studentId, ($event.target as HTMLInputElement).checked)" /><span>{{ student.status === 'completed' ? '已完成' : '待登记' }}</span></label>
                  <span v-else class="status-pill" :class="student.status === 'missing' ? '' : 'published'">{{ statusName[student.status] ?? student.status }}</span>
                </td>
                <td>{{ submittedAt(student.submittedAt) }}</td>
                <td v-if="dashboard.assignment.type === 'online'">
                  <form v-if="student.submissionId" class="feedback-form" @submit.prevent="saveFeedback(student.submissionId)">
                    <input v-model="feedbackDrafts[student.submissionId].score" type="number" min="0" max="100" step="1" aria-label="分数" placeholder="分" />
                    <input v-model="feedbackDrafts[student.submissionId].feedbackText" maxlength="5000" aria-label="教师反馈" placeholder="写反馈" />
                    <button class="button secondary" type="submit">{{ feedbackSaved === student.submissionId ? '已保存' : '保存反馈' }}</button>
                  </form>
                  <div v-else class="muted-copy">尚未提交</div>
                  <details v-if="student.submissionId && (student.textContent || student.files.length)" class="submission-detail">
                    <summary>查看提交内容</summary>
                    <pre v-if="student.textContent" class="submission-text">{{ student.textContent }}</pre>
                    <ul v-if="student.files.length" class="submission-files">
                      <li v-for="file in student.files" :key="file.id">
                        <button class="button quiet" type="button" @click="downloadSubmissionFile(student.submissionId, file.id)">{{ file.originalName }}</button>
                        <small>{{ (file.sizeBytes / 1024).toFixed(1) }} KB</small>
                      </li>
                    </ul>
                  </details>
                  <button v-if="student.submissionId" class="button quiet" type="button" @click="exportFile('docx', student.submissionId)">导出 Word</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="mobile-student-list" aria-label="学生状态">
          <article v-for="student in dashboard.items" :key="student.studentId" class="mobile-student-row">
            <div><strong>{{ student.name }}</strong><span class="student-no">{{ student.studentNo }}　{{ submittedAt(student.submittedAt) }}</span></div>
            <label v-if="dashboard.assignment.type === 'offline'" class="check-option"><input type="checkbox" :checked="student.status === 'completed'" @change="toggleCompletion(student.studentId, ($event.target as HTMLInputElement).checked)" /><span>{{ student.status === 'completed' ? '已完成' : '待登记' }}</span></label>
            <span v-else class="status-pill" :class="student.status === 'missing' ? '' : 'published'">{{ statusName[student.status] ?? student.status }}</span>
            <details v-if="student.submissionId && (student.textContent || student.files.length)" class="submission-detail">
              <summary>查看提交内容</summary>
              <pre v-if="student.textContent" class="submission-text">{{ student.textContent }}</pre>
              <ul v-if="student.files.length" class="submission-files">
                <li v-for="file in student.files" :key="file.id">
                  <button class="button quiet" type="button" @click="downloadSubmissionFile(student.submissionId, file.id)">{{ file.originalName }}</button>
                  <small>{{ (file.sizeBytes / 1024).toFixed(1) }} KB</small>
                </li>
              </ul>
            </details>
            <form v-if="dashboard.assignment.type === 'online' && student.submissionId" class="feedback-form mobile-feedback" @submit.prevent="saveFeedback(student.submissionId)">
              <input v-model="feedbackDrafts[student.submissionId].score" type="number" min="0" max="100" step="1" aria-label="分数" placeholder="分" />
              <input v-model="feedbackDrafts[student.submissionId].feedbackText" maxlength="5000" aria-label="教师反馈" placeholder="写反馈" />
              <button class="button secondary" type="submit">{{ feedbackSaved === student.submissionId ? '已保存' : '保存反馈' }}</button>
            </form>
            <button v-if="dashboard.assignment.type === 'online' && student.submissionId" class="button quiet mobile-feedback" type="button" @click="exportFile('docx', student.submissionId)">导出 Word</button>
          </article>
        </section>
      </template>
    </main>
  </div>
</template>
