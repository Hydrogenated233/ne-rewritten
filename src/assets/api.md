# ne-rewritten 记号注册 API

本文档对应 2026-08-31 的 `src/notation-definition.ts` 与 `src/core/registry.ts`。本地 JavaScript 文件只调用：

```ts
register_notation<T>(definition: NotationDefinition<T>): void;
register_category(definition: NotationCategoryDefinition): void;
```

本地文件不使用模块导入导出，也不调用内部注册表函数。完整可复制类型见 `api.ts`。

## TextSpec

```ts
type TextSpec = string | { id: string };
```

内置 TypeScript 可用 `{ id }` 引用 i18n。当前本地源码验证应使用普通非空字符串。

## NotationDefinition

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
    init: () => T[];

    draw_diagram?: DiagramControl<T, unknown>;
    credit_text_id?: string | string[];
    debug?: Record<string, unknown>;
}
```

### `id`

非空稳定 ID。记号和分类共用同一个 ID 空间，且不能与内置项或其他启用的本地文件重复。

### `name`、`simple_name`、`description`

- `name`：完整名称。
- `simple_name`：可选简称。
- `description`：可选说明，可为一条或多条文本。

### `category_id`

可选父分类 ID。该分类必须存在。若父分类带生成器，普通记号不能直接注册到它；记号必须由该分类的 `generator.create(index)` 返回。

## NotationDisplaySpec

```ts
type NotationDisplay<T> = (expression: T) => string;

type NotationDisplaySpec<T> =
    | NotationDisplay<T>
    | {
          plain: NotationDisplay<T>;
          html?: NotationDisplay<T>;
          latex?: NotationDisplay<T>;
          from_display?: (text: string) => T;
          name?: TextSpec;
          name_id?: string;
      };
```

### 简写

```js
display: (expression) => String(expression)
```

该函数同时作为 `plain` 和默认 HTML；默认 LaTeX 从受支持的 HTML 子集转换。

### 完整形式

```js
display: {
    plain: display_plain,
    html: display_html,
    latex: display_latex,
    from_display: parse_expression,
}
```

- `plain`：必填规范文本，用于工具、导出和 xlsx。
- `html`：可选页面表示。
- `latex`：可选 KaTeX 源，不含公式定界符。
- `display.from_display`：可选解析器。输入非法时抛出异常。
- `name` / `name_id`：主要用于为等价表示提供显示名称。

## `display_equiv`

```js
display_equiv: {
    compact: {
        name: 'Compact',
        plain: display_compact,
        from_display: parse_compact,
    },
}
```

对象键是等价表示的稳定 ID。它只改变显示和输入解析，不改变内部表达式、比较或基本列。

## `is_limit`

```ts
is_limit(expression: T): boolean;
```

返回 `true` 表示表达式可在树中展开基本列。它不等同于“是否为顶层 Infinity”。

## `compare`

```ts
compare(left: T, right: T): number;
```

只使用返回值符号：负数、小于；零、相等；正数、大于。实现必须覆盖表达式类型中的全部合法值。

## `FS`、`FS_alter`、`FS_short`

```ts
FS(expression: T, index: number): T;
```

`index` 是从 `0` 开始的基本列索引。三个变体签名相同：

- `FS`：默认基本列。
- `FS_alter`：可选替代展开。
- `FS_short`：可选短展开；省略时界面回退到默认变体。

实现不得修改输入表达式。使用 `Infinity` 作为顶层极限时应显式处理。非法索引应抛出异常。

## `init()`

```ts
init(): T[];
```

返回初始表达式数组，从大到小排列：

```js
init: () => [Infinity, []]
```

不要返回展开树节点或 UI 状态。

## `credit_text_id`

内置记号可引用一条或多条 i18n credit 键：

```js
credit_text_id: ['credit.author', 'credit.converter']
```

本地文件没有自定义 i18n 表，通常使用 `description` 写普通字符串。

## `debug`

可选调试对象。应用算法不能依赖它：

```js
debug: {
    find_bad_root,
    normalize,
}
```

## NotationCategoryDefinition

```ts
interface NotationCategoryDefinition {
    id: string;
    name: TextSpec;
    simple_name?: TextSpec;
    parent_id?: string;
    generator?: NotationCategoryGenerator;
}
```

- `id`：分类 ID，与所有记号和分类唯一。
- `name`：完整名称。
- `simple_name`：可选简称。
- `parent_id`：可选父分类。内置源码必须先注册父分类。
- `generator`：可选参数化记号生成器。

## NotationCategoryGenerator

```ts
interface NotationCategoryGenerator {
    start: number;
    initial: number;
    create: (index: number) => NotationDefinition<unknown>;
}
```

### `start`

首次初始化时生成的最小安全整数索引。

### `initial`

首次初始化时生成到的索引，必须满足 `initial >= start`。它也是 UI 减号可回退到的基线。

### `create`

根据索引返回完整记号定义。返回记号的 `category_id` 必须等于该生成器分类 ID，ID 必须随索引保持唯一。

当前生成器接口没有 `maximum` 字段。`+` 可以继续创建后续索引，因此 `create` 应自行校验安全整数和算法资源限制。

## DiagramControl

```ts
interface DiagramControl<T, Data> {
    default_data: Data;
    draw_diagram: (expression: T, data: Data) => Diagram | undefined;
    settings?: DiagramControlSetting[];
    handle_action?: (data: Data, action: DiagramAction) => Data | null;
}
```

图表函数返回结构化数据，不直接操作 DOM 或 canvas。

### Diagram

```ts
interface Diagram {
    width: number;
    height: number;
    elements: Element[];
    extra_text: ExtraText[];
}
```

`Element` 支持圆、线和文本。颜色可直接给 RGBA，也可引用主题颜色：

```ts
type ColorSpec = { type: string } | { color: Rgba };
```

完整字段见 `api.ts`。

## 最小注册示例

```js
;(() => {
    'use strict';

    register_category({
        id: 'example-family',
        name: 'Example family',
    });

    register_notation({
        id: 'example-natural',
        name: 'Natural example',
        category_id: 'example-family',
        display: {
            plain: (expression) => (expression === Infinity ? 'Limit' : String(expression)),
            from_display: (text) => (text.trim() === 'Limit' ? Infinity : Number(text)),
        },
        is_limit: (expression) => expression === Infinity,
        compare: (left, right) => (left === right ? 0 : left < right ? -1 : 1),
        FS: (expression, index) => (expression === Infinity ? index : Math.max(0, expression - 1)),
        init: () => [Infinity, 0],
    });
})();
```

更完整的数组表达式、解析、等价显示、缓存和生成器示例见 `template.js`。
