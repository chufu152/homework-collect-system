<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiRequestError, api, type PublicAssignment } from '../api/client'

const props = defineProps<{ shareCode: string }>()
const assignment = ref<PublicAssignment | null>(null)
const loading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const confirmation = ref('')
const studentNo = ref('')
const studentName = ref('')
const textContent = ref('')
const selectedFiles = ref<File[]>([])
const relayContent = ref('')
const relayEntries = ref<Array<{ position: number; displayName: string; content: string }>>([])
const receiptCode = ref('')
const showForm = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)
const latestVersion = ref(0)

const fileAccept = computed(() => assignment.value?.allowedFileTypes.map((type) => `.${type}`).join(',') ?? '')

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    assignment.value = await api.getPublicAssignment(props.shareCode)
    if (assignment.value.type === 'relay') await refreshRelay()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无法读取这项作业。'
  } finally {
    loading.value = false
  }
}

async function refreshRelay(): Promise<void> {
  const result = await api.getRelayEntries(props.shareCode)
  relayEntries.value = result.items
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  selectedFiles.value = Array.from(target.files ?? [])
}

async function checkIn(): Promise<void> {
  await perform(async () => {
    const result = await api.checkIn(props.shareCode, {
      studentNo: studentNo.value.trim() || undefined,
      studentName: studentName.value.trim() || undefined,
    })
    confirmation.value = result.alreadyCheckedIn
      ? `${result.displayName} 已签到，记录时间 ${new Date(result.checkedInAt).toLocaleString('zh-CN')}`
      : `签到成功：${result.displayName}`
  })
}

async function joinRelay(): Promise<void> {
  await perform(async () => {
    const result = await api.joinRelay(props.shareCode, {
      studentNo: studentNo.value.trim() || undefined,
      studentName: studentName.value.trim() || undefined,
      content: relayContent.value.trim() || undefined,
    })
    confirmation.value = `接龙成功，你排在第 ${result.position} 位。`
    await refreshRelay()
  })
}

async function submitOnline(): Promise<void> {
  if (!assignment.value) return
  const maxBytes = assignment.value.maxFileSizeMB * 1024 * 1024
  if (selectedFiles.value.some((file) => file.size > maxBytes)) {
    errorMessage.value = `每个文件不能超过 ${assignment.value.maxFileSizeMB} MB。`
    return
  }
  if (selectedFiles.value.length > assignment.value.maxFileCount) {
    errorMessage.value = `最多选择 ${assignment.value.maxFileCount} 个文件。`
    return
  }
  await perform(async () => {
    const result = await api.submitAssignment(props.shareCode, {
      studentNo: studentNo.value.trim(),
      studentName: studentName.value.trim(),
      textContent: textContent.value,
      files: selectedFiles.value,
    })
    receiptCode.value = result.receiptCode
    latestVersion.value = result.version
    showForm.value = false
    confirmation.value = '提交成功，已为你生成回执。'
    selectedFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
  })
}

function resubmit(): void {
  showForm.value = true
  confirmation.value = ''
  errorMessage.value = ''
}

async function perform(action: () => Promise<void>): Promise<void> {
  sending.value = true
  errorMessage.value = ''
  confirmation.value = ''
  try {
    await action()
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message
      : error instanceof Error ? error.message : '操作未完成，请检查信息后重试。'
  } finally {
    sending.value = false
  }
}

function dueLabel(value: string | null): string {
  if (!value) return '未设置截止时间'
  return `截止 ${new Date(value).toLocaleString('zh-CN')}`
}

onMounted(load)
</script>

