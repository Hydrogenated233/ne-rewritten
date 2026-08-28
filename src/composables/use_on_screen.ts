/**
 * 共享的 IntersectionObserver 可见性门控。
 *
 * 万级节点的树如果每个组件各自 new 一个 IntersectionObserver, 会创建上万个
 * observer 实例; 这里使用单个模块级 observer 观察所有目标, 浏览器原生批量回调。
 *
 * 语义: 目标元素进入视口 (rootMargin 0, 仅视口内) 后触发一次回调并立即
 * 停止观察 (只置 on_screen=true, 不需要 leave 事件)。回调里只需把响应式 ref
 * 置 true, Vue 会在同一帧批量 flush 渲染。
 *
 * 注意: rootMargin 刻意保持 0, 不做预取。实测翻页速度快于等价表示的计算
 * 速度, 任何预取余量都不够覆盖, 只会白白增加卡顿时间; 置 0 让用户显式
 * 知道内容是滚动时加载的。若将来计算显著变快再考虑恢复预取。
 */

import type { Ref } from 'vue';
import { ref } from 'vue';

type Callback = () => void;
const handlers = new WeakMap<Element, Callback>();

const io: IntersectionObserver | null =
    typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
              (entries) => {
                  for (const entry of entries) {
                      if (!entry.isIntersecting) continue;
                      handlers.get(entry.target)?.();
                      io?.unobserve(entry.target);
                  }
              },
              { rootMargin: '0px' },
          )
        : null;

/** 观察元素, 进入视口后触发 cb (仅一次)。环境无 IO 时立即触发。 */
export function observe_on_screen(el: Element, cb: Callback): void {
    if (!io) {
        cb();
        return;
    }
    handlers.set(el, cb);
    io.observe(el);
}

/** 卸载前调用, 移除 handler 并停止观察。 */
export function unobserve_on_screen(el: Element): void {
    handlers.delete(el);
    io?.unobserve(el);
}

/** 供组件使用的便捷封装: 返回一个进入视口后置 true 的 ref。 */
export function use_on_screen(): {
    on_screen: Ref<boolean>;
    bind: (el: Element | null) => void;
    unbind: (el: Element | null) => void;
} {
    const on_screen = ref(false);
    const bind = (el: Element | null) => {
        if (el)
            observe_on_screen(el, () => {
                on_screen.value = true;
            });
    };
    const unbind = (el: Element | null) => {
        if (el) unobserve_on_screen(el);
    };
    return { on_screen, bind, unbind };
}
