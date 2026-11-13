<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api, addImportedClass, getActiveClass, listImportedClasses, removeImportedClass, setActiveClassId, type ImportedClass } from '../api/client'
import { describeError } from '../api/error-messages'
import { copyToClipboard } from '../utils/clipboard'

const className = ref('')
const classKey = ref('')
const revealKey = ref(false)
// 最近一次自动生成的密钥及其归属班级；换班级名再导入时据此重新生成，避免旧密钥撞「同钥异名」
const autoKey = ref<{ key: string; className: string } | null>(null)
const importedClasses = ref<ImportedClass[]>([])
const classInfo = ref<{ classId: string; name: string; studentCount: number } | null>(null)
const rosterText = ref('')
const loading = ref(false)
const savingKey = ref(false)
const importing = ref(false)
const deleting = ref(false)
const errorMessage = ref('')
const loadError = ref('')
let classLoadSequence = 0
const rejectedRows = ref<Array<{ row: number; reason: string }>>([])
const students = ref<Array<{ id: string; studentNo: string; name: string; groups: Array<{ id: string; name: string }> }>>([])
const groups = ref<Array<{ id: string; name: string; memberCount: number }>>([])
const groupName = ref('第 1 组')
const groupStrategy = ref<'manual' | 'balanced_random'>('balanced_random')
const groupCount = ref(4)
const selectedStudentIds = ref<string[]>([])
const deleteSelectedIds = ref<string[]>([])
const savingGroup = ref(false)
// ---- 修改学生信息：每行「修改」按钮打开弹窗，单独改学号/姓名 ----
const editingStudent = ref<{ id: string; studentNo: string; name: string } | null>(null)
const editStudentNo = ref('')
const editName = ref('')
const savingStudent = ref(false)

// ---- 顶部通知 banner：管理操作完成后从顶部下滑进入，停留 2 秒自动划出 ----
const toast = ref<{ text: string; tone: 'success' | 'danger' } | null>(null)
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, tone: 'success' | 'danger' = 'success'): void {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { text, tone }
  toastVisible.value = true
  toastTimer = setTimeout(() => {
    toastVisible.value = false
    toastTimer = null
  }, 2000)
}

// ---- 弹窗与二次确认状态机 ----
type ModalName = 'add' | 'delete' | 'group' | 'edit'
const activeModal = ref<ModalName | null>(null)
const modalError = ref('')
const addPanel = ref<HTMLElement | null>(null)
const deletePanel = ref<HTMLElement | null>(null)
const groupPanel = ref<HTMLElement | null>(null)
const editPanel = ref<HTMLElement | null>(null)
const confirmState = ref<{ title: string; message: string; confirmText: string; action: () => Promise<void> } | null>(null)
const confirmBusy = ref(false)

const busy = computed(() => importing.value || deleting.value || savingGroup.value || confirmBusy.value || savingStudent.value)
const anyOverlayOpen = computed(() => activeModal.value !== null || confirmState.value !== null)

const parsedRoster = computed(() => rosterText.value.split(/\r?\n/).map((line, index) => {
  const parts = line.trim().split(/[\t,， ]+/).filter(Boolean)
  if (!line.trim()) return null
  if (parts.length < 2) return { row: index + 1, studentNo: '', name: '', error: '请在学号后填写姓名。' }
  return { row: index + 1, studentNo: parts[0], name: parts.slice(1).join(' '), error: '' }
}).filter((entry): entry is NonNullable<typeof entry> => !!entry))

const deleteSelectedStudents = computed(() =>
  students.value.filter((student) => deleteSelectedIds.value.includes(student.id)))

watch(anyOverlayOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (confirmState.value) {
    if (!confirmBusy.value) confirmState.value = null
    return
  }
  closeModal()
}

async function openModal(name: ModalName): Promise<void> {
  if (busy.value || loading.value) return
  errorMessage.value = ''
  modalError.value = ''
  rejectedRows.value = []
  if (name === 'delete') deleteSelectedIds.value = []
  if (name === 'group') selectedStudentIds.value = []
  activeModal.value = name
  await nextTick()
  ;({ add: addPanel, delete: deletePanel, group: groupPanel, edit: editPanel })[name]?.value?.focus()
}

