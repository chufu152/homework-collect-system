<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api, type FormFieldConfig, type PublicAssignment } from '../api/client'
import { describeError } from '../api/error-messages'

const props = defineProps<{ shareCode: string }>()
const assignment = ref<PublicAssignment | null>(null)
const loading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const confirmation = ref('')
// 学生端只填写姓名；服务端按名单自动匹配学号（重名时由服务端拒绝并提示）。
const studentName = ref('')
const textContent = ref('')
const selectedFiles = ref<File[]>([])
// 假条：每张假条单独选择日期，与 selectedFiles 顺序一一对应。
const slipDates = ref<string[]>([])
const relayContent = ref('')
const relayEntries = ref<Array<{ position: number; displayName: string; content: string }>>([])
const relayError = ref('')
const receiptCode = ref('')
const showForm = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)
const latestVersion = ref(0)
// ---- 表单作业：按字段配置填写，读取已有记录回显，重复提交原地更新 ----
const formValues = ref<Record<string, string>>({})
const formRecordLoaded = ref(false)
// 学号/姓名字段的下拉候选：来自目标名单；输入时收窄匹配。
const formRoster = ref<Array<{ studentNo: string; name: string }>>([])
const openDropdown = ref('')
// 文件字段：新选择的文件与已提交的文件名（回显）。
const formFiles = ref<Record<string, File>>({})
const formFileNames = ref<Record<string, string>>({})

const formFields = computed(() => assignment.value?.form?.fields ?? [])

function resetFormValues(): void {
  formValues.value = Object.fromEntries(formFields.value.map((field) => [field.name, '']))
  formFiles.value = {}
  formFileNames.value = {}
  openDropdown.value = ''
}

const fileAccept = computed(() => (assignment.value?.allowedFileTypes ?? []).map((type) => `.${type}`).join(','))
const maxFileCount = computed(() => Number.isFinite(assignment.value?.maxFileCount) ? assignment.value!.maxFileCount : 5)
const maxFileSizeMB = computed(() => Number.isFinite(assignment.value?.maxFileSizeMB) ? assignment.value!.maxFileSizeMB : 20)

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    assignment.value = await api.getPublicAssignment(props.shareCode)
    if (assignment.value.type === 'relay') await refreshRelay()
    if (assignment.value.type === 'form') {
      resetFormValues()
      // 名单用于学号/姓名字段下拉；读取失败不影响填写（退化为手动输入）。
      api.getFormRoster(props.shareCode).then((roster) => { formRoster.value = roster }).catch(() => undefined)
    }
  } catch (error) {
    errorMessage.value = describeError(error, '无法读取这项作业。')
  } finally {
    loading.value = false
  }
}

async function refreshRelay(): Promise<void> {
  // C1：接龙名单读取失败只影响名单区，不应把整页误报成「作业打不开」，
  // 也不能覆盖刚刚加入接龙的成功回执。
  try {
    const result = await api.getRelayEntries(props.shareCode)
    relayEntries.value = result.items
    relayError.value = ''
  } catch (error) {
    relayError.value = describeError(error, '接龙名单暂时无法读取。')
  }
}

function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const picked = Array.from(target.files ?? [])
  // 假条：多次选择是「追加」而不是「替换」，方便分多次挑选假条；
  // 按 文件名+大小 去重，避免重复添加同一张。选择后清空 input，才能再次选中同一个文件。
  if (assignment.value?.type === 'leave') {
    const existingKeys = new Set(selectedFiles.value.map((file) => `${file.name}-${file.size}`))
    const additions = picked.filter((file) => !existingKeys.has(`${file.name}-${file.size}`))
    selectedFiles.value = [...selectedFiles.value, ...additions].slice(0, maxFileCount.value)
    slipDates.value = selectedFiles.value.map((_, index) => slipDates.value[index] ?? todayISO())
  } else {
    selectedFiles.value = picked
  }
  target.value = ''
}

function removeSlipFile(index: number): void {
  selectedFiles.value = selectedFiles.value.filter((_, current) => current !== index)
  slipDates.value = slipDates.value.filter((_, current) => current !== index)
  if (fileInput.value) fileInput.value.value = ''
}

async function checkIn(): Promise<void> {
  await perform(async () => {
    const result = await api.checkIn(props.shareCode, {
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
      studentName: studentName.value.trim() || undefined,
      content: relayContent.value.trim() || undefined,
    })
    confirmation.value = `接龙成功，你排在第 ${result.position} 位。`
    await refreshRelay()
  }, '你已经加入过这次接龙了；刷新下方名单即可看到自己的位置。')
}

