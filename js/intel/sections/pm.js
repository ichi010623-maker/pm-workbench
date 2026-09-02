// ============================================================
// 行业情报 · sections/pm.js（Sprint 4 · 💼 PM Insight AI 解读）
// 对当日高优先资讯做「产品经理视角」的 AI 解读：
//   1) 宏观信号 —— 今日最重要的 1-3 个趋势
//   2) 对硬件 PM 的影响 —— 每个信号如何影响产品决策
//   3) 行动建议 —— 今天值得做的 2-3 件事
// 生成方式：手动点「✨ 生成 PM 解读」（复用自定义情报的模型/Key UI）。
// 结果按日缓存 DB.data.industryPMInsight[{date, ...}]；今日无缓存显示空态。
// 契约：sections/contract.md
// 依赖：llm.client（callLLMForPrompt）、providers（INTEL_PROVIDERS）、core（loadAiConfig/saveAiConfig）
// ============================================================
(function (root) {
  "use strict";

  var SECTION_ID = "pm";
  var SECTION_LABEL = "💼 PM Insight";

  function esc(s) {
    return (typeof root.escapeHtml === "function") ? root.escapeHtml(s) : (s == null ? "" : String(s));
  }
  function todayStr() {
    return (typeof root.today === "function") ? root.today() : new Date().toISOString().slice(0, 10);
  }
  function dayStr(dateLike) { return String(dateLike || "").slice(0, 10); }

  // 读取当日缓存（本地 DB 优先，其次云端预热文件 data/pm_insight.json）
  function pmCacheToday() {
    if (typeof root.DB !== "undefined" && root.DB.data) {
      var list = root.DB.data.industryPMInsight || [];
      for (var i = 0; i < list.length; i++) {
        if (dayStr(list[i].date) === todayStr()) return list[i];
      }
    }
    // 云端预热（daily 链路可写 data/pm_insight.json，本端只读；缺文件返回 null）
    var cloud = null;
    try {
      cloud = (typeof root.intelState !== "undefined" && root.intelState.pmInsight) ? root.intelState.pmInsight : null;
      if (cloud && dayStr(cloud.date) === todayStr()) return cloud;
    } catch (e) { cloud = null; }
    return null;
  }

  // 模型/Key 配置 UI（与 renderIntelCustom 一致，复用 hw_pm_ai_config）
  function aiSetupHtml(btnId, btnLabel) {
    var cfg = (typeof root.loadAiConfig === "function") ? root.loadAiConfig() : {};
    var defProv = cfg.provider || "gemini";
    var provOpts = [];
    if (typeof root.INTEL_PROVIDERS === "object") {
      provOpts = Object.keys(root.INTEL_PROVIDERS).map(function (k) {
        var p = root.INTEL_PROVIDERS[k];
        var sel = (defProv === k) ? " selected" : "";
        return '<option value="' + k + '"' + sel + '>' + esc(p.name) + '</option>';
      });
    }
    var keyVal = cfg.key ? cfg.key : "";
    return '<div class="intel-row" style="margin:8px 0"><select id="pm-prov" class="intel-prov" style="flex:1">' + provOpts.join("") + '</select>' +
      '<input id="pm-key" class="intel-key" type="password" placeholder="API Key（仅存本机）" value="' + esc(keyVal) + '" style="flex:1.5"></div>' +
      '<label class="intel-ws"><input type="checkbox" id="pm-ws"' + ((cfg.webSearch !== false) ? " checked" : "") + '> 🌐 联网检索（智谱搜索约 ¥0.01/次）</label>' +
      '<button id="' + btnId + '" class="btn btn-primary" style="width:100%;justify-content:center;gap:6px" onclick="pmGenerateInsight()">' + btnLabel + '</button>' +
      '<div id="pm-gen-err" class="intel-gen-err" style="display:none;margin-top:8px"></div>' +
      '<div class="intel-help" style="margin-top:6px">默认 <b>Gemini（免费 Key · 大陆需 VPN）</b>；无 VPN 用 <b>智谱 GLM / 硅基流动</b>（国内免费）。Key 仅存本机。</div>';
  }

  // 渲染 section
  function renderPM(state) {
    var today = todayStr();
    // 首次进入：若本地无缓存，尝试拉取云端预热文件（幂等：一天一次）
    tryLoadCloudOnce();
    var cached = pmCacheToday();
    var out = '<div class="enm-hint" style="margin-bottom:6px">💼 PM Insight · 以产品经理视角解读今日情报 · 生成于 <b>' + esc(today) + '</b></div>';

    if (cached && (cached.summary || (cached.signals && cached.signals.length))) {
      // —— 展示解读 ——
      var blk = function (icon, title, body) {
        return '<div class="card" style="margin-top:8px"><div class="card-header"><div class="card-title">' + icon + ' ' + title + '</div></div><div class="card-body">' + body + '</div></div>';
      };
      var lines = function (arr) {
        return (arr || []).map(function (x) { return '<div style="padding:3px 0">• ' + esc(x) + '</div>'; }).join("");
      };
      var meta = '<div class="text-sm text-secondary" style="margin-bottom:8px">解读 ' + (cached.n || 0) + ' 条高优先资讯 · 模型 ' + esc(cached.provider || "") +
        ' · <span style="cursor:pointer;color:var(--accent-blue)" onclick="pmRevealConfig()">⚙️ 换模型重新生成</span></div>';
      out += '<div class="card"><div class="card-header"><div class="card-title">✨ ' + esc(cached.title || ("PM 视角 · " + today)) + '</div></div><div class="card-body">' + meta +
        (cached.summary ? '<div class="enm-hint" style="background:rgba(61,127,214,0.08);padding:8px 10px;border-radius:8px">' + esc(cached.summary) + '</div>' : '') + '</div></div>';
      if (cached.signals && cached.signals.length) out += blk("📡", "宏观信号", lines(cached.signals));
      if (cached.impacts && cached.impacts.length) out += blk("🎯", "对硬件 PM 的影响", lines(cached.impacts));
      if (cached.actions && cached.actions.length) out += blk("⚡", "今日行动建议", lines(cached.actions));
      // 参考条目
      if (cached.refTitles && cached.refTitles.length) {
        out += '<div class="card" style="margin-top:8px"><div class="card-header"><div class="card-title">📎 解读依据（今日高优先资讯）</div></div><div class="card-body">' +
          cached.refTitles.map(function (t) { return '<div style="padding:2px 0;font-size:13px">• ' + esc(t) + '</div>'; }).join("") + '</div></div>';
      }
      out += '<div class="intel-custom-actions"><button class="intel-export-btn" onclick="pmRevealConfig()">🔄 重新生成</button></div>';
      return out;
    }

    // —— 无缓存：提供生成入口 ——
    var hasNews = (typeof root.LiveData !== "undefined" && root.LiveData.news && root.LiveData.news.items && root.LiveData.news.items.length);
    out += '<div class="card"><div class="card-header"><div class="card-title">✨ AI 解读今日情报</div></div><div class="card-body">' +
      '<div class="text-sm text-secondary" style="margin-bottom:8px">' +
        (hasNews ? '将读取今日 ' + root.LiveData.news.items.length + ' 条资讯中优先度最高的 10 条，生成：宏观信号 / 对 PM 的影响 / 今日行动建议。' : '今日资讯尚未生成，请等待每日 07:00 自动抓取后再生成。') +
      '</div>' + aiSetupHtml("pm-gen-btn", "✨ 生成 PM 解读") + '</div></div>';
    return out;
  }

  // 点击「⚙️ 换模型」展开配置（在无缓存时配置区本来就在；有缓存时用 modal 内嵌？——直接切回空态形式）
  function pmRevealConfig() {
    // 复用：清掉今日缓存后重渲染即回到「生成入口」，配置已保留
    removePmToday();
    if (typeof root.render === "function") root.render();
  }
  function removePmToday() {
    if (typeof root.DB === "undefined" || !root.DB.data) return;
    var list = root.DB.data.industryPMInsight || [];
    root.DB.data.industryPMInsight = list.filter(function (x) { return dayStr(x.date) !== todayStr(); });
    if (typeof root.DB.save === "function") root.DB.save();
  }

  // —— AI 调用：从当日 Top 10 生成结构化解读 ——
  async function pmGenerateInsight() {
    var provEl = (typeof document !== "undefined") ? document.getElementById("pm-prov") : null;
    var keyEl = (typeof document !== "undefined") ? document.getElementById("pm-key") : null;
    var wsEl = (typeof document !== "undefined") ? document.getElementById("pm-ws") : null;
    var btn = (typeof document !== "undefined") ? document.getElementById("pm-gen-btn") : null;
    var errBox = (typeof document !== "undefined") ? document.getElementById("pm-gen-err") : null;
    if (!provEl || !keyEl) return;
    var provider = provEl.value;
    var key = String(keyEl.value || "").trim();
    if (!key) {
      if (typeof root.showToast === "function") root.showToast("请填写 API Key", "warn");
      return;
    }
    if (typeof root.saveAiConfig === "function") root.saveAiConfig({ provider: provider, key: key, webSearch: !(wsEl && !wsEl.checked) });
    if (errBox) errBox.style.display = "none";
    if (btn) { btn.disabled = true; btn.textContent = "✨ 解读中…（约 10-20s）"; }
    try {
      // 取今日高优先 Top10
      var nd = (typeof root.LiveData !== "undefined") ? root.LiveData.news : null;
      if (!nd || !nd.items || !nd.items.length) throw new Error("今日资讯为空，等待 07:00 自动抓取后再试");
      var top = nd.items.slice().sort(function (a, b) { return (b.priority || 5) - (a.priority || 5); }).slice(0, 10);
      var refTitles = top.map(function (n) { return n.title || ""; });
      var corpus = top.map(function (n, i) {
        return (i + 1) + ". [" + (n.category || "") + "] " + (n.title || "") + " — " + ((n.summary || "").slice(0, 120));
      }).join("\n");
      var prompt = "你是资深硬件产品经理的行业情报助手。下面是今日最重要的 10 条行业资讯（编号列表）。\n\n" +
        corpus + "\n\n" +
        "请以产品经理视角输出三部分 JSON：\n" +
        "{\"title\":\"一句话概括今日信号主题(≤20字)\",\"summary\":\"用 2-3 句话概括今天最重要的趋势(≤80字)\",\"signals\":[\"2-4 条宏观信号，每条≤45字\"],\"impacts\":[\"2-4 条对硬件产品/PM 的直接影响，每条≤55字\"],\"actions\":[\"2-3 条今天可做的具体行动，每条≤50字\"]}\n" +
        "只输出 JSON，不要 markdown 代码块，不要多余解释。";
      var cfg2 = (typeof root.loadAiConfig === "function") ? root.loadAiConfig() : {};
      var ws = (wsEl ? wsEl.checked : cfg2.webSearch !== false);
      var out = await root.callLLMForPrompt(provider, key, prompt);
      // 尝试解析 JSON
      var txt = String(out.text || "").trim();
      var jsonStart = txt.indexOf("{"); var jsonEnd = txt.lastIndexOf("}");
      var parsed = { title: "", summary: "", signals: [], impacts: [], actions: [] };
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
          var j = JSON.parse(txt.slice(jsonStart, jsonEnd + 1));
          parsed.title = j.title || ""; parsed.summary = j.summary || "";
          parsed.signals = (j.signals || []).map(String);
          parsed.impacts = (j.impacts || []).map(String);
          parsed.actions = (j.actions || []).map(String);
        } catch (e) {
          // 解析失败：全文当 summary
          parsed.summary = txt.slice(0, 300);
        }
      } else {
        parsed.summary = txt.slice(0, 300);
      }
      var rec = {
        date: todayStr(), provider: provider, n: top.length,
        title: parsed.title || ("PM 视角 · " + todayStr()),
        summary: parsed.summary, signals: parsed.signals,
        impacts: parsed.impacts, actions: parsed.actions,
        refTitles: refTitles, createdAt: new Date().toISOString()
      };
      if (typeof root.DB !== "undefined") {
        if (!root.DB.data) root.DB.data = {};
        root.DB.data.industryPMInsight = root.DB.data.industryPMInsight || [];
        root.DB.data.industryPMInsight.unshift(rec);
        if (typeof root.DB.save === "function") root.DB.save();
        if (typeof root.DB.logActivity === "function") root.DB.logActivity("industry", "PM Insight 生成");
      }
      if (typeof root.showToast === "function") root.showToast("PM 解读已生成", "success");
      if (typeof root.render === "function") root.render();
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      if (errBox) { errBox.style.display = "block"; errBox.textContent = "❌ 生成失败：" + msg; }
      if (typeof root.showToast === "function") root.showToast("生成失败", "error");
      if (btn) { btn.disabled = false; btn.textContent = "✨ 生成 PM 解读"; }
    }
  }

  // 拉取云端预热文件（一次/天；无文件静默忽略）
  var _cloudLoadedDate = "";
  function tryLoadCloudOnce() {
    if (_cloudLoadedDate === todayStr()) return;
    _cloudLoadedDate = todayStr();
    var ver = (typeof root.APP_VERSION !== "undefined") ? root.APP_VERSION : "";
    try {
      root.fetch("data/pm_insight.json?v=" + ver + "&_=" + Date.now())
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) return;
          if (dayStr(j.date) !== todayStr()) return;
          if (typeof root.intelState !== "undefined") root.intelState.pmInsight = j;
          if (typeof root.render === "function") root.render();
        })
        .catch(function () {});
    } catch (e) {}
  }

  function registerIntelSection(registry) {
    registry[SECTION_ID] = {
      id: SECTION_ID,
      label: SECTION_LABEL,
      nav: true,
      init: null,
      render: renderPM,
      requires: ["liveData.news", "llm.client"]
    };
    return true;
  }

  root.registerIntelSection_pm = registerIntelSection;
  root.pmGenerateInsight = pmGenerateInsight;
  root.pmRevealConfig = pmRevealConfig;
  root.pmCacheToday = pmCacheToday;

})(typeof globalThis !== "undefined" ? globalThis : this);
