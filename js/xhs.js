// ===== 小红书爆款笔记查询（爆款视频模块子视图）=====
// 复用 intel.js 的免费大模型层：INTEL_PROVIDERS.gemini（google_search grounding，真实联网检索+引用）
// 与共享 AI Key（loadAiConfig / saveAiConfig，localStorage: hw_pm_ai_config）。
// 数据层：示例数据（默认，零配置可用）+ REDFOX（红狐hub，新用户有免费试用额度，X-API-KEY 鉴权）。
// 注意：本文件在 intel.js 之后、app.js 之前加载，运行时再调用 app.js 的全局函数（uid/today/DB/render 等）。

if (!window.__xhsNotes) window.__xhsNotes = {};   // id -> note，供 onclick 处理器取用
if (!window.__xhsLast) window.__xhsLast = null;    // 最近一次检索结果包，供「查看全部」复用
if (!window.__xhsPending) window.__xhsPending = null; // 泛化词门控：等待用户选择「拓展/不拓展」
if (!window.__xhsShowAll) window.__xhsShowAll = false;

var XHS_HOT_TRACKS = ["穿搭", "美食", "彩妆", "影视", "职场", "萌宠", "家居", "旅行", "交通", "兴趣", "科技", "互联网", "医疗保健", "星座情感", "婚庆婚礼", "拍摄", "教育", "亲子育儿", "个人护理", "潮流鞋包", "生活", "科学探索", "新闻资讯", "运动"];

function ensureXhs() {
  if (!DB.data.growth) DB.data.growth = {};
  if (!DB.data.growth.xhs) DB.data.growth.xhs = {};
  if (!Array.isArray(DB.data.growth.xhs.history)) DB.data.growth.xhs.history = [];
  if (!Array.isArray(DB.data.growth.xhs.subscriptions)) DB.data.growth.xhs.subscriptions = [];
  if (!Array.isArray(DB.data.growth.xhs.reports)) DB.data.growth.xhs.reports = [];
  if (typeof DB.data.growth.xhs.redfoxKey !== "string") DB.data.growth.xhs.redfoxKey = "";
}

function loadXhsConfig() {
  ensureXhs();
  return { source: DB.data.growth.xhs.source || "demo", redfoxKey: DB.data.growth.xhs.redfoxKey || "" };
}
function saveXhsConfig(cfg) {
  ensureXhs();
  if (cfg.source) DB.data.growth.xhs.source = cfg.source;
  if (typeof cfg.redfoxKey === "string") DB.data.growth.xhs.redfoxKey = cfg.redfoxKey;
  try { DB.save(); } catch (e) {}
}

