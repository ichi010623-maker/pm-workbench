// ============================================================
// 🍳 菜谱模块（独立模块）
// 菜谱库：按菜系(中/西/韩/日/其他国际) / 类型(家常菜·饭店菜·汤羹·沙拉轻食·早餐·甜点·咖啡·饮品·酒类) / 标签筛选
//        每道菜可一键直达「下厨房详细菜谱」与「B站视频教程」
// 饮食方案：按个人目标(减肥/增肌/补钙/健康/地中海/中式) + 身体数据算每日热量，可改菜 → 再生成一周食谱
// 一周食谱：健康维持 / 减脂 / 增肌 / 补钙 / 地中海饮食 / 中式养生，营养平衡、主食材不连续重复
// 我的收藏：用户收藏的菜谱
// 数据：DB.data.growth.recipes（本地持久，云端同步）
// 设计：纯数据 + 纯函数（不依赖 DOM）便于自动化测试；渲染函数仅在调用时访问 DOM。
// ============================================================

var recipesTab = "library";      // library | week | favs
var recipeQuery = "";
var recipeCuisine = "all";
var recipeType = "all";
var recipeTag = "all";
var recipeWeekCache = null;      // 当前生成的一周计划
var RECIPE_WEEK_KEY = "";        // 缓存对应的 key（goal + 周起始）
var recipePlanDraft = null;      // 饮食方案编辑草稿（未保存于内存）
var planDishQuery = "";          // 饮食方案「添加其他菜」搜索词
var recipeOnHandSel = [];        // 手边搭配：已选中的冰箱物品 id
var recipeOnHandCache = null;    // 手边搭配：上次排序结果缓存

var RECIPE_CUISINES = [
  { id: "cn", name: "中餐" },
  { id: "west", name: "西餐" },
  { id: "kr", name: "韩餐" },
  { id: "jp", name: "日料" },
  { id: "other", name: "其他/国际" }
];
var RECIPE_TYPES = ["家常菜", "饭店菜", "汤羹", "沙拉轻食", "早餐", "甜点", "咖啡", "饮品", "酒类"];
var RECIPE_TAGS = ["减脂", "高蛋白", "低GI", "地中海", "清淡", "快手", "补铁", "补钙"];
var WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

// 链接生成（确定性、永久有效）：下厨房搜菜谱详情 + B站搜视频教程
function recipeSiteUrl(name) { return "https://www.xiachufang.com/search/?keyword=" + encodeURIComponent(name); }
function recipeVideoUrl(name) { return "https://search.bilibili.com/all?keyword=" + encodeURIComponent(name + " 做法"); }

