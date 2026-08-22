// ============================================================
// 💪 减脂健身模块（v5.8.79）
// 数据：DB.data.growth.fitness = {
//   profile: { gender, heightCm, startWeight, currentWeight, targetWeight,
//              startWeightDate, targetDate, dietStyle, dislikes[], likes[],
//              menstrual{ enabled, lastPeriodDate, cycleDays, periodDays } },
//   weightLogs: { "YYYY-MM-DD": { weight, note, photo } },
//   dietLogs:   { "YYYY-MM-DD": [ { id, meal, name, kcal, photo, recipeId, note } ] },
//   trainDone:  { "YYYY-MM-DD": { typeId: true } },
//   postureDone:{ "YYYY-MM-DD": { issueId: true } }
// }
// 纯函数（ft* 无 DOM 依赖）便于自动化测试；渲染/交互函数调用 app.js 全局
// （showModal/showToast/compressImage/ImageDB/RECIPE_DB 等）。
// ============================================================

var FT_MEALS = ["breakfast", "lunch", "dinner", "snack"];
var FT_MEAL_NAMES = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
var FT_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

// ---------- 训练类型与动作库 ----------
var FT_TRAIN_TYPES = {
  shoulder: { id: "shoulder", name: "肩背塑形", icon: "💪", routine: [
    { name: "弹力带面拉", sets: 4, reps: "15 次", tip: "后缩肩胛，想象夹铅笔" },
    { name: "俯身反向飞鸟", sets: 4, reps: "15 次", tip: "微屈肘，用后背带动" },
    { name: "哑铃侧平举", sets: 4, reps: "12 次", tip: "小重量控制，别耸肩" },
    { name: "俯身 T 杠划船", sets: 4, reps: "12 次", tip: "挺胸收腹，背阔主导" },
    { name: "靠墙天使", sets: 3, reps: "12 次", tip: "后脑/肩/臀贴墙滑动" },
    { name: "死虫式", sets: 3, reps: "15 次", tip: "腰贴地，对侧手脚慢放" }
  ] },
  cardio: { id: "cardio", name: "有氧燃脂", icon: "🔥", routine: [
    { name: "开合跳", sets: 3, reps: "40 秒", tip: "落地轻，核心收紧" },
    { name: "高抬腿", sets: 3, reps: "40 秒", tip: "膝盖抬到腰高" },
    { name: "波比跳", sets: 3, reps: "12 次", tip: "做不到可去俯卧撑" },
    { name: "登山者", sets: 3, reps: "40 秒", tip: "腹部发力，节奏稳" },
    { name: "原地慢跑", sets: 1, reps: "5 分钟", tip: "保持微微出汗" },
    { name: "跳绳", sets: 3, reps: "1 分钟", tip: "前脚掌着地" }
  ] },
  glutes: { id: "glutes", name: "臀腿塑形", icon: "🍑", routine: [
    { name: "深蹲", sets: 4, reps: "15 次", tip: "膝朝脚尖，臀部后坐" },
    { name: "臀桥", sets: 4, reps: "20 次", tip: "顶峰夹紧 1 秒" },
    { name: "箭步蹲", sets: 3, reps: "12 次/侧", tip: "前膝不超脚尖" },
    { name: "蚌式开合", sets: 3, reps: "20 次/侧", tip: "脚跟并拢，开上膝" },
    { name: "侧卧抬腿", sets: 3, reps: "15 次/侧", tip: "身体成直线" },
    { name: "螃蟹步", sets: 3, reps: "30 秒", tip: "微蹲外走，弹带抗阻" }
  ] },
  abs: { id: "abs", name: "腹部训练", icon: "🧱", routine: [
    { name: "卷腹", sets: 4, reps: "20 次", tip: "下背贴地，颈放松" },
    { name: "反向卷腹", sets: 3, reps: "15 次", tip: "用下腹卷起骨盆" },
    { name: "平板支撑", sets: 3, reps: "45 秒", tip: "身体成板，臀不塌" },
    { name: "俄罗斯转体", sets: 3, reps: "20 次", tip: "脚离地更易，慢转" },
    { name: "登山者", sets: 3, reps: "40 秒", tip: "腹部主导" },
    { name: "死虫式", sets: 3, reps: "15 次", tip: "腰贴地" }
  ] },
  menstrual: { id: "menstrual", name: "经期舒缓", icon: "🌸", routine: [
    { name: "猫牛式", sets: 2, reps: "10 次", tip: "配合呼吸，缓慢流动" },
    { name: "婴儿式拉伸", sets: 1, reps: "60 秒", tip: "额头触地放松" },
    { name: "靠墙倒箭式", sets: 1, reps: "3 分钟", tip: "腿靠墙，促循环" },
    { name: "腹式呼吸", sets: 2, reps: "10 次", tip: "鼻吸腹鼓，口呼腹收" },
    { name: "散步", sets: 1, reps: "15 分钟", tip: "低强度即可" },
    { name: "轻柔臀桥", sets: 2, reps: "10 次", tip: "不憋气" }
  ] },
  baduanjin: { id: "baduanjin", name: "八段锦", icon: "🧘", routine: [
    { name: "两手托天理三焦", sets: 1, reps: "8 次", tip: "双手交叉上托，脚跟提起，拉伸全身" },
    { name: "左右开弓似射雕", sets: 1, reps: "8 次/侧", tip: "马步开弓，目视食指方向" },
    { name: "调理脾胃须单举", sets: 1, reps: "8 次/侧", tip: "单手上托，另一手下按，力在掌根" },
    { name: "五劳七伤往后瞧", sets: 1, reps: "8 次/侧", tip: "头缓慢后转，肩不动" },
    { name: "摇头摆尾去心火", sets: 1, reps: "8 次", tip: "马步转腰，头尾协调摆动" },
    { name: "两手攀足固肾腰", sets: 1, reps: "8 次", tip: "前屈手触足，起身后仰" },
    { name: "攒拳怒目增气力", sets: 1, reps: "8 次/侧", tip: "马步冲拳，目视拳出方向" },
    { name: "背后七颠百病消", sets: 1, reps: "8 次", tip: "脚跟提起颠落，牙齿轻叩" }
  ] },
  belly: { id: "belly", name: "瘦肚子训练", icon: "🔥", routine: [
    { name: "卷腹", sets: 4, reps: "20 次", tip: "下背贴地，颈放松，腹部发力卷起" },
    { name: "反向卷腹", sets: 3, reps: "15 次", tip: "用下腹卷起骨盆，腿不借力" },
    { name: "俄罗斯转体", sets: 3, reps: "20 次", tip: "脚离地，躯干后倾左右转" },
    { name: "空中自行车", sets: 3, reps: "20 次", tip: "肘触对侧膝，交替蹬腿" },
    { name: "平板支撑", sets: 3, reps: "45 秒", tip: "身体成一条直线，核心收紧" },
    { name: "仰卧抬腿", sets: 3, reps: "15 次", tip: "双腿并拢慢落慢起，腰贴地" }
  ] },
  thigh: { id: "thigh", name: "瘦大腿训练", icon: "🦵", routine: [
    { name: "侧卧抬腿", sets: 3, reps: "20 次/侧", tip: "身体成直线，上方腿缓慢抬起" },
    { name: "蚌式开合", sets: 3, reps: "20 次/侧", tip: "脚跟并拢，膝盖开合，臀外侧发力" },
    { name: "相扑深蹲", sets: 4, reps: "15 次", tip: "宽站距脚尖外展，大腿内侧发力" },
    { name: "内侧抬腿", sets: 3, reps: "15 次/侧", tip: "下方腿内侧发力抬起" },
    { name: "靠墙静蹲", sets: 3, reps: "45 秒", tip: "背靠墙，大腿与地面平行" },
    { name: "跪姿侧踢", sets: 3, reps: "15 次/侧", tip: "四足跪姿，单腿侧踢画圈" }
  ] },
  rest: { id: "rest", name: "休息/拉伸", icon: "🧘", routine: [
    { name: "全身拉伸", sets: 1, reps: "10 分钟", tip: "每个部位保持 30 秒" },
    { name: "泡沫轴放松", sets: 1, reps: "5 分钟", tip: "滚动紧张肌群" },
    { name: "散步", sets: 1, reps: "20 分钟", tip: "助恢复" }
  ] }
};

// 默认周计划模板（周一..周日）— 含八段锦、瘦肚子、瘦大腿
var FT_WEEK_TEMPLATE = ["baduanjin", "cardio", "belly", "glutes", "thigh", "cardio", "rest"];

// ---------- 体态问题库 ----------
var FT_POSTURE_ISSUES = [
  { id: "round_shoulder", name: "圆肩 / 含胸", icon: "🤷", desc: "肩胛前倾、胸部内扣", routine: [
    { name: "靠墙天使", sets: 3, reps: "12 次", tip: "后脑肩臀贴墙" },
    { name: "弹力带面拉", sets: 3, reps: "15 次", tip: "后缩肩胛" },
    { name: "胸椎拉伸", sets: 3, reps: "30 秒", tip: "双手抱头向后展" },
    { name: "扩胸伸展", sets: 3, reps: "30 秒", tip: "双手后展" },
    { name: "YTWL 训练", sets: 3, reps: "12 次", tip: "字母轨迹激活后背" }
  ] },
  { id: "kyphosis", name: "驼背", icon: "🐫", desc: "上胸椎过度后凸", routine: [
    { name: "猫牛式", sets: 2, reps: "10 次", tip: "慢节奏" },
    { name: "靠墙站立收腹", sets: 3, reps: "1 分钟", tip: "三点贴墙" },
    { name: "弹力带划船", sets: 3, reps: "15 次", tip: "夹背" },
    { name: "胸椎旋转", sets: 3, reps: "10 次/侧", tip: "骨盆固定" }
  ] },
  { id: "apt", name: "骨盆前倾", icon: "🦵", desc: "小腹前顶、腰曲过大", routine: [
    { name: "髂腰肌拉伸", sets: 3, reps: "30 秒/侧", tip: "前后弓步沉髋" },
    { name: "臀桥", sets: 3, reps: "15 次", tip: "夹紧臀部" },
    { name: "死虫式", sets: 3, reps: "15 次", tip: "腰贴地" },
    { name: "平板支撑", sets: 3, reps: "30 秒", tip: "收腹" },
    { name: "站姿收腹", sets: 3, reps: "1 分钟", tip: "脐向脊柱" }
  ] },
  { id: "false_hip", name: "假胯宽", icon: "🍐", desc: "大腿外侧突、臀线下移", routine: [
    { name: "蚌式开合", sets: 3, reps: "20 次/侧", tip: "脚跟并拢" },
    { name: "侧卧抬腿", sets: 3, reps: "15 次/侧", tip: "身体成线" },
    { name: "臀桥", sets: 3, reps: "20 次", tip: "顶峰停顿" },
    { name: "内收肌拉伸", sets: 3, reps: "30 秒", tip: "青蛙趴" }
  ] },
  { id: "knee_valgus", name: "小腿外翻 / X 型腿", icon: "🦶", desc: "膝内扣、足弓塌陷", routine: [
    { name: "提踵", sets: 3, reps: "20 次", tip: "慢起慢落" },
    { name: "蚌式开合", sets: 3, reps: "15 次/侧", tip: "外侧臀发力" },
    { name: "单腿臀桥", sets: 3, reps: "12 次/侧", tip: "稳定骨盆" },
    { name: "足弓激活", sets: 3, reps: "30 秒", tip: "抓毛巾" }
  ] },
  { id: "dowager", name: "富贵包", icon: "🐢", desc: "颈后脂肪垫、头前伸", routine: [
    { name: "收下巴", sets: 3, reps: "15 次", tip: "双下巴动作" },
    { name: "颈部拉伸", sets: 3, reps: "30 秒/侧", tip: "头侧倾" },
    { name: "靠墙天使", sets: 3, reps: "12 次", tip: "后脑贴墙" },
    { name: "胸锁乳突肌拉伸", sets: 3, reps: "30 秒/侧", tip: "头后仰侧转" }
  ] },
  { id: "uneven_shoulder", name: "高低肩", icon: "⚖️", desc: "双侧肩胛不等高", routine: [
    { name: "靠墙天使", sets: 3, reps: "12 次", tip: "双侧对称" },
    { name: "单侧肩外展拉伸", sets: 3, reps: "30 秒/低侧", tip: "低肩多拉" },
    { name: "弹力带面拉", sets: 3, reps: "15 次", tip: "对称发力" },
    { name: "核心收腹", sets: 3, reps: "1 分钟", tip: "稳定躯干" }
  ] },
  { id: "mom_butt", name: "妈妈臀 / 臀部下垂", icon: "🍑", desc: "臀线低、松弛", routine: [
    { name: "深蹲", sets: 4, reps: "15 次", tip: "臀部后坐" },
    { name: "臀桥", sets: 4, reps: "20 次", tip: "顶峰夹紧" },
    { name: "蚌式开合", sets: 3, reps: "20 次/侧", tip: "外侧臀" },
    { name: "箭步蹲", sets: 3, reps: "12 次/侧", tip: "前膝不超脚尖" }
  ] }
];

