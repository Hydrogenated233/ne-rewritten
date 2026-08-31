import type { InjectionKey } from 'vue';
import type { LocalNotationRuntime } from '@/core/local_notation_runtime.ts';

export const LOCAL_NOTATION_RUNTIME_KEY: InjectionKey<LocalNotationRuntime> = Symbol('local_notation_runtime');
