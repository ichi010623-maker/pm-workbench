// ============================================================================
// 📈 投资理财模块（资产分布 · 盈亏记录 · 走势图 · 行情看板 · 每日选股 · 股票小知识）
// 数据键：DB.data.growth.invest（由旧 growth.account 迁移）
// 层级设计：概览页仅展示主要信息（一级），点击进入「资产 / 持仓盈亏 / 行情」查看详情。
// ============================================================================

var investTab = "overview"; // overview | assets | holdings | market
window.__investFeed = null; // 每日 invest.json（Supabase / 本地回退）
window.__invPicks = [];
window.__invTip = null;
window.__invIndices = [];

// ---------- 预设 ----------
var INVEST_COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#ff6b9d", "#5ac8fa", "#a0e040"];
var INVEST_ASSET_CATS = ["现金存款", "股票基金", "房产", "黄金", "数字货币", "债券", "保险", "其他"];
var INVEST_MARKETS = ["A股", "港股", "美股", "ETF", "基金", "其他"];

// 大盘指数（实时刷新用东方财富 secid；失败时回退到 invest.json / 默认值）
var INVEST_INDICES = [
  { name: "上证指数", secid: "1.000001" },
  { name: "深证成指", secid: "0.399001" },
  { name: "创业板指", secid: "0.399006" },
  { name: "恒生指数", secid: "100.HSI" },
  { name: "标普500", secid: "100.SPX" }
];

// 每日三支潜力股备选池（按日期确定性轮换，确保离线也有内容；自动化 invest.json 可覆盖）
var INVEST_PICKS_POOL = [
  { code: "600519", name: "贵州茅台", market: "A股", reason: "高端白酒龙头，品牌壁垒深、现金流稳健，渠道库存逐步良性。", suggestion: "中长期价值标的，可逢回调分批布局，注意估值高位波动。", risk: "消费复苏不及预期、批价回落。" },
  { code: "300750", name: "宁德时代", market: "A股", reason: "全球动力电池龙头，储能与海外放量打开第二增长曲线。", suggestion: "关注一季报与海外订单兑现，适合成长风格逢低配置。", risk: "行业价格战、原材料锂价大幅波动。" },
  { code: "000858", name: "五粮液", market: "A股", reason: "次高端白酒代表，产品矩阵完善，动销环比改善。", suggestion: "估值回落至合理区间可关注，宜分批而非一次性重仓。", risk: "商务需求走弱、库存去化慢。" },
  { code: "601318", name: "中国平安", market: "A股", reason: "综合金融龙头，寿险改革见效、地产风险敞口收敛。", suggestion: "低估值高分红，适合作为压舱石底仓。", risk: "权益市场波动拖累投资收益。" },
  { code: "600036", name: "招商银行", market: "A股", reason: "零售标杆银行，资产质量优异、财富管理优势明显。", suggestion: "高股息防御属性强，可长期持有吃分红。", risk: "净息差收窄、信贷需求疲软。" },
  { code: "000333", name: "美的集团", market: "A股", reason: "家电出海+ToB业务（工业技术、机器人）双轮驱动。", suggestion: "估值合理、分红稳定，适合稳健型配置。", risk: "海外需求与汇率波动。" },
  { code: "002594", name: "比亚迪", market: "A股", reason: "新能源车全产业链布局，规模化与垂直整合优势突出。", suggestion: "关注智能化与新车型周期，成长弹性大但波动也大。", risk: "价格战加剧、海外贸易壁垒。" },
  { code: "600900", name: "长江电力", market: "A股", reason: "稀缺水电资产，现金流极稳、分红承诺明确。", suggestion: "典型「类债券」底仓，适合极度稳健偏好。", risk: "来水波动影响发电量。" },
  { code: "601012", name: "隆基绿能", market: "A股", reason: "光伏硅片/组件龙头，BC 电池技术领先。", suggestion: "行业出清期可左侧关注，需耐心等待拐点。", risk: "产能过剩、价格持续下行。" },
  { code: "300059", name: "东方财富", market: "A股", reason: "互联网券商龙头，行情回暖时业绩弹性高。", suggestion: "高贝塔品种，适合牛市初期弹性配置。", risk: "成交额回落、佣金竞争。" },
  { code: "600276", name: "恒瑞医药", market: "A股", reason: "创新药龙头，管线步入兑现期、国际化提速。", suggestion: "长线创新药核心标的，关注医保谈判与出海。", risk: "研发失败、集采降价。" },
  { code: "000651", name: "格力电器", market: "A股", reason: "空调龙头，高分红高现金，估值处历史低位。", suggestion: "高股息防御，适合收息型底仓。", risk: "地产链需求疲弱、多元化不及预期。" }
];

// 每日股票小知识备选池（按日期轮换）
var INVEST_TIPS = [
  { t: "市盈率 PE 是什么", b: "市盈率=股价÷每股收益，反映「花多少钱买 1 元利润」。数值低不一定便宜（可能增长停滞），高也不一定贵（可能高成长）。结合行业与增速看才有意义。" },
  { t: "换手率代表什么", b: "换手率=成交量÷流通股本，衡量交投活跃度。过低说明冷清，过高（尤其高位）常伴随情绪过热与分歧，需警惕追涨。" },
  { t: "北向资金", b: "通过沪深港通从香港流入 A 股的外资，常被视为「聪明钱」风向标。持续净流入往往代表风险偏好回升，但單日波动不宜过度解读。" },
  { t: "量价关系", b: "价涨量增较健康，说明资金认可；价涨量缩可能是无量空涨、动能不足；高位放量滞涨常是见顶信号。量是价的验证。" },
  { t: "为什么要有止损", b: "止损是给错误设上限。一笔交易最多亏多少事前定好，避免小亏拖成大亏。纪律比预测更重要。" },
  { t: "分散投资的道理", b: "「不要把鸡蛋放一个篮子里」。相关性低的资产组合能降低整体波动，在承受同样风险下争取更稳收益。" },
  { t: "ETF 是什么", b: "交易型开放式指数基金，像股票一样买卖、费率低、持仓透明。宽基 ETF（如沪深300）适合普通人做长期底仓。" },
  { t: "龙头股", b: "行业内市占率、品牌、盈利能力领先的 company。龙头往往更抗周期、享受估值溢价，但也要警惕「大而不便宜」。" },
  { t: "MACD 简介", b: "由快慢均线的差（DIF）与其信号线构成。金叉（DIF 上穿）偏多、死叉偏空，常用于判断趋势强弱，需结合量价与位置。" },
  { t: "分红与除权", b: "公司把利润分给股东后股价按红利除权下调，你的「总财富」并未凭空增加。长期看，稳定分红是优质公司的信号。" },
  { t: "市净率 PB", b: "PB=股价÷每股净资产，常用于银行、地产等重资产行业。PB<1 可能被低估，但也要看资产质量与盈利前景。" },
  { t: "成交量", b: "某段时间成交的股数/金额，是市场参与度的体温计。突破关键位时若放量确认，信号更可靠。" },
  { t: "支撑位与压力位", b: "历史上成交密集、反复止跌/受阻的价格区。支撑附近易反弹、压力附近易回落，破位常意味着趋势改变。" },
  { t: "定投策略", b: "固定周期、固定金额买入，跌时多买份额、涨时少买，天然平滑成本。适合没时间盯盘、追求长期复利的人。" },
  { t: "情绪面", b: "贪婪与恐惧会放大波动。当身边人都在谈股票、新股民蜂拥入市，往往临近阶段性过热；逆向思考需要勇气。" },
  { t: "财报看什么", b: "重点关注营收/利润增速、毛利率、经营现金流、负债率。利润可修饰，现金流更难造假，二者背离要警惕。" },
  { t: "流动性", b: "资产能以合理价格快速变现的能力。房产、私募流动性差，紧急情况可能「折价才能卖」。配置时要留足机动现金。" },
  { t: "仓位管理", b: "单只标的仓位过重，一次失误就伤筋动骨。常见原则是单票不超过总仓 20%~30%，用仓位控制风险而非靠预测。" },
  { t: "复利的威力", b: "巴菲特年化约 20% 却能成首富，靠的是数十年的复利。时间是投资者最好的朋友，越早开始、越少中断越好。" },
  { t: "风险偏好", b: "能接受多大回撤，取决于资金性质与心态。买房钱、急用钱不应投高风险权益。先定风险预算，再选资产。" },
  { t: "行业轮动", b: "不同行业在不同宏观阶段表现各异（复苏、过热、滞胀、衰退各有占优板块）。理解周期有助于做配置而非追热点。" },
  { t: "打新（新股申购）", b: "A 股新股上市初期常有溢价，市值打新是「免费期权」。但注册制后破发增多，需看发行估值与基本面。" },
  { t: "可转债", b: "可转成股票的债券，下有债底、上有股性，进可攻退可守。注意强赎条款与溢价率，避免高位接盘。" },
  { t: "RSI 相对强弱", b: "0~100 区间，>70 常视为超买、<30 超卖。用于识别短期乖离，但强趋势中可长时间超买/超卖，勿刻舟求剑。" },
  { t: "布林带", b: "中轨为均线、上下轨为标准差通道。价格触上轨偏强、触下轨偏弱，通道收窄常预示变盘。配合量能使用更佳。" },
  { t: "均线系统", b: "如 5/20/60 日线。短期线上穿长期线称「金叉」偏多；价格站上均线且均线向上，趋势更健康。" },
  { t: "题材炒作", b: "概念风口来的快去的也快。参与需分清「真受益」与「蹭热度」，设好止盈止损，避免成为最后一棒。" },
  { t: "价值 vs 成长", b: "价值看重低估值与分红（如银行、公用事业），成长看重未来增速（如科技、医药）。组合里两者搭配更均衡。" },
  { t: "ETF 定投的误区", b: "定投不是「闭眼买」：宽基优于行业单押；止盈纪律不能少；下跌期坚持才有摊低成本的效果。" },
  { t: "读懂换手与筹码", b: "低位高换手续命资金介入，高位高换手多为派发。结合价格位置，比单独看一个指标更靠谱。" }
];

// ---------- 数据初始化与迁移 ----------
function ensureInvest() {
  if (!DB.data.growth) DB.data.growth = {};
  if (!DB.data.growth.invest) {
    DB.data.growth.invest = { assets: [], holdings: [], funds: [], fundEstimate: null, fundUpdatedAt: null, netWorthLog: [], cash: 0, expenses: [], settings: {}, dailyNews: [] };
    var old = DB.data.growth.account;
    if (old) {
      DB.data.growth.invest.holdings = old.holdings || [];
      DB.data.growth.invest.expenses = old.expenses || [];
      DB.data.growth.invest.cash = old.savingsCurrent || 0;
      delete DB.data.growth.account;
    }
  }
  // 兼容老数据
  if (!DB.data.growth.invest.funds) DB.data.growth.invest.funds = [];
  if (!("fundEstimate" in DB.data.growth.invest)) DB.data.growth.invest.fundEstimate = null;
  if (!("fundUpdatedAt" in DB.data.growth.invest)) DB.data.growth.invest.fundUpdatedAt = null;
  if (!DB.data.growth.invest.dailyNews) DB.data.growth.invest.dailyNews = [];
  return DB.data.growth.invest;
}

// ---------- 计算 helpers ----------
function investCash() { return (DB.data.growth.invest.cash) || 0; }
function investTotalAssets() {
  var inv = DB.data.growth.invest;
  var a = (inv.assets || []).reduce(function (s, x) { return s + (x.amount || 0); }, 0);
  var h = (inv.holdings || []).reduce(function (s, x) { return s + (x.shares || 0) * (x.price || 0); }, 0);
  return (inv.cash || 0) + a + h;
}
function investHoldingsMV() {
  return (DB.data.growth.invest.holdings || []).reduce(function (s, x) { return s + (x.shares || 0) * (x.price || 0); }, 0);
}
function investHoldingsCost() {
  return (DB.data.growth.invest.holdings || []).reduce(function (s, x) { return s + (x.shares || 0) * (x.cost || 0); }, 0);
}
function investHoldingsPL() { return investHoldingsMV() - investHoldingsCost(); }
function holdingPL(h) { return (h.price || 0) - (h.cost || 0) * (h.shares || 0); }
function holdingPLPct(h) { var c = (h.cost || 0) * (h.shares || 0); return c > 0 ? ((h.price || 0) - h.cost) / h.cost * 100 : 0; }

function assetDistribution() {
  var inv = DB.data.growth.invest;
  var map = {};
  map["现金"] = (inv.cash || 0);
  (inv.assets || []).forEach(function (a) { var c = a.category || "其他"; map[c] = (map[c] || 0) + (a.amount || 0); });
  var hmv = investHoldingsMV();
  if (hmv > 0) map["证券持仓"] = hmv;
  var items = [];
  var idx = 0;
  Object.keys(map).forEach(function (k) {
    if (map[k] > 0) { items.push({ label: k, value: map[k], color: INVEST_COLORS[idx % INVEST_COLORS.length] }); idx++; }
  });
  return items;
}

// 净值自动记账：每天首次进入记一条
function logNetWorth() {
  var inv = DB.data.growth.invest;
  var t = today();
  var last = inv.netWorthLog[inv.netWorthLog.length - 1];
  var v = investTotalAssets();
  if (!last || last.date !== t) { inv.netWorthLog.push({ date: t, value: v }); DB.save(); }
}

// ---------- 格式化 ----------
function fmtMoney(v) {
  v = Number(v) || 0;
  var s = Math.abs(v);
  if (s >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (s >= 1e4) return (v / 1e4).toFixed(1) + "万";
  return Math.round(v).toLocaleString();
}
function fmtMoneyFull(v) { return "¥" + (Number(v) || 0).toLocaleString(); }
function fmtPct(p) { p = Number(p) || 0; return (p > 0 ? "+" : "") + p.toFixed(2) + "%"; }
function fmtPrice(p) { return Number(p || 0).toFixed(2); }
function fmtTime(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
function upDownClass(v) { return Number(v) >= 0 ? "up" : "down"; }
function upDownSign(v) { return Number(v) >= 0 ? "▲" : "▼"; }

// ---------- SVG 图表 ----------
function investDonut(elId, items) {
  var el = document.getElementById(elId);
  if (!el) return;
  var total = items.reduce(function (s, i) { return s + i.value; }, 0);
  if (total <= 0) { el.innerHTML = '<div class="inv-chart-empty">暂无资产数据</div>'; return; }
  var r = 52, cx = 64, cy = 64, sw = 16, C = 2 * Math.PI * r, off = 0, segs = "";
  items.forEach(function (it) {
    var len = (it.value / total) * C;
    segs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (it.color || "#ccc") +
      '" stroke-width="' + sw + '" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) +
      '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + cx + " " + cy + ')"></circle>';
    off += len;
  });
  var center = '<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" font-size="15" font-weight="800" fill="var(--text-primary)">' + fmtMoney(total) + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" font-size="10" fill="var(--text-secondary)">总资产</text>';
  el.innerHTML = '<svg viewBox="0 0 128 128" width="100%" height="150">' + segs + center + "</svg>";
}
function investLine(elId, points) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!points || points.length < 2) { el.innerHTML = '<div class="inv-chart-empty">记录满 2 天起显示净值走势</div>'; return; }
  var w = 320, h = 120, pad = 12;
  var vals = points.map(function (p) { return p.value; });
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (max - min < 1e-6) { max = min + 1; }
  var n = points.length;
  var xs = function (i) { return pad + i * (w - 2 * pad) / (n - 1); };
  var ys = function (v) { return h - pad - (v - min) / (max - min) * (h - 2 * pad); };
  var d = "", i;
  for (i = 0; i < n; i++) { d += (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(points[i].value).toFixed(1) + " "; }
  var area = "M" + xs(0).toFixed(1) + " " + (h - pad) + " " + d.replace(/^M/, "L") + "L" + xs(n - 1).toFixed(1) + " " + (h - pad) + " Z";
  var color = vals[n - 1] >= vals[0] ? "var(--accent-red)" : "var(--accent-green)";
  var dots = points.map(function (p, k) { return '<circle cx="' + xs(k).toFixed(1) + '" cy="' + ys(p.value).toFixed(1) + '" r="2.4" fill="' + color + '"></circle>'; }).join("");
  el.innerHTML = '<svg viewBox="0 0 ' + w + " " + h + '" width="100%" height="130" preserveAspectRatio="none">' +
    '<path d="' + area + '" fill="' + color + '" opacity="0.12"></path>' +
    '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"></path>' + dots + "</svg>";
}

