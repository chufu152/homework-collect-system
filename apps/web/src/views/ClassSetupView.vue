<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api, getAdminToken, setAdminToken } from '../api/client'
import { describeError } from '../api/error-messages'

const className = ref('')
const adminToken = ref(getAdminToken())
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
type ModalName = 'add' | 'delete' | 'group'
const activeModal = ref<ModalName | null>(null)
const modalError = ref('')
const addPanel = ref<HTMLElement | null>(null)
const deletePanel = ref<HTMLElement | null>(null)
const groupPanel = ref<HTMLElement | null>(null)
const confirmState = ref<{ title: string; message: string; confirmText: string; action: () => Promise<void> } | null>(null)
const confirmBusy = ref(false)

const busy = computed(() => importing.value || deleting.value || savingGroup.value || confirmBusy.value)
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
  ;({ add: addPanel, delete: deletePanel, group: groupPanel })[name]?.value?.focus()
}

function closeModal(): void {
  // C1 延续：请求在途时不允许关闭弹窗，避免导入/删除过程中界面状态错乱。
  if (busy.value) return
  if (!confirmState.value) activeModal.value = null
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

async function saveKey(): Promise<void> {
  if (importing.value || savingGroup.value || deleting.value) return
  savingKey.value = true
  setAdminToken(adminToken.value.trim())
  showToast('管理密钥已保存到当前浏览器会话。', 'success')
  try {
    await loadClass()
  } finally {
    savingKey.value = false
  }
}

async function loadClass(): Promise<void> {
  // C1：允许新密钥触发的读取覆盖旧请求；较早的响应不能覆盖较新的班级状态。
  const sequence = ++classLoadSequence
  loading.value = true
  loadError.value = ''
  errorMessage.value = ''
  try {
    // `data: null` 表示班级尚未初始化，不是「已存在但为空」。
    const currentClass = await api.currentClass()
    if (sequence !== classLoadSequence) return
    classInfo.value = currentClass
    if (currentClass) {
      const [roster, groupList] = await Promise.all([
        api.listStudents(currentClass.classId),
        api.listGroups(currentClass.classId),
      ])
      if (sequence !== classLoadSequence) return
      students.value = roster.items
      groups.value = groupList
      classInfo.value = { ...currentClass, studentCount: roster.total }
    } else {
      students.value = []
      groups.value = []
    }
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

async function createClass(): Promise<void> {
  errorMessage.value = ''
  if (!className.value.trim()) {
    errorMessage.value = '请填写班级名称。'
    return
  }
  savingKey.value = true
  setAdminToken(adminToken.value.trim())
  try {
    const created = await api.bootstrap(className.value.trim())
    classInfo.value = { classId: created.id, name: created.name, studentCount: 0 }
    showToast('班级已建立，可以添加学生。', 'success')
  } catch (error) {
    errorMessage.value = describeError(error, '班级暂时无法创建。')
  } finally {
    savingKey.value = false
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
  if (adminToken.value) void loadClass()
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
        <div><p class="eyebrow">一个班级 · 开始使用</p><h1>班级名单</h1><p>先设置管理密钥，再建立班级并整理学生名单。</p></div>
        <span v-if="classInfo" class="count-chip">{{ classInfo.studentCount }} 位学生</span>
      </div>

      <section class="surface panel form-grid">
        <div>
          <p class="eyebrow">教师管理</p>
          <h2 style="margin: 5px 0 8px; font-size: 18px">管理密钥</h2>
          <p class="muted-copy">本 demo 不设账号密码。管理密钥由项目运行环境提供，只保存在当前浏览器会话中。</p>
        </div>
        <form class="teacher-key-form" @submit.prevent="saveKey">
          <input v-model="adminToken" type="password" autocomplete="current-password" aria-label="管理密钥" placeholder="粘贴管理密钥" required />
          <button class="button secondary" type="submit" :disabled="savingKey || busy">保存密钥</button>
        </form>
        <p v-if="loading" class="field-note" role="status">正在读取班级信息…</p>
        <p v-if="loadError" class="field-message error-text" role="alert">{{ loadError }} <button class="button quiet" type="button" @click="loadClass">重新读取班级信息</button></p>
      </section>

      <section v-if="!loading && !loadError && !classInfo" class="surface panel form-grid" style="margin-top: 16px">
        <div><p class="eyebrow">建立班级</p><h2 style="margin: 5px 0 8px; font-size: 18px">创建唯一班级</h2><p class="muted-copy">demo 只支持一个班级；班级建好后可反复更新名单。</p></div>
        <label class="field-block"><span>班级名称</span><input v-model="className" placeholder="例如：三年级一班" maxlength="80" required /></label>
        <p v-if="errorMessage" class="field-message error-text" role="alert">{{ errorMessage }}</p>
        <button class="button primary" type="button" :disabled="savingKey || loading" @click="createClass">{{ savingKey ? '正在创建…' : '建立班级' }}</button>
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