// ============================================================
// 菜谱数据集（约 56 道，覆盖菜系/类型/标签；营养为每 1 人份估算值）
// main = 主食材分类（用于一周计划的主食材不连续重复）
// ============================================================
var RECIPE_DB = [
  // ---------- 中餐 · 家常菜 ----------
  { id: "rc01", name: "番茄炒蛋", cuisine: "cn", type: "家常菜", main: "蛋", tags: ["清淡", "快手", "补钙"], kcal: 180, protein: 10, carb: 8, fat: 12, time: 10, serves: 2,
    ingredients: ["鸡蛋 3个", "番茄 2个", "葱花 少许", "盐 适量", "糖 半勺"],
    steps: ["鸡蛋打散加少许盐", "番茄去皮切块", "热油先炒蛋盛出", "下番茄炒出红汁加糖", "回锅鸡蛋翻匀撒葱花"] },
  { id: "rc02", name: "青椒肉丝", cuisine: "cn", type: "家常菜", main: "猪", tags: ["高蛋白", "快手"], kcal: 260, protein: 22, carb: 10, fat: 14, time: 15, serves: 2,
    ingredients: ["猪里脊 200g", "青椒 2个", "生抽 1勺", "淀粉 少许", "蒜 2瓣"],
    steps: ["肉丝用生抽淀粉抓匀", "青椒切丝", "热油滑炒肉丝变色盛出", "爆香蒜下青椒", "回锅肉丝调咸鲜出锅"] },
  { id: "rc03", name: "红烧排骨", cuisine: "cn", type: "家常菜", main: "猪", tags: ["补钙"], kcal: 320, protein: 24, carb: 12, fat: 20, time: 45, serves: 2,
    ingredients: ["排骨 500g", "冰糖 15g", "生抽 2勺", "姜 3片", "料酒 1勺"],
    steps: ["排骨焯水去血沫", "冰糖炒糖色", "下排骨上色加料酒生抽", "加热水炖40分钟", "大火收汁"] },
  { id: "rc04", name: "宫保鸡丁", cuisine: "cn", type: "家常菜", main: "鸡", tags: ["高蛋白", "快手"], kcal: 280, protein: 26, carb: 14, fat: 13, time: 20, serves: 2,
    ingredients: ["鸡胸 250g", "花生 30g", "干辣椒 5个", "醋 1勺", "糖 半勺"],
    steps: ["鸡丁用淀粉抓匀", "调碗汁：醋糖生抽", "滑炒鸡丁盛出", "爆香辣椒下花生", "回锅淋汁翻匀"] },
  { id: "rc05", name: "麻婆豆腐", cuisine: "cn", type: "家常菜", main: "豆腐", tags: ["高蛋白", "补钙", "快手"], kcal: 220, protein: 18, carb: 9, fat: 13, time: 15, serves: 2,
    ingredients: ["嫩豆腐 1盒", "肉末 50g", "豆瓣酱 1勺", "花椒粉 少许", "葱花 少许"],
    steps: ["豆腐切块焯水", "炒肉末加豆瓣酱", "加水下豆腐焖3分", "勾芡撒花椒粉葱花"] },
  { id: "rc06", name: "清炒西兰花", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡", "减脂", "补铁"], kcal: 120, protein: 6, carb: 10, fat: 7, time: 10, serves: 2,
    ingredients: ["西兰花 1颗", "蒜 2瓣", "盐 适量", "橄榄油 1勺"],
    steps: ["西兰花掰小朵焯水", "蒜末爆香", "下西兰花大火快炒", "加盐出锅"] },
  { id: "rc07", name: "鱼香肉丝", cuisine: "cn", type: "家常菜", main: "猪", tags: ["高蛋白"], kcal: 265, protein: 22, carb: 12, fat: 14, time: 20, serves: 2,
    ingredients: ["猪里脊 200g", "木耳 适量", "胡萝卜 半根", "醋 1勺", "糖 半勺"],
    steps: ["肉丝上浆", "配菜切丝", "滑炒肉丝", "下配菜调鱼香汁", "翻匀出锅"] },
  { id: "rc08", name: "可乐鸡翅", cuisine: "cn", type: "家常菜", main: "鸡", tags: ["快手"], kcal: 300, protein: 20, carb: 22, fat: 14, time: 25, serves: 2,
    ingredients: ["鸡翅中 8个", "可乐 1罐", "生抽 1勺", "姜 2片"],
    steps: ["鸡翅煎两面金黄", "加生抽姜片", "倒入可乐没过", "中火收汁裹亮"] },
  { id: "rc09", name: "蒜蓉粉丝蒸虾", cuisine: "cn", type: "家常菜", main: "虾", tags: ["高蛋白", "补钙"], kcal: 240, protein: 24, carb: 16, fat: 8, time: 20, serves: 2,
    ingredients: ["基围虾 10只", "粉丝 1把", "蒜 1头", "生抽 1勺", "葱花 少许"],
    steps: ["粉丝泡软铺底", "虾开背去线摆上", "蒜蓉炒香铺虾", "蒸8分钟淋生抽", "撒葱花热油激香"] },
  { id: "rc10", name: "西红柿牛腩", cuisine: "cn", type: "家常菜", main: "牛", tags: ["补铁", "高蛋白"], kcal: 340, protein: 28, carb: 14, fat: 18, time: 70, serves: 2,
    ingredients: ["牛腩 400g", "番茄 3个", "土豆 1个", "姜 3片", "番茄酱 1勺"],
    steps: ["牛腩焯水", "番茄炒出沙加番茄酱", "牛肉加水炖50分", "下土豆再炖20分", "调味收汁"] },
  { id: "rc11", name: "地三鲜", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡"], kcal: 200, protein: 5, carb: 24, fat: 10, time: 20, serves: 2,
    ingredients: ["土豆 1个", "茄子 1根", "青椒 1个", "生抽 1勺", "蒜 2瓣"],
    steps: ["三样切滚刀块", "土豆茄子过油", "爆蒜下青椒", "回锅调咸鲜汁"] },
  { id: "rc12", name: "酸辣土豆丝", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["快手", "低GI"], kcal: 160, protein: 4, carb: 28, fat: 5, time: 12, serves: 2,
    ingredients: ["土豆 2个", "干辣椒 3个", "醋 1勺", "花椒 少许"],
    steps: ["土豆切细丝泡水", "热油花椒辣椒", "下土豆丝大火炒", "沿锅边淋醋出锅"] },
  { id: "rc13", name: "板栗烧鸡", cuisine: "cn", type: "家常菜", main: "鸡", tags: ["补铁"], kcal: 300, protein: 22, carb: 20, fat: 14, time: 40, serves: 2,
    ingredients: ["鸡腿 2个", "板栗 200g", "生抽 1勺", "冰糖 10g", "姜 2片"],
    steps: ["鸡块焯水", "炒糖色下鸡块", "加生抽姜与水", "下板栗炖25分", "收汁"] },
  { id: "rc14", name: "清蒸鲈鱼", cuisine: "cn", type: "家常菜", main: "鱼", tags: ["高蛋白", "补钙", "清淡"], kcal: 220, protein: 30, carb: 2, fat: 10, time: 20, serves: 2,
    ingredients: ["鲈鱼 1条", "姜 丝", "葱 丝", "蒸鱼豉油 2勺", "料酒 1勺"],
    steps: ["鱼改刀腌料酒", "铺姜丝蒸8分", "倒掉腥水铺葱丝", "淋热油激香", "浇蒸鱼豉油"] },
  { id: "rc15", name: "回锅肉", cuisine: "cn", type: "家常菜", main: "猪", tags: ["高蛋白"], kcal: 320, protein: 22, carb: 8, fat: 24, time: 25, serves: 2,
    ingredients: ["五花肉 300g", "青蒜 2根", "豆瓣酱 1勺", "甜面酱 半勺"],
    steps: ["五花肉煮七分熟切片", "煸炒出油", "加豆瓣酱甜面酱", "下青蒜炒断生"] },

  // ---------- 中餐 · 汤羹 ----------
  { id: "rc16", name: "紫菜蛋花汤", cuisine: "cn", type: "汤羹", main: "蛋", tags: ["清淡", "快手", "补钙"], kcal: 80, protein: 6, carb: 4, fat: 4, time: 8, serves: 2,
    ingredients: ["紫菜 1小把", "鸡蛋 1个", "香油 几滴", "盐 适量"],
    steps: ["水开下紫菜", "淋蛋液成花", "加盐香油出锅"] },
  { id: "rc17", name: "西红柿豆腐汤", cuisine: "cn", type: "汤羹", main: "豆腐", tags: ["清淡", "补钙"], kcal: 110, protein: 8, carb: 8, fat: 5, time: 15, serves: 2,
    ingredients: ["番茄 2个", "嫩豆腐 半盒", "鸡蛋 1个", "盐 适量"],
    steps: ["番茄炒出汁加水", "下豆腐块", "淋蛋液", "调味出锅"] },
  { id: "rc18", name: "排骨玉米汤", cuisine: "cn", type: "汤羹", main: "猪", tags: ["补钙"], kcal: 260, protein: 20, carb: 18, fat: 12, time: 60, serves: 2,
    ingredients: ["排骨 400g", "玉米 2根", "胡萝卜 1根", "姜 3片"],
    steps: ["排骨焯水", "所有材料入锅", "大火转小火炖50分", "加盐出锅"] },
  { id: "rc19", name: "冬瓜排骨汤", cuisine: "cn", type: "汤羹", main: "猪", tags: ["清淡", "补钙", "减脂"], kcal: 200, protein: 18, carb: 8, fat: 11, time: 55, serves: 2,
    ingredients: ["排骨 400g", "冬瓜 300g", "姜 3片", "盐 适量"],
    steps: ["排骨焯水炖40分", "下冬瓜块再炖15分", "加盐出锅"] },
  { id: "rc20", name: "银耳莲子羹", cuisine: "cn", type: "汤羹", main: "蔬", tags: ["清淡", "补铁"], kcal: 140, protein: 3, carb: 28, fat: 1, time: 50, serves: 2,
    ingredients: ["银耳 1朵", "莲子 20g", "红枣 5颗", "冰糖 适量"],
    steps: ["银耳泡发撕小朵", "莲子红枣同煮40分", "出胶加冰糖"] },
  { id: "rc21", name: "番茄龙利鱼汤", cuisine: "cn", type: "汤羹", main: "鱼", tags: ["高蛋白", "清淡", "减脂"], kcal: 180, protein: 26, carb: 6, fat: 6, time: 20, serves: 2,
    ingredients: ["龙利鱼 250g", "番茄 2个", "金针菇 1把", "番茄酱 1勺"],
    steps: ["鱼片腌淀粉", "番茄炒沙加水", "下金针菇煮开", "滑入鱼片煮熟"] },

  // ---------- 中餐 · 沙拉轻食 ----------
  { id: "rc22", name: "凉拌黄瓜", cuisine: "cn", type: "沙拉轻食", main: "蔬", tags: ["减脂", "低GI", "快手"], kcal: 60, protein: 2, carb: 6, fat: 3, time: 8, serves: 2,
    ingredients: ["黄瓜 2根", "蒜 2瓣", "醋 1勺", "香油 几滴"],
    steps: ["黄瓜拍碎切段", "蒜末醋香油拌匀", "静置入味"] },
  { id: "rc23", name: "焯拌秋葵", cuisine: "cn", type: "沙拉轻食", main: "蔬", tags: ["减脂", "补铁", "低GI"], kcal: 80, protein: 4, carb: 8, fat: 4, time: 10, serves: 2,
    ingredients: ["秋葵 200g", "生抽 1勺", "芥末 少许"],
    steps: ["秋葵整根焯水", "过凉切去蒂", "淋生抽芥末"] },
  { id: "rc24", name: "鸡胸蔬菜沙拉", cuisine: "cn", type: "沙拉轻食", main: "鸡", tags: ["减脂", "高蛋白", "低GI"], kcal: 220, protein: 30, carb: 10, fat: 7, time: 15, serves: 1,
    ingredients: ["鸡胸 150g", "生菜 1颗", "小番茄 6个", "油醋汁 1勺"],
    steps: ["鸡胸水煮撕条", "蔬菜洗净切好", "拌油醋汁"] },

  // ---------- 中餐 · 早餐 ----------
  { id: "rc25", name: "小米南瓜粥", cuisine: "cn", type: "早餐", main: "主食", tags: ["清淡", "补铁"], kcal: 150, protein: 4, carb: 30, fat: 2, time: 30, serves: 2,
    ingredients: ["小米 80g", "南瓜 200g"],
    steps: ["小米淘洗", "南瓜切块同煮", "煮至软烂"] },
  { id: "rc26", name: "茶叶蛋", cuisine: "cn", type: "早餐", main: "蛋", tags: ["高蛋白", "快手"], kcal: 90, protein: 8, carb: 3, fat: 6, time: 40, serves: 1,
    ingredients: ["鸡蛋 4个", "红茶 1包", "生抽 2勺", "八角 2颗"],
    steps: ["鸡蛋煮熟敲裂", "加料包煮10分", "浸泡入味过夜"] },
  { id: "rc27", name: "蔬菜鸡蛋饼", cuisine: "cn", type: "早餐", main: "蛋", tags: ["高蛋白", "快手"], kcal: 200, protein: 12, carb: 16, fat: 10, time: 12, serves: 1,
    ingredients: ["鸡蛋 2个", "胡萝卜 半根", "面粉 2勺", "盐 适量"],
    steps: ["蔬菜切碎", "蛋液加面粉调糊", "小火摊饼两面金黄"] },
  { id: "rc28", name: "豆浆配全麦包", cuisine: "cn", type: "早餐", main: "主食", tags: ["高蛋白", "低GI"], kcal: 220, protein: 14, carb: 28, fat: 6, time: 10, serves: 1,
    ingredients: ["无糖豆浆 1杯", "全麦面包 2片"],
    steps: ["豆浆加热", "全麦包烤香", "搭配即食"] },

  // ---------- 中餐 · 饭店菜 ----------
  { id: "rc29", name: "水煮牛肉", cuisine: "cn", type: "饭店菜", main: "牛", tags: ["高蛋白", "补铁"], kcal: 360, protein: 30, carb: 10, fat: 22, time: 35, serves: 2,
    ingredients: ["牛里脊 300g", "豆芽 1把", "豆瓣酱 2勺", "干辣椒 花椒 适量"],
    steps: ["牛肉上浆滑熟", "豆芽垫底", "炒红汤浇上", "辣椒花椒热油激"] },
  { id: "rc30", name: "北京烤鸭", cuisine: "cn", type: "饭店菜", main: "鸭", tags: ["高蛋白"], kcal: 380, protein: 26, carb: 14, fat: 24, time: 90, serves: 2,
    ingredients: ["填鸭 半只", "甜面酱 2勺", "葱白 适量", "薄饼 1叠"],
    steps: ["鸭身烫皮风干", "挂糖色烤50分", "片皮", "薄饼抹酱卷葱"] },
  { id: "rc31", name: "糖醋里脊", cuisine: "cn", type: "饭店菜", main: "猪", tags: ["快手"], kcal: 320, protein: 20, carb: 28, fat: 14, time: 30, serves: 2,
    ingredients: ["里脊 300g", "番茄酱 2勺", "白醋 1勺", "淀粉 适量"],
    steps: ["里脊切条裹淀粉", "炸两遍酥脆", "炒糖醋汁", "翻匀挂浆"] },

  // ---------- 中餐 · 甜点 ----------
  { id: "rc32", name: "红豆沙", cuisine: "cn", type: "甜点", main: "主食", tags: ["补铁"], kcal: 180, protein: 6, carb: 34, fat: 2, time: 50, serves: 2,
    ingredients: ["红豆 150g", "冰糖 适量"],
    steps: ["红豆泡发", "煮至软烂", "加冰糖打成沙"] },
  { id: "rc33", name: "酒酿圆子", cuisine: "cn", type: "甜点", main: "主食", tags: ["补铁"], kcal: 200, protein: 5, carb: 38, fat: 2, time: 20, serves: 2,
    ingredients: ["小圆子 1碗", "酒酿 2勺", "鸡蛋 1个", "桂花 少许"],
    steps: ["水开下圆子", "浮起加酒酿", "淋蛋花撒桂花"] },
  { id: "rc61", name: "芒果西米露", cuisine: "cn", type: "甜点", main: "主食", tags: [], kcal: 200, protein: 3, carb: 42, fat: 3, time: 25, serves: 2,
    ingredients: ["西米 60g", "芒果 2个", "椰浆 100ml", "牛奶 100ml"],
    steps: ["西米煮透过凉", "芒果打泥", "混合椰浆牛奶", "冷藏更爽"] },

  // ---------- 西餐 ----------
  { id: "rc34", name: "牛排配芦笋", cuisine: "west", type: "饭店菜", main: "牛", tags: ["高蛋白", "补钙", "地中海"], kcal: 420, protein: 32, carb: 8, fat: 28, time: 20, serves: 1,
    ingredients: ["牛排 200g", "芦笋 1把", "海盐 黑椒", "橄榄油 1勺"],
    steps: ["牛排回温擦干", "大火每面煎2分", "醒肉5分", "芦笋橄榄油煎香"] },
  { id: "rc35", name: "烤鸡胸沙拉", cuisine: "west", type: "沙拉轻食", main: "鸡", tags: ["减脂", "高蛋白", "低GI"], kcal: 260, protein: 34, carb: 10, fat: 9, time: 20, serves: 1,
    ingredients: ["鸡胸 150g", "混合生菜 1把", "小番茄 5个", "油醋汁 1勺"],
    steps: ["鸡胸用香料腌", "烤箱200度15分", "切片拌蔬菜", "淋油醋汁"] },
  { id: "rc36", name: "番茄培根意面", cuisine: "west", type: "家常菜", main: "主食", tags: ["地中海"], kcal: 380, protein: 14, carb: 52, fat: 12, time: 25, serves: 2,
    ingredients: ["意面 160g", "培根 3片", "番茄 3个", "蒜 2瓣"],
    steps: ["意面煮8分", "培根蒜炒香", "下番茄熬酱", "拌面撒芝士"] },
  { id: "rc37", name: "蔬菜浓汤", cuisine: "west", type: "汤羹", main: "蔬", tags: ["清淡", "地中海"], kcal: 160, protein: 5, carb: 22, fat: 6, time: 30, serves: 2,
    ingredients: ["胡萝卜 1根", "西芹 2根", "番茄 2个", "土豆 1个", "蔬菜高汤 适量"],
    steps: ["蔬菜切丁炒软", "加高汤炖20分", "部分打碎更浓"] },
  { id: "rc38", name: "希腊沙拉", cuisine: "west", type: "沙拉轻食", main: "蔬", tags: ["减脂", "低GI", "地中海"], kcal: 180, protein: 8, carb: 10, fat: 12, time: 10, serves: 1,
    ingredients: ["黄瓜 1根", "番茄 2个", "橄榄 10颗", "菲达奶酪 30g", "橄榄油 1勺"],
    steps: ["蔬菜切大块", "加橄榄奶酪", "淋橄榄油与柠檬"] },
  { id: "rc39", name: "煎三文鱼", cuisine: "west", type: "饭店菜", main: "鱼", tags: ["高蛋白", "补钙", "地中海"], kcal: 320, protein: 30, carb: 2, fat: 21, time: 15, serves: 1,
    ingredients: ["三文鱼 200g", "海盐 黑椒", "柠檬 半个", "橄榄油 1勺"],
    steps: ["鱼排擦干", "皮朝下煎脆", "翻面1分", "挤柠檬"] },
  { id: "rc40", name: "全麦虾仁炒蛋", cuisine: "west", type: "沙拉轻食", main: "虾", tags: ["高蛋白", "低GI", "地中海", "减脂"], kcal: 240, protein: 24, carb: 14, fat: 10, time: 12, serves: 1,
    ingredients: ["虾仁 100g", "鸡蛋 2个", "全麦吐司 1片", "黑椒 少许"],
    steps: ["虾仁炒变色", "加蛋液炒凝固", "配全麦吐司"] },
  { id: "rc41", name: "烤蔬菜盅", cuisine: "west", type: "家常菜", main: "蔬", tags: ["清淡", "地中海"], kcal: 150, protein: 5, carb: 18, fat: 7, time: 30, serves: 2,
    ingredients: ["西葫芦 1个", "彩椒 1个", "茄子 半根", "橄榄油 1勺", "迷迭香 少许"],
    steps: ["蔬菜切丁", "拌橄榄油香料", "烤箱200度25分"] },
  { id: "rc42", name: "燕麦酸奶杯", cuisine: "west", type: "沙拉轻食", main: "主食", tags: ["减脂", "低GI", "高蛋白"], kcal: 220, protein: 14, carb: 30, fat: 6, time: 8, serves: 1,
    ingredients: ["燕麦 40g", "无糖酸奶 150g", "蓝莓 1把", "坚果 1勺"],
    steps: ["杯底铺燕麦", "加酸奶", "叠水果坚果"] },
  { id: "rc43", name: "南瓜浓汤", cuisine: "west", type: "汤羹", main: "蔬", tags: ["清淡", "地中海"], kcal: 140, protein: 3, carb: 24, fat: 4, time: 25, serves: 2,
    ingredients: ["南瓜 300g", "洋葱 半个", "牛奶 100ml", "盐 适量"],
    steps: ["南瓜洋葱炒软", "加水煮烂", "加牛奶打碎"] },
  { id: "rc44", name: "提拉米苏", cuisine: "west", type: "甜点", main: "主食", tags: [], kcal: 320, protein: 7, carb: 36, fat: 16, time: 40, serves: 4,
    ingredients: ["马斯卡彭 200g", "手指饼 1包", "咖啡液 适量", "可可粉 少许"],
    steps: ["芝士加蛋打顺", "手指饼蘸咖啡", "层层叠好", "冷藏撒可可"] },

  // ---------- 西餐 · 咖啡 ----------
  { id: "rc45", name: "美式咖啡", cuisine: "west", type: "咖啡", main: "饮", tags: ["清淡"], kcal: 5, protein: 0, carb: 1, fat: 0, time: 3, serves: 1,
    ingredients: ["意式浓缩 1份", "热水 150ml"],
    steps: ["萃取浓缩", "加热水"] },
  { id: "rc57", name: "拿铁", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 120, protein: 6, carb: 12, fat: 5, time: 4, serves: 1,
    ingredients: ["意式浓缩 1份", "热牛奶 200ml"],
    steps: ["萃取浓缩", "打奶泡倒入"] },
  { id: "rc58", name: "卡布奇诺", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 110, protein: 5, carb: 10, fat: 5, time: 4, serves: 1,
    ingredients: ["意式浓缩 1份", "奶泡 适量", "可可粉 少许"],
    steps: ["萃取浓缩", "厚奶泡覆盖", "撒可可"] },
  { id: "rc59", name: "莫吉托(无酒精)", cuisine: "west", type: "饮品", main: "饮", tags: [], kcal: 150, protein: 0, carb: 36, fat: 0, time: 5, serves: 1,
    ingredients: ["青柠 1个", "薄荷 数片", "苏打水 150ml", "糖 1勺"],
    steps: ["青柠薄荷捣压", "加糖苏打水", "放冰块"] },
  { id: "rc60", name: "热红酒", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 180, protein: 0, carb: 24, fat: 0, time: 15, serves: 2,
    ingredients: ["红酒 1瓶", "橙 1个", "肉桂 1根", "丁香 少许"],
    steps: ["红酒加香料橙片", "小火温热不沸", "浸泡入味"] },

  // ---------- 韩餐 ----------
  { id: "rc46", name: "韩式拌饭", cuisine: "kr", type: "家常菜", main: "蛋", tags: ["补钙", "高蛋白"], kcal: 360, protein: 18, carb: 42, fat: 12, time: 20, serves: 1,
    ingredients: ["米饭 1碗", "菠菜 胡萝卜 豆芽 各1把", "鸡蛋 1个", "韩式辣酱 1勺"],
    steps: ["蔬菜分别焯熟", "煎太阳蛋", "码在饭上", "拌辣酱"] },
  { id: "rc47", name: "部队锅", cuisine: "kr", type: "汤羹", main: "猪", tags: ["高蛋白"], kcal: 380, protein: 24, carb: 26, fat: 18, time: 25, serves: 2,
    ingredients: ["午餐肉 4片", "泡菜 1碗", "年糕 1把", "芝士片 2片", "辣酱 1勺"],
    steps: ["泡菜铺底", "码食材加高汤", "煮开放芝士"] },
  { id: "rc48", name: "辣白菜豆腐汤", cuisine: "kr", type: "汤羹", main: "豆腐", tags: ["补铁", "补钙"], kcal: 160, protein: 12, carb: 8, fat: 9, time: 20, serves: 2,
    ingredients: ["辣白菜 1碗", "嫩豆腐 半盒", "猪肉末 50g", "蒜 2瓣"],
    steps: ["炒香肉末辣白菜", "加水煮开", "下豆腐炖10分"] },
  { id: "rc49", name: "韩式烤牛肉", cuisine: "kr", type: "饭店菜", main: "牛", tags: ["高蛋白", "补铁"], kcal: 340, protein: 30, carb: 10, fat: 18, time: 30, serves: 2,
    ingredients: ["牛里脊 300g", "梨 半个", "生抽 2勺", "蒜 3瓣"],
    steps: ["梨汁腌牛肉", "烤或煎至熟", "配生菜包食"] },
  { id: "rc50", name: "紫菜包饭", cuisine: "kr", type: "早餐", main: "主食", tags: ["快手", "低GI"], kcal: 260, protein: 10, carb: 40, fat: 7, time: 20, serves: 2,
    ingredients: ["米饭 1碗", "紫菜 2张", "胡萝卜 黄瓜 各半根", "蟹柳 2根"],
    steps: ["米饭拌香油盐", "铺料卷紧", "切厚片"] },

  // ---------- 日料 ----------
  { id: "rc51", name: "照烧鸡腿", cuisine: "jp", type: "饭店菜", main: "鸡", tags: ["高蛋白"], kcal: 320, protein: 26, carb: 22, fat: 14, time: 25, serves: 2,
    ingredients: ["鸡腿 2个", "酱油 2勺", "味淋 1勺", "蜂蜜 半勺"],
    steps: ["鸡皮煎脆", "调照烧汁", "收汁裹亮", "切块"] },
  { id: "rc52", name: "味噌汤", cuisine: "jp", type: "汤羹", main: "蔬", tags: ["清淡", "补钙"], kcal: 80, protein: 5, carb: 6, fat: 3, time: 10, serves: 2,
    ingredients: ["味噌 2勺", "豆腐 半盒", "海带 少许", "葱花 少许"],
    steps: ["水开下豆腐海带", "化开味噌", "撒葱花不沸"] },
  { id: "rc53", name: "三文鱼刺身", cuisine: "jp", type: "饭店菜", main: "鱼", tags: ["高蛋白", "补钙"], kcal: 220, protein: 26, carb: 0, fat: 13, time: 10, serves: 1,
    ingredients: ["三文鱼 200g", "芥末 少许", "酱油 1勺", "姜丝 少许"],
    steps: ["鱼切厚片", "配芥末酱油"] },
  { id: "rc54", name: "日式茶碗蒸", cuisine: "jp", type: "汤羹", main: "蛋", tags: ["清淡", "补钙"], kcal: 120, protein: 9, carb: 4, fat: 7, time: 20, serves: 2,
    ingredients: ["鸡蛋 2个", "高汤 200ml", "虾仁 2只", "蟹味菇 少许"],
    steps: ["蛋液过筛加高汤", "放配料", "中火蒸12分"] },
  { id: "rc55", name: "寿司卷", cuisine: "jp", type: "早餐", main: "主食", tags: ["低GI", "补钙"], kcal: 280, protein: 12, carb: 38, fat: 8, time: 25, serves: 2,
    ingredients: ["寿司米 1碗", "紫菜 2张", "三文鱼 100g", "牛油果 半个"],
    steps: ["米拌寿司醋", "铺料卷紧", "切件"] },
  { id: "rc56", name: "天妇罗虾", cuisine: "jp", type: "饭店菜", main: "虾", tags: ["高蛋白"], kcal: 300, protein: 20, carb: 24, fat: 14, time: 25, serves: 2,
    ingredients: ["大虾 8只", "低筋粉 80g", "冰水 100ml", "天妇罗粉 适量"],
    steps: ["虾去壳留尾", "调冰水面糊", "裹糊炸金黄", "配萝卜泥"] },
  { id: "rc62", name: "抹茶拿铁", cuisine: "jp", type: "咖啡", main: "饮", tags: [], kcal: 140, protein: 5, carb: 18, fat: 5, time: 4, serves: 1,
    ingredients: ["抹茶粉 1勺", "热牛奶 200ml", "蜂蜜 半勺"],
    steps: ["抹茶过筛", "加奶蜂蜜搅匀"] },

  // ===== 新增（v5.8.65 网络搜集扩充，每个分类补足） =====
  // 中餐 · 家常菜
  { id: "rc63", name: "醋溜白菜", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡", "减脂"], kcal: 80, protein: 3, carb: 12, fat: 4, time: 10, serves: 2,
    ingredients: ["白菜 半颗", "干辣椒 3个", "醋 1勺", "蒜 2瓣"],
    steps: ["白菜帮叶分开切", "热油爆香辣椒蒜", "下白菜大火炒", "沿锅边淋醋出锅"] },
  { id: "rc64", name: "红烧肉", cuisine: "cn", type: "家常菜", main: "猪", tags: ["补钙"], kcal: 480, protein: 22, carb: 15, fat: 38, time: 70, serves: 2,
    ingredients: ["五花肉 500g", "冰糖 20g", "生抽 2勺", "姜 3片", "八角 2个"],
    steps: ["五花肉切块焯水", "冰糖炒糖色", "下肉上色加香料", "加热水炖50分收汁"] },
  { id: "rc65", name: "鱼香茄子", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡"], kcal: 160, protein: 4, carb: 20, fat: 8, time: 18, serves: 2,
    ingredients: ["茄子 2根", "肉末 50g", "豆瓣酱 1勺", "醋 1勺", "糖 半勺"],
    steps: ["茄子切条煎软", "炒肉末豆瓣酱", "调鱼香汁下茄子", "收汁出锅"] },
  { id: "rc66", name: "红烧茄子", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡"], kcal: 180, protein: 4, carb: 22, fat: 9, time: 20, serves: 2,
    ingredients: ["茄子 2根", "蒜 3瓣", "生抽 2勺", "糖 半勺", "淀粉 少许"],
    steps: ["茄子切块煎软", "蒜末爆香", "调红烧汁焖3分", "勾芡收汁"] },
  { id: "rc67", name: "洋葱炒牛肉", cuisine: "cn", type: "家常菜", main: "牛", tags: ["高蛋白"], kcal: 280, protein: 26, carb: 12, fat: 14, time: 15, serves: 2,
    ingredients: ["牛肉 200g", "洋葱 1个", "黑胡椒 少许", "生抽 1勺", "蚝油 1勺"],
    steps: ["牛肉腌制滑炒盛出", "炒洋葱至软", "回锅牛肉", "黑胡椒蚝油翻炒"] },
  { id: "rc68", name: "黑椒牛柳", cuisine: "cn", type: "家常菜", main: "牛", tags: ["高蛋白"], kcal: 300, protein: 28, carb: 10, fat: 16, time: 15, serves: 2,
    ingredients: ["牛里脊 250g", "青椒 1个", "洋葱 半个", "黑椒酱 1勺", "蒜 2瓣"],
    steps: ["牛柳腌制滑炒", "炒香洋葱青椒", "加牛柳黑椒酱", "快速翻匀"] },
  { id: "rc69", name: "土豆烧牛肉", cuisine: "cn", type: "家常菜", main: "牛", tags: ["补铁"], kcal: 360, protein: 26, carb: 28, fat: 16, time: 60, serves: 2,
    ingredients: ["牛腩 400g", "土豆 2个", "胡萝卜 1根", "生抽 2勺", "姜 3片"],
    steps: ["牛腩焯水炖30分", "下土豆胡萝卜", "再炖20分", "调味收汁"] },
  { id: "rc70", name: "白灼虾", cuisine: "cn", type: "家常菜", main: "虾", tags: ["高蛋白", "补钙"], kcal: 160, protein: 24, carb: 2, fat: 5, time: 10, serves: 2,
    ingredients: ["鲜虾 300g", "姜 3片", "料酒 1勺", "生抽 1勺"],
    steps: ["水开加姜料酒", "下虾煮变红", "捞出过冰水", "生抽姜末蘸食"] },
  { id: "rc71", name: "油焖大虾", cuisine: "cn", type: "家常菜", main: "虾", tags: ["高蛋白"], kcal: 240, protein: 22, carb: 10, fat: 12, time: 15, serves: 2,
    ingredients: ["大虾 300g", "番茄酱 1勺", "糖 半勺", "姜 2片"],
    steps: ["虾煎至变红", "加姜爆香", "调糖醋汁焖", "收汁亮油"] },
  { id: "rc72", name: "红烧带鱼", cuisine: "cn", type: "家常菜", main: "鱼", tags: ["高蛋白", "补钙"], kcal: 280, protein: 24, carb: 8, fat: 16, time: 30, serves: 2,
    ingredients: ["带鱼 500g", "生抽 2勺", "糖 半勺", "姜 3片", "八角 1个"],
    steps: ["带鱼煎两面金黄", "爆香姜八角", "加调料水炖", "收汁"] },
  { id: "rc73", name: "酸菜鱼", cuisine: "cn", type: "家常菜", main: "鱼", tags: ["高蛋白"], kcal: 300, protein: 28, carb: 10, fat: 14, time: 25, serves: 2,
    ingredients: ["鱼片 300g", "酸菜 150g", "豆芽 100g", "干辣椒 5个", "蒜 3瓣"],
    steps: ["炒酸菜加汤", "下豆芽煮", "滑入鱼片煮3分", "辣椒蒜热油激"] },
  { id: "rc74", name: "干煸四季豆", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡", "减脂"], kcal: 180, protein: 6, carb: 18, fat: 10, time: 15, serves: 2,
    ingredients: ["四季豆 300g", "肉末 50g", "干辣椒 3个", "芽菜 1勺"],
    steps: ["四季豆干煸起皱", "炒肉末榨菜", "下四季豆翻炒", "调味出锅"] },
  { id: "rc75", name: "蚝油生菜", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡", "减脂", "低GI"], kcal: 90, protein: 3, carb: 8, fat: 5, time: 8, serves: 2,
    ingredients: ["生菜 1颗", "蒜 3瓣", "蚝油 1勺", "生抽 半勺"],
    steps: ["生菜焯水摆盘", "蒜末爆香", "加蚝油生抽水煮", "勾薄芡浇上"] },
  { id: "rc76", name: "虎皮青椒", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡", "减脂", "低GI"], kcal: 100, protein: 2, carb: 12, fat: 5, time: 8, serves: 2,
    ingredients: ["青椒 4个", "蒜 2瓣", "生抽 1勺", "醋 半勺", "糖 少许"],
    steps: ["青椒压扁小火煎出虎皮", "加蒜末", "调汁焖2分", "出锅"] },
  // 中餐 · 汤羹
  { id: "rc77", name: "酸辣汤", cuisine: "cn", type: "汤羹", main: "豆腐", tags: ["清淡"], kcal: 120, protein: 8, carb: 14, fat: 4, time: 12, serves: 2,
    ingredients: ["豆腐 半盒", "木耳 10g", "鸡蛋 1个", "醋 1勺", "白胡椒 少许"],
    steps: ["豆腐木耳切丝煮开", "加醋白胡椒", "勾芡", "淋蛋液滴香油"] },
  { id: "rc78", name: "三鲜汤", cuisine: "cn", type: "汤羹", main: "虾", tags: ["高蛋白", "补钙"], kcal: 150, protein: 16, carb: 6, fat: 6, time: 12, serves: 2,
    ingredients: ["虾仁 100g", "豆腐 半盒", "蘑菇 5朵", "小白菜 几棵"],
    steps: ["水开下豆腐蘑菇", "煮5分加虾仁", "下小白菜", "调味出锅"] },
  { id: "rc79", name: "丝瓜蛋汤", cuisine: "cn", type: "汤羹", main: "蛋", tags: ["清淡", "补钙"], kcal: 90, protein: 6, carb: 6, fat: 5, time: 8, serves: 2,
    ingredients: ["丝瓜 1根", "鸡蛋 1个", "姜 2片", "盐 适量"],
    steps: ["丝瓜去皮切块", "姜丝爆香炒丝瓜", "加水烧开", "淋蛋液调味"] },
  { id: "rc80", name: "萝卜丝汤", cuisine: "cn", type: "汤羹", main: "蔬", tags: ["清淡"], kcal: 70, protein: 2, carb: 12, fat: 2, time: 10, serves: 2,
    ingredients: ["白萝卜 半根", "虾仁 50g", "葱姜 少许", "盐 适量"],
    steps: ["萝卜切丝", "水开加萝卜煮5分", "加虾仁煮熟", "调味"] },
  { id: "rc81", name: "冬瓜肉丸汤", cuisine: "cn", type: "汤羹", main: "猪", tags: ["补钙"], kcal: 200, protein: 16, carb: 10, fat: 10, time: 30, serves: 2,
    ingredients: ["冬瓜 300g", "猪肉 200g", "葱姜 少许", "盐 适量"],
    steps: ["肉馅调味挤丸", "水开下丸子", "加冬瓜煮透", "调味"] },
  { id: "rc82", name: "番茄蛋汤", cuisine: "cn", type: "汤羹", main: "蛋", tags: ["清淡", "补钙"], kcal: 80, protein: 5, carb: 8, fat: 4, time: 10, serves: 2,
    ingredients: ["番茄 2个", "鸡蛋 1个", "葱花 少许", "盐 适量"],
    steps: ["番茄炒出汁加水", "淋蛋液", "调味撒葱花"] },
  { id: "rc83", name: "菌菇豆腐汤", cuisine: "cn", type: "汤羹", main: "豆腐", tags: ["清淡", "补钙"], kcal: 100, protein: 7, carb: 8, fat: 5, time: 15, serves: 2,
    ingredients: ["豆腐 半盒", "香菇 5朵", "金针菇 1把", "生抽 半勺"],
    steps: ["菌菇切片炒香", "加水煮开", "下豆腐煮3分", "调味"] },
  // 中餐 · 沙拉轻食
  { id: "rc84", name: "凉拌木耳", cuisine: "cn", type: "沙拉轻食", main: "蔬", tags: ["补铁", "减脂", "低GI"], kcal: 70, protein: 3, carb: 10, fat: 3, time: 10, serves: 2,
    ingredients: ["木耳 20g", "胡萝卜 半根", "蒜 2瓣", "醋 1勺", "生抽 半勺"],
    steps: ["木耳泡发焯水", "胡萝卜切丝焯水", "蒜末加醋生抽拌匀"] },
  { id: "rc85", name: "凉拌海带丝", cuisine: "cn", type: "沙拉轻食", main: "蔬", tags: ["补铁", "减脂", "低GI"], kcal: 60, protein: 2, carb: 10, fat: 2, time: 8, serves: 2,
    ingredients: ["海带丝 200g", "蒜 2瓣", "醋 1勺", "生抽 半勺", "辣椒油 几滴"],
    steps: ["海带丝焯水2分", "蒜末加醋生抽拌匀", "淋辣椒油"] },
  { id: "rc86", name: "白灼菜心", cuisine: "cn", type: "沙拉轻食", main: "蔬", tags: ["清淡", "减脂", "低GI"], kcal: 80, protein: 3, carb: 8, fat: 4, time: 8, serves: 2,
    ingredients: ["菜心 300g", "生抽 1勺", "蒸鱼豉油 半勺", "蒜 2瓣"],
    steps: ["菜心焯水摆盘", "淋蒸鱼豉油", "蒜末热油激"] },
  { id: "rc87", name: "西兰花沙拉", cuisine: "cn", type: "沙拉轻食", main: "蔬", tags: ["减脂", "低GI"], kcal: 120, protein: 5, carb: 12, fat: 6, time: 10, serves: 2,
    ingredients: ["西兰花 1颗", "小番茄 6个", "油醋汁 1勺", "黑胡椒 少许"],
    steps: ["西兰花焯水过凉", "加小番茄", "拌油醋汁黑胡椒"] },
  { id: "rc88", name: "牛油果鸡蛋沙拉", cuisine: "cn", type: "沙拉轻食", main: "蛋", tags: ["减脂", "低GI"], kcal: 220, protein: 8, carb: 10, fat: 18, time: 10, serves: 1,
    ingredients: ["牛油果 半个", "鸡蛋 2个", "柠檬汁 几滴", "黑胡椒 少许"],
    steps: ["鸡蛋煮熟切块", "牛油果切块", "拌柠檬汁黑胡椒"] },
  // 中餐 · 早餐
  { id: "rc89", name: "皮蛋瘦肉粥", cuisine: "cn", type: "早餐", main: "主食", tags: ["补铁"], kcal: 200, protein: 12, carb: 28, fat: 4, time: 40, serves: 2,
    ingredients: ["大米 80g", "皮蛋 2个", "瘦肉 100g", "姜 丝", "盐 适量"],
    steps: ["大米煮粥", "瘦肉皮蛋切粒", "下锅煮10分", "姜丝盐调味"] },
  { id: "rc90", name: "阳春面", cuisine: "cn", type: "早餐", main: "主食", tags: ["清淡"], kcal: 260, protein: 8, carb: 48, fat: 4, time: 12, serves: 1,
    ingredients: ["面条 100g", "葱 2根", "生抽 1勺", "香油 几滴", "高汤 1碗"],
    steps: ["面条煮熟", "碗底放生抽葱香油", "冲高汤", "捞面"] },
  { id: "rc91", name: "葱油花卷", cuisine: "cn", type: "早餐", main: "主食", tags: ["清淡"], kcal: 220, protein: 6, carb: 42, fat: 4, time: 30, serves: 2,
    ingredients: ["面粉 300g", "葱 3根", "酵母 3g", "油 1勺"],
    steps: ["发面擀开抹葱油", "卷起切段蒸15分"] },
  { id: "rc92", name: "杂粮粥", cuisine: "cn", type: "早餐", main: "主食", tags: ["低GI"], kcal: 160, protein: 5, carb: 32, fat: 2, time: 35, serves: 2,
    ingredients: ["小米 40g", "红豆 30g", "燕麦 30g", "红枣 3颗"],
    steps: ["杂粮泡洗", "同煮软烂"] },
  { id: "rc93", name: "蒸蛋羹", cuisine: "cn", type: "早餐", main: "蛋", tags: ["补钙", "清淡"], kcal: 90, protein: 8, carb: 3, fat: 5, time: 15, serves: 1,
    ingredients: ["鸡蛋 2个", "温水 150ml", "生抽 几滴", "葱花 少许"],
    steps: ["蛋液加温水过筛", "中火蒸10分", "淋生抽葱花"] },
  { id: "rc94", name: "奶香馒头", cuisine: "cn", type: "早餐", main: "主食", tags: ["清淡"], kcal: 200, protein: 6, carb: 38, fat: 3, time: 30, serves: 2,
    ingredients: ["面粉 300g", "牛奶 150ml", "酵母 3g", "糖 10g"],
    steps: ["牛奶和面发酵", "整形蒸15分"] },
  // 中餐 · 饭店菜
  { id: "rc95", name: "东坡肉", cuisine: "cn", type: "饭店菜", main: "猪", tags: ["补钙"], kcal: 520, protein: 20, carb: 18, fat: 42, time: 90, serves: 2,
    ingredients: ["五花肉 500g", "冰糖 20g", "生抽 2勺", "黄酒 2勺", "姜 3片"],
    steps: ["五花肉焯水切方块", "冰糖炒色", "加酒生抽姜炖60分", "收汁"] },
  { id: "rc96", name: "红烧狮子头", cuisine: "cn", type: "饭店菜", main: "猪", tags: ["补钙"], kcal: 360, protein: 22, carb: 16, fat: 22, time: 50, serves: 2,
    ingredients: ["猪肉 300g", "豆腐 50g", "鸡蛋 1个", "淀粉 少许", "姜 2片"],
    steps: ["肉馅加豆腐蛋淀粉", "挤大丸子煎定型", "加水炖30分"] },
  { id: "rc97", name: "水煮鱼", cuisine: "cn", type: "饭店菜", main: "鱼", tags: ["高蛋白"], kcal: 320, protein: 28, carb: 8, fat: 18, time: 30, serves: 2,
    ingredients: ["鱼片 300g", "豆芽 100g", "豆瓣酱 2勺", "干辣椒 花椒 适量"],
    steps: ["鱼片滑熟", "豆芽垫底", "炒红汤浇上", "辣椒花椒热油激"] },
  { id: "rc98", name: "糖醋鲤鱼", cuisine: "cn", type: "饭店菜", main: "鱼", tags: ["高蛋白", "补钙"], kcal: 300, protein: 24, carb: 22, fat: 12, time: 35, serves: 2,
    ingredients: ["鲤鱼 1条", "番茄酱 2勺", "白醋 1勺", "淀粉 适量"],
    steps: ["鱼裹淀粉炸酥", "炒糖醋汁", "浇鱼上"] },
  { id: "rc99", name: "辣子鸡", cuisine: "cn", type: "饭店菜", main: "鸡", tags: ["高蛋白"], kcal: 340, protein: 26, carb: 12, fat: 20, time: 30, serves: 2,
    ingredients: ["鸡腿 2个", "干辣椒 一把", "花椒 1勺", "蒜 3瓣"],
    steps: ["鸡块炸金黄", "辣椒花椒爆香", "下鸡块翻炒", "撒芝麻"] },
  // 中餐 · 甜点
  { id: "rc100", name: "绿豆沙", cuisine: "cn", type: "甜点", main: "主食", tags: ["补铁", "清淡"], kcal: 160, protein: 5, carb: 32, fat: 1, time: 40, serves: 2,
    ingredients: ["绿豆 150g", "冰糖 适量"],
    steps: ["绿豆泡发", "煮至软烂", "加冰糖打成沙"] },
  { id: "rc101", name: "冰糖雪梨羹", cuisine: "cn", type: "甜点", main: "主食", tags: ["清淡"], kcal: 120, protein: 1, carb: 30, fat: 1, time: 30, serves: 2,
    ingredients: ["雪梨 2个", "冰糖 适量", "枸杞 少许"],
    steps: ["雪梨切块", "加水煮软", "加冰糖枸杞"] },
  { id: "rc102", name: "姜汁撞奶", cuisine: "cn", type: "甜点", main: "主食", tags: ["补钙"], kcal: 150, protein: 6, carb: 18, fat: 5, time: 15, serves: 1,
    ingredients: ["牛奶 200ml", "姜 1块", "糖 1勺"],
    steps: ["姜榨汁", "牛奶加糖煮微沸", "冲入姜汁静置凝固"] },
  { id: "rc103", name: "双皮奶", cuisine: "cn", type: "甜点", main: "主食", tags: ["补钙"], kcal: 180, protein: 7, carb: 20, fat: 8, time: 25, serves: 2,
    ingredients: ["牛奶 250ml", "鸡蛋清 2个", "糖 1勺"],
    steps: ["牛奶煮温结皮", "倒出加蛋清糖", "回碗蒸10分"] },
  { id: "rc104", name: "芝麻糊", cuisine: "cn", type: "甜点", main: "主食", tags: ["补铁"], kcal: 170, protein: 5, carb: 26, fat: 6, time: 20, serves: 2,
    ingredients: ["黑芝麻 100g", "糯米粉 30g", "冰糖 适量"],
    steps: ["芝麻炒香打粉", "加水煮开勾糯米浆", "加冰糖"] },
  // 西餐
  { id: "rc105", name: "奶油蘑菇意面", cuisine: "west", type: "家常菜", main: "主食", tags: [], kcal: 420, protein: 14, carb: 56, fat: 16, time: 25, serves: 2,
    ingredients: ["意面 160g", "蘑菇 100g", "淡奶油 100ml", "蒜 2瓣", "芝士粉 1勺"],
    steps: ["意面煮8分", "蘑菇蒜炒香", "加奶油煮稠", "拌面撒芝士"] },
  { id: "rc106", name: "玛格丽特披萨", cuisine: "west", type: "饭店菜", main: "主食", tags: [], kcal: 380, protein: 15, carb: 50, fat: 14, time: 25, serves: 2,
    ingredients: ["披萨饼底 1张", "番茄酱 2勺", "马苏里拉 100g", "罗勒 几片"],
    steps: ["饼底抹番茄酱", "铺芝士罗勒", "烤箱200度15分"] },
  { id: "rc107", name: "汉堡排", cuisine: "west", type: "家常菜", main: "主食", tags: ["高蛋白"], kcal: 360, protein: 24, carb: 20, fat: 18, time: 25, serves: 2,
    ingredients: ["牛肉末 300g", "洋葱 半个", "鸡蛋 1个", "面包糠 2勺", "黑椒 少许"],
    steps: ["洋葱炒软拌肉", "煎肉饼两面金黄", "黑椒汁"] },
  { id: "rc108", name: "烤鸡腿", cuisine: "west", type: "饭店菜", main: "鸡", tags: ["高蛋白"], kcal: 320, protein: 26, carb: 10, fat: 18, time: 35, serves: 2,
    ingredients: ["鸡腿 2个", "迷迭香 少许", "柠檬 半个", "橄榄油 1勺"],
    steps: ["鸡腿用香草柠檬腌", "烤箱200度25分"] },
  { id: "rc109", name: "番茄炖鹰嘴豆", cuisine: "west", type: "家常菜", main: "蔬", tags: ["地中海", "清淡"], kcal: 220, protein: 9, carb: 32, fat: 7, time: 30, serves: 2,
    ingredients: ["鹰嘴豆 200g", "番茄 3个", "洋葱 半个", "橄榄油 1勺", "孜然 少许"],
    steps: ["洋葱番茄炒软", "加鹰嘴豆水炖20分", "橄榄油孜然"] },
  { id: "rc110", name: "凯撒沙拉", cuisine: "west", type: "沙拉轻食", main: "蔬", tags: ["减脂", "低GI"], kcal: 200, protein: 10, carb: 10, fat: 14, time: 10, serves: 1,
    ingredients: ["罗马生菜 1颗", "鸡胸 80g", "面包丁 少许", "帕玛森 20g", "凯撒酱 1勺"],
    steps: ["生菜撕块", "加鸡胸面包丁", "撒芝士拌凯撒酱"] },
  { id: "rc111", name: "牛油果沙拉", cuisine: "west", type: "沙拉轻食", main: "蔬", tags: ["减脂", "低GI", "地中海"], kcal: 200, protein: 4, carb: 12, fat: 16, time: 10, serves: 1,
    ingredients: ["牛油果 半个", "生菜 几片", "小番茄 5个", "橄榄油 1勺", "柠檬汁 几滴"],
    steps: ["牛油果番茄切块", "拌生菜", "橄榄油柠檬汁"] },
  { id: "rc112", name: "藜麦沙拉", cuisine: "west", type: "沙拉轻食", main: "主食", tags: ["减脂", "低GI", "地中海", "高蛋白"], kcal: 260, protein: 9, carb: 36, fat: 8, time: 20, serves: 1,
    ingredients: ["藜麦 60g", "黄瓜 半根", "小番茄 6个", "橄榄 10颗", "橄榄油 1勺"],
    steps: ["藜麦煮熟放凉", "加蔬果橄榄", "拌橄榄油柠檬"] },
  { id: "rc113", name: "吞拿鱼沙拉", cuisine: "west", type: "沙拉轻食", main: "鱼", tags: ["减脂", "低GI", "地中海", "高蛋白"], kcal: 220, protein: 22, carb: 6, fat: 10, time: 10, serves: 1,
    ingredients: ["吞拿鱼罐头 1罐", "生菜 几片", "小番茄 5个", "橄榄 8颗", "油醋汁 1勺"],
    steps: ["吞拿鱼沥干", "拌生菜番茄橄榄", "油醋汁"] },
  { id: "rc114", name: "法式洋葱汤", cuisine: "west", type: "汤羹", main: "蔬", tags: ["地中海"], kcal: 160, protein: 6, carb: 20, fat: 6, time: 40, serves: 2,
    ingredients: ["洋葱 2个", "高汤 500ml", "芝士片 2片", "法棍 2片"],
    steps: ["洋葱炒焦糖色", "加高汤煮20分", "放法棍芝士烤"] },
  { id: "rc115", name: "番茄海鲜浓汤", cuisine: "west", type: "汤羹", main: "鱼", tags: ["地中海", "高蛋白"], kcal: 180, protein: 18, carb: 12, fat: 6, time: 25, serves: 2,
    ingredients: ["番茄 3个", "虾仁 100g", "鱼片 100g", "蒜 2瓣", "橄榄油 1勺"],
    steps: ["番茄蒜炒沙", "加水煮开", "下海鲜煮熟"] },
  { id: "rc116", name: "蔬菜欧姆蛋", cuisine: "west", type: "早餐", main: "蛋", tags: ["地中海", "高蛋白"], kcal: 220, protein: 14, carb: 8, fat: 14, time: 12, serves: 1,
    ingredients: ["鸡蛋 3个", "菠菜 一把", "洋葱 半个", "蘑菇 3朵", "橄榄油 1勺"],
    steps: ["蔬菜炒软", "倒蛋液小火", "对折煎熟"] },
  { id: "rc117", name: "牛油果吐司", cuisine: "west", type: "早餐", main: "主食", tags: ["地中海", "减脂"], kcal: 240, protein: 8, carb: 28, fat: 10, time: 8, serves: 1,
    ingredients: ["全麦吐司 2片", "牛油果 半个", "柠檬汁 几滴", "海盐黑椒 少许"],
    steps: ["吐司烤香", "牛油果压泥抹上", "柠檬汁海盐黑椒"] },
  { id: "rc118", name: "香煎鳕鱼", cuisine: "west", type: "饭店菜", main: "鱼", tags: ["地中海", "高蛋白", "补钙"], kcal: 240, protein: 26, carb: 2, fat: 12, time: 15, serves: 1,
    ingredients: ["鳕鱼 200g", "柠檬 半个", "橄榄油 1勺", "黑椒 少许"],
    steps: ["鳕鱼擦干", "橄榄油煎两面", "挤柠檬黑椒"] },
  // 西餐 · 咖啡
  { id: "rc119", name: "摩卡", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 150, protein: 5, carb: 20, fat: 5, time: 4, serves: 1,
    ingredients: ["意式浓缩 1份", "巧克力酱 1勺", "热牛奶 150ml", "奶油 少许"],
    steps: ["萃取浓缩", "加巧克力酱牛奶", "挤奶油"] },
  { id: "rc120", name: "冰美式", cuisine: "west", type: "咖啡", main: "饮", tags: ["清淡"], kcal: 8, protein: 0, carb: 2, fat: 0, time: 3, serves: 1,
    ingredients: ["意式浓缩 1份", "冰水 150ml", "冰块 适量"],
    steps: ["杯中加冰", "倒浓缩加水"] },
  { id: "rc121", name: "焦糖玛奇朵", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 160, protein: 6, carb: 22, fat: 5, time: 4, serves: 1,
    ingredients: ["意式浓缩 1份", "热牛奶 150ml", "焦糖酱 1勺"],
    steps: ["萃取浓缩", "打奶泡倒入", "淋焦糖"] },
  // 韩餐
  { id: "rc122", name: "韩式蒸蛋", cuisine: "kr", type: "汤羹", main: "蛋", tags: ["补钙", "高蛋白"], kcal: 120, protein: 9, carb: 4, fat: 7, time: 15, serves: 2,
    ingredients: ["鸡蛋 3个", "高汤 200ml", "葱 少许", "香油 几滴"],
    steps: ["蛋液加高汤过筛", "中火蒸12分", "葱花香油"] },
  { id: "rc123", name: "辣炒鱿鱼", cuisine: "kr", type: "饭店菜", main: "鱼", tags: ["高蛋白"], kcal: 200, protein: 20, carb: 8, fat: 8, time: 15, serves: 2,
    ingredients: ["鱿鱼 300g", "洋葱 半个", "韩式辣酱 2勺", "葱 1根"],
    steps: ["鱿鱼切圈", "炒洋葱辣酱", "下鱿鱼炒熟"] },
  { id: "rc124", name: "春川辣炒鸡", cuisine: "kr", type: "家常菜", main: "鸡", tags: ["高蛋白"], kcal: 320, protein: 24, carb: 22, fat: 12, time: 30, serves: 2,
    ingredients: ["鸡腿 2个", "韩式辣酱 2勺", "洋葱 半个", "年糕 100g", "白菜 几片"],
    steps: ["鸡块用辣酱腌", "炒洋葱白菜", "下鸡块年糕炒收汁"] },
  { id: "rc125", name: "海带汤", cuisine: "kr", type: "汤羹", main: "蔬", tags: ["补铁"], kcal: 90, protein: 5, carb: 8, fat: 4, time: 25, serves: 2,
    ingredients: ["海带 20g", "牛肉 100g", "蒜 2瓣", "酱油 1勺"],
    steps: ["海带泡发", "牛肉蒜炒香", "加水炖20分调味"] },
  { id: "rc126", name: "海鲜煎饼", cuisine: "kr", type: "家常菜", main: "鱼", tags: ["高蛋白"], kcal: 260, protein: 14, carb: 28, fat: 10, time: 20, serves: 2,
    ingredients: ["面粉 100g", "虾仁 100g", "鱿鱼 100g", "韭菜 一把", "鸡蛋 1个"],
    steps: ["海鲜韭菜切丁", "调面糊", "煎两面金黄"] },
  { id: "rc127", name: "泡菜炒饭", cuisine: "kr", type: "家常菜", main: "主食", tags: ["快手"], kcal: 320, protein: 10, carb: 52, fat: 10, time: 15, serves: 1,
    ingredients: ["米饭 1碗", "泡菜 100g", "鸡蛋 1个", "洋葱 半个", "香油 几滴"],
    steps: ["炒洋葱泡菜", "下米饭炒匀", "煎蛋铺上"] },
  { id: "rc128", name: "韩式杂菜", cuisine: "kr", type: "家常菜", main: "主食", tags: ["快手"], kcal: 280, protein: 8, carb: 42, fat: 8, time: 20, serves: 2,
    ingredients: ["粉条 100g", "菠菜 一把", "胡萝卜 半根", "洋葱 半个", "酱油 1勺"],
    steps: ["粉条煮熟", "蔬菜分别炒", "拌酱油香油"] },
  { id: "rc129", name: "辣炒年糕", cuisine: "kr", type: "家常菜", main: "主食", tags: ["快手"], kcal: 300, protein: 6, carb: 60, fat: 6, time: 15, serves: 2,
    ingredients: ["年糕 200g", "韩式辣酱 2勺", "鱼饼 50g", "洋葱 半个", "糖 半勺"],
    steps: ["年糕煮软", "辣酱糖加水煮稠", "下鱼饼洋葱"] },
  // 日料
  { id: "rc130", name: "玉子烧", cuisine: "jp", type: "早餐", main: "蛋", tags: ["补钙"], kcal: 160, protein: 9, carb: 12, fat: 9, time: 15, serves: 1,
    ingredients: ["鸡蛋 3个", "高汤 3勺", "糖 半勺", "盐 少许", "油 几滴"],
    steps: ["蛋液加糖盐高汤", "小火分层卷", "切块"] },
  { id: "rc131", name: "亲子丼", cuisine: "jp", type: "家常菜", main: "鸡", tags: ["高蛋白"], kcal: 520, protein: 28, carb: 60, fat: 14, time: 20, serves: 1,
    ingredients: ["鸡腿 200g", "洋葱 半个", "鸡蛋 3个", "米饭 1碗", "酱油 2勺"],
    steps: ["洋葱鸡肉煮", "淋蛋液半熟", "铺米饭上"] },
  { id: "rc132", name: "豚汁", cuisine: "jp", type: "汤羹", main: "猪", tags: ["补钙"], kcal: 180, protein: 10, carb: 16, fat: 8, time: 30, serves: 2,
    ingredients: ["五花肉 100g", "萝卜 半根", "胡萝卜 半根", "魔芋 1块", "味噌 2勺"],
    steps: ["蔬菜切块煮软", "下肉片", "味噌化开不沸"] },
  { id: "rc133", name: "黄油煎山药", cuisine: "jp", type: "沙拉轻食", main: "蔬", tags: ["清淡"], kcal: 150, protein: 3, carb: 22, fat: 6, time: 12, serves: 1,
    ingredients: ["山药 200g", "黄油 1小块", "盐 少许", "黑胡椒 少许"],
    steps: ["山药切片", "黄油小火煎", "撒盐黑胡椒"] },
  { id: "rc134", name: "关东煮", cuisine: "jp", type: "汤羹", main: "鱼", tags: ["补钙"], kcal: 160, protein: 12, carb: 14, fat: 6, time: 30, serves: 2,
    ingredients: ["萝卜 半根", "鱼丸 5个", "魔芋结 5个", "高汤 500ml", "酱油 1勺"],
    steps: ["萝卜切块煮软", "加鱼丸魔芋结", "高汤酱油炖20分"] },
  { id: "rc135", name: "日式炸猪排", cuisine: "jp", type: "饭店菜", main: "猪", tags: ["高蛋白"], kcal: 480, protein: 24, carb: 30, fat: 26, time: 25, serves: 2,
    ingredients: ["猪里脊 300g", "面包糠 适量", "鸡蛋 1个", "面粉 适量", "高丽菜 几片"],
    steps: ["猪排裹粉蛋糠", "炸金黄", "配高丽菜丝"] },
  { id: "rc136", name: "牛肉饭", cuisine: "jp", type: "家常菜", main: "牛", tags: ["高蛋白"], kcal: 480, protein: 22, carb: 58, fat: 14, time: 25, serves: 1,
    ingredients: ["肥牛 200g", "洋葱 1个", "米饭 1碗", "酱油 2勺", "糖 半勺"],
    steps: ["洋葱炒软", "下肥牛酱油糖", "铺米饭上"] },
  { id: "rc137", name: "乌冬面", cuisine: "jp", type: "家常菜", main: "主食", tags: ["清淡"], kcal: 320, protein: 10, carb: 60, fat: 6, time: 15, serves: 1,
    ingredients: ["乌冬面 1份", "高汤 1碗", "鱼饼 2片", "葱花 少许", "酱油 1勺"],
    steps: ["高汤煮开", "下乌冬鱼饼", "葱花酱油"] },
  { id: "rc138", name: "日式咖喱饭", cuisine: "jp", type: "家常菜", main: "主食", tags: ["补钙"], kcal: 460, protein: 16, carb: 64, fat: 14, time: 30, serves: 1,
    ingredients: ["鸡腿 200g", "土豆 1个", "胡萝卜 半根", "咖喱块 2块", "米饭 1碗"],
    steps: ["鸡肉蔬菜炖软", "下咖喱块化开", "配米饭"] },

  // ============================================================
  // v5.8.66 扩充：咖啡 / 甜点 / 饮品 / 酒类 / 家常菜 / 饭店菜 / 其他国际菜系
  // ============================================================
  // ---------- 西餐 · 咖啡（新增） ----------
  { id: "rc139", name: "浓缩 Espresso", cuisine: "west", type: "咖啡", main: "饮", tags: ["清淡"], kcal: 5, protein: 0, carb: 1, fat: 0, time: 3, serves: 1,
    ingredients: ["咖啡粉 18g", "水 30ml"],
    steps: ["咖啡机填粉压实", "9bar 萃取 25-30 秒", "得 30ml 浓缩"] },
  { id: "rc140", name: "馥芮白 Flat White", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 120, protein: 6, carb: 11, fat: 5, time: 4, serves: 1,
    ingredients: ["浓缩咖啡 1份", "全脂牛奶 150ml"],
    steps: ["萃取浓缩", "奶泡打至细密微泡", "注入杯中成形"] },
  { id: "rc141", name: "可塔朵 Cortado", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 90, protein: 5, carb: 8, fat: 4, time: 4, serves: 1,
    ingredients: ["浓缩咖啡 1份", "热牛奶 60ml"],
    steps: ["萃取浓缩", "加热牛奶不打泡", "等量注入"] },
  { id: "rc142", name: "脏脏咖啡 Dirty", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 110, protein: 5, carb: 10, fat: 5, time: 4, serves: 1,
    ingredients: ["冰牛奶 150ml", "浓缩咖啡 1份"],
    steps: ["杯中倒冰牛奶", "趁热淋浓缩浮于表面", "不搅拌直接喝"] },
  { id: "rc143", name: "冷萃咖啡 Cold Brew", cuisine: "west", type: "咖啡", main: "饮", tags: ["清淡"], kcal: 8, protein: 0, carb: 2, fat: 0, time: 600, serves: 2,
    ingredients: ["粗磨咖啡粉 50g", "冷水 500ml"],
    steps: ["粉水混合", "冷藏浸泡 12 小时", "滤出即饮可加冰"] },
  { id: "rc144", name: "燕麦拿铁 Oat Latte", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 130, protein: 4, carb: 18, fat: 4, time: 4, serves: 1,
    ingredients: ["浓缩咖啡 1份", "燕麦奶 150ml"],
    steps: ["萃取浓缩", "燕麦奶加热打泡", "注入杯中"] },
  { id: "rc145", name: "椰青美式 Coconut Americano", cuisine: "west", type: "咖啡", main: "饮", tags: ["清淡"], kcal: 15, protein: 0, carb: 3, fat: 0, time: 3, serves: 1,
    ingredients: ["浓缩咖啡 1份", "椰子水 120ml", "冰 适量"],
    steps: ["杯中加冰与椰子水", "淋入浓缩", "轻搅"] },
  { id: "rc146", name: "香草拿铁 Vanilla Latte", cuisine: "west", type: "咖啡", main: "饮", tags: [], kcal: 150, protein: 6, carb: 20, fat: 5, time: 4, serves: 1,
    ingredients: ["浓缩咖啡 1份", "牛奶 150ml", "香草糖浆 15ml"],
    steps: ["杯底加香草糖浆", "加牛奶打泡", "淋浓缩拉花"] },
  // ---------- 甜点（新增） ----------
  { id: "rc147", name: "纽约芝士蛋糕", cuisine: "west", type: "甜点", main: "主食", tags: [], kcal: 380, protein: 8, carb: 34, fat: 24, time: 60, serves: 8,
    ingredients: ["奶油芝士 500g", "消化饼 150g", "糖 100g", "鸡蛋 2个", "淡奶油 100ml"],
    steps: ["饼底压碎铺模", "芝士加糖蛋奶油打顺", "水浴烤 50 分钟冷藏"] },
  { id: "rc148", name: "巧克力布朗尼", cuisine: "west", type: "甜点", main: "主食", tags: [], kcal: 350, protein: 5, carb: 40, fat: 20, time: 40, serves: 9,
    ingredients: ["黑巧克力 150g", "黄油 120g", "鸡蛋 2个", "糖 100g", "低粉 80g"],
    steps: ["巧克力黄油融化", "加蛋糖拌匀", "拌粉入模烤 25 分钟"] },
  { id: "rc149", name: "法式马卡龙", cuisine: "west", type: "甜点", main: "主食", tags: [], kcal: 150, protein: 3, carb: 24, fat: 5, time: 45, serves: 12,
    ingredients: ["杏仁粉 100g", "糖粉 100g", "蛋白 2个", "细砂糖 30g"],
    steps: ["蛋白打发加糖", "拌入粉类挤圆", "晾皮后 150℃ 烤 13 分钟夹馅"] },
  { id: "rc150", name: "桂花糕", cuisine: "cn", type: "甜点", main: "主食", tags: ["补铁"], kcal: 160, protein: 3, carb: 34, fat: 1, time: 30, serves: 4,
    ingredients: ["糯米粉 150g", "糖 60g", "干桂花 5g", "温水 180ml"],
    steps: ["粉糖温水调糊", "撒桂花", "蒸 20 分钟放凉切块"] },
  { id: "rc151", name: "马蹄糕", cuisine: "cn", type: "甜点", main: "主食", tags: [], kcal: 140, protein: 2, carb: 32, fat: 1, time: 35, serves: 4,
    ingredients: ["马蹄粉 150g", "冰糖 80g", "清水 600ml", "马蹄 100g"],
    steps: ["粉调浆", "糖水煮马蹄", "混合蒸凝固切块"] },
  { id: "rc152", name: "日式大福", cuisine: "jp", type: "甜点", main: "主食", tags: [], kcal: 180, protein: 3, carb: 34, fat: 4, time: 30, serves: 6,
    ingredients: ["糯米粉 150g", "糖 40g", "红豆沙 200g", "玉米淀粉 适量"],
    steps: ["糯米粉加糖蒸成团", "分小剂包豆沙", "裹淀粉防粘"] },
  // ---------- 饮品（新增） ----------
  { id: "rc153", name: "酸梅汤", cuisine: "cn", type: "饮品", main: "饮", tags: ["清淡"], kcal: 80, protein: 0, carb: 20, fat: 0, time: 40, serves: 4,
    ingredients: ["乌梅 30g", "山楂 15g", "甘草 5g", "冰糖 50g", "水 1.5L"],
    steps: ["材料浸泡", "煮 30 分钟", "滤出加冰"] },
  { id: "rc154", name: "冰糖雪梨水", cuisine: "cn", type: "饮品", main: "饮", tags: ["清淡"], kcal: 60, protein: 0, carb: 15, fat: 0, time: 30, serves: 2,
    ingredients: ["雪梨 1个", "冰糖 20g", "枸杞 5g", "水 800ml"],
    steps: ["雪梨切块", "与冰糖同煮", "撒枸杞"] },
  { id: "rc155", name: "桂圆红枣茶", cuisine: "cn", type: "饮品", main: "饮", tags: ["补铁"], kcal: 90, protein: 1, carb: 22, fat: 0, time: 25, serves: 2,
    ingredients: ["桂圆 15颗", "红枣 6颗", "红糖 10g", "水 800ml"],
    steps: ["红枣去核", "与桂圆同煮", "加红糖"] },
  { id: "rc156", name: "菊花枸杞茶", cuisine: "cn", type: "饮品", main: "饮", tags: ["清淡"], kcal: 30, protein: 0, carb: 7, fat: 0, time: 10, serves: 2,
    ingredients: ["白菊花 5g", "枸杞 5g", "热水 500ml"],
    steps: ["材料入杯", "冲入热水", "焖 5 分钟"] },
  { id: "rc157", name: "柠檬蜂蜜水", cuisine: "cn", type: "饮品", main: "饮", tags: ["清淡", "低GI"], kcal: 50, protein: 0, carb: 13, fat: 0, time: 5, serves: 1,
    ingredients: ["柠檬 半个", "蜂蜜 15ml", "温水 300ml"],
    steps: ["柠檬切片", "温水冲泡", "加蜂蜜"] },
  { id: "rc158", name: "莓果冰沙", cuisine: "west", type: "饮品", main: "饮", tags: ["补铁"], kcal: 120, protein: 1, carb: 28, fat: 1, time: 5, serves: 2,
    ingredients: ["冷冻莓果 200g", "香蕉 1根", "酸奶 100ml", "冰 适量"],
    steps: ["材料入 blender", "打至顺滑", "倒杯"] },
  { id: "rc159", name: "香蕉奶昔", cuisine: "west", type: "饮品", main: "饮", tags: ["补钙"], kcal: 180, protein: 5, carb: 30, fat: 5, time: 5, serves: 1,
    ingredients: ["香蕉 1根", "牛奶 250ml", "冰 适量"],
    steps: ["香蕉切块", "与牛奶打匀", "加冰"] },
  { id: "rc160", name: "柠檬苏打", cuisine: "west", type: "饮品", main: "饮", tags: ["清淡"], kcal: 40, protein: 0, carb: 10, fat: 0, time: 3, serves: 1,
    ingredients: ["柠檬 半个", "苏打水 250ml", "薄荷 少许", "冰 适量"],
    steps: ["柠檬挤汁", "加苏打水与冰", "点缀薄荷"] },
  { id: "rc161", name: "热巧克力", cuisine: "west", type: "饮品", main: "饮", tags: ["补钙"], kcal: 200, protein: 5, carb: 26, fat: 9, time: 5, serves: 1,
    ingredients: ["黑巧克力 40g", "牛奶 250ml", "奶油 适量"],
    steps: ["巧克力隔水融化", "加温牛奶搅匀", "淋奶油"] },
  { id: "rc162", name: "泰式奶茶", cuisine: "other", type: "饮品", main: "饮", tags: [], kcal: 200, protein: 1, carb: 34, fat: 6, time: 10, serves: 2,
    ingredients: ["泰式红茶 20g", "炼乳 40ml", "牛奶 200ml", "水 500ml"],
    steps: ["红茶煮浓", "加炼乳牛奶", "冰镇"] },
  { id: "rc163", name: "印度香料奶茶 Chai", cuisine: "other", type: "饮品", main: "饮", tags: [], kcal: 180, protein: 1, carb: 30, fat: 5, time: 12, serves: 2,
    ingredients: ["红茶 10g", "豆蔻 2颗", "肉桂 1段", "牛奶 300ml", "糖 15g"],
    steps: ["香料煮水", "加茶与奶", "滤出加糖"] },
  { id: "rc164", name: "椰子水", cuisine: "other", type: "饮品", main: "饮", tags: ["清淡", "低GI"], kcal: 60, protein: 0, carb: 15, fat: 0, time: 2, serves: 1,
    ingredients: ["椰子水 300ml", "青柠 半个", "冰 适量"],
    steps: ["椰子水入杯", "挤青柠", "加冰"] },
  { id: "rc165", name: "柚子茶", cuisine: "jp", type: "饮品", main: "饮", tags: ["补铁"], kcal: 90, protein: 0, carb: 22, fat: 0, time: 5, serves: 1,
    ingredients: ["柚子茶酱 30g", "温水 300ml"],
    steps: ["舀柚子酱入杯", "冲温水搅匀"] },
  { id: "rc166", name: "焙茶", cuisine: "jp", type: "饮品", main: "饮", tags: ["清淡"], kcal: 5, protein: 0, carb: 1, fat: 0, time: 3, serves: 1,
    ingredients: ["焙茶 5g", "热水 300ml"],
    steps: ["茶叶入壶", "90℃ 水冲泡", "30 秒出汤"] },
  // ---------- 酒类（新增） ----------
  { id: "rc167", name: "莫吉托(含酒精)", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 150, protein: 0, carb: 12, fat: 0, time: 5, serves: 1,
    ingredients: ["白朗姆 45ml", "青柠 半个", "薄荷 10片", "苏打水 适量", "糖 10g"],
    steps: ["青柠糖薄荷捣压", "加朗姆", "补苏打水加冰"] },
  { id: "rc168", name: "金汤力 Gin Tonic", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 120, protein: 0, carb: 8, fat: 0, time: 3, serves: 1,
    ingredients: ["金酒 45ml", "汤力水 150ml", "青柠 1角", "冰 适量"],
    steps: ["杯中加冰", "倒金酒", "补汤力水挤青柠"] },
  { id: "rc169", name: "长岛冰茶", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 220, protein: 0, carb: 18, fat: 0, time: 5, serves: 1,
    ingredients: ["伏特加 15ml", "朗姆 15ml", "金酒 15ml", "龙舌兰 15ml", "可乐 适量", "柠檬 1角"],
    steps: ["基酒入杯加冰", "补可乐", "挤柠檬"] },
  { id: "rc170", name: "血腥玛丽", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 120, protein: 1, carb: 8, fat: 0, time: 5, serves: 1,
    ingredients: ["伏特加 45ml", "番茄汁 120ml", "柠檬汁 10ml", "辣酱 少许", "盐 适量"],
    steps: ["伏特加加番茄汁", "调柠檬辣酱盐", "加冰搅"] },
  { id: "rc171", name: "威士忌酸", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 160, protein: 0, carb: 10, fat: 0, time: 4, serves: 1,
    ingredients: ["威士忌 45ml", "柠檬汁 20ml", "糖浆 15ml", "蛋白 半个", "冰 适量"],
    steps: ["材料摇和", "滤入杯", "点缀"] },
  { id: "rc172", name: "龙舌兰日出", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 180, protein: 0, carb: 16, fat: 0, time: 4, serves: 1,
    ingredients: ["龙舌兰 45ml", "橙汁 120ml", "石榴糖浆 15ml", "冰 适量"],
    steps: ["龙舌兰橙汁加冰", "沿杯淋石榴糖浆", "自然分层"] },
  { id: "rc173", name: "白俄罗斯", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 200, protein: 1, carb: 14, fat: 9, time: 3, serves: 1,
    ingredients: ["伏特加 45ml", "咖啡利口酒 20ml", "鲜奶油 30ml", "冰 适量"],
    steps: ["伏特加利口酒加冰", "缓缓淋奶油"] },
  { id: "rc174", name: "代基里 Daiquiri", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 150, protein: 0, carb: 12, fat: 0, time: 4, serves: 1,
    ingredients: ["白朗姆 45ml", "柠檬汁 25ml", "糖浆 15ml", "冰 适量"],
    steps: ["材料摇和", "滤入冰杯"] },
  { id: "rc175", name: "古典 Old Fashioned", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 180, protein: 0, carb: 12, fat: 0, time: 4, serves: 1,
    ingredients: ["波本威士忌 45ml", "方糖 1块", "苦精 2滴", "水 1勺", "橙皮 1片"],
    steps: ["糖苦精加水化开", "加威士忌冰", "橙皮拭杯"] },
  { id: "rc176", name: "内格罗尼 Negroni", cuisine: "west", type: "酒类", main: "饮", tags: [], kcal: 180, protein: 0, carb: 12, fat: 0, time: 3, serves: 1,
    ingredients: ["金酒 30ml", "金巴利 30ml", "红味美思 30ml", "橙皮 1片", "冰 适量"],
    steps: ["三酒加冰搅匀", "橙皮装饰"] },
  { id: "rc177", name: "梅酒(青梅酒)", cuisine: "jp", type: "酒类", main: "饮", tags: [], kcal: 120, protein: 0, carb: 14, fat: 0, time: 3, serves: 1,
    ingredients: ["梅酒 60ml", "苏打水 60ml", "冰 适量", "青梅 2颗"],
    steps: ["梅酒加冰", "补苏打水", "放青梅"] },
  { id: "rc178", name: "清酒苏打", cuisine: "jp", type: "酒类", main: "饮", tags: ["清淡"], kcal: 100, protein: 0, carb: 6, fat: 0, time: 3, serves: 1,
    ingredients: ["清酒 60ml", "苏打水 100ml", "冰 适量", "柠檬 1角"],
    steps: ["清酒加冰", "补苏打水", "挤柠檬"] },
  { id: "rc179", name: "烧酒 Highball", cuisine: "kr", type: "酒类", main: "饮", tags: [], kcal: 90, protein: 0, carb: 5, fat: 0, time: 3, serves: 1,
    ingredients: ["烧酒 45ml", "苏打水 120ml", "冰 适量", "柠檬 1角"],
    steps: ["烧酒加冰", "补苏打水", "挤柠檬"] },
  { id: "rc180", name: "马格利米酒", cuisine: "kr", type: "酒类", main: "饮", tags: [], kcal: 110, protein: 0, carb: 18, fat: 0, time: 3, serves: 1,
    ingredients: ["马格利 150ml", "冰 适量"],
    steps: ["马格利倒杯", "加冰"] },
  // ---------- 家常菜（新增） ----------
  { id: "rc181", name: "醋溜白菜", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["清淡", "快手"], kcal: 90, protein: 2, carb: 12, fat: 4, time: 10, serves: 2,
    ingredients: ["白菜 300g", "醋 1勺", "蒜 2瓣", "糖 半勺", "盐 适量"],
    steps: ["白菜切段", "爆香蒜", "快炒加醋糖盐"] },
  { id: "rc182", name: "红烧茄子", cuisine: "cn", type: "家常菜", main: "蔬", tags: ["快手"], kcal: 160, protein: 3, carb: 18, fat: 9, time: 20, serves: 2,
    ingredients: ["茄子 2根", "生抽 1勺", "糖 半勺", "蒜 2瓣", "淀粉 少许"],
    steps: ["茄子切块煎软", "调生抽糖汁", "回锅收汁"] },
  // ---------- 饭店菜（新增） ----------
  { id: "rc183", name: "韩式炸鸡", cuisine: "kr", type: "饭店菜", main: "鸡", tags: [], kcal: 450, protein: 24, carb: 30, fat: 26, time: 30, serves: 2,
    ingredients: ["鸡翅 500g", "炸粉 适量", "韩式辣酱 2勺", "蜂蜜 1勺", "蒜 3瓣"],
    steps: ["鸡肉裹粉炸两遍", "调辣酱蜂蜜蒜汁", "裹酱撒芝麻"] },
  { id: "rc184", name: "部队锅", cuisine: "kr", type: "饭店菜", main: "锅", tags: ["高蛋白"], kcal: 350, protein: 22, carb: 20, fat: 18, time: 25, serves: 3,
    ingredients: ["午餐肉 100g", "年糕 100g", "泡菜 150g", "芝士片 2片", "辣酱 1勺"],
    steps: ["锅中铺泡菜年糕", "加午餐肉加水", "煮开铺芝士"] },
  { id: "rc185", name: "泰式冬阴功汤", cuisine: "other", type: "饭店菜", main: "海鲜", tags: ["低GI"], kcal: 180, protein: 16, carb: 10, fat: 8, time: 25, serves: 2,
    ingredients: ["虾 200g", "香茅 2根", "柠檬叶 4片", "椰浆 100ml", "冬阴功酱 2勺"],
    steps: ["香茅柠檬叶煮水", "下虾与酱", "加椰浆煮沸"] },
  { id: "rc186", name: "泰式绿咖喱鸡", cuisine: "other", type: "饭店菜", main: "鸡", tags: ["低GI"], kcal: 320, protein: 22, carb: 12, fat: 20, time: 30, serves: 2,
    ingredients: ["鸡腿 300g", "绿咖喱酱 2勺", "椰浆 200ml", "茄子 1个", "罗勒 少许"],
    steps: ["咖喱酱炒香", "加椰浆鸡块", "炖熟加茄罗勒"] },
  { id: "rc187", name: "越南河粉 Pho", cuisine: "other", type: "饭店菜", main: "牛", tags: [], kcal: 380, protein: 26, carb: 48, fat: 8, time: 60, serves: 2,
    ingredients: ["牛骨 500g", "牛肉片 150g", "河粉 200g", "八角 2颗", "豆芽 适量"],
    steps: ["牛骨香料熬汤", "河粉烫熟", "摆碗浇汤放牛肉"] },
  { id: "rc188", name: "印度咖喱鸡", cuisine: "other", type: "饭店菜", main: "鸡", tags: ["低GI"], kcal: 350, protein: 24, carb: 18, fat: 20, time: 35, serves: 2,
    ingredients: ["鸡腿 300g", "咖喱粉 2勺", "番茄 2个", "洋葱 1个", "椰浆 100ml"],
    steps: ["洋葱炒软", "加咖喱粉番茄", "下鸡块椰浆炖"] },
  { id: "rc189", name: "墨西哥牛肉塔可", cuisine: "other", type: "饭店菜", main: "牛", tags: [], kcal: 300, protein: 18, carb: 30, fat: 12, time: 20, serves: 2,
    ingredients: ["塔可饼 4张", "牛肉末 200g", "番茄 1个", "牛油果 1个", "芝士碎 适量"],
    steps: ["牛肉末炒香", "饼皮加热", "铺料折叠"] },
  { id: "rc190", name: "希腊穆萨卡", cuisine: "other", type: "饭店菜", main: "牛", tags: ["地中海"], kcal: 400, protein: 22, carb: 22, fat: 24, time: 70, serves: 4,
    ingredients: ["茄子 2根", "牛肉末 300g", "番茄 2个", "土豆 2个", "芝士 100g"],
    steps: ["茄子土豆煎软", "牛肉番茄炒酱", "分层焗芝士"] },
  { id: "rc191", name: "越南春卷", cuisine: "other", type: "饭店菜", main: "海鲜", tags: ["低GI", "清淡"], kcal: 150, protein: 10, carb: 18, fat: 3, time: 20, serves: 2,
    ingredients: ["米纸 6张", "虾仁 150g", "生菜 适量", "米粉 50g", "薄荷 少许"],
    steps: ["虾仁煮熟", "米纸泡软", "包料卷紧配蘸水"] },
  { id: "rc192", name: "新加坡辣椒蟹", cuisine: "other", type: "饭店菜", main: "海鲜", tags: [], kcal: 300, protein: 22, carb: 16, fat: 14, time: 30, serves: 2,
    ingredients: ["螃蟹 1只", "番茄酱 3勺", "辣椒 2个", "蛋 1个", "蒜 3瓣"],
    steps: ["蟹块煎香", "炒番茄辣椒酱", "淋蛋花收汁"] },
  { id: "rc193", name: "日式天妇罗", cuisine: "jp", type: "饭店菜", main: "海鲜", tags: [], kcal: 280, protein: 14, carb: 24, fat: 14, time: 25, serves: 2,
    ingredients: ["虾 200g", "茄子 1个", "天妇罗粉 100g", "冰水 150ml", "萝卜泥 适量"],
    steps: ["粉调冰水糊", "食材裹糊炸", "配萝卜泥酱油"] },
  { id: "rc194", name: "法式红酒炖牛肉", cuisine: "west", type: "饭店菜", main: "牛", tags: [], kcal: 420, protein: 26, carb: 14, fat: 26, time: 120, serves: 3,
    ingredients: ["牛腩 400g", "红酒 200ml", "胡萝卜 2根", "洋葱 1个", "番茄膏 1勺"],
    steps: ["牛肉煎上色", "加红酒蔬菜", "小火炖 1.5 小时"] }
];

