# Open Context Forge Vault Maintainer

把文章保存为原文快照，再从中提炼有证据、能长期复用的 Markdown 知识笔记。这是 Open Context Forge 的“文档到知识库”阶段；检索问答、文章写作和发布尚不在本 Skill 的范围内。

它由三部分配合完成：

| 部分 | 负责什么 |
| --- | --- |
| [`SKILL.md`](SKILL.md) | 告诉智能体何时导入、怎样分析文章、查重和写回笔记 |
| `scripts/` | 选择 vault、初始化目录、保存原文快照、查找相关笔记、读取证据和校验 |
| 你的 vault | 保存原文、知识笔记和该 vault 自己的摄入记录 |

**只运行导入脚本不会自动生成知识笔记。** 完整的知识编译需要一个能读取本 Skill、运行 Node.js 脚本、访问来源和写入目标 vault 的智能体。运行环境需要 Node.js 20+；脚本没有第三方运行时依赖。

## 最快开始：直接在对话中使用

此方式不要求先安装 Skill。把下面提示词中的路径和文章地址换成自己的即可。每次都要明确目标 vault；多个 vault 之间不会自动猜选。

**第一次创建空白 vault：**

> 请读取 `/absolute/path/to/open-context-forge-vault-maintainer/SKILL.md`，按其中流程在 `/absolute/path/to/new-vault` 初始化一个空白知识库。用途是“整理 AI 工程实践”。运行脚本时以 Skill 所在目录为工作目录，并告诉我创建了哪些文件。

**把网页文章纳入已有 vault：**

> 请使用 `/absolute/path/to/open-context-forge-vault-maintainer/SKILL.md`，把 `https://example.com/article` 编译进 `/absolute/path/to/my-vault`。如果这个 vault 尚未接入，笔记在根目录，原文请放进 `Clippings/`。先检查网页正文是否完整，再保存原文、分析证据、查找相关旧笔记、制定编译计划，最后写回并校验。

**导入本地 Markdown：** 把网址替换成 `/absolute/path/to/article.md` 即可。如果只想收藏原文，明确说“只保存原文快照，不写知识笔记”。网页链接需要智能体具备读取网页的能力；只有摘要或截断正文时，Skill 不会把它当成全文编译。

完成一次完整编译后，目标 vault 通常会有原文快照、`.ocf/compilations/` 中的分析卡与计划，以及新建或更新的知识笔记。标准 vault 还会更新 `wiki/index.md` 和 `wiki/log.md`。智能体应先查相关旧笔记，再决定新增或局部更新，并报告实际创建、更新、跳过的文件和未解决的问题。

## 让 Codex 以后按 Skill 名称调用

把整个工程目录链接到个人 Skill 目录，保留其中的 `scripts/`、`references/` 和 `assets/`：

```bash
mkdir -p "$HOME/.agents/skills"
ln -s "/absolute/path/to/open-context-forge-vault-maintainer" "$HOME/.agents/skills/open-context-forge-vault-maintainer"
```

随后可以在 Codex 中说：

> 使用 `$open-context-forge-vault-maintainer`，把 `/absolute/path/to/article.md` 纳入 `/absolute/path/to/my-vault`，完成知识编译并校验。

