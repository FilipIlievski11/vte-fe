<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import {
  isFiscalSupported, getSavedFolder, pickFiscalFolder, clearFiscalFolder,
  ensureFolder, writeFiscalFile, printDailyClosure, printControlReport, printTestReceipt,
} from '@/fiscal/fiscal';

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const supported = isFiscalSupported();
const folderName = ref<string | null>(null);
const permission = ref<'granted' | 'prompt' | 'denied' | null>(null);
const busy = ref(false);

async function refreshStatus() {
  const h = await getSavedFolder();
  folderName.value = h?.name ?? null;
  permission.value = h ? await h.queryPermission({ mode: 'readwrite' }) as any : null;
}

async function chooseFolder() {
  try {
    await pickFiscalFolder();
    await refreshStatus();
    toast.add({ severity: 'success', summary: t('fiscal.folderSaved'), life: 2500 });
  } catch { /* user cancelled the picker */ }
}

async function forgetFolder() {
  await clearFiscalFolder();
  await refreshStatus();
}

async function withFolder(fn: (f: FileSystemDirectoryHandle) => Promise<void>, okMsg: string) {
  busy.value = true;
  try {
    const f = await ensureFolder(true);
    if (!f) { toast.add({ severity: 'warn', summary: t('fiscal.noFolder'), life: 3500 }); return; }
    await fn(f);
    await refreshStatus();
    toast.add({ severity: 'success', summary: okMsg, life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: t('fiscal.writeFailed'), detail: e?.message, life: 4500 });
  } finally {
    busy.value = false;
  }
}

function testWrite() {
  withFolder(async f => {
    await writeFiscalFile(f, 'vte-test.txt',
      new TextEncoder().encode('VTE test ' + new Date().toISOString() + '\r\n'));
  }, t('fiscal.testOk'));
}

// Тест-фискална од 1 денар — ВИСТИНСКА сметка на уредот, со потврда пред печат.
function testReceipt() {
  confirm.require({
    message: t('fiscal.testReceiptConfirm'),
    header: t('fiscal.testReceiptTitle'),
    icon: 'pi pi-print',
    rejectProps: { label: t('common.cancel'), severity: 'secondary', outlined: true },
    acceptProps: { label: t('fiscal.testReceiptTitle') },
    accept: () => withFolder(async f => { await printTestReceipt(f); }, t('fiscal.testReceiptSent')),
  });
}

function zClosure() {
  confirm.require({
    message: t('fiscal.zConfirm'),
    header: t('fiscal.zTitle'),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: t('common.cancel'), severity: 'secondary', outlined: true },
    acceptProps: { label: t('fiscal.zTitle'), severity: 'danger' },
    accept: () => withFolder(f => printDailyClosure(f), t('fiscal.commandSent')),
  });
}

function controlReport() {
  withFolder(f => printControlReport(f), t('fiscal.commandSent'));
}

onMounted(refreshStatus);
</script>

<template>
  <div class="page-header">
    <div>
      <h1>{{ t('fiscal.title') }}</h1>
      <div class="subtitle">{{ t('fiscal.subtitle') }}</div>
    </div>
  </div>

  <div v-if="!supported" class="fiscal-card warn">
    <i class="pi pi-exclamation-triangle" />
    <div>{{ t('fiscal.unsupported') }}</div>
  </div>

  <template v-else>
    <div class="fiscal-card">
      <h2>{{ t('fiscal.folderSection') }}</h2>
      <p class="muted">{{ t('fiscal.folderHelp') }}</p>
      <div class="folder-row">
        <template v-if="folderName">
          <i class="pi pi-folder" />
          <b>{{ folderName }}</b>
          <Tag v-if="permission === 'granted'" :value="t('fiscal.permGranted')" severity="success" />
          <Tag v-else :value="t('fiscal.permPrompt')" severity="warn" />
        </template>
        <span v-else class="muted">{{ t('fiscal.noFolderYet') }}</span>
        <span class="spacer" />
        <Button :label="t('fiscal.pickFolder')" icon="pi pi-folder-open" size="small" @click="chooseFolder" />
        <Button v-if="folderName" :label="t('fiscal.forget')" icon="pi pi-times" size="small"
          severity="secondary" outlined @click="forgetFolder" />
      </div>
      <div class="test-row">
        <Button :label="t('fiscal.testWrite')" icon="pi pi-bolt" size="small" outlined
          :loading="busy" :disabled="!folderName" @click="testWrite" />
        <Button :label="t('fiscal.testReceipt')" icon="pi pi-print" size="small" severity="warn" outlined
          :loading="busy" :disabled="!folderName" @click="testReceipt" />
      </div>
    </div>

    <div class="fiscal-card">
      <h2>{{ t('fiscal.reportsSection') }}</h2>
      <p class="muted">{{ t('fiscal.reportsHelp') }}</p>
      <div class="report-row">
        <Button :label="t('fiscal.controlReport')" icon="pi pi-chart-bar" size="small" outlined
          :loading="busy" :disabled="!folderName" @click="controlReport" />
        <Button :label="t('fiscal.zTitle')" icon="pi pi-lock" size="small" severity="danger" outlined
          :loading="busy" :disabled="!folderName" @click="zClosure" />
      </div>
    </div>
  </template>
</template>

<style scoped>
.page-header { margin-bottom: 1rem }
.subtitle { color: var(--p-text-muted-color); font-size: .85rem }
.fiscal-card {
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 1rem; max-width: 46rem;
}
.fiscal-card.warn { display: flex; gap: .7rem; align-items: center; color: var(--p-orange-600, #c2620a) }
.fiscal-card h2 { margin: 0 0 .3rem; font-size: 1rem }
.fiscal-card p { margin: 0 0 .8rem; font-size: .85rem }
.muted { color: var(--p-text-muted-color) }
.folder-row { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap }
.folder-row .spacer { flex: 1 }
.test-row { margin-top: .8rem; display: flex; gap: .6rem; flex-wrap: wrap }
.report-row { display: flex; gap: .6rem }
</style>