// ---------- 示例数据集（清晰标注：非真实抓取，用于演示完整流程）----------
function xhsDemoNotes() {
  var base = today();
  function d(off) { return addDays(base, -off); }
  return [
    { id: "d01", title: "减脂期也能吃的10分钟低卡晚餐｜打工人友好", author: "轻食研究所", authorUrl: "https://www.xiaohongshu.com/user/profile/d01", url: "https://www.xiaohongshu.com/explore/d01", cover: "", publishTime: d(2), likes: 42000, comments: 3200, saves: 18000, topics: ["减脂餐", "减脂", "低卡", "健身餐", "打工人"] },
    { id: "d02", title: "学生党一周减脂便当｜均价8元搞定三餐", author: "食堂侦察兵", authorUrl: "https://www.xiaohongshu.com/user/profile/d02", url: "https://www.xiaohongshu.com/explore/d02", cover: "", publishTime: d(5), likes: 31000, comments: 2100, saves: 26000, topics: ["减脂餐", "减脂", "学生党", "便当"] },
    { id: "d03", title: "早餐减脂吃什么？5分钟高蛋白食谱合集", author: "晨型人厨房", authorUrl: "https://www.xiaohongshu.com/user/profile/d03", url: "https://www.xiaohongshu.com/explore/d03", cover: "", publishTime: d(9), likes: 22000, comments: 1500, saves: 14000, topics: ["减脂餐", "减脂", "早餐", "低卡"] },
    { id: "d04", title: "小个子穿搭显高10cm｜155女生秋冬叠穿公式", author: "栗子穿搭", authorUrl: "https://www.xiaohongshu.com/user/profile/d04", url: "https://www.xiaohongshu.com/explore/d04", cover: "", publishTime: d(3), likes: 56000, comments: 4100, saves: 33000, topics: ["穿搭", "小个子", "显高", "秋冬"] },
    { id: "d05", title: "法式穿搭｜慵懒高级感通勤look", author: "Parisienne", authorUrl: "https://www.xiaohongshu.com/user/profile/d05", url: "https://www.xiaohongshu.com/explore/d05", cover: "", publishTime: d(6), likes: 38000, comments: 2600, saves: 21000, topics: ["穿搭", "法式", "通勤", "高级感"] },
    { id: "d06", title: "职场穿搭不踩雷｜3套搞定一周会议穿搭", author: "职场进化论", authorUrl: "https://www.xiaohongshu.com/user/profile/d06", url: "https://www.xiaohongshu.com/explore/d06", cover: "", publishTime: d(11), likes: 27000, comments: 1800, saves: 16000, topics: ["穿搭", "职场", "通勤"] },
    { id: "d07", title: "早C晚A护肤步骤｜新手不烂脸指南", author: "成分党阿may", authorUrl: "https://www.xiaohongshu.com/user/profile/d07", url: "https://www.xiaohongshu.com/explore/d07", cover: "", publishTime: d(4), likes: 49000, comments: 5200, saves: 29000, topics: ["美妆", "护肤", "早C晚A"] },
    { id: "d08", title: "新手化妆教程｜10分钟伪素颜通勤妆", author: "化妆师Cici", authorUrl: "https://www.xiaohongshu.com/user/profile/d08", url: "https://www.xiaohongshu.com/explore/d08", cover: "", publishTime: d(8), likes: 33000, comments: 2300, saves: 19000, topics: ["美妆", "化妆", "通勤", "新手"] },
    { id: "d09", title: "宝宝辅食一周不重样｜6-12月龄食谱", author: "母婴小食堂", authorUrl: "https://www.xiaohongshu.com/user/profile/d09", url: "https://www.xiaohongshu.com/explore/d09", cover: "", publishTime: d(7), likes: 41000, comments: 3600, saves: 24000, topics: ["母婴", "宝宝", "辅食", "育儿"] },
    { id: "d10", title: "租房改造｜300元搞定出租屋氛围感", author: "出租屋魔法师", authorUrl: "https://www.xiaohongshu.com/user/profile/d10", url: "https://www.xiaohongshu.com/explore/d10", cover: "", publishTime: d(10), likes: 47000, comments: 3900, saves: 31000, topics: ["家居", "租房", "改造", "氛围感"] },
    { id: "d11", title: "小户型收纳神器｜桌面一眼清爽", author: "收纳控本控", authorUrl: "https://www.xiaohongshu.com/user/profile/d11", url: "https://www.xiaohongshu.com/explore/d11", cover: "", publishTime: d(13), likes: 29000, comments: 2100, saves: 22000, topics: ["家居", "收纳", "小户型"] },
    { id: "d12", title: "折叠屏手机值不值得买｜半年真实体验", author: "数码老饕", authorUrl: "https://www.xiaohongshu.com/user/profile/d12", url: "https://www.xiaohongshu.com/explore/d12", cover: "", publishTime: d(2), likes: 52000, comments: 6100, saves: 27000, topics: ["数码", "折叠屏", "手机", "3c"] },
    { id: "d13", title: "便携充电宝怎么选｜37Wh能上飞机吗", author: "充电研究所", authorUrl: "https://www.xiaohongshu.com/user/profile/d13", url: "https://www.xiaohongshu.com/explore/d13", cover: "", publishTime: d(5), likes: 36000, comments: 2800, saves: 20000, topics: ["数码", "充电宝", "充电", "续航", "3c"] },
    { id: "d14", title: "直播补光灯怎么选｜桌面打光三档实测", author: "打光师阿杰", authorUrl: "https://www.xiaohongshu.com/user/profile/d14", url: "https://www.xiaohongshu.com/explore/d14", cover: "", publishTime: d(6), likes: 34000, comments: 2400, saves: 23000, topics: ["摄影", "补光灯", "打光", "直播", "拍照"] },
    { id: "d15", title: "自拍镜支架测评｜补光+蓝牙快门一体", author: "美拍少女", authorUrl: "https://www.xiaohongshu.com/user/profile/d15", url: "https://www.xiaohongshu.com/explore/d15", cover: "", publishTime: d(9), likes: 30000, comments: 1900, saves: 25000, topics: ["自拍镜", "美拍", "补光镜", "直播"] },
    { id: "d16", title: "周末露营装备清单｜轻量化不踩坑", author: "山系青年", authorUrl: "https://www.xiaohongshu.com/user/profile/d16", url: "https://www.xiaohongshu.com/explore/d16", cover: "", publishTime: d(12), likes: 39000, comments: 3000, saves: 28000, topics: ["旅行", "露营", "户外"] },
    { id: "d17", title: "一个人旅行vlog怎么拍｜手机运镜教学", author: "旅拍日记", authorUrl: "https://www.xiaohongshu.com/user/profile/d17", url: "https://www.xiaohongshu.com/explore/d17", cover: "", publishTime: d(14), likes: 28000, comments: 1700, saves: 15000, topics: ["旅行", "vlog", "摄影", "拍照"] },
    { id: "d18", title: "打工人副业｜下班后3小时能做的5件事", author: "搞钱研究所", authorUrl: "https://www.xiaohongshu.com/user/profile/d18", url: "https://www.xiaohongshu.com/explore/d18", cover: "", publishTime: d(3), likes: 61000, comments: 7200, saves: 35000, topics: ["职场", "副业", "打工人", "搞钱"] },
    { id: "d19", title: "小红书起号30天｜从0到1万粉复盘", author: "起号教练Lina", authorUrl: "https://www.xiaohongshu.com/user/profile/d19", url: "https://www.xiaohongshu.com/explore/d19", cover: "", publishTime: d(7), likes: 53000, comments: 4900, saves: 41000, topics: ["小红书", "起号", "爆款", "笔记", "运营"] },
    { id: "d20", title: "爆款笔记标题公式｜收藏这20个模板", author: "内容工厂", authorUrl: "https://www.xiaohongshu.com/user/profile/d20", url: "https://www.xiaohongshu.com/explore/d20", cover: "", publishTime: d(8), likes: 44000, comments: 3300, saves: 38000, topics: ["小红书", "爆款", "标题", "笔记", "运营"] },
    { id: "d21", title: "懒人减脂餐｜电饭煲一锅出三日食谱", author: "懒人食堂", authorUrl: "https://www.xiaohongshu.com/user/profile/d21", url: "https://www.xiaohongshu.com/explore/d21", cover: "", publishTime: d(15), likes: 25000, comments: 1600, saves: 17000, topics: ["减脂餐", "减脂", "懒人", "低卡"] },
    { id: "d22", title: "通勤穿搭｜极简胶囊衣橱怎么搭", author: "极简生活家", authorUrl: "https://www.xiaohongshu.com/user/profile/d22", url: "https://www.xiaohongshu.com/explore/d22", cover: "", publishTime: d(16), likes: 26000, comments: 1500, saves: 18000, topics: ["穿搭", "通勤", "极简", "胶囊衣橱"] },
    { id: "d23", title: "油皮护肤｜夏季不脱妆底妆思路", author: "油皮救星", authorUrl: "https://www.xiaohongshu.com/user/profile/d23", url: "https://www.xiaohongshu.com/explore/d23", cover: "", publishTime: d(17), likes: 31000, comments: 2200, saves: 20000, topics: ["美妆", "护肤", "油皮", "底妆"] },
    { id: "d24", title: "母婴好物｜新生儿必备清单避坑", author: "新手妈妈日记", authorUrl: "https://www.xiaohongshu.com/user/profile/d24", url: "https://www.xiaohongshu.com/explore/d24", cover: "", publishTime: d(18), likes: 37000, comments: 2900, saves: 30000, topics: ["母婴", "宝宝", "好物", "育儿"] },
    { id: "d25", title: "桌面美拍站开箱｜补光+镜面一体太香了", author: "桌搭玩家", authorUrl: "https://www.xiaohongshu.com/user/profile/d25", url: "https://www.xiaohongshu.com/explore/d25", cover: "", publishTime: d(4), likes: 23000, comments: 1400, saves: 19000, topics: ["美拍", "自拍镜", "补光镜", "桌搭"] },
    { id: "d26", title: "手机摄影｜人像模式怎么拍出氛围感", author: "手机摄影师", authorUrl: "https://www.xiaohongshu.com/user/profile/d26", url: "https://www.xiaohongshu.com/explore/d26", cover: "", publishTime: d(19), likes: 20000, comments: 1200, saves: 13000, topics: ["摄影", "拍照", "人像", "手机"] },
    { id: "d27", title: "数码好物｜桌面无线充电收纳二合一", author: "桌搭研究所", authorUrl: "https://www.xiaohongshu.com/user/profile/d27", url: "https://www.xiaohongshu.com/explore/d27", cover: "", publishTime: d(20), likes: 18000, comments: 1000, saves: 12000, topics: ["数码", "充电", "无线充电", "桌搭", "3c"] },
    { id: "d28", title: "减脂期外卖怎么点｜便利店低卡搭配", author: "便利店美食家", authorUrl: "https://www.xiaohongshu.com/user/profile/d28", url: "https://www.xiaohongshu.com/explore/d28", cover: "", publishTime: d(21), likes: 21000, comments: 1300, saves: 11000, topics: ["减脂餐", "减脂", "外卖", "低卡"] },
    { id: "d29", title: "家居香薰｜提升幸福感的5个小物", author: "生活美学控", authorUrl: "https://www.xiaohongshu.com/user/profile/d29", url: "https://www.xiaohongshu.com/explore/d29", cover: "", publishTime: d(22), likes: 24000, comments: 1600, saves: 21000, topics: ["家居", "香薰", "氛围感", "好物"] },
    { id: "d30", title: "运动健身｜居家无器械全身燃脂15分钟", author: "居家健身教练", authorUrl: "https://www.xiaohongshu.com/user/profile/d30", url: "https://www.xiaohongshu.com/explore/d30", cover: "", publishTime: d(23), likes: 35000, comments: 2700, saves: 26000, topics: ["运动", "健身", "居家", "燃脂"] },
    { id: "d31", title: "旅拍穿搭｜出片率高的5套度假风", author: "度假风穿搭", authorUrl: "https://www.xiaohongshu.com/user/profile/d31", url: "https://www.xiaohongshu.com/explore/d31", cover: "", publishTime: d(24), likes: 27000, comments: 1800, saves: 20000, topics: ["穿搭", "旅行", "旅拍", "度假"] },
    { id: "d32", title: "职场新人必看｜快速融入团队的5个技巧", author: "职场成长社", authorUrl: "https://www.xiaohongshu.com/user/profile/d32", url: "https://www.xiaohongshu.com/explore/d32", cover: "", publishTime: d(25), likes: 46000, comments: 3800, saves: 30000, topics: ["职场", "新人", "沟通", "打工人"] },
    { id: "d33", title: "亲子育儿｜高质量陪伴的10个游戏", author: "亲子时光", authorUrl: "https://www.xiaohongshu.com/user/profile/d33", url: "https://www.xiaohongshu.com/explore/d33", cover: "", publishTime: d(26), likes: 32000, comments: 2400, saves: 27000, topics: ["亲子育儿", "母婴", "陪伴", "游戏"] },
    { id: "d34", title: "科技数码｜AI硬件值得买的3件小物", author: "AI玩家", authorUrl: "https://www.xiaohongshu.com/user/profile/d34", url: "https://www.xiaohongshu.com/explore/d34", cover: "", publishTime: d(27), likes: 29000, comments: 2100, saves: 22000, topics: ["科技", "数码", "AI", "3c"] },
    { id: "d35", title: "美食教程｜10分钟快手早餐饼", author: "早餐达人", authorUrl: "https://www.xiaohongshu.com/user/profile/d35", url: "https://www.xiaohongshu.com/explore/d35", cover: "", publishTime: d(28), likes: 30000, comments: 2000, saves: 24000, topics: ["美食", "早餐", "快手", "教程"] },
    { id: "d36", title: "个人护理｜敏感肌换季护肤攻略", author: "敏感肌日记", authorUrl: "https://www.xiaohongshu.com/user/profile/d36", url: "https://www.xiaohongshu.com/explore/d36", cover: "", publishTime: d(29), likes: 25000, comments: 1700, saves: 16000, topics: ["个人护理", "护肤", "敏感肌", "美妆"] }
  ];
}