// 默认跟练视频 — 欧阳春晓Aurora 本人官方上传（B站 UID 493570956）的高播放视频。
// 用户可在跟练页「从 B站 导入」自由覆盖，覆盖后只存于本人数据、不影响他人。
// 取值为 BV 号；空串表示该项暂无统一视频、由用户自行导入。
var FT_DEFAULT_POSTURE_VIDEOS = {
  round_shoulder: "BV1Yk4y1d7Wn",  // 每天10min直角肩少女背（1.1亿）
  kyphosis: "BV1Gz421C7G1",        // 每天15分钟丝滑美背·纠正圆肩驼背头前伸（984万）
  apt: "BV14w411h7rj",             // 躺练8分钟骨盆回正（570万）
  false_hip: "BV1Qb4y1q7bU",       // 根除小肚腩·告别假胯宽·20min骨盆矫正（857万）
  knee_valgus: "BV1gU4y1j7hG",     // 8min根本性瘦小腿·改善小腿外翻（774万）
  dowager: "BV1uCoRYHE1v",         // 坐姿10MIN圆肩驼背头前伸矫正（477万）
  uneven_shoulder: "BV1h94y167WX", // 5min纠正肩内扣头前伸（341万）
  mom_butt: "BV15r421F7wD"         // 巨省膝盖·躺练普拉提虐臀100次（447万）
};
var FT_DEFAULT_TRAIN_VIDEOS = {
  shoulder: "BV1qQc4zxEsi",  // 30分钟芭杆上肢雕刻·体态薄背（786万）
  cardio: "BV1nK4y1Y7Dc",     // 无跑跳暴汗减脂操30分钟（566万）
  glutes: "BV1hTWBzvEXn",     // 30分钟芭杆臀腿紧致x腰腹核心（421万）
  abs: "BV1vU4y1g7Pg",        // 追剧7天练出沙漏腰·20min站立（5719万）
  baduanjin: "BV1o94y1h7Lb",  // 国家体育总局版八段锦完整口令版
  belly: "BV1Sv4y1o7pW",      // 10分钟高效虐腹·马甲线养成
  thigh: "BV1mW4y1D7QH",      // 10分钟瘦大腿内侧·改善假胯宽
  menstrual: "",              // 经期舒缓暂无统一视频，可自导入
  rest: ""                    // 休息/拉伸可自行导入
};
var FT_BILI_UP = "欧阳春晓Aurora";  // 默认搜索推荐 UP 主

// ============================================================
// 食物卡路里库（家常菜 / 火锅 / 鸡煲 / 麦当劳 / 肯德基 / 零食 / 生鲜）
// ============================================================
var FT_FOOD_DB = [
  // ---------- 家常菜 ----------
  { id: "fd001", cat: "家常菜", name: "番茄炒蛋", kcal: 180, unit: "1盘(2人份)" },
  { id: "fd002", cat: "家常菜", name: "青椒肉丝", kcal: 260, unit: "1盘(2人份)" },
  { id: "fd003", cat: "家常菜", name: "红烧排骨", kcal: 320, unit: "1盘(2人份)" },
  { id: "fd004", cat: "家常菜", name: "宫保鸡丁", kcal: 280, unit: "1盘(2人份)" },
  { id: "fd005", cat: "家常菜", name: "麻婆豆腐", kcal: 220, unit: "1盘(2人份)" },
  { id: "fd006", cat: "家常菜", name: "清炒西兰花", kcal: 120, unit: "1盘(2人份)" },
  { id: "fd007", cat: "家常菜", name: "可乐鸡翅", kcal: 300, unit: "8只" },
  { id: "fd008", cat: "家常菜", name: "酸辣土豆丝", kcal: 160, unit: "1盘(2人份)" },
  { id: "fd009", cat: "家常菜", name: "地三鲜", kcal: 200, unit: "1盘(2人份)" },
  { id: "fd010", cat: "家常菜", name: "西红柿炒鸡蛋", kcal: 175, unit: "1盘(2人份)" },
  { id: "fd011", cat: "家常菜", name: "蒜蓉空心菜", kcal: 90, unit: "1盘(2人份)" },
  { id: "fd012", cat: "家常菜", name: "红烧肉", kcal: 450, unit: "1盘(2人份)" },
  { id: "fd013", cat: "家常菜", name: "清蒸鲈鱼", kcal: 200, unit: "1条" },
  { id: "fd014", cat: "家常菜", name: "水煮肉片", kcal: 380, unit: "1盘(2人份)" },
  { id: "fd015", cat: "家常菜", name: "干煸四季豆", kcal: 220, unit: "1盘(2人份)" },
  { id: "fd016", cat: "家常菜", name: "蒸蛋羹", kcal: 130, unit: "1碗" },
  { id: "fd017", cat: "家常菜", name: "蛋炒饭", kcal: 350, unit: "1碗" },
  { id: "fd018", cat: "家常菜", name: "番茄鸡蛋面", kcal: 320, unit: "1碗" },
  { id: "fd019", cat: "家常菜", name: "皮蛋瘦肉粥", kcal: 230, unit: "1碗" },
  { id: "fd020", cat: "家常菜", name: "小米粥", kcal: 120, unit: "1碗" },
  // ---------- 火锅 ----------
  { id: "fd101", cat: "火锅", name: "麻辣锅底", kcal: 350, unit: "1锅底" },
  { id: "fd102", cat: "火锅", name: "番茄锅底", kcal: 180, unit: "1锅底" },
  { id: "fd103", cat: "火锅", name: "菌汤锅底", kcal: 120, unit: "1锅底" },
  { id: "fd104", cat: "火锅", name: "肥牛卷", kcal: 250, unit: "1盘(约150g)" },
  { id: "fd105", cat: "火锅", name: "羔羊肉卷", kcal: 280, unit: "1盘(约150g)" },
  { id: "fd106", cat: "火锅", name: "毛肚", kcal: 110, unit: "1盘(约100g)" },
  { id: "fd107", cat: "火锅", name: "鸭肠", kcal: 130, unit: "1盘(约100g)" },
  { id: "fd108", cat: "火锅", name: "虾滑", kcal: 180, unit: "1份(约100g)" },
  { id: "fd109", cat: "火锅", name: "午餐肉", kcal: 260, unit: "1盘(约100g)" },
  { id: "fd110", cat: "火锅", name: "豆腐/冻豆腐", kcal: 80, unit: "1份(约100g)" },
  { id: "fd111", cat: "火锅", name: "宽粉", kcal: 210, unit: "1份(约100g)" },
  { id: "fd112", cat: "火锅", name: "藕片", kcal: 70, unit: "1盘(约100g)" },
  { id: "fd113", cat: "火锅", name: "金针菇", kcal: 40, unit: "1盘(约100g)" },
  { id: "fd114", cat: "火锅", name: "土豆片", kcal: 80, unit: "1盘(约100g)" },
  { id: "fd115", cat: "火锅", name: "芝麻酱蘸料", kcal: 200, unit: "1小碗" },
  { id: "fd116", cat: "火锅", name: "香油蒜泥蘸料", kcal: 120, unit: "1小碗" },
  // ---------- 鸡煲 / 炖煲 ----------
  { id: "fd201", cat: "鸡煲", name: "花胶鸡煲", kcal: 380, unit: "1人份" },
  { id: "fd202", cat: "鸡煲", name: "椰子鸡煲", kcal: 280, unit: "1人份" },
  { id: "fd203", cat: "鸡煲", name: "猪肚鸡煲", kcal: 350, unit: "1人份" },
  { id: "fd204", cat: "鸡煲", name: "药膳鸡煲", kcal: 260, unit: "1人份" },
  { id: "fd205", cat: "鸡煲", name: "牛腩煲", kcal: 420, unit: "1人份" },
  { id: "fd206", cat: "鸡煲", name: "羊腩煲", kcal: 450, unit: "1人份" },
  { id: "fd207", cat: "鸡煲", name: "鱼头煲", kcal: 220, unit: "1人份" },
  { id: "fd208", cat: "鸡煲", name: "排骨莲藕煲", kcal: 320, unit: "1人份" },
  // ---------- 麦当劳 ----------
  { id: "fd301", cat: "麦当劳", name: "巨无霸", kcal: 550, unit: "1个" },
  { id: "fd302", cat: "麦当劳", name: "麦辣鸡腿堡", kcal: 510, unit: "1个" },
  { id: "fd303", cat: "麦当劳", name: "板烧鸡腿堡", kcal: 440, unit: "1个" },
  { id: "fd304", cat: "麦当劳", name: "双层吉士汉堡", kcal: 450, unit: "1个" },
  { id: "fd305", cat: "麦当劳", name: "薯条(大)", kcal: 510, unit: "1份" },
  { id: "fd306", cat: "麦当劳", name: "薯条(中)", kcal: 380, unit: "1份" },
  { id: "fd307", cat: "麦当劳", name: "麦乐鸡(6块)", kcal: 260, unit: "1盒" },
  { id: "fd308", cat: "麦当劳", name: "麦乐鸡(10块)", kcal: 430, unit: "1盒" },
  { id: "fd309", cat: "麦当劳", name: "可乐(中)", kcal: 150, unit: "1杯" },
  { id: "fd310", cat: "麦当劳", name: "可乐(大)", kcal: 210, unit: "1杯" },
  { id: "fd311", cat: "麦当劳", name: "奥利奥麦旋风", kcal: 340, unit: "1杯" },
  { id: "fd312", cat: "麦当劳", name: "麦满分", kcal: 290, unit: "1个" },
  { id: "fd313", cat: "麦当劳", name: "薯饼", kcal: 150, unit: "1个" },
  { id: "fd314", cat: "麦当劳", name: "苹果派", kcal: 230, unit: "1个" },
  // ---------- 肯德基 ----------
  { id: "fd401", cat: "肯德基", name: "香辣鸡腿堡", kcal: 480, unit: "1个" },
  { id: "fd402", cat: "肯德基", name: "劲脆鸡腿堡", kcal: 460, unit: "1个" },
  { id: "fd403", cat: "肯德基", name: "新奥尔良烤鸡腿堡", kcal: 410, unit: "1个" },
  { id: "fd404", cat: "肯德基", name: "原味鸡", kcal: 250, unit: "1块" },
  { id: "fd405", cat: "肯德基", name: "黄金脆皮鸡", kcal: 270, unit: "1块" },
  { id: "fd406", cat: "肯德基", name: "薯条(大)", kcal: 490, unit: "1份" },
  { id: "fd407", cat: "肯德基", name: "薯条(中)", kcal: 360, unit: "1份" },
  { id: "fd408", cat: "肯德基", name: "上校鸡块(5块)", kcal: 250, unit: "1盒" },
  { id: "fd409", cat: "肯德基", name: "葡式蛋挞", kcal: 230, unit: "1个" },
  { id: "fd410", cat: "肯德基", name: "百事可乐(中)", kcal: 160, unit: "1杯" },
  { id: "fd411", cat: "肯德基", name: "土豆泥", kcal: 110, unit: "1份" },
  { id: "fd412", cat: "肯德基", name: "老北京鸡肉卷", kcal: 430, unit: "1个" },
  { id: "fd413", cat: "肯德基", name: "嫩牛五方", kcal: 460, unit: "1个" },
  // ---------- 零食 ----------
  { id: "fd501", cat: "零食", name: "薯片(原味)", kcal: 530, unit: "100g" },
  { id: "fd502", cat: "零食", name: "乐事薯片(袋)", kcal: 160, unit: "1袋(30g)" },
  { id: "fd503", cat: "零食", name: "巧克力(德芙)", kcal: 580, unit: "100g" },
  { id: "fd504", cat: "零食", name: "奥利奥饼干", kcal: 480, unit: "100g" },
  { id: "fd505", cat: "零食", name: "辣条(卫龙)", kcal: 400, unit: "100g" },
  { id: "fd506", cat: "零食", name: "坚果混合", kcal: 600, unit: "100g" },
  { id: "fd507", cat: "零食", name: "酸奶(无糖)", kcal: 70, unit: "1杯(100g)" },
  { id: "fd508", cat: "零食", name: "酸奶(含糖)", kcal: 100, unit: "1杯(100g)" },
  { id: "fd509", cat: "零食", name: "冰淇淋", kcal: 200, unit: "1个(约80g)" },
  { id: "fd510", cat: "零食", name: "蛋糕(切片)", kcal: 350, unit: "1块(约100g)" },
  { id: "fd511", cat: "零食", name: "蛋黄派", kcal: 200, unit: "1个" },
  { id: "fd512", cat: "零食", name: "海苔", kcal: 180, unit: "1包(约5g)" },
  { id: "fd513", cat: "零食", name: "果冻", kcal: 60, unit: "1个" },
  { id: "fd514", cat: "零食", name: "口香糖", kcal: 10, unit: "1粒" },
  { id: "fd515", cat: "零食", name: "能量棒", kcal: 220, unit: "1根" },
  // ---------- 生鲜 / 食材 ----------
  { id: "fd601", cat: "生鲜", name: "鸡蛋", kcal: 70, unit: "1个(约50g)" },
  { id: "fd602", cat: "生鲜", name: "鸡胸肉", kcal: 110, unit: "100g" },
  { id: "fd603", cat: "生鲜", name: "瘦猪肉", kcal: 140, unit: "100g" },
  { id: "fd604", cat: "生鲜", name: "牛里脊", kcal: 120, unit: "100g" },
  { id: "fd605", cat: "生鲜", name: "三文鱼", kcal: 200, unit: "100g" },
  { id: "fd606", cat: "生鲜", name: "基围虾", kcal: 90, unit: "100g" },
  { id: "fd607", cat: "生鲜", name: "米饭", kcal: 116, unit: "1碗(约100g)" },
  { id: "fd608", cat: "生鲜", name: "面条(熟)", kcal: 110, unit: "1碗(约100g)" },
  { id: "fd609", cat: "生鲜", name: "全麦面包", kcal: 250, unit: "1片(约50g)" },
  { id: "fd610", cat: "生鲜", name: "牛奶(全脂)", kcal: 65, unit: "100ml" },
  { id: "fd611", cat: "生鲜", name: "牛奶(脱脂)", kcal: 35, unit: "100ml" },
  { id: "fd612", cat: "生鲜", name: "豆浆(无糖)", kcal: 30, unit: "100ml" },
  { id: "fd613", cat: "生鲜", name: "苹果", kcal: 60, unit: "1个(约150g)" },
  { id: "fd614", cat: "生鲜", name: "香蕉", kcal: 90, unit: "1根(约100g)" },
  { id: "fd615", cat: "生鲜", name: "西瓜", kcal: 25, unit: "100g" },
  { id: "fd616", cat: "生鲜", name: "牛油果", kcal: 170, unit: "1个(约100g)" },
  { id: "fd617", cat: "生鲜", name: "红薯", kcal: 90, unit: "100g" },
  { id: "fd618", cat: "生鲜", name: "玉米", kcal: 110, unit: "1根(约200g)" },
  { id: "fd619", cat: "生鲜", name: "燕麦片", kcal: 370, unit: "100g" },
  { id: "fd620", cat: "生鲜", name: "西兰花", kcal: 35, unit: "100g" }
];