async function submitOnline(): Promise<void> {
  if (!assignment.value) return
  // C1：公开作业的配置字段若缺失，退回接口默认值，不让 NaN 把校验悄悄绕过。
  const maxSizeMB = maxFileSizeMB.value
  const maxCount = maxFileCount.value
  const maxBytes = maxSizeMB * 1024 * 1024
  if (selectedFiles.value.some((file) => file.size > maxBytes)) {
    errorMessage.value = `每个文件不能超过 ${maxSizeMB} MB。`
    return
  }
  if (selectedFiles.value.length > maxCount) {
    errorMessage.value = `最多选择 ${maxCount} 个文件。`
    return
  }
  const isLeave = assignment.value.type === 'leave'
  if (isLeave) {
    if (!selectedFiles.value.length) {
      errorMessage.value = '请至少上传一张假条。'
      return
    }
    if (slipDates.value.length !== selectedFiles.value.length || slipDates.value.some((value) => !value)) {
      errorMessage.value = '请为每张假条选择日期。'
      return
    }
  }
  await perform(async () => {
    const result = await api.submitAssignment(props.shareCode, {
      studentName: studentName.value.trim(),
      textContent: textContent.value,
      files: selectedFiles.value,
      fileDates: isLeave ? [...slipDates.value] : undefined,
    })
    receiptCode.value = result.receiptCode
    latestVersion.value = result.version
    showForm.value = false
    confirmation.value = '提交成功，已为你生成回执。'
    selectedFiles.value = []
    slipDates.value = []
    if (fileInput.value) fileInput.value.value = ''
  })
}

function resubmit(): void {
  showForm.value = true
  confirmation.value = ''
  errorMessage.value = ''
}

/** 表单作业：按姓名读取自己在数据文件里的已有记录并回显。 */
async function loadMyFormRecord(): Promise<void> {
  const name = studentName.value.trim()
  if (!name) {
    errorMessage.value = '请先填写姓名，再读取已有记录。'
    return
  }
  await perform(async () => {
    const result = await api.getFormRecord(props.shareCode, { studentName: name })
    if (result.record) {
      formValues.value = Object.fromEntries(formFields.value.map((field) => [field.name, result.record!.values[field.name] ?? '']))
      formFileNames.value = Object.fromEntries(
        formFields.value.filter((field) => field.type === 'file').map((field) => [field.name, result.record!.values[field.name] ?? '']),
      )
      formFiles.value = {}
      formRecordLoaded.value = true
      confirmation.value = `已读取 ${result.record.name} 的已有填写记录，修改后再次提交即可更新。`
    } else {
      resetFormValues()
      formRecordLoaded.value = true
      confirmation.value = '没有查到你的已有记录，当前是首次填写。'
    }
  })
}

// ---- 表单作业：字段交互 ----

/** 学号/姓名字段的候选：按当前输入收窄（同时匹配另一列做提示）。 */
function dropdownOptions(field: FormFieldConfig): Array<{ studentNo: string; name: string }> {
  const query = String(formValues.value[field.name] ?? '').trim()
  return formRoster.value.filter((row) => {
    if (!query) return true
    const primary = field.type === 'studentNo' ? row.studentNo : row.name
    const other = field.type === 'studentNo' ? row.name : row.studentNo
    return primary.includes(query) || other.includes(query)
  })
}

function toggleDropdown(fieldName: string): void {
  openDropdown.value = openDropdown.value === fieldName ? '' : fieldName
}

/** 顶部姓名与名单唯一精确匹配时，自动填充表单里的学号/姓名字段（名单是权威来源，直接覆盖）。 */
function autoMatchIdentityFields(): void {
  const name = studentName.value.trim()
  if (!name) return
  const matches = formRoster.value.filter((row) => row.name === name)
  if (matches.length !== 1) return
  const row = matches[0]
  for (const field of formFields.value) {
    if (field.type === 'name') formValues.value[field.name] = row.name
    else if (field.type === 'studentNo') formValues.value[field.name] = row.studentNo
  }
}
// 名单是异步加载的：姓名变化或名单到达时都要尝试匹配一次。
watch([studentName, formRoster], autoMatchIdentityFields)

function pickRosterOption(field: FormFieldConfig, option: { studentNo: string; name: string }): void {
  formValues.value[field.name] = field.type === 'studentNo' ? option.studentNo : option.name
  openDropdown.value = ''
}

