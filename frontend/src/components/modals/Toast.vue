<script setup lang="ts">
import { useAppStore } from '../../composables/useAppStore';
import { AlertCircle, CheckCircle2 } from 'lucide-vue-next';

const { toastMessage, toastIsError } = useAppStore();
</script>

<template>
  <Transition name="toast">
    <div v-if="toastMessage" class="toast-wrapper">
      <div class="toast-box" :class="{ 'toast-error': toastIsError }">
        <component :is="toastIsError ? AlertCircle : CheckCircle2" :size="18" class="toast-icon" />
        <span class="toast-text">{{ toastMessage }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast-wrapper {
  position: fixed;
  top: 20px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 2000;
  pointer-events: none;
  padding: 0 16px;
}

.toast-box {
  background: rgba(20, 28, 43, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
  color: var(--text-main);
  padding: 10px 18px;
  border-radius: 999px;
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  pointer-events: auto;
}

.toast-icon {
  color: var(--success);
}

.toast-error {
  border-color: rgba(239, 68, 68, 0.4);
}

.toast-error .toast-icon {
  color: var(--danger);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-16px) scale(0.96);
}
</style>