/** 打开修改学生信息弹窗：预填当前学号与姓名。 */
function openEditStudent(student: { id: string; studentNo: string; name: string }): void {
  if (busy.value || loading.value) return
  errorMessage.value = ''
  modalError.value = ''
  editingStudent.value = student
  editStudentNo.value = student.studentNo
  editName.value = student.name
  void openModal('edit')
}

function closeModal(): void {
  // C1 延续：请求在途时不允许关闭弹窗，避免导入/删除过程中界面状态错乱。
  if (busy.value) return
  if (!confirmState.value) {
    activeModal.value = null
    editingStudent.value = null
  }
}

function requestConfirm(title: string, message: string, confirmText: string, action: () => Promise<void>): void {
  modalError.value = ''
  confirmState.value = { title, message, confirmText, action }
}

async function runConfirmed(): Promise<void> {
  if (!confirmState.value || confirmBusy.value) return
  confirmBusy.value = true
  try {
    await confirmState.value.action()
  } finally {
    confirmBusy.value = false
  }
}

/**
 * 自动生成班级密钥：crypto 随机 20 字符，剔除易混淆字符（0/O、1/l/I），
 * 前缀 hcs- 便于识别来源；符合后端 8–128 位密钥要求。
 */
function generateClassKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  let key = 'hcs-'
  for (const byte of bytes) key += alphabet[byte % alphabet.length]
  return key
}

/**
 * 导入班级：填写班级名称 + 班级密钥 → 建立新班级或幂等导入已有班级；
 * 只填密钥则按密钥找回已导入过的班级；新建班级时密钥留空会自动生成、
 * 回填到输入框（明文显示）并复制到剪贴板。
 * 成功后加入本浏览器保存的班级列表并切换为活动班级。
 */
async function importClassNow(): Promise<void> {
  if (importing.value || savingGroup.value || deleting.value) return
  const name = className.value.trim()
  const key = classKey.value.trim()
  if (!name && !key) {
    errorMessage.value = '请填写班级名称；新建班级时密钥可留空（自动生成）。'
    return
  }
  savingKey.value = true
  errorMessage.value = ''
  let finalKey = key
  let wasAuto = false
  if (name && (!key || (autoKey.value && key === autoKey.value.key && name !== autoKey.value.className))) {
    // 新建班级未填密钥，或沿用了上一次自动生成的密钥但换了班级名 → 重新生成并回填
    finalKey = generateClassKey()
    wasAuto = true
    classKey.value = finalKey
    revealKey.value = true
  }
  try {
    const info = name
      ? await api.importClass(name, finalKey)
      : await api.verifyClassKey(finalKey)
    addImportedClass({ classId: info.classId, name: info.name, teacherKey: finalKey, studentCount: info.studentCount })
    importedClasses.value = listImportedClasses()
    if (wasAuto) {
      autoKey.value = { key: finalKey, className: info.name }
    } else {
      classKey.value = ''
    }
    if (wasAuto) {
      let copied = true
      try {
        await copyToClipboard(finalKey)
      } catch {
        copied = false
      }
      showToast(
        copied
          ? `班级「${info.name}」已创建，密钥已自动复制到剪贴板。`
          : `班级「${info.name}」已创建，复制失败，请手动保存密钥：${finalKey}`,
        copied ? 'success' : 'danger',
      )
    } else {
      showToast(name ? `班级「${info.name}」已导入。` : `班级「${info.name}」导入成功。`, 'success')
    }
    await loadClass()
  } catch (error) {
    errorMessage.value = describeError(error, '班级导入失败。')
  } finally {
    savingKey.value = false
  }
}

function switchClass(classId: string): void {
  if (busy.value || loading.value) return
  if (getActiveClass()?.classId === classId) return
  setActiveClassId(classId)
  importedClasses.value = listImportedClasses()
  void loadClass()
}

function removeClass(classId: string): void {
  if (busy.value) return
  removeImportedClass(classId)
  importedClasses.value = listImportedClasses()
  showToast('已从本浏览器移除该班级（云端数据不受影响）。', 'danger')
  void loadClass()
}

