# ne-rewritten 记号开发指南

本指南按 2026-08-31 的仓库实现编写。当前项目只有一套记号模型：`NotationDefinition<T>`、`NotationCategoryDefinition`、`register_notation(...)` 和 `register_category(...)`。

## 1. 当前架构

主要文件：

```text
src/
├── notation-definition.ts              # 记号、显示、分类、生成器与图表类型
├── main.ts                             # 注册内置分类和记号
├── core/
│   ├── registry.ts                    # 实时注册表与生成器状态
│   ├── expander.ts                    # 展开树调用 FS 的逻辑
│   ├── source_validator.ts            # AI/编辑器源码预验证
│   ├── user_defined_notation.ts       # 本地文件收集、验证和事务注册
│   ├── local_notation_runtime.ts      # 本地文件启用、禁用、保存与启动
│   ├── local_notation_store.ts        # nerw-local-notation-files 持久化
│   └── notation_tools.ts              # expand / inspect / detect 工具适配
├── assets/
│   ├── making-a-notation.md           # 本地记号入门
│   ├── notation-dev-guide.md          # 本文档
│   ├── api.md                         # API 参考
│   ├── api.ts                         # 可下载类型参考
│   └── template.js                    # PrSS + 生成类模板
└── notations/                         # 内置 TypeScript 记号
    ├── BM-like/
    ├── DEN/
    ├── Misc/
    ├── MN/
    ├── OCN/
    ├── TON/
    ├── Y/
    └── aSAN/
```

内置记号和本地记号共享同一个运行时注册表、展开树、显示系统和工具接口。差异只在源码交付方式：

| 场景 | 源码格式 | 注册方式 |
|---|---|---|
| 内置记号 | TypeScript 模块 | 导出定义，在 `main.ts` 显式注册 |
| 本地记号 | 自包含 JavaScript | 文件执行时调用两个注入的注册函数 |

## 2. 标准定义

```ts
interface NotationDefinition<T> {
    id: string;
    name: TextSpec;
    simple_name?: TextSpec;
    description?: TextSpec | TextSpec[];
    category_id?: string;
    display: NotationDisplaySpec<T>;
    display_equiv?: Record<string, NotationDisplaySpec<T>>;
    is_limit: (expression: T) => boolean;
    compare: (left: T, right: T) => number;
    FS: (expression: T, index: number) => T;
    FS_alter?: (expression: T, index: number) => T;
    FS_short?: (expression: T, index: number) => T;
    draw_diagram?: DiagramControl<T, unknown>;
    init: () => T[];
    credit_text_id?: string | string[];
    debug?: Record<string, unknown>;
}
```

本地文件的校验器要求 `name` 使用非空字符串。内置 TypeScript 可以用 `{ id: 'i18n.key' }` 形式的 `TextSpec`。

## 3. 表达式类型

泛型 `T` 是一个记号内部使用的完整表达式类型，例如：

```ts
type NaturalExpr = number | typeof Infinity;
type SequenceExpr = number[] | typeof Infinity;
type MatrixExpr = number[][];
type TermExpr = { kind: 'zero' } | { kind: 'psi'; subscript: number; argument: TermExpr };
```

选择表达式类型时应保证：

- 能无损表达所有 `FS` 输入和输出。
- 能被 `display.plain` 稳定序列化。
- 能由 `display.from_display` 解析回来。
- `compare` 对所有合法值构成一致顺序。
- `FS`、显示和比较不修改传入值。

`Infinity` 是普通 JavaScript 数值哨兵，不要求所有记号都使用它。若使用，显示、解析、比较、`is_limit`、`FS` 和 `init()` 必须采用同一种表示，不要混用 `Infinity` 与 `[Infinity]`。

## 4. 显示与解析

### 简写显示

```js
display: (expression) => String(expression)
```

这等价于只定义 `plain`；HTML 与 LaTeX 会从它派生。

### 完整显示

```js
display: {
    plain: display_plain,
    html: display_html,
    latex: display_latex,
    from_display: parse_expression,
}
```

职责：

