# Vault 选择与布局

## 多 vault 配置

配置文件是 JSON，格式见 `config/vaults.example.json`。`vaults` 下每个名称对应字符串路径或 `{ "path": "..." }`。配置中的相对路径以配置文件所在目录为基准；`--vault` 必须显式给名称或路径。直接传相对路径时使用 `./` 或 `../` 前缀，裸名称按配置名称解析。`OCF_VAULT_CONFIG` 可以指定配置文件位置。

## 新建标准 vault

`init-vault.js` 建立：

```text
purpose.md
schema.md
raw/sources/
wiki/index.md
wiki/log.md
.ocf/vault.json
.ocf/ingest-manifest.json
```

`purpose.md` 记录收录目标。`schema.md` 记录来源、编译笔记和链接规则。`raw/sources/` 保留不可变快照；`wiki/` 保存长期知识；`index.md` 是导航，`log.md` 追加变更。`.ocf/` 保存稳定 vault ID、相对目录映射和内容哈希，不保存本机绝对路径。新类别目录在首次使用时创建。

## 接入现有 vault

先确定一个已存在的知识笔记目录，再选择一个 vault 内的来源目录；来源目录可以由接入命令创建。接入只新增 `.ocf/` 状态和必要来源目录。现有 vault 可没有 `purpose.md`、`schema.md`、`index.md` 或 `log.md`；如果它已有相关文件，则按其惯例使用。接入前检查目标目录是否已存在 `.ocf/`，避免重复或覆盖。
笔记位于 vault 根目录时传 `--wiki-dir .`；检索候选笔记时排除来源目录与 `.ocf/`，避免把快照或过程文件当作长期笔记。

配置文件负责从名称解析到本地路径；vault 内 profile 负责其相对目录结构。需要改变目录映射时，先检查现有 manifest 和文件引用，再局部更新 profile。
