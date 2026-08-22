// 网盘音频同步（OpenList WebDAV）自动化测试 —— 单文件夹模型
// 运行：node tests/audiosync.test.js
// 以「演示模式」验证核心逻辑：扫描 / 记进度 / 缺文件 / 循环列表 / 兜底演示
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "audiosync.js"), "utf8");

const store = {};
const localStorageStub = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

const sandbox = {
  DB: { _saved: 0, data: { growth: { rsync: { currentSetId: null, sets: {} } } }, save() { this._saved++; } },
  document: { getElementById: () => null, createElement: () => ({ innerHTML: "", value: "", classList: { add() {}, remove() {}, contains() { return false; } } }), querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  localStorage: localStorageStub,
  console,
  encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
  escapeHtml: s => (s == null ? "" : String(s))
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { AudioSync } = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

(async function () {
  section("初始化与默认配置");
  AudioSync.init();
  ok(AudioSync.cfg().demo === true, "默认开启演示模式");
  ok(AudioSync.cfg().dirAnime === undefined, "旧三文件夹字段已废弃（cfg 无 dirAnime）");

  section("parseEpisode 集数识别");
  ok(AudioSync.parseEpisode("第3集.mp3") === 3, "第3集");
  ok(AudioSync.parseEpisode("EP03.mp4") === 3, "EP03");
  ok(AudioSync.parseEpisode("S1E05.mkv") === 5, "S1E05");
  ok(AudioSync.parseEpisode("08.mp3") === 8, "08");
  ok(AudioSync.parseEpisode("随便.mp4") === null, "无数字返回 null");
  const m = AudioSync.matchEpisodes(["第1集.mp3", "第2集.mp3", "花絮.mp4"], "file");
  ok(m[1] && m[1].file === "第1集.mp3", "matchEpisodes 映射第1集文件");

  section("演示扫描（单文件夹模型）");
  const st = await AudioSync.scan();
  ok(st.sets.length === 2, "2 套示例内容");
  ok(st.sets[0].episodes.length === 12, "第一套 12 集");
  ok(st.sets[0].episodes.every(e => e.file && e.fileLoc), "每集都有文件（fileLoc=true）");
  const setId = st.sets[0].id;

  section("看一集 → 记进度（不搬文件）");
  let r = await AudioSync.markSeen(setId, 3);
  ok(r.ok === true && r.moved === false, "记进度不搬文件（moved=false）");
  ok(AudioSync.statusOf(setId, 3) === "ok", "第3集状态=ok（文件就地可听）");
  ok(AudioSync.progress().sets[setId].seen[3] === true, "进度记录已看第3集");
  ok(AudioSync.progress().currentSetId === setId, "currentSetId 已设置");
  ok(AudioSync.progress().sets[setId].log[0].action === "seen", "写入记录日志(seen)");

  section("幂等：重复标记");
  let r2 = await AudioSync.markSeen(setId, 3);
  ok(r2.ok === true, "再次标记第3集正常返回");
  ok(AudioSync.progress().sets[setId].seen[3] === true, "仍为已看");
  let r3 = await AudioSync.syncOne(setId, 3);
  ok(r3.ok === true && r3.moved === false, "syncOne 兼容返回（单文件夹不搬移）");

  section("未看集数状态不变");
  ok(AudioSync.statusOf(setId, 5) === "ok", "第5集未看也有文件（ok）");

  section("缺文件场景");
  const set0 = AudioSync.scanState().sets[0];
  const ep7 = set0.episodes.filter(e => e.ep === 7)[0];
  ep7.fileLoc = false;
  ok(AudioSync.statusOf(setId, 7) === "missing", "第7集缺文件 → missing");
  const pl7 = AudioSync.getOutputPlaylist(setId);
  ok(!pl7.some(i => i.ep === 7), "缺文件的集不进播放列表");

  section("一键同步（单文件夹模型=无搬移）");
  const ra = await AudioSync.syncAllWatched();
  ok(ra.moved === 0 && ra.missing.length === 0, "syncAllWatched 返回空（无搬移）");

  section("循环播放列表（就地播放全部文件）");
  const pl = AudioSync.getOutputPlaylist(setId);
  ok(pl.length === set0.episodes.length - 1, "播放列表=全部有文件集（缺文件第7集除外）");
  let asc = true; for (let i = 1; i < pl.length; i++) if (pl[i].ep < pl[i - 1].ep) asc = false;
  ok(asc, "播放列表按集数升序");
  ok(pl[0].url === null, "演示模式 url=null（连网盘才拉取）");
  ok(pl[0].file === "第1集.mp3", "播放项带文件名");

  section("兜底：未配置真网盘时仍走演示");
  AudioSync.cfg().demo = false;
  AudioSync.cfg().webdavUrl = "";
  const st2 = await AudioSync.scan();
  ok(st2.demo === true, "demo=false 且无 WebDAV 配置时仍兜底演示");
})()
  .then(() => { console.log("\n==== 结果 pass=" + pass + " fail=" + fail + " ===="); process.exit(fail ? 1 : 0); })
  .catch(e => { console.error("测试运行异常：", e); process.exit(1); });