// 地中海饮食中文标注（菜名中文说明，便于理解模板）
var RECIPE_NOTES = {
  "rc34": "地中海经典：优质红肉配芦笋，橄榄油香煎，富含蛋白与膳食纤维",
  "rc36": "地中海家常：番茄为基底，全麦意面，培根点缀",
  "rc37": "地中海蔬菜汤：多种根茎蔬菜炖煮，清淡暖胃",
  "rc38": "希腊国菜：黄瓜番茄橄榄菲达奶酪，橄榄油柠檬汁拌匀",
  "rc39": "地中海标志：富含Omega-3的深海鱼，柠檬橄榄油香煎",
  "rc40": "地中海轻食：全麦+虾仁+蛋，高蛋白低GI",
  "rc41": "地中海烤蔬菜：西葫芦彩椒茄子，迷迭香橄榄油烤",
  "rc42": "地中海早餐：燕麦+希腊酸奶+坚果莓果，益生菌满满",
  "rc43": "地中海汤品：南瓜洋葱牛奶打成，清甜丝滑",
  "rc109": "地中海炖菜：番茄洋葱炖鹰嘴豆，植物蛋白与纤维",
  "rc111": "地中海沙拉：牛油果生菜番茄，橄榄油柠檬汁",
  "rc112": "地中海主食：藜麦+蔬果，低GI高纤维",
  "rc113": "地中海轻食：吞拿鱼+生菜，高蛋白低GI",
  "rc114": "地中海汤品：焦糖洋葱+高汤，撒芝士烤",
  "rc115": "地中海海鲜汤：番茄+虾仁+鱼，橄榄油炖",
  "rc116": "地中海早餐：蔬菜鸡蛋欧姆蛋，橄榄油煎",
  "rc117": "地中海早餐：全麦吐司+牛油果，撒海盐黑椒",
  "rc118": "地中海鱼料理：鳕鱼柠檬橄榄油香煎，富含DHA",
  "rc190": "地中海经典：茄子土豆牛肉千层，番茄香料，焗芝士，植物与动物蛋白兼具"
};
function recipeNote(id) { return RECIPE_NOTES[id] || ""; }