var FT_FOOD_CATS = ["家常菜", "火锅", "鸡煲", "麦当劳", "肯德基", "零食", "生鲜"];

// ============================================================
// 纯函数
// ============================================================
function ftHash(str) {
  var h = 2166136261;
  str = String(str);
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

function ftAddDays(dateStr, n) {
  var p = String(dateStr).split("-");
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function ftDaysBetween(a, b) {
  var pa = String(a).split("-"), pb = String(b).split("-");
  var da = new Date(Date.UTC(+pa[0], +pa[1] - 1, +pa[2]));
  var db = new Date(Date.UTC(+pb[0], +pb[1] - 1, +pb[2]));
  return Math.round((db - da) / 86400000);
}

function ftDefault() {
  return {
    profile: {
      gender: "female", age: null, heightCm: 165,
      startWeight: null, currentWeight: null, targetWeight: null,
      startWeightDate: null, targetDate: null,
      dietStyle: "balanced", dislikes: [], likes: [],
      workMode: "home",
      schedule: { wakeTime: "07:00", breakfastTime: "07:30", lunchStart: "12:00", lunchEnd: "13:00", dinnerDeadline: "19:00", waterCutoff: "21:00", dailyWaterMl: 2000 },
      dietPrefs: { breakfastHabit: "", lunchHabit: "", appetite: "normal", discipline: "normal" },
      exercise: { hasGym: false, homeEquipment: [], timeSlot: "morning" },
      habits: { footSoak: false, footSoakTime: "21:30" },
      xhsAccount: "18920971144",
      menstrual: { enabled: false, cycleDays: 28, periodDays: 5, lastPeriodDate: "", periodHistory: [] }
    },
    weightLogs: {}, dietLogs: {}, trainDone: {}, postureDone: {},
    postureVideos: Object.assign({}, FT_DEFAULT_POSTURE_VIDEOS),
    trainVideos: Object.assign({}, FT_DEFAULT_TRAIN_VIDEOS)
  };
}

function ftEnsureDefault(f) {
  if (!f) f = ftDefault();
  if (!f.profile) f.profile = ftDefault().profile;
  var p = f.profile;
  if (p.startWeight == null) p.startWeight = null;
  if (p.currentWeight == null) p.currentWeight = null;
  if (p.targetWeight == null) p.targetWeight = null;
  if (!p.dietStyle) p.dietStyle = "balanced";
  if (!p.dislikes) p.dislikes = [];
  if (!p.likes) p.likes = [];
  if (p.age == null) p.age = null;
  if (!p.workMode) p.workMode = "home";
  if (!p.schedule) p.schedule = ftDefault().profile.schedule;
  if (!p.dietPrefs) p.dietPrefs = ftDefault().profile.dietPrefs;
  if (!p.exercise) p.exercise = ftDefault().profile.exercise;
  if (!p.exercise.homeEquipment) p.exercise.homeEquipment = [];
  if (!p.habits) p.habits = ftDefault().profile.habits;
  if (!p.xhsAccount) p.xhsAccount = "18920971144";
  if (!p.menstrual) p.menstrual = ftDefault().profile.menstrual;
  if (!p.menstrual.periodHistory) p.menstrual.periodHistory = [];
  if (!f.weightLogs) f.weightLogs = {};
  if (!f.dietLogs) f.dietLogs = {};
  if (!f.trainDone) f.trainDone = {};
  if (!f.postureDone) f.postureDone = {};
  if (!f.postureVideos) f.postureVideos = {};
  if (!f.trainVideos) f.trainVideos = {};
  // 回填缺失的默认视频（仅补不覆盖：已自定义的保留）
  for (var _pk in FT_DEFAULT_POSTURE_VIDEOS) { if (FT_DEFAULT_POSTURE_VIDEOS[_pk] && !f.postureVideos[_pk]) f.postureVideos[_pk] = FT_DEFAULT_POSTURE_VIDEOS[_pk]; }
  for (var _tk in FT_DEFAULT_TRAIN_VIDEOS) { if (FT_DEFAULT_TRAIN_VIDEOS[_tk] && !f.trainVideos[_tk]) f.trainVideos[_tk] = FT_DEFAULT_TRAIN_VIDEOS[_tk]; }
  return f;
}

function ftLatestWeight(profile, weightLogs, todayStr) {
  weightLogs = weightLogs || {};
  profile = profile || {};
  if (profile.currentWeight != null) return { date: todayStr, weight: profile.currentWeight };
  var keys = Object.keys(weightLogs).filter(function (k) { return k <= (todayStr || "9999"); }).sort();
  if (!keys.length) return null;
  var k = keys[keys.length - 1];
  return { date: k, weight: weightLogs[k].weight };
}

function ftWeightProgress(profile, weightLogs, todayStr) {
  profile = profile || {}; weightLogs = weightLogs || {};
  var sw = profile.startWeight, tw = profile.targetWeight;
  var lw = ftLatestWeight(profile, weightLogs, todayStr);
  var cw = (lw ? lw.weight : profile.currentWeight);
  var total = (tw != null && sw != null) ? (tw - sw) : 0;
  var prog = (cw != null && sw != null) ? (cw - sw) : 0;
  var remaining = (cw != null && tw != null) ? (cw - tw) : null;
  var pct = 0;
  if (total !== 0) pct = (prog / total) * 100;
  else if (cw != null && tw != null && cw === tw) pct = 100;
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  return {
    startWeight: sw, currentWeight: cw, targetWeight: tw,
    totalDelta: total, progressDelta: prog, remaining: remaining,
    pct: Math.round(pct * 10) / 10
  };
}

function ftCountdown(profile, weightLogs, todayStr) {
  profile = profile || {}; weightLogs = weightLogs || {};
  var res = { hasTargetDate: false, daysLeft: null, targetDate: profile.targetDate || null, pacePerWeek: null, projectedDate: null, onTrack: null, avgWeekly: null };
  var lw = ftLatestWeight(profile, weightLogs, todayStr);
  var cw = (lw ? lw.weight : profile.currentWeight);
  var sw = profile.startWeight, tw = profile.targetWeight;
  if (profile.targetDate) {
    res.hasTargetDate = true;
    res.daysLeft = ftDaysBetween(todayStr, profile.targetDate);
  }
  if (sw != null && tw != null && cw != null) {
    var totalToLose = sw - tw;
    var lostSoFar = sw - cw;
    var elapsed = ftDaysBetween(profile.startWeightDate || todayStr, todayStr);
    if (elapsed > 0 && lostSoFar > 0) {
      var avgWeekly = lostSoFar / elapsed * 7;
      res.avgWeekly = Math.round(avgWeekly * 100) / 100;
      if (avgWeekly > 0) {
        var remainDays = totalToLose / avgWeekly * 7;
        res.projectedDate = ftAddDays(profile.startWeightDate || todayStr, Math.ceil(remainDays));
      }
    }
    if (res.daysLeft != null && res.daysLeft > 0 && totalToLose > 0) {
      res.pacePerWeek = Math.round((totalToLose / (res.daysLeft / 7)) * 100) / 100;
      if (res.avgWeekly != null) res.onTrack = res.avgWeekly >= res.pacePerWeek * 0.8;
    }
  }
  return res;
}

function ftMealKcalTarget(profile) {
  profile = profile || {};
  var info = ftDailyKcalTarget(profile);
  return info.target;
}

function ftRecommendMeals(profile, recipePool, dateStr) {
  profile = profile || {};
  recipePool = recipePool || [];
  var daily = ftMealKcalTarget(profile);
  var slots = { breakfast: daily * 0.25, lunch: daily * 0.35, dinner: daily * 0.30, snack: daily * 0.10 };
  var tagFilter = {
    balanced: ["减脂", "清淡", "低GI"],
    highProtein: ["高蛋白", "减脂"],
    lowCarb: ["低GI", "高蛋白"]
  }[profile.dietStyle] || ["减脂", "清淡"];
  var dislikes = (profile.dislikes || []).map(function (d) { return String(d).toLowerCase(); });
  var cand = recipePool.filter(function (r) {
    var okTags = (r.tags || []).some(function (t) { return tagFilter.indexOf(t) >= 0; });
    if (!okTags) return false;
    var name = (r.name || "").toLowerCase();
    var main = (r.main || "").toLowerCase();
    for (var i = 0; i < dislikes.length; i++) {
      if (dislikes[i] && (name.indexOf(dislikes[i]) >= 0 || main.indexOf(dislikes[i]) >= 0)) return false;
    }
    return true;
  });
  if (!cand.length) cand = recipePool.slice();
  function pick(slot, target) {
    if (!cand.length) return null;
    var scored = cand.map(function (r) { return { r: r, d: Math.abs((r.kcal || 0) - target) }; });
    scored.sort(function (a, b) { return a.d - b.d; });
    var K = Math.min(5, scored.length);
    var top = scored.slice(0, K);
    var idx = ftHash(dateStr + slot) % K;
    return top[idx].r;
  }
  var out = {};
  Object.keys(slots).forEach(function (s) { out[s] = pick(s, slots[s]); });
  var total = (out.breakfast && out.breakfast.kcal || 0) + (out.lunch && out.lunch.kcal || 0) + (out.dinner && out.dinner.kcal || 0) + (out.snack && out.snack.kcal || 0);
  return { breakfast: out.breakfast, lunch: out.lunch, dinner: out.dinner, snack: out.snack, totalKcal: total, dailyTarget: daily };
}

function ftIsPeriodDay(profile, dateStr) {
  var m = profile.menstrual;
  if (!m || !m.enabled) return false;
  var history = ftPeriodHistorySorted(m);
  if (!history.length) return false;
  var cycle = m.cycleDays || 28, pd = m.periodDays || 5;
  // 检查是否在任一历史经期窗口内
  for (var i = 0; i < history.length; i++) {
    var days = ftDaysBetween(history[i], dateStr);
    if (days >= 0 && days < pd) return true;
    // 也检查基于该历史日期推算的未来周期
    if (days > 0) {
      var cyclesLater = Math.floor(days / cycle);
      var dayInCycle = days % cycle;
      if (dayInCycle < pd) return true;
    }
  }
  return false;
}

// 经期历史记录排序（最新在前）
function ftPeriodHistorySorted(m) {
  if (!m) return [];
  var arr = (m.periodHistory || []).slice();
  // 向后兼容：老数据只有 lastPeriodDate，未进历史列表时补入
  if (m.lastPeriodDate && arr.indexOf(m.lastPeriodDate) === -1) arr.push(m.lastPeriodDate);
  return arr.sort().reverse();
}

// 预测下次月经日期
function ftPredictNextPeriod(m) {
  if (!m || !m.enabled) return null;
  var history = ftPeriodHistorySorted(m);
  if (!history.length) {
    if (m.lastPeriodDate) return { date: ftAddDays(m.lastPeriodDate, m.cycleDays || 28), source: "lastPeriod" };
    return null;
  }
  // 取最近一次作为基准
  var last = history[0];
  var cycle = m.cycleDays || 28;
  var next = ftAddDays(last, cycle);
  // 如果预测日已过，递推到未来
  var todayStr = (typeof today === "function") ? today() : new Date().toISOString().slice(0, 10);
  while (next < todayStr) {
    next = ftAddDays(next, cycle);
  }
  return { date: next, source: "predicted", baseDate: last, cycleDays: cycle };
}

// 当前处于经期的第几天（0 = 不在经期）
function ftPeriodDayNum(m, dateStr) {
  if (!m || !m.enabled) return 0;
  var history = ftPeriodHistorySorted(m);
  var cycle = m.cycleDays || 28, pd = m.periodDays || 5;
  for (var i = 0; i < history.length; i++) {
    var days = ftDaysBetween(history[i], dateStr);
    if (days >= 0 && days < pd) return days + 1;
    if (days > 0) {
      var dayInCycle = days % cycle;
      if (dayInCycle < pd) return dayInCycle + 1;
    }
  }
  return 0;
}

// 经期专属减脂饮食方案
function ftPeriodDietPlan(m, dateStr) {
  var dayNum = ftPeriodDayNum(m, dateStr);
  if (!dayNum) return null;
  var plans = [
    { phase: "经期第1天", focus: "补铁暖宫 · 温和饮食", advice: [
      "早餐：红枣桂圆小米粥 + 水煮蛋 + 全麦面包1片",
      "加餐：温热豆浆1杯 + 坚果5粒",
      "午餐：番茄牛肉面 + 清炒菠菜",
      "下午茶：红糖姜茶1杯",
      "晚餐：蒸南瓜 + 清蒸鲈鱼 + 蒜蓉西兰花"
    ], tips: "忌生冷寒凉，多喝温热水，铁质补充为主", kcalAdjust: -100 },
    { phase: "经期第2天", focus: "补铁活血 · 易消化", advice: [
      "早餐：皮蛋瘦肉粥 + 鸡蛋羹",
      "加餐：酸奶1杯(无糖)",
      "午餐：猪肝菠菜汤 + 杂粮饭 + 清炒时蔬",
      "下午茶：红枣枸杞茶",
      "晚餐：番茄豆腐汤 + 蒸红薯 + 虾仁蒸蛋"
    ], tips: "量多时少动多休息，避免剧烈运动，可泡脚暖宫", kcalAdjust: -150 },
    { phase: "经期第3天", focus: "温和恢复 · 营养均衡", advice: [
      "早餐：燕麦牛奶 + 香蕉 + 鸡蛋1个",
      "加餐：苹果1个",
      "午餐：青椒肉丝 + 糙米饭 + 紫菜蛋花汤",
      "下午茶：黑糖姜茶",
      "晚餐：鸡胸肉沙拉 + 玉米半根 + 菌菇汤"
    ], tips: "可恢复轻度运动(八段锦/散步)，逐步恢复饮食", kcalAdjust: -50 },
    { phase: "经期第4天", focus: "恢复期 · 逐步正常", advice: [
      "早餐：全麦三明治 + 牛奶 + 蓝莓",
      "加餐：坚果一小把",
      "午餐：三杯鸡 + 杂粮饭 + 清炒空心菜",
      "下午茶：酸奶1杯",
      "晚餐：清蒸虾 + 蒸南瓜 + 凉拌木耳"
    ], tips: "量减少，可恢复中等强度运动，注意保暖", kcalAdjust: 0 },
    { phase: "经期第5天", focus: "收尾期 · 正常减脂", advice: [
      "早餐：鸡蛋牛油果三明治 + 豆浆",
      "加餐：香蕉1根",
      "午餐：番茄炒蛋 + 鸡胸肉 + 糙米饭",
      "下午茶：无糖酸奶",
      "晚餐：清炒西兰花 + 蒸鱼 + 红薯"
    ], tips: "经期接近结束，可恢复正常训练计划", kcalAdjust: 0 }
  ];
  var idx = Math.min(dayNum - 1, plans.length - 1);
  return plans[idx];
}

// 经期阶段判断（ follicular=卵泡期, ovulation=排卵期, luteal=黄体期, menstrual=经期 ）
function ftCyclePhase(m, dateStr) {
  if (!m || !m.enabled) return null;
  var dayNum = ftPeriodDayNum(m, dateStr);
  if (dayNum) return { phase: "menstrual", name: "经期", day: dayNum, icon: "🌸" };
  var history = ftPeriodHistorySorted(m);
  if (!history.length) return null;
  var cycle = m.cycleDays || 28, pd = m.periodDays || 5;
  var last = history[0];
  var days = ftDaysBetween(last, dateStr);
  if (days < 0) return null;
  var dayInCycle = days % cycle;
  if (dayInCycle < pd) return { phase: "menstrual", name: "经期", day: dayInCycle + 1, icon: "🌸" };
  if (dayInCycle < 14) return { phase: "follicular", name: "卵泡期", day: dayInCycle - pd + 1, icon: "🌱" };
  if (dayInCycle < 17) return { phase: "ovulation", name: "排卵期", day: dayInCycle - 14 + 1, icon: "🥚" };
  return { phase: "luteal", name: "黄体期", day: dayInCycle - 17 + 1, icon: "🍂" };
}

function ftWeekPlan(profile, todayStr) {
  profile = profile || {};
  var p = String(todayStr).split("-");
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var dow = (d.getUTCDay() + 6) % 7;
  var monday = ftAddDays(todayStr, -dow);
  var out = [];
  for (var i = 0; i < 7; i++) {
    var date = ftAddDays(monday, i);
    var typeId = FT_WEEK_TEMPLATE[i];
    var isPeriod = ftIsPeriodDay(profile, date);
    if (isPeriod && typeId !== "rest") typeId = "menstrual";
    var t = FT_TRAIN_TYPES[typeId];
    out.push({ date: date, dow: i + 1, dowName: FT_WEEKDAYS[i], typeId: typeId, typeName: t.name, icon: t.icon, isPeriod: isPeriod, routine: t.routine });
  }
  return out;
}

function ftRoutineForType(typeId) {
  return (FT_TRAIN_TYPES[typeId] && FT_TRAIN_TYPES[typeId].routine) || [];
}

function ftPostureById(id) {
  for (var i = 0; i < FT_POSTURE_ISSUES.length; i++) if (FT_POSTURE_ISSUES[i].id === id) return FT_POSTURE_ISSUES[i];
  return null;
}

function ftParseWeight(v) {
  var n = parseFloat(v);
  return isNaN(n) ? null : Math.round(n * 10) / 10;
}

function fmtWeight(v) { return (v == null) ? "—" : (Math.round(v * 10) / 10); }

// ============================================================
// 数据存取（浏览器侧，依赖 app.js 全局 DB）
// ============================================================
function ftGet() {
  var g = DB.data.growth;
  if (!g.fitness) g.fitness = ftDefault();
  return ftEnsureDefault(g.fitness);
}

function ftHomeCount() {
  try {
    var f = ftGet();
    var t = (typeof today === "function") ? today() : "2026-01-01";
    var n = (f.dietLogs[t] || []).length;
    var td = f.trainDone[t] || {};
    n += Object.keys(td).length;
    return n;
  } catch (e) { return 0; }
}

// ============================================================
// 渲染（依赖 app.js 全局：document/escapeHtml/formatDateShort/showModal/
//        showToast/closeModal/compressImage/uid/DB/RECIPE_DB/recipeById/render）
// ============================================================
// 运动记录区：合并「运动」模块（复用 sport.js 纯函数），作为健身页顶部区块
function ftSportBlockHtml() {
  if (typeof spGet !== "function") return "";
  var sp = spGet();
  var rec = (sp.logs || {})[today()];
  var wk = spWeekSummary(sp, today());
  var st = spStats(sp);
  var typeChips = '<div class="sp-chips">' + SPORT_TYPES.map(function (t) {
    var sel = (rec && rec.type === t) || (!rec && (__spType || sp.preset) === t);
    return '<div class="sp-chip' + (sel ? " on" : "") + '" onclick="spPickType(\'' + t + '\')">' + t + '</div>';
  }).join("") + '</div>';
  var form = rec
    ? '<div class="card"><div class="card-h">✅ 今日已记录</div>' +
      '<div class="sp-recv">' + escapeHtml(rec.type || "") + ' · ' + (rec.durationMin || 0) + ' 分钟' + (rec.kcal ? ' · ' + rec.kcal + ' 千卡' : '') + (rec.note ? '<div class="sp-note">' + escapeHtml(rec.note) + '</div>' : '') + '</div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn btn-secondary" style="flex:1" onclick="__spType=null;render()">✏️ 重新记录</button><button class="btn btn-secondary" style="flex:1;color:var(--accent-red)" onclick="spDeleteToday()">🗑 删除</button></div></div>'
    : '<div class="card"><div class="card-h">🏃 记录今日运动（计入每日打卡）</div>' +
      typeChips +
      '<input id="sp-min" class="form-input" type="number" placeholder="运动时长（分钟）" min="1" style="margin-top:10px">' +
      '<input id="sp-kcal" class="form-input" type="number" placeholder="消耗（千卡，可选）" min="0" style="margin-top:10px">' +
      '<input id="sp-note" class="form-input" placeholder="备注（可选）" style="margin-top:10px">' +
      '<button class="btn btn-primary" style="width:100%;margin-top:12px;justify-content:center" onclick="spSaveToday()">保存记录</button></div>';
  var weekHtml = '<div class="card"><div class="card-h">📊 本周运动汇总 <span class="sp-sub">' + formatDateShort(wk.monday) + ' ~ ' + formatDateShort(wk.sunday) + '</span></div>' +
    '<div class="sp-stat-row">' +
      '<div class="sp-stat"><div class="sp-stat-v">' + wk.days + '</div><div class="sp-stat-l">运动天数</div></div>' +
      '<div class="sp-stat"><div class="sp-stat-v">' + wk.totalMin + '</div><div class="sp-stat-l">总时长(分)</div></div>' +
      '<div class="sp-stat"><div class="sp-stat-v">' + wk.totalKcal + '</div><div class="sp-stat-l">消耗(千卡)</div></div>' +
      '<div class="sp-stat"><div class="sp-stat-v">' + escapeHtml(wk.topType) + '</div><div class="sp-stat-l">主力类型</div></div>' +
    '</div></div>';
  var dates = Object.keys(sp.logs || {}).sort().reverse();
  var hist = dates.length ? dates.map(function (d) {
    var r = sp.logs[d];
    return '<div class="sp-hist-item"><div class="sp-hist-d">' + formatDateShort(d) + '</div>' +
      '<div class="sp-hist-m">' + escapeHtml(r.type || "") + ' · ' + (r.durationMin || 0) + ' 分钟' + (r.kcal ? ' · ' + r.kcal + ' 千卡' : '') + '</div>' +
      '<button class="sp-hist-del" onclick="spRemoveDay(\'' + d + '\')">✕</button></div>';
  }).join("") : '<div class="empty-state" style="padding:16px 0"><div class="empty-icon">🏃</div><div class="empty-text">还没有运动记录<br>从今天开始，每天动一动！</div></div>';
  var histHtml = '<div class="card"><div class="card-h">📜 历史记录 <span class="sp-sub">共 ' + st.totalDays + ' 天 · ' + st.totalMin + ' 分钟</span></div>' + hist + '</div>';
  return '<div class="ft-sport-block"><div class="enm-hint" style="margin-bottom:6px">🏃 运动记录（每日打卡条件之一）· 累计 ' + st.totalDays + ' 天 · 连续 ' + st.streak + ' 天 · 共 ' + st.totalMin + ' 分钟 / ' + st.totalKcal + ' 千卡</div>' + form + weekHtml + histHtml + '</div>';
}

function renderFitness() {
  var c = document.getElementById("app-content");
  if (!c) return;
  var tab = window.__ftTab || "weight";
  var f = ftGet();
  var tabs = [["weight", "⚖️ 体重"], ["diet", "🍽 饮食"], ["plan", "🏋️ 训练"], ["period", "🌸 经期"], ["posture", "🧘 体态"]];
  var tabHtml = '<div class="ft-tabs">' + tabs.map(function (t) {
    return '<div class="ft-tab' + (tab === t[0] ? " on" : "") + '" onclick="__ftTab=\'' + t[0] + '\';render()">' + t[1] + '</div>';
  }).join("") + '</div>';
  var sportBlock = (typeof ftSportBlockHtml === "function") ? ftSportBlockHtml() : "";
  var body = "";
  if (tab === "weight") body = renderFitnessWeightInner();
  else if (tab === "diet") body = renderFitnessDietInner();
  else if (tab === "plan") body = renderFitnessPlanInner();
  else if (tab === "period") body = renderFitnessPeriodInner();
  else body = renderFitnessPostureInner();
  c.innerHTML = sportBlock + tabHtml + body;
}

function renderFitnessWeightInner() {
  var f = ftGet();
  var p = f.profile;
  var prog = ftWeightProgress(p, f.weightLogs, today());
  var cd = ftCountdown(p, f.weightLogs, today());
  var hasProfile = (p.startWeight != null && p.targetWeight != null);
  var lw = ftLatestWeight(p, f.weightLogs, today());
  var barPct = prog.pct;
  var photoThumb = window.__ftWeightPhoto ? '<div class="ft-thumb-inline" onclick="ftViewPhoto(\'' + window.__ftWeightPhoto + '\')">📷 已拍照 ✕</div>' : "";

  var weightCard = '<div class="card"><div class="card-h">⚖️ 体重目标进度</div>' +
    (hasProfile ?
      '<div class="ft-prog-num">' + fmtWeight(prog.currentWeight) + ' <span class="ft-unit">kg</span> <span class="ft-arrow">→</span> ' + fmtWeight(prog.targetWeight) + ' <span class="ft-unit">kg</span></div>' +
      '<div class="ft-bar"><div class="ft-bar-fill" style="width:' + barPct + '%"></div></div>' +
      '<div class="ft-prog-sub">已减 ' + fmtWeight(Math.abs(prog.progressDelta)) + ' kg · 距目标还差 ' + fmtWeight(Math.abs(prog.remaining)) + ' kg · 完成度 ' + barPct + '%</div>'
      : '<div class="empty-state"><div class="empty-text">还没设置目标，先去设置吧</div><button class="btn btn-primary" style="margin-top:10px" onclick="ftOpenProfile()">设置目标</button></div>') +
    '</div>';

  var cdCard = '<div class="card"><div class="card-h">⏳ 打卡倒计时</div>' +
    (cd.hasTargetDate ?
      '<div class="ft-count">' + (cd.daysLeft >= 0 ? ('距目标日 ' + escapeHtml(cd.targetDate) + ' 还有 <b>' + cd.daysLeft + '</b> 天') : ('目标日已过 ' + Math.abs(cd.daysLeft) + ' 天')) + '</div>'
      : '<div class="ft-sub">未设目标日，去设置里填上</div>') +
    (cd.pacePerWeek != null ? '<div class="ft-sub">建议每周减 ' + cd.pacePerWeek + ' kg 才能按时达成</div>' : '') +
    (cd.avgWeekly != null ? '<div class="ft-sub">目前平均每周减 ' + cd.avgWeekly + ' kg · ' + (cd.onTrack ? '进度达标 ✅' : '偏慢，加油 💪') + '</div>' : '') +
    (cd.projectedDate ? '<div class="ft-sub">按当前速度预计 ' + escapeHtml(cd.projectedDate) + ' 达成</div>' : '') +
    '</div>';

  var saveCard = '<div class="card"><div class="card-h">📝 记录今日体重</div>' +
    '<input id="ft-weight" class="form-input" type="number" step="0.1" placeholder="今日体重 (kg)" value="' + fmtWeight(lw ? lw.weight : "") + '">' +
    '<input id="ft-weight-note" class="form-input" placeholder="备注（可选）" style="margin-top:10px">' +
    '<div id="ft-weight-photo">' + photoThumb + '</div>' +
    '<div class="btn-row" style="margin-top:10px">' +
    '<label class="btn btn-secondary" style="flex:1;justify-content:center">📷 拍照<input type="file" accept="image/*" style="display:none" onchange="ftHandleWeightPhoto(this)"></label>' +
    '<button class="btn btn-primary" style="flex:1;justify-content:center" onclick="ftSaveWeight()">保存</button>' +
    '</div></div>';

  var keys = Object.keys(f.weightLogs).sort().reverse();
  // 如果有起始日期，只显示起始日期之后的记录
  if (p.startWeightDate) keys = keys.filter(function (k) { return k >= p.startWeightDate; });
  var list = keys.length ? keys.map(function (k) {
    var w = f.weightLogs[k];
    var delta = "";
    // 计算与上一条记录的差值
    var idx = keys.indexOf(k);
    if (idx < keys.length - 1) {
      var prevK = keys[idx + 1];
      var prevW = f.weightLogs[prevK];
      if (prevW && prevW.weight != null) {
        var d = Math.round((w.weight - prevW.weight) * 10) / 10;
        delta = d > 0 ? '<span style="color:#e74c3c"> +' + d + '</span>' : (d < 0 ? '<span style="color:#27ae60"> ' + d + '</span>' : '<span style="color:#999"> 0</span>');
      }
    } else if (p.startWeight != null) {
      var d0 = Math.round((w.weight - p.startWeight) * 10) / 10;
      delta = d0 > 0 ? '<span style="color:#e74c3c"> +' + d0 + '</span>' : (d0 < 0 ? '<span style="color:#27ae60"> ' + d0 + '</span>' : '<span style="color:#999"> 0</span>');
    }
    return '<div class="ft-wrow"><div>' + formatDateShort(k) + '</div><div>' + fmtWeight(w.weight) + ' kg</div><div class="ft-wdelta">' + delta + '</div>' +
      (w.note ? '<div class="ft-wnote">' + escapeHtml(w.note) + '</div>' : '<div></div>') +
      (w.photo ? '<div class="ft-thumb" onclick="ftViewPhoto(\'' + w.photo + '\')">📷</div>' : '<div></div>') +
      '<button class="sp-hist-del" onclick="ftDelWeight(\'' + k + '\')">✕</button></div>';
  }).join("") : '<div class="empty-state">还没有体重记录，先记录今日体重吧</div>';

  var totalRecords = keys.length;
  return weightCard + cdCard + saveCard + '<div class="card"><div class="card-h">📜 体重档案 <span class="sp-sub">共 ' + totalRecords + ' 条 · 最新置顶</span></div>' + list + '</div>' +
    '<div class="btn-row" style="margin-top:8px"><button class="btn btn-secondary" style="flex:1" onclick="ftOpenProfile()">⚙️ 减脂档案设置</button></div>';
}

function renderFitnessDietInner() {
  var f = ftGet();
  var p = f.profile;
  var pool = (typeof RECIPE_DB !== "undefined") ? RECIPE_DB : [];
  var rec = ftRecommendMeals(p, pool, today());
  var todayLog = f.dietLogs[today()] || [];
  var kcalInfo = ftDailyKcalTarget(p);
  var todayKcal = todayLog.reduce(function (s, x) { return s + (x.kcal || 0); }, 0);
  var kcalRemain = kcalInfo.target - todayKcal;
  // 经期热量调整
  var periodDiet = p.menstrual.enabled ? ftPeriodDietPlan(p.menstrual, today()) : null;
  if (periodDiet && periodDiet.kcalAdjust) {
    kcalRemain += periodDiet.kcalAdjust;
  }

  // 热量概览卡片
  var kcalCard = '<div class="card"><div class="card-h">🔥 每日热量目标</div>' +
    '<div class="ft-kcal-grid">' +
      '<div class="ft-kcal-item"><div class="ft-kcal-v">' + kcalInfo.bmr + '</div><div class="ft-kcal-l">基础代谢</div></div>' +
      '<div class="ft-kcal-item"><div class="ft-kcal-v">' + kcalInfo.tdee + '</div><div class="ft-kcal-l">日常消耗</div></div>' +
      '<div class="ft-kcal-item"><div class="ft-kcal-v" style="color:var(--accent,#ff5a8a)">' + kcalInfo.target + '</div><div class="ft-kcal-l">减脂目标</div></div>' +
    '</div>' +
    '<div class="ft-kcal-bar">' +
      '<div class="ft-kcal-bar-info">今日已摄入 <b>' + todayKcal + '</b> kcal · ' + (kcalRemain >= 0 ? '还可吃 <b style="color:#27ae60">' + kcalRemain + '</b> kcal' : '已超 <b style="color:#e74c3c">' + Math.abs(kcalRemain) + '</b> kcal') + '</div>' +
      '<div class="ft-bar"><div class="ft-bar-fill" style="width:' + Math.min(100, Math.round(todayKcal / kcalInfo.target * 100)) + '%;background:' + (todayKcal > kcalInfo.target ? 'linear-gradient(90deg,#ff6b6b,#ee5a24)' : 'linear-gradient(90deg,#ff8fab,#ff5a8a)') + '"></div></div>' +
    '</div>' +
    (periodDiet ? '<div class="ft-sub" style="margin-top:6px;color:var(--accent,#ff5a8a)">🌸 经期专属方案已启用 · ' + periodDiet.phase + (periodDiet.kcalAdjust ? ' · 热量调整 ' + (periodDiet.kcalAdjust > 0 ? '+' : '') + periodDiet.kcalAdjust + ' kcal' : '') + '</div>' : '') +
    '<div class="ft-sub" style="margin-top:4px">公式：Mifflin-St Jeor · ' + (p.gender === "male" ? "男性" : "女性") + ' · 身高' + (p.heightCm || "—") + 'cm · 体重' + fmtWeight(p.currentWeight || p.startWeight) + 'kg' + (p.age ? ' · 年龄' + p.age : '') + '</div>' +
    '</div>';

  var mealCards = FT_MEALS.map(function (m) {
    var items = todayLog.filter(function (x) { return x.meal === m; });
    var mealKcal = items.reduce(function (s, x) { return s + (x.kcal || 0); }, 0);
    var itemsHtml = items.length ? items.map(function (x) {
      return '<div class="ft-drow"><div class="ft-dinfo"><div>' + escapeHtml(x.name) + (x.kcal ? ' · ' + x.kcal + 'kcal' : '') + '</div>' +
        (x.note ? '<div class="ft-sub">' + escapeHtml(x.note) + '</div>' : '') +
        (x.recipeId ? '<div class="ft-sub">🍳 来自菜谱</div>' : '') + '</div>' +
        (x.photo ? '<div class="ft-thumb" onclick="ftViewPhoto(\'' + x.photo + '\')">📷</div>' : '<div></div>') +
        '<button class="sp-hist-del" onclick="ftDelDiet(\'' + x.id + '\')">✕</button></div>';
    }).join("") : '<div class="ft-sub">还没记录</div>';
    var r = rec[m];
    var recHtml = r ? ('<div class="ft-rec">💡 推荐：' + escapeHtml(r.name) + ' · ' + r.kcal + 'kcal <button class="btn btn-mini" onclick="ftAddRecMeal(\'' + m + '\',\'' + r.id + '\')">记这笔</button></div>') : '';
    var pend = window.__ftDietPhoto && window.__ftDietPhoto[m] ? '📷✓' : '📷';
    return '<div class="card"><div class="card-h">' + FT_MEAL_NAMES[m] + (mealKcal ? ' <span class="sp-sub">' + mealKcal + ' kcal</span>' : '') + '</div>' + itemsHtml + recHtml +
      '<div class="ft-addrow">' +
      '<input id="ft-diet-name-' + m + '" class="form-input" placeholder="吃了什么">' +
      '<input id="ft-diet-kcal-' + m + '" class="form-input" type="number" placeholder="热量" style="width:84px">' +
      '<button class="btn btn-secondary btn-mini" onclick="ftDietPhotoPick(\'' + m + '\')">' + pend + '</button>' +
      '<button class="btn btn-primary btn-mini" onclick="ftAddDiet(\'' + m + '\')">+</button></div>' +
      '<input type="file" accept="image/*" id="ft-diet-file-' + m + '" style="display:none" onchange="ftDietPhotoChange(this,\'' + m + '\')">' +
      '</div>';
  }).join("");
  var recTotal = rec.totalKcal ? ('<div class="ft-sub">推荐三餐合计约 ' + rec.totalKcal + ' kcal（每日目标 ' + rec.dailyTarget + ' kcal）</div>') : '';
  var header = '<div class="card"><div class="card-h">🤖 每日智能推荐 & 食物库</div>' + recTotal +
    '<div class="ft-sub">根据体重、目标与喜好，从菜谱库为你搭配。点「记这笔」直接记入今日饮食。</div>' +
    '<div class="btn-row" style="margin-top:8px">' +
    '<button class="btn btn-secondary" style="flex:1;justify-content:center" onclick="ftOpenRecipePicker()">🍳 菜谱库</button>' +
    '<button class="btn btn-secondary" style="flex:1;justify-content:center" onclick="ftOpenFoodSearch(\'lunch\')">🔍 卡路里库</button>' +
    '</div></div>';
  return kcalCard + header + mealCards;
}

function renderFitnessPlanInner() {
  var f = ftGet();
  var plan = ftWeekPlan(f.profile, today());
  var done = f.trainDone || {};
  var todayStr = today();
  var cards = plan.map(function (d) {
    var isToday = d.date === todayStr;
    var doneTypes = done[d.date] || {};
    var on = doneTypes[d.typeId];
    return '<div class="ft-plan-day' + (isToday ? ' today' : '') + (d.isPeriod ? ' period' : '') + '">' +
      '<div class="ft-plan-dow">' + d.dowName + (isToday ? ' · 今天' : '') + (d.isPeriod ? ' 🌸' : '') + '</div>' +
      '<div class="ft-plan-type">' + d.icon + ' ' + d.typeName + '</div>' +
      '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn btn-primary btn-mini" onclick="ftStartFollow(\'' + d.typeId + '\',\'train\')">开始跟练</button>' +
      '<button class="btn btn-mini ' + (on ? 'btn-on' : 'btn-secondary') + '" onclick="ftMarkTrainDone(\'' + d.date + '\',\'' + d.typeId + '\')">' + (on ? '✅已完成' : '打卡') + '</button>' +
      '</div></div>';
  }).join("");
  return '<div class="card"><div class="card-h">🗓 本周训练计划</div><div class="ft-sub">肩背 / 有氧 / 臀腿 / 腹部循环；开启经期后自动切换为舒缓方案。</div>' +
    '<div class="ft-week-grid">' + cards + '</div></div>';
}

function renderFitnessPostureInner() {
  var grid = FT_POSTURE_ISSUES.map(function (iss) {
    return '<div class="ft-posture-card" onclick="ftStartFollow(\'' + iss.id + '\',\'posture\')">' +
      '<div class="ft-posture-icon">' + iss.icon + '</div>' +
      '<div class="ft-posture-name">' + escapeHtml(iss.name) + '</div>' +
      '<div class="ft-posture-desc">' + escapeHtml(iss.desc) + '</div>' +
      '<div class="ft-posture-go">点这里直接跟练 ▶</div></div>';
  }).join("");
  return '<div class="card"><div class="card-h">🧘 体态跟练</div><div class="ft-sub">哪里不完美，直接点开跟着练，不用自己搜视频。</div>' +
    '<div class="ft-posture-grid">' + grid + '</div></div>';
}

// ============================================================
// 经期周期管理页面
// ============================================================
function renderFitnessPeriodInner() {
  var f = ftGet();
  var m = f.profile.menstrual;
  var todayStr = today();

  // 未开启经期管理
  if (!m.enabled) {
    return '<div class="card"><div class="card-h">🌸 经期周期管理</div>' +
      '<div class="empty-state"><div class="empty-icon">🌸</div><div class="empty-text">经期管理未开启<br>开启后可自动预测下次月经、获得经期专属减脂饮食方案</div>' +
      '<button class="btn btn-primary" style="margin-top:12px" onclick="ftOpenProfile()">去设置中开启</button></div></div>';
  }

  var phase = ftCyclePhase(m, todayStr);
  var pred = ftPredictNextPeriod(m);
  var dayNum = ftPeriodDayNum(m, todayStr);
  var dietPlan = ftPeriodDietPlan(m, todayStr);

  // 当前状态卡片
  var phaseCard = phase ? '<div class="card"><div class="card-h">' + phase.icon + ' 当前周期状态</div>' +
    '<div class="ft-phase-box">' +
      '<div class="ft-phase-name">' + phase.icon + ' ' + phase.name + '</div>' +
      (phase.phase === "menstrual" ? '<div class="ft-phase-day">第 ' + phase.day + ' 天</div>' : '<div class="ft-phase-day">第 ' + phase.day + ' 天</div>') +
      '<div class="ft-phase-tip">' +
        (phase.phase === "menstrual" ? "经期注意保暖、补铁、忌生冷，避免高强度运动" :
         phase.phase === "follicular" ? "卵泡期代谢提升，适合加强训练，可适当增加蛋白质" :
         phase.phase === "ovulation" ? "排卵期雌激素高峰，运动表现佳，适合力量训练" :
         "黄体期易水肿食欲增加，控制碳水，多做有氧") +
      '</div>' +
    '</div></div>' : '<div class="card"><div class="ft-sub">暂无法计算周期阶段，请先添加经期记录</div></div>';

  // 预测下次月经
  var predCard = pred ? '<div class="card"><div class="card-h">📅 下次月经预测</div>' +
    '<div class="ft-pred-box">' +
      '<div class="ft-pred-date">' + pred.date + '</div>' +
      '<div class="ft-pred-days">距下次月经还有 <b>' + ftDaysBetween(todayStr, pred.date) + '</b> 天</div>' +
      '<div class="ft-sub">基于周期 ' + (pred.cycleDays || m.cycleDays) + ' 天推算 · 实际可能提前或延后 1-3 天</div>' +
    '</div></div>' : '<div class="card"><div class="ft-sub">添加经期历史记录后可自动预测</div></div>';

  // 经期专属饮食方案
  var dietCard = dietPlan ? '<div class="card"><div class="card-h">🍽 经期专属减脂饮食 · ' + dietPlan.phase + '</div>' +
    '<div class="ft-period-focus">🎯 ' + dietPlan.focus + '</div>' +
    '<div class="ft-period-meals">' +
      dietPlan.advice.map(function (a) { return '<div class="ft-period-meal">' + escapeHtml(a) + '</div>'; }).join("") +
    '</div>' +
    '<div class="ft-period-tips">💡 ' + escapeHtml(dietPlan.tips) + '</div>' +
    (dietPlan.kcalAdjust ? '<div class="ft-sub" style="margin-top:6px">⚠️ 今日热量目标调整：' + (dietPlan.kcalAdjust > 0 ? '+' : '') + dietPlan.kcalAdjust + ' kcal</div>' : '') +
    '</div>' : '';

  // 经期历史记录
  var history = ftPeriodHistorySorted(m);
  var histHtml = history.length ? history.map(function (d, i) {
    var next = i < history.length - 1 ? history[i + 1] : null;
    var gap = next ? ftDaysBetween(d, next) : null;
    return '<div class="ft-period-row">' +
      '<div class="ft-period-date">' + d + '</div>' +
      (gap ? '<div class="ft-period-gap">间隔 ' + gap + ' 天</div>' : '<div class="ft-period-gap">最早记录</div>') +
      '<button class="sp-hist-del" onclick="ftDelPeriod(\'' + d + '\')">✕</button></div>';
  }).join("") : '<div class="empty-state" style="padding:16px 0"><div class="empty-text">还没有经期记录<br>添加后可自动预测下次月经日期</div></div>';

  var addCard = '<div class="card"><div class="card-h">📝 添加经期记录</div>' +
    '<input id="ft-period-date" class="form-input" type="date" value="' + todayStr + '">' +
    '<button class="btn btn-primary" style="width:100%;margin-top:10px;justify-content:center" onclick="ftAddPeriod()">添加本次经期首日</button></div>';

  var histCard = '<div class="card"><div class="card-h">📜 经期历史记录 <span class="sp-sub">共 ' + history.length + ' 条</span></div>' + histHtml + '</div>';

  // 周期设置
  var settingCard = '<div class="card"><div class="card-h">⚙️ 周期参数</div>' +
    '<div class="ft-sub">生理周期：' + (m.cycleDays || 28) + ' 天 · 经期天数：' + (m.periodDays || 5) + ' 天</div>' +
    '<button class="btn btn-secondary" style="width:100%;margin-top:8px;justify-content:center" onclick="ftOpenProfile()">修改周期设置</button></div>';

  return phaseCard + predCard + dietCard + addCard + histCard + settingCard;
}

// ============================================================
// 经期记录管理
// ============================================================
function ftAddPeriod() {
  var f = ftGet();
  var m = f.profile.menstrual;
  var d = document.getElementById("ft-period-date").value;
  if (!d) { if (typeof showToast === "function") showToast("请选择日期", "warn"); return; }
  if (!m.periodHistory) m.periodHistory = [];
  if (m.periodHistory.indexOf(d) >= 0) { if (typeof showToast === "function") showToast("该日期已存在", "warn"); return; }
  m.periodHistory.push(d);
  m.periodHistory.sort();
  m.lastPeriodDate = m.periodHistory[m.periodHistory.length - 1];
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("fitness", "添加经期记录：" + d);
  render();
  if (typeof showToast === "function") showToast("经期记录已添加", "success");
}

function ftDelPeriod(d) {
  var f = ftGet();
  var m = f.profile.menstrual;
  m.periodHistory = (m.periodHistory || []).filter(function (x) { return x !== d; });
  if (m.periodHistory.length) m.lastPeriodDate = m.periodHistory[m.periodHistory.length - 1];
  DB.save();
  render();
  if (typeof showToast === "function") showToast("已删除经期记录", "success");
}

// ============================================================
// 食物卡路里搜索
// ============================================================
function ftOpenFoodSearch(meal) {
  window.__ftFoodMeal = meal;
  var catTabs = FT_FOOD_CATS.map(function (c, i) {
    return '<div class="ft-food-cat' + (i === 0 ? ' on' : '') + '" onclick="ftFoodFilterCat(this,\'' + c + '\')">' + c + '</div>';
  }).join("");
  var list = ftFoodListHtml("all");
  var html = '<div class="modal-title">🔍 食物卡路里库</div>' +
    '<input id="ft-food-q" class="form-input" placeholder="搜索食物名称" oninput="ftFoodSearch()">' +
    '<div class="ft-food-cats">' + catTabs + '</div>' +
    '<div class="ft-food-list" id="ft-food-list">' + list + '</div>' +
    '<div class="btn-row" style="margin-top:10px"><button class="btn btn-primary" style="flex:1" onclick="closeModal()">关闭</button></div>';
  showModal(html);
}

function ftFoodListHtml(cat) {
  var q = (document.getElementById("ft-food-q") && document.getElementById("ft-food-q").value || "").toLowerCase();
  var items = FT_FOOD_DB.filter(function (f) {
    var okCat = (cat === "all" || f.cat === cat);
    var okQ = !q || (f.name || "").toLowerCase().indexOf(q) >= 0;
    return okCat && okQ;
  });
  if (!items.length) return '<div class="ft-sub" style="padding:16px 0;text-align:center">没有匹配的食物</div>';
  return items.map(function (f) {
    return '<div class="ft-food-item" onclick="ftPickFood(\'' + f.id + '\')">' +
      '<div class="ft-food-name">' + escapeHtml(f.name) + '</div>' +
      '<div class="ft-food-meta"><span class="ft-food-cat-tag">' + f.cat + '</span> · ' + f.kcal + ' kcal / ' + escapeHtml(f.unit) + '</div>' +
      '<div class="ft-food-go">+</div></div>';
  }).join("");
}

function ftFoodFilterCat(el, cat) {
  var all = document.querySelectorAll(".ft-food-cat");
  all.forEach(function (e) { e.classList.remove("on"); });
  el.classList.add("on");
  var list = document.getElementById("ft-food-list");
  if (list) list.innerHTML = ftFoodListHtml(cat);
}

function ftFoodSearch() {
  var activeCat = document.querySelector(".ft-food-cat.on");
  var cat = activeCat ? activeCat.textContent : "all";
  var list = document.getElementById("ft-food-list");
  if (list) list.innerHTML = ftFoodListHtml(cat);
}

function ftPickFood(fid) {
  var food = FT_FOOD_DB.filter(function (f) { return f.id === fid; })[0];
  if (!food) return;
  var meal = window.__ftFoodMeal || "lunch";
  var f = ftGet();
  if (!f.dietLogs[today()]) f.dietLogs[today()] = [];
  f.dietLogs[today()].push({ id: (typeof uid === "function" ? uid() : String(Math.random())), meal: meal, name: food.name + " (" + food.unit + ")", kcal: food.kcal, photo: null, recipeId: null, note: "" });
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("fitness", "记录饮食：" + food.name);
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已添加 " + food.name + " · " + food.kcal + " kcal", "success");
}

// 根据身高体重自动计算每日推荐摄入热量（Mifflin-St Jeor 公式）
function ftBMR(profile) {
  profile = profile || {};
  var w = profile.currentWeight || profile.startWeight || 60;
  var h = profile.heightCm || 165;
  var age = profile.age || 25;
  var bmr;
  if (profile.gender === "male") bmr = 10 * w + 6.25 * h - 5 * age + 5;
  else bmr = 10 * w + 6.25 * h - 5 * age - 161;
  return Math.round(bmr);
}

function ftDailyKcalTarget(profile) {
  profile = profile || {};
  var bmr = ftBMR(profile);
  var workModeFactor = profile.workMode === "home" ? 1.3 : 1.45;
  var tdee = Math.round(bmr * workModeFactor);
  var deficit = 400; // 减脂缺口
  var target = tdee - deficit;
  if (target < 1200) target = 1200;
  if (target > 2600) target = 2600;
  return { bmr: bmr, tdee: tdee, target: target };
}

// ============================================================
// 交互处理
// ============================================================
function ftViewPhoto(b64) {
  showModal('<div class="modal-title">📷 照片</div><img src="' + b64 + '" style="width:100%;border-radius:10px;margin-top:8px"><div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" style="flex:1" onclick="closeModal()">关闭</button></div>');
}

async function ftHandleWeightPhoto(input) {
  var file = input.files && input.files[0]; if (!file) return;
  try {
    var b64 = await compressImage(file);
    window.__ftWeightPhoto = b64;
    var box = document.getElementById("ft-weight-photo");
    if (box) box.innerHTML = '<div class="ft-thumb-inline" onclick="ftViewPhoto(\'' + b64 + '\')">📷 已拍照 ✕</div>';
    if (typeof showToast === "function") showToast("照片已添加", "success");
  } catch (e) { if (typeof showToast === "function") showToast("照片处理失败", "error"); }
}

function ftSaveWeight() {
  var f = ftGet();
  var v = ftParseWeight(document.getElementById("ft-weight").value);
  if (v == null) { if (typeof showToast === "function") showToast("请输入体重", "warn"); return; }
  var note = (document.getElementById("ft-weight-note").value || "").trim();
  var t = today();
  f.weightLogs[t] = { weight: v, note: note, photo: window.__ftWeightPhoto || null };
  if (f.profile.currentWeight == null) f.profile.currentWeight = v;
  window.__ftWeightPhoto = null;
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("fitness", "记录体重 " + v + "kg");
  render();
  if (typeof showToast === "function") showToast("已记录今日体重", "success");
}

function ftDelWeight(k) {
  var f = ftGet();
  delete f.weightLogs[k];
  DB.save(); render();
}

function ftDietPhotoPick(m) {
  var el = document.getElementById("ft-diet-file-" + m);
  if (el) el.click();
}

async function ftDietPhotoChange(input, m) {
  var file = input.files && input.files[0]; if (!file) return;
  try {
    var b64 = await compressImage(file);
    if (!window.__ftDietPhoto) window.__ftDietPhoto = {};
    window.__ftDietPhoto[m] = b64;
    render();
    if (typeof showToast === "function") showToast("照片已添加", "success");
  } catch (e) { if (typeof showToast === "function") showToast("照片处理失败", "error"); }
}

function ftAddDiet(m) {
  var f = ftGet();
  var name = (document.getElementById("ft-diet-name-" + m).value || "").trim();
  if (!name) { if (typeof showToast === "function") showToast("先写吃了什么", "warn"); return; }
  var kcal = parseInt(document.getElementById("ft-diet-kcal-" + m).value, 10) || 0;
  var photo = (window.__ftDietPhoto && window.__ftDietPhoto[m]) ? window.__ftDietPhoto[m] : null;
  if (!f.dietLogs[today()]) f.dietLogs[today()] = [];
  f.dietLogs[today()].push({ id: (typeof uid === "function" ? uid() : String(Math.random())), meal: m, name: name, kcal: kcal, photo: photo, recipeId: null, note: "" });
  if (window.__ftDietPhoto) window.__ftDietPhoto[m] = null;
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("fitness", "记录饮食：" + name);
  render();
  if (typeof showToast === "function") showToast("已记录", "success");
}

function ftAddRecMeal(m, rid) {
  var f = ftGet();
  var r = (typeof recipeById === "function") ? recipeById(rid) : null;
  if (!r) return;
  if (!f.dietLogs[today()]) f.dietLogs[today()] = [];
  f.dietLogs[today()].push({ id: (typeof uid === "function" ? uid() : String(Math.random())), meal: m, name: r.name, kcal: r.kcal, photo: null, recipeId: rid, note: "" });
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("fitness", "记录饮食(菜谱)：" + r.name);
  render();
  if (typeof showToast === "function") showToast("已记入今日" + FT_MEAL_NAMES[m], "success");
}

function ftDelDiet(id) {
  var f = ftGet();
  var log = f.dietLogs[today()] || [];
  f.dietLogs[today()] = log.filter(function (x) { return x.id !== id; });
  DB.save(); render();
}

function ftMarkTrainDone(date, typeId) {
  var f = ftGet();
  if (!f.trainDone[date]) f.trainDone[date] = {};
  f.trainDone[date][typeId] = !f.trainDone[date][typeId];
  DB.save(); render();
  if (typeof showToast === "function") showToast(f.trainDone[date][typeId] ? "训练打卡完成 💪" : "已取消打卡", "success");
}

// ---------- 跟练播放器 ----------
function ftVideoEmbed(url) {
  if (!url) return null;
  try {
    var u = new URL(url);
    if (u.hostname.indexOf("youtube.com") >= 0 || u.hostname.indexOf("youtu.be") >= 0) {
      var id = u.searchParams.get("v") || u.pathname.slice(1);
      return '<iframe class="ft-video" src="https://www.youtube.com/embed/' + id + '" allowfullscreen></iframe>';
    }
    if (u.hostname.indexOf("bilibili.com") >= 0) {
      var m = u.pathname.match(/video\/(BV\w+)/);
      if (m) return '<iframe class="ft-video" src="https://player.bilibili.com/player.html?bvid=' + m[1] + '" allowfullscreen></iframe>';
    }
  } catch (e) {}
  return null;
}

function ftStartFollow(id, kind) {
  var items, title;
  if (kind === "train") { var t = FT_TRAIN_TYPES[id]; items = t.routine; title = t.icon + " " + t.name; }
  else { var iss = ftPostureById(id); items = iss.routine; title = iss.icon + " " + iss.name; }
  var f = ftGet();
  var savedBvid = kind === "train" ? (f.trainVideos && f.trainVideos[id]) : (f.postureVideos && f.postureVideos[id]);
  window.__ftPlayer = { items: items, title: title, i: 0, video: savedBvid ? ftBiliEmbed(savedBvid) : null, kind: kind, id: id };
  ftRenderPlayer();
}

function ftRenderPlayer() {
  var pl = window.__ftPlayer; if (!pl) return;
  var ex = pl.items[pl.i];
  // 已导入 B站 视频则直接内嵌播放；否则展示「从 B站 导入」入口（含一键去 B站 搜索）
  var searchKw = encodeURIComponent(FT_BILI_UP + " " + pl.title.replace(/[^一-龥A-Za-z0-9 ]/g, "") + " 跟练");
  var importBox = '<div style="margin-top:8px;padding:10px;background:var(--accent-bg,#fff0f5);border-radius:10px">' +
    '<div class="ft-sub" style="margin:0 0 6px">' + (pl.video ? "换一个跟练视频（覆盖当前）：" : "还没绑定跟练视频，从 B站 导入后下次自动播放：") + '</div>' +
    '<input id="ft-video-url" class="form-input" placeholder="粘贴 B站 视频链接 或 BV 号">' +
    '<div class="btn-row" style="margin-top:6px">' +
    '<button class="btn btn-primary btn-mini" style="flex:1" onclick="ftImportBili()">从 B站 导入并保存</button>' +
    '<a class="btn btn-secondary btn-mini" style="flex:1;text-align:center" href="https://search.bilibili.com/all?keyword=' + searchKw + '" target="_blank">🔍 去 B站 搜</a>' +
    '</div></div>';
  var videoArea = pl._showImport
    ? importBox
    : (pl.video
        ? (pl.video + '<div style="margin-top:6px"><button class="btn btn-secondary btn-mini" onclick="ftPlayerShowImport()">🔄 换 B站 视频</button></div>')
        : importBox);
  var html = '<div class="modal-title">' + escapeHtml(pl.title) + '</div>' + videoArea +
    '<div class="ft-player-step">第 ' + (pl.i + 1) + ' / ' + pl.items.length + ' 组</div>' +
    '<div class="ft-ex-name">' + escapeHtml(ex.name) + '</div>' +
    '<div class="ft-ex-meta">' + (ex.sets ? ex.sets + ' 组 · ' : '') + escapeHtml(ex.reps || '') + '</div>' +
    (ex.tip ? '<div class="ft-ex-tip">💡 ' + escapeHtml(ex.tip) + '</div>' : '') +
    '<div class="btn-row" style="margin-top:14px">' +
    (pl.i > 0 ? '<button class="btn btn-secondary" onclick="ftPlayerPrev()">上一项</button>' : '') +
    (pl.i < pl.items.length - 1 ? '<button class="btn btn-primary" onclick="ftPlayerNext()">完成这组 ▶</button>' : '<button class="btn btn-primary" onclick="ftPlayerFinish()">完成训练 🎉</button>') +
    '</div>';
  showModal(html);
}

function ftPlayerNext() { var pl = window.__ftPlayer; if (!pl) return; pl.i++; ftRenderPlayer(); }
function ftPlayerPrev() { var pl = window.__ftPlayer; if (!pl) return; if (pl.i > 0) pl.i--; ftRenderPlayer(); }
function ftParseBili(url) {
  if (!url) return null;
  url = String(url).trim();
  var m = url.match(/BV[0-9A-Za-z]+/);   // 裸 BV 号也支持
  if (m) return m[0];
  try {
    var u = new URL(url);
    if (u.hostname.indexOf("bilibili.com") >= 0) {
      var mm = u.pathname.match(/video\/(BV\w+)/);
      if (mm) return mm[1];
    }
  } catch (e) {}
  return null;
}
function ftBiliEmbed(bvid) {
  if (!bvid) return null;
  return '<iframe class="ft-video" src="https://player.bilibili.com/player.html?bvid=' + bvid + '&high_quality=1&danmaku=0&autoplay=0" allowfullscreen></iframe>';
}
function ftImportBili() {
  var pl = window.__ftPlayer; if (!pl) return;
  var url = document.getElementById("ft-video-url").value || "";
  var bvid = ftParseBili(url);
  if (!bvid) { if (typeof showToast === "function") showToast("请输入有效的 B站 视频链接或 BV 号", "warn"); return; }
  var f = ftGet();
  if (pl.kind === "train") { if (!f.trainVideos) f.trainVideos = {}; f.trainVideos[pl.id] = bvid; }
  else { if (!f.postureVideos) f.postureVideos = {}; f.postureVideos[pl.id] = bvid; }
  DB.save();
  pl.video = ftBiliEmbed(bvid);
  if (typeof showToast === "function") showToast("已绑定 B站 视频，下次自动播放 🎬", "success");
  ftRenderPlayer();
}
function ftPlayerFinish() {
  closeModal(); window.__ftPlayer = null;
  if (typeof showToast === "function") showToast("训练完成，记得在历史里打卡 💪", "success");
}
function ftPlayerShowImport() {
  var pl = window.__ftPlayer; if (!pl) return;
  pl._showImport = true; ftRenderPlayer();
}

// ---------- 目标设置 ----------
function ftOpenProfile() {
  var f = ftGet();
  var p = f.profile;
  var m = p.menstrual || {};
  var s = p.schedule || {};
  var dp = p.dietPrefs || {};
  var ex = p.exercise || {};
  var hb = p.habits || {};
  var eqStr = (ex.homeEquipment || []).join("，");
  var html = '<div class="modal-title">⚙️ 减脂档案设置</div>' +
    '<div class="ft-profile-section">📋 个人基础情况</div>' +
    '<div style="margin-top:4px">' +
    '<label class="form-label">性别</label><select id="ft-p-gender" class="form-input"><option value="female"' + (p.gender === "female" ? " selected" : "") + '>女</option><option value="male"' + (p.gender === "male" ? " selected" : "") + '>男</option></select>' +
    '<label class="form-label">年龄</label><input id="ft-p-age" class="form-input" type="number" value="' + (p.age || "") + '" placeholder="如 25">' +
    '<label class="form-label">身高 (cm)</label><input id="ft-p-height" class="form-input" type="number" value="' + (p.heightCm || "") + '">' +
    '<label class="form-label">当前体重 (kg)</label><input id="ft-p-cw" class="form-input" type="number" step="0.1" value="' + fmtWeight(p.currentWeight) + '">' +
    '<label class="form-label">目标体重 (kg)</label><input id="ft-p-tw" class="form-input" type="number" step="0.1" value="' + fmtWeight(p.targetWeight) + '">' +
    '<label class="form-label">起始体重 (kg) — 减脂启动时体重</label><input id="ft-p-sw" class="form-input" type="number" step="0.1" value="' + fmtWeight(p.startWeight) + '">' +
    '<label class="form-label">减脂启动日期</label><input id="ft-p-swd" class="form-input" type="date" value="' + (p.startWeightDate || "") + '">' +
    '<label class="form-label">目标达成日</label><input id="ft-p-td" class="form-input" type="date" value="' + (p.targetDate || "") + '">' +
    '<label class="form-label">工作模式</label><select id="ft-p-workmode" class="form-input"><option value="home"' + (p.workMode === "home" ? " selected" : "") + '>居家上班</option><option value="commute"' + (p.workMode === "commute" ? " selected" : "") + '>外出通勤</option></select>' +
    '</div>' +

    '<div class="ft-profile-section">⏰ 作息饮食安排</div>' +
    '<div style="margin-top:4px">' +
    '<div class="ft-form-row"><div><label class="form-label">起床时间</label><input id="ft-p-wake" class="form-input" type="time" value="' + (s.wakeTime || "07:00") + '"></div>' +
    '<div><label class="form-label">早餐时间</label><input id="ft-p-bf" class="form-input" type="time" value="' + (s.breakfastTime || "07:30") + '"></div></div>' +
    '<div class="ft-form-row"><div><label class="form-label">午餐开始</label><input id="ft-p-ls" class="form-input" type="time" value="' + (s.lunchStart || "12:00") + '"></div>' +
    '<div><label class="form-label">午餐结束</label><input id="ft-p-le" class="form-input" type="time" value="' + (s.lunchEnd || "13:00") + '"></div></div>' +
    '<div class="ft-form-row"><div><label class="form-label">晚餐最晚</label><input id="ft-p-dd" class="form-input" type="time" value="' + (s.dinnerDeadline || "19:00") + '"></div>' +
    '<div><label class="form-label">停止喝水</label><input id="ft-p-wc" class="form-input" type="time" value="' + (s.waterCutoff || "21:00") + '"></div></div>' +
    '<label class="form-label">每日喝水总量 (ml)</label><input id="ft-p-water" class="form-input" type="number" value="' + (s.dailyWaterMl || 2000) + '">' +
    '</div>' +

    '<div class="ft-profile-section">🍽 饮食偏好</div>' +
    '<div style="margin-top:4px">' +
    '<label class="form-label">早餐饮食习惯</label><input id="ft-p-bfh" class="form-input" value="' + escapeHtml(dp.breakfastHabit || "") + '" placeholder="如 喜欢喝粥配鸡蛋">' +
    '<label class="form-label">午餐习惯</label><input id="ft-p-lh" class="form-input" value="' + escapeHtml(dp.lunchHabit || "") + '" placeholder="如 偏好米饭+一荤一素">' +
    '<div class="ft-form-row"><div><label class="form-label">胃口好坏</label><select id="ft-p-app" class="form-input"><option value="good"' + (dp.appetite === "good" ? " selected" : "") + '>胃口好</option><option value="normal"' + (dp.appetite === "normal" ? " selected" : "") + '>一般</option><option value="poor"' + (dp.appetite === "poor" ? " selected" : "") + '>胃口差</option></select></div>' +
    '<div><label class="form-label">自律情况</label><select id="ft-p-dis2" class="form-input"><option value="high"' + (dp.discipline === "high" ? " selected" : "") + '>高度自律</option><option value="normal"' + (dp.discipline === "normal" ? " selected" : "") + '>一般</option><option value="low"' + (dp.discipline === "low" ? " selected" : "") + '>容易放纵</option></select></div></div>' +
    '<label class="form-label">饮食风格</label><select id="ft-p-style" class="form-input"><option value="balanced"' + (p.dietStyle === "balanced" ? " selected" : "") + '>均衡</option><option value="highProtein"' + (p.dietStyle === "highProtein" ? " selected" : "") + '>高蛋白</option><option value="lowCarb"' + (p.dietStyle === "lowCarb" ? " selected" : "") + '>低卡低碳</option></select>' +
    '<label class="form-label">不爱吃的（逗号分隔）</label><input id="ft-p-dis" class="form-input" value="' + (p.dislikes || []).join("，") + '">' +
    '</div>' +

    '<div class="ft-profile-section">🏃 运动条件</div>' +
    '<div style="margin-top:4px">' +
    '<label class="form-label" style="margin-top:4px"><input type="checkbox" id="ft-p-gym"' + (ex.hasGym ? " checked" : "") + '> 是否去健身房</label>' +
    '<label class="form-label">家中器械（逗号分隔，如：瑜伽垫、跳绳、动感单车）</label><input id="ft-p-eq" class="form-input" value="' + escapeHtml(eqStr) + '">' +
    '<label class="form-label">运动可选时段</label><select id="ft-p-slot" class="form-input"><option value="morning"' + (ex.timeSlot === "morning" ? " selected" : "") + '>上午</option><option value="afternoon"' + (ex.timeSlot === "afternoon" ? " selected" : "") + '>下午</option></select>' +
    '</div>' +

    '<div class="ft-profile-section">🦶 日常习惯</div>' +
    '<div style="margin-top:4px">' +
    '<label class="form-label" style="margin-top:4px"><input type="checkbox" id="ft-p-soak"' + (hb.footSoak ? " checked" : "") + '> 是否泡脚</label>' +
    '<label class="form-label">泡脚时间段</label><input id="ft-p-soakt" class="form-input" type="time" value="' + (hb.footSoakTime || "21:30") + '">' +
    '</div>' +

    '<div class="ft-profile-section">📱 社交账号</div>' +
    '<div style="margin-top:4px">' +
    '<label class="form-label">小红书号</label><input id="ft-p-xhs" class="form-input" value="' + escapeHtml(p.xhsAccount || "") + '">' +
    '</div>' +

    '<div class="ft-profile-section">🌸 经期设置</div>' +
    '<div style="margin-top:4px">' +
    '<label class="form-label" style="margin-top:4px"><input type="checkbox" id="ft-p-men"' + (m.enabled ? " checked" : "") + '> 开启经期周期管理</label>' +
    '<div class="ft-form-row"><div><label class="form-label">生理周期（天）</label><input id="ft-p-cyc" class="form-input" type="number" value="' + (m.cycleDays || 28) + '"></div>' +
    '<div><label class="form-label">经期天数</label><input id="ft-p-pd" class="form-input" type="number" value="' + (m.periodDays || 5) + '"></div></div>' +
    '<div class="ft-sub" style="margin-top:6px">💡 经期历史记录请在「经期」Tab 页面添加和管理</div>' +
    '</div>' +

    '<div class="btn-row" style="margin-top:14px"><button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button><button class="btn btn-primary" style="flex:1" onclick="ftSaveProfile()">保存</button></div>';
  showModal(html);
}

function ftSaveProfile() {
  var f = ftGet();
  var p = f.profile;
  p.gender = document.getElementById("ft-p-gender").value;
  p.age = parseInt(document.getElementById("ft-p-age").value, 10) || null;
  p.heightCm = parseInt(document.getElementById("ft-p-height").value, 10) || p.heightCm;
  p.startWeight = ftParseWeight(document.getElementById("ft-p-sw").value);
  p.currentWeight = ftParseWeight(document.getElementById("ft-p-cw").value);
  p.targetWeight = ftParseWeight(document.getElementById("ft-p-tw").value);
  p.startWeightDate = document.getElementById("ft-p-swd").value || null;
  p.targetDate = document.getElementById("ft-p-td").value || null;
  p.workMode = document.getElementById("ft-p-workmode").value;
  p.schedule = {
    wakeTime: document.getElementById("ft-p-wake").value || "07:00",
    breakfastTime: document.getElementById("ft-p-bf").value || "07:30",
    lunchStart: document.getElementById("ft-p-ls").value || "12:00",
    lunchEnd: document.getElementById("ft-p-le").value || "13:00",
    dinnerDeadline: document.getElementById("ft-p-dd").value || "19:00",
    waterCutoff: document.getElementById("ft-p-wc").value || "21:00",
    dailyWaterMl: parseInt(document.getElementById("ft-p-water").value, 10) || 2000
  };
  p.dietPrefs = {
    breakfastHabit: document.getElementById("ft-p-bfh").value || "",
    lunchHabit: document.getElementById("ft-p-lh").value || "",
    appetite: document.getElementById("ft-p-app").value || "normal",
    discipline: document.getElementById("ft-p-dis2").value || "normal"
  };
  p.exercise = {
    hasGym: document.getElementById("ft-p-gym").checked,
    homeEquipment: (document.getElementById("ft-p-eq").value || "").split(/[，,]/).map(function (s) { return s.trim(); }).filter(Boolean),
    timeSlot: document.getElementById("ft-p-slot").value || "morning"
  };
  p.habits = {
    footSoak: document.getElementById("ft-p-soak").checked,
    footSoakTime: document.getElementById("ft-p-soakt").value || "21:30"
  };
  p.xhsAccount = document.getElementById("ft-p-xhs").value || "18920971144";
  p.dietStyle = document.getElementById("ft-p-style").value;
  p.dislikes = (document.getElementById("ft-p-dis").value || "").split(/[，,]/).map(function (s) { return s.trim(); }).filter(Boolean);
  // 保存经期设置时保留历史记录
  var oldHistory = (p.menstrual && p.menstrual.periodHistory) ? p.menstrual.periodHistory : [];
  p.menstrual = {
    enabled: document.getElementById("ft-p-men").checked,
    cycleDays: parseInt(document.getElementById("ft-p-cyc").value, 10) || 28,
    periodDays: parseInt(document.getElementById("ft-p-pd").value, 10) || 5,
    lastPeriodDate: oldHistory.length ? oldHistory[oldHistory.length - 1] : (p.menstrual ? p.menstrual.lastPeriodDate : ""),
    periodHistory: oldHistory
  };
  DB.save();
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已保存减脂档案", "success");
}

function ftOpenRecipePicker() {
  var pool = (typeof RECIPE_DB !== "undefined") ? RECIPE_DB : [];
  var list = pool.map(function (r) {
    return '<div class="ft-rec-item" onclick="ftPickRecipeFromPicker(\'' + r.id + '\')"><div><b>' + escapeHtml(r.name) + '</b> · ' + r.kcal + 'kcal <span class="ft-sub">' + (r.tags || []).join("/") + '</span></div></div>';
  }).join("");
  var html = '<div class="modal-title">🍳 从菜谱库挑选</div><input id="ft-rec-q" class="form-input" placeholder="搜索菜名" oninput="ftRecPickerFilter()"><div class="ft-rec-list">' + list + '</div><div class="btn-row" style="margin-top:10px"><button class="btn btn-primary" style="flex:1" onclick="closeModal()">完成</button></div>';
  showModal(html);
}

function ftRecPickerFilter() {
  var q = (document.getElementById("ft-rec-q").value || "").toLowerCase();
  var pool = (typeof RECIPE_DB !== "undefined") ? RECIPE_DB : [];
  var list = pool.filter(function (r) { return !q || (r.name || "").toLowerCase().indexOf(q) >= 0; }).map(function (r) {
    return '<div class="ft-rec-item" onclick="ftPickRecipeFromPicker(\'' + r.id + '\')"><div><b>' + escapeHtml(r.name) + '</b> · ' + r.kcal + 'kcal <span class="ft-sub">' + (r.tags || []).join("/") + '</span></div></div>';
  }).join("");
  var box = document.querySelector(".ft-rec-list");
  if (box) box.innerHTML = list || '<div class="ft-sub">没有匹配的菜谱</div>';
}

function ftPickRecipeFromPicker(rid) {
  var r = (typeof recipeById === "function") ? recipeById(rid) : null;
  if (!r) return;
  var f = ftGet();
  if (!f.dietLogs[today()]) f.dietLogs[today()] = [];
  f.dietLogs[today()].push({ id: (typeof uid === "function" ? uid() : String(Math.random())), meal: "lunch", name: r.name, kcal: r.kcal, photo: null, recipeId: rid, note: "" });
  DB.save();
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已加入今日饮食", "success");
}
