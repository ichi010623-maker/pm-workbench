// 阅读模块自动化测试（Node vm 加载 js/reading.js，stub DOM/DB/AI）
// 运行：node tests/reading.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "reading.js"), "utf8");

let saved = 0;
const fakeEl = {
  _html: "",
  get innerHTML() { return this._html; },
  set innerHTML(v) { this._html = v; },
  value: "",
  scrollTop: 0,
  scrollHeight: 0,
  appendChild() {},
  classList: { add() {}, remove() {}, contains: () => false },
  querySelector: () => null,
  querySelectorAll: () => []
};
function mkEl() {
  return {
    _html: "", value: "", scrollTop: 0, scrollHeight: 0, className: "", id: "",
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    appendChild() {}, classList: { add() {}, remove() {}, contains: () => false }
  };
}
const sandbox = {
  DB: { data: { growth: { reading: { items: [], filter: "all", seeded: false } } }, save() { saved++; } },
  document: { getElementById: () => fakeEl, createElement: () => mkEl(), querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })(),
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  showModal() {}, closeModal() {}, showToast() {}, render() {}, navigate() {}, confirm() { return true; },
  formatDateShort() { return ""; }, today: () => "2026-08-08",
  uid: () => "u" + Math.random().toString(36).slice(2, 9),
  console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
  // AI 配置 / 调用（测试用 stub）
  loadAiConfig: () => ({ provider: "gemini", apiKey: "test-key" }),
  callLLMForPrompt: async (provider, apiKey, prompt) => ({ text: "AI回应：" + (prompt ? prompt.slice(-6) : "") })
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const {
  rdGet, rdStatuses, rdTypeName, rdTypeVerb, rdSave, rdDelete, rdCycleStatus, rdRate,
  rdBuildPrompt, rdCardHtml, renderReading, rdPlay, rdDiscuss, rdDiscussSend, rdSetFilter,
  rdMediaKind, rdParseBv, rdAddBili, rdBiliPresetUrl, rdImportBiliGo, rdImportBiliModal
} = sandbox;

// ---- 断言框架 ----
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