- `plain`：稳定、无标记的规范文本。xlsx、工具调用和多数导出使用它。
- `html`：可选的页面表示。未提供时使用 `plain`。
- `latex`：可选的 KaTeX 数学源。不要包含 `$`、`$$`、`\(` 等定界符。
- `display.from_display`：把用户文本转换为表达式。失败时抛出包含原因的异常。

解析器应接受 `plain` 自己产生的所有输出。可额外接受 `Limit`、`Infinity`、`∞`、空格或常见括号形式，但不能静默截断非法输入。

### 等价表示

```js
display_equiv: {
    compact: {
        name: 'Compact',
        plain: display_compact,
        latex: display_compact_latex,
        from_display: parse_compact,
    },
}
```

每个键是稳定 ID。切换等价表示不会改变内部表达式或基本列算法。需要在该表示下输入时，应提供对应的 `from_display`。

## 5. 比较、极限与基本列

### `compare`

`compare(left, right)` 的正负号定义顺序。不要通过显示字符串比较，除非显示编码本身已经被证明保序。

建议至少测试：

- 自反性：`compare(a, a) === 0`。
- 反对称符号：`sign(compare(a, b)) === -sign(compare(b, a))`。
- 传递性。
- 顶层极限与普通表达式。

### `is_limit`

返回 `true` 时，树允许为该表达式生成基本列子项。后继项和零通常返回 `false`。

### `FS`

```ts
FS(expression: T, index: number): T
```

`index` 从 `0` 开始。应用可能连续请求多个索引，也可能通过直接展开工具请求非连续索引。实现不得依赖“前一个索引已计算”。

若缓存数组或矩阵结果，应返回副本或保证下游绝不修改缓存值：

```js
const cache = new Map();

function FS(expression, index) {
    const key = JSON.stringify(expression) + '@' + index;
    const cached = cache.get(key);
    if (cached) return cached.map((column) => column.slice());
    const result = compute(expression, index);
    cache.set(key, result.map((column) => column.slice()));
    return result;
}
```

`FS_alter` 与 `FS_short` 是可选展开变体，签名和表达式类型必须与 `FS` 完全一致。

## 6. 初始表达式

`init()` 返回从大到小的表达式数组：

```js
init: () => [Infinity, []]
```

运行时据此建立根节点及其下界。不要返回 `{ expr, low, subitems }` 等 UI 状态，也不要在 `init()` 中注册其他记号或修改全局状态。

## 7. 分类与注册顺序

```ts
interface NotationCategoryDefinition {
    id: string;
    name: TextSpec;
    simple_name?: TextSpec;
    parent_id?: string;
    generator?: NotationCategoryGenerator;
}
```

内置代码必须先注册父分类，再注册子分类和记号：

```ts
register_category(category_parent);
register_category(category_child);
register_notation(notation);
```

本地文件运行时会对同一批已启用文件做稳定拓扑排序，但仍建议按依赖顺序书写，确保源码单独执行时也清晰可靠。

记号与分类共用 ID 空间。内置项和本地项也不能重名。本地文件之间不应建立依赖。

## 8. 生成器

```ts
interface NotationCategoryGenerator {
    start: number;
    initial: number;
    create: (index: number) => NotationDefinition<unknown>;
}
```

```js
register_category({
    id: 'generated-family',
    name: 'Generated family',
    generator: {
        start: 1,
        initial: 3,
        create(index) {
            return create_definition(index);
        },
    },
});
```

运行语义：

1. 分类注册后，初始化器创建 `start..initial`。
2. 生成项只能由 `create(index)` 创建，不能再单独调用 `register_notation` 注册到该分类。
3. 每个返回对象的 `category_id` 必须等于生成器分类 ID。
4. `+` 用当前索引加一调用 `create`。
5. `-` 只删除超过 `initial` 的最后一个附加项。
6. 生成器状态写入 `nerw-settings`，刷新后恢复。
7. 当前接口没有最大索引字段；算法自身必须验证安全整数和资源上限。