// ============================================================
// 数据初始化
// ============================================================
function ensureRecipes() {
  if (!DB.data.growth) DB.data.growth = {};
  if (!DB.data.growth.recipes) {
    DB.data.growth.recipes = { favs: [], plans: {}, lastGoal: "healthy", lastOpts: {} };
  }
  var r = DB.data.growth.recipes;
  if (!r.favs) r.favs = [];
  if (!r.plans) r.plans = {};
  if (!r.lastGoal) r.lastGoal = "healthy";
  if (!r.lastOpts) r.lastOpts = {};
  if (!r.dietPlan) r.dietPlan = null;
  if (!r.onHandSel) r.onHandSel = [];
  if (!r.shopping) r.shopping = [];
  return r;
}

// ============================================================
// 纯函数（无 DOM 依赖，便于自动化测试）
// ============================================================
function recipeById(id) {
  for (var i = 0; i < RECIPE_DB.length; i++) if (RECIPE_DB[i].id === id) return RECIPE_DB[i];
  return null;
}
function filterRecipes(opts) {
  opts = opts || {};
  var list = RECIPE_DB.slice();
  if (opts.cuisine && opts.cuisine !== "all") list = list.filter(function (r) { return r.cuisine === opts.cuisine; });
  if (opts.type && opts.type !== "all") list = list.filter(function (r) { return r.type === opts.type; });
  if (opts.tag && opts.tag !== "all") list = list.filter(function (r) { return (r.tags || []).indexOf(opts.tag) >= 0; });
  if (opts.query) {
    var q = String(opts.query).trim().toLowerCase();
    if (q) list = list.filter(function (r) {
      return (r.name + " " + (r.tags || []).join(" ") + " " + (r.main || "")).toLowerCase().indexOf(q) >= 0;
    });
  }
  return list;
}
function recipeNutritionTotal(ids) {
  var t = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  (ids || []).forEach(function (id) {
    var r = recipeById(id);
    if (r) { t.kcal += r.kcal; t.protein += r.protein; t.carb += r.carb; t.fat += r.fat; }
  });
  return t;
}
function cuisineName(id) {
  for (var i = 0; i < RECIPE_CUISINES.length; i++) if (RECIPE_CUISINES[i].id === id) return RECIPE_CUISINES[i].name;
  return id;
}