// ---------- 泛化词识别（规则兜底；有 Key 时用免费 Gemini）----------
var XHS_GENERIC_TERMS = ["穿搭", "美食", "美妆", "运动", "旅行", "家居", "母婴", "数码", "科技", "职场", "拍摄", "教育", "亲子育儿", "个人护理", "潮流鞋包", "生活", "科学探索", "新闻资讯", "互联网", "医疗保健", "星座情感", "婚庆婚礼", "萌宠", "兴趣", "交通", "影视", "彩妆"];

function xhsIsGenericRule(kw) {
  kw = (kw || "").trim();
  if (!kw) return false;
  if (XHS_GENERIC_TERMS.indexOf(kw) >= 0) return true;
  // 无修饰词的纯大类词：长度短且无场景/人群/风格/意图修饰
  if (kw.length <= 3 && XHS_GENERIC_TERMS.indexOf(kw) < 0) {
    // 短的也可能是细分词（如「减脂餐」），用修饰词判断
  }
  // 含修饰词视为细分词
  var mods = ["减脂", "早餐", "午餐", "晚餐", "便当", "小个子", "法式", "职场", "通勤", "学生党", "懒人", "居家", "户外", "露营", "母婴", "宝宝", "新手", "油皮", "敏感肌", "折叠", "便携", "无线", "桌面", "出租屋", "胶囊", "极简", "度假", "旅拍", "快手", "高质量", "早C晚A", "副业", "起号", "爆款", "氛围感", "显高", "高级感", "打工人", "新人", "亲子", "AI", "直播", "自拍", "美拍"];
  for (var i = 0; i < mods.length; i++) { if (kw.indexOf(mods[i]) >= 0) return false; }
  // 既在泛化词表也未含修饰 → 泛化
  return XHS_GENERIC_TERMS.indexOf(kw) >= 0;
}

function xhsSubtrackRule(kw) {
  var map = {
    "穿搭": ["小个子穿搭", "法式穿搭", "职场穿搭", "通勤穿搭", "秋冬穿搭", "夏季穿搭", "极简穿搭", "复古穿搭", "梨形穿搭", "微胖穿搭"],
    "美食": ["减脂餐", "快手早餐", "便当", "低卡甜点", "一人食", "囤货攻略", "美食教程", "探店", "减脂外卖", "早餐饼"],
    "美妆": ["护肤", "早C晚A", "新手化妆", "油皮底妆", "敏感肌", "口红试色", "化妆教程", "平价彩妆", "通勤妆", "伪素颜"],
    "运动": ["居家健身", "燃脂", "瑜伽", "跑步", "增肌", "普拉提", "跳绳", "体态矫正", "运动穿搭", "健身餐"],
    "旅行": ["露营", "旅拍", "度假穿搭", "一人旅行", "攻略", "民宿", "citywalk", "出境", "周边游", "旅行vlog"],
    "家居": ["租房改造", "收纳", "小户型", "香薰", "氛围感", "桌搭", "好物", "断舍离", "出租屋", "新家"],
    "母婴": ["宝宝辅食", "育儿", "新生儿清单", "亲子游戏", "孕妈", "绘本", "早教", "哄睡", "好物", "产后恢复"],
    "数码": ["折叠屏", "充电宝", "无线充电", "3C", "AI硬件", "手机摄影", "桌搭", "耳机", "平板", "键盘"],
    "科技": ["AI", "数码", "智能硬件", "测评", "开源", "机器人", "AR", "芯片", "新能源", "SaaS"],
    "职场": ["新人", "副业", "沟通", "通勤", "面试", "汇报", "效率", "搞钱", "转行", "领导力"],
    "拍摄": ["补光灯", "自拍镜", "手机摄影", "vlog", "运镜", "打光", "直播", "美拍", "人像", "旅拍"],
    "亲子育儿": ["亲子游戏", "早教", "绘本", "哄睡", "辅食", "育儿", "新生儿", "幼儿园", "陪玩", "敏感期"],
    "个人护理": ["护肤", "敏感肌", "洗发", "身体乳", "口腔", "防晒", "脱毛", "美甲", "香水", "头发护理"],
    "潮流鞋包": ["球鞋", "通勤包", "小众包", "平价", "穿搭", "ootd", "联名", "复古", "运动鞋", "托特包"]
  };
  return map[kw] || ["趋势词A", "人群词B", "场景词C", "意图词D", "风格词E", "场景词F", "人群词G", "意图词H", "风格词I", "场景词J"];
}

// ---------- 评分 ----------
function xhsEngagement(n) { return (n.likes || 0) + (n.comments || 0) + (n.saves || 0); }
function xhsHeatScore(n) {
  var e = xhsEngagement(n);
  if (e >= 80000) return 3.0;
  if (e >= 40000) return 2.5;
  if (e >= 15000) return 2.0;
  if (e >= 5000) return 1.5;
  return 1.0;
}
function xhsTimeScore(publishTime) {
  var days = Math.round((new Date(today() + "T00:00:00") - new Date(publishTime + "T00:00:00")) / 86400000);
  if (days <= 7) return 2.0;
  if (days <= 15) return 1.5;
  if (days <= 30) return 1.0;
  return 0.5;
}
function xhsRelevance(n, kw) {
  kw = (kw || "").trim();
  if (!kw) return 0;
  var t = n.title || "";
  if (t.indexOf(kw) >= 0) return 9.5;
  var topics = n.topics || [];
  for (var i = 0; i < topics.length; i++) {
    if (topics[i].indexOf(kw) >= 0 || kw.indexOf(topics[i]) >= 0) return 8.5;
  }
  // 同大类泛词
  for (var j = 0; j < XHS_GENERIC_TERMS.length; j++) {
    if ((t.indexOf(XHS_GENERIC_TERMS[j]) >= 0 || (n.topics || []).indexOf(XHS_GENERIC_TERMS[j]) >= 0) && kw === XHS_GENERIC_TERMS[j]) return 6.0;
  }
  return 0;
}
function xhsScoreNotes(notes, kw, rangeDays) {
  return notes.map(function (n) {
    var rel = kw ? xhsRelevance(n, kw) : 0;
    var heat = xhsHeatScore(n);
    var time = kw ? xhsTimeScore(n.publishTime) : 0;
    var total = kw ? (rel + heat + time) : xhsEngagement(n);
    return Object.assign({}, n, { relevance: rel, heat: heat, timeliness: time, totalScore: total, engagement: xhsEngagement(n) });
  });
}