内置 TypeScript 分类需要在 `main.ts` 调用 `init_generator(category)`。本地文件运行时会自动初始化带生成器的分类，不应从本地源码调用初始化器。

## 9. 本地文件运行时

本地源码通过以下边界执行：

```js
new Function('register_notation', 'register_category', source)
```

因此本地文件应：

- 自包含所有算法、解析器和显示函数。
- 不使用模块导入导出。
- 不依赖另一个本地文件。
- 不读取或修改应用注册表。
- 不自动执行展开、网络请求或 DOM 操作。
- 只在顶层声明函数、常量并调用注册 API。

生命周期：

- 新模板以受信任但禁用状态创建。
- 上传文件在用户确认信任前不会执行。
- 启用时，将所有已启用本地文件作为一个候选注册集合验证。
- 已启用文件保存时事务替换；验证或注册失败则保留旧运行版本。
- 禁用或删除文件会卸载它拥有的分类、生成器和记号。
- 刷新时自动恢复已信任且启用的文件。
- 使用 `?no-local-files` 时保留文件管理和编辑能力，但本次页面不执行任何本地文件。

源码、草稿、信任和启用状态存储于 `nerw-local-notation-files`，与旧项目的存储键隔离。

## 10. 内置 TypeScript 记号

内置定义放在 `src/notations/`，使用实际项目类型：

```ts
import type { NotationDefinition } from '@/notation-definition.ts';

type Expr = number | typeof Infinity;

export const example: NotationDefinition<Expr> = {
    id: 'example',
    name: 'Example',
    display: {
        plain: (expression) => (expression === Infinity ? 'Limit' : String(expression)),
        from_display: (text) => (text === 'Limit' ? Infinity : Number(text)),
    },
    is_limit: (expression) => expression === Infinity,
    compare: (left, right) => (left === right ? 0 : left < right ? -1 : 1),
    FS: (expression, index) => (expression === Infinity ? index : 0),
    init: () => [Infinity, 0],
};
```

然后在 `main.ts` 按依赖顺序导入并调用 `register_notation(example)`。新增生成分类时同时调用 `register_category` 与 `init_generator`。

## 11. 图表接口

`draw_diagram` 是一个控制对象，不是直接的绘图副作用：

```ts
interface DiagramControl<T, Data> {
    default_data: Data;
    draw_diagram: (expression: T, data: Data) => Diagram | undefined;
    settings?: DiagramControlSetting[];
    handle_action?: (data: Data, action: DiagramAction) => Data | null;
}
```

`draw_diagram` 返回包含 `width`、`height`、`elements`、`extra_text` 的结构化数据。不要直接查询 canvas 或 DOM。完整元素类型见 `api.ts`。

## 12. 测试策略

### 源码静态验证

`validate_notation_source(source)` 检查注册结果、必填字段、重复 ID、分类顺序和生成器基本结构。

### 算法测试

每个算法至少覆盖：

- 显示与解析往返。
- `Infinity` 或自定义顶层极限。
- `FS(..., 0)`、普通索引和非法索引。
- 后继、零、空序列或空矩阵。
- 比较函数的相等和边界情况。
- 缓存结果不被后续调用污染。
- 生成器的 `start`、`initial` 和额外项。

### 应用测试

```powershell
npx vitest run src/core/notation_authoring_assets.test.ts
npm run typecheck
npm run build
```

对于 UI 或本地文件生命周期改动，还应在浏览器中验证：新建模板、保存、启用、刷新、禁用、重新启用以及 `?no-local-files`。

## 13. 随附模板

`template.js` 是完整的标准示例：

- 使用 `number[] | Infinity` 表达 PrSS。
- 提供 `plain`、`latex`、`display.from_display` 和等价表示。
- 实现比较、极限判断、基本列与缓存。
- `init()` 返回 `[Infinity, []]`。
- 注册一个父分类、一个普通 PrSS 和一个生成分类。
- 生成分类创建按步长采样基本列的演示变体。

设置页的“新建 PrSS + 生成类模板”直接使用该文件。模板默认禁用，修改 ID 和算法后再启用。