// 饮食目标定义（每日目标热量与供能比）
var DIET_GOALS = {
  healthy: { id: "healthy", name: "健康维持", kcal: 2000, carbPct: 50, proPct: 25, fatPct: 25, desc: "均衡营养，适合日常维持体重", filter: {} },
  lose: { id: "lose", name: "减脂", kcal: 1500, carbPct: 40, proPct: 35, fatPct: 25, desc: "控热量高蛋白，优先减脂 / 低GI / 沙拉轻食", filter: { tag: "减脂" } },
  muscle: { id: "muscle", name: "增肌", kcal: 2400, carbPct: 40, proPct: 35, fatPct: 25, desc: "高热量高蛋白，优先高蛋白食材", filter: { tag: "高蛋白" } },
  mediterranean: { id: "mediterranean", name: "地中海饮食", kcal: 1900, carbPct: 45, proPct: 20, fatPct: 35, desc: "橄榄油 / 鱼 / 蔬果 / 全谷，抗炎护心", filter: { tag: "地中海" } },
  chinese: { id: "chinese", name: "中式养生", kcal: 1900, carbPct: 55, proPct: 20, fatPct: 25, desc: "中式清淡，顺体质，补铁补钙", filter: { cuisine: "cn" } },
  calcium: { id: "calcium", name: "补钙", kcal: 1900, carbPct: 50, proPct: 30, fatPct: 20, desc: "高钙食材优先（奶/豆/虾/芝麻/深绿菜），强健骨骼", filter: { tag: "补钙" } },
  custom: { id: "custom", name: "自定义(AI)", kcal: 2000, carbPct: 50, proPct: 25, fatPct: 25, desc: "描述你的目标，调用免费大模型科学算出热量与菜谱", filter: {} }
};
var DIET_GOAL_ORDER = ["healthy", "lose", "muscle", "calcium", "mediterranean", "chinese", "custom"];

// 候选池（按目标过滤；池太小则放宽到仅按菜系）
function recipePool(goal) {
  var g = DIET_GOALS[goal] || DIET_GOALS.healthy;
  var base = RECIPE_DB.filter(function (r) {
    if (g.filter.cuisine && r.cuisine !== g.filter.cuisine) return false;
    if (g.filter.tag && (r.tags || []).indexOf(g.filter.tag) < 0) return false;
    return true;
  });
  if (base.length < 7) {
    base = RECIPE_DB.filter(function (r) {
      if (g.filter.cuisine && r.cuisine !== g.filter.cuisine) return false;
      return true;
    });
  }
  return base;
}
function poolOfType(base, types) {
  var p = base.filter(function (r) { return types.indexOf(r.type) >= 0; });
  return p;
}

// ============================================================
// 饮食方案（个性化）：目标 + 身体数据 → 每日热量/营养 → 推荐菜 → 可改菜 → 生成周计划
// 纯函数，无 DOM 依赖，便于自动化测试
// ============================================================

// 高钙食材关键词（用于补钙目标的菜谱排序）
var CALCIUM_KEYWORDS = ["牛奶", "豆腐", "奶酪", "芝士", "起司", "酸奶", "虾", "芝麻", "菠菜", "西兰花", "小鱼干", "虾皮", "杏仁", "紫菜", "骨头", "带鱼", "油菜", "芥蓝"];
function calciumScore(r) {
  if (!r) return 0;
  var s = 0;
  var ing = (r.ingredients || []).join(" ");
  CALCIUM_KEYWORDS.forEach(function (k) { if (ing.indexOf(k) >= 0) s += 1; });
  if ((r.tags || []).indexOf("补钙") >= 0) s += 2;
  return s;
}

// 基础代谢率（Mifflin-St Jeor 公式）
function bmrMifflin(sex, weightKg, heightCm, age) {
  var w = Number(weightKg) || 0, h = Number(heightCm) || 0, a = Number(age) || 0;
  var base = 10 * w + 6.25 * h - 5 * a;
  return Math.round(sex === "m" ? base + 5 : base - 161);
}

// 活动系数（久坐/中等/高强度）
function activityFactor(activity) {
  if (activity === "low") return 1.2;
  if (activity === "high") return 1.725;
  return 1.55; // mid 默认
}

// 根据目标 + 身体数据，科学计算每日热量与三大营养素目标
// 返回 { kcal, protein, carb, fat }
function computeTargets(input) {
  input = input || {};
  var goal = input.goal || "healthy";
  var g = DIET_GOALS[goal] || DIET_GOALS.healthy;
  var tdee = bmrMifflin(input.sex || "f", input.weightKg || 60, input.heightCm || 165, input.age || 30) * activityFactor(input.activity || "mid");
  var kcal = Math.round(tdee);
  if (goal === "lose") kcal = Math.max(1200, Math.round(tdee - 450));   // 减脂：约 -450 kcal 缺口
  else if (goal === "muscle") kcal = Math.round(tdee + 300);            // 增肌：约 +300 kcal 盈余
  else if (goal === "mediterranean") kcal = Math.round(tdee * 0.95);     // 地中海：轻微缺口
  else if (goal === "calcium") kcal = Math.round(tdee);                 // 补钙：维持热量，重点在钙
  // 其他（healthy/chinese）：维持
  var protein = Math.round(kcal * g.proPct / 100 / 4);
  var carb = Math.round(kcal * g.carbPct / 100 / 4);
  var fat = Math.round(kcal * g.fatPct / 100 / 9);
  return { kcal: kcal, protein: protein, carb: carb, fat: fat };
}

// 按目标推荐菜谱（返回 id 数组，按目标优先级排序）
function recommendDishes(goal, opts) {
  opts = opts || {};
  var base = recipePool(goal);
  var ids = base.map(function (r) { return r.id; });
  if (goal === "lose") ids.sort(function (a, b) { return recipeById(a).kcal - recipeById(b).kcal; });
  else if (goal === "muscle") ids.sort(function (a, b) { return recipeById(b).protein - recipeById(a).protein; });
  else if (goal === "calcium") ids.sort(function (a, b) { return calciumScore(recipeById(b)) - calciumScore(recipeById(a)); });
  else if (goal === "custom") {
    var ft = opts.focusTags || [];
    if (ft.length) ids.sort(function (a, b) {
      var ra = recipeById(a), rb = recipeById(b);
      var sa = (ra.tags || []).filter(function (t) { return ft.indexOf(t) >= 0; }).length;
      var sb = (rb.tags || []).filter(function (t) { return ft.indexOf(t) >= 0; }).length;
      return sb - sa;
    });
    else ids.sort(function (a, b) { return recipeById(a).kcal - recipeById(b).kcal; });
  }
  return ids;
}