/** 从云端彻底删除班级：名单、分组、作业、提交记录全部清除，二次确认后执行。 */
function deleteClassFromCloud(entry: ImportedClass): void {
  if (busy.value) return
  requestConfirm(
    '确认删除班级',
    `将永久删除云端班级「${entry.name}」及其全部学生名单、分组、作业和提交记录，此操作不可恢复。确定继续吗？`,
    '永久删除',
    async () => {
      deleting.value = true
      try {
        await api.deleteClass(entry.classId)
        removeImportedClass(entry.classId)
        importedClasses.value = listImportedClasses()
        confirmState.value = null
        showToast(`班级「${entry.name}」已从云端删除。`, 'danger')
        await loadClass()
      } catch (error) {
        confirmState.value = null
        errorMessage.value = describeError(error, '班级删除失败。')
      } finally {
        deleting.value = false
      }
    },
  )
}

async function loadClass(): Promise<void> {
  // C1：允许切换班级触发的读取覆盖旧请求；较早的响应不能覆盖较新的班级状态。
  const sequence = ++classLoadSequence
  loading.value = true
  loadError.value = ''
  errorMessage.value = ''
  const active = getActiveClass()
  if (!active) {
    classInfo.value = null
    students.value = []
    groups.value = []
    loading.value = false
    return
  }
  try {
    const [roster, groupList] = await Promise.all([
      api.listStudents(active.classId),
      api.listGroups(active.classId),
    ])
    if (sequence !== classLoadSequence) return
    students.value = roster.items
    groups.value = groupList
    classInfo.value = { classId: active.classId, name: active.name, studentCount: roster.total }
  } catch (error) {
    if (sequence !== classLoadSequence) return
    classInfo.value = null
    students.value = []
    groups.value = []
    loadError.value = describeError(error, '无法读取班级信息。')
  } finally {
    if (sequence === classLoadSequence) loading.value = false
  }
}

// ---- 添加学生 ----
function confirmImport(): void {
  if (!classInfo.value) return
  const validRows = parsedRoster.value.filter((row) => !row.error)
  if (!validRows.length) {
    modalError.value = parsedRoster.value.length ? '请修正名单格式后再导入。' : '请先填写学生名单。'
    return
  }
  requestConfirm(
    '确认导入名单',
    `将导入 ${validRows.length} 名学生；重复学号会更新姓名，不会另建重复名单。`,
    '确认导入',
    async () => {
      importing.value = true
      try {
        const result = await api.importStudents(classInfo.value!.classId, validRows.map((row) => ({ studentNo: row.studentNo, name: row.name })))
        rejectedRows.value = [...parsedRoster.value.filter((row) => row.error).map((row) => ({ row: row.row, reason: row.error })), ...(result.rejected ?? [])]
        let message = `已新增 ${result.created ?? 0} 人，更新 ${result.updated ?? 0} 人。`
        if (rejectedRows.value.length) message += ` 有 ${rejectedRows.value.length} 行未导入。`
        showToast(message, 'success')
        await loadClass()
        confirmState.value = null
        rosterText.value = ''
        activeModal.value = null
      } catch (error) {
        confirmState.value = null
        modalError.value = describeError(error, '名单导入失败。')
      } finally {
        importing.value = false
      }
    },
  )
}

// ---- 删除学生 ----
function confirmDelete(): void {
  if (!classInfo.value) return
  const selected = deleteSelectedStudents.value
  if (!selected.length) {
    modalError.value = '请先勾选要删除的学生。'
    return
  }
  requestConfirm(
    '确认删除学生',
    `将删除 ${selected.length} 名学生（${selected.map((student) => student.name).join('、')}）。此操作不可恢复；已有提交记录的学生会被拒绝删除。`,
    '确认删除',
    async () => {
      deleting.value = true
      const failures: string[] = []
      try {
        for (const student of selected) {
          try {
            await api.deleteStudent(classInfo.value!.classId, student.id)
          } catch (error) {
            failures.push(`${student.name}：${describeError(error, '删除失败。')}`)
          }
        }
        await loadClass()
        confirmState.value = null
        if (failures.length) {
          modalError.value = `部分学生未删除：${failures.join('；')}`
          deleteSelectedIds.value = deleteSelectedIds.value.filter(
            (id) => !selected.find((student) => student.id === id && failures.some((failure) => failure.startsWith(`${student.name}：`))),
          )
        } else {
          showToast(`已删除 ${selected.length} 名学生。`, 'danger')
          deleteSelectedIds.value = []
          activeModal.value = null
        }
      } finally {
        deleting.value = false
      }
    },
  )
}

