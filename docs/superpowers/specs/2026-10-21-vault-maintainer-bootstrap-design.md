# Vault Maintainer 独立工程初始化设计

**日期：** 2026-10-21
**状态：** 已按对话确认，进入初始化
**范围：** 独立 Agent Skill 与可运行的多 vault 基础能力

## 目标与边界

本仓库提供从文章 URL、Markdown 或网页剪藏导出，到长期 Markdown 知识库的 Agent Skill。第一版直接面向任意 Markdown/Obsidian vault。Open Context Forge 现有 vault 是一种可配置目标，不是默认目录结构。Skill 负责来源保存、证据分析、与已有知识比较、编译计划、稳定知识写回及本次校验；用户问答、文章写作、发布和桌面应用属于其他能力。

## 多 vault 选择

每次写入必须显式选择 vault：`--vault` 接受绝对或相对路径，也接受配置文件中的名称。`--config` 指定 JSON 配置文件；相对配置路径以配置文件所在目录解析。没有目标或名称不唯一时，在写入前失败。不读取“最近使用的 vault”，不从当前目录静默猜测目标。配置文件只保存名称与本地路径；目标 vault 内的元数据不含机器绝对路径。

## 空白 vault 的标准结构

仅对新目录或空目录执行初始化，重复初始化不会覆盖已有文件：

```text
<vault>/
  purpose.md
  schema.md
  raw/sources/
  wiki/index.md
  wiki/log.md
  .ocf/vault.json
  .ocf/ingest-manifest.json
```

`vault.json` 保存稳定 ID、格式版本和相对路径映射。`ingest-manifest.json` 保存来源记录。概念、论断和框架目录在首次需要时创建。`.obsidian/` 由 Obsidian 自己管理。

## 文章摄入契约

Agent 获取 URL 正文或读取用户给出的 Markdown，确认内容完整后调用确定性导入脚本。导入脚本保存原文快照并记录 SHA-256、来源 URL、相对路径与时间。同一内容再次导入返回既有来源，不重复写入；同一 URL 内容变化形成新快照并保留旧快照。后续分析卡引用快照指纹与精确行区间，编译计划说明新增、更新、跳过。Agent 写 Wiki 前检查同义笔记与证据；只对相关笔记做局部修改。无法取得完整正文或来源歧义时停在 raw/分析阶段，不制造确定性知识。

## 可移植性与校验

初始化后的标准 vault 可以直接摄入文章。已有 vault 由 `adopt-vault` 记录来源目录和知识笔记目录，只增加 `.ocf/` 状态及必要的来源目录，不修改既有笔记；其原有 frontmatter、索引和目录结构继续有效。基础校验按标准或接入模式分别检查 profile、manifest 与来源路径。Skill 还要求校验本次 Wiki 笔记的来源、证据和内部链接，并报告既有问题与本次问题。

## 验收

在临时目录验证新 vault 初始化、命名配置选择多个 vault、缺少目标时无写入、非空目录不被覆盖、Markdown 重复导入无新文件、同 URL 更新保留两个快照、来源路径越界被拒绝。Skill 结构通过官方 quick validator，测试使用 Node 内置运行器且无需外部依赖。
