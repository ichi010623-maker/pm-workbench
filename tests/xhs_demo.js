// 样例演示：用真实运行的 js/xhs.js，在 Node 中跑通「小红书爆款笔记」完整链路
// 链路：泛化词门控 → 15分评分检索 → 细分赛道推荐 → 存入「我的拆解」→ 生成 HTML 报告
// 说明：无 AI Key 时走内置规则兜底（xhsIsGenericRule / xhsSubtrackRule），与线上无 Key 行为一致；
//       配置国内免费智谱 Key 后，意图识别/子赛道推荐会自动改用大模型（callLLMForPrompt→zhipu）。

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = '/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench';

// ---- 浏览器/DOM/DB 桩 ----
const store = { growth: { xhs: { history: [], subscriptions: [], source: 'demo', redfoxKey: '' }, videos: { items: [] } } };
function mkContext() {
  const ctx = {};
  ctx.window = {};
  ctx.document = {
    getElementById: () => null,
    createElement: () => ({ click() {}, set href(v) {}, set download(v) {}, appendChild() {} }),
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {}
  };
  ctx.DB = { data: store, save() {} };
  ctx.localStorage = { getItem: () => null, setItem() {} };
  ctx.today = () => '2026-08-07';
  ctx.addDays = (d, n) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
  ctx.loadAiConfig = () => ({ provider: 'zhipu', apiKey: '' }); // 无 Key → 规则兜底
  ctx.callLLMForPrompt = async () => { throw new Error('no-key'); };
  ctx.parseIntelLLM = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };
  ctx.uid = () => Math.random().toString(36).slice(2, 10);
  ctx.formatCount = (n) => n.toLocaleString('en-US');
  ctx.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  ctx.showToast = () => {}; ctx.openModal = () => {}; ctx.closeModal = () => {}; ctx.alert = () => {};
  Object.assign(ctx, { console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Promise, Error, parseInt, parseFloat });
  return ctx;
}

const ctx = mkContext();
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/xhs.js'), 'utf8'), ctx);

(async () => {
  const out = { generatedAt: new Date().toISOString() };

  // ===== 链路 1：泛化词门控（skill 招牌能力）=====
  const kwGen = '数码';
  const intent = await ctx.xhsDetectIntent(kwGen);
  out.genericGate = {
    keyword: kwGen,
    isGeneric: intent.isGeneric,
    byLLM: intent.byLLM,
    subTracks: intent.subTracks
  };

  // ===== 链路 2：15 分评分检索（特定细分赛道）=====
  const kw = '手机摄影';
  const payload = ctx.xhsSearchDemo(kw, 30);
  // 把文章塞进 window.__xhsNotes（线上由 xhsRenderResults 完成），供「＋拆解」取用
  ctx.window.__xhsNotes = {};
  payload.articles.forEach(a => { ctx.window.__xhsNotes[a.id] = a; });
  out.search = {
    keyword: kw,
    rangeLabel: '近30天',
    source: payload.source,
    note: payload.note,
    count: payload.articles.length,
    articles: payload.articles.map(a => ({
      title: a.title, author: a.author,
      engagement: a.engagement, likes: a.likes, comments: a.comments, saves: a.saves,
      relevance: a.relevance, heat: a.heat, timeliness: a.timeliness, totalScore: a.totalScore,
      publishTime: a.publishTime
    })),
    relatedSearches: payload.relatedSearches,
    latestHotTop5: payload.latestHotArticles.slice(0, 5).map(a => a.title)
  };

  // ===== 链路 3：细分赛道推荐（空关键词/特定词的表现）=====
  out.subTrackRec = {
    genericTerm: { kw: '数码', tracks: ctx.xhsSubtrackRule('数码') },
    specificTerm: { kw: '手机摄影', tracks: ctx.xhsSubtrackRule('手机摄影') }
  };

  // ===== 链路 4：存入「我的拆解」（xhsSaveNote 实跑）=====
  const topId = payload.articles[0] ? payload.articles[0].id : null;
  if (topId) {
    ctx.xhsSaveNote(topId);
    out.savedToVideos = store.growth.videos.items.map(v => ({
      id: v.id, xhsId: v.xhsId, title: v.title, platform: v.platform, category: v.category,
      likes: v.likes, comments: v.comments, saves: v.saves, date: v.date
    }));
  }

  // ===== 链路 5：生成 HTML 报告（与线上「下载 HTML 报告」同模板）=====
  const fname = (kw || 'hot').replace(/[^\w一-龥]/g, '_') + '_热门数据.html';
  const rows = (payload.articles || []).map(function (a, i) {
    return '<tr><td>' + (i + 1) + '</td><td>' + ctx.escapeHtml(a.title) + '</td><td>' + ctx.escapeHtml(a.author) + '</td><td>' + (a.engagement || 0) + '</td><td>' + ctx.escapeHtml(a.publishTime) + '</td>' +
      (payload.isHot ? '' : '<td>' + (a.relevance != null ? a.relevance.toFixed(1) : '-') + '</td><td>' + (a.heat != null ? a.heat.toFixed(1) : '-') + '</td><td>' + (a.timeliness != null ? a.timeliness.toFixed(1) : '-') + '</td><td><b>' + (a.totalScore != null ? a.totalScore.toFixed(1) : '-') + '</b></td>') + '</tr>';
  }).join('');
  const head = payload.isHot ? '<tr><th>#</th><th>标题</th><th>作者</th><th>互动数</th><th>发布时间</th></tr>'
    : '<tr><th>#</th><th>标题</th><th>作者</th><th>互动数</th><th>发布时间</th><th>相关性</th><th>热度</th><th>时效</th><th>总分</th></tr>';
  const reportHtml = "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'><title>" + ctx.escapeHtml(kw) + " 热门数据</title>" +
    "<style>body{font-family:-apple-system,'PingFang SC',sans-serif;padding:24px;color:#222}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}th{background:#fff0f5}.t{color:#ff4d8d;font-size:12px;margin-top:8px}.rec{margin-top:14px;font-size:13px}.rec b{color:#ff4d8d}</style></head><body>" +
    "<h2>📊 " + ctx.escapeHtml(kw) + " 热门数据报告</h2>" +
    "<div class='t'>生成时间：" + new Date().toLocaleString() + " ｜ 时间范围：近30天" + (payload.source === 'demo' ? ' ｜ 示例数据（非真实抓取）' : '') + "</div>" +
    "<table><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>" +
    "<div class='rec'>拓词推荐：" + (payload.relatedSearches || []).join('、') + "</div>" +
    "<div class='t'>" + ctx.escapeHtml(payload.note || '') + "</div></body></html>";
  const reportPath = path.join(ROOT, 'samples', fname);
  fs.writeFileSync(reportPath, reportHtml, 'utf8');
  out.reportFile = reportPath;

  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('DEMO ERROR:', e); process.exit(1); });