// ---- 修改学生信息 ----
function confirmEditStudent(): void {
  if (!classInfo.value || !editingStudent.value) return
  const studentNo = editStudentNo.value.trim()
  const name = editName.value.trim()
  if (!studentNo && !name) {
    modalError.value = '请填写新的学号或姓名。'
    return
  }
  savingStudent.value = true
  const payload: { studentNo?: string; name?: string } = {}
  if (studentNo !== editingStudent.value.studentNo) payload.studentNo = studentNo
  if (name !== editingStudent.value.name) payload.name = name
  if (!Object.keys(payload).length) {
    // 没有任何改动：直接关闭即可，不打扰后端。
    savingStudent.value = false
    activeModal.value = null
    editingStudent.value = null
    return
  }
  void (async () => {
    try {
      const updated = await api.updateStudent(classInfo.value!.classId, editingStudent.value!.id, payload)
      const index = students.value.findIndex((student) => student.id === updated.id)
      if (index >= 0) students.value[index] = { ...students.value[index], studentNo: updated.studentNo, name: updated.name }
      showToast(`已修改学生信息：${updated.studentNo}　${updated.name}`, 'success')
      activeModal.value = null
      editingStudent.value = null
    } catch (error) {
      modalError.value = describeError(error, '学生信息修改失败。')
    } finally {
      savingStudent.value = false
    }
  })()
}

