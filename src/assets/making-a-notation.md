# 编写标准 ne-rewritten 记号文件

本文档描述当前应用唯一支持的本地记号格式。完整类型见 `api.md` 和 `api.ts`，可运行示例见内置的 `template.js`。

## 1. 文件模型

本地记号是一个自包含的 JavaScript 文件。运行时只向文件注入两个注册函数：

```js
register_notation(definition);
register_category(category);
```

不要使用 `import`、`export`，也不要依赖另一个本地文件中的变量。建议用 IIFE 隔离内部函数：

```js
;(() => {
    'use strict';

    function display(expression) {
        return expression === Infinity ? 'Limit' : String(expression);
    }

    register_notation({
        id: 'my-notation',
        name: 'My notation',
        display: {
            plain: display,
            from_display(text) {
                return text.trim() === 'Limit' ? Infinity : Number(text);
            },
        },
        is_limit: (expression) => expression === Infinity,
        compare: (left, right) => (left === right ? 0 : left < right ? -1 : 1),
        FS: (expression, index) => (expression === Infinity ? index : Math.max(0, expression - 1)),
        init: () => [Infinity, 0],
    });
})();
```

`init()` 直接返回表达式数组，不返回 UI 树节点。通常从最大项到最小项排列，例如 `[Infinity, 0]` 或 `[Infinity, []]`。

## 2. 必填字段

```ts
interface NotationDefinition<T> {
    id: string;
    name: string;
    display: NotationDisplaySpec<T>;
    is_limit: (expression: T) => boolean;
    compare: (left: T, right: T) => number;
    FS: (expression: T, index: number) => T;
    init: () => T[];
}
```

### `id`

稳定且唯一的注册 ID。记号和分类共用同一个 ID 空间。修改 ID 会让应用把它视为另一个记号。

建议只使用小写字母、数字和连字符：

```js
id: 'my-prss'
```

### `name` 与 `simple_name`

`name` 是完整名称，`simple_name` 是文件夹和紧凑 UI 中使用的可选简称。本地文件应直接写普通字符串。

### `display`

简写形式只提供纯文本函数：

```js
display: (expression) => String(expression)
```

推荐使用完整形式：

```js
display: {
    plain: (expression) => String(expression),
    html: (expression) => '<b>' + expression + '</b>',
    latex: (expression) => '\\mathbf{' + expression + '}',
    from_display: (text) => Number(text),
}
```

- `plain` 必填，用于纯文本、工具输出和 xlsx。
- `html` 可选；省略时使用 `plain`。
- `latex` 可选，返回不带 `$...$` 的 KaTeX 源；省略时从受支持的 HTML 转换。
- `display.from_display` 可选，但需要导航输入、直接展开或 xlsx 导入时应实现。解析失败必须抛出异常。

### `is_limit`

判断表达式是否应继续显示基本列。它判断的是表达式对应的序数是否为极限项，不是“是否等于顶层 `Infinity`”。

### `compare`

三路比较函数。只要求返回值的符号正确：

```js
compare(left, right) < 0  // left < right
compare(left, right) === 0
compare(left, right) > 0  // left > right
```

表达式使用 `Infinity` 作为顶层极限时，比较函数必须显式处理它。

### `FS`

`FS(expression, index)` 返回第 `index` 个基本列项，`index` 从 `0` 开始。实现应满足：

- 对非负安全整数索引有确定结果。
- 不修改传入表达式。
- 返回值与当前记号的表达式类型一致。
- 对 `Infinity` 有明确规则。
- 非法表达式或索引直接抛出异常。

可用闭包或 `Map` 缓存，但返回数组、矩阵等可变对象时应避免让调用方修改缓存本体。

### `init()`

返回初始表达式，从大到小排列：

```js
init: () => [Infinity, []]
```

应用负责创建展开树、下界和子节点。记号文件不应创建 UI 节点。

## 3. 可选字段

