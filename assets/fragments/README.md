# 填充物素材 · Fragment assets

把**透明背景的 PNG** 碎片图放进对应分类文件夹即可:

```
assets/fragments/
  glass/    玻璃碎片  *.png
  paper/    纸屑      *.png
  metal/    金属碎片  *.png
  plastic/  塑料碎片  *.png
  categories.json   分类定义(可改中文名)
  labels.json       (可选) 给单个素材自定义中文名/物理属性
```

## 加入新素材的步骤
1. 准备一张**透明 PNG**(建议正方形,主体居中,256–512px,背景透明)。
2. 命名用英文/拼音,例如 `amber.png`、`cobalt.png`。
3. 放进对应分类文件夹,如 `assets/fragments/glass/amber.png`。
4. 运行 `npm run fragments` —— 自动扫描并生成代码(`src/fragments/catalog.ts`)。
5. 重新加载 App,新素材就出现在「填充物」弹窗的对应分类页里。

## 自定义名称与物理属性(可选)
编辑 `labels.json`,按素材 id(`分类-文件名`)覆盖默认值:

```json
{
  "glass-amber": { "label": "琥珀玻璃", "size": 1.1, "opacity": 0.85, "weight": 1.0 },
  "metal-gold":  { "label": "金箔",     "size": 0.8, "opacity": 1.0,  "weight": 1.6 }
}
```

- `label`  显示名(默认取文件名)
- `size`   相对大小(默认 1.0)
- `opacity` 不透明度 0–1(默认按分类:玻璃 0.8 / 其它 1.0)
- `weight` 重量,影响重力下落与堆叠(默认 1.0)

> 注:`npm run fragments:samples` 会生成一批程序占位碎片用于测试,
> 收集到真实素材后直接覆盖同名文件、或删掉占位图再放自己的即可。