// 组装完整饮食方案对象（不修改 DB，便于测试与预览）
function buildDietPlan(input) {
  input = input || {};
  var goal = input.goal || "healthy";
  var draft = {
    goal: goal,
    sex: input.sex || "f",
    age: input.age != null ? Number(input.age) : 30,
    weightKg: input.weightKg != null ? Number(input.weightKg) : 60,
    heightCm: input.heightCm != null ? Number(input.heightCm) : 165,
    activity: input.activity || "mid",
    focusTags: input.focusTags || [],
    customGoalText: input.customGoalText || "",
    customTargets: input.customTargets || null,
    targets: (goal === "custom" && input.customTargets) ? input.customTargets : computeTargets(input),
    dishes: (input.dishes && input.dishes.length) ? input.dishes.slice() : recommendDishes(goal, { focusTags: input.focusTags || [] }),
    updatedAt: nowISO()
  };
  return draft;
}

// 从饮食方案生成一周食谱（仅使用方案中用户选定的菜；未选则回退到目标候选池）
function weekPlanFromDietPlan(plan, opts) {
  plan = plan || {};
  var goal = plan.goal || "healthy";
  var dishes = (plan.dishes && plan.dishes.length) ? plan.dishes : [];
  return planWeek(goal, Object.assign({ dishes: dishes }, opts || {}));
}

// ============================================================
// 手边食材搭配（基于「物品管理」现有食材，匹配可现做菜 / 缺料→购买清单）
// 纯函数，无 DOM 依赖
// ============================================================
// 冰箱物品名 → 核心食材名（清洗量词/单位/括号）
var ING_UNITS = ["盒", "袋", "瓶", "罐", "包", "根", "个", "颗", "把", "片", "块", "克", "g", "ml", "升", "斤", "份", "只", "条", "瓣", "张", "朵", "粒", "枚", "杯", "勺", "碗"];
function itemCore(name) {
  var s = String(name || "").trim();
  s = s.replace(/[（(][^)）]*[)）]/g, "");            // 去括号及内部
  s = s.replace(/[0-9０-９.\-\/]+/g, " ");            // 去数字/量词（3个、200g、1/2）
  ING_UNITS.forEach(function (u) { s = s.replace(new RegExp(u, "g"), " "); }); // 去单位
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
// 核心名是否在“手边集合”中（双向别名匹配）
function coreInSet(c, set) {
  if (!c) return false;
  if (set[c]) return true;
  var al = ING_ALIASES[c] || [];
  for (var i = 0; i < al.length; i++) if (set[al[i]]) return true;
  for (var k in ING_ALIASES) if (ING_ALIASES[k].indexOf(c) >= 0 && set[k]) return true;
  return false;
}
// 已选冰箱物品 → 手边核心集合
function onHandCoresFromFridge(items, selectedIds) {
  var set = {};
  (items || []).forEach(function (it) {
    if (selectedIds && selectedIds.indexOf(it.id) < 0) return;
    if (it.usedUp || it.discarded) return;
    var core = itemCore(it.name);
    if (core) set[core] = 1;
  });
  return set;
}
// 单菜与手边食材的匹配
function recipeOnHand(recipe, haveCores) {
  haveCores = haveCores || {};
  var ings = (recipe.ingredients || []);
  var have = [], missing = [];
  ings.forEach(function (ing) {
    var cores = ingredientCores(ing);
    var hit = false;
    cores.forEach(function (c) {
      if (coreInSet(c, haveCores)) { hit = true; if (have.indexOf(c) < 0) have.push(c); }
    });
    if (!hit) { var raw = cores[0] || ing; if (missing.indexOf(raw) < 0) missing.push(raw); }
  });
  return { allHave: missing.length === 0, have: have, missing: missing };
}
// 按“可现做优先、覆盖率降序”排序
function rankRecipesByOnHand(recipes, haveCores) {
  var arr = (recipes || []).map(function (r) {
    var m = recipeOnHand(r, haveCores);
    var total = (r.ingredients || []).length;
    return { recipe: r, allHave: m.allHave, have: m.have, missing: m.missing, coverage: total ? m.have.length / total : 0 };
  });
  arr.sort(function (a, b) {
    if (a.allHave !== b.allHave) return a.allHave ? -1 : 1;
    return b.coverage - a.coverage;
  });
  return arr;
}
// 聚合缺料为购买清单（带出现次数）
function onHandShoppingList(ranked, haveCores) {
  var cnt = {};
  (ranked || []).forEach(function (x) {
    var miss = x.missing || (x.recipe ? recipeOnHand(x.recipe, haveCores).missing : []);
    (miss || []).forEach(function (core) { cnt[core] = (cnt[core] || 0) + 1; });
  });
  return Object.keys(cnt).map(function (k) { return { core: k, times: cnt[k] }; }).sort(function (a, b) { return b.times - a.times; });
}

// ============================================================
// 自定义目标（调用免费大模型科学定制）
// 浏览器端直连；API Key 仅存本机 localStorage，绝不写入同步 DB
// ============================================================
var DIET_PROVIDERS = {
  gemini: {
    id: "gemini", name: "Google Gemini (免费)",
    // 模型名用占位符 + 候选列表：Google 会轮换/下线 GA 别名，404「模型不存在」时自动尝试下一个
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
    // 与 intel.js 保持一致：2.5 / 3.x 交错，已移除已退役的 2.0/1.5
    models: ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash-latest", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-2.5-pro-latest"],
    buildUrl: function (key, mi) { return this.endpoint.replace("{MODEL}", this.models[(mi || 0)] || this.models[0]) + "?key=" + encodeURIComponent(key); },
    buildHeaders: function () { return { "Content-Type": "application/json" }; },
    buildBody: function (goalText, recipeIndex) {
      return { contents: [{ parts: [{ text: dietSystemPrompt(goalText, recipeIndex) }] }], generationConfig: { responseMimeType: "application/json" } };
    },
    parse: function (d) { return d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text; }
  },
  groq: openAiProvider("https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile", "Groq (免费)"),
  deepseek: openAiProvider("https://api.deepseek.com/chat/completions", "deepseek-chat", "DeepSeek (免费额度)"),
  openrouter: openAiProvider("https://openrouter.ai/api/v1/chat/completions", "meta-llama/llama-3.3-70b-instruct:free", "OpenRouter (免费)")
};
function openAiProvider(endpoint, model, name) {
  return {
    id: endpoint, name: name, endpoint: endpoint,
    buildUrl: function () { return endpoint; },
    buildHeaders: function (key) { return { "Content-Type": "application/json", "Authorization": "Bearer " + key }; },
    buildBody: function (goalText, recipeIndex) {
      return { model: model, messages: [{ role: "user", content: dietSystemPrompt(goalText, recipeIndex) }], response_format: { type: "json_object" } };
    },
    parse: function (d) { return d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content; }
  };
}
function dietSystemPrompt(goalText, recipeIndex) {
  var lines = (recipeIndex || []).map(function (r) {
    return r.id + "|" + r.name + "|标签:" + (r.tags || []).join("/") + "|主:" + (r.main || "") + "|" + r.kcal + "kcal/" + r.protein + "g蛋";
  }).join("\n");
  return "你是专业营养师。用户饮食目标（自由描述）：" + (goalText || "") + "\n" +
    "请从下列菜谱库挑选最合适者，并给出科学的热量与三大营养素目标（单位 kcal/g）。\n" +
    "菜谱库：\n" + lines + "\n" +
    "仅输出 JSON（不要任何解释、不要 Markdown 代码块），格式：\n" +
    "{\"kcal\":数字,\"protein\":数字,\"carb\":数字,\"fat\":数字,\"focusTags\":[\"标签\"],\"recipeIds\":[\"rc..\"],\"note\":\"一句中文说明\"}";
}
// 从大模型返回文本稳健提取 JSON
function parseDietLLM(text) {
  if (!text) return null;
  var s = String(text);
  var a = s.indexOf("{"); var b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}
// 将大模型结果组装为饮食方案草稿（goal=custom）
function buildDietPlanFromLLM(parsed, opts) {
  parsed = parsed || {};
  var validIds = (parsed.recipeIds || []).filter(function (id) { return !!recipeById(id); });
  var focusTags = parsed.focusTags || [];
  if (!validIds.length && focusTags.length) {
    validIds = RECIPE_DB.filter(function (r) { return (r.tags || []).some(function (t) { return focusTags.indexOf(t) >= 0; }); }).map(function (r) { return r.id; });
  }
  return {
    goal: "custom",
    customGoalText: (opts && opts.customGoalText) || "",
    focusTags: focusTags,
    targets: {
      kcal: Math.max(0, Math.round(Number(parsed.kcal) || 2000)),
      protein: Math.max(0, Math.round(Number(parsed.protein) || 0)),
      carb: Math.max(0, Math.round(Number(parsed.carb) || 0)),
      fat: Math.max(0, Math.round(Number(parsed.fat) || 0))
    },
    dishes: validIds.length ? validIds : recommendDishes("custom", { focusTags: focusTags }),
    note: parsed.note || "",
    updatedAt: nowISO()
  };
}
// 浏览器端调用（异步）。测试不直接调用，仅测 parse/build/provider 结构。
async function callDietLLM(provider, apiKey, userGoal) {
  var p = DIET_PROVIDERS[provider];
  if (!p) throw new Error("未知大模型 provider");
  var recipeIndex = RECIPE_DB.map(function (r) { return { id: r.id, name: r.name, tags: r.tags, main: r.main, kcal: r.kcal, protein: r.protein }; });
  var headers = p.buildHeaders(apiKey);
  var body = p.buildBody(userGoal, recipeIndex);
  var models = p.models || null;
  var tries = models ? models.length : 1;
  var lastErr = "";
  var lastStatus = 0;
  function dietSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  for (var i = 0; i < tries; i++) {
    var url = models ? p.buildUrl(apiKey, i) : p.buildUrl(apiKey);
    // 429 速率限制：对同一个模型做至多 2 次退避重试（2s / 4s）
    var res = null, retries = 0;
    while (true) {
      res = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body) });
      if (res.ok || res.status !== 429 || retries >= 2) break;
      retries++; await dietSleep(retries * 2000);
    }
    if (res.ok) { var data = await res.json(); var text = p.parse(data); return parseDietLLM(text); }
    lastStatus = res.status;
    var detail = "";
    try { var t = await res.text(); if (t) detail = String(t).replace(/[\r\n]+/g, " ").slice(0, 160); } catch (e) {}
    lastErr = detail;
    // 404 且仍有候选 → 尝试下一个；否则结束循环
    if (res.status === 404 && models && i < tries - 1) continue;
    break;
  }
  if (lastStatus === 404) throw new Error("HTTP 404（模型不存在）：已尝试 " + (models ? models.join(" / ") : "默认模型") + (lastErr ? "：" + lastErr : ""));
  if (lastStatus === 429) throw new Error("HTTP 429（请求过于频繁 / 免费额度用尽）：当前模型接口已被限速。建议稍候 20~60 秒再试，或在「大模型」下拉切换到另一个联网模型（Gemini↔OpenAI↔智谱 是各自独立的限速池，换一个即绕开）。" + (lastErr ? "：" + lastErr : ""));
  throw new Error("HTTP " + lastStatus + (lastErr ? "：" + lastErr : ""));
}
// AI 配置（仅本机）
function loadAiConfig() {
  try { return JSON.parse(localStorage.getItem("hw_pm_ai_config") || "{}"); } catch (e) { return {}; }
}
function saveAiConfig(cfg) {
  try { localStorage.setItem("hw_pm_ai_config", JSON.stringify(cfg || {})); } catch (e) {}
}
// 从候选池确定性选取一道（避免同日同菜、避免同日同主食材、避免连续日同槽位同主食材）
function pickFrom(pool, seed, slotKey, prevMain, avoidMain, usedIds) {
  var n = pool.length;
  if (!n) return null;
  for (var k = 0; k < n; k++) {
    var idx = (seed + k) % n;
    var r = pool[idx];
    if (usedIds && usedIds[r.id]) continue;
    if (avoidMain && r.main === avoidMain) continue;
    if (prevMain[slotKey] && prevMain[slotKey] === r.main) continue;
    prevMain[slotKey] = r.main;
    return r;
  }
  var fb = pool[seed % n];
  prevMain[slotKey] = fb.main;
  return fb;
}
function mealNutrition(meals) {
  var t = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  ["breakfast", "lunch", "dinner"].forEach(function (k) {
    var r = meals[k];
    if (r) { t.kcal += r.kcal; t.protein += r.protein; t.carb += r.carb; t.fat += r.fat; }
  });
  return t;
}
function weekTotals(days) {
  var t = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  days.forEach(function (d) { t.kcal += d.kcal; t.protein += d.protein; t.carb += d.carb; t.fat += d.fat; });
  return { kcal: t.kcal, avgKcal: Math.round(t.kcal / days.length), protein: t.protein, carb: t.carb, fat: t.fat };
}

// 生成一周食谱（确定性：给定 goal 输出稳定，便于测试断言）
function planWeek(goal, opts) {
  opts = opts || {};
  var g = DIET_GOALS[goal] || DIET_GOALS.healthy;
  var base;
  if (opts.dishes && opts.dishes.length) {
    base = opts.dishes.map(recipeById).filter(Boolean);
  } else {
    base = recipePool(goal);
  }

  var breakfastPool = poolOfType(base, ["早餐", "沙拉轻食", "汤羹"]);
  if (breakfastPool.length < 3) breakfastPool = base.filter(function (r) { return (r.tags || []).indexOf("清淡") >= 0 || r.type === "汤羹"; });
  var lunchPool = poolOfType(base, ["家常菜", "饭店菜", "汤羹", "沙拉轻食"]);
  var dinnerPool = poolOfType(base, ["家常菜", "饭店菜", "沙拉轻食", "汤羹"]);
  if (!breakfastPool.length) breakfastPool = base.slice();
  if (!lunchPool.length) lunchPool = base.slice();
  if (!dinnerPool.length) dinnerPool = base.slice();

  var prevMain = { breakfast: "", lunch: "", dinner: "" };
  var ptr = { breakfast: 0, lunch: 0, dinner: 0 };   // 每槽位独立轮转指针，保证遍历整个候选池
  var days = [];
  for (var d = 0; d < 7; d++) {
    var usedIds = {};
    var b = pickFrom(breakfastPool, ptr.breakfast++, "breakfast", prevMain, null, usedIds);
    if (b) usedIds[b.id] = 1;
    var l = pickFrom(lunchPool, ptr.lunch++, "lunch", prevMain, b ? b.main : null, usedIds);
    if (l) usedIds[l.id] = 1;
    var di = pickFrom(dinnerPool, ptr.dinner++, "dinner", prevMain, l ? l.main : null, usedIds);
    if (di) usedIds[di.id] = 1;
    var meals = { breakfast: b, lunch: l, dinner: di };
    var nut = mealNutrition(meals);
    days.push({ idx: d, weekday: WEEKDAYS[d], meals: meals, kcal: nut.kcal, protein: nut.protein, carb: nut.carb, fat: nut.fat });
  }
  return {
    goal: goal,
    goalName: g.name,
    desc: g.desc,
    targetKcal: g.kcal,
    days: days,
    totals: weekTotals(days)
  };
}

// ============================================================
// 库存联动（纯函数，不依赖 DOM；fridge 物品模型见 fridge.js）
// 物品字段：{ id, name, expire('YYYY-MM-DD'), usedUp, discarded, ... }
// 将食材字符串解析为核心名称，匹配物品库存，分类：有 / 临期优先吃 / 需购买
// ============================================================

// 常见别名映射（双向匹配，提升命中率）
var ING_ALIASES = {
  "番茄": ["西红柿"], "鸡蛋": ["土鸡蛋", "蛋"], "虾": ["虾仁", "基围虾", "大虾", "鲜虾", "鱼丸"],
  "葱": ["葱花", "小葱", "大葱", "青葱"], "蒜": ["蒜末", "蒜蓉"], "土豆": ["马铃薯", "土豆块"],
  "猪肉": ["猪肉末", "猪里脊", "五花肉", "猪"], "牛肉": ["牛里脊", "牛腩", "肥牛", "牛肉片", "牛肉末"],
  "鸡肉": ["鸡胸", "鸡腿", "鸡肉"], "鱼": ["鲈鱼", "龙利鱼", "鳕鱼", "三文鱼", "带鱼", "鲤鱼", "鱼片", "鱿鱼"],
  "生菜": ["混合生菜", "罗马生菜"], "奶酪": ["菲达奶酪", "芝士", "起司", "帕玛森", "马苏里拉"],
  "米饭": ["白饭", "大米"], "意面": ["意大利面", "意面"], "豆腐": ["嫩豆腐", "老豆腐", "豆腐丝"],
  "牛奶": ["鲜牛奶", "鲜奶"], "酸奶": ["希腊酸奶"], "坚果": ["核桃", "杏仁", "腰果", "花生"],
  "黄瓜": ["小黄瓜"], "菠菜": ["菠菜"], "胡萝卜": ["胡萝卜"], "洋葱": ["洋葱"],
  "青椒": ["甜椒", "彩椒"], "橄榄": ["黑橄榄", "绿橄榄", "卡拉马塔橄榄"], "燕麦": ["燕麦片", "燕麦"],
  "面粉": ["中筋粉", "低筋粉", "面包糠"], "咖喱": ["咖喱块"], "年糕": ["年糕"], "粉条": ["粉条", "粉丝"]
};

// 量词/形状/调料词（作为独立 token 时忽略，不计入食材名）
var ING_QTY_WORDS = ["少许", "适量", "若干", "一些", "各", "切丝", "切块", "切段", "切末", "切碎", "切片", "拍碎", "剁碎", "洗净", "沥干", "焯水", "泡发", "打散", "调匀", "混合", "备用", "丝", "末", "碎", "丁", "泥", "皮", "籽", "叶", "段", "块", "片", "瓣", "张", "碗", "只", "条", "朵", "包", "粒", "枚", "杯", "罐", "瓶", "克", "个", "根", "把", "份", "勺", "油", "盐", "糖", "醋", "酱油", "生抽", "老抽", "料酒", "淀粉", "香油", "麻油", "蚝油", "辣椒", "花椒", "花椒粉", "胡椒", "黑胡椒", "白胡椒", "八角", "桂皮", "香叶", "几滴", "几根", "几片", "几棵", "一把"];

function ingredientCores(str) {
  var toks = String(str || "").split(/[\s、，,]+/).filter(Boolean);
  var cores = [];
  toks.forEach(function (t) {
    if (/^[半\d\.]+/.test(t)) return;                 // 半根 / 2个 / 1勺 等量词开头
    if (t.indexOf("各") >= 0) return;                  // 各1把 / 各适量 等分食量词
    if (ING_QTY_WORDS.indexOf(t) >= 0) return;        // 纯量词/形状/调料
    cores.push(t);
  });
  return cores;
}

function fridgeItemDaysLeft(it) {
  if (!it || !it.expire) return null;
  var p = String(it.expire).split("-"); if (p.length < 3) return null;
  var e = new Date(+p[0], +p[1] - 1, +p[2]);
  var t = new Date(); var today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((e - today0) / 86400000);
}
function fridgeItemStatus(it, redDays) {
  if (!it) return "正常";
  if (it.usedUp) return "已用完";
  if (it.discarded) return "已过期";
  var d = fridgeItemDaysLeft(it);
  if (d == null) return "正常";
  if (d < 0) return "已过期";
  if (d <= (redDays || 3)) return "临期";
  return "正常";
}

// 核心食材名 → 匹配库存物品（双向包含 + 别名）
function matchCoreToFridge(core, items) {
  if (!core) return null;
  var cl = String(core).replace(/\s/g, "").toLowerCase();
  function hit(name) {
    var n = String(name || "").replace(/\s/g, "").toLowerCase();
    if (!n) return false;
    if (n.indexOf(cl) >= 0 || cl.indexOf(n) >= 0) return true;
    var al = ING_ALIASES[cl];
    if (al) { for (var i = 0; i < al.length; i++) if (n.indexOf(al[i]) >= 0 || al[i].indexOf(n) >= 0) return true; }
    return false;
  }
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.usedUp || it.discarded) continue;
    if (hit(it.name)) return it;
  }
  // core 本身可能是某别名的取值（如“西红柿”应命中“番茄”类物品）
  for (var key in ING_ALIASES) {
    if (ING_ALIASES[key].indexOf(cl) >= 0) {
      for (var j = 0; j < items.length; j++) {
        var it2 = items[j];
        if (it2.usedUp || it2.discarded) continue;
        if (hit(it2.name) && String(it2.name).indexOf(key) >= 0) return it2;
      }
    }
  }
  return null;
}