// ---------- 示例数据检索 ----------
function xhsSearchDemo(kw, rangeDays) {
  var all = xhsDemoNotes();
  var isHot = !kw || !kw.trim();
  var notes = xhsScoreNotes(all, isHot ? "" : kw.trim(), rangeDays);
  var articles;
  if (isHot) {
    articles = notes.slice().sort(function (a, b) { return b.engagement - a.engagement; });
  } else {
    articles = notes.filter(function (n) { return n.relevance > 0; });
    articles.sort(function (a, b) { return b.totalScore - a.totalScore; });
  }
  var latest = notes.slice().sort(function (a, b) { return b.engagement - a.engagement; }).slice(0, 10);
  var related = isHot ? XHS_HOT_TRACKS.slice(0, 10) : (kw ? xhsSubtrackRule(kw.trim()) : XHS_HOT_TRACKS.slice(0, 10));
  return {
    isHot: isHot,
    keyword: kw ? kw.trim() : "",
    articles: articles,
    latestHotArticles: latest,
    relatedSearches: related,
    hotTopics: XHS_HOT_TRACKS,
    source: "demo",
    note: "示例数据（非真实抓取），用于演示完整流程；接入 REDFOX 后可获取真实爆款笔记。"
  };
}

// ---------- REDFOX 适配器（红狐hub，新用户免费试用额度）----------
// 接口：POST https://redfox.hk/story/api/xhsData/query  Header: X-API-KEY
// 归一化字段：title / author_name / publish_time / like_count / comment_count / share_count
function xhsMapRedfoxNote(raw, kw) {
  var title = raw.title || raw.note_title || raw.content || "";
  var author = raw.author_name || raw.author || raw.nickname || "";
  var pub = (raw.publish_time || raw.publishTime || raw.time || "").toString().slice(0, 10);
  if (!pub || pub === "Invalid") pub = today();
  var likes = Number(raw.like_count || raw.likes || 0);
  var comments = Number(raw.comment_count || raw.comments || 0);
  var saves = Number(raw.share_count || raw.saves || raw.collect_count || 0);
  var n = {
    id: "rf_" + (raw.id || raw.note_id || Math.random().toString(36).slice(2, 9)),
    title: title, author: author,
    authorUrl: raw.author_url || raw.authorUrl || "",
    url: raw.url || raw.note_url || raw.link || "",
    cover: raw.cover || raw.image || "",
    publishTime: pub,
    likes: likes, comments: comments, saves: saves,
    topics: kw ? [kw] : []
  };
  var scored = xhsScoreNotes([n], kw || "", 30)[0];
  return scored;
}
async function xhsFetchRedfox(keyword, startDate, endDate, apiKey) {
  var url = "https://redfox.hk/story/api/xhsData/query";
  var headers = { "Content-Type": "application/json", "X-API-KEY": apiKey };
  var body = JSON.stringify({ keyword: keyword, startDate: startDate, endDate: endDate, limit: 50 });
  var res = await fetch(url, { method: "POST", headers: headers, body: body });
  if (!res.ok) {
    var detail = "";
    try { var t = await res.text(); if (t) { try { var j = JSON.parse(t); detail = (j.error && (j.error.message || j.error.code)) || t; } catch (e) { detail = t; } } } catch (e) {}
    throw new Error("HTTP " + res.status + (detail ? "：" + String(detail).replace(/[\r\n]+/g, " ").slice(0, 200) : "（REDFOX 需有效 Key；浏览器直连可能受 CORS 限制，可经服务端代理调用）"));
  }
  var d = await res.json();
  var list = (d && d.data) || [];
  if (Array.isArray(d.data) === false && d.data && d.data.articles) list = d.data.articles;
  else if (Array.isArray(d.data) === false && d.data && d.data.list) list = d.data.list;
  list = Array.isArray(list) ? list : [];
  var articles = list.map(function (r) { return xhsMapRedfoxNote(r, keyword); });
  articles.sort(function (a, b) { return b.totalScore - a.totalScore; });
  return {
    isHot: false, keyword: keyword, articles: articles,
    latestHotArticles: articles.slice(0, 10),
    relatedSearches: xhsSubtrackRule(keyword),
    hotTopics: XHS_HOT_TRACKS, source: "redfox", note: ""
  };
}

// ---------- 意图识别（免费 Gemini，无 Key 时规则兜底）----------
async function xhsDetectIntent(kw) {
  kw = (kw || "").trim();
  var cfg = loadAiConfig();
  var apiKey = (cfg && cfg.apiKey) ? cfg.apiKey : "";
  var provider = (cfg && cfg.provider && cfg.provider !== "gemini") ? cfg.provider : "gemini";
  if (apiKey && typeof callLLMForPrompt === "function") {
    try {
      var prompt = "你是小红书内容策略助手。判断用户想搜索的小红书赛道词「" + kw + "」是「泛化大类词」还是「细分方向词」。\n" +
        "规则：含场景/人群/风格/意图修饰（如减脂、小个子、法式、职场、新手、便携）为细分词；纯大类（穿搭/美食/美妆/运动/旅行/家居/母婴/数码/科技/职场）为泛化词。\n" +
        "返回严格 JSON：{\"isGeneric\":布尔, \"term\":\"原词\", \"subTracks\":[10个相关的细分方向词，覆盖场景/人群/风格/意图]}\n" +
        "只返回 JSON，不要解释。";
      var r = await callLLMForPrompt(provider, apiKey, prompt);
      var parsed = parseIntelLLM(r.text);
      if (parsed && typeof parsed.isGeneric === "boolean") {
        return { isGeneric: parsed.isGeneric, term: kw, subTracks: Array.isArray(parsed.subTracks) ? parsed.subTracks.slice(0, 10) : xhsSubtrackRule(kw), byLLM: true };
      }
    } catch (e) { /* 落到规则兜底 */ }
  }
  return { isGeneric: xhsIsGenericRule(kw), term: kw, subTracks: xhsSubtrackRule(kw), byLLM: false };
}

async function xhsRecommendSubtracks(kw) {
  var cfg = loadAiConfig();
  var apiKey = (cfg && cfg.apiKey) ? cfg.apiKey : "";
  var provider = (cfg && cfg.provider && cfg.provider !== "gemini") ? cfg.provider : "gemini";
  if (apiKey && typeof callLLMForPrompt === "function") {
    try {
      var prompt = "你是小红书选题专家。基于赛道词「" + kw + "」，生成10个值得深入挖掘的细分方向词，覆盖场景词、人群词、风格词、意图词各2-3个，词大小适中（避免过细查不到、过泛范围太大）。\n" +
        "返回严格 JSON：{\"subTracks\":[10个词]}\n只返回 JSON。";
      var r = await callLLMForPrompt(provider, apiKey, prompt);
      var parsed = parseIntelLLM(r.text);
      if (parsed && Array.isArray(parsed.subTracks) && parsed.subTracks.length) return parsed.subTracks.slice(0, 10);
    } catch (e) {}
  }
  return xhsSubtrackRule(kw);
}