Codex 支持从个人或仓库的 `.agents/skills/` 发现 Skill，也支持符号链接。如果只想让某个项目使用，就把链接放在该项目的 `.agents/skills/` 下。若刚安装后未出现，重新打开 Codex。参见 [OpenAI 的 Skill 文档](https://learn.chatgpt.com/docs/build-skills)。安装仅解决 Skill 发现问题，目标 vault 仍需在每次任务中指定。

## 管理多个 vault

真实的 vault 路径建议保存在工程外的个人配置文件，例如 `~/.config/open-context-forge/vaults.json`。本仓库只提供 [`config/vaults.example.json`](config/vaults.example.json)，不会自动创建或记住你的个人配置。

```json
{
  "vaults": {
    "research": { "path": "/absolute/path/to/research-vault" },
    "reading": { "path": "/absolute/path/to/reading-vault" }
  }
}
```

配置好以后，在对话中说“目标 vault 是 `research`，配置文件是 `/absolute/path/to/vaults.json`”。智能体应把两者分别作为 `--vault research --config /absolute/path/to/vaults.json` 传给脚本。也可以给智能体运行环境设置 `OCF_VAULT_CONFIG`，省去重复传 `--config`；**`--vault` 仍然必须明确指定**。配置中的相对路径以配置文件所在目录为基准；直接传相对目录时用 `./` 或 `../` 开头，裸名称按配置名称解析。

例如：“使用 `$open-context-forge-vault-maintainer`，把 `/absolute/path/to/article.md` 纳入 `research`；vault 配置文件是 `/absolute/path/to/vaults.json`。”

配置文件是长期有效的路径记录。智能体可以在你提供路径后帮你创建或维护它，但不应仅靠对话记忆保存 vault 映射。每个 vault 内的 `.ocf/vault.json` 只记录该 vault 的目录布局，不代替多 vault 配置文件。

## 接入其他智能体

如果智能体平台支持 Agent Skills，将**整个工程目录**注册为一个 Skill；如果不支持，至少让智能体读取 [`SKILL.md`](SKILL.md)，并能访问同目录的 `references/`、`assets/` 和 `scripts/`。集成时提供：

1. Node.js 20+ 和运行本地脚本的能力。脚本示例以 Skill 根目录为工作目录；从其他目录运行时，改用脚本的绝对路径。
2. 对文章 Markdown 与目标 vault 的文件读写能力。处理 URL 时，还需网页读取能力；导入脚本本身不抓取网页。
3. 每次任务的 `--vault` 值；使用名称时，再提供 `--config` 路径或 `OCF_VAULT_CONFIG`。

如果平台需要一段固定的智能体说明，可以使用下面的内容，再把路径换成实际值：

> 当用户要求把 URL 或 Markdown 纳入知识库时，读取 `/absolute/path/to/open-context-forge-vault-maintainer/SKILL.md` 并遵循其中流程。以该目录为工作目录运行脚本。多 vault 配置文件位于 `/absolute/path/to/vaults.json`。每次操作都从用户请求中取得 vault 名称或路径，不自行选择默认 vault；使用名称时将配置文件路径传给 `--config`。URL 正文要先获取并检查完整性，再交给导入脚本。

集成后的顺序是：首次初始化新 vault 或接入已有 vault → 获取完整文章并导入原文快照 → 按 Skill 做证据分析与查重 → 写回知识笔记 → 校验。详细判断规则见 [摄入与编译流程](references/ingest-workflow.md)。此工程是文件型 Skill，不提供常驻服务或 HTTP 接口。

## 手动运行脚本时

以下命令都在 Skill 工程根目录运行。新目录直接初始化；已有 vault 先确认笔记目录，再接入。笔记就在 vault 根目录时使用 `--wiki-dir .`。

```bash
# 新 vault：运行这一条
node scripts/init-vault.js --vault /absolute/path/to/new-vault --purpose "知识库用途" --json
# 已有 vault：改为运行这一条
node scripts/adopt-vault.js --vault /absolute/path/to/existing-vault --sources-dir Clippings --wiki-dir . --json
# 完成初始化或接入后，再导入本地 Markdown、查找候选笔记并校验
node scripts/import-markdown.js --vault /absolute/path/to/vault --file /absolute/path/to/article.md --json
node scripts/vault-query.js --vault /absolute/path/to/vault --query "文章主题" --limit 10 --json
node scripts/check-notes.js --vault /absolute/path/to/vault --json
node scripts/check-vault.js --vault /absolute/path/to/vault --json
```

初始化只接受新目录或空目录；接入命令保留已有笔记。`import-markdown.js` 按内容哈希保存不可变快照，同一内容重复导入不会生成第二份，同一网址内容变化则保留新旧版本。

同一 vault 同时只允许一次导入。若提示导入正在进行，等待后重试；若进程异常退出留下 `.ocf/ingest.lock`，先确认没有导入进程，再移走锁文件。快照已写入但 manifest 未登记时，用同一文件重新导入可恢复登记。

`vault-query.js` 只返回相关候选，智能体还需要阅读后判断是否重复或冲突。`check-notes.js` 检查本地链接、图片、Obsidian 双链和 `raw/sources/article.md#L12-L18` 形式的证据行号；标准 vault 还检查编译笔记的来源字段及快照哈希。接入已有 vault 时不强加标准 frontmatter。`check-vault.js` 检查 vault 配置、必要文件、manifest 和原文快照哈希。自动检查无法判断证据是否真正支持结论，索引内容也仍需智能体复核。开发时可运行 `npm test`，Skill 元数据可用 Codex Skill Creator 的 `quick_validate.py` 校验。