function closeDropdown(event: Event): void {
  if (!(event.target instanceof Element)) { openDropdown.value = ''; return }
  if (!event.target.closest('.form-cell')) openDropdown.value = ''
}
onMounted(() => document.addEventListener('click', closeDropdown))
onBeforeUnmount(() => document.removeEventListener('click', closeDropdown))

/** 日期字段：把已存的展示值反解析成 date input 需要的 YYYY-MM-DD。 */
function dateInputValue(field: FormFieldConfig): string {
  const raw = String(formValues.value[field.name] ?? '')
  const style = field.dateStyle ?? 'medium'
  if (style === 'long') {
    const match = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    return ''
  }
  if (style === 'short') {
    const match = raw.match(/^(\d{1,2})-(\d{1,2})$/)
    if (match) return `${new Date().getFullYear()}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
    return ''
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

/** 日期选择器选定后按配置格式写回（长/中/短），自定义格式走手填。 */
function onDateChange(field: FormFieldConfig, event: Event): void {
  const value = (event.target as HTMLInputElement).value
  if (!value) { formValues.value[field.name] = ''; return }
  const [year, month, day] = value.split('-')
  const style = field.dateStyle ?? 'medium'
  formValues.value[field.name] = style === 'long'
    ? `${year}年${Number(month)}月${Number(day)}日`
    : style === 'short'
      ? `${Number(month)}-${Number(day)}`
      : value
}

function onFormFileChange(field: FormFieldConfig, event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    formFiles.value[field.name] = file
    formValues.value[field.name] = file.name
  } else {
    delete formFiles.value[field.name]
    formValues.value[field.name] = formFileNames.value[field.name] ?? ''
  }
}

/** 表单作业：首次提交追加一行，重复提交更新自己的行。 */
async function submitFormSheet(): Promise<void> {
  if (!assignment.value) return
  const missing = formFields.value.find((field) =>
    field.required && (field.type === 'file'
      ? !formFiles.value[field.name] && !formFileNames.value[field.name]
      : !String(formValues.value[field.name] ?? '').trim()))
  if (missing) {
    errorMessage.value = `请填写「${missing.name}」。`
    return
  }
  await perform(async () => {
    const files: Array<{ fieldIndex: number; file: File }> = []
    formFields.value.forEach((field, index) => {
      const file = formFiles.value[field.name]
      if (field.type === 'file' && file) files.push({ fieldIndex: index, file })
    })
    const result = await api.submitForm(props.shareCode, {
      studentName: studentName.value.trim(),
      // 数字/日期输入框的 v-model 可能给出 number，统一转成字符串；文件列的值由服务端决定。
      values: Object.fromEntries(formFields.value.map((field) => [field.name, String(formValues.value[field.name] ?? '')])),
      files,
    })
    receiptCode.value = result.receiptCode
    latestVersion.value = result.version
    showForm.value = false
    confirmation.value = result.updated ? '提交成功，你之前填写的记录已更新。' : '提交成功，已记录你的一行数据。'
  })
}

async function perform(action: () => Promise<void>, conflictHint?: string): Promise<void> {
  sending.value = true
  errorMessage.value = ''
  confirmation.value = ''
  try {
    await action()
  } catch (error) {
    const detail = describeError(error, '操作未完成，请检查信息后重试。')
    // 服务端对重名学生的拒绝没有独立错误码，只返回英文提示；这里转成学生可操作的中文引导。
    errorMessage.value = detail.includes('More than one student')
      ? '班级里有多位同名同学，无法自动确认是你的提交，请联系老师处理。'
      : detail
    // C1：409 在接龙场景有明确语义（重复占位），给出可核对的恢复动作。
    if (conflictHint && (error as { status?: number })?.status === 409) errorMessage.value = conflictHint
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
  <main class="public-frame student-wall">
    <header class="student-topbar">
      <span class="paper-tag" aria-hidden="true">收</span>
      <span>班级作业</span>
    </header>

    <section v-if="loading" class="student-paper student-paper-status" aria-live="polite">正在打开作业…</section>
    <section v-else-if="errorMessage && !assignment" class="student-paper student-paper-status" role="alert">
      <h1>暂时无法打开</h1>
      <p>{{ errorMessage }}</p>
      <button class="button secondary" type="button" @click="load">重新加载</button>
    </section>

    <article v-else-if="assignment" class="student-paper">
      <header class="student-paper-head">
        <p class="eyebrow">{{ assignment.type === 'checkin' ? '班级签到' : assignment.type === 'relay' ? '班级接龙' : assignment.type === 'leave' ? '请假条' : assignment.type === 'form' ? '信息收集表' : assignment.type === 'offline' ? '线下完成登记' : '线上作业' }}</p>
        <h1>{{ assignment.title }}</h1>
        <p class="assignment-meta">{{ dueLabel(assignment.dueAt) }}</p>
        <p v-if="assignment.instructions" class="assignment-instructions">{{ assignment.instructions }}</p>
      </header>

      <section v-if="assignment.type === 'checkin' || assignment.type === 'relay' || assignment.type === 'online' || assignment.type === 'leave'" class="student-paper-body">
        <form v-if="showForm" @submit.prevent="assignment.type === 'checkin' ? checkIn() : assignment.type === 'relay' ? joinRelay() : submitOnline()">
          <label class="field-block">
            <span>姓名</span>
            <input v-model="studentName" aria-label="姓名" name="studentName" autocomplete="name" placeholder="请输入姓名" :required="assignment.type === 'online' || assignment.type === 'leave'" />
            <small>系统会按班级名单自动匹配你的学号。</small>
          </label>

          <label v-if="assignment.type === 'online' && assignment.submissionMode !== 'file'" class="field-block">
            <span>作业内容</span>
            <textarea v-model="textContent" rows="7" maxlength="100000" placeholder="在这里输入作业内容" :required="assignment.submissionMode === 'text'" />
          </label>

          <label v-if="assignment.type === 'online' && assignment.submissionMode !== 'text'" class="field-block file-field">
            <span>添加附件</span>
            <input ref="fileInput" type="file" :accept="fileAccept" :multiple="maxFileCount > 1" @change="onFileChange" />
            <small>支持 {{ (assignment.allowedFileTypes ?? []).join('、') || '服务端允许的附件类型' }}，最多 {{ maxFileCount }} 个，每个不超过 {{ maxFileSizeMB }} MB</small>
            <ul v-if="selectedFiles.length" class="file-list">
              <li v-for="file in selectedFiles" :key="`${file.name}-${file.size}`">{{ file.name }} <small>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</small></li>
            </ul>
          </label>

          <div v-if="assignment.type === 'leave'" class="field-block file-field">
            <span>上传假条</span>
            <input ref="fileInput" type="file" :accept="fileAccept" multiple @change="onFileChange" />
            <small>可一次上传多张假条，每张单独选择请假日期，最多 {{ maxFileCount }} 张，每张不超过 {{ maxFileSizeMB }} MB</small>
            <ul v-if="selectedFiles.length" class="file-list slip-list">
              <li v-for="(file, index) in selectedFiles" :key="`${file.name}-${file.size}`" class="slip-row">
                <span class="slip-name" :title="file.name">{{ file.name }} <small>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</small></span>
                <label class="slip-date">
                  <span>请假日期</span>
                  <input v-model="slipDates[index]" type="date" :max="todayISO()" required aria-label="请假日期" />
                </label>
                <button class="button quiet slip-remove" type="button" @click="removeSlipFile(index)">移除</button>
              </li>
            </ul>
          </div>

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

      <section v-if="assignment.type === 'relay'" class="student-paper-body relay-body">
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
          <li v-if="!relayEntries.length && !relayError" class="empty-row">还没有同学加入，从你开始。</li>
        </ol>
        <p v-if="relayError" class="form-message error-text" role="alert">{{ relayError }} <button class="button quiet" type="button" @click="refreshRelay">重试读取名单</button></p>
      </section>

      <section v-if="assignment.type === 'form'" class="student-paper-body">
        <form v-if="showForm" @submit.prevent="submitFormSheet">
          <label class="field-block">
            <span>姓名</span>
            <div class="form-identity-row">
              <input v-model="studentName" aria-label="姓名" name="studentName" autocomplete="name" placeholder="请输入姓名" required />
              <button class="button secondary" type="button" :disabled="sending" @click="loadMyFormRecord">{{ formRecordLoaded ? '重新读取记录' : '读取我的记录' }}</button>
            </div>
            <small>系统会按班级名单自动匹配你的学号；重复提交只会更新你自己那一行。</small>
          </label>

          <div v-if="formFields.length" class="form-sheet" :style="{ '--form-cols': formFields.length }">
            <template v-for="(field, index) in formFields" :key="field.name">
              <label class="form-sheet-label" :for="`form-field-${index}`">{{ field.name }}<em v-if="field.required" class="form-required" aria-hidden="true">*</em></label>

              <!-- 学号/姓名：输入时收窄匹配的名单下拉 -->
              <div v-if="field.type === 'studentNo' || field.type === 'name'" class="form-cell">
                <input
                  :id="`form-field-${index}`"
                  v-model="formValues[field.name]"
                  class="form-sheet-input"
                  type="text"
                  autocomplete="off"
                  :aria-label="field.name"
                  :placeholder="field.required ? '必填，可下拉选择' : '可下拉选择'"
                  @focus="openDropdown = field.name"
                />
                <button class="form-dd-toggle" type="button" tabindex="-1" :aria-label="`下拉选择${field.name}`" @click="toggleDropdown(field.name)">▼</button>
                <ul v-if="openDropdown === field.name" class="form-dd-list" role="listbox" :aria-label="`${field.name}候选`">
                  <li v-if="!dropdownOptions(field).length" class="form-dd-empty">没有匹配的选项</li>
                  <li v-for="option in dropdownOptions(field)" :key="option.studentNo">
                    <button type="button" @mousedown.prevent="pickRosterOption(field, option)">
                      <strong>{{ field.type === 'studentNo' ? option.studentNo : option.name }}</strong>
                      <span>{{ field.type === 'studentNo' ? option.name : option.studentNo }}</span>
                    </button>
                  </li>
                </ul>
              </div>

              <!-- 日期：长/中/短格式用日期选择器，自定义自由填写 -->
              <div v-else-if="field.type === 'date' && field.dateStyle !== 'custom'" class="form-cell">
                <input
                  :id="`form-field-${index}`"
                  class="form-sheet-input"
                  type="date"
                  :value="dateInputValue(field)"
                  :aria-label="field.name"
                  @change="onDateChange(field, $event)"
                />
              </div>

              <!-- 文件：选择一个文件，回显已提交文件名 -->
              <div v-else-if="field.type === 'file'" class="form-cell form-file-cell">
                <input :id="`form-field-${index}`" class="form-sheet-file" type="file" :aria-label="field.name" @change="onFormFileChange(field, $event)" />
                <p v-if="formFileNames[field.name] && !formFiles[field.name]" class="form-file-current">已提交：{{ formFileNames[field.name] }}（不换可留空）</p>
                <p v-else-if="formFiles[field.name]" class="form-file-current">已选择：{{ formFiles[field.name].name }}</p>
              </div>

              <!-- 数字 / 文本 / 自定义日期 -->
              <input
                v-else
                :id="`form-field-${index}`"
                v-model="formValues[field.name]"
                class="form-sheet-input"
                :type="field.type === 'number' ? 'number' : 'text'"
                :step="field.type === 'number' ? 'any' : undefined"
                :aria-label="field.name"
                :placeholder="field.type === 'date' ? '按老师要求的格式填写' : field.required ? '必填' : ''"
              />
            </template>
          </div>
          <p v-else class="field-note">表单字段配置缺失，请联系老师。</p>

          <p v-if="errorMessage" class="form-message error-text" role="alert">{{ errorMessage }}</p>
          <p v-if="confirmation" class="form-message success-text" role="status">{{ confirmation }}</p>
          <div class="form-actions">
            <button class="button primary" type="submit" :disabled="sending">{{ sending ? '正在提交…' : '提交表单' }}</button>
            <RouterLink v-if="receiptCode" class="button secondary" :to="`/receipt/${receiptCode}`">查看提交回执</RouterLink>
          </div>
        </form>
        <div v-else class="receipt-link-block" role="status">
          <p class="success-text">{{ confirmation }}</p>
          <p class="muted-copy">重复提交会更新你在表格中的同一行，不会产生重复记录。</p>
          <div class="form-actions">
            <RouterLink class="button primary" :to="`/receipt/${receiptCode}`">查看提交回执</RouterLink>
            <button class="button secondary" type="button" @click="resubmit">再次修改</button>
          </div>
        </div>
      </section>

      <section v-if="assignment.type === 'offline'" class="student-paper-body">
        <h2>线下作业</h2>
        <p class="offline-note">这项作业由老师在线下登记完成情况，请按老师说明参加。</p>
      </section>

      <footer class="paper-footnote">请确认姓名与班级名单一致。</footer>
    </article>
  </main>
</template>