// ---------- 时间范围 ----------
function xhsRangeDays(range) {
  range = range || "7";
  if (range === "1") return 1;
  if (range === "3") return 3;
  if (range === "30") return 30;
  return 7;
}
function xhsRangeLabel(range) {
  range = range || "7";
  if (range === "1") return "近1天";
  if (range === "3") return "近3天";
  if (range === "30") return "近30天";
  return "近7天";
}

// ---------- 主流程 ----------
async function xhsRunSearch(forcedKeyword) {
  ensureXhs();
  var kw = (forcedKeyword != null ? forcedKeyword : (document.getElementById("xhs-keyword") ? document.getElementById("xhs-keyword").value : "")) || "";
  kw = kw.trim();
  var range = document.getElementById("xhs-range") ? document.getElementById("xhs-range").value : "7";
  var cfg = loadXhsConfig();
  var source = document.getElementById("xhs-source") ? document.getElementById("xhs-source").value : cfg.source;
  var redfoxKey = (source === "redfox") ? (document.getElementById("xhs-redfox-key") ? document.getElementById("xhs-redfox-key").value : cfg.redfoxKey) : "";
  saveXhsConfig({ source: source, redfoxKey: redfoxKey });
  var start = addDays(today(), -xhsRangeDays(range));
  var end = today();

  var errBox = document.getElementById("xhs-err");
  if (errBox) { errBox.innerHTML = ""; errBox.classList.add("hidden"); }
  var loading = document.getElementById("xhs-loading");
  if (loading) loading.classList.remove("hidden");

  // 同步本视图选择的模型 / Key / 联网开关到共享 AI 配置（供意图识别、赛道拓展调用）
  var provEl = document.getElementById("xhs-prov");
  var keyEl = document.getElementById("xhs-key");
  var wsEl = document.getElementById("xhs-ws");
  if (provEl && keyEl && typeof saveAiConfig === "function") {
    var acfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
    acfg.provider = provEl.value;
    acfg.key = (keyEl.value || "").trim();
    acfg.webSearch = wsEl ? wsEl.checked : true;
    saveAiConfig(acfg);
  }

  try {
    // 泛化词门控：有关键词且被识别为泛化词 → 等待用户选择「拓展/不拓展」
    if (kw) {
      var intent = await xhsDetectIntent(kw);
      if (intent.isGeneric) {
        window.__xhsPending = { kw: kw, range: range, source: source, redfoxKey: redfoxKey };
        if (loading) loading.classList.add("hidden");
        xhsShowGeneric(kw, intent.subTracks);
        return;
      }
    }
    var payload = await xhsExecute(kw, range, source, redfoxKey, start, end);
    // 数据不足自动扩展时间（仅 REDFOX；示例数据本身覆盖30天）
    if (source === "redfox" && payload.articles.length === 0 && xhsRangeDays(range) < 30) {
      payload = await xhsExecute(kw, "30", source, redfoxKey, addDays(today(), -30), end);
      payload.expanded = true;
    }
    window.__xhsShowAll = false;
    window.__xhsLast = { payload: payload, kw: kw, rangeLabel: xhsRangeLabel(range) + (payload.expanded ? "（已自动扩展至近30天）" : "") };
    xhsPushHistory(kw, source);
    xhsRenderResults();
    // 持久化本次检索结果到「我的产出」（示例/REDFOX 数据均留存，可收藏与删除）
    xhsSaveReportRecord(window.__xhsLast.kw, window.__xhsLast.rangeLabel, payload, source);
  } catch (e) {
    if (loading) loading.classList.add("hidden");
    if (errBox) { errBox.innerHTML = "⚠️ " + (e && e.message ? e.message : String(e)); errBox.classList.remove("hidden"); }
  }
}

async function xhsExecute(kw, range, source, redfoxKey, start, end) {
  if (source === "redfox" && redfoxKey) {
    try { return await xhsFetchRedfox(kw, start, end, redfoxKey); }
    catch (e) {
      // REDFOX 失败（Key/CORS/额度）→ 回退示例数据并提示
      var demo = xhsSearchDemo(kw, xhsRangeDays(range));
      demo.note = "REDFOX 调用失败（" + (e.message || e) + "），已回退示例数据。请在「数据源」填写有效 Key 或经服务端代理调用。";
      return demo;
    }
  }
  return xhsSearchDemo(kw, xhsRangeDays(range));
}

function xhsPushHistory(kw, source) {
  ensureXhs();
  DB.data.growth.xhs.history.unshift({ kw: kw, source: source, at: new Date().toISOString() });
  if (DB.data.growth.xhs.history.length > 30) DB.data.growth.xhs.history = DB.data.growth.xhs.history.slice(0, 30);
  try { DB.save(); } catch (e) {}
}