```js
{
    simple_name: 'Short name',
    description: 'Description',
    category_id: 'my-category',
    display_equiv: {
        compact: {
            name: 'Compact',
            plain: compact_display,
            from_display: parse_compact,
        },
    },
    FS_alter: alternate_fundamental_sequence,
    FS_short: short_fundamental_sequence,
    credit_text_id: 'credit.example',
    debug: { inspect_internal_state },
}
```

- `display_equiv` 的键是稳定的等价表示 ID，每项仍是标准显示定义。
- `FS_alter`、`FS_short` 分别提供额外展开变体。
- `description`、`credit_text_id` 主要用于内置记号；本地文件可直接使用字符串描述。
- `draw_diagram` 需要返回标准 Diagram 数据，详细类型见 `api.ts`。

## 4. 分类

先注册父分类，再注册子分类或记号：

```js
register_category({
    id: 'my-family',
    name: 'My notation family',
    simple_name: 'My family',
});

register_notation({
    id: 'my-family-first',
    name: 'First notation',
    category_id: 'my-family',
    display: (expression) => String(expression),
    is_limit: () => false,
    compare: (left, right) => left - right,
    FS: (expression) => expression,
    init: () => [0],
});
```

## 5. 生成类记号

参数化记号族通过带 `generator` 的分类定义：

```js
function create_demo(index) {
    return {
        id: 'my-generated-' + index,
        name: index + '-generated demo',
        category_id: 'my-generated-family',
        display: (expression) => String(expression),
        is_limit: (expression) => expression === Infinity,
        compare: (left, right) => (left === right ? 0 : left < right ? -1 : 1),
        FS: (expression, fs_index) => (expression === Infinity ? index * fs_index : 0),
        init: () => [Infinity, 0],
    };
}

register_category({
    id: 'my-generated-family',
    name: 'Generated demo family',
    generator: {
        start: 1,
        initial: 3,
        create: create_demo,
    },
});
```

规则：

- 加载时创建 `start` 到 `initial` 的所有变体。
- `create(index)` 返回完整的标准记号定义。
- 返回对象的 `category_id` 必须等于生成器分类 ID。
- 生成器分类下不能再直接注册普通记号。
- `+` 创建下一个索引；`-` 只移除超过 `initial` 的附加项。
- 当前 API 没有 `maximum` 字段。
- 生成器当前索引保存在应用设置中。

内置的 `template.js` 同时注册标准 PrSS 和一个按步长生成的 PrSS 演示族，可直接在本地编辑器中修改。

## 6. 本地文件生命周期

在“设置 → 本地记号文件”中：

1. 新建模板或上传 `.js` 文件。
2. 在编辑器中检查并保存源码。
3. 文件默认不会因保存而自动执行；通过文件开关信任并启用。
4. 已启用文件保存成功后会事务替换其全部注册项。
5. 替换失败时保留旧的运行版本，并在文件中记录错误。
6. 禁用会卸载该文件的分类、普通记号和生成记号，但保留源码。
7. 刷新页面会恢复已信任且启用的文件。

本地文件、草稿、信任状态和启用状态保存在 `nerw-local-notation-files`。使用 `?no-local-files` 打开页面时仍可管理文件，但本次页面加载不执行它们。

## 7. 验证清单

启用前至少检查：

- 所有 ID 唯一且稳定。
- `display.plain` 与 `display.from_display` 能往返常用表达式。
- `compare` 对相等、大小和 `Infinity` 正确。
- `FS` 不修改输入，且 `FS(expression, 0)` 有定义。
- `init()` 返回表达式数组。
- 生成器的 `start`、`initial` 是安全整数，且 `initial >= start`。
- 通过直接展开测试若干基本列。
- 使用 `detect_inf_chain` 检查明显的无限下降链。

完整仓库结构、内置 TypeScript 写法和测试流程见 `notation-dev-guide.md`。
