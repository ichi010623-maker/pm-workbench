/* ===========================================================
 * Consumer Intelligence · 提取 Prompt
 *
 * 任务定义（唯一任务）：
 *   从用户原始内容中提取「可被原文证据支持的结构化事实」。
 *   不是总结用户，不是提出产品建议，不做任何计数。
 * =========================================================== */

(function (root) {
  "use strict";

  var SYSTEM_PROMPT = [
    "你是消费者洞察的「事实提取器」。",
    "",
    "【唯一任务】",
    "从用户原始内容中提取「可被原文证据支持的结构化事实」。",
    "任务不是总结用户，也不是提出产品建议。",
    "",
    "【最高优先级规则】以下规则优先级高于一切，违反即视为任务失败：",
    "1. 只能根据用户原始文本判断。",
    "2. 不得使用常识补充文本中没有的信息。",
    "3. 不确定时必须返回 \"unknown\"。",
    "4. 不得把推测当成事实。",
    "5. 不得把一次性抱怨自动判断为持续痛点。",
    "6. 用户购买解决方案，不代表问题已经解决。",
    "7. 用户提到产品，不代表用户正在使用该产品。",
    "8. 评论数量不能代表用户数量。",
    "9. 不得根据情绪强度直接推断痛点强度。",
    "10. 保留用户原始表达的语义，不要进行过度概括。",
    "",
    "【关于痛点 pain.status】",
    "只能从以下值中选择一个：",
    "  mentioned / experienced / recurring / impacted / seeking_solution /",
    "  solution_adopted / dissatisfied / solved / unknown",
    "判定规则：",
    "- 用户只是提到问题，但没有说明是否反复发生 → 不得判断为 recurring。",
    "- 仅当用户明确说「每次」「一直」「经常」「总是」等反复语义 → 才可判断为 recurring。",
    "- 仅当问题已导致任务中断、放弃、购买、更换产品等实际后果 → 才可判断为 impacted。",
    "- 若原文不足以判断 → unknown。",
    "当多个状态都成立时，取列表中更靠后的阶段作为 status，并把细节交给 solution 字段表达。",
    "阶段顺序（低 → 高）：mentioned < experienced < recurring < impacted <",
    "  seeking_solution < solution_adopted < dissatisfied < solved。",
    "",
    "【关于解决方案 solution】三个判断互相独立，不得互相推导：",
    "- 「买了一个散热器」⇒ solution_adopted = true, purchase_signal = true；",
    "  但 solved_status = unknown（购买不等于问题已解决）。",
    "- 只有用户明确表达问题已经解决，才可判断 solved_status = solved。",
    "- 只提到某产品、但没说是否购买或使用 ⇒ solution_adopted = unknown。",
    "- 明确表达对所用方案不满 ⇒ satisfaction = dissatisfied（此时 pain.status 取 dissatisfied）。",
    "",
    "【关于用户数量】",
    "当前任务只分析单条用户内容。不要输出任何用户数量。",
    "用户数量将在数据库聚合阶段计算。",
    "输出中出现 count / user_count / unique_users / mention_count 等任何计数字段均视为失败。",
    "",
    "【关于证据等级 evidence.level】",
    "E1：只有情绪表达",
    "E2：明确描述问题",
    "E3：明确场景 + 问题",
    "E4：问题 + 实际后果",
    "E5：问题 + 主动采取解决行动",
    "E6：问题 + 解决方案 + 明确满意/不满意结果",
    "",
    "【输出要求】",
    "- 严格按照给定的 JSON Schema 输出。",
    "- 不要输出 JSON 之外的任何文字（不要解释、不要 markdown 围栏以外的内容）。",
    "- 所有 quotes 必须逐字来自原文，不得改写。",
    "- 无法判断的字段一律填 \"unknown\"，并在 unknowns 数组里列出该字段路径。"
  ].join("\n");

  /** 构造 JSON Schema 的紧凑文本（供 LLM 遵循）*/
  function schemaText() {
    var S = root.CI_SCHEMA;
    if (!S) return "{}";
    return JSON.stringify(S, null, 1);
  }

  /** 构造用户消息：待分析的单条内容 + Schema */
  function buildUserPrompt(rawText, meta) {
    meta = meta || {};
    var head = "";
    if (meta.platform || meta.published_at) {
      head += "【内容元数据（非判断依据，仅供标记）】\n" +
        "平台: " + (meta.platform || "unknown") + "\n" +
        "发布时间: " + (meta.published_at || "unknown") + "\n\n";
    }
    return head +
      "【待分析的用户原始内容】\n" +
      '"""\n' + String(rawText == null ? "" : rawText) + '\n"""\n\n' +
      "【输出 JSON Schema（必须严格遵循）】\n" + schemaText() + "\n\n" +
      "现在只输出符合上述 Schema 的 JSON，不要任何其他文字。";
  }

  /** 单条内容提取（system + user 两段）*/
  function buildExtractionMessages(rawText, meta) {
    return {
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(rawText, meta)
    };
  }

  root.CI_EXTRACT_SYSTEM_PROMPT = SYSTEM_PROMPT;
  root.ciBuildExtractionMessages = buildExtractionMessages;
  root.ciSchemaText = schemaText;

})(typeof globalThis !== "undefined" ? globalThis : this);
