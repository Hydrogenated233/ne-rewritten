/**
 * "试展开次数过多(基本列实现疑似有误)"专用异常类。
 *
 * 展开流程(expander.generate_fs)在 FS 扫描超过上限时抛出本异常;
 * 调用方(如 NotationTreeItem.do_expand)只对本类异常提示"展开次数过多",
 * 其余异常一律视为未知错误, 展示 stack trace 以便排查真实原因
 * (此前 try/catch 会把任何异常都伪装成"展开次数过多", 掩盖真实错误)。
 */
export class FsTrialExpansionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FsTrialExpansionError';
    }
}