// 单道菜库存状态：{ have:[], expiring:[{core,item,status,days}], missing:[] }
function recipeStockStatus(recipe, fridgeItems, redDays) {
  fridgeItems = fridgeItems || (DB.data.growth && DB.data.growth.fridge ? DB.data.growth.fridge.items : []) || [];
  var have = [], expiring = [], missing = [];
  (recipe.ingredients || []).forEach(function (s) {
    ingredientCores(s).forEach(function (core) {
      var it = matchCoreToFridge(core, fridgeItems);
      if (!it) { if (missing.indexOf(core) < 0) missing.push(core); return; }
      var st = fridgeItemStatus(it, redDays);
      if (st === "临期" || st === "已过期") {
        var ex = expiring.filter(function (e) { return e.core === core; })[0];
        if (!ex) expiring.push({ core: core, item: it, status: st, days: fridgeItemDaysLeft(it) });
      } else {
        if (have.indexOf(core) < 0) have.push(core);
      }
    });
  });
  return { have: have, expiring: expiring, missing: missing };
}

// 一周计划 → 采购清单 + 临期优先吃
function weekPlanShopping(plan, fridgeItems, redDays) {
  fridgeItems = fridgeItems || (DB.data.growth && DB.data.growth.fridge ? DB.data.growth.fridge.items : []) || [];
  var need = {}, expiring = {};
  if (plan && plan.days) {
    plan.days.forEach(function (d) {
      ["breakfast", "lunch", "dinner"].forEach(function (k) {
        var m = d.meals[k]; if (!m) return;
        var st = recipeStockStatus(m, fridgeItems, redDays);
        st.missing.forEach(function (c) { need[c] = (need[c] || 0) + 1; });
        st.expiring.forEach(function (e) { if (!expiring[e.core]) expiring[e.core] = e; });
      });
    });
  }
  return {
    buy: Object.keys(need).map(function (c) { return { core: c, times: need[c] }; }),
    expiring: Object.keys(expiring).map(function (c) { return expiring[c]; })
  };
}

// 取当前库存物品（渲染用）
function getFridgeItems() {
  return (DB.data.growth && DB.data.growth.fridge && DB.data.growth.fridge.items) || [];
}

// ============================================================
// 渲染：菜谱模块入口
// ============================================================
function renderRecipes() {
  var tabs = [
    { id: "library", icon: "📖", t: "菜谱库" },
    { id: "plan", icon: "🎯", t: "饮食方案" },
    { id: "onhand", icon: "🧺", t: "手边搭配" },
    { id: "week", icon: "🗓", t: "一周食谱" },
    { id: "favs", icon: "⭐", t: "我的收藏" }
  ];
  var c = document.getElementById("app-content");
  c.innerHTML =
    '<div class="filter-bar" style="position:sticky;top:0;z-index:5;background:var(--bg);padding-top:4px">' +
    tabs.map(function (t) { return '<div class="chip' + (recipesTab === t.id ? ' active' : '') + '" onclick="setRecipesTab(\'' + t.id + '\')">' + t.icon + ' ' + t.t + '</div>'; }).join("") +
    '</div>' +
    (recipesTab === "library" ? renderRecipeLibrary() :
     recipesTab === "plan" ? renderRecipePlan() :
     recipesTab === "onhand" ? renderRecipeOnHand() :
     recipesTab === "week" ? renderRecipeWeek() :
     renderRecipeFavs());
}

function setRecipesTab(id) {
  recipesTab = id;
  if (id === "plan" && !recipePlanDraft) {
    var rr = ensureRecipes();
    recipePlanDraft = rr.dietPlan ? cloneDietPlan(rr.dietPlan) : defaultDietPlan();
  }
  if (id === "onhand" && !recipeOnHandSel.length) {
    var rr2 = ensureRecipes();
    recipeOnHandSel = rr2.onHandSel || [];
  }
  renderRecipes();
}

// ---------- 菜谱库 ----------
function renderRecipeLibrary() {
  var cuisines = [{ id: "all", name: "全部" }].concat(RECIPE_CUISINES);
  var cuisineChips = cuisines.map(function (c) {
    return '<div class="chip' + (recipeCuisine === c.id ? ' active' : '') + '" onclick="recipeSetCuisine(\'' + c.id + '\')">' + c.name + '</div>';
  }).join("");
  var typeChips = [{ id: "all", name: "全部" }].concat(RECIPE_TYPES.map(function (t) { return { id: t, name: t }; }))
    .map(function (t) { return '<div class="chip' + (recipeType === t.id ? ' active' : '') + '" onclick="recipeSetType(\'' + t.id + '\')">' + t.name + '</div>'; }).join("");
  var tagChips = [{ id: "all", name: "全部" }].concat(RECIPE_TAGS.map(function (t) { return { id: t, name: t }; }))
    .map(function (t) { return '<div class="chip' + (recipeTag === t.id ? ' active' : '') + '" onclick="recipeSetTag(\'' + t.id + '\')">' + t.name + '</div>'; }).join("");

  var list = filterRecipes({ cuisine: recipeCuisine, type: recipeType, tag: recipeTag, query: recipeQuery });

  var grid = list.length
    ? '<div class="rc-grid">' + list.map(recipeCardHtml).join("") + '</div>'
    : '<div class="empty-state"><div class="empty-icon">🍽</div><div class="empty-text">没有匹配的菜谱<br>换个筛选条件试试</div></div>';

  return '<div class="rc-filterwrap">' +
    '<div class="filter-bar" style="flex-wrap:wrap">' + cuisineChips + '</div>' +
    '<div class="filter-bar" style="flex-wrap:wrap">' + typeChips + '</div>' +
    '<div class="filter-bar" style="flex-wrap:wrap">' + tagChips + '</div>' +
    '<div class="fr-search-wrap" style="margin:6px 0 2px">' +
      '<span class="fr-search-icon">🔍</span>' +
      '<input id="rc-search" class="fr-search-input" type="search" placeholder="搜索菜名 / 标签 / 食材…" value="' + escapeHtml(recipeQuery) + '" oninput="recipeSearchInput(this.value)">' +
      (recipeQuery ? '<span class="fr-search-clear" onclick="recipeClearSearch()">✕</span>' : '') +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-tertiary);margin:2px 2px 8px">共 ' + list.length + ' 道 · 点卡片看详细做法与视频</div>' +
    '</div>' + grid;
}

function recipeCardHtml(r) {
  var favs = (ensureRecipes().favs || []);
  var faved = favs.indexOf(r.id) >= 0;
  var tags = (r.tags || []).slice(0, 3).map(function (t) { return '<span class="badge badge-blue">' + t + '</span>'; }).join(" ");
  return '<div class="rc-card" onclick="openRecipe(\'' + r.id + '\')">' +
    '<div class="rc-card-top"><span class="rc-cuisine">' + cuisineName(r.cuisine) + '·' + r.type + '</span>' +
      '<span class="rc-fav' + (faved ? ' on' : '') + '" onclick="event.stopPropagation();toggleRecipeFav(\'' + r.id + '\')">' + (faved ? '★' : '☆') + '</span></div>' +
    '<div class="rc-name">' + escapeHtml(r.name) + '</div>' +
    '<div class="rc-meta"><span>🔥 ' + r.kcal + ' kcal</span><span>⏱ ' + r.time + '分</span><span>👥 ' + r.serves + '人</span></div>' +
    (tags ? '<div class="rc-tags">' + tags + '</div>' : '') +
    '<div class="rc-actions">' +
      '<button class="btn btn-secondary" style="flex:1;padding:5px;font-size:12px" onclick="event.stopPropagation();recipeOpenSite(\'' + r.id + '\')">📖 看做法</button>' +
      '<button class="btn btn-secondary" style="flex:1;padding:5px;font-size:12px" onclick="event.stopPropagation();recipeOpenVideo(\'' + r.id + '\')">▶ 视频</button>' +
    '</div></div>';
}

function recipeSetCuisine(id) { recipeCuisine = id; renderRecipes(); }
function recipeSetType(id) { recipeType = id; renderRecipes(); }
function recipeSetTag(id) { recipeTag = id; renderRecipes(); }
function recipeSearchInput(v) { recipeQuery = v; renderRecipes(); }
function recipeClearSearch() { recipeQuery = ""; renderRecipes(); }

function recipeOpenSite(id) { var r = recipeById(id); if (r) { try { window.open(recipeSiteUrl(r.name), "_blank"); } catch (e) {} } }
function recipeOpenVideo(id) { var r = recipeById(id); if (r) { try { window.open(recipeVideoUrl(r.name), "_blank"); } catch (e) {} } }

// 单菜库存联动 HTML
function recipeStockHtml(r) {
  var items = getFridgeItems();
  if (!items.length) {
    return '<div class="rc-sec-title">🧺 库存联动</div>' +
      '<div style="font-size:12px;color:var(--text-tertiary)">在「物品管理」添加食材后，这里会自动显示哪些有、哪些要买、哪些临期优先吃。</div>';
  }
  var st = recipeStockStatus(r, items);
  if (!st.have.length && !st.expiring.length && !st.missing.length) return '';
  function list(arr, cls, label, icon) {
    if (!arr.length) return '';
    return '<div style="margin:4px 0"><span class="badge ' + cls + '">' + icon + ' ' + label + '</span> ' +
      arr.map(function (x) { return '<span class="badge badge-gray">' + escapeHtml(typeof x === 'string' ? x : x.core) + '</span>'; }).join(" ") + '</div>';
  }
  var exp = st.expiring.length ? '<div style="margin:4px 0"><span class="badge badge-orange">⏰ 临期优先吃</span> ' +
    st.expiring.map(function (e) { return '<span class="badge badge-gray">' + escapeHtml(e.core) + '（' + (e.days < 0 ? '已过期' : e.days + '天') + '）</span>'; }).join(" ") + '</div>' : '';
  return '<div class="rc-sec-title">🧺 库存联动</div>' +
    list(st.have, "badge-green", "已有", "✅") + exp +
    list(st.missing, "badge-red", "需购买", "🛒");
}

// 一周计划采购 + 临期 HTML
function weekShoppingHtml(plan) {
  var items = getFridgeItems();
  if (!items.length) {
    return '<div class="card" style="margin-top:10px"><div class="card-title">🛒 本周采购 & 临期</div>' +
      '<div style="font-size:12px;color:var(--text-tertiary)">在「物品管理」录入食材后，这里会自动汇总本周要买的菜与临期优先吃的食材。</div></div>';
  }
  var shop = weekPlanShopping(plan, items);
  var buy = shop.buy.length
    ? '<div style="margin:4px 0">' + shop.buy.map(function (b) {
        return '<span class="badge badge-red">🛒 ' + escapeHtml(b.core) + (b.times > 1 ? ' ×' + b.times : '') + '</span>';
      }).join(" ") + '</div>'
    : '<div style="font-size:12px;color:var(--text-secondary)">✅ 本周食材基本齐全，无需额外采购</div>';
  var exp = shop.expiring.length
    ? '<div style="margin:6px 0"><span class="badge badge-orange">⏰ 临期优先吃</span> ' + shop.expiring.map(function (e) {
        return '<span class="badge badge-gray">' + escapeHtml(e.core) + '（' + (e.days < 0 ? '已过期' : e.days + '天') + '）</span>';
      }).join(" ") + '</div>'
    : '';
  return '<div class="card" style="margin-top:10px"><div class="card-title">🛒 本周采购清单（' + shop.buy.length + ' 项）</div>' +
    buy + exp + '</div>';
}