// ---------- 入口 ----------
function renderInvest() {
  var c = document.getElementById("app-content");
  var inv = ensureInvest();
  logNetWorth();
  var tabs = [
    { id: "overview", t: "概览" },
    { id: "assets", t: "资产" },
    { id: "monitor", t: "📡 基金监控" },
    { id: "funds", t: "基金估值" },
    { id: "screener", t: "🔍 智能选股" },
    { id: "news", t: "📰 财经新闻" },
    { id: "reviews", t: "复盘" },
    { id: "advisor", t: "🧑‍💼 基金投顾" }
  ];
  var tabHtml = '<div class="inv-tabs">' + tabs.map(function (t) {
    return '<div class="inv-tab' + (investTab === t.id ? " active" : "") + '" onclick="setInvestTab(\'' + t.id + '\')">' + t.t + "</div>";
  }).join("") + "</div>";
  var body = invInvestBody(inv);
  c.innerHTML = tabHtml + body;
  if (investTab === "overview") investRenderOverviewCharts(inv);
  else if (investTab === "assets") investRenderAssetsCharts(inv);
  else if (investTab === "reviews") investRenderReviewCharts();
  else if (investTab === "advisor") investRenderAdvisorCharts(inv);
  else if (investTab === "monitor" && window.__invMonSel) invMonRenderChart(inv);
}
// 各 Tab 的正文（纯渲染，便于单测；advisor 曾因误设为空 div 导致白屏，已修正为调用 renderInvestAdvisor）
function invInvestBody(inv) {
  if (investTab === "overview") return renderInvestOverview(inv);
  else if (investTab === "assets") return renderInvestAssets(inv);
  else if (investTab === "monitor") return window.__invMonSel ? renderInvestMonitorDetail(inv) : renderInvestMonitor(inv);
  else if (investTab === "funds") return renderInvestFunds(inv);
  else if (investTab === "screener") return renderInvestScreener(inv);
  else if (investTab === "news") return renderInvestNews(inv);
  else if (investTab === "reviews") return renderInvestReviews();
  else return renderInvestAdvisor(inv);
}

function setInvestTab(t) { investTab = t; renderInvest(); }

// ===================== 概览（一级：仅主要信息）=====================
function renderInvestOverview(inv) {
  var total = investTotalAssets();
  var pl = investHoldingsPL();
  var plPct = investHoldingsCost() > 0 ? pl / investHoldingsCost() * 100 : 0;
  var dist = assetDistribution();

  var html = "";
  // 主要指标卡
  html += '<div class="stats-grid">' +
    '<div class="stat-card" onclick="setInvestTab(\'assets\')"><div class="stat-icon">💰</div><div class="stat-value">' + fmtMoney(total) + '</div><div class="stat-label">总资产</div></div>' +
    '<div class="stat-card" onclick="setInvestTab(\'holdings\')"><div class="stat-icon">📊</div><div class="stat-value ' + (pl >= 0 ? "up" : "down") + '">' + (pl >= 0 ? "+" : "") + fmtMoney(pl) + '</div><div class="stat-label">持仓盈亏 (' + fmtPct(plPct) + ')</div></div>' +
    '</div>';

  // 资产分布（一级：环形+图例，点击看资产详情）
  html += '<div class="inv-overview">';
  html += '<div class="inv-card" onclick="setInvestTab(\'assets\')">' +
    '<div class="inv-card-h"><span>🥧 资产分布</span><span class="inv-go">查看 ›</span></div>' +
    '<div style="display:flex;gap:10px;align-items:center">' +
    '<div class="inv-donut" id="inv-donut"></div>' +
    '<div class="inv-legend">' + dist.map(function (d) {
      return '<div class="inv-leg-row"><span class="inv-dot" style="background:' + d.color + '"></span><span class="inv-leg-name">' + d.label + '</span><span class="inv-leg-val">' + fmtMoney(d.value) + "</span></div>";
    }).join("") + "</div></div></div>";

  // 净值走势（一级：缩略折线，点击看详情）
  html += '<div class="inv-card" onclick="showInvestTrendDetail()">' +
    '<div class="inv-card-h"><span>📈 净值走势</span><span class="inv-go">详情 ›</span></div>' +
    '<div class="inv-line" id="inv-line"></div></div>';

  // 今日大盘（一级：3 个主要指数，点击看行情）
  var indices = (window.__investFeed && window.__investFeed.indices) || investDefaultIndices();
  window.__invIndices = indices;
  html += '<div class="inv-card" onclick="setInvestTab(\'market\')">' +
    '<div class="inv-card-h"><span>📡 今日大盘</span><span class="inv-go">行情 ›</span></div>' +
    '<div class="inv-index-mini">' + indices.slice(0, 3).map(function (x) {
      return '<div class="inv-im"><div class="inv-im-name">' + x.name + '</div><div class="inv-im-val">' + (x.value != null ? fmtPrice(x.value) : "—") + '</div><div class="inv-im-chg ' + upDownClass(x.pct) + '">' + (x.pct != null ? upDownSign(x.pct) + " " + fmtPct(x.pct) : "—") + "</div></div>";
    }).join("") + "</div></div>";

  // 每日金价（一级）
  var gold = (window.__investFeed && window.__investFeed.gold) || investDefaultGold();
  html += '<div class="inv-card" onclick="showInvestGoldDetail()">' +
    '<div class="inv-card-h"><span>🪙 每日金价</span><span class="inv-go">详情 ›</span></div>' +
    '<div class="inv-gold-row"><span class="inv-gold-price">' + (gold.price != null ? fmtPrice(gold.price) : "—") + ' <small>' + (gold.unit || "元/克") + '</small></span>' +
    '<span class="inv-gold-chg ' + upDownClass(gold.pct) + '">' + (gold.pct != null ? upDownSign(gold.pct) + " " + fmtPct(gold.pct) : "—") + "</span></div></div>";

  // 三只潜力股（一级：概要，点击看分析）
  var picks = dailyPicks();
  window.__invPicks = picks;
  html += '<div class="inv-card">' +
    '<div class="inv-card-h"><span>🎯 今日三支潜力股</span><span class="inv-hint">非投资建议</span></div>' +
    picks.map(function (p, i) {
      return '<div class="inv-pick-row" onclick="showInvestPickDetail(' + i + ')"><span class="inv-pick-name">' + p.name + ' <small>' + p.code + "</small></span>" +
        '<span class="inv-pick-go">查看分析 ›</span></div>';
    }).join("") + "</div>";

  // 每日股票小知识（一级：标题，点击看全文）
  var tip = dailyTip();
  window.__invTip = tip;
  html += '<div class="inv-card inv-tip-card" onclick="showInvestTipDetail()">' +
    '<div class="inv-tip-ic">💡</div><div class="inv-tip-body"><div class="inv-tip-t">' + tip.t + '</div><div class="inv-tip-s">' + tip.b.slice(0, 28) + "…</div></div></div>";

  html += '</div>'; // .inv-overview

  return html;
}
function investRenderOverviewCharts(inv) {
  investDonut("inv-donut", assetDistribution());
  investLine("inv-line", inv.netWorthLog.slice(-30));
}

// ===================== 资产（详情：分布 + 明细 + 增删）=====================
function renderInvestAssets(inv) {
  var html = "";
  html += '<div class="inv-card">' +
    '<div class="inv-card-h"><span>🥧 资产分布</span></div>' +
    '<div style="display:flex;gap:10px;align-items:center">' +
    '<div class="inv-donut" id="inv-donut-big"></div>' +
    '<div class="inv-legend">' + assetDistribution().map(function (d) {
      return '<div class="inv-leg-row"><span class="inv-dot" style="background:' + d.color + '"></span><span class="inv-leg-name">' + d.label + '</span><span class="inv-leg-val">' + fmtMoney(d.value) + "</span></div>";
    }).join("") + "</div></div></div>";

  html += '<div style="display:flex;gap:8px;margin:12px 0">' +
    '<button class="btn btn-primary" style="flex:1" onclick="showAssetModal()">➕ 记一笔资产</button>' +
    '<button class="btn btn-secondary" style="flex:1" onclick="showCashModal()">💵 现金/存款</button></div>';

  html += '<div class="inv-section-title">📋 资产明细</div>';
  if (!inv.assets.length) {
    html += '<div class="empty-state" style="padding:18px"><div class="empty-text" style="font-size:13px">还没有记录资产，点上方按钮添加</div></div>';
  } else {
    html += inv.assets.map(function (a) {
      return '<div class="inv-asset-row"><div class="inv-asset-info"><div class="inv-asset-name">' + escapeHtml(a.name) + '</div><div class="inv-asset-cat">' + escapeHtml(a.category || "其他") + (a.note ? " · " + escapeHtml(a.note) : "") + '</div></div>' +
        '<div class="inv-asset-amt">' + fmtMoneyFull(a.amount) + '</div>' +
        '<button class="eng-speak-btn" style="color:var(--accent-red);font-size:15px;margin-left:6px" onclick="deleteInvestAsset(\'' + a.id + '\')">✕</button></div>';
    }).join("");
  }
  return html;
}
function investRenderAssetsCharts(inv) { investDonut("inv-donut-big", assetDistribution()); }