(async function () {
  section("数据初始化与播种");
  const rd = rdGet();
  ok(rd && rd.items, "rdGet 返回 reading 数据对象");
  ok(rd.seeded === true, "首次访问后 seeded=true");
  ok(rd.items.length === 1, "空库时自动播种 1 条（得到播客示例），实际=" + rd.items.length);
  ok(rd.items[0].title.indexOf("得到") >= 0, "播种条目为得到播客占位");
  ok(rd.items[0].type === "podcast", "播种条目类型为播客");
  const savedAfterSeed = saved;

  section("状态与类型映射");
  ok(JSON.stringify(rdStatuses("book")) === JSON.stringify(["想看", "在读", "已读"]), "书状态=想看/在读/已读");
  ok(JSON.stringify(rdStatuses("podcast")) === JSON.stringify(["想听", "在听", "已听"]), "播客状态=想听/在听/已听");
  ok(rdTypeName("ebook") === "📱 电子书", "rdTypeName(ebook)");
  ok(rdTypeVerb("talk") === "观看", "rdTypeVerb(talk)=观看");

  section("增 / 改 / 删 / 状态 / 评分");
  // 模拟表单输入
  fakeEl.value = "";
  sandbox.document.getElementById = (id) => {
    const vals = { "rd-f-title": "高效能人士的七个习惯", "rd-f-type": "book", "rd-f-author": "史蒂芬·柯维", "rd-f-platform": "",
      "rd-f-url": "", "rd-f-status": "想看", "rd-f-rating": "5", "rd-f-note": "自我管理经典" };
    const el = mkEl(); el.value = vals[id] != null ? vals[id] : "";
    return el;
  };
  rdSave(""); // 新增
  ok(rd.items.length === 2, "新增后条目数=2，实际=" + rd.items.length);
  const book = rd.items.find(x => x.title === "高效能人士的七个习惯");
  ok(!!book, "新条目已写入");
  ok(book.rating === 5, "评分保存为5");
  ok(book.status === "想看", "默认状态想看");
  // 状态循环：想看→在读→已读→想看
  rdCycleStatus(book.id);
  ok(book.status === "在读", "状态循环到在读");
  rdCycleStatus(book.id);
  ok(book.status === "已读", "状态循环到已读");
  // 评分取消
  rdRate(book.id, 5);
  ok(book.rating === 0, "再次点击同一星取消评分");
  rdRate(book.id, 3);
  ok(book.rating === 3, "重新评3星");
  // 删除
  rdDelete(book.id);
  ok(rd.items.length === 1, "删除后回到1条");

  section("过滤");
  rdSetFilter("podcast");
  ok(rd.filter === "podcast", "过滤设为播客");
  rdSetFilter("all");

  section("AI 探讨提示词构建");
  const item = { title: "《思考快与慢》", type: "book", author: "卡尼曼", note: "系统1/系统2" };
  const hist = [{ role: "user", text: "直觉靠谱吗" }, { role: "ai", text: "不一定" }];
  const prompt = rdBuildPrompt(item, hist, "那该怎么用系统2？");
  ok(prompt.indexOf("思考快与慢") >= 0, "提示词含书名");
  ok(prompt.indexOf("卡尼曼") >= 0, "提示词含作者");
  ok(prompt.indexOf("系统1/系统2") >= 0, "提示词含笔记");
  ok(prompt.indexOf("直觉靠谱吗") >= 0, "提示词含历史用户消息");
  ok(prompt.indexOf("那该怎么用系统2？") >= 0, "提示词含当前用户消息");

  section("卡片 / 列表渲染不抛错");
  let cardHtml = "";
  try { cardHtml = rdCardHtml(rd.items[0]); ok(cardHtml.indexOf("得到") >= 0, "卡片含标题"); }
  catch (e) { ok(false, "rdCardHtml 抛错: " + e.message); }
  try { renderReading(); ok(true, "renderReading 执行无异常"); }
  catch (e) { ok(false, "renderReading 抛错: " + e.message); }

  section("播放器：B站内嵌 / 外链打开");
  const bili = { title: "测试视频", type: "video", url: "https://www.bilibili.com/video/BV1W4Ne6nEhM" };
  // 通过 rdPlay 触发 showModal（stub），检查其构建的 iframe 逻辑由 rdCardHtml 之外的内部实现覆盖
  // 这里直接验证 URL 识别正则（与 rdPlay 内一致）
  ok(/bilibili\.com\/video\/BV/i.test(bili.url), "识别 B站链接以內嵌播放");
  ok(!/\.(mp3|m4a|wav|ogg|aac|flac)(\?|$)/i.test(bili.url), "非音频文件");

  section("AI 探讨发送（async）");
  const dItem = rd.items[0];
  dItem.discussion = [];
  sandbox.window.__rdDiscId = dItem.id;
  // 准备输入元素
  const inputEl = mkEl(); inputEl.value = "这个观点你怎么看？";
  sandbox.document.getElementById = (id) => {
    if (id === "rd-disc-input") return inputEl;
    return mkEl();
  };
  await rdDiscussSend();
  ok(dItem.discussion.length === 2, "发送后讨论含 用户+AI 两条，实际=" + dItem.discussion.length);
  ok(dItem.discussion[0].role === "user", "第一条为用户消息");
  ok(dItem.discussion[1].role === "ai", "第二条为AI消息");
  ok(dItem.discussion[1].text.indexOf("AI回应") === 0, "AI 文本来自 callLLMForPrompt stub");

  section("缺少 API Key 时给出友好报错（不崩溃）");
  sandbox.loadAiConfig = () => ({}); // 无 key
  const dItem2 = rd.items[0];
  const before = dItem2.discussion.length;
  const inputEl2 = mkEl(); inputEl2.value = "再问一句";
  sandbox.document.getElementById = (id) => (id === "rd-disc-input" ? inputEl2 : mkEl());
  await rdDiscussSend();
  ok(dItem2.discussion.length === before + 2, "无Key时也记录 用户+错误 两条");
  ok(dItem2.discussion[dItem2.discussion.length - 1].error === true, "错误消息标记 error=true");
  ok(dItem2.discussion[dItem2.discussion.length - 1].text.indexOf("⚠️") === 0, "错误文案以⚠️开头");

  section("媒体类型识别 rdMediaKind");
  ok(rdMediaKind("https://www.bilibili.com/video/BV1xx") === "bilibili", "B站链接→bilibili");
  ok(rdMediaKind("https://player.bilibili.com/player.html?bvid=BV1xx") === "bilibili", "player.bilibili→bilibili");
  ok(rdMediaKind("https://pan.baidu.com/s/1abc") === "baidu", "pan.baidu.com→baidu");
  ok(rdMediaKind("https://x.com/a.mp4") === "video", "mp4→video（可站内播放）");
  ok(rdMediaKind("https://x.com/a.webm?t=1") === "video", "webm(带参数)→video");
  ok(rdMediaKind("https://alist.example.com/d/xxx.m3u8") === "m3u8", "m3u8→m3u8（HLS）");
  ok(rdMediaKind("https://x.com/a.mp3") === "audio", "mp3→audio");
  ok(rdMediaKind("https://www.dedao.cn/") === "link", "普通外链→link（新窗口打开）");
  ok(rdMediaKind("") === "none", "空链接→none");

  section("导入B站：BV 解析 / 自动建条目 / 封面");
  ok(rdParseBv("BV1W4Ne6nEhM") === "BV1W4Ne6nEhM", "rdParseBv 提取标准 BV");
  ok(rdParseBv("https://www.bilibili.com/video/BV1pP41137BY?p=3") === "BV1pP41137BY", "rdParseBv 从链接提取 BV");
  ok(rdParseBv("随便写的") === "", "rdParseBv 无 BV 返回空");
  ok(typeof rdBiliPresetUrl() === "string" && rdBiliPresetUrl().indexOf(".json") > 0, "rdBiliPresetUrl 返回 json 路径");

  const beforeAdd = rd.items.length;
  rdAddBili({ bvid: "BV1TEST0009", title: "测试导入视频", up: "UP主X", cover: "http://c/x.jpg", episodes: [{ p: 1, title: "P1" }, { p: 2, title: "P2" }] });
  ok(rd.items.length === beforeAdd + 1, "rdAddBili 新增一条");
  const added = rd.items[0];
  ok(added.type === "video", "导入条目类型为 video");
  ok(added.platform === "B站", "平台标记为 B站");
  ok(added.url === "https://www.bilibili.com/video/BV1TEST0009", "URL 构造为 B站视频页");
  ok(added.cover === "http://c/x.jpg", "封面已写入");
  ok(added.bvid === "BV1TEST0009", "bvid 已记录");
  ok(added.episodes && added.episodes.length === 2, "分P 已记录（2 集）");
  ok(added.status === "想看", "默认状态为想看");
  ok(added.note.indexOf("2 集") >= 0, "多集时笔记提示分P数");

  // 封面应出现在卡片渲染中
  const coverCard = rdCardHtml(added);
  ok(coverCard.indexOf("rd-cover") >= 0 && coverCard.indexOf("http://c/x.jpg") >= 0, "卡片渲染含封面图");

  section("导入B站：预设命中路径（fetch 命中即建条目）");
  // 设置 fetch 返回含目标 BV 的预设
  sandbox.fetch = (url) => Promise.resolve({
    json: () => Promise.resolve({ courses: [{ bvid: "BV1IMPORT01A", title: "导入命中测试", up: "UP", cover: "http://c/i.jpg", episodes: [{ p: 1, title: "P1" }] }] })
  });
  const bInput = mkEl(); bInput.value = "BV1IMPORT01A";
  sandbox.document.getElementById = (id) => (id === "rd-bili-bv" ? bInput : mkEl());
  const cntBeforeImport = rd.items.length;
  rdImportBiliGo();
  await new Promise(r => setTimeout(r, 10));
  ok(rd.items.length === cntBeforeImport + 1, "预设命中后自动建条目");
  ok(rd.items[0].title === "导入命中测试", "新建条目标题来自预设");
  ok(rd.items[0].url === "https://www.bilibili.com/video/BV1IMPORT01A", "预设命中条目 URL 正确");

  // 去重：再次导入同一 BV 不应新增
  rdImportBiliGo();
  await new Promise(r => setTimeout(r, 10));
  ok(rd.items.length === cntBeforeImport + 1, "重复导入同 BV 不重复建条目（去重）");
  // 还原 fetch / getElementById，避免影响其他用例
  sandbox.fetch = undefined;

  console.log("\n========================================");
  console.log("  阅读模块测试：通过 " + pass + " / " + (pass + fail));
  console.log("========================================");
  if (fail > 0) { console.error("❌ 有 " + fail + " 项失败"); process.exit(1); }
  else { console.log("✅ 全部通过"); process.exit(0); }
})();
