<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type AssignmentListItem } from '../api/client'
import { describeError } from '../api/error-messages'

const router = useRouter()

const assignments = ref<AssignmentListItem[]>([])
const loading = ref(true)
const errorMessage = ref('')
const notice = ref('')

const totals = computed(() => ({
  assignments: assignments.value.length,
  published: assignments.value.filter((item) => item.state === 'published').length,
  expected: assignments.value.reduce((sum, item) => sum + item.expectedCount, 0),
  outstanding: assignments.value.reduce((sum, item) => sum + item.missingCount, 0),
}))

const typeName: Record<AssignmentListItem['type'], string> = {
  online: '线上作业', offline: '线下登记', checkin: '签到', relay: '接龙',
}

function dueText(value: string | null): string {
  return value ? `截止 ${new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '未设置截止时间'
}

/** C1：draft / published / closed 三态都要有名称与一句可见解释。 */
function stateLabel(state: AssignmentListItem['state']): string {
  if (state === 'published') return '收取中'
  if (state === 'draft') return '草稿'
  return '已结束'
}

function stateHint(state: AssignmentListItem['state']): string {
  if (state === 'draft') return '草稿，学生还不能打开'
  if (state === 'closed') return '已停止收取，仍可查看提交情况'
  return ''
}

function subtitle(item: AssignmentListItem): string {
  const hint = stateHint(item.state)
  return `${typeName[item.type]}　${dueText(item.dueAt)}${hint ? `　${hint}` : ''}`
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.listAssignments()
    assignments.value = result.items
  } catch (error) {
    errorMessage.value = describeError(error, '作业列表暂时无法读取。')
  } finally {
    loading.value = false
  }
}

function openAssignment(id: string): void {
  void router.push(`/assignments/${id}`)
}

async function copyShareLink(event: MouseEvent, url: string): Promise<void> {
  event.preventDefault()
  event.stopPropagation()
  try {
    await navigator.clipboard.writeText(url)
    notice.value = '分享链接已复制。'
  } catch {
    notice.value = '当前浏览器未开放剪贴板，请打开作业后复制链接。'
  }
  window.setTimeout(() => { notice.value = '' }, 2600)
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
      <div class="page-heading">
        <div><p class="eyebrow">班级 · 作业收发</p><h1>把今天的作业，收整齐。</h1><p>发布、查看进度，剩下的交给作业链接。</p></div>
        <RouterLink class="button primary" to="/assignments/new">＋ 发布作业</RouterLink>
      </div>

      <section class="stats-grid" aria-label="作业概览">
        <div class="surface stat-block"><span class="stat-value">{{ totals.assignments }}</span><span class="stat-label">作业总数</span></div>
        <div class="surface stat-block accent"><span class="stat-value">{{ totals.published }}</span><span class="stat-label">正在收取</span></div>
        <div class="surface stat-block"><span class="stat-value">{{ totals.expected }}</span><span class="stat-label">应完成人次</span></div>
        <div class="surface stat-block"><span class="stat-value">{{ totals.outstanding }}</span><span class="stat-label">尚未完成</span></div>
      </section>

      <div class="section-heading"><div><p class="eyebrow">最近发布</p><h2>作业列表</h2></div><RouterLink class="button secondary" to="/class/setup">名单与分组</RouterLink></div>
      <div v-if="loading" class="surface empty-state" aria-live="polite">正在读取作业…</div>
      <div v-else-if="errorMessage" class="surface empty-state" role="alert">
        <h2>工作台暂时无法读取</h2><p>{{ errorMessage }}</p><button class="button secondary" type="button" @click="load">重新加载作业</button><RouterLink class="button primary" to="/class/setup">检查班级设置</RouterLink>
      </div>
      <div v-else-if="!assignments.length" class="surface empty-state">
        <p class="eyebrow">从这里开始</p><h2>还没有发布作业</h2><p>可以先检查或建立班级名单，再发布第一项作业；学生打开分享链接即可提交或登记。</p><div class="button-row" style="justify-content:center"><RouterLink class="button secondary" to="/class/setup">检查班级名单</RouterLink><RouterLink class="button primary" to="/assignments/new">发布作业</RouterLink></div>
      </div>
      <div v-else class="assignment-list">
        <div v-for="assignment in assignments" :key="assignment.id" class="assignment-row" role="link" tabindex="0" @click="openAssignment(assignment.id)" @keydown.enter="openAssignment(assignment.id)">
          <div>
            <span class="assignment-title"><span class="type-mark" :class="assignment.type" />{{ assignment.title }}</span>
            <span class="assignment-subtitle">{{ subtitle(assignment) }}</span>
          </div>
          <span class="status-pill" :class="assignment.state">{{ stateLabel(assignment.state) }}</span>
          <span class="row-metric"><strong>{{ assignment.submittedCount }} / {{ assignment.expectedCount }}</strong>已完成</span>
          <span class="row-metric"><strong>{{ assignment.missingCount }}</strong>未完成</span>
          <span class="row-arrow" aria-hidden="true">›</span>
          <span class="mobile-summary">{{ assignment.submittedCount }}/{{ assignment.expectedCount }} 完成</span>
          <button v-if="assignment.state === 'published'" class="icon-button" type="button" :aria-label="`复制${assignment.title}分享链接`" @click.stop="copyShareLink($event, assignment.shareUrl)">↗</button>
        </div>
      </div>
      <p v-if="notice" class="form-message success-text" role="status" style="margin-top:12px">{{ notice }}</p>
    </main>
  </div>
</template>
