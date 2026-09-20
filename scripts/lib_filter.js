#!/usr/bin/env node
/**
 * lib_filter.js —— 素材「话题白名单」过滤
 *
 * 这个素材库是给英语精读用的，主题应当落在语言学习本身。
 * 凡是政治、主权、军事冲突、宗教、族群、选举、移民等争议性内容，
 * 无论来源多权威（The Economist / TED 都有大量这类选题），一律不收录。
 *
 * 用法：isSensitive(title) / isSensitive(title + " " + rubric)
 *   —— 命中即跳过该篇，不做改写、不做摘要。
 */
const SENSITIVE_PATTERNS = [
  // 主权 / 领土 / 涉华政治
  /\btaiwan\b/i, /\bhong kong\b/i, /\bmacao\b/i, /\btibet\b/i, /\bxinjiang\b/i, /\buyghurs?\b/i,
  /\bxi jinping\b/i, /\bccp\b/i, /\bcommunist party\b/i, /\bbeijing'?s (?:claims|ambitions|grip)\b/i,
  /\bsovereignty\b/i, /\bterritorial (?:dispute|claim)\b/i, /\bstrait\b.*\bnavy\b/i, /\bhellscape\b/i,
  // 战争 / 军事 / 恐怖
  /\bwars?\b/i, /\bwarfare\b/i, /\bmilitary\b/i, /\binvasion\b/i, /\bmissiles?\b/i, /\bnato\b/i,
  /\b(?:ukraine|russia|putin|kremlin|zelensky)\b/i, /\b(?:israel|palestin\w*|gaza|hamas|hezbollah|zionis\w*)\b/i,
  /\b(?:al-?qaeda|isis|terroris\w*|jihad\w*)\b/i, /\bdrone strike\b/i, /\bnuclear (?:weapons?|arms)\b/i,
  // 政治人物 / 选举 / 政党
  /\b(?:trump|biden|harris|obama|modi|macron|erdogan|le pen|farage|burnham|vance|hegseth|kushner|mamdani|sanders|desantis|newsom)\b/i,
  /\brepublicans?\b/i, /\bdemocrats?\b/i, /\bdemocrac\w+\b/i, /\belections?\b/i, /\belectoral\b/i,
  /\bballots?\b/i, /\bvoting\b/i, /\bvoters?\b/i, /\bparliament\b/i, /\bpolitburo\b/i, /\bautocra\w+\b/i,
  /\bpolitics\b/i, /\bpolitical\b/i, /\bparties\b/i, /\bcoalition\b/i,
  /\bdictators?\b/i, /\bregimes?\b/i, /\bpropaganda\b/i, /\bcensorship\b/i, /\bsurveillance\b/i,
  /\bactivists?\b/i, /\bactivis\w+\b/i, /\bgeopolitic\w+\b/i, /\bsanctions?\b/i, /\bdiploma\w+\b/i,
  /\bpopulists?\b/i, /\bpopulism\b/i, /\biran\b/i, /\bhouthis?\b/i, /\bchoke ?point\b/i,
  /\binfiltrators?\b/i, /\bborder\b/i, /\bobituar\w+\b/i, /\bsummit\b/i, /\btreaty\b/i,
  // 中美 / 台海等大国博弈语境（与「主权」同源的表述）
  /\bchina\b[^.]{0,40}\b(?:america|american|u\.s\.?|united states|taiwan|military|communist|hegemon\w*)\b/i,
  /\b(?:america|american|u\.s\.?|united states)\b[^.]{0,40}\b(?:china|chinese|beijing)\b/i,
  // 宗教 / 族群 / 性别 / 身份政治
  /\breligio\w+\b/i, /\bchurches?\b/i, /\bmosque\b/i, /\b(?:muslim|jewish|jews|christian|islam|hindu|buddhis\w+)\b/i,
  /\bzionism\b/i, /\bracis\w+\b/i, /\bracial\b/i, /\bsegregation\b/i, /\bslavery\b/i,
  /\bminorit(?:y|ies)\b/i, /\bgender\b/i, /\blgbtq?\b/i, /\btransgender\b/i, /\bfeminis\w+\b/i,
  // 移民 / 难民 / 边境
  /\bimmigra\w+\b/i, /\bmigrants?\b/i, /\brefugees?\b/i, /\basylum\b/i, /\bborder (?:wall|crisis)\b/i,
  /\bdeporta\w+\b/i, /\bvisa\b.*\bban\b/i,
  // 犯罪 / 司法 / 药品管制等社会争议
  /\bdeath penalty\b/i, /\bgun control\b/i, /\babortion\b/i, /\bpolice (?:shooting|brutality)\b/i,
  /\bprisons?\b/i, /\bprisoners?\b/i, /\bmafia\b/i, /\bgangsters?\b/i, /\bmobster\b/i, /\bcartels?\b/i,
  /\bpolicing\b/i, /\bpolice\b/i, /\bbrutal\b/i, /\bbessent\b/i, /\bmining\b/i,
  /\bdecompose\b/i, /\bcadaver\w*\b/i, /\bcorpses?\b/i, /\bmurders?\b/i, /\bshootings?\b/i,
  /\bdrug (?:war|trafficking)\b/i, /\bdrugs?\b/i, /\bopioids?\b/i, /\bcriminals?\b/i, /\bcrimes?\b/i
];

/** 命中任一敏感模式即返回 true（含标题/副标题） */
function isSensitive() {
  for (let i = 0; i < arguments.length; i++) {
    const s = String(arguments[i] == null ? "" : arguments[i]);
    if (!s) continue;
    for (let j = 0; j < SENSITIVE_PATTERNS.length; j++) {
      if (SENSITIVE_PATTERNS[j].test(s)) return true;
    }
  }
  return false;
}

/** 便于排查：返回命中的模式源串 */
function firstHit() {
  for (let i = 0; i < arguments.length; i++) {
    const s = String(arguments[i] == null ? "" : arguments[i]);
    if (!s) continue;
    for (let j = 0; j < SENSITIVE_PATTERNS.length; j++) {
      if (SENSITIVE_PATTERNS[j].test(s)) return SENSITIVE_PATTERNS[j].source;
    }
  }
  return "";
}

module.exports = { isSensitive, firstHit, SENSITIVE_PATTERNS };