function showCashModal() {
  var inv = ensureInvest();
  showModal(
    '<div class="modal-title">💵 现金 / 存款</div>' +
    '<form onsubmit="submitCash(event)">' +
    '<div class="form-group"><div class="form-label">可用现金 + 存款总额 (¥)</div><input class="form-input" name="cash" type="number" value="' + (inv.cash || 0) + '" required></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}
function submitCash(e) {
  e.preventDefault();
  var fd = new FormData(e.target);
  ensureInvest().cash = parseFloat(fd.get("cash")) || 0;
  DB.save(); closeModal(); logNetWorth(); render();
}

function showAssetModal(id) {
  var inv = ensureInvest();
  var a = id ? inv.assets.find(function (x) { return x.id === id; }) : null;
  var v = a || {};
  var catOpts = INVEST_ASSET_CATS.map(function (c) { return '<option value="' + c + '"' + (v.category === c ? " selected" : "") + ">" + c + "</option>"; }).join("");
  showModal(
    '<div class="modal-title">' + (a ? "✎ 编辑资产" : "➕ 记一笔资产") + "</div>" +
    '<form onsubmit="submitAsset(event)">' +
    '<input type="hidden" name="id" value="' + (a ? a.id : "") + '">' +
    '<div class="form-group"><div class="form-label">名称</div><input class="form-input" name="name" placeholder="如：招商银行活期" value="' + escapeHtml(v.name || "") + '" required></div>' +
    '<div class="form-row"><div class="form-group"><div class="form-label">类别</div><select class="form-input" name="category">' + catOpts + "</select></div>" +
    '<div class="form-group"><div class="form-label">金额 (¥)</div><input class="form-input" name="amount" type="number" step="0.01" value="' + (v.amount || "") + '" required></div></div>' +
    '<div class="form-group"><div class="form-label">备注（可选）</div><input class="form-input" name="note" placeholder="如：这笔钱的用途" value="' + escapeHtml(v.note || "") + '"></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}
function submitAsset(e) {
  e.preventDefault();
  var fd = new FormData(e.target);
  var inv = ensureInvest();
  var id = fd.get("id");
  var rec = { id: id || uid(), name: fd.get("name"), category: fd.get("category"), amount: parseFloat(fd.get("amount")) || 0, note: fd.get("note") || "" };
  if (id) { var i = inv.assets.findIndex(function (x) { return x.id === id; }); if (i >= 0) inv.assets[i] = rec; }
  else inv.assets.push(rec);
  DB.save(); closeModal(); logNetWorth(); render();
}
function deleteInvestAsset(id) {
  showConfirmDialog("🗑️", "删除资产", "删除后不可恢复。", [
    { text: "取消", cls: "btn-secondary", action: function () { closeModal(); } },
    { text: "确认删除", cls: "btn-primary", style: "background:var(--accent-red);color:#fff", action: function () { closeModal(); var inv = ensureInvest(); inv.assets = inv.assets.filter(function (x) { return x.id !== id; }); DB.save(); logNetWorth(); render(); } }
  ]);
}

// ===================== 持仓盈亏（详情）=====================
function renderInvestHoldings(inv) {
  var mv = investHoldingsMV(), cost = investHoldingsCost(), pl = mv - cost;
  var plPct = cost > 0 ? pl / cost * 100 : 0;
  var html = "";
  html += '<div class="stats-grid">' +
    '<div class="stat-card"><div class="stat-icon">💼</div><div class="stat-value">' + fmtMoney(mv) + '</div><div class="stat-label">持仓市值</div></div>' +
    '<div class="stat-card"><div class="stat-icon">📊</div><div class="stat-value ' + (pl >= 0 ? "up" : "down") + '">' + (pl >= 0 ? "+" : "") + fmtMoney(pl) + '</div><div class="stat-label">累计盈亏 (' + fmtPct(plPct) + ')</div></div>' +
    '</div>';
  html += '<button class="btn btn-primary" style="width:100%;margin:6px 0 12px" onclick="showHoldingModal()">➕ 添加持仓</button>';
  html += '<div class="inv-section-title">📋 持仓明细（盈亏记录）</div>';
  if (!inv.holdings.length) {
    html += '<div class="empty-state" style="padding:18px"><div class="empty-text" style="font-size:13px">还没有持仓，添加后自动计算盈亏</div></div>';
  } else {
    html += '<div class="inv-hold-table">' +
      '<div class="inv-hold-head"><span>名称</span><span>持仓/成本</span><span>现价</span><span>盈亏</span></div>' +
      inv.holdings.map(function (h) {
        var p = holdingPL(h), pp = holdingPLPct(h);
        return '<div class="inv-hold-row" onclick="showHoldingModal(\'' + h.id + '\')">' +
          '<span class="inv-hold-name">' + escapeHtml(h.name) + ' <small>' + escapeHtml(h.code || "") + '</small></span>' +
          '<span class="inv-hold-sub">' + (h.shares || 0) + '股 @' + fmtPrice(h.cost) + '</span>' +
          '<span class="inv-hold-price">' + fmtPrice(h.price) + '</span>' +
          '<span class="inv-hold-pl ' + (p >= 0 ? "up" : "down") + '">' + (p >= 0 ? "+" : "") + fmtMoney(p) + '<br><small>' + fmtPct(pp) + '</small></span>' +
          '</div>';
      }).join("") + "</div>";
  }
  return html;
}
function showHoldingModal(id) {
  var inv = ensureInvest();
  var h = id ? inv.holdings.find(function (x) { return x.id === id; }) : null;
  var v = h || {};
  var mktOpts = INVEST_MARKETS.map(function (m) { return '<option value="' + m + '"' + (v.market === m ? " selected" : "") + ">" + m + "</option>"; }).join("");
  showModal(
    '<div class="modal-title">' + (h ? "✎ 编辑持仓" : "➕ 添加持仓") + "</div>" +
    '<form onsubmit="submitHolding(event)">' +
    '<input type="hidden" name="id" value="' + (h ? h.id : "") + '">' +
    '<div class="form-row"><div class="form-group"><div class="form-label">名称</div><input class="form-input" name="name" placeholder="如：贵州茅台" value="' + escapeHtml(v.name || "") + '" required></div>' +
    '<div class="form-group"><div class="form-label">代码</div><input class="form-input" name="code" placeholder="600519" value="' + escapeHtml(v.code || "") + '"></div></div>' +
    '<div class="form-group"><div class="form-label">市场</div><select class="form-input" name="market">' + mktOpts + "</select></div>" +
    '<div class="form-row"><div class="form-group"><div class="form-label">持仓数量（股/份）</div><input class="form-input" name="shares" type="number" step="any" value="' + (v.shares != null ? v.shares : "") + '" required></div>' +
    '<div class="form-group"><div class="form-label">成本价</div><input class="form-input" name="cost" type="number" step="any" value="' + (v.cost != null ? v.cost : "") + '" required></div></div>' +
    '<div class="form-group"><div class="form-label">现价（用于计算盈亏）</div><input class="form-input" name="price" type="number" step="any" value="' + (v.price != null ? v.price : "") + '" required></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}
function submitHolding(e) {
  e.preventDefault();
  var fd = new FormData(e.target);
  var inv = ensureInvest();
  var id = fd.get("id");
  var rec = {
    id: id || uid(), name: fd.get("name"), code: fd.get("code") || "", market: fd.get("market"),
    shares: parseFloat(fd.get("shares")) || 0, cost: parseFloat(fd.get("cost")) || 0, price: parseFloat(fd.get("price")) || 0,
    updatedAt: new Date().toISOString()
  };
  if (id) { var i = inv.holdings.findIndex(function (x) { return x.id === id; }); if (i >= 0) inv.holdings[i] = rec; }
  else inv.holdings.push(rec);
  DB.save(); closeModal(); logNetWorth(); render();
}
function deleteInvestHolding(id) {
  showConfirmDialog("🗑️", "删除持仓", "删除后不可恢复。", [
    { text: "取消", cls: "btn-secondary", action: function () { closeModal(); } },
    { text: "确认删除", cls: "btn-primary", style: "background:var(--accent-red);color:#fff", action: function () { closeModal(); var inv = ensureInvest(); inv.holdings = inv.holdings.filter(function (x) { return x.id !== id; }); DB.save(); logNetWorth(); render(); } }
  ]);
}

// ===================== 基金估值（每日自动刷新）=====================
// 重仓股加权估值：Σ(股票日涨幅 × 占净值比) / Σ(占净值比)
function calcFundEstimate(stocks) {
  var totalRate = 0, totalCc = 0;
  for (var i = 0; i < stocks.length; i++) {
    var cc = parseFloat(stocks[i].ccRate);
    var rate = parseFloat(stocks[i].changeRage);
    if (!isNaN(cc) && !isNaN(rate)) {
      totalRate += rate * cc;
      totalCc += cc;
    }
  }
  return totalCc > 0 ? totalRate / totalCc : null;
}

function fmtFundRate(v) {
  if (v == null || isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

/* 我的默认持仓基金（首次进入自动预置，用户可自行增删） */
var INV_DEFAULT_FUNDS = ["001438", "015916", "001856", "021532", "018104", "004243", "002982", "007789", "003305", "002170", "010236", "007300", "021580"];

/* 把抓取脚本产出的中文键 JSON 归一化成前端可用结构 */
function invNormalizeEstimate(j) {
  if (!j) return null;
  var list = j.results || j["结果"] || [];
  return {
    results: list,
    抓取时间: j["抓取时间"] || j.updatedAt || "",
    抓取平台: j["抓取平台"] || j.source || ""
  };
}

/* ===================== 基金估值历史（微信聊天记录式日历 · 纯函数可测）===================== */
// 把当日估值快照并入历史（当天幂等覆盖），返回新 history
function invSnapFundsForDate(estNorm, history, dateStr, fetchedAt) {
  history = history || {};
  var date = dateStr || String(fetchedAt || "").slice(0, 10);
  if (!date) return history;
  var items = ((estNorm && estNorm.results) || []).map(function (r) {
    return {
      基金代码: r["基金代码"] || "",
      基金名称: r["基金名称"] || r["基金代码"] || "",
      估值数值: typeof r["估值数值"] === "number" ? r["估值数值"] : null,
      预计涨跌幅: r["预计涨跌幅"] || "—",
      报告期: r["报告期"] || "—",
      重仓股数: r["重仓股数"] || ((r["重仓股"] && r["重仓股"].length) || 0)
    };
  });
  if (!items.length) return history;
  var copy = {};
  for (var k in history) if (history.hasOwnProperty(k)) copy[k] = history[k];
  copy[date] = {
    抓取时间: fetchedAt || (estNorm && estNorm.抓取时间) || "",
    基金数: items.length,
    成功数: items.filter(function (i) { return i.估值数值 != null; }).length,
    items: items
  };
  return copy;
}
// 历史日期列表（倒序，最新在前）
function invFundHistoryDates(history) {
  if (!history) return [];
  return Object.keys(history).sort().reverse();
}
// 取某一天留存的估值条目
function invFundHistoryByDate(history, date) {
  if (!history || !history[date]) return [];
  return history[date].items || [];
}
// 历史搜索：按 基金名称/代码/报告期（不区分大小写）
function invSearchFunds(items, kw) {
  items = items || [];
  kw = String(kw || "").trim().toLowerCase();
  if (!kw) return items.slice();
  return items.filter(function (f) {
    var hay = [f["基金名称"], f["基金代码"], f["报告期"]].join(" ").toLowerCase();
    return hay.indexOf(kw) >= 0;
  });
}
// 月历格子（与行业情报 wx-cal 同款交互；有留存的日期打红点）
function invFundCalCells(history, monthStr) {
  var hist = history || {};
  var y = parseInt(monthStr.slice(0, 4), 10);
  var m = parseInt(monthStr.slice(5, 7), 10);
  var first = new Date(Date.UTC(y, m - 1, 1, 12));
  var last = new Date(Date.UTC(y, m, 0, 12));
  var out = [];
  var lead = (first.getUTCDay() + 6) % 7;
  for (var i = 0; i < lead; i++) out.push({ date: "", day: "", has: false, inMonth: false, today: false });
  for (var d = new Date(Date.UTC(y, m - 1, 1, 12)); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    var ds = d.toISOString().slice(0, 10);
    out.push({ date: ds, day: d.getUTCDate(), has: !!hist[ds], inMonth: true, today: ds === (typeof today === "function" ? today() : "") });
  }
  return out;
}
// 历史日期分隔胶囊（今天/昨天/日期+星期）
function invFundDateTag(dateStr) {
  var d = new Date(dateStr + "T00:00:00");
  var now = new Date();
  var diff = Math.floor((now - d) / 86400000);
  var md = (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + "日一二三四五六".charAt(d.getDay());
  if (diff === 0) return "今天 · " + md;
  if (diff === 1) return "昨天 · " + md;
  return md;
}

/* 首次进入自动预置基金列表 */
function invSeedDefaultFunds(inv) {
  if (inv.fundsSeeded) return false;
  inv.fundsSeeded = true;
  if (inv.funds && inv.funds.length) { DB.save(); return false; }
  inv.funds = INV_DEFAULT_FUNDS.map(function (c) {
    return { code: c, nickname: "", shares: null, cost: null, addedAt: new Date().toISOString() };
  });
  DB.save();
  return true;
}

function renderInvestFunds(inv) {
  var html = "";
  // 子视图：latest 最新估值 | history 微信日历历史记录（v5.9.27）
  if (window.__invFundsSub == null) window.__invFundsSub = "latest";
  var sub = window.__invFundsSub;
  html += '<div class="filter-bar" style="margin:2px 0 10px">' +
    '<div class="chip' + (sub === "latest" ? " active" : "") + '" onclick="setInvestFundsSub(\'latest\')">📈 最新估值</div>' +
    '<div class="chip' + (sub === "history" ? " active" : "") + '" onclick="setInvestFundsSub(\'history\')">📅 历史记录</div>' +
    '</div>';
  if (sub === "history") return html + renderInvestFundsHistory(inv);

  // 首次进入：预置 13 只基金，并自动拉一次估值
  var seeded = invSeedDefaultFunds(inv);
  if (seeded && !window.__invFundLoading) setTimeout(invLoadFundEstimate, 100);
  // 进入 Tab 时若还没有估值数据，自动加载一次（每次会话只自动拉一次）
  else if (!inv.fundEstimate && !window.__invFundAutoTried && !window.__invFundLoading) {
    window.__invFundAutoTried = true;
    setTimeout(invLoadFundEstimate, 100);
  }
  var funds = inv.funds || [];
  var est = invNormalizeEstimate(inv.fundEstimate);
  var updatedAt = inv.fundUpdatedAt;

  // 总览卡片
  if (est && est.results && est.results.length) {
    var totalEst = 0, validCount = 0;
    for (var i = 0; i < est.results.length; i++) {
      var r = est.results[i];
      if (r && typeof r.估值数值 === "number" && !isNaN(r.估值数值)) {
        totalEst += r.估值数值;
        validCount++;
      }
    }
    var avgEst = validCount > 0 ? totalEst / validCount : null;
    html += '<div class="stats-grid">' +
      '<div class="stat-card"><div class="stat-icon">📈</div><div class="stat-value ' + upDownClass(avgEst) + '">' + fmtFundRate(avgEst) + '</div><div class="stat-label">持仓基金平均估值</div></div>' +
      '<div class="stat-card"><div class="stat-icon">💼</div><div class="stat-value">' + funds.length + '</div><div class="stat-label">持有基金数</div></div>' +
      '<div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">' + validCount + '</div><div class="stat-label">有效估值数</div></div>' +
      '</div>';
  } else {
    html += '<div class="stats-grid">' +
      '<div class="stat-card"><div class="stat-icon">💼</div><div class="stat-value">' + funds.length + '</div><div class="stat-label">持有基金数</div></div>' +
      '<div class="stat-card"><div class="stat-icon">⏰</div><div class="stat-value" style="font-size:14px">—</div><div class="stat-label">尚未更新估值</div></div>' +
      '</div>';
  }

  // 更新时间和刷新按钮
  html += '<div class="inv-fund-toolbar">' +
    '<div class="inv-fund-updated">' + (updatedAt ? '📅 最后更新：' + updatedAt : '📅 尚未抓取估值') + '</div>' +
    '<div class="btn-row" style="gap:6px">' +
    '<button class="btn btn-secondary btn-mini" onclick="invLoadFundEstimate()">🔄 立即刷新</button>' +
    '<button class="btn btn-secondary btn-mini" onclick="showAddFundModal()">➕ 添加基金</button>' +
    '</div></div>';

  // 加载状态提示
  if (window.__invFundLoading) {
    html += '<div class="inv-fund-loading">⏳ 正在抓取实时估值，请稍候...</div>';
  }

  // 基金列表卡片
  if (!funds.length) {
    html += '<div class="empty-state" style="padding:18px"><div class="empty-text" style="font-size:13px">还没有添加基金<br>点击「➕ 添加基金」录入基金代码（6位数字）</div></div>';
  } else {
    // 构造估值查找表
    var estMap = {};
    if (est && est.results) {
      for (var i = 0; i < est.results.length; i++) {
        estMap[est.results[i].基金代码] = est.results[i];
      }
    }
    funds.forEach(function (f) {
      var e = estMap[f.code];
      var name = e ? e.基金名称.replace(/\(\d+\)$/, "") : "基金 " + f.code;
      var rate = e && typeof e.估值数值 === "number" ? e.估值数值 : null;
      var period = e ? e.报告期 : "—";
      var rateClass = rate == null ? "flat" : upDownClass(rate);
      var rateText = fmtFundRate(rate);
      var stockCount = (e && e.重仓股) ? e.重仓股.length : 0;
      html += '<div class="inv-fund-card" onclick="showFundDetail(\'' + f.code + '\')">' +
        '<div class="inv-fund-card-h">' +
        '<div><span class="inv-fund-name">' + escapeHtml(name) + '</span><span class="inv-fund-code">' + f.code + '</span></div>' +
        '<div class="inv-fund-rate ' + rateClass + '">' + rateText + '</div>' +
        '</div>' +
        '<div class="inv-fund-meta">' +
        '<span>📅 报告期 ' + period + '</span>' +
        '<span>💼 ' + (f.shares != null ? f.shares + '份' : '未设份额') + '</span>' +
        (stockCount ? '<span>🔍 ' + stockCount + ' 只重仓</span>' : '<span class="inv-fund-na">⏳ 待抓取</span>') +
        '</div>' +
        '<div class="inv-fund-actions">' +
        '<button class="btn btn-mini btn-secondary" onclick="event.stopPropagation();editFund(\'' + f.code + '\')">✎ 编辑</button>' +
        '<button class="btn btn-mini btn-secondary" style="color:var(--accent-red)" onclick="event.stopPropagation();deleteFund(\'' + f.code + '\')">🗑 删除</button>' +
        '</div>' +
        '</div>';
    });
  }

  html += '<div class="inv-fund-tip">💡 估值基于最近季报披露的前十大重仓股日涨幅加权平均，仅供参考。每日 15:30 自动更新。</div>';

  return html;
}

// ===================== 基金估值历史 · 微信聊天记录式日历（v5.9.27）=====================
function setInvestFundsSub(s) { window.__invFundsSub = s; renderInvest(); }
function invFundCalMonthNav(delta) {
  var y = parseInt(window.__invFundCalMonth.slice(0, 4), 10);
  var m = parseInt(window.__invFundCalMonth.slice(5, 7), 10);
  var d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  window.__invFundCalMonth = d.toISOString().slice(0, 7);
  renderInvest();
}
function setInvestFundSelDate(d) { window.__invFundSelDate = d; renderInvest(); }
function applyInvestFundHistFilter() {
  var el = document.getElementById("inv-fund-hist-search");
  window.__invFundHistSearch = el ? el.value : "";
  var list = document.getElementById("inv-fund-hist-list");
  if (list) list.innerHTML = invFundHistListHtml();
  var cb = document.getElementById("inv-fund-hist-clear");
  if (cb) cb.style.display = window.__invFundHistSearch ? "flex" : "none";
}
function clearInvestFundHistSearch() {
  window.__invFundHistSearch = "";
  var el = document.getElementById("inv-fund-hist-search");
  if (el) el.value = "";
  var cb = document.getElementById("inv-fund-hist-clear");
  if (cb) cb.style.display = "none";
  var list = document.getElementById("inv-fund-hist-list");
  if (list) list.innerHTML = invFundHistListHtml();
}
// 加载历史：线上 funds_history.json 为主，本地 DB 留存（打开过最新估值的那天）兜底合并
function invLoadFundHistory() {
  var inv = ensureInvest();
  var dbSnap = invSnapFundsForDate(invNormalizeEstimate(inv.fundEstimate), (inv.fundHistory || {}), null, inv.fundUpdatedAt);
  fetch("./data/funds_history.json?t=" + Date.now())
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) {
      var h = {};
      var fh = (j && j.history) || {};
      for (var k in fh) h[k] = fh[k];
      for (var k2 in dbSnap) if (!h[k2]) h[k2] = dbSnap[k2]; // 文件里没有的用本地留存补
      window.__invFundHist = { updatedAt: (j && j.updatedAt) || "", history: h };
      window.__invFundHistLoading = false;
      renderInvest();
    })
    .catch(function () {
      window.__invFundHist = { updatedAt: "", history: dbSnap };
      window.__invFundHistLoading = false;
      renderInvest();
    });
}
// 历史视图 HTML（月历 + 日期条 + 聊天头 + 搜索 + 气泡列表）
function renderInvestFundsHistory(inv) {
  var hist = window.__invFundHist;
  if (!hist) {
    if (!window.__invFundHistLoading) { window.__invFundHistLoading = true; invLoadFundHistory(); }
    return '<div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-text">正在加载历史记录…</div></div>';
  }
  var h = hist.history || {};
  var dates = invFundHistoryDates(h);
  if (!dates.length) {
    return '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">还没有估值历史<br>每个交易日 15:30 自动抓取留存，可在此按日历回顾</div></div>';
  }
  if (!window.__invFundSelDate || dates.indexOf(window.__invFundSelDate) < 0) window.__invFundSelDate = dates[0];
  if (!window.__invFundCalMonth) window.__invFundCalMonth = window.__invFundSelDate.slice(0, 7);
  if (window.__invFundHistSearch == null) window.__invFundHistSearch = "";
  var sel = window.__invFundSelDate;
  var day = h[sel] || {};
  // 缓存当日基准，供搜索局部刷新（不丢焦点）
  window.__invFundHistDay = { sel: sel, items: day.items || [], 抓取时间: day.抓取时间 || "", 成功数: day.成功数 || 0 };

  // 月历（复用 v5.9.25 微信日历样式）
  var cells = invFundCalCells(h, window.__invFundCalMonth);
  var calHtml = '<div class="wx-cal">' +
    '<div class="wx-cal-nav"><button class="btn btn-secondary" onclick="invFundCalMonthNav(-1)" style="padding:4px 10px">‹</button>' +
      '<span class="wx-cal-month">' + window.__invFundCalMonth + '</span>' +
      '<button class="btn btn-secondary" onclick="invFundCalMonthNav(1)" style="padding:4px 10px">›</button></div>' +
    '<div class="wx-week-h"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
    '<div class="wx-cal-grid">' + cells.map(function (cell) {
      if (!cell.inMonth) return '<div class="wx-cell empty"></div>';
      var cls = "wx-cell";
      if (cell.today) cls += " today";
      if (cell.has) cls += " has";
      if (cell.date === sel) cls += " sel";
      return '<div class="' + cls + '" onclick="setInvestFundSelDate(\'' + cell.date + '\')">' +
        '<span class="wx-day">' + cell.day + '</span>' + (cell.has ? '<span class="wx-dot"></span>' : '') + '</div>';
    }).join("") + '</div>' +
    '<div class="wx-cal-legend"><span><i class="wx-dot"></i> 有估值</span><span><b>描边</b> 今天</span><span><b>高亮</b> 当前查看</span></div></div>';

  // 日期快捷条
  var dateBar = '<div class="wx-date-strip">' +
    dates.slice(0, 21).map(function (d) {
      return '<div class="wx-date-chip' + (d === sel ? " active" : "") + '" onclick="setInvestFundSelDate(\'' + d + '\')">' +
        '<span class="wx-date-m">' + (d.slice(5, 7) + "/" + d.slice(8, 10)) + '</span>' +
        '<span class="wx-date-w">' + (d === (typeof today === "function" ? today() : "") ? "今天" : "") + '</span></div>';
    }).join("") + '</div>';

  var head = '<div class="wx-chat-head">' +
    '<span class="wx-chat-title">💬 ' + sel + ' 估值记录</span>' +
    '<span class="wx-chat-count">' + (day.items || []).length + ' 只 · 成功 ' + (day.成功数 || 0) + '</span></div>';

  var searchBox = '<div class="intel-search-row">' +
    '<input id="inv-fund-hist-search" class="intel-key" placeholder="🔍 搜索基金名称/代码…" value="' + escapeHtml(window.__invFundHistSearch) + '" oninput="applyInvestFundHistFilter()">' +
    '<button id="inv-fund-hist-clear" class="intel-search-clear" style="display:' + (window.__invFundHistSearch ? "flex" : "none") + '" onclick="clearInvestFundHistSearch()">✕</button>' +
    '</div>';

  return '<div class="enm-hint" style="margin-bottom:6px">📅 已留存 ' + dates.length + ' 个交易日估值 · 点日历日期查看当天</div>' +
    calHtml + dateBar + head + searchBox +
    '<div id="inv-fund-hist-list">' + invFundHistListHtml() + '</div>';
}
// 气泡列表（依据搜索词计算）——微信聊天记录样式，每只基金一条气泡
function invFundHistListHtml() {
  var d = window.__invFundHistDay;
  if (!d) return "";
  var items = invSearchFunds(d.items, window.__invFundHistSearch);
  if (!items.length) return '<div class="empty-state" style="padding:18px 0"><div class="empty-icon">🔍</div><div class="empty-text">没有匹配的基金</div></div>';
  return '<div class="wx-bubble-date">' + invFundDateTag(d.sel) + '</div>' +
    items.map(function (f) { return fundBubbleCard(f); }).join("");
}
// 单只基金估值气泡（红涨绿跌：up=红 down=绿）
function fundBubbleCard(f) {
  var rate = typeof f["估值数值"] === "number" ? f["估值数值"] : null;
  var rateText = fmtFundRate(rate);
  var cls = rate == null ? "flat" : upDownClass(rate);
  var isEtf = (f["重仓股数"] || 0) === 0;
  var name = String(f["基金名称"] || "").replace(/\(\d+\)$/, "") || ("基金 " + (f["基金代码"] || ""));
  var avatar = isEtf ? "⏭️" : "📈";
  return '<div class="wx-msg">' +
    '<div class="wx-avatar" style="background:' + (isEtf ? "rgba(142,142,147,.14)" : "rgba(48,209,88,.14)") + '">' + avatar + '</div>' +
    '<div class="wx-bubble">' +
      '<div class="wx-bubble-h">' +
        '<span class="wx-bubble-cat" style="background:' + (isEtf ? "#8e8e93" : "#2ea043") + '">' + escapeHtml(f["基金代码"] || "") + '</span>' +
        '<span class="wx-bubble-meta">' + (isEtf ? "ETF联接 · 指数型" : "报告期 " + escapeHtml(f["报告期"] || "—")) + '</span>' +
      '</div>' +
      '<div class="wx-bubble-title">' + escapeHtml(name) + '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:4px">' +
        '<span class="inv-fund-rate ' + cls + '" style="font-size:20px;font-weight:800">' + rateText + '</span>' +
        '<span style="font-size:12px;color:var(--text-tertiary,#a8adb5)">' + (isEtf ? "按净值更新，无个股估值" : "💼 " + (f["重仓股数"] || 0) + " 只重仓") + '</span>' +
      '</div>' +
    '</div></div>';
}

function showAddFundModal(editCode) {
  var inv = ensureInvest();
  var f = null;
  if (editCode) f = inv.funds.find(function (x) { return x.code === editCode; });
  var v = f || {};
  var html = '<div class="modal-title">' + (f ? "✎ 编辑基金" : "➕ 添加基金") + '</div>' +
    '<form onsubmit="submitFund(event)">' +
    '<input type="hidden" name="code" value="' + (v.code || "") + '">' +
    '<label class="form-label">基金代码（6位数字）</label>' +
    '<input class="form-input" name="codeInput" placeholder="如 519674" value="' + escapeHtml(v.code || "") + '" ' + (f ? 'readonly' : 'required') + '>' +
    '<label class="form-label">昵称（可选，方便辨认）</label>' +
    '<input class="form-input" name="nickname" placeholder="如：医药基金" value="' + escapeHtml(v.nickname || "") + '">' +
    '<label class="form-label">持有份额（可选）</label>' +
    '<input class="form-input" name="shares" type="number" step="any" value="' + (v.shares != null ? v.shares : "") + '" placeholder="如 10000">' +
    '<label class="form-label">成本净值（可选）</label>' +
    '<input class="form-input" name="cost" type="number" step="any" value="' + (v.cost != null ? v.cost : "") + '" placeholder="如 1.5000">' +
    '<div class="btn-row" style="margin-top:14px">' +
    '<button type="button" class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '<button type="submit" class="btn btn-primary" style="flex:1">保存</button>' +
    '</div></form>';
  showModal(html);
}

function submitFund(e) {
  e.preventDefault();
  var fd = new FormData(e.target);
  var inv = ensureInvest();
  var code = (fd.get("code") || fd.get("codeInput") || "").trim();
  if (!/^\d{6}$/.test(code)) { if (typeof showToast === "function") showToast("基金代码必须是 6 位数字", "warn"); return; }
  var rec = {
    code: code,
    nickname: (fd.get("nickname") || "").trim(),
    shares: parseFloat(fd.get("shares")) || null,
    cost: parseFloat(fd.get("cost")) || null,
    addedAt: new Date().toISOString()
  };
  var existingIdx = inv.funds.findIndex(function (x) { return x.code === code; });
  if (existingIdx >= 0) {
    inv.funds[existingIdx] = Object.assign({}, inv.funds[existingIdx], rec);
  } else {
    inv.funds.push(rec);
  }
  DB.save();
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已保存", "success");
  // 自动触发一次估值抓取
  setTimeout(invLoadFundEstimate, 300);
}

function editFund(code) {
  showAddFundModal(code);
}

function deleteFund(code) {
  var inv = ensureInvest();
  if (!confirm("确认删除基金 " + code + "？")) return;
  inv.funds = inv.funds.filter(function (x) { return x.code !== code; });
  // 也清除对应估值
  if (inv.fundEstimate && inv.fundEstimate.results) {
    inv.fundEstimate.results = inv.fundEstimate.results.filter(function (x) { return x.基金代码 !== code; });
  }
  DB.save();
  render();
  if (typeof showToast === "function") showToast("已删除", "success");
}

// 估值加载：优先读每日自动化预生成的 JSON（含基金全名+重仓股），失败再尝试浏览器直连
function invLoadFundEstimate() {
  var inv = ensureInvest();
  if (!inv.funds.length) { if (typeof showToast === "function") showToast("请先添加基金", "warn"); return; }
  window.__invFundLoading = true;
  render();
  // 同花顺接口无 CORS 头，浏览器直连必失败，因此以本地预生成文件为主
  invLoadFundEstimateFromFile();
}

// 浏览器端直连抓取（备用，多数环境会被 CORS 拒绝）
function invLoadFundEstimateDirect() {
  var inv = ensureInvest();
  var codes = inv.funds.map(function (f) { return f.code; });
  Promise.all(codes.map(function (code) {
    return fetch("https://fund.10jqka.com.cn/web/fund/stockAndBond/" + code, { mode: "cors" })
      .then(function (r) { return r.json(); })
      .then(function (j) { return { code: code, ok: true, data: j }; })
      .catch(function () { return { code: code, ok: false }; });
  })).then(function (results) {
    var okResults = results.filter(function (x) { return x.ok; });
    if (okResults.length === 0) {
      window.__invFundLoading = false;
      render();
      if (typeof showToast === "function") showToast("估值抓取失败，请检查网络", "error");
      return;
    }
    var merged = { results: [], 抓取时间: new Date().toLocaleString("zh-CN"), 抓取平台: "同花顺爱基金 (浏览器直连)" };
    var pendingNames = [];
    okResults.forEach(function (r) {
      var stocks = (r.data && r.data.data && r.data.data.stock) || [];
      var estimate = calcFundEstimate(stocks);
      // 取基金名（用 stocks 中第一个 zcCode 不准，改用简化方案：默认基金代码）
      var fundName = "基金 " + r.code;
      merged.results.push({
        基金代码: r.code,
        基金名称: fundName,
        估值数值: estimate,
        预计涨跌幅: estimate != null ? (estimate >= 0 ? "+" : "") + estimate.toFixed(2) + "%" : "—",
        报告期: stocks[0] ? stocks[0].enddate : "—",
        重仓股: stocks.slice(0, 10).map(function (s, i) {
          return {
            序号: i + 1,
            股票代码: s.zcCode,
            股票名称: s.zcName,
            占净值比: parseFloat(s.ccRate).toFixed(2) + "%",
            今日涨幅: s.changeRage === "" ? "—" : (parseFloat(s.changeRage) >= 0 ? "+" : "") + parseFloat(s.changeRage).toFixed(2) + "%",
            持仓市值: s.totalPrice
          };
        })
      });
    });
    inv.fundEstimate = merged;
    inv.fundUpdatedAt = new Date().toLocaleString("zh-CN");
    // v5.9.27：当天快照自动留存本地 DB 历史（线上 funds_history.json 的兜底）
    inv.fundHistory = invSnapFundsForDate(merged, inv.fundHistory || {}, null, inv.fundUpdatedAt);
    DB.save();
    window.__invFundLoading = false;
    render();
    if (typeof showToast === "function") showToast("已更新 " + okResults.length + "/" + codes.length + " 只基金估值", "success");
  });
}

// 主方案：从 data/funds_estimate.json（自动化每交易日 15:30 生成）加载
function invLoadFundEstimateFromFile() {
  fetch("./data/funds_estimate.json?t=" + Date.now())
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) {
      var inv = ensureInvest();
      var norm = invNormalizeEstimate(j);
      if (!norm || !norm.results.length) throw new Error("empty");
      inv.fundEstimate = norm;
      inv.fundUpdatedAt = norm.抓取时间 || new Date().toLocaleString("zh-CN");
      // v5.9.27：当天快照自动留存本地 DB 历史（线上 funds_history.json 的兜底）
      inv.fundHistory = invSnapFundsForDate(norm, inv.fundHistory || {}, null, inv.fundUpdatedAt);
      DB.save();
      window.__invFundLoading = false;
      render();
      var n = norm.results.filter(function (x) { return typeof x.估值数值 === "number"; }).length;
      if (typeof showToast === "function") showToast("已更新 " + n + " 只基金估值", "success");
    })
    .catch(function () {
      // 文件不可用时再试浏览器直连
      invLoadFundEstimateDirect();
    });
}

function showFundDetail(code) {
  var inv = ensureInvest();
  var estMap = {};
  var _est = invNormalizeEstimate(inv.fundEstimate);
  if (_est && _est.results) {
    for (var i = 0; i < _est.results.length; i++) {
      estMap[_est.results[i].基金代码] = _est.results[i];
    }
  }
  var e = estMap[code];
  if (!e) {
    showModal('<div class="modal-title">📊 基金详情</div><div class="inv-detail-text" style="padding:20px;text-align:center">暂无估值数据<br><small>请先点击「🔄 立即刷新」抓取估值</small></div><div class="btn-row"><button class="btn btn-primary" style="width:100%" onclick="closeModal()">关闭</button></div>');
    return;
  }
  var rate = typeof e.估值数值 === "number" ? e.估值数值 : null;
  var html = '<div class="modal-title">📊 ' + escapeHtml(e.基金名称) + '</div>' +
    '<div class="inv-detail-num ' + upDownClass(rate) + '">' + fmtFundRate(rate) + '</div>' +
    '<div class="inv-detail-chg">📅 报告期：' + (e.报告期 || "—") + '</div>' +
    '<div class="inv-detail-block" style="margin-top:14px"><div class="inv-detail-label">🔍 重仓股明细</div>';
  if (e.重仓股 && e.重仓股.length) {
    html += '<div class="inv-fund-stock-list">';
    e.重仓股.forEach(function (s) {
      var rateColor = s.今日涨幅.startsWith("+") ? "up" : (s.今日涨幅.startsWith("-") ? "down" : "flat");
      html += '<div class="inv-fund-stock-row">' +
        '<span class="inv-fund-stock-name">#' + s.序号 + ' ' + escapeHtml(s.股票名称) + '</span>' +
        '<span class="inv-fund-stock-pct">' + s.占净值比 + '</span>' +
        '<span class="inv-fund-stock-rate ' + rateColor + '">' + s.今日涨幅 + '</span>' +
        '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="inv-detail-text" style="text-align:center;padding:14px">指数型基金无个股重仓</div>';
  }
  html += '</div><div class="inv-disclaimer">⚠️ 估值基于最近季报披露的重仓股日涨幅加权估算，仅供参考。</div>' +
    '<div class="btn-row"><button class="btn btn-primary" style="width:100%" onclick="closeModal()">关闭</button></div>';
  showModal(html);
}

// ===================== 行情（详情：指数 + 金价 + 潜力股 + 小知识）=====================
function investDefaultIndices() {
  return INVEST_INDICES.map(function (x) { return { name: x.name, value: null, pct: null }; });
}
function investDefaultGold() { return { price: null, unit: "元/克", pct: null }; }

function dailyPicks() {
  var feed = window.__investFeed;
  if (feed && feed.picks && feed.picks.length) return feed.picks.slice(0, 3);
  var pool = INVEST_PICKS_POOL;
  var d = new Date();
  var seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  var start = seed % pool.length;
  var out = [];
  for (var i = 0; i < 3; i++) out.push(pool[(start + i) % pool.length]);
  return out;
}
function dailyTip() {
  var feed = window.__investFeed;
  if (feed && feed.tip) return feed.tip;
  var pool = INVEST_TIPS;
  var d = new Date();
  var seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return pool[seed % pool.length];
}

// ===================== 每日复盘（已并入投资理财）======================
function renderInvestReviews() {
  var g = DB.data.growth || {};
  var reviews = (g.reviews || []).slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
  var todayStr = typeof today === "function" ? today() : "";
  var todayReview = null;
  for (var i = 0; i < reviews.length; i++) { if (reviews[i].date === todayStr) { todayReview = reviews[i]; break; } }
  var hasLive = (typeof LiveData !== "undefined" && LiveData.hasReviewData && LiveData.hasReviewData());
  var html = '<div class="inv-overview">';

  // 今日复盘状态 + 写/编辑入口
  var statusTxt = todayReview ? "今日已记录 ✓" : (hasLive ? "实时数据已生成，可保存为我的复盘" : "今日尚未记录");
  html += '<div class="inv-card">' +
    '<div class="inv-card-h"><span>📝 每日复盘（股市收盘）</span><span class="inv-go" onclick="navigate(\'reviews\')">完整页面 ›</span></div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin:6px 0 10px">' + statusTxt + '</div>' +
    '<button class="btn btn-primary" style="width:100%;padding:12px;font-size:14px" onclick="navigate(\'reviews\')">' +
      (todayReview ? "✏️ 编辑今日复盘" : "✍️ 写今日复盘") +
    '</button></div>';

  // 最近复盘列表
  html += '<div class="inv-card"><div class="inv-card-h"><span>🗂️ 最近复盘</span></div>';
  if (!reviews.length) {
    html += '<div style="font-size:13px;color:var(--text-tertiary);padding:8px 0">暂无复盘记录，点击上方按钮写第一篇</div>';
  } else {
    reviews.slice(0, 7).forEach(function (r) {
      var mo = (r.marketOverview || "").slice(0, 42);
      html += '<div class="inv-review-row" onclick="navigate(\'reviews\')">' +
        '<div class="inv-review-d">' + (r.date === todayStr ? '<span style="color:var(--accent-green)">●</span> ' : '') + escapeHtml(r.date || "") + '</div>' +
        '<div class="inv-review-m">' + escapeHtml(mo || (Array.isArray(r.sectors) && r.sectors.length ? "已记录板块数据" : "（无摘要）")) + '</div></div>';
    });
  }
  html += '</div></div>';
  return html;
}
function investRenderReviewCharts() { /* 复盘 tab 无独立图表，占位 */ }

function renderInvestMarket() {
  var el = document.getElementById("inv-market");
  if (!el) return;
  el.innerHTML = '<div class="inv-loading">📡 正在获取行情…</div>';
  loadInvestFeed().then(function (feed) {
    window.__investFeed = feed;
    var indices = (feed && feed.indices) || investDefaultIndices();
    var gold = (feed && feed.gold) || investDefaultGold();
    var picks = dailyPicks();
    var tip = dailyTip();
    window.__invIndices = indices; window.__invPicks = picks; window.__invTip = tip;

    var html = "";
    html += '<div class="inv-section-title">📡 大盘指数 <span class="inv-upd">更新 ' + fmtTime(feed && feed.generatedAt) + "</span></div>";
    html += '<div class="inv-index-board">' + indices.map(function (x, i) {
      return '<div class="inv-index-card" onclick="showInvestIndexDetail(' + i + ')">' +
        '<div class="inv-ix-name">' + x.name + '</div>' +
        '<div class="inv-ix-val">' + (x.value != null ? fmtPrice(x.value) : "—") + '</div>' +
        '<div class="inv-ix-chg ' + upDownClass(x.pct) + '">' + (x.pct != null ? upDownSign(x.pct) + " " + fmtPct(x.pct) : "—") + '</div></div>';
    }).join("") + "</div>";

    html += '<div class="inv-gold-card" onclick="showInvestGoldDetail()">' +
      '<div class="inv-gold-ic">🪙</div>' +
      '<div class="inv-gold-main"><div class="inv-gold-t">每日金价</div><div class="inv-gold-p">' + (gold.price != null ? fmtPrice(gold.price) : "—") + ' <small>' + (gold.unit || "元/克") + '</small></div></div>' +
      '<div class="inv-gold-c ' + upDownClass(gold.pct) + '">' + (gold.pct != null ? upDownSign(gold.pct) + " " + fmtPct(gold.pct) : "—") + '</div></div>';

    html += '<div class="inv-section-title">🎯 今日三支潜力股 <span class="inv-hint">仅供参考 · 非投资建议</span></div>';
    html += '<div class="inv-pick-list">' + picks.map(function (p, i) {
      return '<div class="inv-pick-card" onclick="showInvestPickDetail(' + i + ')">' +
        '<div class="inv-pick-top"><span class="inv-pick-name">' + p.name + '</span><span class="inv-pick-code">' + p.code + ' · ' + (p.market || "A股") + '</span></div>' +
        '<div class="inv-pick-reason">' + escapeHtml(p.reason) + '</div>' +
        '<div class="inv-pick-foot"><span class="inv-pick-tag">建议</span>' + escapeHtml(p.suggestion) + '</div>' +
        '<div class="inv-pick-more">查看完整分析 ›</div></div>';
    }).join("") + "</div>";

    html += '<div class="inv-section-title">💡 每日股票小知识</div>';
    html += '<div class="inv-tip-card" onclick="showInvestTipDetail()">' +
      '<div class="inv-tip-ic">💡</div><div class="inv-tip-body"><div class="inv-tip-t">' + tip.t + '</div><div class="inv-tip-s">' + escapeHtml(tip.b) + '</div></div></div>';

    html += '<div class="inv-disclaimer">⚠️ 行情与选股由公开数据/算法生成，仅供参考，不构成任何投资建议。投资有风险，决策需独立判断。</div>';
    el.innerHTML = html;

    // 尽力而为的实时刷新（失败不影响已显示内容）
    liveRefreshMarket(el);
  });
}

// 每日投资数据（invest.json）：优先 Supabase Storage，回退本地 data/invest.json
function loadInvestFeed() {
  return new Promise(function (resolve) {
    function done(j) { resolve(j); }
    try {
      var sb = (typeof getSb === "function") ? getSb() : null;
      if (sb && sb.storage) {
        sb.storage.from("app-content").download("invest.json").then(function (r) {
          if (r.data) { r.data.text().then(function (txt) { try { var j = JSON.parse(txt); if (j && j.generatedAt) return done(j); } catch (e) {} done(null); }); }
          else done(null);
        }).catch(function () { fallbackLocal(done); });
        return;
      }
    } catch (e) {}
    fallbackLocal(done);
  });
}
function fallbackLocal(done) {
  try {
    fetch("data/invest.json?cb=" + Date.now()).then(function (r) {
      if (!r.ok) return done(null);
      r.json().then(function (j) { done(j && j.generatedAt ? j : null); }).catch(function () { done(null); });
    }).catch(function () { done(null); });
  } catch (e) { done(null); }
}

// 实时刷新（best-effort，通过 allorigins 代理绕过 CORS）
function liveRefreshMarket(el) {
  var url = "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f14,f2,f3,f62&secids=" +
    INVEST_INDICES.map(function (x) { return x.secid; }).join(",");
  var proxy = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
  fetch(proxy).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.data || !j.data.diff) return;
    var arr = j.data.diff;
    var cards = el.querySelectorAll(".inv-index-card");
    arr.forEach(function (d, i) {
      var card = cards[i]; if (!card) return;
      var val = d.f2, pct = d.f3;
      if (val == null) return;
      var vEl = card.querySelector(".inv-ix-val"); if (vEl) vEl.textContent = fmtPrice(val);
      var cEl = card.querySelector(".inv-ix-chg");
      if (cEl) { cEl.textContent = (pct >= 0 ? upDownSign(pct) + " " : upDownSign(pct) + " ") + fmtPct(pct); cEl.className = "inv-ix-chg " + upDownClass(pct); }
    });
  }).catch(function () { /* 静默失败，保留原值 */ });
}

// ===================== 详情弹窗 =====================
function showInvestTrendDetail() {
  var inv = ensureInvest();
  var log = inv.netWorthLog.slice(-60);
  var html = '<div class="modal-title">📈 净值走势</div>' +
    (log.length < 2 ? '<div class="empty-state" style="padding:20px"><div class="empty-text" style="font-size:13px">记录满 2 天起显示走势曲线<br>当前已记录 ' + log.length + ' 天</div></div>'
      : '<div class="inv-line" id="inv-trend-detail"></div>' +
      '<div class="inv-trend-meta">最新净值 <b>' + fmtMoneyFull(investTotalAssets()) + '</b> · 共 ' + log.length + ' 个记录点</div>') +
    '<div class="btn-row"><button class="btn btn-primary" style="width:100%" onclick="closeModal()">关闭</button></div>';
  showModal(html);
  if (log.length >= 2) investLine("inv-trend-detail", log);
}

function showInvestIndexDetail(i) {
  var x = window.__invIndices[i]; if (!x) return;
  showModal(
    '<div class="modal-title">' + x.name + '</div>' +
    '<div class="inv-detail-num ' + upDownClass(x.pct) + '">' + (x.value != null ? fmtPrice(x.value) : "—") + '</div>' +
    '<div class="inv-detail-chg ' + upDownClass(x.pct) + '">' + (x.pct != null ? upDownSign(x.pct) + " " + fmtPct(x.pct) : "—") + '</div>' +
    '<div class="inv-detail-note">数据来源：公开行情接口（每日自动更新 + 实时刷新）。仅供参考，不构成投资建议。</div>' +
    '<div class="btn-row"><button class="btn btn-primary" style="width:100%" onclick="closeModal()">关闭</button></div>'
  );
}
function showInvestGoldDetail() {
  var g = (window.__investFeed && window.__investFeed.gold) || investDefaultGold();
  showModal(
    '<div class="modal-title">🪙 每日金价</div>' +
    '<div class="inv-detail-num ' + upDownClass(g.pct) + '">' + (g.price != null ? fmtPrice(g.price) : "—") + ' <small style="font-size:14px">' + (g.unit || "元/克") + '</small></div>' +
    '<div class="inv-detail-chg ' + upDownClass(g.pct) + '">' + (g.pct != null ? upDownSign(g.pct) + " " + fmtPct(g.pct) : "—") + '</div>' +
    '<div class="inv-detail-note">' + (g.note || "以上为参考金价（如上海黄金交易所 Au99.99），每日自动更新。实际以银行/金店报价为准。") + '</div>' +
    '<div class="btn-row"><button class="btn btn-primary" style="width:100%" onclick="closeModal()">关闭</button></div>'
  );
}
function showInvestPickDetail(i) {
  var p = window.__invPicks[i]; if (!p) return;
  showModal(
    '<div class="modal-title">🎯 ' + p.name + ' <small style="font-size:12px;color:var(--text-secondary)">' + p.code + ' · ' + (p.market || "A股") + '</small></div>' +
    '<div class="inv-detail-block"><div class="inv-detail-label">📌 关注理由</div><div class="inv-detail-text">' + escapeHtml(p.reason) + '</div></div>' +
    '<div class="inv-detail-block"><div class="inv-detail-label">💡 操作建议</div><div class="inv-detail-text">' + escapeHtml(p.suggestion) + '</div></div>' +
    '<div class="inv-detail-block"><div class="inv-detail-label">⚠️ 风险提示</div><div class="inv-detail-text">' + escapeHtml(p.risk) + '</div></div>' +
    '<div class="inv-disclaimer">⚠️ 由算法/公开资料生成，仅供参考，不构成投资建议。</div>' +
    '<div class="btn-row"><button class="btn btn-primary" style="width:100%" onclick="closeModal()">关闭</button></div>'
  );
}
function showInvestTipDetail() {
  var t = window.__invTip || dailyTip();
  showModal(
    '<div class="modal-title">💡 ' + t.t + '</div>' +
    '<div class="inv-detail-text" style="font-size:14px;line-height:1.7">' + escapeHtml(t.b) + '</div>' +
    '<div class="btn-row"><button class="btn btn-primary" style="width:100%" onclick="closeModal()">关闭</button></div>'
  );
}

// ============================================================================
// 📰 每日财经新闻（数据驱动展示 + AI 深度摘要）
// 数据源：LiveData.news（data/news.json，每日 7:00 抓取）的 财经/央视财经/国际金融/国际局势 类目
// AI 深度摘要：复用 callLLMForPrompt（默认 Gemini + 🌐联网接地），生成 今日要点+主题+深度摘要+所以呢
// 落库：DB.data.growth.invest.dailyNews（数组，cap 30），并接入「我的产出」hub（source: investnews）
// ============================================================================
var INV_NEWS_CATS = ["finance", "cctv", "intlfin", "world"];
window.__invNewsCat = null; // all | finance | cctv | intlfin | world

function invNewsItems() {
  var nd = (typeof LiveData !== "undefined" && LiveData.news) ? LiveData.news : null;
  if (!nd || !nd.items) return [];
  return nd.items.filter(function (n) { return INV_NEWS_CATS.indexOf(n.category) >= 0; });
}
function invNewsData() {
  var nd = (typeof LiveData !== "undefined" && LiveData.news) ? LiveData.news : null;
  if (!nd) return null;
  var catMap = {};
  (nd.categories || []).forEach(function (c) { catMap[c.key] = c; });
  return { nd: nd, catMap: catMap };
}
function invNewsToday() {
  var inv = ensureInvest();
  var t = (typeof today === "function") ? today() : "";
  var arr = inv.dailyNews || [];
  for (var i = 0; i < arr.length; i++) { if (arr[i].date === t) return arr[i]; }
  return null;
}
function invNewsSaveDigest(rec) {
  var inv = ensureInvest();
  if (!inv.dailyNews) inv.dailyNews = [];
  inv.dailyNews.unshift(rec);
  if (inv.dailyNews.length > 30) inv.dailyNews.length = 30;
  try { DB.save(); } catch (e) {}
}

function setInvNewsCat(f) { window.__invNewsCat = f; renderInvest(); }

function renderInvestNews(inv) {
  var items = invNewsItems();
  var data = invNewsData();
  if (!data || !items.length) {
    return '<div class="empty-state"><div class="empty-icon">📰</div><div class="empty-text">今日财经新闻尚未生成<br>每日 7:00 自动抓取财经 / 央视 / 国际金融资讯</div></div>';
  }
  if (!window.__invNewsCat) window.__invNewsCat = "all";
  var catMap = data.catMap;
  var cats = INV_NEWS_CATS.map(function (k) { return catMap[k] || { key: k, label: k, icon: "" }; });
  var chips = '<div class="filter-bar" style="margin-bottom:8px">' +
    '<div class="chip' + (window.__invNewsCat === "all" ? " active" : "") + '" onclick="setInvNewsCat(\'all\')">全部</div>' +
    cats.map(function (cat) {
      return '<div class="chip' + (window.__invNewsCat === cat.key ? " active" : "") + '" onclick="setInvNewsCat(\'' + cat.key + '\')">' + (cat.icon || "") + " " + cat.label + "</div>";
    }).join("") + "</div>";

  var fresh = (data.nd.generatedAt && data.nd.generatedAt.slice(0, 10) === (typeof today === "function" ? today() : "")) ? '<span class="badge badge-green" style="margin-left:6px">今日已更新</span>' : "";
  var html = '<div class="inv-overview">';
  html += '<div class="inv-card"><div class="inv-card-h"><span>📰 每日财经新闻</span><span class="inv-hint">非投资建议</span></div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin:6px 0 10px">自动抓取 财经/央视财经/国际金融/国际局势 · 更新时间 ' + escapeHtml((data.nd.generatedAt || "").slice(0, 16).replace("T", " ")) + fresh + "</div>" +
    chips + "</div>";

  // AI 深度摘要（今日已生成 → 展示；未生成 → 生成入口）
  var digest = invNewsToday();
  html += invNewsDigestCard(digest);
  if (!digest) html += invNewsAICard(items);

  // 分类新闻流
  var filtered = window.__invNewsCat === "all" ? items : items.filter(function (n) { return n.category === window.__invNewsCat; });
  cats.forEach(function (cat) {
    var list = filtered.filter(function (n) { return n.category === cat.key; });
    if (!list.length) return;
    html += '<div class="inv-card"><div class="inv-card-h"><span>' + (cat.icon || "") + " " + cat.label + "</span><span class='inv-hint'>" + list.length + " 条</span></div>" +
      list.map(function (n) {
        var meta = [escapeHtml(n.source || "综合消息面")];
        if (n.pubTime) meta.push("🕒 " + escapeHtml(n.pubTime));
        return '<div class="inv-news-item">' +
          '<div class="inv-news-t">' + escapeHtml(n.title) + "</div>" +
          (n.summary ? '<div class="inv-news-s">' + escapeHtml(n.summary) + "</div>" : "") +
          '<div class="inv-news-m">' + meta.join(" · ") +
            (n.url ? ' <a class="source-link" href="' + escapeHtml(n.url) + '" target="_blank" rel="noopener">🔗 原文 ↗</a>' : "") +
          "</div></div>";
      }).join("") + "</div>";
  });
  html += '<div class="inv-disclaimer">⚠️ 资讯来自公开来源聚合，仅供市场热度追踪参考，不构成投资建议。</div>';
  html += "</div>"; // .inv-overview
  return html;
}

// AI 生成控制卡（未生成时显示）
function invNewsAICard(items) {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var provSel = '<select class="form-select" id="inv-news-provider" style="flex:1;min-width:140px">' + invNewsProviderOptions().join("") + "</select>";
  return '<div class="inv-card" style="border:1px dashed var(--accent-blue)">' +
    '<div class="inv-card-h"><span>🤖 AI 深度摘要</span><span class="inv-hint">今日要点 · 主题 · 深度摘要 · 所以呢</span></div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin:6px 0 10px">用你已配置的联网模型，把今日 ' + items.length + " 条财经新闻聚合成深度日报（默认 Gemini 联网接地、返真实来源）。未填 Key 会引导去「设置 → 模型配置」。</div>" +
    '<div class="flex-between" style="gap:8px;align-items:center">' + provSel +
      '<button class="btn btn-secondary" onclick="invToggleWs(this)">' + (cfg.webSearch !== false ? "🌐 联网检索 ON" : "🚫 联网 OFF") + "</button>" +
      '<button class="btn btn-primary" onclick="invGenNewsDigest()">🚀 生成深度摘要</button></div>' +
    '<div class="inv-news-status" id="inv-news-status"></div>' +
    "</div>";
}

// 深度摘要卡（今日已生成 → 渲染内容 + 操作按钮）
function invNewsDigestCard(digest) {
  if (!digest) return "";
  return '<div class="inv-card inv-digest">' +
    '<div class="inv-card-h"><span>🤖 今日财经深度摘要</span>' +
      '<span class="inv-hint">' + escapeHtml(digest.provider || "AI") + " · " + escapeHtml((digest.createdAt || "").slice(0, 16).replace("T", " ")) + "</span></div>" +
    invNewsDigestBodyHtml(digest) +
    '<div class="flex-between" style="margin-top:10px">' +
      '<button class="btn btn-secondary" onclick="invGenNewsDigest(true)">🔄 重新生成</button>' +
      '<button class="btn btn-primary" onclick="invViewNewsDigest()">👁 查看详情</button></div>' +
    '<div class="inv-news-status" id="inv-news-status"></div>' +
    "</div>";
}

// 摘要正文（供 tab 卡片 / 详情弹窗 / 我的产出 hub 复用）
function invNewsDigestBodyHtml(digest) {
  if (!digest) return "";
  var html = "";
  var kps = (digest.keyPoints || []).filter(Boolean);
  if (kps.length) {
    html += '<div class="inv-digest-kps">' + kps.map(function (k) {
      return '<div class="inv-digest-kp"><span class="inv-digest-dot">◆</span>' + escapeHtml(k) + "</div>";
    }).join("") + "</div>";
  }
  if (digest.summary) html += '<div class="inv-digest-sum">' + escapeHtml(digest.summary) + "</div>";
  (digest.themes || []).forEach(function (th) {
    var its = (th.items || []).filter(function (it) { return it && it.title; });
    if (!its.length) return;
    html += '<div class="inv-digest-theme"><div class="inv-digest-th">📌 ' + escapeHtml(th.theme || "主题") + "</div>" +
      its.map(function (it) {
        var meta = [];
        if (it.time) meta.push("🕒 " + escapeHtml(it.time));
        if (it.source) meta.push(escapeHtml(it.source));
        return '<div class="inv-digest-item">' +
          '<div class="inv-digest-t">' + escapeHtml(it.title) +
            (it.url ? ' <a class="source-link" href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener">🔗 ↗</a>' : "") + "</div>" +
          (it.digest ? '<div class="inv-digest-d">' + escapeHtml(it.digest) + "</div>" : "") +
          (it.soWhat ? '<div class="inv-digest-so">所以呢：' + escapeHtml(it.soWhat) + "</div>" : "") +
          (meta.length ? '<div class="inv-news-m">' + meta.join(" · ") + "</div>" : "") +
          "</div>";
      }).join("") + "</div>";
  });
  var sigs = (digest.signals || []).filter(Boolean);
  if (sigs.length) {
    html += '<div class="inv-digest-signals"><div class="inv-digest-th">🔔 可观察信号</div>' + sigs.map(function (s) {
      return '<div class="inv-digest-kp"><span class="inv-digest-dot">▸</span>' + escapeHtml(s) + "</div>";
    }).join("") + "</div>";
  }
  var srcs = (digest.sources || []).filter(function (s) { return s && s.url; });
  if (srcs.length) {
    html += '<div class="inv-digest-src">参考来源：' + srcs.map(function (s) {
      return '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.title || s.url) + " ↗</a>";
    }).join(" · ") + "</div>";
  }
  return html;
}

// 供「我的产出」hub 复用
function invNewsReportHtmlForHub(rec) {
  return invNewsDigestBodyHtml(rec);
}

function invNewsProviderOptions() {
  var keys = Object.keys((typeof INTEL_PROVIDERS !== "undefined") ? INTEL_PROVIDERS : {});
  if (!keys.length) return ['<option value="gemini">Gemini（联网·免费Key） 🌐</option>'];
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var defProv = cfg.provider || "gemini";
  return keys.filter(function (k) {
    var p = INTEL_PROVIDERS[k];
    return p && typeof p.buildBodyForPrompt === "function" && p.search !== false;
  }).map(function (k) {
    var p = INTEL_PROVIDERS[k];
    var label = (p.label || k) + (p.search ? " 🌐" : "");
    return '<option value="' + k + '"' + (k === defProv ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  });
}

function invToggleWs(el) {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  cfg.webSearch = (cfg.webSearch === false) ? true : false;
  if (typeof saveAiConfig === "function") saveAiConfig(cfg);
  if (el) el.textContent = cfg.webSearch !== false ? "🌐 联网检索 ON" : "🚫 联网 OFF";
  if (typeof showToast === "function") showToast(cfg.webSearch !== false ? "已开启联网检索（真实来源）" : "已关闭联网检索（仅用预置资讯）", "success");
}

function invNewsBuildPrompt(items) {
  var ctx = items.slice(0, 24).map(function (n, i) {
    return (i + 1) + ". 【" + (n.category || "") + "】" + (n.title || "") + "（" + (n.source || "") + "）" + (n.summary ? "：" + n.summary : "");
  }).join("\n");
  var dateStr = (typeof today === "function") ? today() : "";
  return "你是每日财经新闻主编，擅长把当日多源财经资讯整理成结构化深度日报。\n" +
    "日期：" + dateStr + "\n\n" +
    "以下是今日已抓取的财经新闻（含标题/来源/摘要），请结合联网检索到的最新进展，把它们整理成一份深度日报：\n" +
    ctx + "\n\n" +
    "要求：\n" +
    "1. 主题聚类：按 货币政策/资本市场/大宗商品/汇率/地产/产业动态/国际局势 等归类，同一主题合并为一段。\n" +
    "2. 每条新闻深度摘要 150-300 字：含核心事件、关键数据、背景、对市场的影响；末尾加「所以呢」一句话（数据背后的可观察信号，不做买卖建议）。\n" +
    "3. 今日要点 3-6 条（最值得关注的）。\n" +
    "4. 尽量给出真实可点击的来源网页链接（URL 放入对应条目的 url 字段；联网检索到的来源也一并列出）。\n\n" +
    "请严格输出如下 JSON（不要任何额外文字，不要 markdown 代码块包裹）：\n" +
    "{\n" +
    '  "summary": "3-5 句话执行摘要",\n' +
    '  "keyPoints": ["今日要点1", "今日要点2"],\n' +
    '  "themes": [ { "theme": "主题名", "items": [ { "title": "新闻标题", "time": "发布时间", "source": "来源", "url": "https://...", "digest": "150-300字深度摘要，含数据与影响", "soWhat": "所以呢一句话" } ] } ],\n' +
    '  "signals": ["1-3 条可观察信号"],\n' +
    '  "sources": [ { "title": "来源标题", "url": "https://..." } ]\n' +
    "}";
}

function invNormalizeDigest(parsed, opts) {
  parsed = parsed || {}; opts = opts || {};
  var arr = function (x) { return Array.isArray(x) ? x : []; };
  var str = function (x, d) { return x == null ? (d || "") : String(x); };
  var themes = arr(parsed.themes).filter(function (th) { return th && (th.theme || (th.items && th.items.length)); }).map(function (th) {
    return {
      theme: str(th.theme),
      items: arr(th.items).filter(function (it) { return it && it.title; }).map(function (it) {
        return { title: str(it.title), time: str(it.time), source: str(it.source), url: str(it.url), digest: str(it.digest || it.summary), soWhat: str(it.soWhat) };
      })
    };
  }).filter(function (th) { return th.items.length; });
  var sources = arr(parsed.sources).filter(function (s) { return s && s.url; }).map(function (s) { return { title: str(s.title), url: str(s.url) }; });
  (opts.sources || []).forEach(function (s) {
    if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: str(s.title), url: str(s.url) });
  });
  if (typeof intelExtractTextLinks === "function") {
    intelExtractTextLinks(opts.text).forEach(function (s) {
      if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: str(s.title), url: str(s.url) });
    });
  }
  return {
    id: (typeof uid === "function" ? uid() : "dn" + Math.random().toString(36).slice(2, 9)),
    date: opts.date || (typeof today === "function" ? today() : ""),
    createdAt: new Date().toISOString(),
    provider: opts.provider || "AI联网",
    summary: str(parsed.summary),
    keyPoints: arr(parsed.keyPoints).map(function (k) { return str(k); }).filter(Boolean),
    themes: themes,
    signals: arr(parsed.signals).map(function (s) { return str(s); }).filter(Boolean),
    sources: sources,
    text: opts.text || ""
  };
}

async function invGenNewsDigest() {
  var items = invNewsItems();
  if (!items.length) { if (typeof showToast === "function") showToast("今日还没有财经新闻，稍后再试", "warning"); return; }
  var providerEl = document.getElementById("inv-news-provider");
  var provider = providerEl ? providerEl.value : "gemini";
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var apiKey = cfg.apiKey || "";
  if (!apiKey) {
    if (typeof showModal === "function") {
      showModal('<div class="modal-title">⚠️ 还没填大模型 Key</div>' +
        '<div class="form-group">「AI 深度摘要」需要大模型 Key（默认 Gemini，联网接地免费，不找你要密码）。<br>请到 <b>设置 → 模型配置</b> 里填：</div>' +
        '<div class="text-xs text-secondary">• Gemini：开 VPN 后 AI Studio 免费 Key 可直连<br>• 智谱 GLM-4-Flash / 硅基流动：国内可直连免费</div>' +
        '<div class="btn-row"><button class="btn btn-primary" onclick="closeModal();navigate(\'settings\')">去设置填 Key</button></div>');
    }
    return;
  }
  var statusEl = document.getElementById("inv-news-status");
  if (statusEl) { statusEl.className = "inv-news-status"; statusEl.innerHTML = "⏳ 正在联网检索并整理今日财经新闻，约 30-60 秒…"; }
  if (typeof showToast === "function") showToast("开始生成财经深度摘要", "success");
  var prompt = invNewsBuildPrompt(items);
  try {
    if (typeof callLLMForPrompt !== "function") throw new Error("大模型调用层未就绪");
    var r = await callLLMForPrompt(provider, apiKey, prompt);
    var parsed = (typeof parseIntelLLM === "function") ? parseIntelLLM(r.text) : JSON.parse(r.text);
    var rec = invNormalizeDigest(parsed, {
      provider: provider, date: (typeof today === "function") ? today() : "",
      text: r.text, sources: r.sources || []
    });
    invNewsSaveDigest(rec);
    if (statusEl) { statusEl.className = "inv-news-status ok"; statusEl.innerHTML = "✅ 已生成今日财经深度摘要"; }
    if (typeof showToast === "function") showToast("深度摘要已生成，可到「我的产出」查看", "success");
    renderInvest();
  } catch (e) {
    if (statusEl) { statusEl.className = "inv-news-status err"; statusEl.innerHTML = "❌ 生成失败：" + escapeHtml(e && e.message ? e.message : String(e)); }
    if (typeof showToast === "function") showToast("生成失败：" + (e && e.message ? e.message : e), "error");
  }
}

function invViewNewsDigest() {
  var digest = invNewsToday();
  if (!digest) return;
  var html = '<div class="aio-view-scroll">' + invNewsDigestBodyHtml(digest) + "</div>" +
    '<details style="margin-top:10px"><summary>📄 原始 JSON（兜底）</summary><pre style="white-space:pre-wrap;font-size:12px;background:var(--bg-card,#f7f7f5);padding:10px;border-radius:8px;max-height:260px;overflow:auto">' + escapeHtml(JSON.stringify(digest, null, 1)) + "</pre></details>";
  if (typeof showModal === "function") showModal('<div class="modal-title">📰 每日财经新闻 · 深度摘要</div>' + html);
}

// ============================================================================
// v5.9.28 三合一：基金监控 / 智能选股 / 基金投顾
// 数据通道（均已实测 CORS 开放）：
//   天天基金 pingzhongdata（JSONP 串行加载）→ 历史净值/压力位/支撑位
//   东方财富 push2 clist（fetch）→ 条件选股
//   腾讯 web.ifzq.gtimg.cn K线 + qt.gtimg.cn 行情（fetch）→ 个股走势核对
//   免费大模型（intel.js 的 INTEL_PROVIDERS）→ AI 解读/配置建议
// ============================================================================

// ===================== 📡 基金监控（替换原「持仓盈亏」）=====================
// 公式（基金监控技能）：压力位 = 20日均线×1.05 与 当前净值×1.05 取较大者；
//                      支撑位 = 20日均线×0.95 与 当前净值×0.95 取较小者（智能判断）
// 解析 pingzhongdata JS 文本（纯函数，可测）
function invParsePingzhong(src) {
  var out = { name: "", trend: [] };
  if (!src) return out;
  try {
    var nm = src.match(/fS_name\s*=\s*"([^"]*)"/);
    if (nm) out.name = nm[1];
    var m = src.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (m) {
      var arr = JSON.parse(m[1]);
      out.trend = arr.filter(function (p) { return p && typeof p.y === "number"; })
        .map(function (p) { return { x: p.x, y: p.y, r: p.equityReturn }; });
    }
  } catch (e) {}
  return out;
}
// 最新净值（纯函数）
function invLatestNav(trend) {
  if (!trend || !trend.length) return null;
  var last = trend[trend.length - 1];
  return { nav: last.y, date: last.x, ret: last.r };
}
// 20日均线 + 压力位/支撑位（纯函数，fund-168 公式）
function invCalcSupportResistance(trend, curNav) {
  if (!trend || !trend.length || curNav == null || isNaN(curNav) || curNav <= 0) return null;
  var n = Math.min(20, trend.length);
  var sum = 0;
  for (var i = trend.length - n; i < trend.length; i++) sum += trend[i].y;
  var ma20 = sum / n;
  var pressure = (ma20 * 1.05 > curNav) ? ma20 * 1.05 : curNav * 1.05;
  var support = (ma20 * 0.95 < curNav) ? ma20 * 0.95 : curNav * 0.95;
  return {
    ma20: ma20, pressure: pressure, support: support,
    toPressurePct: (pressure - curNav) / curNav * 100,
    toSupportPct: (curNav - support) / curNav * 100,
    nearPressure: curNav >= pressure * 0.985,
    nearSupport: curNav <= support * 1.015
  };
}
// 持仓浮盈亏（纯函数）
function invFundFloatPL(cost, curNav) {
  if (cost == null || curNav == null || !cost) return null;
  return (curNav - cost) / cost * 100;
}
// 监控数据（code → {name, trend}）与串行加载状态
window.__invMonData = window.__invMonData || {};
var __invMonLoading = false;
function invMonitorLoadAll() {
  var inv = ensureInvest();
  var codes = (inv.funds || []).map(function (f) { return f.code; });
  var need = codes.filter(function (c) { return !window.__invMonData[c]; });
  if (!need.length) return;
  if (__invMonLoading) return;
  __invMonLoading = true;
  var i = 0;
  function next() {
    if (i >= need.length) { __invMonLoading = false; renderInvest(); return; }
    var code = need[i++];
    var s = document.createElement("script");
    s.src = "https://fund.eastmoney.com/pingzhongdata/" + code + ".js";
    s.onload = function () {
      try {
        var trend = (typeof window.Data_netWorthTrend !== "undefined" && Array.isArray(window.Data_netWorthTrend))
          ? window.Data_netWorthTrend.map(function (p) { return { x: p.x, y: p.y, r: p.equityReturn }; })
          : [];
        var name = (typeof window.fS_name !== "undefined") ? window.fS_name : code;
        window.__invMonData[code] = { name: name, trend: trend };
      } catch (e) { window.__invMonData[code] = { name: code, trend: [] }; }
      if (s.parentNode) s.parentNode.removeChild(s);
      setTimeout(next, 200);
    };
    s.onerror = function () {
      window.__invMonData[code] = { name: code, trend: [] };
      if (s.parentNode) s.parentNode.removeChild(s);
      setTimeout(next, 200);
    };
    if (document.head) document.head.appendChild(s);
    else { setTimeout(next, 200); }
  }
  next();
}
function renderInvestMonitor(inv) {
  if (window.__invMonSel) return renderInvestMonitorDetail(inv);
  var html = "";
  var funds = inv.funds || [];
  if (!funds.length) {
    return '<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-text">还没有持仓基金<br>到「基金估值」页点 ➕ 添加基金后，这里会显示压力位/支撑位与浮盈亏监控</div></div>';
  }
  invMonitorLoadAll();
  var loaded = 0, alertCount = 0;
  var cards = funds.map(function (f) {
    var d = window.__invMonData[f.code];
    if (d) loaded++;
    if (!d || !d.trend || !d.trend.length) {
      return '<div class="inv-fund-card" style="opacity:.7;cursor:pointer" onclick="invOpenFundDetail(\'' + f.code + '\')">' +
        '<div class="inv-fund-card-h"><div><span class="inv-fund-name">' + escapeHtml(f.nickname || f.code) + '</span><span class="inv-fund-code">' + f.code + '</span></div>' +
        '<div class="inv-fund-rate flat">⏳ 加载净值中…</div></div></div>';
    }
    var last = invLatestNav(d.trend);
    var cur = last ? last.nav : null;
    var sr = cur != null ? invCalcSupportResistance(d.trend, cur) : null;
    var pl = invFundFloatPL(f.cost, cur);
    var rateClass = cur == null ? "flat" : upDownClass(last.ret);
    var alert = "";
    if (sr) {
      if (sr.nearPressure) { alert = '<span class="badge badge-red">🔺 接近压力位</span>'; alertCount++; }
      else if (sr.nearSupport) { alert = '<span class="badge badge-orange">🔻 接近支撑位</span>'; alertCount++; }
    }
    var name = escapeHtml(d.name || f.nickname || f.code);
    return '<div class="inv-fund-card" style="cursor:pointer" onclick="invOpenFundDetail(\'' + f.code + '\')">' +
      '<div class="inv-fund-card-h">' +
        '<div><span class="inv-fund-name">' + name + '</span><span class="inv-fund-code">' + f.code + '</span>' + alert + '</div>' +
        '<div class="inv-fund-rate ' + rateClass + '">' + (cur != null ? cur.toFixed(4) : "—") +
          (last && last.ret != null ? ' <small>' + (last.ret >= 0 ? "+" : "") + last.ret.toFixed(2) + "%</small>" : "") + '</div>' +
      '</div>' +
      '<div class="inv-mon-line">' +
        '<span>🔺 压力位 <b>' + (sr ? sr.pressure.toFixed(4) : "—") + '</b>' + (sr ? ' <small class="text-secondary">距 ' + sr.toPressurePct.toFixed(1) + '%</small>' : '') + '</span>' +
        '<span>🔻 支撑位 <b>' + (sr ? sr.support.toFixed(4) : "—") + '</b>' + (sr ? ' <small class="text-secondary">距 ' + sr.toSupportPct.toFixed(1) + '%</small>' : '') + '</span>' +
        '<span>20日线 <b>' + (sr ? sr.ma20.toFixed(4) : "—") + '</b></span>' +
      '</div>' +
      '<div class="inv-fund-meta">' +
        '<span>📅 ' + (last ? new Date(last.date).toISOString().slice(0, 10) : "—") + '</span>' +
        '<span>💼 ' + (f.shares != null ? f.shares + '份' : '未设份额') + '</span>' +
        (f.cost != null ? '<span class="' + (pl != null && pl >= 0 ? "up" : "down") + '">浮盈亏 ' + (pl != null ? (pl >= 0 ? "+" : "") + pl.toFixed(2) + "%" : "—") + '</span>' : '<span class="text-secondary">未设成本价</span>') +
      '</div>' +
    '</div>';
  }).join("");
  html += '<div class="stats-grid">' +
    '<div class="stat-card"><div class="stat-icon">📡</div><div class="stat-value">' + funds.length + '</div><div class="stat-label">监控基金</div></div>' +
    '<div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">' + loaded + '/' + funds.length + '</div><div class="stat-label">已加载净值</div></div>' +
    '<div class="stat-card"><div class="stat-icon">🚨</div><div class="stat-value" style="color:' + (alertCount ? "var(--accent-red)" : "inherit") + '">' + alertCount + '</div><div class="stat-label">触发告警</div></div>' +
    '</div>' +
    (__invMonLoading ? '<div class="inv-fund-loading">⏳ 正在加载基金历史净值（' + loaded + '/' + funds.length + '）…</div>' : '') +
    cards +
    '<div class="inv-fund-tip">💡 压力/支撑位 = 20日均线 ±5% 智能判断；接近压力位提示减仓观察，接近支撑位提示企稳机会。点任意基金卡片可看历史净值折线图并编辑份额/成本。</div>';
  return html;
}