// ---- 分组 ----
function confirmGroup(): void {
  if (!classInfo.value) return
  if (groupStrategy.value === 'manual' && !selectedStudentIds.value.length) {
    modalError.value = '手动分组请至少挑选一名成员。'
    return
  }
  const name = groupName.value.trim() || '小组'
  const detail = groupStrategy.value === 'balanced_random'
    ? `将把全班 ${students.value.length} 名学生随机均分到 ${groupCount.value} 个小组。`
    : `将创建手动分组「${name}」，包含 ${selectedStudentIds.value.length} 名成员。`
  requestConfirm('确认建立分组', detail, '确认分组', async () => {
    savingGroup.value = true
    try {
      if (groupStrategy.value === 'balanced_random') {
        await api.createGroups(classInfo.value!.classId, {
          name: name,
          strategy: 'balanced_random',
          groupCount: groupCount.value,
        })
      } else {
        await api.createGroups(classInfo.value!.classId, {
          name: name,
          strategy: 'manual',
          studentIds: selectedStudentIds.value,
        })
      }
      groups.value = await api.listGroups(classInfo.value!.classId)
      selectedStudentIds.value = []
      showToast('分组已保存。', 'success')
      confirmState.value = null
      activeModal.value = null
    } catch (error) {
      confirmState.value = null
      modalError.value = describeError(error, '分组创建失败。')
    } finally {
      savingGroup.value = false
    }
  })
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  importedClasses.value = listImportedClasses()
  if (getActiveClass()) void loadClass()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  document.body.style.overflow = ''
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand-lockup"><span class="brand-mark">收</span><span>班级工作台</span></RouterLink>
      <nav aria-label="主导航"><RouterLink class="nav-link" to="/">作业</RouterLink><RouterLink class="nav-link router-link-active" to="/class/setup">班级名单</RouterLink></nav>
      <RouterLink class="topbar-action" to="/assignments/new">发布作业</RouterLink>
    </header>

    <main class="page-wrap">
      <div class="page-heading">
        <div><p class="eyebrow">班级管理 · 开始使用</p><h1>班级名单</h1><p>每个班级持有独立密钥；导入班级后即可整理学生名单与分组。</p></div>
        <span v-if="classInfo" class="count-chip">{{ classInfo.studentCount }} 位学生</span>
      </div>

      <section class="surface panel form-grid">
        <div>
          <p class="eyebrow">教师管理</p>
          <h2 style="margin: 5px 0 8px; font-size: 18px">导入班级</h2>
          <p class="muted-copy">填写班级名称和班级密钥：新名称会建立新班级，已有名称会校验密钥后导入。新建班级时密钥可留空，系统会自动生成并复制到剪贴板；支持多个班级，导入过的班级保存在本浏览器，可随时切换。</p>
        </div>

        <ul v-if="importedClasses.length" class="imported-class-list" aria-label="已导入的班级">
          <li v-for="entry in importedClasses" :key="entry.classId" :class="{ 'is-active': entry.classId === classInfo?.classId }">
            <button class="class-switch" type="button" :title="`切换到 ${entry.name}`" @click="switchClass(entry.classId)">
              <span class="class-dot" aria-hidden="true"></span>{{ entry.name }}
            </button>
            <span class="class-row-actions">
              <button class="button quiet class-remove" type="button" @click="removeClass(entry.classId)">移除</button>
              <button class="class-delete" type="button" :title="`从云端永久删除 ${entry.name}`" @click="deleteClassFromCloud(entry)">删除班级</button>
            </span>
          </li>
        </ul>

        <form class="teacher-key-form" @submit.prevent="importClassNow">
          <input v-model="className" aria-label="班级名称" placeholder="班级名称（新名称将建立新班级）" maxlength="80" />
          <input v-model="classKey" :type="revealKey ? 'text' : 'password'" autocomplete="current-password" aria-label="班级密钥" placeholder="班级密钥（新建班级可留空，自动生成）" />
          <button class="button secondary" type="submit" :disabled="savingKey || busy">导入班级</button>
        </form>
        <p v-if="errorMessage" class="field-message error-text" role="alert">{{ errorMessage }}</p>
        <p v-if="loading" class="field-note" role="status">正在读取班级信息…</p>
        <p v-if="loadError" class="field-message error-text" role="alert">{{ loadError }} <button class="button quiet" type="button" @click="loadClass">重新读取班级信息</button></p>
      </section>

      <section v-if="!loading && !loadError && !classInfo" class="surface panel form-grid" style="margin-top: 16px">
        <div><p class="eyebrow">从这里开始</p><h2 style="margin: 5px 0 8px; font-size: 18px">还没有导入任何班级</h2><p class="muted-copy">在上方填写班级名称即可完成导入，密钥留空时系统会自动生成并复制到剪贴板；之后同一密钥可在任何浏览器重新导入该班级，请妥善保存。</p></div>
      </section>

      <!-- 班级成员列表（主体） -->
      <section v-else-if="!loading && !loadError && classInfo" class="surface panel member-panel" style="margin-top: 16px">
        <div class="modal-head">
          <div><p class="eyebrow">{{ classInfo.name }}</p><h2 style="margin: 5px 0 0; font-size: 18px">班级成员列表</h2></div>
          <span class="count-chip">{{ students.length }} 位学生</span>
        </div>

        <p v-if="!students.length" class="field-note" role="status">班级还没有学生。点击「添加学生」导入名单，再整理分组或发布作业；分组与发布功能会在名单为空时保持不可用。</p>
        <div v-else class="member-scroll">
          <ul class="member-list" aria-label="班级成员列表">
            <li v-for="student in students" :key="student.id">
              <span class="member-no">{{ student.studentNo }}</span>
              <span class="member-name">{{ student.name }}</span>
              <span class="member-groups"><span v-for="group in student.groups" :key="group.id" class="count-chip">{{ group.name }}</span></span>
              <button class="member-edit" type="button" :title="`修改 ${student.name} 的学号/姓名`" @click="openEditStudent(student)">修改</button>
            </li>
          </ul>
        </div>

        <div class="button-row">
          <button class="button primary" type="button" :disabled="busy || loading" @click="openModal('add')">添加学生</button>
          <button class="button secondary" type="button" :disabled="busy || loading || !students.length" @click="openModal('delete')">删除学生</button>
          <button class="button secondary" type="button" :disabled="busy || loading || !students.length" @click="openModal('group')">分组</button>
          <RouterLink class="button ghost" to="/">返回作业首页</RouterLink>
        </div>

        <ul v-if="groups.length" class="roster-preview" aria-label="现有分组"><li v-for="group in groups" :key="group.id">{{ group.name }}　{{ group.memberCount }} 人</li></ul>
        <p v-else class="field-note">还没有分组；点击「分组」建立小组后，发布作业时就能按分组选择对象。</p>
        <p v-if="errorMessage" class="field-message error-text" role="alert">{{ errorMessage }}</p>
      </section>

      <!-- 模态弹窗：添加学生 / 删除学生 / 分组 -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="activeModal === 'add'" class="modal-root">
            <div class="modal-backdrop" @click="closeModal"></div>
            <div ref="addPanel" class="modal-panel" role="dialog" aria-modal="true" aria-label="添加学生" tabindex="-1">
              <div class="modal-head">
                <div><p class="eyebrow">{{ classInfo?.name }}</p><h2>添加学生</h2></div>
                <button class="modal-close" type="button" aria-label="关闭弹窗" :disabled="busy" @click="closeModal">×</button>
              </div>
              <div class="modal-body">
                <p class="muted-copy">每行一位学生，按“学号 姓名”填写；可用空格、逗号或 Tab 分隔。重复学号会更新姓名，不会另建重复名单。</p>
                <label class="field-block"><span>学号与姓名</span><textarea v-model="rosterText" class="roster-input" placeholder="2026001 张三&#10;2026002 李四&#10;2026003 王五" spellcheck="false" /></label>
                <div v-if="parsedRoster.length" class="field-stack">
                  <span class="muted-copy">预览 {{ parsedRoster.length }} 行</span>
                  <ul class="roster-preview"><li v-for="row in parsedRoster.slice(0, 8)" :key="row.row">{{ row.row }}. {{ row.error || `${row.studentNo}　${row.name}` }}</li><li v-if="parsedRoster.length > 8">另有 {{ parsedRoster.length - 8 }} 行…</li></ul>
                </div>
                <p v-if="modalError" class="field-message error-text" role="alert">{{ modalError }}</p>
              </div>
              <div class="modal-foot">
                <button class="button ghost" type="button" :disabled="busy" @click="closeModal">取消</button>
                <button class="button primary" type="button" :disabled="busy || loading" @click="confirmImport">{{ importing ? '正在导入…' : '确认导入' }}</button>
              </div>
            </div>
          </div>
        </Transition>

        <Transition name="modal">
          <div v-if="activeModal === 'delete'" class="modal-root">
            <div class="modal-backdrop" @click="closeModal"></div>
            <div ref="deletePanel" class="modal-panel" role="dialog" aria-modal="true" aria-label="删除学生" tabindex="-1">
              <div class="modal-head">
                <div><p class="eyebrow">{{ classInfo?.name }}</p><h2>删除学生</h2></div>
                <button class="modal-close" type="button" aria-label="关闭弹窗" :disabled="busy" @click="closeModal">×</button>
              </div>
              <div class="modal-body">
                <p class="muted-copy">勾选要删除的学生。已有提交记录的学生无法删除，以保证作业统计与回执完整。</p>
                <div class="roster-preview field-stack">
                  <label v-for="student in students" :key="student.id" class="check-option">
                    <input v-model="deleteSelectedIds" type="checkbox" :value="student.id" />
                    <span>{{ student.studentNo }}　{{ student.name }}</span>
                  </label>
                </div>
                <span v-if="deleteSelectedIds.length" class="muted-copy">已选 {{ deleteSelectedIds.length }} 人</span>
                <p v-if="modalError" class="field-message error-text" role="alert">{{ modalError }}</p>
              </div>
              <div class="modal-foot">
                <button class="button ghost" type="button" :disabled="busy" @click="closeModal">取消</button>
                <button class="button danger-solid" type="button" :disabled="busy || loading || !deleteSelectedIds.length" @click="confirmDelete">{{ deleting ? '正在删除…' : '删除所选' }}</button>
              </div>
            </div>
          </div>
        </Transition>

        <Transition name="modal">
          <div v-if="activeModal === 'group'" class="modal-root">
            <div class="modal-backdrop" @click="closeModal"></div>
            <div ref="groupPanel" class="modal-panel" role="dialog" aria-modal="true" aria-label="整理分组" tabindex="-1">
              <div class="modal-head">
                <div><p class="eyebrow">{{ classInfo?.name }}</p><h2>整理分组</h2></div>
                <button class="modal-close" type="button" aria-label="关闭弹窗" :disabled="busy" @click="closeModal">×</button>
              </div>
              <div class="modal-body">
                <p class="muted-copy">按名单顺序随机均分，或手动挑选成员；分组用于发布定向作业。</p>
                <label class="field-block"><span>分组名称</span><input v-model="groupName" maxlength="40" placeholder="例如：实验小组" /></label>
                <div class="radio-grid"><label class="radio-option"><input v-model="groupStrategy" type="radio" value="balanced_random" /><span><strong>均分随机</strong><span>自动把全班分入若干小组</span></span></label><label class="radio-option"><input v-model="groupStrategy" type="radio" value="manual" /><span><strong>手动分组</strong><span>为一组挑选成员</span></span></label></div>
                <label v-if="groupStrategy === 'balanced_random'" class="field-block"><span>小组数量</span><input v-model.number="groupCount" type="number" min="2" :max="students.length || 2" /></label>
                <div v-else class="roster-preview field-stack"><label v-for="student in students" :key="student.id" class="check-option"><input v-model="selectedStudentIds" type="checkbox" :value="student.id" /><span>{{ student.studentNo }}　{{ student.name }}</span></label></div>
                <p v-if="modalError" class="field-message error-text" role="alert">{{ modalError }}</p>
              </div>
              <div class="modal-foot">
                <button class="button ghost" type="button" :disabled="busy" @click="closeModal">取消</button>
                <button class="button primary" type="button" :disabled="busy || loading" @click="confirmGroup">{{ savingGroup ? '正在保存…' : groupStrategy === 'balanced_random' ? '随机分组' : '建立手动分组' }}</button>
              </div>
            </div>
          </div>
        </Transition>
        <Transition name="modal">
          <div v-if="activeModal === 'edit' && editingStudent" class="modal-root">
            <div class="modal-backdrop" @click="closeModal"></div>
            <div ref="editPanel" class="modal-panel" role="dialog" aria-modal="true" aria-label="修改学生信息" tabindex="-1">
              <div class="modal-head">
                <div><p class="eyebrow">{{ classInfo?.name }}</p><h2>修改学生信息</h2></div>
                <button class="modal-close" type="button" aria-label="关闭弹窗" :disabled="busy" @click="closeModal">×</button>
              </div>
              <div class="modal-body">
                <label class="field-block"><span>学号</span><input v-model="editStudentNo" maxlength="40" /></label>
                <label class="field-block"><span>姓名</span><input v-model="editName" maxlength="80" /></label>
                <p class="muted-copy">修改学号时若与班里其他学生重复会被拒绝；改名不影响该学生已有的提交记录与回执。</p>
                <p v-if="modalError" class="field-message error-text" role="alert">{{ modalError }}</p>
              </div>
              <div class="modal-foot">
                <button class="button ghost" type="button" :disabled="busy" @click="closeModal">取消</button>
                <button class="button primary" type="button" :disabled="busy || loading" @click="confirmEditStudent">{{ savingStudent ? '正在保存…' : '保存修改' }}</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- 二次确认弹窗（alert）：毛玻璃 + 危险主按钮 + 幽灵次按钮 -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="confirmState" class="confirm-root">
            <div class="confirm-backdrop"></div>
            <div class="confirm-panel" role="alertdialog" aria-modal="true" :aria-label="confirmState.title">
              <h3>{{ confirmState.title }}</h3>
              <p>{{ confirmState.message }}</p>
              <div class="confirm-foot">
                <button class="button ghost" type="button" :disabled="confirmBusy" @click="confirmState = null">取消</button>
                <button class="button danger-solid" type="button" :disabled="confirmBusy" @click="runConfirmed">{{ confirmBusy ? '处理中…' : confirmState.confirmText }}</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
      <!-- 顶部通知 banner：保存成功绿点 / 删除成功红点，2 秒自动划出 -->
      <Teleport to="body">
        <Transition name="toast">
          <div v-if="toastVisible && toast" class="toast-banner" role="status">
            <span class="toast-dot" :class="toast.tone" aria-hidden="true"></span>
            <span>{{ toast.text }}</span>
          </div>
        </Transition>
      </Teleport>
    </main>
  </div>
</template>
