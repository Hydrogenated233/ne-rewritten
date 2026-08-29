import { ref } from 'vue';
import type { Tip } from '@/core/tips.ts';
import { TIPS } from '@/core/tips.ts';
import type { Settings } from '@/core/settings.ts';

/**
 * 页面加载时的随机提示弹窗状态。
 * 每次打开页面 (app mounted) 时调用 show_random(), 从全体 tip 中随机选一条
 * 未被 ignored_tip 标记的显示; 用户勾选"不再显示"后通过 ignore() 写入
 * settings.ignored_tip, 由 settings 的 deep watch 持久化到 localStorage。
 */
export function use_tip(settings: Settings) {
    const shown = ref<Tip | null>(null);

    /** 随机选择一条未被忽略的 tip 显示; 全部被忽略时不显示。 */
    function show_random() {
        const candidates = TIPS.filter((tip) => !settings.ignored_tip[tip.id]);
        if (candidates.length === 0) return;
        shown.value = candidates[Math.floor(Math.random() * candidates.length)];
    }

    /** 标记某条 tip 不再显示 (写 ignored_tip, 由 settings deep watch 持久化)。 */
    function ignore(id: string) {
        settings.ignored_tip[id] = true;
    }

    /** 关闭弹窗。 */
    function close() {
        shown.value = null;
    }

    return { shown, show_random, ignore, close };
}