// ===================== 📡 基金监控 · 历史净值详情（点击进入：折线图 + 编辑份额/成本）=====================
window.__invMonSel = window.__invMonSel || null;        // 当前查看详情的基金代码
window.__invMonRange = window.__invMonRange || "1y";    // 近1月/近3月/近1年/全部
var INV_MON_RANGES = [
  { id: "1m", label: "近1月", days: 21 },
  { id: "3m", label: "近3月", days: 63 },
  { id: "1y", label: "近1年", days: 250 },
  { id: "all", label: "全部", days: 0 }
];
function invOpenFundDetail(code) { window.__invMonSel = code; renderInvest(); }
function invCloseFundDetail() { window.__invMonSel = null; renderInvest(); }
function setInvMonRange(r) { window.__invMonRange = r; invMonRenderChart(ensureInvest()); }
// 按范围截取趋势（纯函数，可测）
function invMonRangePoints(trend, rangeId) {
  if (!trend || !trend.length) return [];
  var days = 0;
  for (var i = 0; i < INV_MON_RANGES.length; i++) if (INV_MON_RANGES[i].id === rangeId) days = INV_MON_RANGES[i].days;
  var map = function (p) { return { value: p.y, date: p.x }; };
  if (!days) return trend.map(map);
  var cutoff = Date.now() - days * 86400000;
  var filtered = trend.filter(function (p) { return p.x >= cutoff; });
  return filtered.length ? filtered.map(map) : [map(trend[trend.length - 1])];
}
// 渲染历史净值折线图（在 innerHTML 写入后调用）
function invMonRenderChart(inv) {
  var code = window.__invMonSel;
  if (!code) return;
  var d = window.__invMonData && window.__invMonData[code];
  var el = document.getElementById("inv-mon-chart");
  if (!el) return;
  if (!d || !d.trend || !d.trend.length) { el.innerHTML = '<div class="inv-chart-empty">⏳ 净值历史加载中…</div>'; return; }
  var pts = invMonRangePoints(d.trend, window.__invMonRange);
  if (!pts.length) pts = [{ value: d.trend[d.trend.length - 1].y, date: d.trend[d.trend.length - 1].x }];
  investLine("inv-mon-chart", pts);
}
// 保存份额/成本（监控详情内联编辑，写入 invest.json）
function invSaveMonFund(code) {
  var shEl = document.getElementById("inv-mon-shares");
  var coEl = document.getElementById("inv-mon-cost");
  if (!shEl || !coEl) return;
  var inv = ensureInvest();
  var idx = (inv.funds || []).findIndex(function (x) { return x.code === code; });
  if (idx < 0) { if (typeof showToast === "function") showToast("未找到该基金", "warn"); return; }
  var sh = parseFloat(shEl.value), co = parseFloat(coEl.value);
  inv.funds[idx].shares = isNaN(sh) ? null : sh;
  inv.funds[idx].cost = isNaN(co) ? null : co;
  inv.funds[idx].editedAt = new Date().toISOString();
  DB.save();
  if (typeof showToast === "function") showToast("已保存份额/成本", "success");
  renderInvest();
}
// 监控详情视图
function renderInvestMonitorDetail(inv) {
  var code = window.__invMonSel;
  var f = (inv.funds || []).find(function (x) { return x.code === code; });
  if (!f) { window.__invMonSel = null; return renderInvestMonitor(inv); }
  invMonitorLoadAll(); // 确保选中基金净值已加载
  var d = window.__invMonData && window.__invMonData[code];
  var name = (d && d.name) || f.nickname || code;
  var loaded = d && d.trend && d.trend.length;
  var last = loaded ? invLatestNav(d.trend) : null;
  var cur = last ? last.nav : null;
  var sr = (cur != null) ? invCalcSupportResistance(d.trend, cur) : null;
  var pl = invFundFloatPL(f.cost, cur);
  var mv = (cur != null && f.shares != null) ? cur * f.shares : null;
  var html = "";
  html += '<div class="inv-back" onclick="invCloseFundDetail()">‹ 返回监控列表</div>';
  html += '<div class="inv-fund-card">' +
    '<div class="inv-fund-card-h"><div><span class="inv-fund-name">' + escapeHtml(name) + '</span><span class="inv-fund-code">' + code + '</span></div>' +
    '<div class="inv-fund-rate ' + (cur == null ? "flat" : upDownClass(last.ret)) + '">' + (cur != null ? cur.toFixed(4) : "⏳") +
      (last && last.ret != null ? ' <small>' + (last.ret >= 0 ? "+" : "") + last.ret.toFixed(2) + "%</small>" : "") + '</div></div>';
  html += '<div class="filter-bar" style="margin:6px 0 8px">' +
    INV_MON_RANGES.map(function (r) { return '<div class="chip' + (window.__invMonRange === r.id ? " active" : "") + '" onclick="setInvMonRange(\'' + r.id + '\')">' + r.label + '</div>'; }).join("") +
    '</div>';
  html += '<div class="inv-mon-chart-wrap"><div id="inv-mon-chart"></div></div>';
  if (sr) {
    html += '<div class="inv-mon-line">' +
      '<span>🔺 压力位 <b>' + sr.pressure.toFixed(4) + '</b> <small class="text-secondary">距 ' + sr.toPressurePct.toFixed(1) + '%</small></span>' +
      '<span>🔻 支撑位 <b>' + sr.support.toFixed(4) + '</b> <small class="text-secondary">距 ' + sr.toSupportPct.toFixed(1) + '%</small></span>' +
      '<span>20日线 <b>' + sr.ma20.toFixed(4) + '</b></span>' +
      '</div>';
  }
  html += '<div class="card" style="margin-top:10px"><div class="card-h">✎ 持仓信息（份额 / 成本）</div>' +
    '<div class="inv-edit-row">' +
    '<div class="inv-edit-field"><label class="form-label">持有份额</label><input class="form-input" id="inv-mon-shares" type="number" step="any" value="' + (f.shares != null ? f.shares : "") + '" placeholder="如 10000"></div>' +
    '<div class="inv-edit-field"><label class="form-label">成本净值</label><input class="form-input" id="inv-mon-cost" type="number" step="any" value="' + (f.cost != null ? f.cost : "") + '" placeholder="如 1.5000"></div>' +
    '</div>' +
    '<div class="btn-row" style="margin-top:10px"><button class="btn btn-primary" style="flex:1" onclick="invSaveMonFund(\'' + code + '\')">💾 保存</button></div>' +
    (mv != null ? '<div class="inv-fund-meta" style="margin-top:8px"><span>💰 市值 ' + fmtMoneyFull(mv) + '</span>' +
      (pl != null ? '<span class="' + (pl >= 0 ? "up" : "down") + '">浮盈亏 ' + (pl >= 0 ? "+" : "") + pl.toFixed(2) + '%</span>' : '') + '</div>' : '') +
    '</div>';
  html += '<div class="inv-fund-tip">💡 折线图为该基金历史单位净值走势（东方财富）。份额/成本保存后，监控列表与浮盈亏自动更新。</div>';
  return html;
}

