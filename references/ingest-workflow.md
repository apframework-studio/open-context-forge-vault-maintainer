# 文章摄入与知识编译

## 1. 获取与保存来源

输入可以是 Markdown、剪藏导出或 URL。URL 先用当前环境可用的网页读取工具获取正文，检查标题、正文范围、文章末尾、发布日期等可得信息；只有摘要、登录提示或截断正文时，不按全文编译。保留原 URL；网页正文转为 Markdown 临时文件后调用 `import-markdown.js`。该脚本按原始字节计算 SHA-256，保存不可变快照并更新 manifest。同一内容重复导入返回已有快照；同一 URL 内容变化保留两个版本。若来源不完整，说明缺口并请求用户提供正文或剪藏文件。

导入时将内容归属与获取方式分开：用户明确表示亲自撰写时传 `--authorship self`，明确表示收集他人文章时传 `--authorship third_party`，否则省略并记录为 `unknown`。知道原文作者时传 `--author "姓名"`。不要仅凭本地 Markdown 或网页 URL 判断作者是谁。manifest 保存归属和作者，`origins` 保存 URL 与文件名。重复导入可把 `unknown` 补成已知归属；已知归属或作者发生冲突时停止并核对，不要静默覆盖。

若归属在编译后才补充，可用原始 Markdown 重复导入；原文件已不在时，改用 vault 内快照作为 `--file`，导入器不会把快照文件名记成新来源。按来源指纹找到 `.ocf/compilations/<fingerprint>/` 中已有分析卡和计划，并在知识笔记目录查找引用该快照或指纹的笔记。只更新相关归属和作者字段，保留其他内容；原文快照不变。接入已有 vault 时遵循其现有元数据惯例。

## 2. 一次完整语义阅读

读取目标 vault 的意图文件（若有）及与主题相关的既有笔记。运行：

```bash
node scripts/source-context.js --vault <vault> --source <raw-relative-path> --json
node scripts/source-context.js --vault <vault> --source <raw-relative-path> --lines "12:36,54:71" --json
```

第一条返回指纹、归属、作者和分段目录；第二条返回有界证据。逐段覆盖全文，包含无标题正文；不要把目录预览当作完整阅读。若读取范围超出上限，拆分行区间。

在 `.ocf/compilations/<fingerprint>/analysis.md` 使用 `assets/templates/source-analysis.md` 记录来源归属、作者、文章主张、证据索引、适用边界、与既有知识的关系及 `compile_now` / `defer` / `keep_raw_only` / `ask_user`。这些过程文件不属于 Wiki 长期笔记。

## 3. 查重与编译计划

用 profile 驱动的候选搜索查标题、术语、别名及反向观点，按需多次查询：

```bash
node scripts/vault-query.js --vault <vault> --query "主题或别名" --limit 10 --json
```

结果只是有界候选，必须阅读相关笔记再判断是否同义、补充或冲突；空结果也不证明没有重复。在 `.ocf/compilations/<fingerprint>/plan.md` 使用 `assets/templates/compilation-plan.md` 列出来源归属、作者、要创建、更新、跳过的笔记及证据 ID。分析卡的指纹与当前快照不一致时重新分析；后续阶段优先复用分析卡里的有界证据，只在证据不足时定向补读原文。

## 4. 写回与验证

计划为 `compile_now` 且证据充分时执行明确的写回。遵循 [知识笔记编译规则](note-writing.md)。标准 vault 可按 `assets/templates/` 创建来源摘要、concept、claim、framework；已有 vault 采用其既有知识组织方式。来源摘要回链快照；判断型笔记写明证据与边界；相关链接只指向实际存在的笔记。更新用户已有笔记时保留其 frontmatter 与无关段落。标准 vault 更新 `wiki/index.md` 并追加 `wiki/log.md`；已有 vault 只更新其实际使用的索引与日志。

运行 `node scripts/check-notes.js --vault <vault> --note <vault-relative-note.md> --json` 检查每个新增/修改的笔记，或省略 `--note` 检查整个知识笔记目录；再运行 `check-vault.js` 检查快照完整性。检查器识别 `path/to/source.md#L12-L18` 行证据、Markdown 本地链接/图片、Obsidian `[[wikilink]]` 和 `![[图片.png]]` 附件；标准 vault 笔记如果写了归属或作者字段，也会对照 manifest 查出过期值。它只能验证文件路径、行号、哈希、链接目标和元数据一致性，不核对标题锚点；Agent 还需核对证据是否支持结论，并确认索引更新。完成报告列出目标 vault、来源指纹、快照、创建/更新/跳过的笔记、校验结果及未决问题。