<template>
  <main class="public-frame">
    <header class="public-brand">
      <RouterLink to="/" class="brand-mark" aria-label="返回班级工作台">收</RouterLink>
      <span>班级作业</span>
    </header>

    <section v-if="loading" class="public-panel status-panel" aria-live="polite">正在打开作业…</section>
    <section v-else-if="errorMessage && !assignment" class="public-panel status-panel error-text" role="alert">
      <h1>暂时无法打开</h1>
      <p>{{ errorMessage }}</p>
      <button class="button secondary" type="button" @click="load">重新加载</button>
    </section>

    <template v-else-if="assignment">
      <header class="assignment-heading">
        <p class="eyebrow">{{ assignment.type === 'checkin' ? '班级签到' : assignment.type === 'relay' ? '班级接龙' : assignment.type === 'offline' ? '线下完成登记' : '线上作业' }}</p>
        <h1>{{ assignment.title }}</h1>
        <p class="assignment-meta">{{ dueLabel(assignment.dueAt) }}</p>
        <p v-if="assignment.instructions" class="assignment-instructions">{{ assignment.instructions }}</p>
      </header>

      <section v-if="assignment.type === 'checkin' || assignment.type === 'relay' || assignment.type === 'online'" class="public-panel">
        <form v-if="showForm" @submit.prevent="assignment.type === 'checkin' ? checkIn() : assignment.type === 'relay' ? joinRelay() : submitOnline()">
          <div class="field-row">
            <label>
              <span>学号</span>
              <input v-model="studentNo" aria-label="学号" name="studentNo" autocomplete="off" inputmode="numeric" placeholder="请输入学号" :required="assignment.type === 'online'" />
            </label>
            <label>
              <span>姓名</span>
              <input v-model="studentName" aria-label="姓名" name="studentName" autocomplete="name" placeholder="请输入姓名" :required="assignment.type === 'online'" />
            </label>
          </div>

          <label v-if="assignment.type === 'online' && assignment.submissionMode !== 'file'" class="field-block">
            <span>作业内容</span>
            <textarea v-model="textContent" rows="7" maxlength="100000" placeholder="在这里输入作业内容" :required="assignment.submissionMode === 'text'" />
          </label>

          <label v-if="assignment.type === 'online' && assignment.submissionMode !== 'text'" class="field-block file-field">
            <span>添加附件</span>
            <input ref="fileInput" type="file" :accept="fileAccept" :multiple="assignment.maxFileCount > 1" @change="onFileChange" />
            <small>支持 {{ assignment.allowedFileTypes.join('、') }}，最多 {{ assignment.maxFileCount }} 个，每个不超过 {{ assignment.maxFileSizeMB }} MB</small>
            <ul v-if="selectedFiles.length" class="file-list">
              <li v-for="file in selectedFiles" :key="`${file.name}-${file.size}`">{{ file.name }} <small>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</small></li>
            </ul>
          </label>

          <label v-if="assignment.type === 'relay'" class="field-block">
            <span>接龙内容 <small>选填</small></span>
            <input v-model="relayContent" maxlength="1000" placeholder="例如：我可以参加" />
          </label>

          <p v-if="errorMessage" class="form-message error-text" role="alert">{{ errorMessage }}</p>
          <p v-if="confirmation" class="form-message success-text" role="status">{{ confirmation }}</p>
          <div class="form-actions">
            <button class="button primary" type="submit" :disabled="sending">
              {{ sending ? '正在处理…' : assignment.type === 'checkin' ? '签到' : assignment.type === 'relay' ? '加入接龙' : '提交作业' }}
            </button>
            <RouterLink v-if="receiptCode" class="button secondary" :to="`/receipt/${receiptCode}`">查看提交回执</RouterLink>
          </div>
        </form>
        <div v-else class="receipt-link-block" role="status">
          <p class="success-text">{{ confirmation }}</p>
          <p class="muted-copy">当前为第 {{ latestVersion }} 版。重新提交会保存新版本，并清除老师已给出的反馈。</p>
          <div class="form-actions">
            <RouterLink class="button primary" :to="`/receipt/${receiptCode}`">查看提交回执</RouterLink>
            <button class="button secondary" type="button" @click="resubmit">再次提交 / 修改</button>
          </div>
        </div>
      </section>

      <section v-if="assignment.type === 'relay'" class="relay-section">
        <div class="section-heading">
          <div><p class="eyebrow">接龙名单</p><h2>已经加入的同学</h2></div>
          <span class="count-chip">{{ relayEntries.length }} 人</span>
        </div>
        <ol class="relay-list">
          <li v-for="entry in relayEntries" :key="entry.position">
            <span class="relay-position">{{ String(entry.position).padStart(2, '0') }}</span>
            <span class="relay-person">{{ entry.displayName }}</span>
            <span v-if="entry.content" class="relay-content">{{ entry.content }}</span>
          </li>
          <li v-if="!relayEntries.length" class="empty-row">还没有同学加入，从你开始。</li>
        </ol>
      </section>

      <section v-if="assignment.type === 'offline'" class="public-panel status-panel">
        <h2>线下作业</h2>
        <p>这项作业由老师在线下登记完成情况，请按老师说明参加。</p>
      </section>
    </template>
    <footer class="public-footer">请确认学号和姓名与班级名单一致。</footer>
  </main>
</template>