// 泛化词门控面板（等待用户选择）
function xhsShowGeneric(kw, subTracks) {
  var c = document.getElementById("app-content");
  if (!c) return;
  var subHtml = (subTracks || []).map(function (s, i) {
    return '<span class="xhs-subtrack" onclick="xhsQuickSearch(\'' + s.replace(/'/g, "\\'") + '\')">' + escapeHtml(s) + "</span>";
  }).join("");
  var html =
    '<div class="xhs-generic">' +
      '<div class="xhs-generic-title">🔍 我识别到「' + escapeHtml(kw) + '」是较大的分类，已为您推荐以下细分方向：</div>' +
      '<div class="xhs-subtrack-row">' + subHtml + '</div>' +
      '<div class="xhs-generic-actions">' +
        '<button class="btn btn-primary" onclick="xhsExpandSearch(true)">🚀 拓展（同时搜索这 ' + (subTracks ? subTracks.length : 10) + ' 个词）</button>' +
        '<button class="btn btn-secondary" onclick="xhsExpandSearch(false)">➡️ 不拓展（只搜索「' + escapeHtml(kw) + '」）</button>' +
      '</div>' +
      '<div class="xhs-hint">提示：点击上方任一细分词可直接查询该赛道。</div>' +
    '</div>';
  // 仅渲染门控面板，不展示结果（强制等待）
  var holder = document.getElementById("xhs-result");
  if (holder) holder.innerHTML = html; else c.insertAdjacentHTML("beforeend", html);
}

function xhsExpandSearch(doExpand) {
  var p = window.__xhsPending;
  if (!p) return;
  if (doExpand) {
    // 批量搜索 10 个细分词并合并（演示：用规则细分词逐个 demo 检索后合并）
    var subs = xhsSubtrackRule(p.kw);
    var merged = [];
    var seen = {};
    subs.forEach(function (s) {
      var r = xhsSearchDemo(s, xhsRangeDays(p.range));
      r.articles.forEach(function (a) { if (!seen[a.id]) { seen[a.id] = true; merged.push(a); } });
    });
    merged.sort(function (a, b) { return b.totalScore - a.totalScore; });
    var payload = { isHot: false, keyword: p.kw + "（拓展）", articles: merged, latestHotArticles: merged.slice(0, 10), relatedSearches: subs, hotTopics: XHS_HOT_TRACKS, source: "demo", note: "已批量搜索 " + subs.length + " 个细分方向并合并结果（示例数据）。" };
    window.__xhsShowAll = false;
    window.__xhsLast = { payload: payload, kw: p.kw + "（拓展）", rangeLabel: xhsRangeLabel(p.range) };
    xhsPushHistory(p.kw + "（拓展）", p.source);
    xhsRenderResults();
  } else {
    // 只搜原词
    xhsRunSearch(p.kw);
  }
  window.__xhsPending = null;
}

function xhsQuickSearch(kw) {
  window.__xhsPending = null;
  var inp = document.getElementById("xhs-keyword");
  if (inp) inp.value = kw;
  xhsRunSearch(kw);
}

// ---------- 结果渲染（遵循技能展示策略）----------
function xhsPopulateNotes(p) {
  window.__xhsNotes = {};
  (p.articles || []).forEach(function (a) { window.__xhsNotes[a.id] = a; });
}

// 可复用：根据 payload 构建结果 HTML（opts.hub=true 时隐藏订阅/下载条，供「我的产出」查看）
function xhsBuildReportHtml(p, kw, rangeLabel, opts) {
  opts = opts || {};
  var html = "";
  html += '<div class="xhs-note">' +
    '📌 <b>数据说明</b>：爆款笔记收录原则为互动数1000以上的文章' + (p.source === "demo" ? "（当前为<b>示例数据</b>，非真实抓取）" : "") + '。' +
    (p.isHot ? '全站热门按<b>互动数</b>排序。' : '排序按<b>相关性(满分10)</b>＋<b>热度(满分3)</b>＋<b>时效(满分2)</b>，总分15。') +
    '</div>';

  var arts = p.articles || [];
  html += '<div class="xhs-range">📅 查询时间范围：' + escapeHtml(rangeLabel) + (kw ? ' ｜ 关键词：<b>' + escapeHtml(kw) + '</b>' : ' ｜ 全站热门') + '</div>';

  if (arts.length === 0) {
    html += '<div class="xhs-empty">🔍 抱歉，该搜索词在查询时间范围内太小众，未找到直接相关的内容，你可以尝试用更短/宽泛的关键词重试。</div>';
    html += '<div class="xhs-rec">推荐搜索词：<b>' + (p.relatedSearches || []).map(escapeHtml).join("、") + '</b></div>';
    html += xhsLatestHotHtml(p.latestHotArticles);
    html += xhsHotTracksHtml();
  } else if (arts.length < 10) {
    html += '<div class="xhs-tip">💡 当前关键词当前时间段仅找到 <b>' + arts.length + '</b> 条结果，您可以尝试拓展词或拓展时间。</div>';
    html += xhsTableHtml(arts, p.isHot, true);
    html += xhsRelatedHtml(p.relatedSearches);
    html += xhsLatestHotHtml(p.latestHotArticles);
    html += xhsHotTracksHtml();
  } else {
    var show = window.__xhsShowAll ? arts : arts.slice(0, 10);
    html += xhsTableHtml(show, p.isHot, false);
    if (!window.__xhsShowAll) {
      html += '<div class="xhs-more">💡 当前共找到 <b>' + arts.length + '</b> 条相关笔记，已展示前10条。' +
        '<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;margin-left:8px" onclick="xhsShowAllToggle(true)">查看全部</button></div>';
    } else {
      html += '<div class="xhs-more"><button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="xhsShowAllToggle(false)">收起</button></div>';
    }
    html += xhsRelatedHtml(p.relatedSearches);
    html += xhsHotTracksHtml();
  }

  html += xhsSubtrackRecHtml(kw);
  if (!opts.hub) {
    html += xhsSubscribeHtml(kw, rangeLabel);
    html += '<div class="xhs-report-bar"><button class="btn btn-secondary" onclick="xhsDownloadReport()">⬇️ 下载 HTML 报告</button>' +
      (p.note ? '<span class="xhs-src-note">' + escapeHtml(p.note) + '</span>' : '') +
      ' <button class="btn btn-secondary" onclick="goAiOutputs()">📂 我的产出</button></div>';
  }
  return html;
}

function xhsRenderResults() {
  var last = window.__xhsLast;
  if (!last) return;
  var c = document.getElementById("xhs-result");
  if (!c) return;
  if (document.getElementById("xhs-loading")) document.getElementById("xhs-loading").classList.add("hidden");
  xhsPopulateNotes(last.payload);
  c.innerHTML = xhsBuildReportHtml(last.payload, last.kw, last.rangeLabel, {});
}

// 供「我的产出」查看：从持久化记录还原结果 HTML
function xhsReportHtmlForHub(rec) {
  xhsPopulateNotes(rec.payload);
  return xhsBuildReportHtml(rec.payload, rec.kw, rec.rangeLabel, { hub: true });
}

// 持久化检索结果（写入「我的产出」聚合）
function xhsSaveReportRecord(kw, rangeLabel, payload, source) {
  ensureXhs();
  if (!DB.data.growth.xhs.reports) DB.data.growth.xhs.reports = [];
  var id = "xr_" + uid();
  DB.data.growth.xhs.reports.unshift({
    id: id, kw: kw || "", rangeLabel: rangeLabel || "", source: source || "demo",
    model: (source === "redfox" ? "REDFOX 真实数据" : "示例数据"),
    payload: payload, createdAt: new Date().toISOString(), fav: false
  });
  if (DB.data.growth.xhs.reports.length > 50) DB.data.growth.xhs.reports = DB.data.growth.xhs.reports.slice(0, 50);
  try { DB.save(); } catch (e) {}
}

function xhsShowAllToggle(v) { window.__xhsShowAll = v; xhsRenderResults(); }

function xhsNoteRow(a, isHot, idx) {
  window.__xhsNotes[a.id] = a;
  var titleCell = '<a href="' + (a.url || "#") + '" target="_blank" rel="noopener" class="xhs-title-link">' + escapeHtml(a.title) + '</a>';
  var authorCell = a.authorUrl ? '<a href="' + a.authorUrl + '" target="_blank" rel="noopener">' + escapeHtml(a.author) + '</a>' : escapeHtml(a.author);
  var eng = formatCount ? formatCount(a.engagement) : a.engagement;
  var saveBtn = '<button class="btn btn-mini" onclick="xhsSaveNote(\'' + a.id + '\')">＋拆解</button>';
  if (isHot) {
    return '<tr><td>' + (idx + 1) + '. ' + titleCell + '</td><td>' + authorCell + '</td><td>' + eng + '</td><td>' + escapeHtml(a.publishTime) + '</td><td>' + saveBtn + '</td></tr>';
  }
  return '<tr><td>' + (idx + 1) + '. ' + titleCell + '</td><td>' + authorCell + '</td><td>' + eng + '</td><td>' + escapeHtml(a.publishTime) + '</td>' +
    '<td>' + (a.relevance != null ? a.relevance.toFixed(1) : "-") + '</td><td>' + (a.heat != null ? a.heat.toFixed(1) : "-") + '</td><td>' + (a.timeliness != null ? a.timeliness.toFixed(1) : "-") + '</td>' +
    '<td><b>' + (a.totalScore != null ? a.totalScore.toFixed(1) : "-") + '</b></td><td>' + saveBtn + '</td></tr>';
}

function xhsTableHtml(arts, isHot, small) {
  var head = isHot
    ? '<tr><th>笔记标题</th><th>作者</th><th>互动数</th><th>发布时间</th><th></th></tr>'
    : '<tr><th>笔记标题</th><th>作者</th><th>互动数</th><th>发布时间</th><th>相关性</th><th>热度</th><th>时效</th><th>总分</th><th></th></tr>';
  var rows = arts.map(function (a, i) { return xhsNoteRow(a, isHot, i); }).join("");
  return '<div class="xhs-table-wrap"><table class="xhs-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
}

function xhsRelatedHtml(related) {
  if (!related || !related.length) return "";
  return '<div class="xhs-related">🔤 拓词推荐：' + related.map(function (r) { return '<span class="xhs-chip" onclick="xhsQuickSearch(\'' + r.replace(/'/g, "\\'") + '\')">' + escapeHtml(r) + '</span>'; }).join("") + '</div>';
}

function xhsLatestHotHtml(list) {
  if (!list || !list.length) return "";
  var rows = list.slice(0, 10).map(function (a, i) {
    window.__xhsNotes[a.id] = a;
    var titleCell = '<a href="' + (a.url || "#") + '" target="_blank" rel="noopener" class="xhs-title-link">' + escapeHtml(a.title) + '</a>';
    var authorCell = a.authorUrl ? '<a href="' + a.authorUrl + '" target="_blank" rel="noopener">' + escapeHtml(a.author) + '</a>' : escapeHtml(a.author);
    var eng = formatCount ? formatCount(a.engagement) : a.engagement;
    return '<tr><td>' + (i + 1) + '. ' + titleCell + '</td><td>' + authorCell + '</td><td>' + eng + '</td><td>' + escapeHtml(a.publishTime) + '</td></tr>';
  }).join("");
  return '<div class="xhs-section"><div class="xhs-section-t">💡 我们为您推荐了近期的热门笔记供参考</div>' +
    '<div class="xhs-table-wrap"><table class="xhs-table"><thead><tr><th>笔记标题</th><th>作者</th><th>互动数</th><th>发布时间</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

function xhsHotTracksHtml() {
  return '<div class="xhs-section"><div class="xhs-section-t">📈 您还可以尝试搜索以下热门赛道</div>' +
    '<div class="xhs-subtrack-row">' + XHS_HOT_TRACKS.map(function (t) { return '<span class="xhs-subtrack" onclick="xhsQuickSearch(\'' + t.replace(/'/g, "\\'") + '\')">' + escapeHtml(t) + '</span>'; }).join("") + '</div></div>';
}

function xhsSubtrackRecHtml(kw) {
  var subs = xhsSubtrackRule(kw && kw.trim() ? kw.trim().replace("（拓展）", "") : "穿搭");
  return '<div class="xhs-section"><div class="xhs-section-t">以上是「' + escapeHtml(kw || "全站") + '」的热门数据。如需深入了解某个细分方向，可以从以下赛道中选择：</div>' +
    '<div class="xhs-subtrack-row">' + subs.map(function (s) { return '<span class="xhs-subtrack" onclick="xhsQuickSearch(\'' + s.replace(/'/g, "\\'") + '\')">' + escapeHtml(s) + '</span>'; }).join("") + '</div>' +
    '<div class="xhs-hint">回复具体关键词，我将为您查询该赛道的热门笔记。</div></div>';
}

function xhsSubscribeHtml(kw, rangeLabel) {
  return '<div class="xhs-subscribe" id="xhs-subscribe">' +
    '<div class="xhs-section-t">📬 订阅服务</div>' +
    '<div class="xhs-subscribe-actions">' +
      '<button class="btn btn-primary" onclick="xhsStartSubscribe()">1️⃣ 订阅当前搜索条件（每日推送）</button>' +
      '<button class="btn btn-secondary" onclick="xhsToggleSubList()">2️⃣ 查看我的订阅</button>' +
    '</div>' +
    '<div id="xhs-sub-list" class="hidden"></div>' +
    '</div>';
}

// ---------- 保存到爆款视频拆解 ----------
function xhsSaveNote(id) {
  var n = window.__xhsNotes[id];
  if (!n) return;
  ensureXhs();
  if (!DB.data.growth) DB.data.growth = {};
  if (!DB.data.growth.videos) DB.data.growth.videos = { items: [], lastGeneratedMorning: null, lastGeneratedEvening: null, customTagBank: {} };
  if (!DB.data.growth.videos.items) DB.data.growth.videos.items = [];
  if (DB.data.growth.videos.items.some(function (v) { return v.xhsId === id; })) {
    if (typeof showToast === "function") showToast("该笔记已存入拆解库");
    return;
  }
  DB.data.growth.videos.items.unshift({
    id: "xhs_" + uid(),
    xhsId: id,
    title: n.title || "",
    description: (n.topics || []).join(" "),
    hashtags: (n.topics || []).slice(0, 6),
    platform: "小红书",
    category: "小红书爆款",
    url: n.url || "",
    image: n.cover || "",
    customTags: ["小红书爆款"],
    likes: n.likes || 0,
    comments: n.comments || 0,
    saves: n.saves || 0,
    date: today(),
    session: "morning"
  });
  try { DB.save(); } catch (e) {}
  if (typeof showToast === "function") showToast("已保存到爆款视频拆解");
  else alert("已保存到爆款视频拆解");
}

// ---------- 订阅 ----------
function xhsStartSubscribe() {
  var last = window.__xhsLast;
  if (!last) { if (typeof showToast === "function") showToast("请先完成一次查询再订阅"); return; }
  var times = ["08:00", "12:00", "18:00", "21:00"];
  var html = '<div class="xhs-modal-card">' +
    '<div class="xhs-modal-t">📅 数据更新时间：每日早上 7 点更新昨日数据</div>' +
    '<div class="xhs-modal-sub">请选择推送时间：</div>' +
    '<div class="xhs-time-row">' + times.map(function (t) { return '<button class="btn btn-secondary" onclick="xhsDoSubscribe(\'' + t + '\')">' + t + '</button>'; }).join("") + '</div>' +
    '<div class="xhs-modal-sub" style="margin-top:8px">或输入自定义时间（HH:MM）：</div>' +
    '<div style="display:flex;gap:8px"><input id="xhs-push-time" class="form-input" placeholder="如 09:30" style="flex:1"><button class="btn btn-primary" onclick="xhsDoSubscribe(document.getElementById(\'xhs-push-time\').value)">确定</button></div>' +
    '</div>';
  if (typeof openModal === "function") openModal(html);
  else {
    var c = document.getElementById("xhs-sub-list");
    if (c) { c.classList.remove("hidden"); c.innerHTML = html; }
  }
}

function xhsDoSubscribe(pushTime) {
  pushTime = (pushTime || "").trim();
  if (!pushTime) { if (typeof showToast === "function") showToast("请输入推送时间"); return; }
  if (!/^\d{1,2}:\d{2}$/.test(pushTime)) { if (typeof showToast === "function") showToast("时间格式应为 HH:MM"); return; }
  var last = window.__xhsLast;
  ensureXhs();
  DB.data.growth.xhs.subscriptions.unshift({
    id: "sub_" + uid(),
    keyword: last.kw,
    rangeLabel: last.rangeLabel,
    pushTime: pushTime,
    createdAt: new Date().toISOString()
  });
  try { DB.save(); } catch (e) {}
  if (typeof closeModal === "function") closeModal();
  if (typeof showToast === "function") showToast("✅ 订阅创建成功（" + last.kw + " @ " + pushTime + "）");
  xhsToggleSubList(true);
}

function xhsToggleSubList(forceOpen) {
  var box = document.getElementById("xhs-sub-list");
  if (!box) return;
  if (forceOpen === true) box.classList.remove("hidden");
  else if (forceOpen === false) box.classList.add("hidden");
  else box.classList.toggle("hidden");
  if (!box.classList.contains("hidden")) {
    ensureXhs();
    var subs = DB.data.growth.xhs.subscriptions || [];
    if (!subs.length) { box.innerHTML = '<div class="xhs-hint">暂无订阅。完成查询后点击「订阅当前搜索条件」即可。</div>'; return; }
    box.innerHTML = '<div class="xhs-sub-list">' + subs.map(function (s) {
      return '<div class="xhs-sub-item"><span>🔔 <b>' + escapeHtml(s.keyword) + '</b> ｜ ' + escapeHtml(s.rangeLabel) + ' ｜ 每日 ' + escapeHtml(s.pushTime) + '</span>' +
        '<button class="btn btn-mini btn-danger" onclick="xhsDelSub(\'' + s.id + '\')">删除</button></div>';
    }).join("") + '</div>';
  }
}

function xhsDelSub(id) {
  ensureXhs();
  DB.data.growth.xhs.subscriptions = (DB.data.growth.xhs.subscriptions || []).filter(function (s) { return s.id !== id; });
  try { DB.save(); } catch (e) {}
  xhsToggleSubList(true);
}

// ---------- HTML 报告下载 ----------
function xhsDownloadReport() {
  var last = window.__xhsLast;
  if (!last) { if (typeof showToast === "function") showToast("请先完成查询"); return; }
  var p = last.payload;
  var kw = last.kw || "全站热门";
  var fname = (kw || "hot").replace(/[^\w一-龥]/g, "_") + "_热门数据.html";
  var rows = (p.articles || []).map(function (a, i) {
    return "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(a.title) + "</td><td>" + escapeHtml(a.author) + "</td><td>" + (a.engagement || 0) + "</td><td>" + escapeHtml(a.publishTime) + "</td>" +
      (p.isHot ? "" : "<td>" + (a.relevance != null ? a.relevance.toFixed(1) : "-") + "</td><td>" + (a.heat != null ? a.heat.toFixed(1) : "-") + "</td><td>" + (a.timeliness != null ? a.timeliness.toFixed(1) : "-") + "</td><td><b>" + (a.totalScore != null ? a.totalScore.toFixed(1) : "-") + "</b></td>") + "</tr>";
  }).join("");
  var head = p.isHot ? "<tr><th>#</th><th>标题</th><th>作者</th><th>互动数</th><th>发布时间</th></tr>"
    : "<tr><th>#</th><th>标题</th><th>作者</th><th>互动数</th><th>发布时间</th><th>相关性</th><th>热度</th><th>时效</th><th>总分</th></tr>";
  var html = "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'><title>" + escapeHtml(kw) + " 热门数据</title>" +
    "<style>body{font-family:-apple-system,'PingFang SC',sans-serif;padding:24px;color:#222}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}th{background:#fff0f5}.t{color:#ff4d8d;font-size:12px;margin-top:8px}</style></head><body>" +
    "<h2>📊 " + escapeHtml(kw) + " 热门数据报告</h2>" +
    "<div class='t'>生成时间：" + new Date().toLocaleString() + " ｜ 时间范围：" + escapeHtml(last.rangeLabel) + (p.source === "demo" ? " ｜ 示例数据（非真实抓取）" : "") + "</div>" +
    "<table><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>" +
    "<div class='t'>拓词推荐：" + (p.relatedSearches || []).join("、") + "</div></body></html>";
  try {
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = fname; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (typeof showToast === "function") showToast("报告已下载：" + fname);
  } catch (e) { if (typeof showToast === "function") showToast("下载失败：" + e.message); }
}

// ---------- 模型选择行（与自定义情报/市场机会共享 AI 配置）----------
function xhsModelRow() {
  var ai = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var defProv = ai.provider || "gemini";
  var opts = Object.keys(INTEL_PROVIDERS).map(function (k) {
    var p = INTEL_PROVIDERS[k];
    var sel = (defProv === k) ? " selected" : "";
    return '<option value="' + k + '"' + sel + '>' + p.name + intelProvBadge(k) + '</option>';
  }).join("");
  var key = ai.key ? ai.key : "";
  return '<div class="xhs-input-row" style="margin-top:8px;align-items:center">' +
      '<span class="xhs-label">模型</span>' +
      '<select id="xhs-prov" class="form-input" style="width:210px">' + opts + '</select>' +
      '<input id="xhs-key" class="form-input" type="password" placeholder="API Key（仅存本机）" value="' + escapeHtml(key) + '" style="flex:1">' +
    '</div>' +
    '<label class="xhs-ws"><input type="checkbox" id="xhs-ws"' + ((ai.webSearch !== false) ? " checked" : "") + ' onchange="intelToggleWs(this)"> 🌐 联网检索（用于模型意图识别 / 赛道拓展推荐）</label>';
}

// ---------- 入口：渲染 XHS 查询视图 ----------
function renderXhsQuery(c) {
  ensureXhs();
  var cfg = loadXhsConfig();
  var history = (DB.data.growth.xhs.history || []).slice(0, 6);
  var historyHtml = history.length
    ? '<div class="xhs-history">最近查询：' + history.map(function (h) { return '<span class="xhs-chip" onclick="xhsQuickSearch(\'' + (h.kw || "").replace(/'/g, "\\'") + '\')">' + escapeHtml(h.kw || "全站热门") + '</span>'; }).join("") + '</div>'
    : "";
  var redfoxKeyHtml = cfg.source === "redfox"
    ? '<input id="xhs-redfox-key" class="form-input" placeholder="REDFOX_API_KEY（红狐hub，新用户免费试用额度）" value="' + escapeHtml(cfg.redfoxKey) + '" style="margin-top:8px">'
    : "";

  c.innerHTML =
    '<div class="xhs-wrap">' +
      '<div class="xhs-card">' +
        '<div class="xhs-input-row">' +
          '<input id="xhs-keyword" class="form-input" placeholder="输入想研究的小红书赛道，如：减脂餐 / 小个子穿搭 / 折叠屏" style="flex:1">' +
          '<select id="xhs-range" class="form-input" style="width:110px">' +
            '<option value="1">近1天</option><option value="3">近3天</option><option value="7" selected>近7天</option><option value="30">近30天</option>' +
          '</select>' +
          '<button class="btn btn-primary" onclick="xhsRunSearch()">🔍 搜索</button>' +
        '</div>' +
        '<div class="xhs-input-row" style="margin-top:8px;align-items:center">' +
          '<span class="xhs-label">数据源</span>' +
          '<select id="xhs-source" class="form-input" style="width:160px" onchange="renderXhsQuery(document.getElementById(\'app-content\'))">' +
            '<option value="demo"' + (cfg.source === "demo" ? " selected" : "") + '>示例数据（默认·免费）</option>' +
            '<option value="redfox"' + (cfg.source === "redfox" ? " selected" : "") + '>REDFOX（红狐hub·免费试用）</option>' +
          '</select>' +
          '<span class="xhs-hint" style="flex:1">空关键词 = 全站热门</span>' +
        '</div>' +
        redfoxKeyHtml +
        xhsModelRow() +
        historyHtml +
      '</div>' +
      '<div id="xhs-err" class="xhs-err hidden"></div>' +
      '<div id="xhs-loading" class="xhs-loading hidden">⏳ 正在分析（免费大模型处理中）…</div>' +
      '<div id="xhs-result"></div>' +
    '</div>';
}