function openRecipe(id) {
  var r = recipeById(id);
  if (!r) return;
  var favs = ensureRecipes().favs || [];
  var faved = favs.indexOf(id) >= 0;
  var maxK = 60;
  function bar(v, color) { var pct = Math.min(100, Math.round(v / maxK * 100)); return '<div class="rc-nut-bar"><span style="width:' + pct + '%;background:' + color + '"></span></div>'; }
  var nutHtml = '<div class="rc-nut">' +
    '<div class="rc-nut-row"><span>🔥 热量</span><b>' + r.kcal + ' kcal</b></div>' +
    '<div class="rc-nut-row"><span>🥩 蛋白质</span><b>' + r.protein + ' g</b>' + bar(r.protein, "#ff6b6b") + '</div>' +
    '<div class="rc-nut-row"><span>🍚 碳水</span><b>' + r.carb + ' g</b>' + bar(r.carb, "#ffd166") + '</div>' +
    '<div class="rc-nut-row"><span>🥑 脂肪</span><b>' + r.fat + ' g</b>' + bar(r.fat, "#4ecdc4") + '</div></div>';
  var tags = (r.tags || []).map(function (t) { return '<span class="badge badge-blue">' + t + '</span>'; }).join(" ");
  showModal(
    '<div class="modal-title">🍽 ' + escapeHtml(r.name) + '</div>' +
    '<div style="padding:8px 16px">' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
        '<span class="badge badge-gray">' + cuisineName(r.cuisine) + '</span>' +
        '<span class="badge badge-gray">' + r.type + '</span>' +
        '<span class="badge badge-gray">⏱ ' + r.time + '分</span>' +
        '<span class="badge badge-gray">👥 ' + r.serves + '人</span>' +
        (tags || '') +
      '</div>' + nutHtml +
      '<div class="rc-sec-title">🧺 食材</div>' +
      '<div class="rc-ing">' + (r.ingredients || []).map(function (x) { return '<span class="badge badge-green">' + escapeHtml(x) + '</span>'; }).join(" ") + '</div>' +
      recipeStockHtml(r) +
      '<div class="rc-sec-title">👩‍🍳 做法</div>' +
      '<div class="rc-steps">' + (r.steps || []).map(function (s, i) { return '<div class="rc-step"><span class="rc-step-n">' + (i + 1) + '</span>' + escapeHtml(s) + '</div>'; }).join("") + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn btn-primary" style="flex:1;padding:9px;font-size:13px" onclick="recipeOpenSite(\'' + r.id + '\')">📖 下厨房详细菜谱</button>' +
        '<button class="btn btn-secondary" style="flex:1;padding:9px;font-size:13px" onclick="recipeOpenVideo(\'' + r.id + '\')">▶ B站视频教程</button>' +
      '</div>' +
      '<button class="btn ' + (faved ? 'btn-primary' : 'btn-secondary') + '" style="width:100%;margin-top:8px;padding:9px;font-size:13px" onclick="toggleRecipeFav(\'' + r.id + '\');openRecipe(\'' + r.id + '\')">' + (faved ? '★ 已收藏' : '☆ 收进我的收藏') + '</button>' +
    '</div>'
  );
}

function toggleRecipeFav(id) {
  var r = ensureRecipes();
  var i = r.favs.indexOf(id);
  if (i >= 0) r.favs.splice(i, 1); else r.favs.unshift(id);
  DB.save();
  renderRecipes();
}

// ---------- 一周食谱 ----------
function renderRecipeWeek() {
  ensureWeekPlanLoaded();
  var r = ensureRecipes();
  var goalChips = DIET_GOAL_ORDER.map(function (g) {
    var gdef = DIET_GOALS[g];
    var active = (recipeWeekCache && recipeWeekCache.goal === g) || (!recipeWeekCache && r.lastGoal === g);
    return '<div class="chip' + (active ? ' active' : '') + '" onclick="generateWeekPlan(\'' + g + '\')">' + gdef.name + '</div>';
  }).join("");

  var body = "";
  if (recipeWeekCache) {
    var plan = recipeWeekCache;
    var dayHtml = plan.days.map(function (d) {
      function mealChip(m, label) {
        if (!m) return '';
        var note = (plan.goal === "mediterranean") ? '<div class="rc-dm-note">' + escapeHtml(recipeNote(m.id)) + '</div>' : '';
        return '<div class="rc-day-meal" onclick="openRecipe(\'' + m.id + '\')"><span class="rc-dm-label">' + label + '</span>' + escapeHtml(m.name) +
          '<span class="rc-dm-kcal">' + m.kcal + 'k</span>' + note + '</div>';
      }
      return '<div class="rc-day"><div class="rc-day-head">' + d.weekday + '<span class="rc-day-kcal">' + d.kcal + ' kcal</span></div>' +
        mealChip(d.meals.breakfast, "早") + mealChip(d.meals.lunch, "午") + mealChip(d.meals.dinner, "晚") + '</div>';
    }).join("");
    var t = plan.totals;
    body = '<div class="rc-week-grid">' + dayHtml + '</div>' +
      '<div class="card" style="margin-top:10px">' +
        '<div class="card-title">📊 本周营养汇总（' + plan.goalName + '）</div>' +
        '<div class="rc-week-sum">' +
          '<div><span>日均热量</span><b>' + t.avgKcal + ' kcal</b><span class="rc-target">目标 ' + plan.targetKcal + '</span></div>' +
          '<div><span>蛋白质</span><b>' + t.protein + ' g</b></div>' +
          '<div><span>碳水</span><b>' + t.carb + ' g</b></div>' +
          '<div><span>脂肪</span><b>' + t.fat + ' g</b></div>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">' + escapeHtml(plan.desc) + '</div>' +
      '</div>' +
      weekShoppingHtml(plan) +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button class="btn btn-primary" style="flex:1;padding:9px;font-size:13px" onclick="saveWeekPlan()">💾 保存本周食谱</button>' +
        '<button class="btn btn-secondary" style="flex:1;padding:9px;font-size:13px" onclick="recipeWeekCache=null;renderRecipes()">🗑 清除</button>' +
      '</div>';
  } else {
    body = '<div class="empty-state"><div class="empty-icon">🗓</div><div class="empty-text">选择上方饮食目标<br>一键生成科学的一周食谱</div></div>';
  }

  var r2 = ensureRecipes();
  var dp = r2.dietPlan;
  var dietBanner = dp ?
    '<div class="card" style="margin:8px 0;padding:10px 12px;background:linear-gradient(135deg,rgba(99,102,241,.10),rgba(236,72,153,.08));border:1px solid rgba(99,102,241,.25)">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:6px">🎯 我的饮食方案：' + (DIET_GOALS[dp.goal] ? DIET_GOALS[dp.goal].name : dp.goal) +
      ' · 专属热量 ' + (dp.targets ? dp.targets.kcal : '—') + ' kcal · 已选 ' + (dp.dishes ? dp.dishes.length : 0) + ' 道</div>' +
      '<button class="btn btn-primary" style="width:100%;padding:9px;font-size:13px" onclick="genWeekFromPlan()">🗓 基于我的方案生成周计划 →</button>' +
    '</div>' : '';

  var shopCount = (r2.shopping || []).length;
  var shopBanner = shopCount ? '<div class="rc-banner" onclick="setRecipesTab(\'onhand\')">🛒 购买清单有 ' + shopCount + ' 项 · 点此前往「手边搭配」补充</div>' : '';

  return '<div class="fr-hint" style="font-size:12px;color:var(--text-secondary);margin:8px 2px">基于 ' + RECIPE_DB.length + ' 道内置菜谱，按目标热量与营养自动搭配，主食材不连续重复。</div>' +
    dietBanner +
    shopBanner +
    '<div class="filter-bar" style="flex-wrap:wrap">' + goalChips + '</div>' +
    body;
}

function generateWeekPlan(goal) {
  var r = ensureRecipes();
  r.lastGoal = goal; r.lastOpts = {}; DB.save();
  recipeWeekCache = planWeek(goal, {});
  RECIPE_WEEK_KEY = goal + ":" + weekStartISO();
  renderRecipes();
}

function saveWeekPlan() {
  if (!recipeWeekCache) return;
  var r = ensureRecipes();
  var key = RECIPE_WEEK_KEY || (recipeWeekCache.goal + ":" + weekStartISO());
  var dayIds = recipeWeekCache.days.map(function (d) {
    return { b: d.meals.breakfast ? d.meals.breakfast.id : null, l: d.meals.lunch ? d.meals.lunch.id : null, din: d.meals.dinner ? d.meals.dinner.id : null };
  });
  r.plans[key] = { goal: recipeWeekCache.goal, dayIds: dayIds, savedAt: nowISO() };
  DB.save();
  showToast("已保存本周食谱 💾", "success");
}
function loadSavedWeekPlan() {
  var r = ensureRecipes();
  var key = (r.lastGoal || "healthy") + ":" + weekStartISO();
  return r.plans[key] || null;
}

function weekStartISO() {
  var d = new Date();
  var day = (d.getDay() + 6) % 7; // 周一为一周起点
  var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return mon.getFullYear() + "-" + String(mon.getMonth() + 1).padStart(2, "0") + "-" + String(mon.getDate()).padStart(2, "0");
}

// 进入一周食谱 tab 时若存在已保存计划则自动载入
function ensureWeekPlanLoaded() {
  if (recipeWeekCache) return;
  var saved = loadSavedWeekPlan();
  if (saved) {
    var base = DIET_GOALS[saved.goal] || DIET_GOALS.healthy;
    var days = saved.dayIds.map(function (d, i) {
      var b = recipeById(d.b), l = recipeById(d.l), din = recipeById(d.din);
      var meals = { breakfast: b, lunch: l, dinner: din };
      var nut = mealNutrition(meals);
      return { idx: i, weekday: WEEKDAYS[i], meals: meals, kcal: nut.kcal, protein: nut.protein, carb: nut.carb, fat: nut.fat };
    });
    recipeWeekCache = { goal: saved.goal, goalName: base.name, desc: base.desc, targetKcal: base.kcal, days: days, totals: weekTotals(days) };
    RECIPE_WEEK_KEY = saved.goal + ":" + weekStartISO();
  }
}

// ---------- 我的收藏 ----------
function renderRecipeFavs() {
  var r = ensureRecipes();
  var list = (r.favs || []).map(recipeById).filter(Boolean);
  if (!list.length) {
    return '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-text">还没有收藏的菜谱<br>在菜谱库点 ☆ 即可收藏</div></div>';
  }
  return '<div style="font-size:12px;color:var(--text-tertiary);margin:6px 2px 8px">已收藏 ' + list.length + ' 道</div>' +
    '<div class="rc-grid">' + list.map(recipeCardHtml).join("") + '</div>';
}

// ============================================================
// 饮食方案（UI + 交互）
// ============================================================
function defaultDietPlan() {
  return { goal: "lose", sex: "f", age: 30, weightKg: 60, heightCm: 165, activity: "mid", focusTags: [], customGoalText: "", customNote: "", customTargets: null, targets: null, dishes: [], updatedAt: "" };
}
function cloneDietPlan(p) {
  return {
    goal: p.goal, sex: p.sex, age: p.age, weightKg: p.weightKg, heightCm: p.heightCm, activity: p.activity,
    focusTags: (p.focusTags || []).slice(), customGoalText: p.customGoalText || "", customNote: p.customNote || "",
    customTargets: p.customTargets || null, targets: p.targets || null, dishes: (p.dishes || []).slice(), updatedAt: p.updatedAt || ""
  };
}

function renderRecipePlan() {
  ensureRecipes();
  if (!recipePlanDraft) recipePlanDraft = defaultDietPlan();
  var d = recipePlanDraft;
  var targets = (d.goal === "custom" && d.targets) ? d.targets : computeTargets(d);
  d.targets = targets;

  // ① 目标卡片
  var goalCards = DIET_GOAL_ORDER.map(function (g) {
    var gd = DIET_GOALS[g];
    return '<div class="rc-goal-card' + (d.goal === g ? ' active' : '') + '" onclick="planSetGoal(\'' + g + '\')"><div class="rc-gc-name">' + gd.name + '</div><div class="rc-gc-desc">' + escapeHtml(gd.desc) + '</div></div>';
  }).join("");

  // ② 身体数据
  function opt(sel, val, label) { return '<option value="' + val + '"' + (sel === val ? ' selected' : '') + '>' + label + '</option>'; }
  var params =
    '<div class="rc-plan-row"><span>性别</span><select onchange="planSetSex(this.value)">' + opt(d.sex, "f", "女") + opt(d.sex, "m", "男") + '</select></div>' +
    '<div class="rc-plan-row"><span>年龄</span><input type="number" value="' + d.age + '" min="10" max="100" onchange="planSetAge(this.value)"></div>' +
    '<div class="rc-plan-row"><span>体重 (kg)</span><input type="number" value="' + d.weightKg + '" min="30" max="200" onchange="planSetWeight(this.value)"></div>' +
    '<div class="rc-plan-row"><span>身高 (cm)</span><input type="number" value="' + d.heightCm + '" min="120" max="220" onchange="planSetHeight(this.value)"></div>' +
    '<div class="rc-plan-row"><span>活动量</span><select onchange="planSetActivity(this.value)">' + opt(d.activity, "low", "久坐少动") + opt(d.activity, "mid", "中等活动") + opt(d.activity, "high", "高强度") + '</select></div>';

  var customHtml = "";
  if (d.goal === "custom") {
    var cfg = loadAiConfig();
    var provOpts = Object.keys(DIET_PROVIDERS).map(function (k) {
      var p = DIET_PROVIDERS[k];
      return '<option value="' + k + '"' + (cfg.provider === k ? ' selected' : '') + '>' + p.name + '</option>';
    }).join("");
    customHtml =
      '<div class="card" style="margin-bottom:10px"><div class="card-title">🤖 自定义目标（大模型科学定制）</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">描述你的目标，调用免费大模型算出热量与目标菜谱。Key 仅存本机，绝不写入同步云。</div>' +
      '<textarea id="plan-custom" class="rc-textarea" placeholder="例如：我在备孕，需补叶酸和铁，热量维持 2000 左右，少油" onchange="planSetCustomText(this.value)">' + escapeHtml(d.customGoalText || "") + '</textarea>' +
      '<div class="rc-plan-row"><span>大模型</span><select onchange="planSetProvider(this.value)">' + provOpts + '</select></div>' +
      '<div class="rc-plan-row"><span>API Key</span><input id="plan-key" type="password" class="rc-key" placeholder="粘贴你的免费 Key" value="' + escapeHtml(cfg.apiKey || "") + '" onchange="planSetApiKey(this.value)"></div>' +
      '<button class="btn btn-primary" style="width:100%;margin-top:8px;padding:10px" onclick="planAIGenerate()">🤖 让 AI 定制方案</button>' +
      (d.customNote ? '<div style="font-size:12px;color:var(--accent);margin-top:6px">💡 ' + escapeHtml(d.customNote) + '</div>' : '') +
      '</div>';
  }

  // ③ 每日营养目标
  var targetHtml =
    '<div class="rc-week-sum">' +
      '<div><span>每日热量</span><b>' + targets.kcal + ' kcal</b></div>' +
      '<div><span>蛋白质</span><b>' + targets.protein + ' g</b></div>' +
      '<div><span>碳水</span><b>' + targets.carb + ' g</b></div>' +
      '<div><span>脂肪</span><b>' + targets.fat + ' g</b></div>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">' + escapeHtml(DIET_GOALS[d.goal].desc) + '</div>';

  // ④ 我的菜谱（推荐 + 可勾选）
  var mySet = {}; (d.dishes || []).forEach(function (id) { mySet[id] = 1; });
  var recList = recommendDishes(d.goal).map(function (id) {
    var r = recipeById(id); if (!r) return '';
    var on = mySet[id];
    return '<div class="rc-dish-row' + (on ? ' on' : '') + '" onclick="planToggleDish(\'' + id + '\')">' +
      '<span class="rc-dr-name">' + escapeHtml(r.name) + '</span>' +
      '<span class="rc-dr-meta">' + r.kcal + 'k·蛋' + r.protein + 'g</span>' +
      '<span class="rc-dr-check">' + (on ? '✓' : '＋') + '</span></div>';
  }).join("");

  var extraHtml = planExtraHtml();

  return '<div class="fr-hint" style="font-size:12px;color:var(--text-secondary);margin:8px 2px">先制定专属饮食方案（目标＋身体数据），系统算出每日热量，你再勾选想吃的菜，最后一键生成周计划。</div>' +
    '<div class="card" style="margin-bottom:10px"><div class="card-title">① 选择你的目标</div><div class="rc-goal-grid">' + goalCards + '</div></div>' +
    '<div class="card" style="margin-bottom:10px"><div class="card-title">② 身体数据（科学计算每日热量）</div>' + params + '</div>' +
    customHtml +
    '<div class="card" style="margin-bottom:10px"><div class="card-title">③ 每日营养目标（' + (d.goal === "custom" ? "AI 定制" : "自动计算") + '）</div>' + targetHtml + '</div>' +
    '<div class="card" style="margin-bottom:10px"><div class="card-title">④ 我的菜谱（点选加入 / 移除，默认已按目标推荐 ' + (d.dishes || []).length + ' 道）</div>' +
      '<div class="rc-dish-list">' + recList + '</div>' +
      '<div style="margin-top:10px;font-size:13px;font-weight:600">🔍 添加其他菜</div>' +
      '<input id="plan-search" class="rc-search" placeholder="搜菜名 / 标签，按需加入方案" value="' + escapeHtml(planDishQuery) + '" oninput="planSearchDishes(this.value)">' +
      '<div id="plan-extra" class="rc-dish-list">' + extraHtml + '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:4px">' +
      '<button class="btn btn-secondary" style="flex:1;padding:11px;font-size:13px" onclick="saveDietPlan()">💾 保存方案</button>' +
      '<button class="btn btn-primary" style="flex:1;padding:11px;font-size:13px" onclick="genWeekFromPlan()">🗓 生成周计划 →</button>' +
    '</div>';
}

// 其他菜（未加入方案的）搜索结果
function planExtraHtml() {
  if (!recipePlanDraft) return '';
  var mySet = {}; (recipePlanDraft.dishes || []).forEach(function (id) { mySet[id] = 1; });
  var q = String(planDishQuery || "").trim().toLowerCase();
  var list = RECIPE_DB.filter(function (r) {
    if (mySet[r.id]) return false;
    if (!q) return true;
    return (r.name + " " + (r.tags || []).join(" ") + " " + (r.main || "")).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 40);
  if (!list.length) return '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">没有更多匹配的菜</div>';
  return list.map(function (r) {
    return '<div class="rc-dish-row" onclick="planToggleDish(\'' + r.id + '\')">' +
      '<span class="rc-dr-name">' + escapeHtml(r.name) + '</span>' +
      '<span class="rc-dr-meta">' + r.kcal + 'k·蛋' + r.protein + 'g</span>' +
      '<span class="rc-dr-check">＋</span></div>';
  }).join("");
}

// 交互处理
function planSetGoal(g) { recipePlanDraft.goal = g; recipePlanDraft.dishes = recommendDishes(g); renderRecipes(); }
function planSetSex(v) { recipePlanDraft.sex = v; renderRecipes(); }
function planSetAge(v) { var n = parseInt(v, 10); recipePlanDraft.age = (isNaN(n) ? 30 : Math.max(10, Math.min(100, n))); renderRecipes(); }
function planSetWeight(v) { var n = parseInt(v, 10); recipePlanDraft.weightKg = (isNaN(n) ? 60 : Math.max(30, Math.min(200, n))); renderRecipes(); }
function planSetHeight(v) { var n = parseInt(v, 10); recipePlanDraft.heightCm = (isNaN(n) ? 165 : Math.max(120, Math.min(220, n))); renderRecipes(); }
function planSetActivity(v) { recipePlanDraft.activity = v; renderRecipes(); }
function planToggleDish(id) {
  var arr = recipePlanDraft.dishes || [];
  var i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1); else arr.push(id);
  recipePlanDraft.dishes = arr;
  renderRecipes();
}
function planSearchDishes(v) {
  planDishQuery = v;
  var el = document.getElementById("plan-extra");
  if (el) el.innerHTML = planExtraHtml();
}
function saveDietPlan() {
  if (!recipePlanDraft) return;
  var r = ensureRecipes();
  r.dietPlan = buildDietPlan(recipePlanDraft);
  DB.save();
  showToast("已保存饮食方案 💾", "success");
}
function genWeekFromPlan() {
  if (!recipePlanDraft) recipePlanDraft = defaultDietPlan();
  var plan = buildDietPlan(recipePlanDraft);
  recipeWeekCache = weekPlanFromDietPlan(plan);
  RECIPE_WEEK_KEY = plan.goal + ":" + weekStartISO() + ":plan";
  recipesTab = "week";
  renderRecipes();
}

// ============================================================
// 手边搭配（UI + 交互）
// ============================================================
function renderRecipeOnHand() {
  ensureRecipes();
  var items = getFridgeItems();
  if (!items.length) {
    return '<div class="empty-state"><div class="empty-icon">🧺</div><div class="empty-text">还没有食材清单<br>请先到「物品管理（冰箱）」录入手边食材</div></div>';
  }
  var selMap = {}; (recipeOnHandSel || []).forEach(function (id) { selMap[id] = 1; });
  var chips = items.map(function (it) {
    var core = itemCore(it.name);
    var days = fridgeItemDaysLeft(it);
    var tag = (days != null && days < 0) ? " 💀" : (days != null && days <= 3 ? " ⏰" : "");
    return '<div class="rc-oh-chip' + (selMap[it.id] ? ' on' : '') + '" onclick="onHandToggle(\'' + it.id + '\')">' + escapeHtml(core || it.name) + tag + '</div>';
  }).join("");
  var haveCores = onHandCoresFromFridge(items, recipeOnHandSel);
  var haveKeys = Object.keys(haveCores);
  var ranked = rankRecipesByOnHand(RECIPE_DB, haveCores);
  var top = ranked.slice(0, 30);
  var cards = top.map(function (x) {
    var r = x.recipe;
    var total = (r.ingredients || []).length;
    var badges = x.allHave
      ? '<span class="badge badge-green">✅ 可现做</span>'
      : '<span class="badge badge-red">🛒 缺 ' + x.missing.length + '</span>';
    return '<div class="rc-oh-row" onclick="openRecipe(\'' + r.id + '\')">' +
      '<div class="rc-oh-main"><div class="rc-oh-name">' + escapeHtml(r.name) + '</div>' +
      '<div class="rc-oh-badges">' + badges + ' <span class="badge badge-gray">有 ' + x.have.length + '/' + total + '</span></div></div>' +
      (x.allHave ? '' : '<button class="btn btn-mini" onclick="event.stopPropagation();onHandAddMissing(\'' + r.id + '\')">＋缺料</button>') +
      '</div>';
  }).join("");
  var r2 = ensureRecipes();
  var shop = r2.shopping || [];
  var shopHtml = shop.length
    ? '<div class="card" style="margin-top:10px"><div class="card-title">🛒 我的购买清单（' + shop.length + ' 项）</div>' +
      shop.map(function (s) {
        var js = String(s.core).replace(/'/g, "\\'");
        return '<span class="badge badge-red" style="cursor:pointer" onclick="onHandRemoveShop(\'' + js + '\')">🛒 ' + escapeHtml(s.core) + ' ✕</span>';
      }).join(" ") +
      '<div style="margin-top:8px"><button class="btn btn-secondary btn-mini" onclick="onHandClearShop()">清空购买清单</button></div></div>'
    : '<div class="card" style="margin-top:10px"><div class="card-title">🛒 我的购买清单</div><div style="font-size:12px;color:var(--text-tertiary)">勾选食材后，把缺的菜一键加入这里。</div></div>';
  return '<div class="fr-hint" style="font-size:12px;color:var(--text-secondary);margin:8px 2px">勾选你手边现有的食材，系统优先推荐「可现做」的菜；缺的食材一键加入购买清单。</div>' +
    '<div class="card" style="margin-bottom:10px"><div class="card-title">🧺 我手边的食材（已选 ' + haveKeys.length + '/' + items.length + '）</div><div class="rc-oh-chips">' + chips + '</div></div>' +
    '<div style="display:flex;gap:8px;margin:8px 0">' +
      '<button class="btn btn-primary" style="flex:1;padding:10px;font-size:13px" onclick="onHandAddAllMissing()">🛒 把 Top 菜缺料全加入</button>' +
      '<button class="btn btn-secondary" style="flex:1;padding:10px;font-size:13px" onclick="onHandSelectAll()">全选 / 清除</button>' +
    '</div>' +
    '<div class="card" style="margin-bottom:10px"><div class="card-title">🍳 推荐搭配（可现做优先）</div>' + (cards || '') + '</div>' +
    shopHtml;
}

// 手边搭配交互
function onHandToggle(id) {
  var i = recipeOnHandSel.indexOf(id);
  if (i >= 0) recipeOnHandSel.splice(i, 1); else recipeOnHandSel.push(id);
  var r = ensureRecipes(); r.onHandSel = recipeOnHandSel; DB.save(); renderRecipes();
}
function onHandSelectAll() {
  var items = getFridgeItems();
  recipeOnHandSel = (recipeOnHandSel.length === items.length) ? [] : items.map(function (it) { return it.id; });
  var r = ensureRecipes(); r.onHandSel = recipeOnHandSel; DB.save(); renderRecipes();
}
function onHandAddMissing(id) {
  var r = recipeById(id); if (!r) return;
  var have = onHandCoresFromFridge(getFridgeItems(), recipeOnHandSel);
  var miss = recipeOnHand(r, have).missing;
  addShoppingCores(miss);
  showToast("已加入购买清单 🛒", "success");
}
function onHandAddAllMissing() {
  var have = onHandCoresFromFridge(getFridgeItems(), recipeOnHandSel);
  var ranked = rankRecipesByOnHand(RECIPE_DB, have).slice(0, 30);
  var miss = [];
  ranked.forEach(function (x) { (x.missing || []).forEach(function (c) { if (miss.indexOf(c) < 0) miss.push(c); }); });
  addShoppingCores(miss);
  showToast("已加入 " + miss.length + " 项缺少的食材 🛒", "success");
}
function addShoppingCores(cores) {
  var r = ensureRecipes(); r.shopping = r.shopping || [];
  (cores || []).forEach(function (c) {
    if (!c) return;
    if (r.shopping.filter(function (s) { return s.core === c; }).length === 0) r.shopping.push({ core: c, addedAt: nowISO() });
  });
  DB.save(); renderRecipes();
}
function onHandRemoveShop(core) {
  var r = ensureRecipes(); r.shopping = (r.shopping || []).filter(function (s) { return s.core !== core; }); DB.save(); renderRecipes();
}
function onHandClearShop() {
  var r = ensureRecipes(); r.shopping = []; DB.save(); renderRecipes();
}

// 自定义目标（AI）交互
function planSetCustomText(v) { if (recipePlanDraft) recipePlanDraft.customGoalText = v; }
function planSetProvider(v) { var cfg = loadAiConfig(); cfg.provider = v; saveAiConfig(cfg); }
function planSetApiKey(v) { var cfg = loadAiConfig(); cfg.apiKey = v; saveAiConfig(cfg); }
async function planAIGenerate() {
  var cfg = loadAiConfig();
  if (!cfg.apiKey) { showToast("请先填写 API Key", "error"); return; }
  var text = (recipePlanDraft.customGoalText || "").trim();
  if (!text) { showToast("请先描述你的饮食目标", "error"); return; }
  showToast("AI 正在定制方案…", "loading");
  try {
    var parsed = await callDietLLM(cfg.provider, cfg.apiKey, text);
    if (!parsed) throw new Error("返回无法解析");
    var plan = buildDietPlanFromLLM(parsed, { customGoalText: text });
    recipePlanDraft.goal = "custom";
    recipePlanDraft.focusTags = plan.focusTags;
    recipePlanDraft.customGoalText = text;
    recipePlanDraft.customTargets = plan.targets;
    recipePlanDraft.targets = plan.targets;
    recipePlanDraft.dishes = plan.dishes;
    recipePlanDraft.customNote = plan.note;
    renderRecipes();
    showToast("AI 方案已生成 🤖", "success");
  } catch (e) {
    showToast("AI 调用失败：" + (e && e.message ? e.message : e), "error");
  }
}