// ===================== 🔍 智能选股（融合 东方财富选股 + 腾讯自选股）=====================
var INV_SCREENER_PRESETS = [
  { id: "rise", label: "📈 今日涨幅榜", fid: "f3", po: 1, fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23" },
  { id: "amount", label: "💵 成交额榜", fid: "f6", po: 1, fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23" },
  { id: "lowpe", label: "🔻 低市盈率", fid: "f9", po: 0, fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23" },
  { id: "bigcap", label: "🏦 大市值", fid: "f20", po: 1, fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23" },
  { id: "gz", label: "🏭 贵州板块", fid: "f3", po: 1, fs: "b:BK0535" }
];
// 解析东财 clist JSON（纯函数，可测）
function invParseEastmoneyClist(json) {
  var rows = [];
  var diff = json && json.data && json.data.diff;
  if (!Array.isArray(diff)) return rows;
  diff.forEach(function (d) {
    rows.push({
      code: String(d.f12 || ""), name: String(d.f14 || ""),
      price: d.f2, pct: d.f3, turnover: d.f5, amount: d.f6, pe: d.f9, cap: d.f20
    });
  });
  return rows;
}
function invFmtAmount(v) { if (v == null || isNaN(v)) return "—"; if (v >= 1e8) return (v / 1e8).toFixed(1) + "亿"; if (v >= 1e4) return (v / 1e4).toFixed(1) + "万"; return String(v); }
function invFmtCap(v) { if (v == null || isNaN(v)) return "—"; if (v >= 1e8) return (v / 1e8).toFixed(0) + "亿"; return (v / 1e4).toFixed(0) + "万"; }
function invFetchScreener(presetId) {
  var preset = null;
  for (var i = 0; i < INV_SCREENER_PRESETS.length; i++) if (INV_SCREENER_PRESETS[i].id === presetId) { preset = INV_SCREENER_PRESETS[i]; break; }
  if (!preset) return;
  window.__invScreenerLoading = true;
  window.__invScreenerPreset = presetId;
  if (!window.__invScreenerRows) window.__invScreenerRows = [];
  renderInvest();
  // 用 JSONP（script 注入 + cb 回调）彻底绕开跨域 CORS 限制（fetch 在部署域名下会 load failed）
  var cbName = "__invScCb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
  var url = "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=15&po=" + preset.po + "&np=1&fltt=2&invt=2&fid=" + preset.fid +
    "&fs=" + encodeURIComponent(preset.fs) + "&fields=f2,f3,f5,f6,f9,f12,f14,f20&cb=" + cbName;
  function cleanup() {
    try {
      var els = (document.head && document.head.querySelectorAll ? document.head.querySelectorAll("script") : []);
      for (var k = 0; k < els.length; k++) {
        if (els[k].src && els[k].src.indexOf("cb=" + cbName) >= 0 && els[k].parentNode) els[k].parentNode.removeChild(els[k]);
      }
    } catch (e) {}
  }
  window[cbName] = function (j) {
    try {
      window.__invScreenerRows = invParseEastmoneyClist(j);
      window.__invScreenerError = "";
    } catch (e) {
      window.__invScreenerRows = [];
      window.__invScreenerError = (e && e.message) || String(e);
    }
    window.__invScreenerLoading = false;
    cleanup();
    try { delete window[cbName]; } catch (e) {}
    renderInvest();
  };
  var s = document.createElement("script");
  s.src = url;
  s.onerror = function () {
    window.__invScreenerRows = [];
    window.__invScreenerLoading = false;
    window.__invScreenerError = "脚本加载失败（网络/CORS）";
    try { delete window[cbName]; } catch (e) {}
    cleanup();
    renderInvest();
    if (typeof showToast === "function") showToast("选股数据加载失败，请检查网络", "error");
  };
  if (document.head) document.head.appendChild(s);
  else { window.__invScreenerLoading = false; renderInvest(); }
}
function renderInvestScreener(inv) {
  var html = "";
  if (window.__invScreenerPreset == null) window.__invScreenerPreset = "rise";
  if (!window.__invScreenerRows && !window.__invScreenerLoading) invFetchScreener(window.__invScreenerPreset);
  html += '<div class="filter-bar" style="flex-wrap:wrap;margin:2px 0 10px">' +
    INV_SCREENER_PRESETS.map(function (p) {
      return '<div class="chip' + (window.__invScreenerPreset === p.id ? " active" : "") + '" onclick="invFetchScreener(\'' + p.id + '\')">' + p.label + '</div>';
    }).join("") + '</div>';
  if (window.__invScreenerLoading) {
    html += '<div class="inv-fund-loading">⏳ 正在拉取东方财富行情数据…</div>';
  }
  var rows = window.__invScreenerRows || [];
  if (rows.length) {
    html += '<div class="inv-scan-hint">数据源：东方财富实时行情 · 点任一行看腾讯K线（20日）</div>';
    html += '<div class="inv-hold-table">' +
      '<div class="inv-hold-head"><span>代码/名称</span><span>现价</span><span>涨跌幅</span><span>市盈率</span><span>总市值</span><span>成交额</span></div>' +
      rows.map(function (r) {
        return '<div class="inv-hold-row" onclick="invShowStockKline(\'' + r.code + '\',\'' + escapeHtml(r.name).replace(/'/g, "\\'") + '\')">' +
          '<span class="inv-hold-name">' + escapeHtml(r.name) + ' <small>' + r.code + '</small></span>' +
          '<span class="inv-hold-price">' + (r.price != null ? r.price.toFixed(2) : "—") + '</span>' +
          '<span class="inv-hold-pl ' + upDownClass(r.pct) + '">' + (r.pct != null ? (r.pct >= 0 ? "+" : "") + r.pct.toFixed(2) + "%" : "—") + '</span>' +
          '<span>' + (r.pe != null ? r.pe.toFixed(1) : "—") + '</span>' +
          '<span>' + invFmtCap(r.cap) + '</span>' +
          '<span>' + invFmtAmount(r.amount) + '</span>' +
          '</div>';
      }).join("") + '</div>';
  } else if (!window.__invScreenerLoading) {
    html += '<div class="empty-state" style="padding:18px 0"><div class="empty-icon">🔍</div><div class="empty-text">' + (window.__invScreenerError ? "加载失败：" + escapeHtml(window.__invScreenerError) : "暂无数据") + '</div></div>';
  }
  html += '<div style="margin-top:10px"><button class="btn btn-secondary" style="width:100%;justify-content:center" onclick="invAiInterpret()">🤖 AI 解读当前榜单（免费大模型）</button></div>';
  html += '<div id="inv-ai-interpret"></div>';
  html += '<div class="inv-fund-tip">💡 融合：东方财富妙想智能选股（条件/排行筛选）+ 腾讯自选股（K线走势核对）；AI 解读用免费大模型联网生成。</div>';
  return html;
}
// 腾讯K线（20日）弹窗
function invShowStockKline(code, name) {
  var url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=" + code + ",day,,,20,qfq";
  fetch(url).then(function (r) { return r.json(); }).then(function (j) {
    var d = j && j.data && j.data[code];
    var arr = (d && (d.qfqday || d.day)) || [];
    if (!arr.length) { if (typeof showToast === "function") showToast("未获取到K线", "warn"); return; }
    var rows = arr.map(function (k) {
      var pct = null;
      if (k[1] && parseFloat(k[1])) pct = (parseFloat(k[4]) - parseFloat(k[1])) / parseFloat(k[1]) * 100;
      var cls = pct == null ? "flat" : (pct >= 0 ? "up" : "down");
      return '<div class="inv-hold-row" style="grid-template-columns:1fr 1fr 1fr 1fr 1fr">' +
        '<span>' + k[0] + '</span><span>' + k[2] + '</span><span>' + k[3] + '</span><span>' + k[4] + '</span>' +
        '<span class="' + cls + '">' + (pct != null ? (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%" : "—") + '</span></div>';
    }).join("");
    if (typeof showModal === "function") showModal(
      '<div class="modal-title">📉 ' + escapeHtml(name || code) + ' · 腾讯K线（20日）</div>' +
      '<div class="inv-hold-head" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;padding:6px 10px;background:var(--bg-tertiary);border-radius:8px;font-size:11px;color:var(--text-secondary)"><span>日期</span><span>开</span><span>高</span><span>收</span><span>涨跌</span></div>' +
      rows +
      '<div class="btn-row" style="margin-top:12px"><button class="btn btn-secondary" style="flex:1" onclick="closeModal()">关闭</button></div>'
    );
  }).catch(function () { if (typeof showToast === "function") showToast("K线获取失败", "error"); });
}
// AI 解读（免费大模型，复用 intel.js provider）
async function invAiInterpret() {
  var box = document.getElementById("inv-ai-interpret");
  if (!box) return;
  var rows = window.__invScreenerRows || [];
  if (!rows.length) { if (typeof showToast === "function") showToast("请先加载榜单数据", "warn"); return; }
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var provider = cfg.provider || "gemini";
  var apiKey = cfg.apiKey || "";
  if (!apiKey) {
    box.innerHTML = '<div class="intel-gen-err">⚠️ 未配置大模型 API Key。请到「🤖 自定义情报」页填写（Gemini/智谱/硅基流动 免费 Key，仅存本机），或直接点击下方重试。</div>';
    return;
  }
  box.innerHTML = '<div class="inv-fund-loading">🤖 正在生成解读…</div>';
  var sample = rows.slice(0, 8).map(function (r) {
    return { code: r.code, name: r.name, price: r.price, pct: r.pct, pe: r.pe, cap: r.cap };
  });
  var prompt = "你是资深A股市场分析师。以下是当前行情榜单前" + sample.length + "名（东方财富实时数据）：\n" +
    JSON.stringify(sample) + "\n\n请用简体中文输出 200 字以内的解读：① 榜单特征与市场情绪；② 值得关注的 2-3 个方向；③ 风险提示。不要给具体买卖指令。";
  try {
    var res = (typeof callLLMForPrompt === "function")
      ? await callLLMForPrompt(provider, apiKey, prompt)
      : null;
    var text = res ? res.text : "";
    if (!text) throw new Error("模型无返回");
    box.innerHTML = '<div class="inv-ai-box">🤖 <b>AI 解读：</b><br>' + escapeHtml(text).replace(/\n/g, "<br>") + '</div>';
  } catch (e) {
    box.innerHTML = '<div class="intel-gen-err">❌ ' + escapeHtml(e && e.message ? e.message : String(e)) + '</div>';
  }
}

// ===================== 🧑‍💼 基金投顾（替换原「行情」）=====================
var INV_ADVISOR_QUESTIONS = [
  { id: "q1", q: "你的投资期限大概是？", opts: [{ t: "1年以内", s: 1 }, { t: "1-3年", s: 2 }, { t: "3-5年", s: 3 }, { t: "5年以上", s: 4 }] },
  { id: "q2", q: "组合短期回撤多少你能接受？", opts: [{ t: "不能亏损", s: 1 }, { t: "5%以内", s: 2 }, { t: "10-20%", s: 3 }, { t: "30%以上", s: 4 }] },
  { id: "q3", q: "你更偏好哪种收益来源？", opts: [{ t: "稳健利息", s: 1 }, { t: "债基为主", s: 2 }, { t: "股债均衡", s: 3 }, { t: "高波动高收益", s: 4 }] },
  { id: "q4", q: "你的收入稳定性如何？", opts: [{ t: "不稳定", s: 1 }, { t: "一般", s: 2 }, { t: "较稳定", s: 3 }, { t: "非常稳定", s: 4 }] },
  { id: "q5", q: "你的基金投资经验？", opts: [{ t: "刚起步", s: 1 }, { t: "1-3只", s: 2 }, { t: "4-10只", s: 3 }, { t: "资深玩家", s: 4 }] }
];
// 风险评分（纯函数，可测）：总分 5-20
function invRiskScore(answers) {
  var total = 0, n = 0;
  for (var i = 0; i < INV_ADVISOR_QUESTIONS.length; i++) {
    var q = INV_ADVISOR_QUESTIONS[i];
    var s = (answers && answers[q.id] != null) ? Number(answers[q.id]) : 0;
    if (s > 0) { total += s; n++; }
  }
  if (!n) return { score: 0, level: "保守", label: "保守型", pct: { bond: 80, stock: 15, cash: 5 }, desc: "完成上方问卷后生成配置建议" };
  var level = total <= 8 ? "保守" : (total <= 14 ? "稳健" : "进取");
  var pct = { bond: 80, stock: 15, cash: 5 };
  if (level === "稳健") pct = { bond: 60, stock: 35, cash: 5 };
  if (level === "进取") pct = { bond: 40, stock: 55, cash: 5 };
  var desc = level === "保守" ? "以债基/货基为主，控制回撤" : (level === "稳健" ? "股债均衡，攻守兼备" : "以股基/指数增强为主，博取超额");
  return { score: total, level: level, label: level + "型", pct: pct, desc: desc };
}
function invAdvisorPick(qid, optIdx) {
  var q = null;
  for (var i = 0; i < INV_ADVISOR_QUESTIONS.length; i++) if (INV_ADVISOR_QUESTIONS[i].id === qid) { q = INV_ADVISOR_QUESTIONS[i]; break; }
  if (!q || !q.opts[optIdx]) return;
  if (!window.__invAdvisorAnswers) window.__invAdvisorAnswers = {};
  window.__invAdvisorAnswers[qid] = q.opts[optIdx].s;
  renderInvest();
}
function renderInvestAdvisor(inv) {
  var html = "";
  var answers = window.__invAdvisorAnswers || {};
  var rs = invRiskScore(answers);
  var answered = Object.keys(answers).length;
  // 问卷
  html += '<div class="card"><div class="card-h">🧾 风险测评问卷（' + answered + '/5）</div>' +
    INV_ADVISOR_QUESTIONS.map(function (q) {
      return '<div class="inv-ad-q"><div class="inv-ad-qt">' + q.q + '</div><div class="filter-bar" style="margin:2px 0 8px">' +
        q.opts.map(function (o, oi) {
          return '<div class="chip' + (answers[q.id] === o.s ? " active" : "") + '" onclick="invAdvisorPick(\'' + q.id + '\',' + oi + ')">' + o.t + '</div>';
        }).join("") + '</div></div>';
    }).join("") + '</div>';
  // 结果
  html += '<div class="stats-grid">' +
    '<div class="stat-card"><div class="stat-icon">🎯</div><div class="stat-value">' + rs.label + '</div><div class="stat-label">风险评级' + (rs.score ? "（" + rs.score + "分）" : "") + '</div></div>' +
    '<div class="stat-card"><div class="stat-icon">⚖️</div><div class="stat-value" style="font-size:15px">债' + rs.pct.bond + '% / 股' + rs.pct.stock + '%</div><div class="stat-label">建议配比 · ' + rs.desc + '</div></div>' +
    '</div>';
  html += '<div class="card"><div class="card-h">🥧 建议配置饼图</div><div style="display:flex;gap:10px;align-items:center">' +
    '<div class="inv-donut" id="inv-advisor-donut"></div>' +
    '<div class="inv-legend">' +
      '<div class="inv-leg-row"><span class="inv-dot" style="background:#30d158"></span><span class="inv-leg-name">债券型</span><span class="inv-leg-val">' + rs.pct.bond + '%</span></div>' +
      '<div class="inv-leg-row"><span class="inv-dot" style="background:#ff375f"></span><span class="inv-leg-name">股票型/指数</span><span class="inv-leg-val">' + rs.pct.stock + '%</span></div>' +
      '<div class="inv-leg-row"><span class="inv-dot" style="background:#ffd60a"></span><span class="inv-leg-name">货币/现金</span><span class="inv-leg-val">' + rs.pct.cash + '%</span></div>' +
    '</div></div></div>';
  // AI 建议
  html += '<div style="margin-top:10px"><button class="btn btn-secondary" style="width:100%;justify-content:center" onclick="invAiAdvisor()">🤖 AI 生成配置建议（免费大模型）</button></div>';
  html += '<div id="inv-ai-advisor"></div>';
  // 持仓健康度
  var funds = inv.funds || [];
  var etfCount = 0, activeCount = 0;
  funds.forEach(function (f) {
    var d = window.__invMonData && window.__invMonData[f.code];
    var isEtf = d && d.trend && !d.trend.length ? false : false;
    isEtf = (f.nickname || "").indexOf("ETF") >= 0 || (f.nickname || "").indexOf("联接") >= 0;
    if (isEtf) etfCount++; else activeCount++;
  });
  var health = 0;
  if (funds.length === 0) health = 0;
  else if (funds.length < 3) health = 2;
  else if (funds.length >= 3 && funds.length <= 10) health = 4;
  else health = 3;
  html += '<div class="card" style="margin-top:10px"><div class="card-h">💊 当前持仓健康度</div>' +
    '<div class="inv-ad-health"><span>持仓 ' + funds.length + ' 只</span><span>ETF/联接 ' + etfCount + '</span><span>主动型 ' + activeCount + '</span>' +
    '<span>健康度 ' + ["未评级", "★", "★★", "★★★", "★★★★"][health] + '</span></div>' +
    (funds.length && funds.length < 3 ? '<div class="inv-fund-tip" style="margin-top:6px">⚠️ 持仓偏少：建议按你的风险等级补充 1-2 只债基/指数基做分散。</div>' : '') +
    '</div>';
  html += '<div class="inv-fund-tip">💡 基金投顾 = 风险问卷 → 评级 → 配比建议；点「AI 生成配置建议」由免费大模型结合当前市场环境给出基金类型建议（需 API Key）。</div>';
  return html;
}
function investRenderAdvisorCharts(inv) {
  var rs = invRiskScore(window.__invAdvisorAnswers || {});
  if (typeof investDonut === "function" && document.getElementById("inv-advisor-donut")) {
    investDonut("inv-advisor-donut", [
      { label: "债券型", value: rs.pct.bond, color: "#30d158" },
      { label: "股票型/指数", value: rs.pct.stock, color: "#ff375f" },
      { label: "货币/现金", value: rs.pct.cash, color: "#ffd60a" }
    ]);
  }
}
async function invAiAdvisor() {
  var box = document.getElementById("inv-ai-advisor");
  if (!box) return;
  var rs = invRiskScore(window.__invAdvisorAnswers || {});
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var provider = cfg.provider || "gemini";
  var apiKey = cfg.apiKey || "";
  if (!apiKey) {
    box.innerHTML = '<div class="intel-gen-err">⚠️ 未配置大模型 API Key。请到「🤖 自定义情报」页填写免费 Key（仅存本机）。</div>';
    return;
  }
  box.innerHTML = '<div class="inv-fund-loading">🤖 正在生成配置建议…</div>';
  var inv = ensureInvest();
  var funds = (inv.funds || []).map(function (f) { return f.code + (f.nickname ? "(" + f.nickname + ")" : ""); }).join("、") || "（暂无持仓）";
  var prompt = "你是基金投资顾问。用户风险评级：" + rs.label + "（" + rs.score + "分，建议股债配比 债" + rs.pct.bond + "%/股" + rs.pct.stock + "%/现金" + rs.pct.cash + "%）。当前持仓基金：" + funds +
    "。请用简体中文输出 300 字以内建议：① 当前持仓是否符合该风险等级，是否需要调整；② 建议补充/替换的基金类型（债基/指数/行业主题）及理由；③ 定投或一次性配置建议。不要推荐具体代码，不构成投资建议。";
  try {
    var res = (typeof callLLMForPrompt === "function") ? await callLLMForPrompt(provider, apiKey, prompt) : null;
    var text = res ? res.text : "";
    if (!text) throw new Error("模型无返回");
    box.innerHTML = '<div class="inv-ai-box">🤖 <b>AI 配置建议：</b><br>' + escapeHtml(text).replace(/\n/g, "<br>") + '</div>';
  } catch (e) {
    box.innerHTML = '<div class="intel-gen-err">❌ ' + escapeHtml(e && e.message ? e.message : String(e)) + '</div>';
  }
}
