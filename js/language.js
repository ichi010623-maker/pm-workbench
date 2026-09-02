/* =============================================================
 * 语言学习模块 v5.8.48 —— 英/日/韩三语种 · 八大功能模块
 * 模块：工作台 / 生词库 / 精读 / 听力 / 口语 / 写作笔记 / 计划 / 复盘
 * 数据：DB.data.growth.language（三语种隔离，全端同步走 DB 机制）
 * 依赖全局：DB, render, navigate, showToast, showModal, escapeHtml,
 *           today, addDays, formatDate, LiveData, confirm
 * ============================================================= */

/* ---------- 常量 ---------- */
var LG_EB = [1, 2, 4, 7, 15, 30];
var LG_LANGS = ["en", "ja", "ko"];
var LG_META = {
  en: { name: "英语", flag: "🇬🇧", tts: "en-US", reading: "音标", extra: "固定搭配 / 一词多义" },
  ja: { name: "日语", flag: "🇯🇵", tts: "ja-JP", reading: "假名读音", extra: "音调 · 自他动词 · 敬体/简体" },
  ko: { name: "韩语", flag: "🇰🇷", tts: "ko-KR", reading: "音标发音", extra: "收音音变 · 敬语/平语 · 助词" }
};
var LG_TABS = [
  { k: "home", t: "🏠 工作台" },
  { k: "words", t: "📚 单词库" },
  { k: "video", t: "🎬 视频课" },
  { k: "test", t: "🧪 自测" },
  { k: "reading", t: "📰 精读" },
  { k: "listening", t: "🎧 听力" },
  { k: "speaking", t: "🗣 口语" },
  { k: "notes", t: "✍️ 写作笔记" },
  { k: "plan", t: "🗓 计划" },
  { k: "stats", t: "📊 复盘" }
];

/* 场景词包（4 场景 × 每语种 8 词）：travel 旅行 / food 美食 / rent 租房 / work 职场 */
var LG_PACKS = {
  en: {
    travel: [["airport", "机场"], ["boarding pass", "登机牌"], ["luggage", "行李"], ["customs", "海关"], ["departure", "出发"], ["arrival", "到达"], ["ticket", "车票/机票"], ["passport", "护照"]],
    food: [["menu", "菜单"], ["order", "点餐"], ["bill", "账单"], ["reservation", "预订"], ["spicy", "辣的"], ["delicious", "美味的"], ["dessert", "甜点"], ["waiter", "服务员"]],
    rent: [["landlord", "房东"], ["lease", "租约"], ["deposit", "押金"], ["utilities", "水电费"], ["maintenance", "维修"], ["neighborhood", "街区"], ["furniture", "家具"], ["move in", "搬入"]],
    work: [["meeting", "会议"], ["deadline", "截止日期"], ["colleague", "同事"], ["schedule", "日程"], ["report", "报告"], ["negotiate", "谈判"], ["appointment", "约见"], ["feedback", "反馈"]]
  },
  ja: {
    travel: [["空港", "机场"], ["搭乗券", "登机牌"], ["荷物", "行李"], ["税関", "海关"], ["出発", "出发"], ["到着", "到达"], ["切符", "车票"], ["パスポート", "护照"]],
    food: [["メニュー", "菜单"], ["注文", "点餐"], ["会計", "结账"], ["予約", "预订"], ["辛い", "辣的"], ["美味しい", "好吃的"], ["デザート", "甜点"], ["店員", "店员"]],
    rent: [["大家", "房东"], ["契約", "合同"], ["敷金", "押金"], ["光熱費", "水电燃气费"], ["修理", "维修"], ["近所", "附近"], ["家具", "家具"], ["引っ越し", "搬家"]],
    work: [["会議", "会议"], ["締め切り", "截止"], ["同僚", "同事"], ["スケジュール", "日程"], ["報告", "报告"], ["交渉", "谈判"], ["打ち合わせ", "碰头会"], ["フィードバック", "反馈"]]
  },
  ko: {
    travel: [["공항", "机场"], ["탑승권", "登机牌"], ["짐", "行李"], ["세관", "海关"], ["출발", "出发"], ["도착", "到达"], ["표", "车票"], ["여권", "护照"]],
    food: [["메뉴", "菜单"], ["주문", "点餐"], ["계산", "结账"], ["예약", "预订"], ["매운", "辣的"], ["맛있는", "好吃的"], ["디저트", "甜点"], ["종업원", "店员"]],
    rent: [["집주인", "房东"], ["계약", "合同"], ["보증금", "押金"], ["공과금", "水电费"], ["수리", "维修"], ["이웃", "邻居"], ["가구", "家具"], ["이사", "搬家"]],
    work: [["회의", "会议"], ["마감", "截止"], ["동료", "同事"], ["일정", "日程"], ["보고", "报告"], ["협상", "谈判"], ["미팅", "碰头会"], ["피드백", "反馈"]]
  }
};
var LG_PACK_NAMES = { travel: "✈️ 旅行", food: "🍜 美食", rent: "🏠 租房", work: "💼 职场" };

/* 口语情景（3 场景 × 每语种 3-5 句，t 原文 / tr 译文） */
var LG_SCENES = {
  en: {
    order: { t: "🍽 点餐", list: [
      ["I'd like a table for two, please.", "请给我们两个人的桌位。"],
      ["Can I see the menu, please?", "能看一下菜单吗？"],
      ["I'll have the grilled salmon.", "我要香煎三文鱼。"],
      ["Could I get the bill, please?", "麻烦结账。"]
    ]},
    smalltalk: { t: "☕ 日常闲聊", list: [
      ["Nice weather today, isn't it?", "今天天气真好。"],
      ["How was your weekend?", "周末过得怎么样？"],
      ["I'm from Shenzhen. How about you?", "我来自深圳，你呢？"]
    ]},
    work: { t: "💼 简易职场", list: [
      ["Let's schedule a meeting for tomorrow.", "我们约明天开个会吧。"],
      ["Could you send me the report?", "能把报告发我吗？"],
      ["I'll follow up on this by Friday.", "我周五前跟进这件事。"]
    ]}
  },
  ja: {
    order: { t: "🍽 点餐", list: [
      ["席をお願いします。", "请安排座位。"],
      ["メニューをいただけますか。", "能给我菜单吗？"],
      ["これをください。", "请给我这个。"],
      ["お会計をお願いします。", "请结账。"]
    ]},
    smalltalk: { t: "☕ 日常闲聊", list: [
      ["今日はいい天気ですね。", "今天天气真好呢。"],
      ["週末はどうでしたか。", "周末过得怎么样？"],
      ["深圳から来ました。", "我来自深圳。"]
    ]},
    work: { t: "💼 简易职场", list: [
      ["明日、会議をしましょう。", "我们明天开会吧。"],
      ["レポートを送ってもらえますか。", "能把报告发我吗？"],
      ["金曜日までにフォローします。", "我会在周五前跟进。"]
    ]}
  },
  ko: {
    order: { t: "🍽 点餐", list: [
      ["자리 부탁합니다.", "请安排座位。"],
      ["메뉴 좀 주세요.", "请给我菜单。"],
      ["이걸로 할게요.", "我要这个。"],
      ["계산서 주세요.", "请结账。"]
    ]},
    smalltalk: { t: "☕ 日常闲聊", list: [
      ["오늘 날씨 좋네요.", "今天天气真好。"],
      ["주말 잘 보냈어요?", "周末过得好吗？"],
      ["저는 선전에서 왔어요.", "我来自深圳。"]
    ]},
    work: { t: "💼 简易职场", list: [
      ["내일 회의합시다.", "我们明天开会吧。"],
      ["보고서 보내주시겠어요?", "能把报告发我吗？"],
      ["금요일까지 처리할게요.", "我会在周五前处理。"]
    ]}
  }
};
var LG_SCENE_KEYS = ["order", "smalltalk", "work"];

/* 内置基础词库（每语种 36 词：词 / 音标(读音) / 释义 / 例句 / 例句译）——添加生词自动补全、可一键导入 */
var LG_WORDBANK = {
  en: [
    ["work", "/wɜːrk/", "工作", "I work from home three days a week.", "我一周有三天在家办公"],
    ["meeting", "/ˈmiːtɪŋ/", "会议", "The meeting starts at ten.", "会议十点开始"],
    ["schedule", "/ˈskedʒuːl/", "日程", "Let me check my schedule.", "我看下我的日程"],
    ["deadline", "/ˈdedlaɪn/", "截止日期", "The deadline is Friday.", "截止日期是周五"],
    ["report", "/rɪˈpɔːrt/", "报告", "Please send me the report.", "请把报告发给我"],
    ["colleague", "/ˈkɑːliːɡ/", "同事", "My colleague is very helpful.", "我的同事很帮忙"],
    ["breakfast", "/ˈbrekfəst/", "早餐", "I had breakfast at seven.", "我七点吃的早餐"],
    ["lunch", "/lʌntʃ/", "午餐", "Let's have lunch together.", "一起吃午饭吧"],
    ["dinner", "/ˈdɪnər/", "晚餐", "We had dinner at home.", "我们在家吃了晚饭"],
    ["coffee", "/ˈkɔːfi/", "咖啡", "Would you like some coffee?", "要来点咖啡吗"],
    ["restaurant", "/ˈrestrɑːnt/", "餐厅", "This restaurant is popular.", "这家餐厅很受欢迎"],
    ["delicious", "/dɪˈlɪʃəs/", "美味的", "The cake is delicious.", "这蛋糕很好吃"],
    ["hotel", "/hoʊˈtel/", "酒店", "The hotel is near the station.", "酒店在车站附近"],
    ["airport", "/ˈerpɔːrt/", "机场", "I'll meet you at the airport.", "我去机场接你"],
    ["ticket", "/ˈtɪkɪt/", "票", "How much is the ticket?", "票多少钱"],
    ["train", "/treɪn/", "火车", "The train leaves at eight.", "火车八点开"],
    ["weather", "/ˈweðər/", "天气", "The weather is nice today.", "今天天气很好"],
    ["rain", "/reɪn/", "雨", "It may rain this afternoon.", "下午可能下雨"],
    ["cold", "/koʊld/", "冷的", "It's very cold outside.", "外面很冷"],
    ["hot", "/hɑːt/", "热的", "The soup is hot.", "汤是热的"],
    ["happy", "/ˈhæpi/", "高兴的", "I'm happy to see you.", "见到你我很高兴"],
    ["tired", "/ˈtaɪərd/", "累的", "I'm a little tired.", "我有点累"],
    ["busy", "/ˈbɪzi/", "忙的", "Are you busy now?", "你现在忙吗"],
    ["early", "/ˈɜːrli/", "早的", "I get up early every day.", "我每天早起"],
    ["late", "/leɪt/", "迟的", "Sorry I'm late.", "抱歉我迟到了"],
    ["money", "/ˈmʌni/", "钱", "I need some money.", "我需要一些钱"],
    ["price", "/praɪs/", "价格", "The price is reasonable.", "这个价格合理"],
    ["buy", "/baɪ/", "买", "I want to buy a phone.", "我想买部手机"],
    ["sell", "/sel/", "卖", "This shop sells books.", "这家店卖书"],
    ["learn", "/lɜːrn/", "学习", "I want to learn Japanese.", "我想学日语"],
    ["speak", "/spiːk/", "说", "She speaks three languages.", "她会说三种语言"],
    ["listen", "/ˈlɪsn/", "听", "Please listen to me.", "请听我说"],
    ["read", "/riːd/", "读", "I read the news every morning.", "我每天早上读新闻"],
    ["write", "/raɪt/", "写", "Please write your name.", "请写下你的名字"],
    ["phone", "/foʊn/", "手机", "My phone is dead.", "我手机没电了"],
    ["email", "/ˈiːmeɪl/", "邮件", "I'll send you an email.", "我会给你发邮件"]
  ],
  ja: [
    ["仕事", "しごと", "工作", "仕事が忙しいです。", "工作很忙"],
    ["会議", "かいぎ", "会议", "会議は十時からです。", "会议从十点开始"],
    ["出張", "しゅっちょう", "出差", "来週出張します。", "下周出差"],
    ["連絡", "れんらく", "联系", "後で連絡します。", "稍后联系你"],
    ["朝ご飯", "あさごはん", "早餐", "朝ご飯を食べました。", "吃了早饭"],
    ["昼ご飯", "ひるごはん", "午餐", "一緒に昼ご飯を食べましょう。", "一起吃午饭吧"],
    ["晩ご飯", "ばんごはん", "晚餐", "晩ご飯は家で食べます。", "晚饭在家吃"],
    ["水", "みず", "水", "水をください。", "请给我水"],
    ["コーヒー", "コーヒー", "咖啡", "コーヒーはいかがですか。", "要来杯咖啡吗"],
    ["美味しい", "おいしい", "好吃的", "この料理は美味しいです。", "这道菜很好吃"],
    ["駅", "えき", "车站", "駅は近いです。", "车站很近"],
    ["切符", "きっぷ", "车票", "切符はいくらですか。", "票多少钱"],
    ["天気", "てんき", "天气", "今日はいい天気ですね。", "今天天气真好"],
    ["雨", "あめ", "雨", "午後は雨が降ります。", "下午会下雨"],
    ["寒い", "さむい", "冷的", "外はとても寒いです。", "外面很冷"],
    ["暑い", "あつい", "热的", "今日は暑いですね。", "今天很热呢"],
    ["嬉しい", "うれしい", "高兴的", "会えて嬉しいです。", "见到你很高兴"],
    ["疲れた", "つかれた", "累的", "ちょっと疲れました。", "有点累了"],
    ["忙しい", "いそがしい", "忙的", "今忙しいですか。", "现在忙吗"],
    ["早い", "はやい", "早的", "毎日早く起きます。", "每天早起"],
    ["遅い", "おそい", "迟的", "遅れてすみません。", "抱歉迟到了"],
    ["お金", "おかね", "钱", "お金が少し必要です。", "需要一些钱"],
    ["値段", "ねだん", "价格", "値段は手頃です。", "价格适中"],
    ["買う", "かう", "买", "新しいパソコンを買いたいです。", "想买台新电脑"],
    ["売る", "うる", "卖", "この店は本を売っています。", "这家店卖书"],
    ["勉強", "べんきょう", "学习", "日本語を勉強しています。", "正在学日语"],
    ["話す", "はなす", "说", "彼女は三か国語を話します。", "她会说三国语言"],
    ["聞く", "きく", "听", "私の話を聞いてください。", "请听我说"],
    ["読む", "よむ", "读", "毎朝ニュースを読みます。", "每天早上读新闻"],
    ["書く", "かく", "写", "名前を書いてください。", "请写下名字"],
    ["電話", "でんわ", "电话", "電話がつながらないです。", "电话打不通"],
    ["メール", "メール", "邮件", "メールを送ります。", "我会发邮件"],
    ["時間", "じかん", "时间", "時間がありますか。", "有时间吗"],
    ["友達", "ともだち", "朋友", "友達と会います。", "和朋友见面"],
    ["家", "いえ", "家", "家に帰ります。", "回家"],
    ["電車", "でんしゃ", "电车", "電車で行きます。", "坐电车去"]
  ],
  ko: [
    ["일", "일", "事情", "일이 많아요.", "事情很多"],
    ["회의", "회의", "会议", "회의는 열 시부터예요.", "会议从十点开始"],
    ["출장", "출장", "出差", "다음 주에 출장 가요.", "下周出差"],
    ["연락", "연락", "联系", "나중에 연락할게요.", "稍后联系你"],
    ["아침", "아침", "早餐", "아침을 먹었어요.", "吃了早饭"],
    ["점심", "점심", "午餐", "같이 점심 먹어요.", "一起吃午饭吧"],
    ["저녁", "저녁", "晚餐", "저녁은 집에서 먹어요.", "晚饭在家吃"],
    ["물", "물", "水", "물 주세요.", "请给我水"],
    ["커피", "커피", "咖啡", "커피 마실래요?", "要喝咖啡吗"],
    ["맛있는", "맛있는", "好吃的", "이 음식은 맛있어요.", "这道菜很好吃"],
    ["역", "역", "车站", "역이 가까워요.", "车站很近"],
    ["표", "표", "票", "표는 얼마예요?", "票多少钱"],
    ["날씨", "날씨", "天气", "오늘 날씨 좋네요.", "今天天气真好"],
    ["비", "비", "雨", "오후에 비가 와요.", "下午会下雨"],
    ["추운", "추운", "冷的", "밖에 아주 추워요.", "外面很冷"],
    ["더운", "더운", "热的", "오늘 덥네요.", "今天真热"],
    ["기쁜", "기쁜", "高兴的", "만나서 기뻐요.", "见到你很高兴"],
    ["피곤한", "피곤한", "累的", "좀 피곤해요.", "有点累"],
    ["바쁜", "바쁜", "忙的", "지금 바빠요?", "现在忙吗"],
    ["이른", "이른", "早的", "매일 일찍 일어나요.", "每天早起"],
    ["늦은", "늦은", "迟的", "늦어서 죄송해요.", "抱歉迟到了"],
    ["돈", "돈", "钱", "돈이 좀 필요해요.", "需要一些钱"],
    ["가격", "가격", "价格", "가격이 괜찮아요.", "价格合适"],
    ["사다", "사다", "买", "새 휴대폰을 사고 싶어요.", "想买部新手机"],
    ["팔다", "팔다", "卖", "이 가게는 책을 팔아요.", "这家店卖书"],
    ["공부하다", "공부하다", "学习", "한국어를 공부하고 있어요.", "正在学韩语"],
    ["말하다", "말하다", "说", "그녀는 세 나라 말을 해요.", "她会说三国语言"],
    ["듣다", "듣다", "听", "제 말 좀 들어 주세요.", "请听我说"],
    ["읽다", "읽다", "读", "매일 아침 뉴스를 읽어요.", "每天早上读新闻"],
    ["쓰다", "쓰다", "写", "이름을 써 주세요.", "请写下名字"],
    ["전화", "전화", "电话", "전화가 안 돼요.", "电话打不通"],
    ["이메일", "이메일", "邮件", "이메일을 보낼게요.", "我会发邮件"],
    ["시간", "시간", "时间", "시간 있어요?", "有时间吗"],
    ["친구", "친구", "朋友", "친구를 만나요.", "和朋友见面"],
    ["집", "집", "家", "집에 가요.", "回家"],
    ["지하철", "지하철", "地铁", "지하철로 가요.", "坐地铁去"]
  ]
};
function lgLookupWord(cur, term) {
  var bank = LG_WORDBANK[cur] || [];
  term = String(term || "").trim();
  for (var i = 0; i < bank.length; i++) {
    if (bank[i][0] === term) return { reading: bank[i][1], meaning: bank[i][2], example: bank[i][3], exampleCn: bank[i][4] };
  }
  return null;
}

/* 英语核心词库（500 常用词：词 / 中文释义）——可按组一键导入，或配合批量导入 3000 词表 */
var LG_CORE_EN = [
  // 日常生活 100
  ["home", "家"], ["family", "家庭"], ["friend", "朋友"], ["name", "名字"], ["year", "年"], ["month", "月"], ["week", "周"], ["day", "天"], ["hour", "小时"], ["minute", "分钟"],
  ["morning", "早晨"], ["afternoon", "下午"], ["evening", "傍晚"], ["night", "夜晚"], ["today", "今天"], ["tomorrow", "明天"], ["yesterday", "昨天"], ["now", "现在"], ["time", "时间"], ["date", "日期"],
  ["sun", "太阳"], ["moon", "月亮"], ["star", "星星"], ["sky", "天空"], ["earth", "地球"], ["water", "水"], ["air", "空气"], ["fire", "火"], ["weather", "天气"], ["wind", "风"],
  ["sunny", "晴朗的"], ["cloudy", "多云的"], ["rainy", "下雨的"], ["snow", "雪"], ["hot", "热的"], ["cold", "冷的"], ["warm", "暖和的"], ["cool", "凉爽的"], ["temperature", "温度"], ["season", "季节"],
  ["spring", "春天"], ["summer", "夏天"], ["autumn", "秋天"], ["winter", "冬天"], ["clothes", "衣服"], ["shirt", "衬衫"], ["shoes", "鞋子"], ["hat", "帽子"], ["coat", "外套"], ["pocket", "口袋"],
  ["food", "食物"], ["rice", "米饭"], ["bread", "面包"], ["milk", "牛奶"], ["egg", "鸡蛋"], ["meat", "肉"], ["fish", "鱼"], ["fruit", "水果"], ["vegetable", "蔬菜"], ["apple", "苹果"],
  ["banana", "香蕉"], ["orange", "橙子"], ["tea", "茶"], ["juice", "果汁"], ["sugar", "糖"], ["salt", "盐"], ["breakfast", "早餐"], ["lunch", "午餐"], ["dinner", "晚餐"], ["snack", "零食"],
  ["drink", "喝"], ["eat", "吃"], ["cook", "烹饪"], ["taste", "味道"], ["sweet", "甜的"], ["sour", "酸的"], ["bitter", "苦的"], ["body", "身体"], ["head", "头"], ["face", "脸"],
  ["eye", "眼睛"], ["ear", "耳朵"], ["nose", "鼻子"], ["mouth", "嘴"], ["hand", "手"], ["foot", "脚"], ["arm", "手臂"], ["leg", "腿"], ["hair", "头发"], ["heart", "心脏"],
  ["doctor", "医生"], ["hospital", "医院"], ["medicine", "药"], ["healthy", "健康的"], ["sick", "生病的"], ["tired", "累的"], ["sleep", "睡觉"], ["rest", "休息"], ["pain", "疼痛"], ["cough", "咳嗽"],
  // 职场办公 100
  ["job", "工作"], ["work", "工作"], ["office", "办公室"], ["company", "公司"], ["boss", "老板"], ["manager", "经理"], ["team", "团队"], ["colleague", "同事"], ["staff", "员工"], ["career", "职业"],
  ["meeting", "会议"], ["schedule", "日程"], ["deadline", "截止日期"], ["report", "报告"], ["project", "项目"], ["plan", "计划"], ["goal", "目标"], ["task", "任务"], ["skill", "技能"], ["experience", "经验"],
  ["interview", "面试"], ["salary", "薪水"], ["promotion", "晋升"], ["training", "培训"], ["contract", "合同"], ["resume", "简历"], ["hire", "雇佣"], ["fire", "解雇"], ["quit", "辞职"], ["retire", "退休"],
  ["email", "邮件"], ["phone", "电话"], ["message", "消息"], ["document", "文件"], ["file", "档案"], ["data", "数据"], ["information", "信息"], ["notice", "通知"], ["question", "问题"], ["answer", "回答"],
  ["decision", "决定"], ["problem", "难题"], ["solution", "解决方案"], ["idea", "想法"], ["suggestion", "建议"], ["discussion", "讨论"], ["negotiation", "谈判"], ["agreement", "协议"], ["contract", "合同"], ["policy", "政策"],
  ["customer", "客户"], ["client", "客户"], ["partner", "伙伴"], ["business", "商业"], ["market", "市场"], ["product", "产品"], ["service", "服务"], ["quality", "质量"], ["price", "价格"], ["cost", "成本"],
  ["profit", "利润"], ["budget", "预算"], ["sales", "销售"], ["order", "订单"], ["delivery", "交付"], ["supply", "供应"], ["demand", "需求"], ["competitor", "竞争对手"], ["strategy", "策略"], ["analysis", "分析"],
  ["improve", "改进"], ["develop", "发展"], ["create", "创造"], ["manage", "管理"], ["organize", "组织"], ["communicate", "沟通"], ["cooperate", "合作"], ["support", "支持"], ["help", "帮助"], ["advise", "建议"],
  ["explain", "解释"], ["describe", "描述"], ["present", "演示"], ["discuss", "讨论"], ["decide", "决定"], ["complete", "完成"], ["achieve", "达成"], ["success", "成功"], ["failure", "失败"], ["challenge", "挑战"],
  ["opportunity", "机会"], ["responsibility", "责任"], ["pressure", "压力"], ["stress", "压力"], ["balance", "平衡"], ["efficient", "高效的"], ["professional", "专业的"], ["creative", "有创造力的"], ["reliable", "可靠的"], ["responsible", "负责的"],
  // 学习/教育 100
  ["school", "学校"], ["student", "学生"], ["teacher", "老师"], ["class", "班级"], ["lesson", "课"], ["course", "课程"], ["book", "书"], ["notebook", "笔记本"], ["pen", "笔"], ["pencil", "铅笔"],
  ["paper", "纸"], ["word", "单词"], ["sentence", "句子"], ["language", "语言"], ["english", "英语"], ["chinese", "中文"], ["japanese", "日语"], ["korean", "韩语"], ["grammar", "语法"], ["vocabulary", "词汇"],
  ["pronunciation", "发音"], ["listening", "听力"], ["speaking", "口语"], ["reading", "阅读"], ["writing", "写作"], ["translation", "翻译"], ["meaning", "含义"], ["definition", "定义"], ["example", "例子"], ["practice", "练习"],
  ["review", "复习"], ["memorize", "记忆"], ["understand", "理解"], ["remember", "记住"], ["forget", "忘记"], ["learn", "学习"], ["study", "学习"], ["teach", "教授"], ["explain", "讲解"], ["quiz", "小测验"],
  ["exam", "考试"], ["test", "测试"], ["score", "分数"], ["grade", "成绩"], ["homework", "作业"], ["library", "图书馆"], ["dictionary", "词典"], ["question", "问题"], ["correct", "正确的"], ["wrong", "错误的"],
  ["easy", "容易的"], ["difficult", "困难的"], ["hard", "难的"], ["simple", "简单的"], ["important", "重要的"], ["necessary", "必要的"], ["useful", "有用的"], ["helpful", "有帮助的"], ["interesting", "有趣的"], ["boring", "无聊的"],
  ["fun", "乐趣"], ["knowledge", "知识"], ["ability", "能力"], ["habit", "习惯"], ["progress", "进步"], ["improvement", "提高"], ["attention", "注意力"], ["focus", "专注"], ["concentration", "专注"], ["effort", "努力"],
  ["goal", "目标"], ["plan", "计划"], ["method", "方法"], ["way", "方式"], ["reason", "原因"], ["result", "结果"], ["effect", "效果"], ["begin", "开始"], ["finish", "完成"], ["continue", "继续"],
  ["repeat", "重复"], ["pause", "暂停"], ["listen", "听"], ["speak", "说"], ["read", "读"], ["write", "写"], ["spell", "拼写"], ["pronounce", "发音"], ["translate", "翻译"], ["summarize", "总结"],
  // 旅行/餐饮 100
  ["travel", "旅行"], ["trip", "旅程"], ["tour", "旅游"], ["tourist", "游客"], ["hotel", "酒店"], ["inn", "旅馆"], ["room", "房间"], ["key", "钥匙"], ["luggage", "行李"], ["suitcase", "行李箱"],
  ["bag", "包"], ["backpack", "背包"], ["passport", "护照"], ["visa", "签证"], ["ticket", "票"], ["flight", "航班"], ["airport", "机场"], ["plane", "飞机"], ["train", "火车"], ["station", "车站"],
  ["bus", "公交车"], ["subway", "地铁"], ["taxi", "出租车"], ["car", "汽车"], ["bike", "自行车"], ["drive", "驾驶"], ["ride", "乘坐"], ["walk", "步行"], ["map", "地图"], ["direction", "方向"],
  ["left", "左边"], ["right", "右边"], ["straight", "直走"], ["near", "近的"], ["far", "远的"], ["here", "这里"], ["there", "那里"], ["where", "哪里"], ["address", "地址"], ["route", "路线"],
  ["city", "城市"], ["country", "国家"], ["village", "村庄"], ["street", "街道"], ["road", "道路"], ["bridge", "桥"], ["park", "公园"], ["square", "广场"], ["museum", "博物馆"], ["restaurant", "餐厅"],
  ["cafe", "咖啡馆"], ["menu", "菜单"], ["waiter", "服务员"], ["order", "点餐"], ["bill", "账单"], ["pay", "付款"], ["tip", "小费"], ["cash", "现金"], ["change", "零钱"], ["expensive", "昂贵的"],
  ["cheap", "便宜的"], ["free", "免费的"], ["discount", "折扣"], ["reservation", "预订"], ["book", "预订"], ["seat", "座位"], ["table", "桌子"], ["glass", "杯子"], ["plate", "盘子"], ["fork", "叉子"],
  ["knife", "刀"], ["spoon", "勺子"], ["chopsticks", "筷子"], ["soup", "汤"], ["salad", "沙拉"], ["chicken", "鸡肉"], ["beef", "牛肉"], ["pork", "猪肉"], ["vegetarian", "素食的"], ["delicious", "美味的"],
  ["hungry", "饿的"], ["thirsty", "渴的"], ["full", "饱的"], ["fresh", "新鲜的"], ["smell", "气味"], ["weather", "天气"], ["umbrella", "雨伞"], ["beach", "海滩"], ["mountain", "山"], ["sea", "海"],
  // 科技/硬件 100
  ["computer", "电脑"], ["laptop", "笔记本"], ["phone", "手机"], ["smartphone", "智能手机"], ["tablet", "平板"], ["screen", "屏幕"], ["keyboard", "键盘"], ["mouse", "鼠标"], ["camera", "相机"], ["speaker", "扬声器"],
  ["headphone", "耳机"], ["charger", "充电器"], ["battery", "电池"], ["power", "电源"], ["cable", "数据线"], ["wire", "电线"], ["plug", "插头"], ["socket", "插座"], ["button", "按钮"], ["switch", "开关"],
  ["software", "软件"], ["hardware", "硬件"], ["app", "应用"], ["program", "程序"], ["system", "系统"], ["network", "网络"], ["internet", "互联网"], ["website", "网站"], ["server", "服务器"], ["cloud", "云"],
  ["data", "数据"], ["chip", "芯片"], ["processor", "处理器"], ["memory", "内存"], ["storage", "存储"], ["disk", "磁盘"], ["sensor", "传感器"], ["module", "模块"], ["device", "设备"], ["machine", "机器"],
  ["robot", "机器人"], ["smart", "智能的"], ["intelligent", "智能的"], ["digital", "数字的"], ["electronic", "电子的"], ["wireless", "无线的"], ["bluetooth", "蓝牙"], ["wifi", "无线网络"], ["signal", "信号"], ["connect", "连接"],
  ["install", "安装"], ["update", "更新"], ["upgrade", "升级"], ["download", "下载"], ["upload", "上传"], ["save", "保存"], ["delete", "删除"], ["copy", "复制"], ["paste", "粘贴"], ["search", "搜索"],
  ["print", "打印"], ["scan", "扫描"], ["record", "记录"], ["play", "播放"], ["video", "视频"], ["audio", "音频"], ["image", "图片"], ["photo", "照片"], ["file", "文件"], ["folder", "文件夹"],
  ["design", "设计"], ["develop", "开发"], ["test", "测试"], ["fix", "修复"], ["repair", "修理"], ["maintain", "维护"], ["operate", "操作"], ["control", "控制"], ["measure", "测量"], ["check", "检查"],
  ["fast", "快的"], ["slow", "慢的"], ["strong", "坚固的"], ["light", "轻的"], ["heavy", "重的"], ["small", "小的"], ["large", "大的"], ["portable", "便携的"], ["durable", "耐用的"], ["powerful", "强大的"],
  ["function", "功能"], ["feature", "特性"], ["model", "型号"], ["version", "版本"], ["brand", "品牌"], ["quality", "品质"], ["warranty", "保修"], ["manual", "说明书"], ["guide", "指南"], ["instruction", "说明"]
];
var LG_READINGS = {
  en: [
    { level: "入门", title: "A Busy Morning", content: "Tom wakes up at seven. He washes his face and brushes his teeth. He eats breakfast at seven thirty. He takes the bus to work. He arrives at the office at eight forty. His morning is busy but good.", translation: "汤姆七点起床。他洗脸刷牙。七点半吃早餐。他坐公交去上班。八点四十到办公室。他的早晨很忙但很好。" },
    { level: "入门", title: "My Daily Routine", content: "I get up at six thirty. I drink a cup of coffee. I check my emails. I go to work by subway. I have lunch at noon. In the evening, I read or watch TV. I go to bed at eleven.", translation: "我六点半起床。喝一杯咖啡。查看邮件。坐地铁上班。中午吃午饭。晚上看书或看电视。十一点睡觉。" },
    { level: "进阶", title: "Working from Home", content: "More people are working from home these days. It saves commuting time and gives more flexibility. But it also needs self-discipline. I set a clear schedule and take short breaks. Video calls help us stay connected with the team.", translation: "如今越来越多人居家办公。它节省通勤时间，也更有灵活性。但也需要自律。我会设定明确的日程并短暂休息。视频通话帮助我们与团队保持联系。" }
  ],
  ja: [
    { level: "入门", title: "私の一日", content: "私は六時に起きます。朝ご飯を食べて、電車で会社へ行きます。九時から仕事が始まります。昼に同僚と食事をします。夜は家で本を読みます。十一時に寝ます。", translation: "我六点起床。吃过早饭后坐电车去公司。九点开始工作。中午和同事吃饭。晚上在家看书。十一点睡觉。" },
    { level: "入门", title: "休みの日", content: "日曜日は休みです。朝はゆっくり起きます。買い物に行きます。午後は公園を散歩します。夜は友達と食事をします。楽しい一日です。", translation: "周日休息。早上睡到自然醒。去买东西。下午去公园散步。晚上和朋友吃饭。是快乐的一天。" },
    { level: "进阶", title: "出張の話", content: "来週、大阪へ出張します。会議は二日間です。新幹線で行きます。ホテルは駅の近くです。帰りに名産品を買います。出張は疲れますが、いい経験です。", translation: "下周去大阪出差。会议两天。坐新干线去。酒店在车站附近。回来时买特产。出差很累但是很好的经历。" }
  ],
  ko: [
    { level: "入门", title: "나의 하루", content: "저는 여섯 시에 일어나요. 아침을 먹고 지하철로 회사에 가요. 아홉 시부터 일을 시작해요. 점심은 동료와 같이 먹어요. 저녁에는 집에서 책을 읽어요. 열한 시에 자요.", translation: "我六点起床。吃过早饭后坐地铁去公司。九点开始工作。中午和同事一起吃饭。晚上在家看书。十一点睡觉。" },
    { level: "入门", title: "주말", content: "일요일은 쉬어요. 아침에 늦게 일어나요. 쇼핑하러 가요. 오후에는 공원에서 걸어요. 저녁에는 친구와 같이 밥을 먹어요. 즐거운 하루예요.", translation: "周日休息。早上晚点起床。去购物。下午在公园散步。晚上和朋友一起吃饭。是快乐的一天。" },
    { level: "进阶", title: "출장 이야기", content: "다음 주에 부산으로 출장 가요. 회의는 이틀이에요. 기차로 가요. 호텔은 역 근처에 있어요. 돌아올 때 특산품을 사요. 출장은 힘들지만 좋은 경험이에요.", translation: "下周去釜山出差。会议两天。坐火车去。酒店在车站附近。回来时买特产。出差很累但也是好经历。" }
  ]
};

/* =============================================================
 * 单词库：雅思 / 外贸（English 词库，含音标 + 例句 + 例句译文，例句可点 🔊 朗读）
 * 每日推送 dailyCount 个单词（设置可调），标记 不会/模糊/认识，不会的进重点复习
 * ============================================================= */
var LG_IELTS_RAW = [
  ["analyze", "/ˈænəlaɪz/", "v", "分析", "We need to analyze the data carefully.", "我们需要仔细分析这些数据。"],
  ["approach", "/əˈprəʊtʃ/", "v", "接近；处理", "We should approach the problem calmly.", "我们应该冷静地处理这个问题。"],
  ["benefit", "/ˈbenɪfɪt/", "n/v", "好处；受益", "Regular exercise has many health benefits.", "规律运动有许多健康益处。"],
  ["category", "/ˈkætəɡəri/", "n", "类别", "These books fall into different categories.", "这些书分属不同类别。"],
  ["commit", "/kəˈmɪt/", "v", "承诺；犯（错）", "The company committed to reducing waste.", "公司承诺减少浪费。"],
  ["complex", "/ˈkɒmpleks/", "adj", "复杂的", "The system is complex but efficient.", "这个系统复杂但高效。"],
  ["conclude", "/kənˈkluːd/", "v", "得出结论", "We concluded the meeting at noon.", "我们在中午结束了会议。"],
  ["consequence", "/ˈkɒnsɪkwəns/", "n", "后果", "Every action has a consequence.", "每个行为都有后果。"],
  ["consist", "/kənˈsɪst/", "v", "由…组成", "The team consists of five members.", "团队由五名成员组成。"],
  ["context", "/ˈkɒntekst/", "n", "背景；语境", "You should read the word in context.", "你应该结合语境理解这个词。"],
  ["create", "/kriˈeɪt/", "v", "创造", "They created a new product.", "他们创造了一个新产品。"],
  ["crucial", "/ˈkruːʃl/", "adj", "关键的", "Communication is crucial for teamwork.", "沟通对团队合作至关重要。"],
  ["culture", "/ˈkʌltʃə/", "n", "文化", "Culture shapes how we think.", "文化塑造我们的思维方式。"],
  ["declare", "/dɪˈkleə/", "v", "宣布", "The government declared a holiday.", "政府宣布放假。"],
  ["decline", "/dɪˈklaɪn/", "v", "下降；衰退", "Sales declined this quarter.", "本季度销售额下降。"],
  ["demonstrate", "/ˈdemənstreɪt/", "v", "证明；演示", "The test demonstrates the effect.", "测试证明了这一效果。"],
  ["design", "/dɪˈzaɪn/", "v/n", "设计", "We designed a simple app.", "我们设计了一个简单的应用。"],
  ["distinct", "/dɪˈstɪŋkt/", "adj", "明显的；不同的", "These two ideas are distinct.", "这两个想法明显不同。"],
  ["distribute", "/dɪˈstrɪbjuːt/", "v", "分配；分发", "The team distributed the materials.", "团队分发了材料。"],
  ["dominate", "/ˈdɒmɪneɪt/", "v", "主导", "The brand dominates the market.", "该品牌主导市场。"],
  ["economy", "/ɪˈkɒnəmi/", "n", "经济", "The economy is growing slowly.", "经济缓慢增长。"],
  ["effective", "/ɪˈfektɪv/", "adj", "有效的", "This method is effective.", "这个方法有效。"],
  ["element", "/ˈelɪmənt/", "n", "元素；要素", "Trust is a key element.", "信任是关键要素。"],
  ["eliminate", "/ɪˈlɪmɪneɪt/", "v", "消除", "We eliminated the risk.", "我们消除了风险。"],
  ["emerge", "/ɪˈmɜːdʒ/", "v", "出现；浮现", "A new trend emerged.", "一个新趋势出现了。"],
  ["emphasis", "/ˈemfəsɪs/", "n", "强调", "The report puts emphasis on safety.", "报告强调安全。"],
  ["enable", "/ɪˈneɪbl/", "v", "使能够", "The tool enables faster work.", "这个工具使工作更快。"],
  ["enhance", "/ɪnˈhɑːns/", "v", "提升", "Training enhances skills.", "培训提升技能。"],
  ["environment", "/ɪnˈvaɪrənmənt/", "n", "环境", "We must protect the environment.", "我们必须保护环境。"],
  ["establish", "/ɪˈstæblɪʃ/", "v", "建立", "They established a new lab.", "他们建立了新实验室。"],
  ["evaluate", "/ɪˈvæljueɪt/", "v", "评估", "We evaluated the options.", "我们评估了各种选项。"],
  ["evidence", "/ˈevɪdəns/", "n", "证据", "There is evidence of improvement.", "有进步的证据。"],
  ["evolve", "/ɪˈvɒlv/", "v", "进化；演变", "Technology evolves quickly.", "技术演变很快。"],
  ["expand", "/ɪkˈspænd/", "v", "扩张", "The company expanded abroad.", "公司扩展到海外。"],
  ["expose", "/ɪkˈspəʊz/", "v", "暴露；使接触", "Children should be exposed to books.", "孩子应该接触书籍。"],
  ["feature", "/ˈfiːtʃə/", "n/v", "特征；以…为特色", "The phone features a good camera.", "这款手机以好相机为特色。"],
  ["focus", "/ˈfəʊkəs/", "v/n", "聚焦；焦点", "Focus on the main task.", "聚焦主要任务。"],
  ["function", "/ˈfʌŋkʃən/", "n/v", "功能；运作", "The device functions well.", "设备运作良好。"],
  ["generate", "/ˈdʒenəreɪt/", "v", "产生", "Solar panels generate electricity.", "太阳能板产生电力。"],
  ["global", "/ˈɡləʊbl/", "adj", "全球的", "Global trade is growing.", "全球贸易在增长。"],
  ["guarantee", "/ˌɡærənˈtiː/", "v/n", "保证", "We guarantee quality.", "我们保证质量。"],
  ["identify", "/aɪˈdentɪfaɪ/", "v", "识别", "We identified the problem.", "我们识别出了问题。"],
  ["illustrate", "/ˈɪləstreɪt/", "v", "说明；举例", "The chart illustrates the trend.", "图表说明了趋势。"],
  ["implement", "/ˈɪmplɪment/", "v", "实施", "We implemented the plan.", "我们实施了计划。"],
  ["imply", "/ɪmˈplaɪ/", "v", "暗示", "The data implies a change.", "数据暗示有变化。"],
  ["increase", "/ɪnˈkriːs/", "v", "增加", "Costs increased last year.", "去年成本增加。"],
  ["indicate", "/ˈɪndɪkeɪt/", "v", "表明", "The sign indicates danger.", "标志表明危险。"],
  ["innovate", "/ˈɪnəveɪt/", "v", "创新", "Firms must innovate to survive.", "企业必须创新以求生存。"],
  ["interpret", "/ɪnˈtɜːprɪt/", "v", "解释；口译", "How do you interpret this?", "你如何解释这个？"],
  ["involve", "/ɪnˈvɒlv/", "v", "涉及", "The job involves travel.", "这份工作涉及出差。"],
  ["maintain", "/meɪnˈteɪn/", "v", "维持", "We maintain good relations.", "我们维持良好关系。"],
  ["major", "/ˈmeɪdʒə/", "adj", "主要的", "This is a major issue.", "这是个主要问题。"],
  ["motivate", "/ˈməʊtɪveɪt/", "v", "激励", "Good pay motivates staff.", "好的薪酬激励员工。"],
  ["objective", "/əbˈdʒektɪv/", "n/adj", "目标；客观的", "Our objective is clear.", "我们的目标明确。"],
  ["obtain", "/əbˈteɪn/", "v", "获得", "We obtained the permit.", "我们获得了许可。"],
  ["obvious", "/ˈɒbviəs/", "adj", "明显的", "The answer is obvious.", "答案很明显。"],
  ["occupy", "/ˈɒkjupaɪ/", "v", "占据", "The task occupied my morning.", "这项任务占用了我上午。"],
  ["occur", "/əˈkɜː/", "v", "发生", "Errors occur rarely.", "错误很少发生。"],
  ["outcome", "/ˈaʊtkʌm/", "n", "结果", "The outcome was positive.", "结果是积极的。"],
  ["percentage", "/pəˈsentɪdʒ/", "n", "百分比", "A small percentage agreed.", "少数百分比的人同意。"],
  ["period", "/ˈpɪəriəd/", "n", "时期", "The period was difficult.", "那段时期很困难。"],
  ["persist", "/pəˈsɪst/", "v", "坚持", "You must persist to succeed.", "你必须坚持才能成功。"],
  ["phase", "/feɪz/", "n", "阶段", "We entered a new phase.", "我们进入新阶段。"],
  ["phenomenon", "/fəˈnɒmɪnən/", "n", "现象", "This is a common phenomenon.", "这是常见现象。"],
  ["policy", "/ˈpɒləsi/", "n", "政策", "The policy changed.", "政策改变了。"],
  ["portion", "/ˈpɔːʃn/", "n", "部分", "A portion of the cost is fixed.", "部分成本是固定的。"],
  ["potential", "/pəˈtenʃl/", "adj/n", "潜在的；潜力", "The market has potential.", "这个市场有潜力。"],
  ["precise", "/prɪˈsaɪs/", "adj", "精确的", "We need precise data.", "我们需要精确的数据。"],
  ["predict", "/prɪˈdɪkt/", "v", "预测", "Experts predict growth.", "专家预测增长。"],
  ["principal", "/ˈprɪnsəpl/", "adj/n", "主要的；校长", "The principal reason is cost.", "主要原因是成本。"],
  ["principle", "/ˈprɪnsəpl/", "n", "原则", "Honesty is a principle.", "诚实是原则。"],
  ["prior", "/ˈpraɪə/", "adj", "先前的", "Prior experience helps.", "先前经验有帮助。"],
  ["promote", "/prəˈməʊt/", "v", "促进；晋升", "The campaign promotes health.", "活动促进健康。"],
  ["proportion", "/prəˈpɔːʃn/", "n", "比例", "A large proportion agreed.", "很大比例的人同意。"],
  ["publish", "/ˈpʌblɪʃ/", "v", "出版；发布", "They published a report.", "他们发布了一份报告。"],
  ["pursue", "/pəˈsjuː/", "v", "追求", "She pursues a career in art.", "她追求艺术事业。"],
  ["range", "/reɪndʒ/", "n/v", "范围；变化", "Prices range from 10 to 50.", "价格从10到50不等。"],
  ["react", "/riˈækt/", "v", "反应", "Markets react to news.", "市场对新闻有反应。"],
  ["recover", "/rɪˈkʌvə/", "v", "恢复", "The economy recovered.", "经济恢复了。"],
  ["reduce", "/rɪˈdjuːs/", "v", "减少", "We reduced costs.", "我们降低了成本。"],
  ["reflect", "/rɪˈflekt/", "v", "反映", "The data reflects reality.", "数据反映现实。"],
  ["region", "/ˈriːdʒən/", "n", "地区", "The region is growing.", "该地区在增长。"],
  ["regulate", "/ˈreɡjuleɪt/", "v", "监管", "The body regulates temperature.", "身体调节温度。"],
  ["reinforce", "/ˌriːɪnˈfɔːs/", "v", "加强", "Training reinforces skills.", "培训加强技能。"],
  ["release", "/rɪˈliːs/", "v", "发布；释放", "They released a new version.", "他们发布了新版本。"],
  ["relevant", "/ˈreləvənt/", "adj", "相关的", "This point is relevant.", "这点相关。"],
  ["rely", "/rɪˈlaɪ/", "v", "依赖", "We rely on data.", "我们依赖数据。"],
  ["remove", "/rɪˈmuːv/", "v", "移除", "Please remove the file.", "请移除该文件。"],
  ["require", "/rɪˈkwaɪə/", "v", "需要", "The job requires skills.", "这份工作需要技能。"],
  ["resolve", "/rɪˈzɒlv/", "v", "解决", "We resolved the issue.", "我们解决了问题。"],
  ["resource", "/rɪˈsɔːs/", "n", "资源", "Water is a key resource.", "水是关键资源。"],
  ["respond", "/rɪˈspɒnd/", "v", "回应", "He responded quickly.", "他快速回应。"],
  ["restore", "/rɪˈstɔː/", "v", "恢复", "We restored the service.", "我们恢复了服务。"],
  ["restrict", "/rɪˈstrɪkt/", "v", "限制", "The rule restricts use.", "规则限制使用。"],
  ["retain", "/rɪˈreɪn/", "v", "保留", "We retain the record.", "我们保留记录。"],
  ["reveal", "/rɪˈviːl/", "v", "揭示", "The study reveals a trend.", "研究揭示了一个趋势。"],
  ["significant", "/sɪɡˈnɪfɪkənt/", "adj", "显著的", "There was a significant change.", "有显著变化。"],
  ["solve", "/sɒlv/", "v", "解决", "We solved the problem.", "我们解决了问题。"],
  ["source", "/sɔːs/", "n", "来源", "The source is reliable.", "来源可靠。"],
  ["stable", "/ˈsteɪbl/", "adj", "稳定的", "The market is stable.", "市场稳定。"]
];
var LG_TRADE_RAW = [
  ["invoice", "/ˈɪnvɔɪs/", "n", "发票", "Please send the invoice today.", "请今天发送发票。"],
  ["quotation", "/kwəʊˈteɪʃn/", "n", "报价", "We received a quotation yesterday.", "我们昨天收到了报价。"],
  ["shipment", "/ˈʃɪpmənt/", "n", "装运；发货", "The shipment left the port.", "货物已离港。"],
  ["customs", "/ˈkʌstəmz/", "n", "海关", "Customs cleared the goods.", "海关放行了货物。"],
  ["tariff", "/ˈtærɪf/", "n", "关税", "The tariff increased costs.", "关税增加了成本。"],
  ["freight", "/freɪt/", "n", "货运", "Freight costs are rising.", "货运成本在上升。"],
  ["negotiation", "/nɪɡəʊʃiˈeɪʃn/", "n", "谈判", "They entered a long negotiation.", "他们进行了漫长的谈判。"],
  ["contract", "/ˈkɒntrækt/", "n", "合同", "We signed the contract.", "我们签了合同。"],
  ["order", "/ˈɔːdə/", "n", "订单", "We got a big order.", "我们接了一个大订单。"],
  ["delivery", "/dɪˈlɪvəri/", "n", "交付", "Delivery is within 30 days.", "30天内交付。"],
  ["supplier", "/səˈplaɪə/", "n", "供应商", "Our supplier is reliable.", "我们的供应商可靠。"],
  ["wholesale", "/ˈhəʊlseɪl/", "n", "批发", "We buy at wholesale.", "我们按批发价采购。"],
  ["retail", "/ˈriːteɪl/", "n", "零售", "Retail prices vary.", "零售价各异。"],
  ["margin", "/ˈmɑːdʒɪn/", "n", "利润；边际", "Our margin is 20%.", "我们的利润率是20%。"],
  ["commission", "/kəˈmɪʃn/", "n", "佣金", "He earns a commission.", "他赚取佣金。"],
  ["sample", "/ˈsɑːmpl/", "n", "样品", "Send us a sample.", "给我们寄样品。"],
  ["bulk", "/bʌlk/", "n", "大宗", "We ship in bulk.", "我们大宗发货。"],
  ["container", "/kənˈteɪnə/", "n", "集装箱", "The container is loaded.", "集装箱已装载。"],
  ["port", "/pɔːt/", "n", "港口", "The port is busy.", "港口很繁忙。"],
  ["export", "/ɪkˈspɔːt/", "v/n", "出口", "We export to Europe.", "我们向欧洲出口。"],
  ["import", "/ˈɪmpɔːt/", "n/v", "进口", "Imports rose this year.", "今年进口增加了。"],
  ["broker", "/ˈbrəʊkə/", "n", "经纪人", "A broker found the buyer.", "经纪找到了买家。"],
  ["consignee", "/ˌkɒnsaɪˈniː/", "n", "收货人", "The consignee signed.", "收货人签了字。"],
  ["consignor", "/kənˈsaɪnə/", "n", "发货人", "The consignor shipped the goods.", "发货人发出了货物。"],
  ["insurance", "/ɪnˈʃʊərəns/", "n", "保险", "We bought cargo insurance.", "我们买了货物保险。"],
  ["premium", "/ˈpriːmiəm/", "n", "保费；溢价", "The premium is high.", "保费很高。"],
  ["claim", "/kleɪm/", "n/v", "索赔", "We filed a claim.", "我们提出了索赔。"],
  ["packing", "/ˈpækɪŋ/", "n", "包装", "Packing must be safe.", "包装必须安全。"],
  ["warehouse", "/ˈweəhaʊs/", "n", "仓库", "Goods are in the warehouse.", "货物在仓库里。"],
  ["inventory", "/ˈɪnvəntri/", "n", "库存", "Inventory is low.", "库存很低。"],
  ["procurement", "/prəˈkjʊəmənt/", "n", "采购", "Procurement takes time.", "采购需要时间。"],
  ["logistics", "/ləˈdʒɪstɪks/", "n", "物流", "Logistics is complex.", "物流很复杂。"],
  ["compliance", "/kəmˈplaɪəns/", "n", "合规", "We ensure compliance.", "我们确保合规。"],
  ["certificate", "/səˈtɪfɪkət/", "n", "证书", "We need a certificate.", "我们需要证书。"],
  ["inspection", "/ɪnˈspekʃn/", "n", "检验", "Inspection passed.", "检验通过了。"],
  ["quality", "/ˈkwɒləti/", "n", "质量", "Quality is our focus.", "质量是我们的重点。"],
  ["defect", "/ˈdiːfekt/", "n", "缺陷", "A defect was found.", "发现了一个缺陷。"],
  ["refund", "/ˈriːfʌnd/", "n/v", "退款", "We issued a refund.", "我们办理了退款。"],
  ["discount", "/ˈdɪskaʊnt/", "n", "折扣", "We offer a discount.", "我们提供折扣。"],
  ["deposit", "/dɪˈpɒzɪt/", "n", "定金；押金", "Pay a 30% deposit.", "付30%定金。"],
  ["balance", "/ˈbæləns/", "n", "余额", "The balance is due.", "余款到期。"],
  ["remittance", "/rɪˈmɪtns/", "n", "汇款", "We got the remittance.", "我们收到了汇款。"],
  ["currency", "/ˈkʌrənsi/", "n", "货币", "The currency fell.", "货币贬值。"],
  ["exchange rate", "/ɪksˈtʃeɪndʒ reɪt/", "n", "汇率", "The exchange rate changed.", "汇率变了。"],
  ["Incoterms", "/ˈɪnkəʊtɜːmz/", "n", "国际贸易术语", "We use FOB Incoterms.", "我们用FOB贸易术语。"],
  ["FOB", "/ˌef əʊ ˈbiː/", "n", "离岸价", "Price is FOB Shenzhen.", "价格是深圳离岸价。"],
  ["CIF", "/ˌsiː aɪ ˈef/", "n", "到岸价", "Quoted on CIF basis.", "按到岸价报。"],
  ["agent", "/ˈeɪdʒənt/", "n", "代理", "We hired a local agent.", "我们雇了本地代理。"],
  ["distributor", "/dɪˈstrɪbjətə/", "n", "经销商", "Find a distributor.", "找经销商。"],
  ["franchise", "/ˈfræntʃaɪz/", "n", "特许经营", "We sold a franchise.", "我们卖了特许经营权。"],
  ["patent", "/ˈpætnt/", "n", "专利", "We hold the patent.", "我们持有专利。"],
  ["trademark", "/ˈtreɪdmɑːk/", "n", "商标", "Register the trademark.", "注册商标。"],
  ["counterpart", "/ˈkaʊntəpɑːt/", "n", "对方", "Meet your counterpart.", "见你的对方。"],
  ["tender", "/ˈtendə/", "n", "投标", "Submit a tender.", "提交投标。"],
  ["bid", "/bɪd/", "n/v", "出价；投标", "We won the bid.", "我们中标了。"],
  ["quota", "/ˈkwəʊtə/", "n", "配额", "There is a quota.", "有配额限制。"],
  ["embargo", "/ɪmˈbɑːɡəʊ/", "n", "禁运", "The embargo lifted.", "禁运解除了。"],
  ["affiliate", "/əˈfɪlieɪt/", "n/v", "附属公司；附属", "We are an affiliate.", "我们是一家附属公司。"],
  ["subsidiary", "/səbˈsɪdiəri/", "n", "子公司", "It is a subsidiary.", "它是一家子公司。"],
  ["merger", "/ˈmɜːdʒə/", "n", "合并", "The merger finished.", "合并完成了。"],
  ["acquisition", "/ˌækwɪˈzɪʃn/", "n", "收购", "The acquisition cost much.", "收购花费巨大。"],
  ["counterparty", "/kaʊntəˈpɑːti/", "n", "交易对手", "Assess the counterparty.", "评估交易对手。"],
  ["ledger", "/ˈledʒə/", "n", "总账", "Check the ledger.", "查总账。"],
  ["arbitration", "/ˌɑːbɪˈtreɪʃn/", "n", "仲裁", "We used arbitration.", "我们用了仲裁。"],
  ["dispute", "/dɪˈspjuːt/", "n/v", "争议", "Settle the dispute.", "解决争议。"],
  ["breach", "/briːtʃ/", "n/v", "违约；违反", "A breach occurred.", "发生了违约。"],
  ["enforce", "/ɪnˈfɔːs/", "v", "执行", "Enforce the contract.", "执行合同。"],
  ["terminate", "/ˈtɜːmɪneɪt/", "v", "终止", "We terminated the deal.", "我们终止了交易。"],
  ["renew", "/rɪˈnjuː/", "v", "续约", "Renew the contract.", "续约合同。"],
  ["credit", "/ˈkredɪt/", "n", "信用；信贷", "We offer credit terms.", "我们提供赊账条款。"]
];
function lgBuildPool(raw, prefix) {
  return raw.map(function (a, i) {
    return { id: prefix + "-" + (i + 1), word: a[0], phonetic: a[1], pos: a[2], meaning: a[3], example: a[4], exampleCn: a[5] };
  });
}
var LG_IELTS = lgBuildPool(LG_IELTS_RAW, "ielts");
var LG_TRADE = lgBuildPool(LG_TRADE_RAW, "trade");
function lgWordPools() { return { ielts: LG_IELTS, trade: LG_TRADE }; }
function lgWordById(id) {
  var pools = lgWordPools();
  for (var k in pools) { for (var i = 0; i < pools[k].length; i++) if (pools[k][i].id === id) return pools[k][i]; }
  return null;
}
function lgWordbankDefault() {
  return {
    lib: "ielts",
    enabled: { ielts: true, trade: true },
    dailyCount: 20,
    daily: null,        // { date, ids:[wordId...], results:{ id:"unknown"|"vague"|"known" } }
    progress: {}        // { wordId: { status, lastSeen, reps } }
  };
}
/* 确定性每日选词：不会>模糊>已知>未见，确保不会的优先复习；同档按 lastSeen 升序；截取 dailyCount */
function lgPickDailyWords(pools, enabled, count, progress, dateStr) {
  var cand = [];
  Object.keys(pools).forEach(function (k) {
    if (!enabled || enabled[k] !== false) (pools[k] || []).forEach(function (w) { cand.push(w); });
  });
  var prio = { unknown: 0, vague: 1, known: 2, unseen: 3 };
  cand.sort(function (a, b) {
    var pa = (progress[a.id] && progress[a.id].status) ? prio[progress[a.id].status] : 3;
    var pb = (progress[b.id] && progress[b.id].status) ? prio[progress[b.id].status] : 3;
    if (pa !== pb) return pa - pb;
    var la = progress[a.id] ? (progress[a.id].lastSeen || "") : "";
    var lb = progress[b.id] ? (progress[b.id].lastSeen || "") : "";
    if (la !== lb) return la < lb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  return cand.slice(0, count).map(function (w) { return w.id; });
}
/* 标记单词（纯函数：操作 wb 对象，更新 progress 与今日 daily.results） */
function lgMarkWordInWb(wb, id, status, dateStr) {
  if (!wb) return wb;
  wb.progress = wb.progress || {};
  wb.progress[id] = { status: status, lastSeen: dateStr, reps: (wb.progress[id] ? (wb.progress[id].reps || 0) : 0) + 1 };
  if (wb.daily && wb.daily.date === dateStr && wb.daily.ids && wb.daily.ids.indexOf(id) !== -1) {
    wb.daily.results = wb.daily.results || {};
    wb.daily.results[id] = status;
  }
  return wb;
}
/* 重点复习列表：不会优先，其次模糊；不会内部按复习次数升序（最少复习的先来） */
function lgWordbankReviewFromWb(wb, pools) {
  wb = wb || {};
  var map = {};
  Object.keys(pools).forEach(function (k) { (pools[k] || []).forEach(function (w) { map[w.id] = w; }); });
  var out = [];
  Object.keys(wb.progress || {}).forEach(function (id) {
    var st = wb.progress[id].status;
    if (st === "unknown" || st === "vague") {
      var w = map[id];
      if (w) out.push({ id: w.id, word: w.word, phonetic: w.phonetic, pos: w.pos, meaning: w.meaning, example: w.example, exampleCn: w.exampleCn, status: st, reps: wb.progress[id].reps || 0 });
    }
  });
  out.sort(function (a, b) {
    var pa = a.status === "unknown" ? 0 : 1, pb = b.status === "unknown" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (a.reps || 0) - (b.reps || 0);
  });
  return out;
}
function lgWordbankStatsFromWb(wb, pools) {
  wb = wb || {};
  var total = 0; Object.keys(pools).forEach(function (k) { total += (pools[k] || []).length; });
  var s = { total: total, unknown: 0, vague: 0, known: 0, studied: 0 };
  Object.keys(wb.progress || {}).forEach(function (id) {
    var st = wb.progress[id].status;
    s.studied++;
    if (st === "unknown") s.unknown++;
    else if (st === "vague") s.vague++;
    else if (st === "known") s.known++;
  });
  return s;
}

var lgReadingShowTrans = false;   // 精读译文显示开关
var lgWordReview = null;          // 单词库复习会话
var lgWbSearch = "";              // 单词库浏览搜索

/* 内置听力素材（每语种 3 组 × 4 句） */
var LG_LISTEN_BUILTIN = {
  en: [
    { title: "👋 打招呼问候", sents: [["Hello! How are you?", "你好！你好吗？"], ["I'm good, thank you. And you?", "我很好，谢谢。你呢？"], ["Pretty good. Nice to see you.", "还不错。很高兴见到你。"], ["Nice to see you too.", "我也很高兴见到你。"]] },
    { title: "☕ 咖啡店点单", sents: [["What can I get for you?", "请问要喝点什么？"], ["A latte, please.", "一杯拿铁。"], ["Large or small?", "大杯还是小杯？"], ["Large, please.", "大杯，谢谢。"]] },
    { title: "🗺 问路", sents: [["Excuse me, where is the station?", "请问车站在哪里？"], ["Go straight and turn right.", "直走然后右转。"], ["Is it far from here?", "离这里远吗？"], ["About five minutes on foot.", "步行大约五分钟。"]] },
    { title: "🎙 BBC 6 Minute English · Coffee culture", sents: [["I can't start my day without coffee.", "没有咖啡我一天都过不了。"], ["How do you take your coffee?", "你的咖啡怎么喝？"], ["I prefer a flat white, no sugar.", "我喜欢馥芮白，不加糖。"], ["Specialty coffee is becoming a trend.", "精品咖啡正在成为一种潮流。"]] },
    { title: "🎙 BBC 6 Minute English · Work-life balance", sents: [["How do you balance work and life?", "你如何平衡工作与生活？"], ["I try to leave work on time.", "我尽量按时下班。"], ["It's all about setting boundaries.", "关键在于设定边界。"], ["Remote work gives me more flexibility.", "远程工作给我更多灵活性。"]] },
    { title: "📘 新概念 1 · L1 Excuse me!", sents: [["Excuse me!", "对不起！"], ["Yes?", "什么事？"], ["Is this your handbag?", "这是您的手提包吗？"], ["Pardon?", "您说什么？"]] },
    { title: "📘 新概念 1 · L2 Is this your...?", sents: [["Is this your umbrella?", "这是您的雨伞吗？"], ["Is this your pen?", "这是您的钢笔吗？"], ["Is this your coat?", "这是您的大衣吗？"], ["Yes, it is. Thank you very much.", "是的，谢谢您。"]] },
    { title: "📘 新概念 2 · L1 A private conversation", sents: [["Last week I went to the theatre.", "上星期我去了剧院。"], ["I had a very good seat.", "我的座位很好。"], ["The play was very interesting.", "话剧很有意思。"], ["I did not enjoy it.", "我并不喜欢。"]] }
  ],
  ja: [
    { title: "👋 あいさつ", sents: [["おはようございます。", "早上好。"], ["今日はいい天気ですね。", "今天天气真好呢。"], ["そうですね。", "是啊。"], ["また明日。", "明天见。"]] },
    { title: "☕ カフェで注文", sents: [["ご注文はどうしますか。", "请问要点什么？"], ["ラテをお願いします。", "请给我一杯拿铁。"], ["サイズはどうしますか。", "要什么杯型？"], ["大きいのでお願いします。", "大杯，谢谢。"]] },
    { title: "🗺 道を聞く", sents: [["すみません、駅はどこですか。", "请问车站在哪里？"], ["まっすぐ行って右に曲がってください。", "直走然后右转。"], ["遠いですか。", "远吗？"], ["歩いて五分ぐらいです。", "步行约五分钟。"]] }
  ],
  ko: [
    { title: "👋 인사", sents: [["안녕하세요.", "你好。"], ["오늘 날씨 좋네요.", "今天天气真好。"], ["맞아요.", "是啊。"], ["내일 봐요.", "明天见。"]] },
    { title: "☕ 카페에서 주문", sents: [["뭐 드릴까요?", "请问要点什么？"], ["라테 주세요.", "请给我一杯拿铁。"], ["크기는 어떻게 할까요?", "要什么杯型？"], ["크게 주세요.", "大杯，谢谢。"]] },
    { title: "🗺 길 묻기", sents: [["실례합니다, 역이 어디예요?", "请问车站在哪里？"], ["똑바로 가다가 오른쪽으로 돌아가세요.", "直走然后右转。"], ["여기서 멀어요?", "离这里远吗？"], ["걸어서 오 분쯤이에요.", "步行约五分钟。"]] }
  ]
};

/* 易混词对比（每语种内置） */
var LG_CONFUSE = {
  en: [["affect", "effect", "affect 常作动词「影响」；effect 常作名词「效果」"], ["advice", "advise", "advice 名词「建议」；advise 动词「建议」"], ["accept", "except", "accept 接受；except 除…之外"], ["lose", "loose", "lose 丢失(动词)；loose 松的(形容词)"], ["borrow", "lend", "borrow 借入；lend 借出"]],
  ja: [["会う", "合う", "会う=与人相见；合う=相符/合得来"], ["聞く", "効く", "聞く=听；効く=有效/起作用"], ["書く", "描く", "書く=写；描く=描绘"], ["暑い", "熱い", "暑い=天气热；熱い=物体烫"], ["見る", "観る", "見る=看；観る=观赏(电影/演出)"]],
  ko: [["매다", "메다", "매다=系(鞋带)；메다=背(包)"], ["받다", "밭다", "받다=接受；밭다=垫/托"], ["싸다", "값싸다", "싸다=便宜/包；값싸다=廉价"], ["걷다", "걸다", "걷다=走；걸다=挂"], ["울다", "웃다", "울다=哭；웃다=笑"]]
};

/* ---------- 模块状态 ---------- */
var lgTab = "home";
var lgReview = null;            // 复习会话 {queue, idx, total, known, fuzzy}
var lgPomo = { running: false, remain: 25 * 60, timer: null, startTs: null };
var lgListening = null;         // 听力播放会话
var lgRec = null;               // 口语跟读会话
var lgStatsDays = 7;            // 复盘天数
var lgWordSearch = "";
var lgWordTag = "";
var lgNoteSearch = "";

/* ---------- 工具 ---------- */
function lgEscapeJs(str) { return String(str == null ? "" : str).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;"); }

/* 本地时区安全的日期加减（app.js addDays 用 toISOString(UTC) 在 UTC+8 会少算一天，勿用） */
function lgAddDays(dateStr, n) {
  var d = new Date(String(dateStr).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

function lgPickVoice(code) {
  if (!window.speechSynthesis) return null;
  var vs = window.speechSynthesis.getVoices();
  var want = { en: "en", ja: "ja", ko: "ko" }[code] || "en";
  for (var i = 0; i < vs.length; i++) if (vs[i].lang && vs[i].lang.toLowerCase().indexOf(want) === 0) return vs[i];
  return null;
}
function lgSpeak(text, code, rate) {
  if (!window.speechSynthesis) { showToast("当前环境不支持语音", "error"); return; }
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(String(text));
  var v = lgPickVoice(code); if (v) u.voice = v;
  u.lang = (LG_META[code] || LG_META.en).tts;
  u.rate = rate || 0.9;
  window.speechSynthesis.speak(u);
}
function lgShuffle(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function lgUid() { return "lg" + Date.now().toString(36) + Math.floor(Math.random() * 999); }

/* ---------- 数据存取（三语种隔离） ---------- */
function lgGetAll() {
  if (!DB.data.growth.language) DB.data.growth.language = {};
  return DB.data.growth.language;
}
// 旧数据字段补齐：v5.8.73 之前 / 异常数据缺字段会导致渲染崩溃，这里统一补默认值
function lgNormalizeLang(e) {
  if (!e) return e;
  var def = {
    words: [], notes: [], materials: [], listening: [], wrongList: [], favorites: [],
    packLoaded: {}, bank: [],
    plan: { template: "commute", daily: 5, days: {} },
    stats: { studyLog: {}, totalSeconds: 0, learnedCount: 0, wrongTypes: {}, reviewCount: 0 },
    streak: 0, lastStudyDate: null, level: 0,
    settings: { rate: 0.9, newPerDay: 5, remindTime: "20:00", fontSize: 15 },
    readingPlan: {}, listenPlan: {}, spokenPlan: {},
    wordbank: lgWordbankDefault(),
    videoCourses: [], videoProgress: {}, videoNotes: {},
    videoSeeded: false,
    activity: {}
  };
  ["words", "notes", "materials", "listening", "wrongList", "favorites", "packLoaded", "bank", "plan", "stats", "settings", "readingPlan", "listenPlan", "spokenPlan", "wordbank", "videoCourses", "videoProgress", "videoNotes", "videoSeeded", "activity"].forEach(function (k) {
    if (!e[k]) e[k] = def[k];
  });
  if (!e.stats.studyLog) e.stats.studyLog = {};
  if (!e.stats.wrongTypes) e.stats.wrongTypes = {};
  if (!e.plan.days) e.plan.days = {};
  return e;
}
function langGet(code) {
  var g = lgGetAll();
  if (!g.langs) g.langs = {};
  if (!g.langs[code]) {
    g.langs[code] = {
      words: [], notes: [], materials: [], listening: [], wrongList: [], favorites: [],
      packLoaded: {},       // 已导入的词包
      bank: [],             // 场景词包展开后的词
      plan: { template: "commute", daily: 5, days: {} },   // days: { date: [{t, done}] }
      stats: { studyLog: {}, totalSeconds: 0, learnedCount: 0, wrongTypes: {}, reviewCount: 0 },
      streak: 0, lastStudyDate: null, level: 0,
      settings: { rate: 0.9, newPerDay: 5, remindTime: "20:00", fontSize: 15 },
      readingPlan: {}, listenPlan: {}, spokenPlan: {},
      wordbank: lgWordbankDefault()
    };
  }
  return lgNormalizeLang(g.langs[code]);
}
function langCur() { var g = lgGetAll(); return (g.curLang && LG_LANGS.indexOf(g.curLang) !== -1) ? g.curLang : "en"; }
function setLang(code) { var g = lgGetAll(); g.curLang = code; DB.save(); render(); }
function lgSetTab(k) { lgTab = k; render(); }

/* 首次迁移：旧 growth.english → language.langs.en */
function lgMigrate() {
  var g = lgGetAll();
  var old = DB.data.growth.english;
  if (!g.migrated && old) {
    try {
      var en = langGet("en");
      if (old.masteredWords && old.masteredWords.length) {
        old.masteredWords.forEach(function (w) {
          en.words.push({ id: lgUid(), term: w, reading: "", meaning: "（旧数据）", extra: "", example: "", tags: [], level: 2, box: LG_EB.length - 1, next: lgAddDays(today(), 30), last: today(), reps: 1, lapses: 0, from: "migrated" });
        });
      }
      (old.deck || []).forEach(function (c) {
        if (c && c.en) en.words.push({ id: lgUid(), term: c.en, reading: c.phonetic || "", meaning: c.cn || "", extra: "", example: c.example || "", tags: [], level: c.box >= 3 ? 2 : 1, box: c.box || 0, next: c.next || today(), last: c.last || "", reps: c.reps || 0, lapses: c.lapses || 0, from: "migrated" });
      });
      if (old.streak) en.streak = old.streak;
      if (old.lastStudyDate) en.lastStudyDate = old.lastStudyDate;
      if (old.studyLog) { Object.keys(old.studyLog).forEach(function (d) { en.stats.studyLog[d] = { seconds: (old.studyLog[d].duration || 0) * 60, completed: !!old.studyLog[d].completed }; }); }
      g.migrated = true;
      DB.save();
    } catch (e) { console.warn("[Lang] migrate failed", e); }
  }
}
function lgEnsureAll() {
  LG_LANGS.forEach(function (c) { langGet(c); });
  lgMigrate();
  return lgGetAll();
}

/* 统计 */
function lgDueCount(code) { return langGet(code).words.filter(function (w) { return w.next <= today(); }).length; }
function lgAllDue() { var n = 0; LG_LANGS.forEach(function (c) { n += lgDueCount(c); }); return n; }
function lgTodaySeconds(code) { var s = langGet(code).stats.studyLog[today()]; return s ? (s.seconds || 0) : 0; }
function lgLevelDist(code) {
  var d = [0, 0, 0]; // 不会/模糊/熟悉
  langGet(code).words.forEach(function (w) { d[Math.min(2, Math.max(0, w.level || 0))]++; });
  return d;
}
function lgAddStudy(code, sec) {
  var e = langGet(code);
  if (!e.stats.studyLog[today()]) e.stats.studyLog[today()] = { seconds: 0 };
  e.stats.studyLog[today()].seconds += sec;
  e.stats.totalSeconds = (e.stats.totalSeconds || 0) + sec;
  if (!e.lastStudyDate || e.lastStudyDate !== today()) {
    if (e.lastStudyDate === lgAddDays(today(), -1)) e.streak = (e.streak || 0) + 1; else e.streak = 1;
    e.lastStudyDate = today();
  }
  DB.save();
}
function lgWrong(code, type, term) {
  var e = langGet(code);
  if (!e.stats.wrongTypes[type]) e.stats.wrongTypes[type] = 0;
  e.stats.wrongTypes[type]++;
  e.wrongList.push({ id: lgUid(), type: type, term: term || "", date: today() });
  DB.save();
  showToast("已加入「" + type + "」错题集", "warning");
}

/* ---------- 兼容旧接口（app.js 仍调用） ---------- */
function engGet() {
  var en = langGet("en");
  var ret = { streak: en.streak || 0, studyLog: en.stats.studyLog, masteredWords: en.words.filter(function (w) { return w.level === 2; }).map(function (w) { return w.term; }), newWords: en.words.map(function (w) { return w.term; }), deck: en.words, reviewDoneToday: 0, statReviewed: en.stats.reviewCount || 0 };
  var log = en.stats.studyLog[today()];
  ret.reviewDoneToday = log && log.completed ? 1 : 0;
  return ret;
}
function engVocabDue() { return lgDueCount("en"); }
function renderEnglish() { renderLanguage(); }

/* =============================================================
 * 主渲染框架：语种条 + 八大模块 tab + 内容
 * ============================================================= */
function renderLanguage() {
  var c = document.getElementById("app-content");
  if (!c) return;
  lgEnsureAll();
  var cur = langCur();
  var langBar = '<div class="lg-langbar">' + LG_LANGS.map(function (code) {
    var m = LG_META[code];
    return '<div class="lg-lang' + (code === cur ? " active" : "") + '" onclick="setLang(\'' + code + '\')">' +
      '<span class="lg-lang-flag">' + m.flag + '</span><span class="lg-lang-name">' + m.name + '</span>' +
      (lgWordbankUnknownCount(code) > 0 ? '<span class="lg-lang-due">' + lgWordbankUnknownCount(code) + '</span>' : '') +
      '</div>';
  }).join("") + '</div>';
  // tab 栏：英语在「单词库」前插入「🔤 音标」板块
  var lgTabs = LG_TABS.slice();
  if (cur === "en" && !lgTabs.some(function (x) { return x.k === "phonics"; })) {
    var ins = 0;
    for (var ti = 0; ti < lgTabs.length; ti++) { if (lgTabs[ti].k === "words") { ins = ti; break; } }
    lgTabs.splice(ins, 0, { k: "phonics", t: "🔤 音标" });
  }
  var tabBar = '<div class="lg-tabs">' + lgTabs.map(function (t) {
    return '<div class="lg-tab' + (lgTab === t.k ? " active" : "") + '" onclick="lgSetTab(\'' + t.k + '\')">' + t.t + '</div>';
  }).join("") + '</div>';
  var body = "";
  switch (lgTab) {
    case "phonics": body = lgRenderPhonics(cur); break;
    case "words": body = lgRenderWords(cur); break;
    case "video": body = lgRenderVideo(cur); break;
    case "test": body = lgRenderTest(cur); break;
    case "reading": body = lgRenderReading(cur); break;
    case "listening": body = lgRenderListening(cur); break;
    case "speaking": body = lgRenderSpeaking(cur); break;
    case "notes": body = lgRenderNotes(cur); break;
    case "plan": body = lgRenderPlan(cur); break;
    case "stats": body = lgRenderStats(cur); break;
    default: body = lgRenderHome(cur);
  }
  c.innerHTML = langBar + tabBar + body;
  if (lgTab === "home") lgRenderHomeCharts(cur);
  if (lgTab === "stats") lgRenderStatsCharts(cur);
}

/* =============================================================
 * 模块一：首页工作台
 * ============================================================= */
function lgRenderHome(cur) {
  var m = LG_META[cur];
  var e = langGet(cur);
  var due = lgDueCount(cur);
  var dist = lgLevelDist(cur);
  var total = dist[0] + dist[1] + dist[2];
  var mastery = total > 0 ? Math.round(dist[2] / total * 100) : 0;
  var todaySec = lgTodaySeconds(cur);
  var studyDays = Object.keys(e.stats.studyLog).length;
  var mm = Math.floor(todaySec / 60), ss = todaySec % 60;

  // 薄弱推送
  var weakHtml = "";
  var wts = Object.keys(e.stats.wrongTypes || {});
  if (wts.length) {
    wts.sort(function (a, b) { return e.stats.wrongTypes[b] - e.stats.wrongTypes[a]; });
    var top = wts[0], tip = top === "听力" ? "去「听力」多听几遍句子，用分句循环模式" : top === "口语" ? "去「口语」做影子跟读，先听原声再模仿" : "去「单词库」复习重点单词";
    weakHtml = '<div class="lg-card"><div class="lg-card-h">🧠 薄弱知识点推送</div>' +
      '<div class="lg-weak">最近「<b>' + top + '</b>」错得较多（' + e.stats.wrongTypes[top] + ' 次），建议' + tip + '。</div></div>';
  }

  var pomoMin = Math.floor(lgPomo.remain / 60), pomoSec = lgPomo.remain % 60;
  var pomoBtn = lgPomo.running
    ? '<button class="lg-btn" onclick="lgPomoPause()">⏸ 暂停</button>'
    : (lgPomo.remain < 25 * 60 ? '<button class="lg-btn" onclick="lgPomoResume()">▶ 继续</button><button class="lg-btn ghost" onclick="lgPomoReset()">↺ 重置</button>' : '<button class="lg-btn" onclick="lgPomoStart()">▶ 开始专注</button>');

  return '<div class="lg-overview">' +
    // 今日总览
    '<div class="lg-card"><div class="lg-card-h">📌 ' + m.flag + ' ' + m.name + ' · 今日总览</div>' +
      '<div class="lg-stat-row">' +
        '<div class="lg-stat"><div class="lg-stat-v">' + mm + ':' + ("0" + ss).slice(-2) + '</div><div class="lg-stat-l">今日学习</div></div>' +
        '<div class="lg-stat"><div class="lg-stat-v">' + lgWordbankUnknownCount(cur) + '</div><div class="lg-stat-l">重点复习(不会)</div></div>' +
        '<div class="lg-stat"><div class="lg-stat-v">' + mastery + '%</div><div class="lg-stat-l">掌握率</div></div>' +
        '<div class="lg-stat"><div class="lg-stat-v">' + studyDays + '</div><div class="lg-stat-l">学习天数</div></div>' +
      '</div></div>' +
    // 番茄专注
    '<div class="lg-card"><div class="lg-card-h">🍅 番茄专注计时器 <span class="lg-sub">碎片时间 · 无强制打卡</span></div>' +
      '<div class="lg-pomo-time">' + ("0" + pomoMin).slice(-2) + ':' + ("0" + pomoSec).slice(-2) + '</div>' +
      '<div class="lg-btn-row">' + pomoBtn + '</div>' +
      '<div class="lg-hint">专注满 25 分钟自动计入今日学习时长，可随时暂停顺延。</div></div>' +
    weakHtml +
    // 快捷入口
    '<div class="lg-card"><div class="lg-card-h">⚡ 快捷入口</div>' +
      '<div class="lg-quick-grid">' +
        '<div class="lg-quick" onclick="lgSetTab(\'words\')">📚 单词库</div>' +
        '<div class="lg-quick" onclick="lgSetTab(\'listening\')">🎧 听力磨耳朵</div>' +
        '<div class="lg-quick" onclick="lgSetTab(\'speaking\')">🗣 开口练两句</div>' +
        '<div class="lg-quick" onclick="lgSetTab(\'reading\')">📰 精读一篇</div>' +
      '</div></div>' +
    // 语言学习设置
    '<div class="lg-card"><div class="lg-card-h">⚙️ 语言学习设置</div>' +
      '<div class="lg-set-row"><span>发音语速</span><span>' +
        [0.75, 0.9, 1, 1.25].map(function (r) { return '<button class="lg-mini' + (e.settings.rate === r ? " on" : "") + '" onclick="lgSetRate(' + r + ')">' + r + 'x</button>'; }).join("") +
      '</span></div>' +
      '<div class="lg-set-row"><span>单词库每日词数</span><span>' +
        [10, 20, 30, 50].map(function (n) { return '<button class="lg-mini' + (e.wordbank.dailyCount === n ? " on" : "") + '" onclick="lgSetDailyCount(' + n + ')">' + n + '</button>'; }).join("") +
      '</span></div>' +
      '<div class="lg-set-row"><span>参与推送的词库</span><span>' +
        [["ielts", "雅思"], ["trade", "外贸"]].map(function (l) { return '<button class="lg-mini' + (e.wordbank.enabled[l[0]] !== false ? " on" : "") + '" onclick="lgToggleWordLib(\'' + l[0] + '\')">' + l[1] + '</button>'; }).join("") +
      '</span></div>' +
      '<div class="lg-set-row"><span>提醒时段</span><span><input type="time" class="lg-time" value="' + (e.settings.remindTime || "20:00") + '" onchange="lgSetRemind(this.value)"></span></div>' +
      '<div class="lg-set-row"><span>界面字号</span><span>' +
        [14, 15, 16, 17].map(function (f) { return '<button class="lg-mini' + (e.settings.fontSize === f ? " on" : "") + '" onclick="lgSetFont(' + f + ')">' + f + '</button>'; }).join("") +
      '</span></div>' +
    '</div>' +
  '</div>';
}
function lgRenderHomeCharts() { /* 占位 */ }

/* 番茄钟 */
function lgPomoTick() {
  if (!lgPomo.running) return;
  lgPomo.remain--;
  if (lgPomo.remain <= 0) {
    lgPomo.running = false;
    if (lgPomo.timer) { clearInterval(lgPomo.timer); lgPomo.timer = null; }
    lgAddStudy(langCur(), 25 * 60);
    showToast("🍅 专注完成 25 分钟，已计入学习时长！", "success");
    render();
    return;
  }
  var el = document.querySelector(".lg-pomo-time");
  if (el) el.textContent = ("0" + Math.floor(lgPomo.remain / 60)).slice(-2) + ":" + ("0" + (lgPomo.remain % 60)).slice(-2);
}
function lgPomoStart() { lgPomo.running = true; lgPomo.remain = 25 * 60; lgPomo.startTs = Date.now(); if (!lgPomo.timer) lgPomo.timer = setInterval(lgPomoTick, 1000); render(); }
function lgPomoPause() {
  lgPomo.running = false;
  if (lgPomo.startTs) { lgAddStudy(langCur(), Math.round((Date.now() - lgPomo.startTs) / 1000)); lgPomo.startTs = null; }
  render();
}
function lgPomoResume() { lgPomo.running = true; lgPomo.startTs = Date.now(); if (!lgPomo.timer) lgPomo.timer = setInterval(lgPomoTick, 1000); render(); }
function lgPomoReset() { lgPomo.running = false; lgPomo.remain = 25 * 60; lgPomo.startTs = null; if (lgPomo.timer) { clearInterval(lgPomo.timer); lgPomo.timer = null; } render(); }

/* 设置 */
function lgSetRate(r) { var e = langGet(langCur()); e.settings.rate = r; DB.save(); render(); }
function lgSetNewPerDay(n) { var e = langGet(langCur()); e.settings.newPerDay = n; DB.save(); render(); }
function lgSetRemind(v) { var e = langGet(langCur()); e.settings.remindTime = v; DB.save(); showToast("提醒时段已保存 " + v, "success"); }
function lgSetFont(f) { var e = langGet(langCur()); e.settings.fontSize = f; DB.save(); render(); }
function lgFontSize() { var e = langGet(langCur()); return (e.settings && e.settings.fontSize) || 15; }

/* =============================================================
 * 音标板块（英语）：data/phonetics.json（英美对照 + 发音方式 + 元辅分类 + 例词 + 字母组合）
 * ============================================================= */
var __lgPhonetics = null;
function lgPhoneticsLoad(cb) {
  if (__lgPhonetics) { cb && cb(); return; }
  var t = (typeof today === "function") ? today() : new Date().toISOString().slice(0, 10);
  var ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "";
  fetch("data/phonetics.json?v=" + ver + "&d=" + t).then(function (r) { return r.json(); }).then(function (j) {
    __lgPhonetics = j; cb && cb();
  }).catch(function () { cb && cb(); });
}
function applyPhonVoice(u, vs, code) {
  if (!vs || !vs.length) return;
  // 优先精确匹配语种（en-US / en-GB），否则退回任意英文嗓音，避免中文设备用中文嗓音读英文导致发音错误
  var best = null;
  for (var i = 0; i < vs.length; i++) { if (vs[i].lang && vs[i].lang.toLowerCase() === code.toLowerCase()) { best = vs[i]; break; } }
  if (!best) { for (var j = 0; j < vs.length; j++) { if (vs[j].lang && vs[j].lang.toLowerCase().indexOf("en") === 0) { best = vs[j]; break; } } }
  if (best) u.voice = best;
}
function lgPhonSpeak(word, region) {
  if (!window.speechSynthesis) { showToast("当前环境不支持语音", "error"); return; }
  window.speechSynthesis.cancel();
  var code = region === "UK" ? "en-GB" : "en-US";
  var u = new SpeechSynthesisUtterance(String(word));
  u.lang = code;
  // 音素/单词朗读都希望字字清晰：单词稍慢（0.8），音节提示词（"ee"/"puh"）更慢（0.6）以保留元音时长
  u.rate = (String(word).length <= 3) ? 0.6 : 0.8;
  var vs = []; try { vs = window.speechSynthesis.getVoices() || []; } catch (e) {}
  // 中文设备首次点击时常因语音列表尚未就绪（getVoices 为空）而被迫用默认（中文）嗓音，导致发音错误；
  // 此时等待 onvoiceschanged 就绪后再播，确保选中英文嗓音。
  if (!vs.length) {
    var fired = false;
    var retry = function () {
      if (fired) return;
      var v2 = []; try { v2 = window.speechSynthesis.getVoices() || []; } catch (e2) {}
      if (!v2.length) return;
      fired = true;
      window.speechSynthesis.cancel();
      applyPhonVoice(u, v2, code);
      window.speechSynthesis.speak(u);
    };
    try { window.speechSynthesis.onvoiceschanged = retry; } catch (e3) {}
    setTimeout(retry, 350);
    return;
  }
  applyPhonVoice(u, vs, code);
  window.speechSynthesis.speak(u);
}
// 预热 TTS 语音列表：中文设备首次点击常因 voices 尚未加载而被迫用默认（中文）嗓音，导致发音错误
(function () {
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); };
    }
  } catch (e) {}
})();
function lgPhonExamplesHtml(exs, region) {
  return (exs || []).map(function (x) {
    return '<span class="lg-phon-ex">' + escapeHtml(x[0]) +
      '<button class="lg-phon-sound" onclick="lgPhonSpeak(\'' + lgEscapeJs(x[0]) + '\',\'' + region + '\')">🔊</button>' +
      '<span class="lg-phon-cn">' + escapeHtml(x[1]) + '</span></span>';
  }).join("");
}
function lgPhonCombosHtml(combos, region) {
  if (!combos || !combos.length) return "";
  return combos.map(function (c) {
    return '<span class="lg-phon-combo"><b>' + escapeHtml(c.letters) + '</b> → ' +
      (c.words || []).map(function (w) {
        return '<span class="lg-phon-ex">' + escapeHtml(w[0]) +
          '<button class="lg-phon-sound" onclick="lgPhonSpeak(\'' + lgEscapeJs(w[0]) + '\',\'' + region + '\')">🔊</button>' +
          '<span class="lg-phon-cn">' + escapeHtml(w[1]) + '</span></span>';
      }).join("") + '</span>';
  }).join("");
}
function lgPhonCard(p, region) {
  return '<div class="lg-card lg-phon-card">' +
    '<div class="lg-phon-head">' +
      '<span class="lg-phon-sym">' + escapeHtml(p.symbol) + '</span>' +
      '<span class="lg-phon-tag">' + escapeHtml(p.type || "") + '</span>' +
    '</div>' +
    '<div class="lg-phon-usuk">' +
      (p.us !== p.uk ? '美式 <b>' + escapeHtml(p.us) + '</b> · 英式 <b>' + escapeHtml(p.uk) + '</b>' : '美/英 <b>' + escapeHtml(p.us) + '</b>') +
    '</div>' +
    '<div class="lg-phon-how">🗣 ' + escapeHtml(p.how || "") + '</div>' +
    '<div class="lg-phon-sec">例词（' + region + '）</div><div class="lg-phon-exs">' + lgPhonExamplesHtml(p.examples, region) + '</div>' +
    (p.combos && p.combos.length ? '<div class="lg-phon-sec">常见字母组合</div><div class="lg-phon-combos">' + lgPhonCombosHtml(p.combos, region) + '</div>' : '') +
  '</div>';
}
function lgPhonAll() {
  var d = __lgPhonetics || { vowels: [], consonants: [] };
  return d.vowels.concat(d.consonants);
}
function lgPhonFind(sym) {
  var all = lgPhonAll();
  for (var i = 0; i < all.length; i++) if (all[i].symbol === sym) return { p: all[i], idx: i };
  return null;
}
function lgPhonSummaryCell(p, region) {
  // 汇总页的 🔊 应朗读"音标本身"而非"含此音标的例词"（之前传 examples[0][0] 会让 /iː/ 朗读 "see"、/e/ 朗读 "bed" 等，
  // 用户听到的是带辅音污染的单词，并非该音素的近似发音）。改用 phonetics.json 里新增的 speakText：
  //   - 元音：用 "ee"/"ih"/"eh"/"oo" 等骨架音节，TTS 会发出对应长/短元音
  //   - 辅音：用 "puh"/"buh"/"th"/"sh" 等短骨架，TTS 接近目标辅音
  //   - 兜底：去掉斜杠的 symbol（让 TTS 朗读字面 IPA 字符）
  var speak = p.speakText || p.symbol.replace(/\//g, "");
  return '<div class="lg-phon-cell" onclick="lgPhonSel=\'' + lgEscapeJs(p.symbol) + '\';render()">' +
    '<div class="lg-phon-cell-sym">' + escapeHtml(p.symbol) + '</div>' +
    '<div class="lg-phon-cell-type">' + escapeHtml(p.type || "") + '</div>' +
    '<div class="lg-phon-cell-audio" onclick="event.stopPropagation();lgPhonSpeak(\'' + lgEscapeJs(speak) + '\',\'' + region + '\')" title="点击听音标发音">🔊</div>' +
  '</div>';
}
function lgRenderPhonics(cur) {
  if (cur !== "en") {
    return '<div class="lg-card"><div class="lg-card-h">🔤 音标</div>' +
      '<div class="empty-state"><div class="empty-text">音标板块当前提供英语（English），请切换语种到 🇬🇧 英语查看。</div></div></div>';
  }
  if (!__lgPhonetics) {
    lgPhoneticsLoad(function () { render(); });
    return '<div class="lg-card"><div class="empty-state"><div class="empty-text">加载音标数据中…</div></div></div>';
  }
  // 学习路径分发：path(主页) / letters(字母) / letter:CH / pairs / pair:ID / cons(辅音) / spell(拼读) / lib(图书馆 原视图)
  var v = lgPhonView || "path";
  if (v === "letters") return lgPhonLettersPage();
  if (v.indexOf("letter:") === 0) return lgPhonLetterDetail(v.slice(7));
  if (v === "pairs") return lgPhonPairsPage();
  if (v.indexOf("pair:") === 0) return lgPhonPairTrain(v.slice(5));
  if (v === "cons") return lgPhonConsPage();
  if (v === "spell") return lgPhonSpellPage();
  if (v.indexOf("spell:") === 0) return lgPhonSpellDetail(v.slice(6));
  if (v === "lib") return lgRenderPhonLib(cur);
  return lgPhonPathPage();
}
// —— 原「图书馆」视图（Phase 2/3 的音素总览与详情，从路径主页进入）——
function lgRenderPhonLib(cur) {
  var region = lgPhonRegion || "US";
  var backBtn = '<div class="lg-row" style="gap:8px;margin-bottom:6px"><button class="lg-btn ghost" onclick="lgPhonView=null;lgPhonSel=null;render()">← 🗺 学习路径</button></div>';
  var head = backBtn + '<div class="lg-card"><div class="lg-card-h">📚 音素图书馆 <span class="lg-sub">44 个音标 · 点击查看详情</span></div>' +
    '<div class="lg-phon-toolbar">' +
      '<button class="lg-btn' + (lgPhonRegion === "US" ? " primary" : "") + '" onclick="lgPhonRegion=\'US\';render()">🇺🇸 美式发音</button>' +
      '<button class="lg-btn' + (lgPhonRegion === "UK" ? " primary" : "") + '" onclick="lgPhonRegion=\'UK\';render()">🇬🇧 英式发音</button>' +
    '</div>' +
    '<div class="lg-hint">共 ' + __lgPhonetics.vowels.length + ' 个元音 + ' + __lgPhonetics.consonants.length + ' 个辅音。点击任意音标进入详情：发音方式（中英对照）、英美写法、≥5 个例词、常见字母组合，均可点 🔊 听读音。</div>' +
  '</div>';
  // 详情页：选中某个音标
  if (lgPhonSel) {
    var f = lgPhonFind(lgPhonSel);
    if (f) {
      var all = lgPhonAll();
      var prev = all[(f.idx - 1 + all.length) % all.length];
      var next = all[(f.idx + 1) % all.length];
      var nav = '<div class="lg-row" style="gap:8px;margin-bottom:10px">' +
        '<button class="lg-btn ghost" onclick="lgPhonSel=null;render()">← 返回总览</button>' +
        '<button class="lg-btn ghost" onclick="lgPhonSel=\'' + lgEscapeJs(prev.symbol) + '\';render()">‹ 上一个</button>' +
        '<button class="lg-btn ghost" onclick="lgPhonSel=\'' + lgEscapeJs(next.symbol) + '\';render()">下一个 ›</button>' +
      '</div>';
      return head + nav + lgPhonCard(f.p, region);
    }
    lgPhonSel = null;
  }
  // 汇总页：元音 / 辅音 网格，点击进入详情
  var vGrid = '<div class="lg-card"><div class="lg-card-h">🔠 元音汇总（Vowels）<span class="lg-sub">' + __lgPhonetics.vowels.length + ' 个 · 点击查看详情</span></div>' +
    '<div class="lg-phon-grid">' + __lgPhonetics.vowels.map(function (p) { return lgPhonSummaryCell(p, region); }).join("") + '</div></div>';
  var cGrid = '<div class="lg-card"><div class="lg-card-h">🔤 辅音汇总（Consonants）<span class="lg-sub">' + __lgPhonetics.consonants.length + ' 个 · 点击查看详情</span></div>' +
    '<div class="lg-phon-grid">' + __lgPhonetics.consonants.map(function (p) { return lgPhonSummaryCell(p, region); }).join("") + '</div></div>';
  return head + vGrid + cGrid;
}
var lgPhonRegion = "US";
var lgPhonSel = null; // 图书馆：当前查看的音标详情
// —— Sprint 语言升级 · Pronunciation 学习路径状态 ——
var lgPhonView = null;     // path/letters/letter:CH/pairs/pair:ID/cons/spell/spell:ID/lib
var lgPhonLetterIdx = 0;   // Phase1 字母学习游标
var lgLetters = null;      // data/letters.json
var lgPairs = null;        // data/phoneme_pairs.json
var lgSpell = null;        // data/spelling_patterns.json（Phase 4）
var __lgLettersDone = null; // localStorage: 已学字母 key（进度）
function lgLettersDone() {
  if (__lgLettersDone) return __lgLettersDone;
  try { __lgLettersDone = JSON.parse(localStorage.getItem("lgPhonLettersDone") || "[]"); } catch (e) { __lgLettersDone = []; }
  return __lgLettersDone;
}
function lgMarkLetterDone(ch) {
  var a = lgLettersDone();
  if (a.indexOf(ch) < 0) a.push(ch);
  try { localStorage.setItem("lgPhonLettersDone", JSON.stringify(a)); } catch (e) {}
  __lgLettersDone = a;
}
function lgLettersLoad(cb) {
  if (lgLetters) { cb && cb(); return; }
  var ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "";
  fetch("data/letters.json?v=" + ver).then(function (r) { return r.json(); }).then(function (j) {
    lgLetters = j; cb && cb();
  }).catch(function () { lgLetters = { letters: [] }; cb && cb(); });
}
function lgPairsLoad(cb) {
  if (lgPairs) { cb && cb(); return; }
  var ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "";
  fetch("data/phoneme_pairs.json?v=" + ver).then(function (r) { return r.json(); }).then(function (j) {
    lgPairs = j; cb && cb();
  }).catch(function () { lgPairs = { vowelPairs: [], consPairs: [] }; cb && cb(); });
}

/* ============================================================
 * 🗺 学习路径主页（5 Phase 进度）
 * ============================================================ */
function lgPhonPathPage() {
  if (!lgLetters) lgLettersLoad(function () { render(); });
  if (!lgPairs) lgPairsLoad(function () { render(); });
  if (!lgSpell) lgSpellLoad(function () { render(); });
  var done = lgLettersDone();
  var pct1 = lgLetters && lgLetters.letters && lgLetters.letters.length
    ? Math.round(done.length / lgLetters.letters.length * 100) : 0;
  var p1 = pct1 >= 100 ? '<div style="color:var(--accent-green)">100% ✓</div>' : pct1 + "%";
  var bar1 = '<div class="phon-progress"><div class="phon-progress-fill" style="width:' + pct1 + '%"></div></div>';
  // Phase 3 进度
  var cp = lgConsProgress();
  var p3 = cp.pct >= 100 ? '<div style="color:var(--accent-green)">100% ✓</div>' : cp.done + '/' + cp.total;
  var bar3 = '<div class="phon-progress"><div class="phon-progress-fill" style="width:' + cp.pct + '%"></div></div>';
  // Phase 4 进度
  var sp = lgSpellProgress();
  var p4 = sp.pct >= 100 ? '<div style="color:var(--accent-green)">100% ✓</div>' : sp.done + '/' + sp.total;
  var bar4 = '<div class="phon-progress"><div class="phon-progress-fill" style="width:' + sp.pct + '%"></div></div>';

  function phaseCard(n, title, desc, state, pctHtml, barHtml, onClick, locked) {
    return '<div class="phon-phase' + (locked ? " locked" : "") + '"' + (locked ? '' : ' onclick="' + onClick + '"') + '>' +
      '<div class="phon-phase-n">' + (locked ? "🔒" : "● " + n) + '</div>' +
      '<div class="phon-phase-body"><div class="phon-phase-t">' + title + '</div>' +
      '<div class="phon-phase-d">' + desc + '</div>' +
      (barHtml || '') +
      (state ? '<div class="phon-phase-state">' + state + '</div>' : '') +
      (pctHtml ? '<div class="phon-phase-pct">' + pctHtml + '</div>' : '') +
      (locked ? '' : '<div class="phon-phase-enter">继续学习 →</div>') +
      '</div></div>';
  }
  var pathCard = '<div class="lg-card"><div class="lg-card-h">🎯 Pronunciation <span class="lg-sub">英语发音学习路径</span></div>' +
    '<div class="lg-hint">' + (lgLetters && lgLetters.intro ? lgLetters.intro : "") + '</div>' +
    phaseCard(1, "字母与声音基础", "26 Letters · Letter Name ≠ Letter Sound", null, p1, bar1, "lgPhonView='letters';render()") +
    phaseCard(2, "元音系统 + 听辨训练", "单元音 / 双元音 · Minimal Pairs 辨音", null, "", "", "lgPhonView='pairs';render()") +
    phaseCard(3, "辅音系统", "清浊对比 · 发音机制分组 · 4 大组", null, p3, bar3, "lgPhonView='cons';render()") +
    phaseCard(4, "自然拼读", "13 Patterns · 逐词拆解拼读", null, p4, bar4, "lgPhonView='spell';render()") +
    phaseCard(5, "拼读实战", "4 种训练模式", null, "", "", "", true) +
    '</div>';

  // 今日建议（根据进度智能推荐下一步）
  var rec = "";
  if (pct1 < 100) {
    rec = '💡 下一步：' + (lgLetters && lgLetters.tip || "学习字母 A");
  } else if (cp.pct < 100) {
    rec = '💡 下一步：继续 Phase 3 辅音系统（' + cp.done + '/' + cp.total + ' 已练过）';
  } else if (sp.pct < 100) {
    rec = '💡 下一步：继续 Phase 4 自然拼读（已学 ' + sp.done + '/' + sp.total + ' 个 Pattern）';
  } else {
    rec = '💡 下一步：开始 Phase 2 听辨训练（' + (lgPairs && lgPairs.vowelPairs && lgPairs.vowelPairs[0] ? lgPairs.vowelPairs[0].a + " vs " + lgPairs.vowelPairs[0].b : "") + '）';
  }
  var recCard = '<div class="lg-card"><div class="lg-card-h">📋 今日任务</div>' +
    '<div class="phon-recs">' + rec + '</div></div>';

  var libCard = '<div class="lg-card"><div class="lg-card-h">📚 音素图书馆 <span class="lg-sub">完整 44 音标</span></div>' +
    '<div class="lg-row" style="gap:8px;flex-wrap:wrap">' +
      '<button class="lg-btn" onclick="lgPhonView=\'lib\';render()">🔠 元音 / 辅音总览</button>' +
      '<button class="lg-btn ghost" onclick="lgPhonRegion=lgPhonRegion===\'US\'?\'UK\':\'US\';render()">🌐 切到' + (lgPhonRegion === "US" ? "英式" : "美式") + '</button>' +
    '</div></div>';
  return pathCard + recCard + libCard;
}

/* ============================================================
 * Phase 1 · 字母与声音（26 Letters）
 * ============================================================ */
function lgPhonLettersPage() {
  var head = '<div class="lg-card"><div class="lg-card-h">🔤 Phase 1 · 字母与声音 <span class="lg-sub">26 Letters</span></div>' +
    '<div class="lg-hint">' + (lgLetters && lgLetters.tip || "") + '</div>' +
    '<div class="lg-row" style="gap:8px;margin:6px 0"><button class="lg-btn ghost" onclick="lgPhonView=null;render()">← 🗺 路径</button>' +
    '<button class="lg-btn" onclick="lgPhonView=\'letter:' + (lgLetters && lgLetters.letters && lgLetters.letters.length ? lgLetters.letters[0].ch : "A") + '\';render()">🚀 开始学习</button></div></div>';
  if (!lgLetters || !lgLetters.letters || !lgLetters.letters.length) return head + '<div class="lg-card"><div class="empty-state"><div class="empty-text">加载中…</div></div></div>';
  var done = lgLettersDone();
  var grid = '<div class="lg-card"><div class="lg-card-h">26 个字母 <span class="lg-sub">已学 ' + done.length + '/26</span></div>' +
    '<div class="phon-letter-grid">' + lgLetters.letters.map(function (l) {
      var isDone = done.indexOf(l.ch) >= 0;
      return '<div class="phon-letter-cell' + (isDone ? " done" : "") + '" onclick="lgPhonView=\'letter:' + l.ch + '\';render()">' +
        '<div class="phon-letter-ch">' + l.ch + '</div>' +
        '<div class="phon-letter-ipa">' + l.name + '</div>' +
        (isDone ? '<div class="phon-letter-ok">✓</div>' : '') +
        '</div>';
    }).join("") + '</div></div>';
  return head + grid;
}

// 字母详情卡（大字母 + 字母名 🔊 + 常见发音 + Letter Name≠Sound 提示）
function lgPhonLetterDetail(ch) {
  if (!lgLetters) { lgLettersLoad(function () { render(); }); return '<div class="lg-card"><div class="empty-state"><div class="empty-text">加载中…</div></div></div>'; }
  var ls = lgLetters.letters || [];
  var i = -1;
  for (var k = 0; k < ls.length; k++) { if (ls[k].ch === ch) { i = k; break; } }
  if (i < 0) { lgPhonView = "letters"; render(); return ""; }
  var l = ls[i];
  lgPhonLetterIdx = i;
  lgMarkLetterDone(ch);
  var region = lgPhonRegion || "US";
  var prev = ls[(i - 1 + ls.length) % ls.length].ch;
  var next = ls[(i + 1) % ls.length].ch;

  // Letter Name 卡
  var nameCard = '<div class="lg-card phon-letter-hero">' +
    '<div class="phon-hero-ch">' + l.ch + '</div>' +
    '<div class="phon-hero-name">字母名（Letter Name）</div>' +
    '<div class="phon-hero-ipa">' + l.name + ' <button class="phon-speak-btn" onclick="lgPhonSpeak(\'' + lgEscapeJs(l.ch) + '\',\'' + region + '\')">🔊</button></div>' +
    '<div class="phon-hero-note">念 <b>ABC 字母表</b> 时的读音</div></div>';
  // 常见发音卡
  var sndHtml = (l.sounds || []).map(function (s) {
    return '<div class="phon-snd-row">' +
      '<div class="phon-snd-ipa">' + s.ipa + ' <button class="phon-speak-btn" onclick="lgPhonSpeak(\'' + lgEscapeJs(s.ipa.replace(/\//g, "")) + '\',\'' + region + '\')">🔊</button></div>' +
      '<div class="phon-snd-word"><b>' + s.word + '</b> ' + s.zh + '</div>' +
      '<button class="phon-speak-btn sm" onclick="event.stopPropagation();lgPhonSpeak(\'' + lgEscapeJs(s.word) + '\',\'' + region + '\')">🔊 读词</button>' +
      '<div class="phon-snd-hint">' + s.hint + '</div>' +
      '</div>';
  }).join("");
  var sndCard = '<div class="lg-card"><div class="lg-card-h">常见字母音（Letter Sounds）</div>' +
    '<div class="lg-hint">字母在单词里真正发出的声音（可能与字母名完全不同）</div>' + sndHtml + '</div>';

  // Letter Name ≠ Letter Sound 提示（核心知识点）
  var tipCard = '<div class="lg-card phon-tip"><div class="lg-card-h">💡 关键认知</div>' +
    '<div class="phon-tip-main">Letter Name <b style="color:var(--accent-red)">≠</b> Letter Sound</div>' +
    '<div class="phon-tip-sub">字母 <b>' + l.ch + '</b> 的名字是 <b>' + l.name + '</b>，但在单词里常发别的音。' +
    '例：<b>' + l.ch + '</b> 在 <b>' + ((l.sounds && l.sounds[0]) ? l.sounds[0].word : "") + '</b> 里读 <b>' + ((l.sounds && l.sounds[0]) ? l.sounds[0].ipa : "") + '</b>，而不是 ' + l.name + '。</div></div>';

  var navBtn = '<div class="lg-row" style="gap:8px;margin-top:10px">' +
    '<button class="lg-btn ghost" onclick="lgPhonView=\'letters\';render()">🗺 26 字母</button>' +
    '<button class="lg-btn ghost" onclick="lgPhonView=\'letter:' + prev + '\';render()">‹ 上一个</button>' +
    '<button class="lg-btn primary" style="flex:1" onclick="lgPhonView=\'letter:' + next + '\';render()">下一个 ' + next + ' →</button>' +
    '</div>';
  return nameCard + sndCard + tipCard + navBtn;
}

/* ============================================================
 * Phase 2 · Sound Pairs 听辨训练（Minimal Pairs —— 核心学习单元）
 * ============================================================ */
var lgPairState = {}; // { id: { idx, correct, total, done[] } } 训练会话状态（内存）
function lgPairGet(id) {
  return lgPairState[id] || (lgPairState[id] = { idx: 0, correct: 0, total: 0, answered: false, lastRight: null, lastPair: null });
}
function lgPhonPairsPage() {
  if (!lgPairs) { lgPairsLoad(function () { render(); }); return '<div class="lg-card"><div class="empty-state"><div class="empty-text">加载中…</div></div></div>'; }
  var head = '<div class="lg-card"><div class="lg-card-h">👂 Phase 2 · 最小对立对 <span class="lg-sub">听辨训练</span></div>' +
    '<div class="lg-hint">' + (lgPairs && lgPairs.howTo || "") + '</div>' +
    '<div class="lg-row" style="gap:8px;margin:6px 0"><button class="lg-btn ghost" onclick="lgPhonView=null;render()">← 🗺 路径</button>' +
    '<button class="lg-btn ghost" onclick="lgPhonView=\'lib\';render()">📚 音素图书馆</button></div></div>';

  // 元音 Pairs 按 Level 分组
  var lvMap = {};
  (lgPairs.vowelPairs || []).forEach(function (p) { (lvMap[p.level] = lvMap[p.level] || []).push(p); });
  var lvHtml = (lgPairs.levels || []).map(function (lv) {
    var ps = lvMap[lv.id] || [];
    var cards = ps.map(function (p) {
      var s = lgPairGet(p.id);
      var acc = s.total > 0 ? Math.round(s.correct / s.total * 100) : null;
      return '<div class="phon-pair-card" onclick="lgPhonView=\'pair:' + p.id + '\';render()">' +
        '<div class="phon-pair-syms">' + p.a + ' <span class="vs">VS</span> ' + p.b + '</div>' +
        '<div class="phon-pair-words">' + p.aWord + ' / ' + p.bWord + '</div>' +
        (acc !== null ? '<div class="phon-pair-acc">Accuracy ' + acc + '% · ' + s.correct + '/' + s.total + '</div>' : '<div class="phon-pair-start">▶ 开始听辨</div>') +
        '</div>';
    }).join("");
    return '<div class="lg-card"><div class="lg-card-h">' + lv.name + ' <span class="lg-sub">' + lv.desc + '</span></div>' + cards + '</div>';
  }).join("");

  // 辅音清浊 Pairs（Phase 3 预告，直接可听辨）
  var cHtml = "";
  var cps = lgPairs.consPairs || [];
  if (cps.length) {
    var cCards = cps.map(function (p) {
      var s = lgPairGet(p.id);
      var acc = s.total > 0 ? Math.round(s.correct / s.total * 100) : null;
      return '<div class="phon-pair-card" onclick="lgPhonView=\'pair:' + p.id + '\';render()">' +
        '<div class="phon-pair-syms">' + p.a + ' <span class="vs">VS</span> ' + p.b + '</div>' +
        '<div class="phon-pair-words">' + p.aWord + ' / ' + p.bWord + '</div>' +
        '<div class="phon-pair-grp">' + (p.group || "") + '</div>' +
        (acc !== null ? '<div class="phon-pair-acc">Accuracy ' + acc + '%</div>' : '<div class="phon-pair-start">▶ 听辨</div>') +
        '</div>';
    }).join("");
    cHtml = '<div class="lg-card"><div class="lg-card-h">🔤 辅音清浊对比 <span class="lg-sub">' + (lgPairs.consIntro || "") + '</span></div>' + cCards + '</div>';
  }
  return head + lvHtml + cHtml;
}

/* ============================================================
 * Phase 3 · 辅音系统（按发音机制分组 + 清浊对比）
 * ============================================================ */
// 进度：完成 = lgPairState[id].total >= 2
function lgConsProgress() {
  if (!lgPairs || !lgPairs.consPairs) return { done: 0, total: 0, pct: 0 };
  var total = lgPairs.consPairs.length;
  var done = 0;
  for (var i = 0; i < total; i++) {
    var s = lgPairState[lgPairs.consPairs[i].id];
    if (s && s.total >= 2) done++;
  }
  return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
}

function lgPhonConsPage() {
  if (!lgPairs) { lgPairsLoad(function () { render(); }); return '<div class="lg-card"><div class="empty-state"><div class="empty-text">加载中…</div></div></div>'; }
  var region = lgPhonRegion || "US";
  var consPairsById = {};
  (lgPairs.consPairs || []).forEach(function (p) { consPairsById[p.id] = p; });

  // 头部
  var head = '<div class="lg-card"><div class="lg-card-h">🗣 Phase 3 · 辅音系统 <span class="lg-sub">发音机制 + 清浊对比</span></div>' +
    '<div class="lg-hint">' + (lgPairs.consIntro || "") + '</div>' +
    '<div class="lg-row" style="gap:8px;margin:6px 0"><button class="lg-btn ghost" onclick="lgPhonView=null;render()">← 🗺 路径</button>' +
    '<button class="lg-btn ghost" onclick="lgPhonView=\'lib\';render()">📚 音素图书馆</button></div></div>';

  // ✋ 把手放在喉咙（教学卡 + 清浊对比 demo）
  var throatCard = '<div class="phon-throat-card">' +
    '<div class="phon-throat-h"><span class="emoji">✋</span>' + (lgPairs.consTip || "把手放在喉咙感受声带震动") + '</div>' +
    '<div class="phon-throat-grid">' +
      '<div class="phon-throat-side voice-0">' +
        '<span class="badge">清音 Voiceless</span>' +
        '<div class="ipa-big">/p/</div>' +
        '<div>送气无声</div>' +
        '<button class="phon-speak-btn" onclick="lgPhonSpeak(\'puh\',\'' + region + '\')">🔊 听</button>' +
        '<div class="vib">— 无震动 —</div>' +
      '</div>' +
      '<div class="phon-throat-side voice-1">' +
        '<span class="badge">浊音 Voiced</span>' +
        '<div class="ipa-big">/b/</div>' +
        '<div>声带震动</div>' +
        '<button class="phon-speak-btn" onclick="lgPhonSpeak(\'buh\',\'' + region + '\')">🔊 听</button>' +
        '<div class="vib">📳 喉部震动</div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.6">' +
      '👉 练习方法：交替发 <b>/p/ /b/ /p/ /b/</b>，注意 /p/ 时喉咙无震动，/b/ 时喉部能感到明显振动。<br>' +
      '大部分清浊辅音对（爆破音、摩擦音、破擦音）都遵循这个规律。' +
    '</div>' +
    '</div>';

  // 按发音机制分组（lgPairs.consGroups）渲染卡片
  var groups = lgPairs.consGroups || [];
  var mechHtml = groups.map(function (g) {
    var pairsHtml = (g.pairs || []).map(function (id) {
      var p = consPairsById[id];
      if (!p) return "";
      var s = lgPairGet(id);
      var acc = s.total > 0 ? Math.round(s.correct / s.total * 100) : null;
      var bothVoiced = p.aVoice === true && p.bVoice === true;
      var tagText = bothVoiced ? "双浊音" : (p.aVoice === false ? "清 / 浊" : (p.aVoice === true ? "浊 / 清" : "清 / 浊"));
      var tagCls = bothVoiced ? "both" : (p.aVoice === false ? "voiceless" : "voiced");
      return '<div class="phon-cons-pair" onclick="lgPhonView=\'pair:' + id + '\';render()">' +
        '<div class="phon-cons-pair-l">' +
          '<div><div class="phon-cons-pair-syms">' + p.a + ' <span class="vs">VS</span> ' + p.b + '</div>' +
          '<div class="phon-cons-pair-words">' + p.aWord + ' / ' + p.bWord + '</div></div>' +
        '</div>' +
        '<div class="phon-cons-pair-tags">' +
          '<span class="phon-voice-tag ' + tagCls + '">' + tagText + '</span>' +
          (acc !== null ? '<span class="phon-cons-pair-acc">' + acc + '%</span>' : '') +
        '</div>' +
      '</div>' +
      (p.tip ? '<div class="phon-cons-pair-tip">💡 ' + p.tip + '</div>' : '');
    }).join("");
    return '<div class="phon-cons-mech">' +
      '<div class="phon-cons-mech-h">' +
        '<span class="phon-cons-mech-n">' + g.num + '</span>' +
        '<span class="phon-cons-mech-name">' + g.name + '</span>' +
      '</div>' +
      '<div class="phon-cons-mech-zh">' + g.zh + '</div>' +
      pairsHtml +
      '</div>';
  }).join("");

  return head + throatCard + mechHtml;
}

/* ============================================================
 * Phase 4 · 自然拼读 Phonics × Spelling（Pattern → Sound → Word）
 * ============================================================ */
var lgSpell = null;
var lgSpellState = {}; // { patternId: {wIdx} } 会话进度
var __lgSpellDone = null;
function lgSpellDone() {
  if (__lgSpellDone) return __lgSpellDone;
  try { __lgSpellDone = JSON.parse(localStorage.getItem("lgPhonSpellDone") || "[]"); }
  catch (e) { __lgSpellDone = []; }
  return __lgSpellDone;
}
function lgSpellMarkDone(id) {
  var d = lgSpellDone();
  if (d.indexOf(id) < 0) { d.push(id); __lgSpellDone = d; localStorage.setItem("lgPhonSpellDone", JSON.stringify(d)); }
}
function lgSpellReset() { __lgSpellDone = null; }
function lgSpellLoad(cb) {
  fetch("data/spelling_patterns.json?v=" + (typeof APP_VERSION !== "undefined" ? APP_VERSION : "")).then(function (r) { return r.json(); }).then(function (d) {
    lgSpell = d;
    if (typeof DB !== "undefined" && DB && DB.cache) DB.cache("spelling_patterns", d);
    if (cb) cb();
  }).catch(function () { if (cb) cb(); });
}
function lgSpellProgress() {
  if (!lgSpell || !lgSpell.patterns) return { done: 0, total: 0, pct: 0 };
  var done = lgSpellDone();
  var total = lgSpell.patterns.length;
  var d = 0;
  for (var i = 0; i < total; i++) { if (done.indexOf(lgSpell.patterns[i].id) >= 0) d++; }
  return { done: d, total: total, pct: total ? Math.round(d / total * 100) : 0 };
}

// 词拆解渲染：字母色块 + 发音标注 + 整词 TTS
function lgSpellWordRow(w, region, accent) {
  var chips = (w.parts || []).map(function (pt) {
    var silent = pt[1] === "∅";
    return '<span class="phon-chip' + (silent ? " silent" : "") + '">' +
      '<span class="phon-chip-l">' + pt[0] + '</span>' +
      '<span class="phon-chip-s">' + pt[1] + '</span></span>';
  }).join("");
  return '<div class="phon-spell-word">' +
    '<div class="phon-spell-chips">' + chips + '</div>' +
    '<div class="phon-spell-rt">' +
      '<span class="phon-spell-eq">=</span>' +
      '<span class="phon-spell-ipa">' + w.ipa + '</span>' +
      '<button class="phon-speak-btn" onclick="event.stopPropagation();lgPhonSpeak(\'' + lgEscapeJs(w.w) + '\',\'' + region + '\')">🔊</button>' +
      '<span class="phon-spell-zh">' + w.w + ' · ' + w.zh + '</span>' +
    '</div></div>';
}

// Pattern 列表页（按 cat 分组）
function lgPhonSpellPage() {
  if (!lgSpell) { lgSpellLoad(function () { render(); }); return '<div class="lg-card"><div class="empty-state"><div class="empty-text">加载中…</div></div></div>'; }
  var region = lgPhonRegion || "US";
  var head = '<div class="lg-card"><div class="lg-card-h">🔠 Phase 4 · 自然拼读 <span class="lg-sub">Pattern → Sound → Word</span></div>' +
    '<div class="lg-hint">' + (lgSpell.intro || "") + '</div>' +
    '<div class="lg-row" style="gap:8px;margin:6px 0"><button class="lg-btn ghost" onclick="lgPhonView=null;render()">← 🗺 路径</button></div></div>';
  var done = lgSpellDone();
  var catMap = {};
  (lgSpell.patterns || []).forEach(function (p) { (catMap[p.cat] = catMap[p.cat] || []).push(p); });
  var body = (lgSpell.cats || []).map(function (c) {
    var ps = catMap[c.id] || [];
    var cards = ps.map(function (p) {
      var isDone = done.indexOf(p.id) >= 0;
      return '<div class="phon-spell-pat' + (isDone ? " done" : "") + '" onclick="lgPhonView=\'spell:' + p.id + '\';render()">' +
        '<div class="phon-spell-pat-p">' + p.pattern + '</div>' +
        '<div class="phon-spell-pat-body"><div class="phon-spell-pat-s">' + p.sound +
          ' <button class="phon-speak-btn" onclick="event.stopPropagation();lgPhonSpeak(\'' + lgEscapeJs(p.speak) + '\',\'' + region + '\')">🔊</button></div>' +
          '<div class="phon-spell-pat-w">' + (p.words || []).map(function (w) { return w.w; }).join(" · ") + '</div></div>' +
        (isDone ? '<div class="phon-spell-ok">✓</div>' : '') +
        '</div>';
    }).join("");
    return '<div class="lg-card"><div class="lg-card-h">' + c.num + ' · ' + c.name + ' <span class="lg-sub">' + c.zh + '</span></div>' + cards + '</div>';
  }).join("");
  return head + body;
}

// Pattern 详情页：规律说明 + 逐词拆解拼读
function lgPhonSpellDetail(id) {
  if (!lgSpell) { lgSpellLoad(function () { render(); }); return '<div class="lg-card"><div class="empty-state"><div class="empty-text">加载中…</div></div></div>'; }
  var p = null;
  for (var i = 0; i < (lgSpell.patterns || []).length; i++) { if (lgSpell.patterns[i].id === id) { p = lgSpell.patterns[i]; break; } }
  if (!p) { lgPhonView = "spell"; render(); return ""; }
  lgSpellMarkDone(id);
  var region = lgPhonRegion || "US";
  var done = lgSpellDone();
  var total = lgSpell.patterns.length;
  var head = '<div class="lg-card phon-spell-hero">' +
    '<div class="lg-row" style="gap:8px"><button class="lg-btn ghost" onclick="lgPhonView=\'spell\';render()">← Pattern 列表</button></div>' +
    '<div class="phon-spell-hero-p">' + p.pattern + ' <span class="phon-spell-arrow">→</span> <span class="phon-spell-hero-s">' + p.sound + '</span>' +
      ' <button class="phon-speak-btn" onclick="lgPhonSpeak(\'' + lgEscapeJs(p.speak) + '\',\'' + region + '\')">🔊</button></div>' +
    '<div class="lg-hint">' + p.rule + '</div>' +
    '<div class="phon-spell-prog">已学 ' + done.length + '/' + total + ' 个 Pattern</div></div>';
  var words = (p.words || []).map(function (w) { return lgSpellWordRow(w, region); }).join("");
  var navBtn = '<div class="lg-row" style="gap:8px;margin-top:10px">' +
    '<button class="lg-btn ghost" onclick="lgPhonView=\'spell\';render()">🗺 全部 Pattern</button>';
  // 找到下一个未学 pattern
  var nextPat = null;
  for (var j = 0; j < (lgSpell.patterns || []).length; j++) {
    if (lgSpell.patterns[j].id === id) {
      for (var k = j + 1; k < lgSpell.patterns.length + j; k++) {
        var idx = k % lgSpell.patterns.length;
        if (done.indexOf(lgSpell.patterns[idx].id) < 0) { nextPat = lgSpell.patterns[idx]; break; }
      }
      break;
    }
  }
  if (nextPat) {
    navBtn += '<button class="lg-btn primary" style="flex:1" onclick="lgPhonView=\'spell:' + nextPat.id + '\';render()">下一个 ' + nextPat.pattern + ' →</button>';
  } else {
    navBtn += '<button class="lg-btn primary" style="flex:1" onclick="lgPhonView=null;render()">🎉 全部学完 · 返回路径</button>';
  }
  navBtn += '</div>';
  return head + '<div class="lg-card"><div class="lg-card-h">逐词拆解拼读</div>' +
    '<div class="lg-hint">每个色块 = 一个字母或字母组合，色块上方标发音，∅ = 不发音。依次读出即整词发音。</div>' + words + '</div>' + navBtn;
}

// 训练器：读一个词 → 判断 A 还是 B
function lgPhonPairTrain(id) {
  if (!lgPairs) { lgPairsLoad(function () { render(); }); return '<div class="lg-card"><div class="empty-state"><div class="empty-text">加载中…</div></div></div>'; }
  var all = (lgPairs.vowelPairs || []).concat(lgPairs.consPairs || []);
  var p = null;
  for (var i = 0; i < all.length; i++) { if (all[i].id === id) { p = all[i]; break; } }
  if (!p) { lgPhonView = "pairs"; render(); return ""; }
  var s = lgPairGet(id);
  var region = lgPhonRegion || "US";
  var pairs = p.pairs || [];
  // 出题：当前词对 = pairs[s.idx % pairs.length]；随机左右
  var cur = pairs[s.idx % pairs.length];
  var rightIsA = Math.random() < 0.5; // 标准答案是 A(左) 还是 B(右)
  var rightWord = rightIsA ? cur[0] : cur[1];
  var rightZh = rightIsA ? cur[2] : cur[3];
  var head = '<div class="lg-card"><div class="lg-card-h">👂 听辨训练 <span class="lg-sub">' + p.a + ' vs ' + p.b + '</span></div>' +
    '<div class="lg-row" style="gap:8px"><button class="lg-btn ghost" onclick="lgPhonView=\'pairs\';render()">← 返回</button>' +
    '<button class="lg-btn ghost" onclick="lgPhonView=\'lib\';render()">📚 音标详情</button></div>' +
    '<div class="lg-hint">点 🔊 听发音，判断是 ' + p.a + '（如 ' + p.aWord + '）还是 ' + p.b + '（如 ' + p.bWord + '）。</div></div>';

  // 隐藏标准答案（存到 state 供判题，不渲染出来）
  s._rightIsA = rightIsA;
  s._rightWord = rightWord;

  var probe = '<div class="lg-card phon-train-probe">' +
    '<div class="phon-train-q">你听到的是？</div>' +
    '<button class="phon-big-speak" onclick="lgPhonSpeak(\'' + lgEscapeJs(rightWord) + '\',\'' + region + '\')">🔊 听发音</button>' +
    '<div class="phon-train-zh">（' + rightZh + '）</div>' + // 中文释义提供线索但不暴露单词拼写
    '</div>';

  var opts = '<div class="lg-card"><div class="lg-card-h">选择你听到的音</div>' +
    '<div class="phon-train-opts">' +
      '<button class="phon-train-opt" onclick="lgPairAnswer(\'' + id + '\',\'A\')">' + p.a + '<div class="phon-opt-word">' + p.aWord + '</div></button>' +
      '<button class="phon-train-opt" onclick="lgPairAnswer(\'' + id + '\',\'B\')">' + p.b + '<div class="phon-opt-word">' + p.bWord + '</div></button>' +
    '</div></div>';

  // 反馈区
  var fb = "";
  if (s.answered) {
    var right = s.lastRight;
    fb = '<div class="phon-fb ' + (right ? "ok" : "bad") + '">' +
      (right ? "✅ 正确！" : "❌ 听错啦") +
      ' 正确答案：<b>' + (s._rightIsA ? p.a + " " + s._rightWord : p.b + " " + s._rightWord) + '</b>' +
      ' · 听一遍答案：<button class="phon-speak-btn" onclick="lgPhonSpeak(\'' + lgEscapeJs(s._rightWord) + '\',\'' + region + '\')">🔊</button>' +
      '</div>';
  }
  var acc = s.total > 0 ? Math.round(s.correct / s.total * 100) : 0;
  var stat = '<div class="phon-train-stat">本轮 Accuracy <b>' + acc + '%</b> · ' + s.correct + '/' + s.total +
    ' · 第 ' + Math.min(s.idx + 1, pairs.length) + '/' + pairs.length + ' 组</div>';

  var nextBtn = s.answered ? '<button class="btn btn-primary" style="width:100%" onclick="lgPairNext(\'' + id + '\')">' +
    (s.idx + 1 >= pairs.length ? '🔁 再来一轮' : '下一个 🔊') + '</button>' : '';

  return head + stat + probe + opts + fb + (s.answered ? '<div class="lg-card">' + nextBtn + '</div>' : "");
}
function lgPairAnswer(id, side) {
  var s = lgPairGet(id);
  if (s.answered) return;
  var right = side === (s._rightIsA ? "A" : "B");
  s.total++;
  if (right) s.correct++;
  s.answered = true;
  s.lastRight = right;
  if (right && typeof DB !== "undefined" && DB.logActivity) DB.logActivity("language", "听辨正确 " + id);
  render();
}
function lgPairNext(id) {
  var s = lgPairGet(id);
  var all = (lgPairs && lgPairs.vowelPairs || []).concat(lgPairs && lgPairs.consPairs || []);
  var p = null;
  for (var i = 0; i < all.length; i++) { if (all[i].id === id) { p = all[i]; break; } }
  var n = p ? (p.pairs || []).length : 1;
  s.idx = (s.idx + 1) % n;
  s.answered = false;
  s._rightIsA = null;
  s._rightWord = null;
  render();
}

/* =============================================================
 * 通用微信式月历（各板块「历史」共用）
 * ============================================================= */
var lgCalState = {}; // { ctx: {y,m,sel} }
function lgCalGo(ctx, d) {
  var s = lgCalState[ctx] || (lgCalState[ctx] = { y: new Date().getFullYear(), m: new Date().getMonth() + 1, sel: null });
  if (d === "prev") { s.m--; if (s.m < 1) { s.m = 12; s.y--; } }
  else if (d === "next") { s.m++; if (s.m > 12) { s.m = 1; s.y++; } }
  else s.sel = d;
  render();
}
function lgCalDotMap(map) {
  var m = {}; for (var k in (map || {})) m[k] = 1; return m;
}
function lgCalHtml(ctx, map, selHtml, todayStrOverride) {
  var s = lgCalState[ctx] || (lgCalState[ctx] = { y: new Date().getFullYear(), m: new Date().getMonth() + 1, sel: null });
  var y = s.y, m = s.m;
  var first = new Date(y, m - 1, 1);
  var startDow = first.getDay();
  var daysInMonth = new Date(y, m, 0).getDate();
  var dots = lgCalDotMap(map);
  var todayRef = todayStrOverride || (typeof today === "function" ? today() : "");
  var weekNames = ["日", "一", "二", "三", "四", "五", "六"];
  var head = '<div class="learn-cal-week">' + weekNames.map(function (w) { return '<span>' + w + '</span>'; }).join("") + '</div>';
  var cells = "";
  for (var i = 0; i < startDow; i++) cells += '<div class="learn-cal-cell empty"></div>';
  for (var dd = 1; dd <= daysInMonth; dd++) {
    var ds = y + "-" + String(m).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    var has = !!dots[ds];
    var cls = "learn-cal-cell";
    if (ds === s.sel) cls += " selected";
    if (ds === todayRef) cls += " today";
    cells += '<div class="' + cls + '"' + (has ? ' onclick="lgCalGo(\'' + ctx + '\',\'' + ds + '\')"' : '') + '>' +
      '<span class="learn-cal-num">' + dd + '</span>' +
      (has ? '<span class="learn-cal-dot"></span>' : '') +
    '</div>';
  }
  return '<div class="learn-cal">' +
    '<div class="learn-cal-bar">' +
      '<button class="learn-cal-nav" onclick="lgCalGo(\'' + ctx + '\',\'prev\')">‹</button>' +
      '<span class="learn-cal-title">' + y + ' 年 ' + m + ' 月</span>' +
      '<button class="learn-cal-nav" onclick="lgCalGo(\'' + ctx + '\',\'next\')">›</button>' +
    '</div>' + head + '<div class="learn-cal-grid">' + cells + '</div>' +
  '</div>' + selHtml;
}
function lgHistoryBtn(ctx, label) {
  return '<button class="lg-btn ghost" onclick="lgHist=\'' + ctx + '\';render()">📅 历史</button>';
}
var lgHist = null; // 当前展开的历史日历 context

/* 轻量活动日志：听力/口语/写作等板块记录「哪天练了几次」 */
function lgLogActivity(section) {
  var e = langGet(langCur());
  if (!e.activity) e.activity = {};
  if (!e.activity[section]) e.activity[section] = {};
  var d = today();
  e.activity[section][d] = (e.activity[section][d] || 0) + 1;
  DB.save();
}
function lgActMap(cur, section) {
  var a = (langGet(cur).activity || {})[section] || {};
  var m = {}; for (var k in a) m[k] = 1; return m;
}
function lgActSelHtml(cur, section, label) {
  var e = langGet(cur);
  var s = lgCalState[section] || {};
  var sel = s.sel || today();
  var n = ((e.activity || {})[section] || {})[sel] || 0;
  return '<div class="aihot-archive-day"><div class="aihot-archive-day-h">📅 ' + sel + ' ' + label + '</div>' +
    (n ? '<div class="lg-hint">当天练习 ' + n + ' 次，坚持就是胜利 💪</div>' : '<div class="brief-empty" style="margin:0">该日期没有记录</div>') + '</div>';
}

/* =============================================================
 * 精读每日推送数据（data/lang_reading.json，云端每日 10 篇）
 * ============================================================= */
var __lgReading = null;
function lgBjToday() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
function lgReadingLoad(cb) {
  if (__lgReading) { cb && cb(); return; }
  var t = lgBjToday();
  var ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "";
  fetch("data/lang_reading.json?v=" + ver + "&d=" + t).then(function (r) { return r.json(); }).then(function (j) {
    __lgReading = j; cb && cb();
  }).catch(function () { __lgReading = {}; cb && cb(); });
}

/* =============================================================
 * 模块二：智能生词库
 * ============================================================= */
function lgRenderWords(cur) {
  var e = langGet(cur);
  var wb = e.wordbank;
  var rate = (e.settings && e.settings.rate) || 0.9;
  var pools = lgWordPools();
  var wmap = {};
  pools.ielts.concat(pools.trade).forEach(function (w) { wmap[w.id] = w; });
  var libs = [["ielts", "雅思"], ["trade", "外贸"]];

  // 库切换（浏览用）
  var libBar = '<div class="lg-pack-row">' + libs.map(function (l) {
    return '<button class="lg-pack' + (wb.lib === l[0] ? " on" : "") + '" onclick="lgSetWordLib(\'' + l[0] + '\')">' + l[1] + '</button>';
  }).join("") + '</div>';

  // 每日单词（确保今日推送存在）
  var daily = lgEnsureDailyWordbank(cur);
  var ids = daily.ids || [];
  var results = daily.results || {};
  var marked = ids.filter(function (id) { return results[id]; }).length;

  var dailyHtml = '<div class="lg-card"><div class="lg-card-h">📅 今日单词 <span class="lg-sub">雅思+外贸 · 已学 ' + marked + '/' + ids.length + ' · 每日 ' + wb.dailyCount + ' 个</span>' + lgHistoryBtn("wb") + '</div>';
  if (!ids.length) {
    dailyHtml += '<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">今天没有待学单词<br>明天会按重点（不会的）自动推送新一批。</div></div>';
  } else {
    dailyHtml += '<div class="lg-btn-row" style="margin-bottom:8px"><button class="lg-btn primary" style="flex:1" onclick="lgOpenWordReview()">🎯 复习今天不会/模糊（' + ids.filter(function (id) { return results[id] === "unknown" || results[id] === "vague"; }).length + '）</button></div>';
    dailyHtml += '<div class="lg-wb-list">' + ids.map(function (id) {
      var w = wmap[id]; if (!w) return '';
      var st = results[id];
      var stTxt = st ? ({ unknown: "😵 不会", vague: "🤔 模糊", known: "😎 认识" }[st]) : "";
      var bcls = function (s) { return st === s ? " on" : ""; };
      return '<div class="lg-wb-word' + (st ? " done" : "") + '">' +
        '<div class="lg-wb-head"><span class="lg-wb-term">' + escapeHtml(w.word) + '</span>' +
          '<span class="lg-word-speak" onclick="lgSpeak(\'' + lgEscapeJs(w.word) + '\',\'en\',' + rate + ')">🔊</span>' +
          (w.phonetic ? '<span class="lg-wb-phon">' + escapeHtml(w.phonetic) + '</span>' : '') +
          (w.pos ? '<span class="lg-mini-tag">' + escapeHtml(w.pos) + '</span>' : '') +
        '</div>' +
        '<div class="lg-wb-mean">' + escapeHtml(w.meaning) + '</div>' +
        (w.example ? '<div class="lg-wb-ex"><span>' + escapeHtml(w.example) + '</span><span class="lg-word-speak" onclick="lgSpeak(\'' + lgEscapeJs(w.example) + '\',\'en\',' + rate + ')">🔊</span></div>' : '') +
        (w.exampleCn ? '<div class="lg-wb-excn">' + escapeHtml(w.exampleCn) + '</div>' : '') +
        (st ? '<div class="lg-wb-st">本次标记：' + stTxt + '</div>' : '') +
        '<div class="lg-wb-btns">' +
          '<button class="lg-btn miss' + bcls("unknown") + '" onclick="lgMarkWordBtn(\'' + id + '\',\'unknown\')">😵 不会</button>' +
          '<button class="lg-btn' + bcls("vague") + '" onclick="lgMarkWordBtn(\'' + id + '\',\'vague\')">🤔 模糊</button>' +
          '<button class="lg-btn know' + bcls("known") + '" onclick="lgMarkWordBtn(\'' + id + '\',\'known\')">😎 认识</button>' +
        '</div></div>';
    }).join("") + '</div>';
  }
  dailyHtml += '</div>';

  // 重点复习（不会 > 模糊）
  var rev = lgWordbankReview(cur);
  var revUnknown = rev.filter(function (w) { return w.status === "unknown"; }).length;
  var revHtml = '<div class="lg-card"><div class="lg-card-h">🔁 重点复习 <span class="lg-sub">不会 ' + revUnknown + ' · 模糊 ' + (rev.length - revUnknown) + '</span></div>';
  if (!rev.length) revHtml += '<div class="empty-state"><div class="empty-text">还没有需要重点复习的单词，把今天「不会」的标出来会自动汇总到这里。</div></div>';
  else revHtml += '<div class="lg-btn-row" style="margin-bottom:8px"><button class="lg-btn primary" style="flex:1" onclick="lgOpenWordReview(true)">🎯 开始重点复习（' + rev.length + '）</button></div>';
  revHtml += '</div>';

  // 全部单词浏览（按当前库，可搜索）
  var bpool = pools[wb.lib] || [];
  var q = (lgWbSearch || "").trim().toLowerCase();
  var blist = bpool.filter(function (w) {
    if (!q) return true;
    return (w.word + " " + (w.meaning || "") + " " + (w.phonetic || "")).toLowerCase().indexOf(q) !== -1;
  });
  var browseHtml = '<div class="lg-card"><div class="lg-card-h">📚 ' + (wb.lib === "ielts" ? "雅思" : "外贸") + '词库 <span class="lg-sub">共 ' + bpool.length + ' 词</span></div>' +
    '<input class="lg-input" style="margin-bottom:8px" placeholder="🔍 搜索单词 / 释义 / 音标…" value="' + escapeHtml(lgWbSearch) + '" oninput="lgWbSearch=this.value;lgWbSearchNow()">' +
    (blist.length ? '<div class="lg-wb-list">' + blist.map(function (w) {
      var st = wb.progress[w.id] ? wb.progress[w.id].status : "";
      var stTxt = st ? ({ unknown: "😵", vague: "🤔", known: "😎" }[st]) : "";
      return '<div class="lg-wb-word' + (st ? " done" : "") + '">' +
        '<div class="lg-wb-head"><span class="lg-wb-term">' + escapeHtml(w.word) + '</span>' +
          '<span class="lg-word-speak" onclick="lgSpeak(\'' + lgEscapeJs(w.word) + '\',\'en\',' + rate + ')">🔊</span>' +
          (w.phonetic ? '<span class="lg-wb-phon">' + escapeHtml(w.phonetic) + '</span>' : '') +
          (w.pos ? '<span class="lg-mini-tag">' + escapeHtml(w.pos) + '</span>' : '') +
          (st ? '<span class="lg-mini-tag">' + stTxt + '</span>' : '') +
        '</div>' +
        '<div class="lg-wb-mean">' + escapeHtml(w.meaning) + '</div>' +
        (w.example ? '<div class="lg-wb-ex"><span>' + escapeHtml(w.example) + '</span><span class="lg-word-speak" onclick="lgSpeak(\'' + lgEscapeJs(w.example) + '\',\'en\',' + rate + ')">🔊</span></div>' : '') +
        (w.exampleCn ? '<div class="lg-wb-excn">' + escapeHtml(w.exampleCn) + '</div>' : '') +
      '</div>';
    }).join("") + '</div>' : '<div class="empty-state"><div class="empty-text">没有匹配的单词</div></div>') +
    '</div>';

  // 复习会话优先
  if (lgWordReview && lgWordReview.idx < lgWordReview.queue.length) {
    return libBar + lgWordReviewCard();
  }
  return libBar + dailyHtml +
    (lgHist === "wb" ? lgCalHtml("wb", lgWbHistMap(cur), lgWbHistSelHtml(cur)) : "") +
    revHtml + browseHtml;
}
function lgSearchNow() { render(); }
function lgWbSearchNow() { render(); }

/* ---------- 单词库：交互 ---------- */
function lgSetWordLib(lib) { var e = langGet(langCur()); e.wordbank.lib = lib; DB.save(); render(); }
function lgSetDailyCount(n) { var e = langGet(langCur()); e.wordbank.dailyCount = n; DB.save(); render(); }
function lgEnsureDailyWordbank(cur) {
  var e = langGet(cur); var wb = e.wordbank;
  if (!wb.history) wb.history = {}; // 微信式历史：{ date: {ids, results, count} }
  if (!wb.daily || wb.daily.date !== today()) {
    // 归档昨日（未归档时），保证历史可回看
    if (wb.daily && wb.daily.date && !wb.history[wb.daily.date]) {
      wb.history[wb.daily.date] = { ids: wb.daily.ids || [], results: wb.daily.results || {}, count: (wb.daily.ids || []).length };
    }
    wb.daily = { date: today(), ids: lgPickDailyWords(lgWordPools(), wb.enabled, wb.dailyCount, wb.progress, today()), results: {} };
    DB.save();
  }
  return wb.daily;
}
// 单词库历史：有记录的日期映射 + 选中日期详情
function lgWbHistMap(cur) {
  var wb = langGet(cur).wordbank;
  var map = {};
  Object.keys(wb.history || {}).forEach(function (d) { map[d] = 1; });
  if (wb.daily && wb.daily.date) map[wb.daily.date] = 1;
  return map;
}
function lgWbHistSelHtml(cur) {
  var wb = langGet(cur).wordbank;
  var s = lgCalState["wb"] || {};
  var sel = s.sel || (wb.daily && wb.daily.date) || today();
  var rec = wb.history && wb.history[sel];
  var pools = lgWordPools(), wmap = {};
  pools.ielts.concat(pools.trade).forEach(function (w) { wmap[w.id] = w; });
  var ids = rec ? rec.ids : ((wb.daily && wb.daily.date === sel) ? wb.daily.ids : []);
  var results = rec ? rec.results : ((wb.daily && wb.daily.date === sel) ? wb.daily.results : {});
  var html = '<div class="aihot-archive-day"><div class="aihot-archive-day-h">📅 ' + sel + ' 单词</div>';
  if (!ids || !ids.length) { html += '<div class="brief-empty" style="margin:0">该日期没有单词记录</div>'; }
  else {
    var marked = ids.filter(function (id) { return results[id]; }).length;
    html += '<div class="lg-hint" style="margin-bottom:8px">共 ' + ids.length + ' 词，已标记 ' + marked + ' 个</div>';
    html += '<div class="lg-wb-list">' + ids.map(function (id) {
      var w = wmap[id]; if (!w) return "";
      var st = results[id];
      var stTxt = st ? ({ unknown: "😵 不会", vague: "🤔 模糊", known: "😎 认识" }[st]) : "—";
      return '<div class="lg-wb-row"><span class="lg-wb-en">' + escapeHtml(w.en) + '</span>' +
        '<span class="lg-wb-ph">' + escapeHtml(w.phonetic || "") + '</span>' +
        '<span class="lg-wb-cn">' + escapeHtml(w.cn) + '</span>' +
        '<span class="lg-wb-st">' + stTxt + '</span>' +
        '<button class="lg-wb-sound" onclick="lgSpeak(\'' + lgEscapeJs(w.en) + '\',\'' + cur + '\',0.9)">🔊</button></div>';
    }).join("") + '</div>';
  }
  return html + '</div>';
}
function lgMarkWord(cur, id, status) {
  var e = langGet(cur); lgMarkWordInWb(e.wordbank, id, status, today()); DB.save();
}
function lgMarkWordBtn(id, status) { lgMarkWord(langCur(), id, status); render(); }
function lgWordbankReview(cur) { return lgWordbankReviewFromWb(langGet(cur).wordbank, lgWordPools()); }
function lgWordbankStats(cur) { return lgWordbankStatsFromWb(langGet(cur).wordbank, lgWordPools()); }
function lgWordbankUnknownCount(code) {
  var e = langGet(code);
  var wb = e.wordbank || lgWordbankDefault();
  return lgWordbankReviewFromWb(wb, lgWordPools()).filter(function (w) { return w.status === "unknown"; }).length;
}
function lgOpenWordReview(focus) {
  var e = langGet(langCur()); var wb = e.wordbank;
  var rev;
  if (focus) {
    rev = lgWordbankReview(langCur()).filter(function (w) { return w.status === "unknown"; });
  } else {
    var res = (wb.daily && wb.daily.results) || {};
    var dids = (wb.daily && wb.daily.ids) || [];
    rev = dids.filter(function (id) { return res[id] === "unknown" || res[id] === "vague"; })
      .map(function (id) { return lgWordById(id); }).filter(Boolean)
      .map(function (w) { return { id: w.id, word: w.word, phonetic: w.phonetic, pos: w.pos, meaning: w.meaning, example: w.example, exampleCn: w.exampleCn, status: res[w.id] }; });
  }
  if (!rev.length) { showToast(focus ? "暂无可重点复习的不会单词" : "今天还没标记不会/模糊的单词", "error"); return; }
  lgWordReview = { queue: rev, idx: 0, total: rev.length, unknown: 0, vague: 0, known: 0, focus: !!focus, reveal: false };
  render();
}
function lgWordReviewCard() {
  var cur = langCur(); var e = langGet(cur);
  var rc = lgWordReview.queue[lgWordReview.idx];
  var rate = (e.settings && e.settings.rate) || 0.9;
  var w = lgWordById(rc.id) || rc;
  return '<div class="lg-card"><div class="lg-card-h">🔁 重点复习 · ' + (lgWordReview.idx + 1) + ' / ' + lgWordReview.total + (lgWordReview.focus ? "（仅不会）" : "") + '</div>' +
    '<div class="lg-review-prog"><div style="width:' + Math.round(lgWordReview.idx / lgWordReview.total * 100) + '%"></div></div>' +
    '<div class="lg-review-term" onclick="lgSpeak(\'' + lgEscapeJs(w.word) + '\',\'en\',' + rate + ')">' + escapeHtml(w.word) + ' 🔊</div>' +
    (w.phonetic ? '<div class="lg-review-reading">' + escapeHtml(w.phonetic) + '</div>' : '') +
    (lgWordReview.reveal ? '<div class="lg-review-mean">' + escapeHtml(w.meaning || "") +
        (w.example ? '<div class="lg-review-ex">' + escapeHtml(w.example) + '</div>' : '') +
        (w.exampleCn ? '<div class="lg-review-extra">' + escapeHtml(w.exampleCn) + '</div>' : '')
      : '') +
    '<div class="lg-btn-row">' +
      (lgWordReview.reveal
        ? '<button class="lg-btn miss" onclick="lgWordReviewAnswer(\'unknown\')">😵 不会</button>' +
          '<button class="lg-btn" onclick="lgWordReviewAnswer(\'vague\')">🤔 模糊</button>' +
          '<button class="lg-btn know" onclick="lgWordReviewAnswer(\'known\')">😎 认识</button>'
        : '<button class="lg-btn primary" onclick="lgWordReview.reveal=true;render()">👁 显示释义</button>') +
    '</div></div>';
}
function lgWordReviewAnswer(status) {
  var cur = langCur();
  var rc = lgWordReview.queue[lgWordReview.idx];
  if (status === "unknown") lgWordReview.unknown++; else if (status === "vague") lgWordReview.vague++; else lgWordReview.known++;
  lgMarkWord(cur, rc.id, status);
  lgWordReview.idx++;
  lgWordReview.reveal = false;
  if (lgWordReview.idx >= lgWordReview.queue.length) {
    var u = lgWordReview.unknown, v = lgWordReview.vague, k = lgWordReview.known;
    lgWordReview = null;
    render();
    showToast("🎉 复习完成！不会 " + u + " · 模糊 " + v + " · 认识 " + k, "success");
    return;
  }
  render();
}
function lgWordReviewExit() { lgWordReview = null; render(); }

/* 内置基础词库：预览 + 一键导入 */
function lgImportBank() {
  var cur = langCur();
  var m = LG_META[cur];
  var e = langGet(cur);
  var bank = LG_WORDBANK[cur] || [];
  var existing = {};
  e.words.forEach(function (w) { existing[w.term] = true; });
  var added = bank.filter(function (x) { return !existing[x[0]]; }).length;
  var html = '<div class="modal-title">📚 内置基础词库 · ' + m.flag + m.name + '（' + bank.length + ' 词）</div>' +
    '<div style="padding:0 16px;font-size:12px;color:var(--text-tertiary);line-height:1.7">每个词均含<b>音标</b>与<b>例句（可点 🔊 朗读）</b>。已添加 ' + (bank.length - added) + ' 个，未添加 ' + added + ' 个。</div>' +
    '<div style="max-height:55vh;overflow-y:auto;padding:8px 16px">' + bank.map(function (x) {
      var has = !!existing[x[0]];
      return '<div class="lg-bank-item"><div class="lg-bank-head"><span class="lg-bank-term">' + escapeHtml(x[0]) + '</span>' +
        '<span class="lg-word-speak" onclick="lgSpeak(\'' + lgEscapeJs(x[0]) + '\',\'' + cur + '\')">🔊</span>' +
        '<span class="lg-bank-reading">' + escapeHtml(x[1]) + '</span>' +
        (has ? '<span class="lg-bank-has">✓ 已有</span>' : '<button class="lg-bank-add" onclick="lgBankAdd(\'' + lgEscapeJs(x[0]) + '\')">＋</button>') +
        '</div><div class="lg-bank-mean">' + escapeHtml(x[2]) + '</div>' +
        '<div class="lg-bank-ex">' + escapeHtml(x[3]) + '</div></div>';
    }).join("") + '</div>' +
    '<div class="btn-row" style="padding:0 16px 8px">' +
      '<button class="btn btn-secondary" style="flex:1" onclick="lgImportCore()">📚 导入核心 500 词（英语）</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="lgImportTxt()">📥 批量导入词表</button>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      (added > 0 ? '<button class="btn btn-primary" style="flex:1" onclick="lgBankAddAll()">📥 导入全部（' + added + '）</button>' : '<button class="btn btn-primary" style="flex:1" disabled>已全部导入</button>') +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">关闭</button>' +
    '</div>';
  showModal(html);
}
function lgBankAdd(term) {
  var cur = langCur();
  var e = langGet(cur);
  for (var i = 0; i < e.words.length; i++) if (e.words[i].term === term) { showToast("已在词库中", "warning"); return; }
  e.words.push(lgWordFromBank(cur, term));
  DB.save();
  lgImportBank();   // 刷新预览
  showToast("已添加 " + term, "success");
}
function lgBankAddAll() {
  var cur = langCur();
  var e = langGet(cur);
  var bank = LG_WORDBANK[cur] || [];
  var n = 0;
  bank.forEach(function (x) {
    var has = false;
    for (var i = 0; i < e.words.length; i++) if (e.words[i].term === x[0]) { has = true; break; }
    if (!has) { e.words.push(lgWordFromBank(cur, x[0])); n++; }
  });
  closeModal(); DB.save(); render();
  showToast("已导入 " + n + " 个内置词 📖", "success");
}
function lgWordFromBank(cur, term) {
  var w = lgLookupWord(cur, term);
  var e = langGet(cur);
  return { id: lgUid(), term: term, reading: w ? w.reading : "", meaning: w ? w.meaning : "", extra: "", example: w ? w.example : "", exampleCn: w ? w.exampleCn : "", tags: ["内置词库"], level: 0, box: 0, next: lgAddDays(today(), 1), last: null, reps: 0, lapses: 0, from: "bank" };
}
/* 导入英语核心 500 词（跳过已有，命中 36 词库时补全音标例句） */
function lgImportCore() {
  var cur = langCur();
  var e = langGet(cur);
  if (cur !== "en") { showToast("核心 500 词库暂提供英语", "warning"); return; }
  var bank = LG_CORE_EN || [];
  var n = 0;
  bank.forEach(function (x) {
    var has = false;
    for (var i = 0; i < e.words.length; i++) if (e.words[i].term === x[0]) { has = true; break; }
    if (!has) {
      var w = lgLookupWord(cur, x[0]);
      e.words.push({ id: lgUid(), term: x[0], reading: w ? w.reading : "", meaning: x[1], extra: "", example: w ? w.example : "", exampleCn: w ? w.exampleCn : "", tags: ["核心词库"], level: 0, box: 0, next: lgAddDays(today(), 1), last: null, reps: 0, lapses: 0, from: "core" });
      n++;
    }
  });
  closeModal(); DB.save(); render();
  showToast("已导入核心词 " + n + " 个（跳过已有 " + (bank.length - n) + "）", n ? "success" : "warning");
}
/* 批量导入词表：粘贴 每行「词,释义」，自动去重 */
function lgImportTxt() {
  showModal(
    '<div class="modal-title">📥 批量导入词表</div>' +
    '<div class="lg-form">' +
      '<div class="lg-hint" style="margin:0">每行一个词：<b>词,释义</b>（逗号分隔）或 <b>词 释义</b>（空格分隔）。自动去重、跳过已有词。可粘贴任意词表（如 3000 常用词表）。</div>' +
      '<label class="lg-fld"><span>粘贴词表</span><textarea class="lg-input lg-textarea" id="lgimp-txt" placeholder="apple, 苹果&#10;banana, 香蕉&#10;computer, 电脑"></textarea></label>' +
      '<label class="lg-fld"><span>标签（可选）</span><input class="lg-input" id="lgimp-tag" value="导入词表"></label>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="lgImportTxtSave()">📥 导入</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '</div>'
  );
}
function lgImportTxtSave() {
  function v(x) { var el = document.getElementById(x); return el ? el.value.trim() : ""; }
  var raw = v("lgimp-txt");
  if (!raw) { showToast("请粘贴词表内容", "warning"); return; }
  var tag = v("lgimp-tag") || "导入词表";
  var cur = langCur();
  var e = langGet(cur);
  var lines = raw.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  var n = 0, skip = 0, bad = 0;
  lines.forEach(function (line) {
    var term = "", mean = "";
    var ci = line.indexOf(","); if (ci === -1) ci = line.indexOf("，");
    if (ci !== -1) { term = line.slice(0, ci).trim(); mean = line.slice(ci + 1).trim(); }
    else {
      var m = line.match(/^(\S+)\s+(.+)$/);
      if (m) { term = m[1].trim(); mean = m[2].trim(); }
      else term = line;
    }
    if (!term) { bad++; return; }
    var has = false;
    for (var i = 0; i < e.words.length; i++) if (e.words[i].term === term) { has = true; break; }
    if (has) { skip++; return; }
    var w = lgLookupWord(cur, term);
    e.words.push({ id: lgUid(), term: term, reading: w ? w.reading : "", meaning: mean, extra: "", example: w ? w.example : "", exampleCn: w ? w.exampleCn : "", tags: [tag], level: 0, box: 0, next: lgAddDays(today(), 1), last: null, reps: 0, lapses: 0, from: "import" });
    n++;
  });
  closeModal(); DB.save(); render();
  showToast("导入 " + n + " 词 · 跳过已有 " + skip + (bad ? " · 无效 " + bad : ""), n ? "success" : "warning");
}

/* 场景词包导入 */
function lgLoadPack(pk) {
  var cur = langCur();
  var e = langGet(cur);
  var packs = LG_PACKS[cur];
  if (!packs || !packs[pk]) { showToast("该语种暂无此词包", "error"); return; }
  var loaded = e.packLoaded[pk];
  if (loaded) {
    if (!confirm("词包「" + LG_PACK_NAMES[pk] + "」已导入，再次点击将移除其词（不动你手动加的）？")) return;
    var terms = packs[pk].map(function (x) { return x[0]; });
    e.words = e.words.filter(function (w) { return terms.indexOf(w.term) === -1 || w.from !== "pack-" + pk; });
    e.packLoaded[pk] = false;
  } else {
    packs[pk].forEach(function (x) {
      var has = false;
      for (var i = 0; i < e.words.length; i++) if (e.words[i].term === x[0]) { has = true; break; }
      if (!has) {
        var w = lgLookupWord(cur, x[0]);
        e.words.push({ id: lgUid(), term: x[0], reading: w ? w.reading : "", meaning: x[1], extra: "", example: w ? w.example : "", exampleCn: w ? w.exampleCn : "", tags: [LG_PACK_NAMES[pk]], level: 0, box: 0, next: today(), last: null, reps: 0, lapses: 0, from: "pack-" + pk });
      }
    });
    e.packLoaded[pk] = true;
  }
  DB.save(); render();
  showToast(loaded ? "已移除词包" : "词包已导入生词库", loaded ? "warning" : "success");
}

/* 熟练度三级切换 */
function lgWordLevel(id, lv) {
  var cur = langCur();
  var e = langGet(cur);
  for (var i = 0; i < e.words.length; i++) if (e.words[i].id === id) {
    e.words[i].level = lv;
    if (lv === 2) { e.words[i].box = LG_EB.length - 1; e.words[i].next = lgAddDays(today(), 30); }
    else if (lv === 1) { e.words[i].box = 1; e.words[i].next = lgAddDays(today(), 2); }
    else { e.words[i].box = 0; e.words[i].next = today(); }
    break;
  }
  DB.save(); render();
}

/* 新增/编辑生词表单（语种专属字段） */
function lgWordForm(id) {
  var cur = langCur();
  var m = LG_META[cur];
  var e = langGet(cur);
  var w = null;
  if (id) { for (var i = 0; i < e.words.length; i++) if (e.words[i].id === id) { w = e.words[i]; break; } }
  var t = w ? w.term : "", rd = w ? (w.reading || "") : "", mn = w ? (w.meaning || "") : "", ex = w ? (w.extra || "") : "", eg = w ? (w.example || "") : "", tg = w ? (w.tags || []).join(",") : "";
  var lvSel = w ? (w.level || 0) : 0;
  showModal(
    '<div class="modal-title">' + (id ? "✏️ 编辑生词" : "＋ 添加生词") + ' · ' + m.flag + m.name + '</div>' +
    '<div class="lg-form">' +
      '<label class="lg-fld"><span>单词/短语</span><input class="lg-input" id="lgf-term" value="' + escapeHtml(t) + '" placeholder="' + (cur === "en" ? "e.g. commute" : cur === "ja" ? "例：通勤（つうきん）" : "예: 출퇴근") + '"></label>' +
      '<label class="lg-fld"><span>' + m.reading + '</span><input class="lg-input" id="lgf-reading" value="' + escapeHtml(rd) + '"></label>' +
      '<label class="lg-fld"><span>释义（中文）</span><input class="lg-input" id="lgf-mean" value="' + escapeHtml(mn) + '" placeholder="通勤"></label>' +
      '<label class="lg-fld"><span>' + m.extra + '</span><input class="lg-input" id="lgf-extra" value="' + escapeHtml(ex) + '"></label>' +
      '<label class="lg-fld"><span>场景例句</span><input class="lg-input" id="lgf-ex" value="' + escapeHtml(eg) + '"></label>' +
      '<label class="lg-fld"><span>标签（逗号分隔）</span><input class="lg-input" id="lgf-tags" value="' + escapeHtml(tg) + '" placeholder="通勤,职场"></label>' +
      '<label class="lg-fld"><span>熟练度</span><span class="lg-lvrow">' +
        [0, 1, 2].map(function (lv) { return '<button class="lg-mini' + (lvSel === lv ? " on" : "") + '" onclick="document.getElementById(\'lgf-lv\').value=' + lv + '">' + ["😵 不会", "🤔 模糊", "😎 熟悉"][lv] + '</button>'; }).join("") +
        '<input type="hidden" id="lgf-lv" value="' + lvSel + '"></span></label>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="lgWordSave(\'' + (id || "") + '\')">💾 保存</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '</div>'
  );
}
function lgWordSave(id) {
  var cur = langCur();
  var e = langGet(cur);
  function v(x) { var el = document.getElementById(x); return el ? el.value.trim() : ""; }
  var term = v("lgf-term"), mean = v("lgf-mean");
  if (!term) { showToast("请填写单词", "warning"); return; }
  var tags = v("lgf-tags").split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
  var lvEl = document.getElementById("lgf-lv");
  var lv = lvEl ? parseInt(lvEl.value || "0", 10) : 0;
  var obj = { term: term, reading: v("lgf-reading"), meaning: mean, extra: v("lgf-extra"), example: v("lgf-ex"), tags: tags, level: lv, box: lv >= 2 ? LG_EB.length - 1 : (lv === 1 ? 1 : 0), next: lv >= 2 ? lgAddDays(today(), 30) : (lv === 1 ? lgAddDays(today(), 2) : today()), last: null, reps: 0, lapses: 0 };
  // 内置词库自动补全：未填音标/释义/例句时从 LG_WORDBANK 取
  if (!obj.reading || !obj.example) {
    var lw = lgLookupWord(cur, term);
    if (lw) {
      if (!obj.reading) obj.reading = lw.reading;
      if (!obj.meaning) obj.meaning = lw.meaning;
      if (!obj.example) obj.example = lw.example;
      obj.exampleCn = lw.exampleCn;
      if (!obj.extra && cur === "en") obj.extra = "搭配：" + term;
    }
  }
  if (id) {
    for (var i = 0; i < e.words.length; i++) if (e.words[i].id === id) { obj.id = id; e.words[i] = obj; break; }
    showToast("已保存", "success");
  } else {
    obj.id = lgUid();
    e.words.push(obj);
    e.stats.learnedCount = (e.stats.learnedCount || 0) + 1;
    showToast("已加入生词库 📖", "success");
  }
  closeModal(); DB.save(); render();
}
function lgWordEdit(id) { lgWordForm(id); }
function lgWordDel(id) {
  if (!confirm("删除该生词？")) return;
  var cur = langCur();
  var e = langGet(cur);
  e.words = e.words.filter(function (w) { return w.id !== id; });
  DB.save(); render();
}

/* 艾宾浩斯复习（5-15 分钟，三级：认识/模糊/不认识） */
function lgStartReview(all) {
  var cur = langCur();
  var e = langGet(cur);
  var pool = all ? e.words.slice() : e.words.filter(function (w) { return w.next <= today(); });
  if (!pool.length) { showToast("暂无可复习的生词", "error"); return; }
  pool = lgShuffle(pool).slice(0, 30);   // 单次 ≤30 张卡 ≈ 5-15 分钟
  lgReview = { queue: pool, idx: 0, total: pool.length, known: 0, fuzzy: 0, miss: 0 };
  render();
}
function lgReviewCard() {
  var cur = langCur();
  var e = langGet(cur);
  var rc = lgReview.queue[lgReview.idx];
  var rate = e.settings.rate || 0.9;
  return '<div class="lg-card"><div class="lg-card-h">🎯 复习中 · ' + (lgReview.idx + 1) + ' / ' + lgReview.total + '</div>' +
    '<div class="lg-review-prog"><div style="width:' + Math.round(lgReview.idx / lgReview.total * 100) + '%"></div></div>' +
    '<div class="lg-review-term" onclick="lgSpeak(\'' + lgEscapeJs(rc.term) + '\',\'' + cur + '\',' + rate + ')">' + escapeHtml(rc.term) + ' 🔊</div>' +
    (rc.reading ? '<div class="lg-review-reading">' + escapeHtml(rc.reading) + '</div>' : '') +
    '<div class="lg-review-mean" id="lg-rm" style="display:none">' + escapeHtml(rc.meaning || "（暂无释义）") +
      (rc.extra ? '<div class="lg-review-extra">' + escapeHtml(rc.extra) + '</div>' : '') +
      (rc.example ? '<div class="lg-review-ex">' + escapeHtml(rc.example) + '</div>' : '') +
    '</div>' +
    '<div class="lg-btn-row">' +
      (document.getElementById("lg-rm") && document.getElementById("lg-rm").style.display !== "none"
        ? '<button class="lg-btn know" onclick="lgReviewAnswer(2)">😎 认识</button>' +
          '<button class="lg-btn" onclick="lgReviewAnswer(1)">🤔 模糊</button>' +
          '<button class="lg-btn miss" onclick="lgReviewAnswer(0)">😵 不认识</button>'
        : '<button class="lg-btn primary" onclick="lgReviewReveal()">👁 显示释义</button>') +
    '</div></div>';
}
function lgReviewReveal() {
  var el = document.getElementById("lg-rm");
  if (el) el.style.display = "";
  render();
}
function lgReviewAnswer(know) {
  var cur = langCur();
  var e = langGet(cur);
  var rc = lgReview.queue[lgReview.idx];
  e.stats.reviewCount = (e.stats.reviewCount || 0) + 1;
  for (var i = 0; i < e.words.length; i++) if (e.words[i].id === rc.id) {
    var d = e.words[i];
    d.reps = (d.reps || 0) + 1; d.last = today();
    if (know === 2) {
      lgReview.known++;
      if (d.box < LG_EB.length - 1) { d.box++; d.next = lgAddDays(today(), LG_EB[d.box]); }
      else { d.level = 2; d.next = lgAddDays(today(), 30); }
    } else if (know === 1) {
      lgReview.fuzzy++;
      if (d.box < 1) d.box = 1;
      d.next = lgAddDays(today(), Math.max(1, LG_EB[d.box] || 2));
    } else {
      lgReview.miss++;
      d.box = 0; d.lapses = (d.lapses || 0) + 1; d.level = 0; d.next = today();
      lgReview.queue.push(rc);   // 本轮末尾再出现
    }
    break;
  }
  DB.save();
  lgReview.idx++;
  if (lgReview.idx >= lgReview.queue.length) {
    var t = lgReview.total, kn = lgReview.known, fu = lgReview.fuzzy, ms = lgReview.miss;
    lgReview = null;
    lgAddStudy(cur, Math.min(15 * 60, t * 25));   // 每卡约 25 秒，计入学习时长
    render();
    showToast("🎉 复习完成！认识 " + kn + " · 模糊 " + fu + " · 不会 " + ms, "success");
    return;
  }
  render();
}
function lgReviewExit() { lgReview = null; render(); }

/* =============================================================
 * 模块二·自测：英译中 / 中译英 / 拼写默写（三模式）
 * 题目池：今日到期 + 最近 7 天学习的词；错题自动加入次日复习清单
 * ============================================================= */
var lgTest = null;   // { mode, queue:[word], idx, correct, wrong[], answered }

function lgRenderTest(cur) {
  var m = LG_META[cur];
  var e = langGet(cur);
  if (lgTest) {
    if (lgTest.idx >= lgTest.queue.length) return lgTestResult(cur);
    return lgTestQuestion(cur);
  }
  var modes = [
    { k: "ec", t: "① 英译中", d: "看词，选中文释义" },
    { k: "ce", t: "② 中译英", d: "看中文，选对应词" },
    { k: "sp", t: "③ 拼写默写", d: "看释义/读音，手写输入" }
  ];
  var sel = e.testMode || "ec";
  var poolSize = lgTestPool(e).length;
  return '<div class="lg-card"><div class="lg-card-h">🧪 单词自测 <span class="lg-sub">' + m.name + ' · 随机抽题</span></div>' +
    '<div class="lg-hint">从「今日到期 + 最近 7 天学习」的生词中随机抽题；答错自动加入<b>次日复习清单</b>（第二天「复习」直接出现）。</div>' +
    '<div class="lg-mode-list">' + modes.map(function (mo) {
      return '<div class="lg-mode' + (sel === mo.k ? " active" : "") + '" onclick="lgSetTestMode(\'' + mo.k + '\')">' +
        '<div class="lg-mode-t">' + mo.t + '</div><div class="lg-mode-d">' + mo.d + '</div></div>';
    }).join("") + '</div>' +
    '<button class="lg-btn primary" style="width:100%;margin-top:10px" onclick="lgTestStart()">▶ 开始测试' + (poolSize ? '（题库 ' + Math.min(15, Math.max(5, poolSize)) + ' 题）' : '') + '</button>' +
    (poolSize === 0 ? '<div class="lg-hint" style="color:var(--accent-red)">当前没有可测词，先去「生词库」导入/学习一些词。</div>' : '') +
    '</div>';
}
function lgSetTestMode(k) { var e = langGet(langCur()); e.testMode = k; DB.save(); render(); }

function lgTestPool(e) {
  var t7 = lgAddDays(today(), -7);
  return (e.words || []).filter(function (w) { return w.next <= today() || (w.last && w.last >= t7); });
}
function lgTestStart() {
  var cur = langCur();
  var e = langGet(cur);
  var pool = lgShuffle(lgTestPool(e));
  var n = Math.min(15, Math.max(5, pool.length));
  lgTest = { mode: e.testMode || "ec", queue: pool.slice(0, n), idx: 0, correct: 0, wrong: [], answered: false };
  render();
}
function lgTestQuestion(cur) {
  var m = LG_META[cur];
  var q = lgTest.queue[lgTest.idx];
  var total = lgTest.queue.length;
  var pct = Math.round(lgTest.idx / total * 100);
  var rate = langGet(cur).settings.rate || 0.9;
  var head = '<div class="lg-review-prog" style="margin:10px 0 4px"><div style="width:' + pct + '%"></div></div>' +
    '<div class="lg-test-step">第 ' + (lgTest.idx + 1) + ' / ' + total + ' 题 · ' + (lgTest.mode === "ec" ? "英译中" : lgTest.mode === "ce" ? "中译英" : "拼写默写") + '</div>';
  if (lgTest.mode === "sp") {
    return '<div class="lg-card">' + head + '<div class="lg-test-card">' +
      '<div class="lg-test-cn">' + escapeHtml(q.meaning || "（无释义）") + '</div>' +
      (q.reading ? '<div class="lg-test-phon">' + escapeHtml(q.reading) + '</div>' : '') +
      '<input class="lg-input" id="lg-test-sp" placeholder="输入 ' + m.name + ' 词…" onkeydown="if(event.key===\'Enter\')lgTestSubmitSp()">' +
      '<div class="lg-btn-row" style="margin-top:10px"><button class="lg-btn primary" onclick="lgTestSubmitSp()">提交</button></div>' +
      '</div></div>';
  }
  var correct, options;
  if (lgTest.mode === "ec") { correct = q.meaning; options = lgShuffle([q.meaning].concat(lgTestDistractors(q, "meaning", 3))); }
  else { correct = q.term; options = lgShuffle([q.term].concat(lgTestDistractors(q, "term", 3))); }
  lgTest._correct = correct; lgTest._options = options;
  var qText = lgTest.mode === "ec"
    ? '<div class="lg-test-term" onclick="lgSpeak(\'' + lgEscapeJs(q.term) + '\',\'' + cur + '\',' + rate + ')">' + escapeHtml(q.term) + ' 🔊</div>' + (q.reading ? '<div class="lg-test-phon">' + escapeHtml(q.reading) + '</div>' : '')
    : '<div class="lg-test-cn">' + escapeHtml(q.meaning || "（无释义）") + '</div>';
  return '<div class="lg-card">' + head + '<div class="lg-test-card">' + qText +
    '<div class="lg-test-options">' + options.map(function (o) {
      return '<button class="lg-opt" onclick="lgTestAnswer(\'' + lgEscapeJs(o) + '\')">' + escapeHtml(o) + '</button>';
    }).join("") + '</div></div></div>';
}
function lgTestDistractors(q, field, k) {
  var e = langGet(langCur());
  var all = (e.words || []).filter(function (w) { return w.id !== q.id; });
  all = lgShuffle(all);
  var out = [];
  for (var i = 0; i < all.length && out.length < k; i++) {
    var v = field === "meaning" ? all[i].meaning : all[i].term;
    if (v && v !== q[field] && out.indexOf(v) === -1) out.push(v);
  }
  return out;
}
function lgTestAnswer(val) {
  if (!lgTest || lgTest.answered) return;
  lgTest.answered = true;
  var q = lgTest.queue[lgTest.idx];
  var ok = String(val).trim().toLowerCase() === String(lgTest._correct || "").trim().toLowerCase();
  lgTestRecord(q, ok);
  var opts = document.querySelectorAll(".lg-opt");
  opts.forEach(function (b) {
    var bv = (b.getAttribute("onclick") || "").replace(/lgTestAnswer\(/, "").replace(/'\)$/, "");
    if (bv === lgTest._correct) b.classList.add("correct");
    else if (bv === val) b.classList.add("wrong");
    b.setAttribute("disabled", "disabled");
  });
  setTimeout(function () { if (lgTest) { lgTest.answered = false; lgTest.idx++; render(); } }, 600);
}
function lgTestSubmitSp() {
  if (!lgTest || lgTest.answered) return;
  var inp = document.getElementById("lg-test-sp");
  var val = inp ? inp.value : "";
  lgTest.answered = true;
  var q = lgTest.queue[lgTest.idx];
  var ok = lgNormalize(val) === lgNormalize(q.term);
  lgTestRecord(q, ok);
  if (!ok && inp) { inp.value = q.term; inp.classList.add("reveal-correct"); }
  setTimeout(function () { if (lgTest) { lgTest.answered = false; lgTest.idx++; render(); } }, 750);
}
function lgNormalize(s) {
  var cur = langCur();
  if (cur === "en") return String(s || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  return String(s || "").replace(/\s+/g, "").trim();
}
function lgTestRecord(q, ok) {
  var cur = langCur();
  var e = langGet(cur);
  e.stats.reviewCount = (e.stats.reviewCount || 0) + 1;
  if (!e.stats.wrongTypes["自测"]) e.stats.wrongTypes["自测"] = 0;
  if (ok) { lgTest.correct++; }
  else {
    e.stats.wrongTypes["自测"]++;
    lgTest.wrong.push(q);
    // 错题自动加入次日复习清单：next=明天、box=0 → 第二天「复习」直接出现
    for (var i = 0; i < e.words.length; i++) if (e.words[i].id === q.id) {
      e.words[i].box = 0; e.words[i].level = 0; e.words[i].next = lgAddDays(today(), 1); e.words[i].lapses = (e.words[i].lapses || 0) + 1;
    }
  }
  DB.save();
}
function lgTestResult(cur) {
  var total = lgTest.queue.length;
  var rate = total > 0 ? Math.round(lgTest.correct / total * 100) : 0;
  var color = rate >= 80 ? "var(--accent-green)" : rate >= 60 ? "var(--accent-orange)" : "var(--accent-red)";
  var wrongHtml = lgTest.wrong.length === 0
    ? '<div class="lg-hint">🎉 全部正确，没有错题！</div>'
    : '<div class="lg-confuse-h">❌ 错题 ' + lgTest.wrong.length + ' 个 · 已加入次日复习清单</div>' +
      '<div class="lg-wrong-list">' + lgTest.wrong.map(function (q) {
        return '<div class="lg-wrong-item"><span class="lg-wrong-type">' + escapeHtml(q.term) + '</span><span>' + escapeHtml(q.meaning || "") + '</span></div>';
      }).join("") + '</div>';
  var h = '<div class="lg-card"><div class="lg-card-h">🧪 测试结果</div>' +
    '<div class="lg-test-summary"><div class="lg-test-rate" style="color:' + color + '">' + rate + '%</div>' +
    '<div class="lg-test-sub">正确 ' + lgTest.correct + ' / ' + total + ' 题</div></div>' + wrongHtml +
    '<div class="lg-btn-row" style="margin-top:12px">' +
      '<button class="lg-btn primary" onclick="lgTestRestart()">🔁 再来一次</button>' +
      '<button class="lg-btn ghost" onclick="lgTestExit()">返回</button>' +
    '</div></div>';
  lgTest = null;
  return h;
}
function lgTestRestart() { lgTest = null; lgTestStart(); }
function lgTestExit() { lgTest = null; render(); }

/* =============================================================
 * 模块三：精读阅读
 * ============================================================= */
var lgReadingId = null;        // 当前打开的素材 id
var lgReadingDaily = null;     // 当前打开的每日推送 {date, idx}
function lgOpenDailyArt(date, idx) { lgReadingDaily = { date: date, idx: idx }; lgReadingId = null; render(); }
function lgReadingArticleHtml(art, cur, e, backHtml) {
  var words = lgTokenize(art.content);
  var marked = art.marks || [];
  var txt = words.map(function (tk) {
    if (/^\s+$/.test(tk) || /^[.,!?;:、。，！？…「」『』()（）]+$/.test(tk)) return escapeHtml(tk);
    var clean = tk.replace(/[.,!?;:、。，！？…「」『』()（）]$/g, "");
    var isM = marked.indexOf(clean) !== -1;
    return '<span class="lg-art-word' + (isM ? " marked" : "") + '" onclick="lgArtWord(\'' + lgEscapeJs(clean) + '\')">' + escapeHtml(tk) + '</span>';
  }).join("");
  return '<div class="lg-card"><div class="lg-card-h">📰 ' + escapeHtml(art.title) + '</div>' +
    '<div class="lg-row" style="gap:8px;margin-bottom:10px">' +
      '<button class="lg-btn" onclick="lgSpeak(\'' + lgEscapeJs(art.content) + '\',\'' + cur + '\',' + (e.settings.rate || 0.9) + ')">🔊 朗读全文</button>' +
      '<button class="lg-btn ghost" onclick="lgSetRate(' + (e.settings.rate || 0.9) + ')">语速 ' + (e.settings.rate || 0.9) + 'x</button>' +
      (art.translation ? '<button class="lg-btn ghost' + (lgReadingShowTrans ? " on" : "") + '" onclick="lgReadingShowTrans=!lgReadingShowTrans;render()">🌐 翻译</button>' : '') +
      backHtml +
    '</div>' +
    '<div class="lg-art-text" style="font-size:' + lgFontSize() + 'px">' + txt + '</div>' +
    (lgReadingShowTrans && art.translation ? '<div class="lg-trans"><div class="lg-trans-h">🌐 译文</div>' + escapeHtml(art.translation) + '</div>' : '') +
    '<div class="lg-hint">👆 点击单词可朗读 / 加入单词；长按或选中文字可高亮批注。</div>' +
    (marked.length ? '<div class="lg-marked-list">📌 已标注 ' + marked.length + ' 词：' + marked.map(function (w) { return '<span class="lg-marked">' + escapeHtml(w) + '</span>'; }).join("") + '</div>' : '') +
    '</div>';
}
function lgRenderReading(cur) {
  var e = langGet(cur);
  var mats = e.materials || [];
  // 打开素材文章
  if (lgReadingId) {
    var art = null;
    for (var i = 0; i < mats.length; i++) if (mats[i].id === lgReadingId) { art = mats[i]; break; }
    if (art) return lgReadingArticleHtml(art, cur, e, '<button class="lg-btn ghost" onclick="lgReadingId=null;render()">← 返回列表</button>');
    lgReadingId = null;
  }
  // 打开每日推送文章
  if (lgReadingDaily) {
    lgReadingLoad(function () { render(); });
    var darts = (__lgReading && __lgReading.days && __lgReading.days[lgReadingDaily.date]) || [];
    var dart = darts[lgReadingDaily.idx];
    if (dart) {
      return lgReadingArticleHtml({ title: "📅 " + lgReadingDaily.date + " · " + dart.title, content: dart.content, translation: dart.translation, marks: [] }, cur, e,
        '<button class="lg-btn ghost" onclick="lgReadingDaily=null;render()">← 返回每日推送</button>');
    }
    lgReadingDaily = null;
  }
  // 每日推送（云端 10 篇，按北京时间切日）
  var dailyHtml = "";
  lgReadingLoad(function () { render(); });
  var bjd = lgBjToday();
  var todayArts = (__lgReading && __lgReading.days && __lgReading.days[bjd]) || [];
  dailyHtml = '<div class="lg-card"><div class="lg-card-h">📅 每日精读推送 <span class="lg-sub">' + (todayArts.length ? bjd + ' · ' + todayArts.length + ' 篇' : '每日 10 篇') + '</span>' + lgHistoryBtn("rd") + '</div>';
  if (todayArts.length) {
    dailyHtml += '<div class="lg-mat-list">' + todayArts.map(function (a, i) {
      return '<div class="lg-mat" onclick="lgOpenDailyArt(\'' + bjd + '\',' + i + ')">' +
        '<div class="lg-mat-tag">' + escapeHtml(a.level || "进阶") + '</div>' +
        '<div class="lg-mat-title">' + escapeHtml(a.title) + '</div>' +
        '<div class="lg-mat-meta">' + (a.content || "").length + ' 词 · 含中文翻译</div></div>';
    }).join("") + '</div>';
  } else {
    dailyHtml += '<div class="empty-state"><div class="empty-text">' +
      (__lgReading ? '今日精读尚未推送，每天北京时间 00:05 云端自动更新 10 篇。' : '正在加载每日推送…') +
      '</div></div>';
  }
  dailyHtml += '</div>';
  // 历史日历（每日推送记录）
  var rdMap = {};
  Object.keys(__lgReading && __lgReading.days || {}).forEach(function (d) { rdMap[d] = 1; });
  var rdSel = "";
  if (lgHist === "rd") {
    var s = lgCalState["rd"] || {};
    var sel = s.sel || lgBjToday();
    var selArts = (__lgReading && __lgReading.days && __lgReading.days[sel]) || [];
    rdSel = '<div class="aihot-archive-day"><div class="aihot-archive-day-h">📅 ' + sel + ' 精读推送</div>' +
      (selArts.length
        ? '<div class="lg-mat-list">' + selArts.map(function (a, i) {
            return '<div class="lg-mat" onclick="lgOpenDailyArt(\'' + sel + '\',' + i + ')">' +
              '<div class="lg-mat-tag">' + escapeHtml(a.level || "") + '</div>' +
              '<div class="lg-mat-title">' + escapeHtml(a.title) + '</div></div>';
          }).join("") + '</div>'
        : '<div class="brief-empty" style="margin:0">该日期没有精读推送</div>') +
      '</div>';
  }
  var histHtml = lgHist === "rd" ? lgCalHtml("rd", rdMap, rdSel, lgBjToday()) : "";

  // 素材列表 + 导入
  return dailyHtml + histHtml +
    '<div class="lg-card"><div class="lg-card-h">📰 我的精读素材 <span class="lg-sub">' + m1(cur) + ' · ' + mats.length + ' 篇</span></div>' +
    '<div class="lg-row" style="gap:8px">' +
      '<button class="lg-btn" onclick="lgAddMaterial()">＋ 粘贴导入文本</button>' +
      '<button class="lg-btn ghost" onclick="lgImportReading()">📚 内置精选（' + (LG_READINGS[cur] || []).length + ' 篇）</button>' +
    '</div>' +
    (mats.length === 0 ? '<div class="empty-state"><div class="empty-text">还没有精读素材，点「＋ 粘贴导入文本」添加一篇（支持网页抓取内容粘贴 / TXT）。</div></div>' :
      '<div class="lg-mat-list">' + mats.map(function (m) {
        return '<div class="lg-mat" onclick="lgReadingId=\'' + m.id + '\';render()">' +
          '<div class="lg-mat-title">' + escapeHtml(m.title) + '</div>' +
          '<div class="lg-mat-meta">' + formatDateShort(m.date) + ' · ' + (m.content || "").length + ' 字' + (m.translation ? ' · 含翻译' : '') + '</div></div>';
      }).join("") + '</div>') +
    '</div>';
}
function m1(cur) { return LG_META[cur].name; }
function lgTokenize(s) {
  var cur = langCur();
  if (cur === "en") return String(s || "").split(/(\s+)/);
  return String(s || "").split("");
}
function lgArtWord(term) {
  var cur = langCur();
  var e = langGet(cur);
  var has = false;
  for (var i = 0; i < e.words.length; i++) if (e.words[i].term === term) { has = true; break; }
  showModal(
    '<div class="modal-title">' + escapeHtml(term) + '</div>' +
    '<div class="lg-form" style="padding:0 16px">' +
      '<label class="lg-fld"><span>释义</span><input class="lg-input" id="lgw-mean" placeholder="输入中文释义…"></label>' +
      '<label class="lg-fld"><span>标签</span><input class="lg-input" id="lgw-tags" placeholder="精读,通勤"></label>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="lgArtAddWord(\'' + lgEscapeJs(term) + '\')">' + (has ? "✓ 已在词库" : "＋ 加入词库") + '</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="lgSpeak(\'' + lgEscapeJs(term) + '\',\'' + cur + '\')">🔊 朗读</button>' +
    '</div>'
  );
}
function lgArtAddWord(term) {
  var cur = langCur();
  var e = langGet(cur);
  var mean = (document.getElementById("lgw-mean") || {}).value || "";
  var tags = ((document.getElementById("lgw-tags") || {}).value || "").split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
  for (var i = 0; i < e.words.length; i++) if (e.words[i].term === term) { showToast("已在生词库中", "warning"); closeModal(); return; }
  var lw = lgLookupWord(cur, term);
  e.words.push({ id: lgUid(), term: term, reading: lw ? lw.reading : "", meaning: mean || (lw ? lw.meaning : ""), extra: "", example: lw ? lw.example : "", exampleCn: lw ? lw.exampleCn : "", tags: tags, level: 0, box: 0, next: today(), last: null, reps: 0, lapses: 0, from: "reading" });
  closeModal(); DB.save(); render();
  showToast("已加入词库 📖", "success");
}
function lgAddMaterial() {
  showModal(
    '<div class="modal-title">＋ 导入精读素材</div>' +
    '<div class="lg-form">' +
      '<label class="lg-fld"><span>标题</span><input class="lg-input" id="lgm-title" placeholder="文章标题"></label>' +
      '<label class="lg-fld"><span>正文（粘贴网页内容 / TXT）</span><textarea class="lg-input lg-textarea" id="lgm-content" placeholder="粘贴正文内容…"></textarea></label>' +
      '<label class="lg-fld"><span>翻译（可选）</span><textarea class="lg-input lg-textarea" id="lgm-trans" placeholder="对照译文…"></textarea></label>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="lgSaveMaterial()">💾 保存</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '</div>'
  );
}
function lgSaveMaterial() {
  function v(x) { var el = document.getElementById(x); return el ? el.value.trim() : ""; }
  var title = v("lgm-title") || "未命名文章";
  var content = v("lgm-content");
  if (!content) { showToast("请粘贴正文内容", "warning"); return; }
  var e = langGet(langCur());
  e.materials.push({ id: lgUid(), title: title, content: content, translation: v("lgm-trans"), date: new Date().toISOString(), marks: [] });
  closeModal(); DB.save(); render();
  showToast("素材已保存", "success");
}
/* 内置精选精读：一键添加（跳过已存在的标题） */
function lgImportReading() {
  var cur = langCur();
  var e = langGet(cur);
  var list = LG_READINGS[cur] || [];
  if (!list.length) { showToast("该语种暂无内置素材", "error"); return; }
  var n = 0, skip = 0;
  list.forEach(function (r) {
    var t = "[" + r.level + "] " + r.title;
    var has = false;
    for (var i = 0; i < e.materials.length; i++) if (e.materials[i].title === t) { has = true; break; }
    if (has) { skip++; return; }
    e.materials.push({ id: lgUid(), title: t, content: r.content, translation: r.translation, date: new Date().toISOString(), marks: [], builtin: true });
    n++;
  });
  DB.save(); render();
  showToast(n ? "已添加 " + n + " 篇内置精读（跳过 " + skip + "）" : "内置精读已全部添加过", n ? "success" : "warning");
}
/* 内置听力：一键添加（跳过已存在的标题） */
function lgImportListen() {
  var cur = langCur();
  var e = langGet(cur);
  var list = LG_LISTEN_BUILTIN[cur] || [];
  if (!list.length) { showToast("该语种暂无内置听力", "error"); return; }
  var n = 0, skip = 0;
  list.forEach(function (it) {
    var has = false;
    for (var i = 0; i < e.listening.length; i++) if (e.listening[i].title === it.title) { has = true; break; }
    if (has) { skip++; return; }
    e.listening.push({ id: lgUid(), title: it.title, sentences: it.sents.map(function (p) { return { t: p[0], tr: p[1] }; }), date: new Date().toISOString(), builtin: true });
    n++;
  });
  DB.save(); render();
  showToast(n ? "已添加 " + n + " 组内置听力（跳过 " + skip + "）" : "内置听力已全部添加过", n ? "success" : "warning");
}

/* =============================================================
 * 模块四：听力训练
 * ============================================================= */
var lgListenId = null;
function lgRenderListening(cur) {
  var e = langGet(cur);
  var list = e.listening || [];
  if (lgListenId) {
    var item = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === lgListenId) { item = list[i]; break; }
    if (item) {
      var sents = item.sentences || [];
      var rate = e.settings.rate || 0.9;
      var idx = lgListening && lgListening.id === item.id ? lgListening.idx : 0;
      return '<div class="lg-card"><div class="lg-card-h">🎧 ' + escapeHtml(item.title) + '</div>' +
        '<div class="lg-row" style="gap:8px;margin-bottom:10px">' +
          '<button class="lg-btn" onclick="lgListenPlay(\'' + item.id + '\')">▶ 播放</button>' +
          '<button class="lg-btn ghost" onclick="lgListenStop()">⏹ 停止</button>' +
          '<button class="lg-btn ghost" onclick="lgListenRate(' + Math.max(0.5, rate - 0.15) + ')">−</button>' +
          '<span class="lg-mini on" style="padding:4px 8px">' + rate + 'x</span>' +
          '<button class="lg-btn ghost" onclick="lgListenRate(' + Math.min(1.75, rate + 0.15) + ')">＋</button>' +
          '<button class="lg-btn ghost" onclick="lgListenId=null;render()">← 返回</button>' +
        '</div>' +
        '<div class="lg-listen-list">' + sents.map(function (s, i) {
          var active = lgListening && lgListening.id === item.id && lgListening.idx === i;
          return '<div class="lg-listen-sent' + (active ? " active" : "") + '">' +
            '<div class="lg-listen-t">' + (active ? "🔊 " : "") + escapeHtml(s.t) + '</div>' +
            (s.tr ? '<div class="lg-listen-tr">' + escapeHtml(s.tr) + '</div>' : '') +
            '<div class="lg-listen-ops">' +
              '<span onclick="lgListenOne(\'' + item.id + '\',' + i + ')">🔊</span>' +
              '<span onclick="lgListenWrong(\'' + lgEscapeJs(s.t) + '\')">❌ 听不懂</span>' +
              '<span onclick="lgListenFav(\'' + lgEscapeJs(s.t) + '\')">⭐ 收藏</span>' +
            '</div></div>';
        }).join("") + '</div>' +
        '<div class="lg-hint">💡 通勤/锁屏时可在播放后切到后台继续听（依赖浏览器音频支持）；「❌ 听不懂」自动收入错题集。</div>' +
        '</div>';
    }
    lgListenId = null;
  }
  return '<div class="lg-card"><div class="lg-card-h">🎧 听力训练 <span class="lg-sub">' + m1(cur) + ' · ' + list.length + ' 组</span>' + lgHistoryBtn("listen") + '</div>' +
    '<div class="lg-row" style="gap:8px">' +
      '<button class="lg-btn" onclick="lgAddListening()">＋ 添加听力素材</button>' +
      '<button class="lg-btn ghost" onclick="lgImportListen()">🎧 内置听力（' + (LG_LISTEN_BUILTIN[cur] || []).length + ' 组）</button>' +
    '</div>' +
    (cur === "en" ? '<div class="lg-row" style="gap:8px;margin-top:8px;flex-wrap:wrap">' +
      '<a class="lg-btn ghost" href="https://www.bbc.co.uk/learningenglish/english/features/6-minute-english" target="_blank" rel="noopener" style="text-decoration:none">🎙 BBC 6 Minute English（官方）↗</a>' +
      '<a class="lg-btn ghost" href="https://www.bbc.co.uk/sounds/series/p02nq0gn" target="_blank" rel="noopener" style="text-decoration:none">📻 BBC Sounds（直接收听）↗</a>' +
      '<a class="lg-btn ghost" href="https://zh.wikipedia.org/wiki/%E6%96%B0%E6%A6%82%E5%BF%B5%E8%8B%B1%E8%AF%AD" target="_blank" rel="noopener" style="text-decoration:none">📘 新概念英语（资源索引）↗</a>' +
    '</div>' : '') +
    (list.length === 0 ? '<div class="empty-state"><div class="empty-text">还没有听力素材。点「＋ 添加听力素材」粘贴一组对话（每行一句，可带翻译），也可从精读素材一键转听力。</div></div>' :
      '<div class="lg-mat-list">' + list.map(function (it) {
        return '<div class="lg-mat" onclick="lgListenId=\'' + it.id + '\';render()">' +
          '<div class="lg-mat-title">🎧 ' + escapeHtml(it.title) + '</div>' +
          '<div class="lg-mat-meta">' + (it.sentences || []).length + ' 句 · ' + formatDateShort(it.date) + '</div></div>';
      }).join("") + '</div>') +
    '</div>' +
    (lgHist === "listen" ? lgCalHtml("listen", lgActMap(cur, "听力"), lgActSelHtml(cur, "听力", "听力练习")) : "");
}
function lgAddListening() {
  showModal(
    '<div class="modal-title">＋ 添加听力素材</div>' +
    '<div class="lg-form">' +
      '<label class="lg-fld"><span>标题</span><input class="lg-input" id="lgl-title" placeholder="e.g. 咖啡店点单对话"></label>' +
      '<label class="lg-fld"><span>句子（每行一句）</span><textarea class="lg-input lg-textarea" id="lgl-sents" placeholder="Can I have a latte?\n大的拿铁可以吗？"></textarea></label>' +
      '<div class="lg-hint" style="margin:0 16px 10px">奇数行=原文，偶数行=中文翻译（可选），自动配对。</div>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="lgSaveListening()">💾 保存</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '</div>'
  );
}
function lgSaveListening() {
  function v(x) { var el = document.getElementById(x); return el ? el.value.trim() : ""; }
  var title = v("lgl-title") || "听力素材";
  var raw = v("lgl-sents");
  if (!raw) { showToast("请粘贴句子", "warning"); return; }
  var lines = raw.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  var sents = [];
  for (var i = 0; i < lines.length; i += 2) {
    sents.push({ t: lines[i], tr: lines[i + 1] || "" });
  }
  var e = langGet(langCur());
  e.listening.push({ id: lgUid(), title: title, sentences: sents, date: new Date().toISOString() });
  closeModal(); DB.save(); render();
  showToast("听力素材已保存", "success");
}
function lgListenOne(id, i) {
  var e = langGet(langCur());
  for (var k = 0; k < e.listening.length; k++) if (e.listening[k].id === id) {
    var s = e.listening[k].sentences[i];
    if (s) lgSpeak(s.t, langCur(), langGet(langCur()).settings.rate || 0.9);
    break;
  }
}
function lgListenPlay(id) {
  var cur = langCur();
  var e = langGet(cur);
  lgLogActivity("听力"); // 记录练习历史
  for (var k = 0; k < e.listening.length; k++) if (e.listening[k].id === id) {
    var sents = e.listening[k].sentences;
    var rate = e.settings.rate || 0.9;
    lgListening = { id: id, idx: 0, timer: null, rate: rate, loop: false };
    function play(i) {
      if (!lgListening || lgListening.id !== id) return;
      if (i >= sents.length) {
        if (lgListening.loop) { lgListening.idx = 0; play(0); return; }
        lgListening = null; render(); return;
      }
      lgListening.idx = i;
      render();
      var u = new SpeechSynthesisUtterance(sents[i].t);
      var v = lgPickVoice(cur); if (v) u.voice = v;
      u.lang = LG_META[cur].tts; u.rate = rate;
      u.onend = function () { setTimeout(function () { play(i + 1); }, 300); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
    window.speechSynthesis.cancel();
    play(0);
    break;
  }
}
function lgListenStop() { if (window.speechSynthesis) window.speechSynthesis.cancel(); lgListening = null; render(); }
function lgListenRate(r) {
  var e = langGet(langCur());
  e.settings.rate = Math.round(r * 100) / 100;
  DB.save();
  if (lgListening) lgListenPlay(lgListening.id);
  else render();
}
function lgListenWrong(t) { lgWrong(langCur(), "听力", t); }
function lgListenFav(t) {
  var e = langGet(langCur());
  if (e.favorites.indexOf(t) === -1) e.favorites.push(t);
  DB.save(); showToast("已收藏 ⭐", "success");
}

/* =============================================================
 * 模块五：AI 口语练习（影子跟读 + 语音识别比对 + 纠错报告）
 * ============================================================= */
var lgScene = "order";
function lgRenderSpeaking(cur) {
  var m = LG_META[cur];
  var scenes = LG_SCENES[cur] || {};
  var scene = scenes[lgScene] || scenes[LG_SCENE_KEYS[0]];
  var e = langGet(cur);
  var rate = e.settings.rate || 0.9;
  var hasRec = typeof window.SpeechRecognition !== "undefined" || typeof window.webkitSpeechRecognition !== "undefined";
  var h = '<div class="lg-card"><div class="lg-card-h">🗣 AI 口语练习 <span class="lg-sub">' + m.name + ' · 影子跟读 · 无压力开口</span>' + lgHistoryBtn("speak") + '</div>' +
    '<div class="lg-scene-row">' + (LG_SCENE_KEYS.length ? LG_SCENE_KEYS.map(function (k) {
      var s = scenes[k];
      return '<button class="lg-scene' + (lgScene === k ? " on" : "") + '" onclick="lgScene=\'' + k + '\';render()">' + s.t + '</button>';
    }).join("") : '') + '</div>' +
    (!hasRec ? '<div class="lg-hint" style="color:var(--accent-orange)">⚠ 当前浏览器不支持语音识别，请使用 Chrome/Edge 开启麦克风「跟读评测」；其他浏览器仍可「听原声 → 自己跟读 → 点显示参考」。</div>' : '') +
    '<div class="lg-scene-list">' + scene.list.map(function (pair, i) {
      return '<div class="lg-scene-item">' +
        '<div class="lg-scene-t" onclick="lgSpeak(\'' + lgEscapeJs(pair[0]) + '\',\'' + cur + '\',' + rate + ')">🔊 ' + escapeHtml(pair[0]) + '</div>' +
        '<div class="lg-scene-tr">' + escapeHtml(pair[1]) + '</div>' +
        '<div class="lg-scene-ops">' +
          '<button class="lg-btn mini2" onclick="lgSpeak(\'' + lgEscapeJs(pair[0]) + '\',\'' + cur + '\',' + rate + ')">🔊 原声</button>' +
          (lgRec && lgRec.idx === i && lgRec.recording
            ? '<button class="lg-btn mini2" style="background:var(--accent-red);color:#fff" onclick="lgRecStop()">⏹ 结束录音</button>'
            : '<button class="lg-btn mini2" onclick="lgRecToggle(' + i + ')">🎤 开始录音评测</button>') +
          '<button class="lg-btn mini2 ghost" onclick="lgSpeak(\'' + lgEscapeJs(pair[0]) + '\',\'' + cur + '\',' + Math.max(0.5, rate - 0.3) + ')">🐢 慢速</button>' +
        '</div>' +
        (lgRec && lgRec.idx === i ? '<div class="lg-rec-box">' +
          (lgRec.recording ? '<div class="lg-hint" style="color:var(--accent-red)">🔴 录音中… 先听原声，再对着麦克风朗读这句话，读完点「⏹ 结束录音」</div>' +
            '<div class="lg-btn-row" style="justify-content:flex-start;margin-top:4px"><button class="lg-btn mini2 ghost" onclick="lgRecReplay()">🔊 再听一遍原声</button></div>' : '') +
          (lgRec.blobUrl ? '<audio controls src="' + lgRec.blobUrl + '" style="width:100%;height:34px;margin:6px 0"></audio>' : '') +
          (lgRec.result ? '<div class="lg-rec-result">' +
            '<div class="lg-rec-score">' + lgRec.score + ' 分</div>' +
            '<div class="lg-rec-yours">你说：' + escapeHtml(lgRec.result) + '</div>' +
            '<div class="lg-rec-diff">' + lgRec.diff + '</div>' +
            (lgRec.tip ? '<div class="lg-rec-tip">💡 ' + escapeHtml(lgRec.tip) + '</div>' : '') +
          '</div>' : '') +
        '</div>' : '') +
        '</div>';
    }).join("") + '</div>' +
    '<div class="lg-hint">💡 点「🎤 开始录音评测」→ 听原声 → 朗读 → 点「⏹ 结束录音」→ 看评分与差异标红，还能回放自己的录音对比；连续 3 次 &lt;70 分自动计入口语错题。</div></div>';
  if (e.favorites.length) {
    h += '<div class="lg-card"><div class="lg-card-h">⭐ 我的收藏 <span class="lg-sub">' + e.favorites.length + ' 条</span></div>' +
      '<div class="lg-fav-list">' + e.favorites.slice(-10).reverse().map(function (f) {
        return '<div class="lg-fav" onclick="lgSpeak(\'' + lgEscapeJs(f) + '\',\'' + cur + '\',' + rate + ')">🔊 ' + escapeHtml(f) + '</div>';
      }).join("") + '</div></div>';
  }
  h += (lgHist === "speak" ? lgCalHtml("speak", lgActMap(cur, "口语"), lgActSelHtml(cur, "口语", "口语练习")) : "");
  return h;
}
/* 口语跟读：点「开始录音」→ 录音 + 识别并行；点「结束录音」→ 停止 → 打分 + 回放自己的录音 */
function lgRecToggle(idx) {
  if (lgRec && lgRec.idx === idx && lgRec.recording) { lgRecStop(); return; }
  lgLogActivity("口语"); // 记录练习历史
  var cur = langCur();
  var scenes = LG_SCENES[cur] || {};
  var scene = scenes[lgScene] || scenes[LG_SCENE_KEYS[0]];
  var target = (scene.list[idx] || [])[0];
  if (!target) return;
  // 清理上一次的录音 URL
  if (lgRec && lgRec.blobUrl) { try { URL.revokeObjectURL(lgRec.blobUrl); } catch (e) {} }
  lgRec = { idx: idx, recording: true, target: target, srStarted: false, srRetry: 0, chunks: [], blobUrl: null, mediaRec: null, stream: null, sr: null, result: null, score: 0, diff: "", tip: "", failStreak: (lgRec && lgRec.failStreak) || 0 };
  render();
  // MediaRecorder：录下自己的声音，供结束后回放
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== "undefined") {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (!lgRec || !lgRec.recording) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      lgRec.stream = stream;
      try {
        var mr = new MediaRecorder(stream);
        lgRec.mediaRec = mr;
        mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) lgRec.chunks.push(ev.data); };
        mr.onstop = function () {
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          if (lgRec && lgRec.chunks.length) {
            var blob = new Blob(lgRec.chunks, { type: "audio/webm" });
            lgRec.blobUrl = URL.createObjectURL(blob);
            if (!lgRec.recording) render();
          }
        };
        mr.start();
      } catch (e) { lgRec.mediaRec = null; }
    }).catch(function () { /* 未授权麦克风：仅评测不可回放 */ });
  }
  // 先播一遍原声，播完再启动识别（避免 TTS 播放与麦克风识别冲突导致频繁失败）
  if (window.speechSynthesis) {
    var u = new SpeechSynthesisUtterance(target);
    var v = lgPickVoice(cur); if (v) u.voice = v;
    u.lang = LG_META[cur].tts;
    u.rate = langGet(cur).settings.rate || 0.9;
    u.onend = function () { lgRecStartSR(); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } else {
    setTimeout(lgRecStartSR, 600);
  }
}
function lgRecStartSR() {
  if (!lgRec || !lgRec.recording || lgRec.srStarted) return;
  var cur = langCur();
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    lgRec.result = "（当前浏览器不支持语音识别，仅可录音回放）";
    lgRec.diff = "参考：" + escapeHtml(lgRec.target);
    render();
    return;
  }
  try {
    var rec = new SR();
    rec.lang = LG_META[cur].tts;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    lgRec.srStarted = true;
    lgRec.sr = rec;
    rec.onresult = function (ev) {
      if (!lgRec) return;
      var heard = ev.results[0][0].transcript || "";
      lgRec.result = heard;
      var sim = lgSimilarity(heard, lgRec.target);
      lgRec.score = sim;
      lgRec.diff = lgDiffHtml(heard, lgRec.target);
      lgRec.tip = sim >= 85 ? "发音很标准，继续保持 🎉" : sim >= 70 ? "整体不错，注意重音与语调。" : (cur === "en" ? "注意连读与重音。" : cur === "ja" ? "注意音调与敬体结尾。" : "注意收音音变与敬语语体。");
      if (sim < 70) { lgRec.failStreak++; lgWrong(cur, "口语", lgRec.target); }
      else lgRec.failStreak = 0;
      DB.save();
      if (!lgRec.recording) render();
    };
    rec.onerror = function (ev) {
      if (!lgRec) return;
      var code = ev && ev.error;
      if (code === "aborted") return;                       // 主动停止，忽略
      if (code === "not-allowed" || code === "service-not-allowed") {
        lgRec.result = "（麦克风未授权：请在浏览器地址栏允许使用麦克风后重试）";
        lgRec.diff = "参考：" + escapeHtml(lgRec.target);
        render();
        return;
      }
      // no-speech / network / 其它：录音未结束时自动重试识别，最多 3 次
      if (code === "no-speech" && lgRec.recording && lgRec.srRetry < 3) {
        lgRec.srRetry++;
        setTimeout(lgRecRetrySR, 400);
        return;
      }
      if (!lgRec.result) { lgRec.result = "（识别失败" + (code ? "：" + code : "") + "，可点「再听一遍」后重试）"; lgRec.diff = "参考：" + escapeHtml(lgRec.target); }
      if (!lgRec.recording) render();
    };
    rec.onend = function () {
      // 识别意外静默结束：录音仍在进行且尚无结果 → 自动重启一次
      if (lgRec && lgRec.recording && !lgRec.result && lgRec.srRetry < 3) {
        lgRec.srRetry++;
        setTimeout(lgRecRetrySR, 400);
      }
    };
    setTimeout(function () { try { rec.start(); } catch (e) { if (lgRec && lgRec.recording) setTimeout(lgRecRetrySR, 500); } }, 300);
  } catch (e) { if (lgRec && lgRec.recording) setTimeout(lgRecRetrySR, 500); }
}
function lgRecRetrySR() {
  if (!lgRec || !lgRec.recording) return;
  lgRec.srStarted = false;
  lgRecStartSR();
}
function lgRecReplay() {   // 录音中再听一遍原声
  if (!lgRec || !lgRec.target) return;
  lgSpeak(lgRec.target, langCur(), langGet(langCur()).settings.rate || 0.9);
}
function lgRecStop() {
  if (!lgRec) return;
  lgRec.recording = false;
  if (lgRec.sr) { try { lgRec.sr.stop(); } catch (e) {} }
  if (lgRec.mediaRec && lgRec.mediaRec.state !== "inactive") { try { lgRec.mediaRec.stop(); } catch (e) {} }
  setTimeout(function () {
    if (lgRec && !lgRec.result) {
      lgRec.result = "（未识别到有效语音，可再试一次）";
      lgRec.diff = "参考：" + escapeHtml(lgRec.target);
      render();
    } else if (lgRec) { render(); }
  }, 700);
}
/* 相似度：逐字符 LCS 比例 */
function lgSimilarity(a, b) {
  a = String(a || "").toLowerCase().trim(); b = String(b || "").toLowerCase().trim();
  if (!a || !b) return 0;
  var m = a.length, n = b.length;
  var dp = [];
  for (var i = 0; i <= m; i++) { dp[i] = []; for (var j = 0; j <= n; j++) dp[i][j] = 0; }
  for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  var lcs = dp[m][n];
  return Math.round(lcs / Math.max(m, n) * 100);
}
/* 差异高亮：逐词比对 */
function lgDiffHtml(heard, target) {
  var hs = String(heard || "").split(/\s+/).filter(Boolean);
  var ts = String(target || "").split(/\s+/).filter(Boolean);
  var h = "";
  ts.forEach(function (tw) {
    var hit = false;
    for (var i = 0; i < hs.length; i++) if (hs[i].toLowerCase() === tw.toLowerCase()) { hit = true; hs.splice(i, 1); break; }
    h += hit ? '<span class="lg-diff-ok">' + escapeHtml(tw) + '</span> ' : '<span class="lg-diff-bad">' + escapeHtml(tw) + '</span> ';
  });
  return h;
}

/* =============================================================
 * 模块六：写作 & 一体化笔记中心
 * ============================================================= */
function lgRenderNotes(cur) {
  var e = langGet(cur);
  var notes = e.notes || [];
  var q = lgNoteSearch.trim().toLowerCase();
  var matched = notes.filter(function (n) {
    if (!q) return true;
    return (n.title + " " + n.content + " " + (n.tags || []).join(" ")).toLowerCase().indexOf(q) !== -1;
  });
  var h = '<div class="lg-card"><div class="lg-card-h">✍️ 写作 & 笔记中心 <span class="lg-sub">' + m1(cur) + '</span>' + lgHistoryBtn("note") + '</div>' +
    '<div class="lg-row" style="gap:8px">' +
      '<button class="lg-btn" onclick="lgWritingTool()">🖊 短句批改</button>' +
      '<button class="lg-btn ghost" onclick="lgNoteForm()">＋ 笔记</button>' +
      '<input class="lg-input" style="flex:1;min-width:90px" placeholder="🔍 全局检索：生词/笔记/素材/听力…" value="' + escapeHtml(lgNoteSearch) + '" oninput="lgNoteSearch=this.value;lgSearchNow()">' +
    '</div>' +
    '<div class="lg-confuse-block"><div class="lg-confuse-h">🧩 易混词对比</div>' +
      '<div class="lg-confuse-list">' + (LG_CONFUSE[cur] || []).map(function (x) {
        return '<div class="lg-confuse-item"><b>' + escapeHtml(x[0]) + '</b> / <b>' + escapeHtml(x[1]) + '</b>：' + escapeHtml(x[2]) + '</div>';
      }).join("") + '</div></div>' +
    (lgNoteSearch ? lgGlobalSearch(cur, q) : '') +
    (e.wrongList.length ? '<div class="lg-wrong-block"><div class="lg-confuse-h">📋 错题归档（' + e.wrongList.length + '）</div>' +
      '<div class="lg-wrong-list">' + e.wrongList.slice(-12).reverse().map(function (w) {
        return '<div class="lg-wrong-item"><span class="lg-wrong-type">' + escapeHtml(w.type) + '</span><span>' + escapeHtml(w.term || "") + '</span><span class="lg-wrong-date">' + formatDateShort(w.date) + '</span></div>';
      }).join("") + '</div></div>' : '') +
    '</div>';
  if (!matched.length && !lgNoteSearch) {
    h += '<div class="empty-state"><div class="empty-text">还没有笔记。用「🖊 短句批改」练两句，或点「＋ 笔记」记下易混词、语法要点、好句素材。</div></div>';
  } else if (matched.length) {
    h += '<div class="lg-note-list">' + matched.map(function (n) {
      return '<div class="lg-note">' +
        '<div class="lg-note-head"><span class="lg-note-title" onclick="lgNoteView(\'' + n.id + '\')">' + escapeHtml(n.title) + '</span>' +
          '<span class="lg-note-ops"><span onclick="lgNoteEdit(\'' + n.id + '\')">✏️</span><span onclick="lgNoteDel(\'' + n.id + '\')">🗑</span></span></div>' +
        '<div class="lg-note-body">' + escapeHtml((n.content || "").slice(0, 80)) + '</div>' +
        '<div class="lg-note-meta">' + formatDateShort(n.date) + (n.tags && n.tags.length ? ' · ' + n.tags.map(function (t) { return '<span class="lg-mini-tag">' + escapeHtml(t) + '</span>'; }).join("") : '') + '</div></div>';
    }).join("") + '</div>';
  }
  // 笔记历史日历：按笔记日期打点
  var ntMap = {};
  notes.forEach(function (n) {
    var d = String(n.date || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) ntMap[d] = 1;
  });
  var ntSel = "";
  if (lgHist === "note") {
    var ns = lgCalState["note"] || {};
    var sel = ns.sel || today();
    var dayNotes = notes.filter(function (n) { return String(n.date || "").slice(0, 10) === sel; });
    ntSel = '<div class="aihot-archive-day"><div class="aihot-archive-day-h">📅 ' + sel + ' 笔记</div>' +
      (dayNotes.length
        ? '<div class="lg-note-list">' + dayNotes.map(function (n) {
            return '<div class="lg-note"><div class="lg-note-head"><span class="lg-note-title" onclick="lgNoteView(\'' + n.id + '\')">' + escapeHtml(n.title) + '</span></div>' +
              '<div class="lg-note-body">' + escapeHtml((n.content || "").slice(0, 60)) + '</div></div>';
          }).join("") + '</div>'
        : '<div class="brief-empty" style="margin:0">该日期没有笔记</div>') + '</div>';
  }
  h += (lgHist === "note" ? lgCalHtml("note", ntMap, ntSel) : "");
  return h;
}
/* 全局跨模块检索 */
function lgGlobalSearch(cur, q) {
  if (!q) return "";
  var e = langGet(cur);
  var out = [];
  e.words.forEach(function (w) { if ((w.term + " " + (w.meaning || "")).toLowerCase().indexOf(q) !== -1) out.push("📖 生词：" + w.term + " — " + (w.meaning || "")); });
  e.materials.forEach(function (m) { if ((m.title + " " + (m.content || "")).toLowerCase().indexOf(q) !== -1) out.push("📰 精读：" + m.title); });
  e.listening.forEach(function (l) { (l.sentences || []).forEach(function (s) { if ((s.t + " " + (s.tr || "")).toLowerCase().indexOf(q) !== -1) out.push("🎧 听力：" + s.t); }); });
  if (!out.length) return '<div class="lg-hint">🔍 全局检索无结果</div>';
  return '<div class="lg-global-res"><div class="lg-confuse-h">🔍 全局检索（' + out.length + '）</div>' + out.slice(0, 12).map(function (x) { return '<div class="lg-gres">' + x + '</div>'; }).join("") + '</div>';
}
/* 短句批改（轻量规则版：口语版 / 正式礼貌版改写建议） */
function lgWritingTool() {
  showModal(
    '<div class="modal-title">🖊 短句批改 · 口语版 / 正式版</div>' +
    '<div class="lg-form">' +
      '<label class="lg-fld"><span>输入一句（' + m1(langCur()) + '）</span><input class="lg-input" id="lgw-sent" placeholder="' + (langCur() === "en" ? "e.g. i wanna go home" : langCur() === "ja" ? "例：いまからうちへかえる" : "예: 지금 집에 가고 싶어") + '"></label>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="lgWritingJudge()">🔍 批改</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '</div>'
  );
}
function lgWritingJudge() {
  var cur = langCur();
  var el = document.getElementById("lgw-sent");
  var sent = el ? el.value.trim() : "";
  if (!sent) { showToast("请输入句子", "warning"); return; }
  var words = sent.split(/\s+/).filter(Boolean).length;
  var score = 80;
  var tips = [];
  if (words < 3) { score -= 15; tips.push("句子太短，补充主谓宾信息"); }
  if (sent !== sent.replace(/^[a-z]/, function (x) { return x.toUpperCase(); }) && cur === "en") { score -= 8; tips.push("英语句首字母建议大写"); }
  if (/(\b(i|i'm|wanna|gonna|u|ur|thx|pls)\b)/i.test(sent) && cur === "en") { score -= 10; tips.push("检测到口语缩写（wanna/gonna/u），正式场合建议展开"); }
  if (/[.。!！?？]$/.test(sent) === false) { score -= 5; tips.push("句末建议加标点"); }
  if (/!{2,}|\.{2,}/.test(sent)) { score -= 5; tips.push("避免连续感叹号/省略号"); }
  var formal = lgFormalize(cur, sent);
  closeModal();
  showModal(
    '<div class="modal-title">🖊 批改结果 · ' + score + ' 分</div>' +
    '<div class="lg-form" style="padding:0 16px">' +
      '<div class="lg-judge"><div class="lg-judge-s">' + escapeHtml(sent) + '</div>' +
      (tips.length ? '<div class="lg-judge-tips">' + tips.map(function (t) { return '<div>• ' + t + '</div>'; }).join("") + '</div>' : '<div class="lg-hint">没有明显问题 👍</div>') +
      (formal ? '<div class="lg-judge-formal"><b>💼 正式礼貌版：</b>' + escapeHtml(formal) + '</div>' : '') +
      '</div>' +
      '<div class="lg-hint">批改结果不会自动保存，可截图或复制。</div>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">完成</button>' +
    '</div>'
  );
}
function lgFormalize(cur, s) {
  if (cur !== "en") return "";
  var out = s
    .replace(/\bi wanna\b/gi, "I would like to")
    .replace(/\bi'm gonna\b/gi, "I am going to")
    .replace(/\bu\b/gi, "you")
    .replace(/\bthx\b/gi, "thank you")
    .replace(/\bpls\b/gi, "please")
    .replace(/\bgonna\b/gi, "going to")
    .replace(/\bwanna\b/gi, "want to");
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.!?]$/.test(out)) out += ".";
  return out !== s ? out : "";
}
/* 笔记 CRUD */
function lgNoteForm(id) {
  var e = langGet(langCur());
  var n = null;
  if (id) { for (var i = 0; i < e.notes.length; i++) if (e.notes[i].id === id) { n = e.notes[i]; break; } }
  var t = n ? n.title : "", c = n ? n.content : "", tg = n ? (n.tags || []).join(",") : "";
  showModal(
    '<div class="modal-title">' + (id ? "✏️ 编辑笔记" : "＋ 新建笔记") + '</div>' +
    '<div class="lg-form">' +
      '<label class="lg-fld"><span>标题</span><input class="lg-input" id="lgn-title" value="' + escapeHtml(t) + '"></label>' +
      '<label class="lg-fld"><span>内容（语法/易混词/好句素材…）</span><textarea class="lg-input lg-textarea" id="lgn-body">' + escapeHtml(c) + '</textarea></label>' +
      '<label class="lg-fld"><span>标签</span><input class="lg-input" id="lgn-tags" value="' + escapeHtml(tg) + '" placeholder="语法,易混词"></label>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="lgNoteSave(\'' + (id || "") + '\')">💾 保存</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '</div>'
  );
}
function lgNoteSave(id) {
  function v(x) { var el = document.getElementById(x); return el ? el.value.trim() : ""; }
  var title = v("lgn-title") || "未命名笔记";
  var body = v("lgn-body");
  var e = langGet(langCur());
  var tags = v("lgn-tags").split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (id) {
    for (var i = 0; i < e.notes.length; i++) if (e.notes[i].id === id) { e.notes[i] = { id: id, title: title, content: body, tags: tags, date: e.notes[i].date }; break; }
    showToast("已保存", "success");
  } else {
    e.notes.push({ id: lgUid(), title: title, content: body, tags: tags, date: new Date().toISOString() });
    lgLogActivity("写作"); // 记录笔记历史
    showToast("笔记已保存", "success");
  }
  closeModal(); DB.save(); render();
}
function lgNoteEdit(id) { lgNoteForm(id); }
function lgNoteDel(id) {
  if (!confirm("删除该笔记？")) return;
  var e = langGet(langCur());
  e.notes = e.notes.filter(function (n) { return n.id !== id; });
  DB.save(); render();
}
function lgNoteView(id) {
  var e = langGet(langCur());
  for (var i = 0; i < e.notes.length; i++) if (e.notes[i].id === id) {
    var n = e.notes[i];
    showModal('<div class="modal-title">' + escapeHtml(n.title) + '</div>' +
      '<div style="padding:12px 16px;font-size:14px;line-height:1.8;white-space:pre-wrap;max-height:55vh;overflow-y:auto">' + escapeHtml(n.content || "") + '</div>' +
      '<div style="padding:0 16px 16px">' + (n.tags || []).map(function (t) { return '<span class="lg-mini-tag">' + escapeHtml(t) + '</span>'; }).join("") + '</div>');
    return;
  }
}

/* =============================================================
 * 模块七：学习计划中心
 * ============================================================= */
var LG_PLAN_TEMPLATES = {
  commute: { name: "🚇 通勤碎片版", desc: "约 15 分钟 · 碎片时间", tasks: ["新词 5 个（速刷）", "听力跟读 2 句", "复习今日待复习词"] },
  evening: { name: "🌙 晚间短时精进版", desc: "约 30 分钟 · 系统精进", tasks: ["精读 1 篇（划词）", "短句批改 3 句", "笔记 1 条", "复习生词"] },
  rush: { name: "⚡ 场景应急突击版", desc: "约 10 分钟 · 应急开口", tasks: ["口语情景 1 个（跟读）", "场景词包 8 词", "听力 1 组循环"] }
};
function lgRenderPlan(cur) {
  var e = langGet(cur);
  var p = e.plan;
  var todayTasks = p.days[today()];
  var tmpl = LG_PLAN_TEMPLATES[p.template] || LG_PLAN_TEMPLATES.commute;
  var doneCount = todayTasks ? todayTasks.filter(function (t) { return t.done; }).length : 0;
  var total = todayTasks ? todayTasks.length : tmpl.tasks.length;
  var h = '<div class="lg-card"><div class="lg-card-h">🗓 学习计划中心 <span class="lg-sub">' + m1(cur) + ' · 低压力 · 可顺延</span>' + lgHistoryBtn("pl") + '</div>' +
    '<div class="lg-plan-tmpl">' + Object.keys(LG_PLAN_TEMPLATES).map(function (k) {
      var t = LG_PLAN_TEMPLATES[k];
      return '<div class="lg-tmpl' + (p.template === k ? " on" : "") + '" onclick="lgSetPlanTemplate(\'' + k + '\')">' +
        '<div class="lg-tmpl-name">' + t.name + '</div><div class="lg-tmpl-desc">' + t.desc + '</div></div>';
    }).join("") + '</div>' +
    '<div class="lg-row" style="gap:8px;margin:10px 0">' +
      '<span class="lg-hint" style="margin:0">每日新词量：</span>' +
      [3, 5, 8, 10, 15].map(function (n) { return '<button class="lg-mini' + (p.daily === n ? " on" : "") + '" onclick="lgSetPlanDaily(' + n + ')">' + n + '</button>'; }).join("") +
    '</div>' +
    '<div class="lg-plan-head">📌 今日任务（' + doneCount + '/' + total + '）' +
      '<button class="lg-btn mini2 ghost" onclick="lgDeferToday()">↪ 一键顺延到明天</button></div>' +
    '<div class="lg-plan-list">' + (todayTasks || tmpl.tasks.map(function (t) { return { t: t, done: false }; })).map(function (task, i) {
      return '<div class="lg-plan-item' + (task.done ? " done" : "") + '" onclick="lgPlanToggle(' + i + ')">' +
        '<span class="lg-plan-check">' + (task.done ? "✅" : "⬜") + '</span>' +
        '<span class="lg-plan-t">' + escapeHtml(task.t) + '</span></div>';
    }).join("") + '</div>' +
    '<div class="lg-hint">💡 加班/没时间？点「一键顺延」，今日未完成自动并入明天，绝不强制打卡。</div></div>';
  // 历史日历：有计划的日期
  var plMap = {}; Object.keys(p.days || {}).forEach(function (d) { plMap[d] = 1; });
  var plSel = "";
  if (lgHist === "pl") {
    var ps = lgCalState["pl"] || {};
    var sel = ps.sel || today();
    var tasks = p.days[sel] || [];
    var dc = tasks.filter(function (t) { return t.done; }).length;
    plSel = '<div class="aihot-archive-day"><div class="aihot-archive-day-h">📅 ' + sel + ' 学习计划</div>' +
      (tasks.length
        ? '<div class="lg-hint" style="margin-bottom:8px">完成 ' + dc + '/' + tasks.length + '</div><div class="lg-plan-list">' +
          tasks.map(function (task, i) { return '<div class="lg-plan-item' + (task.done ? " done" : "") + '"><span class="lg-plan-check">' + (task.done ? "✅" : "⬜") + '</span><span class="lg-plan-t">' + escapeHtml(task.t) + '</span></div>'; }).join("") + '</div>'
        : '<div class="brief-empty" style="margin:0">该日期没有计划记录</div>') + '</div>';
  }
  h += (lgHist === "pl" ? lgCalHtml("pl", plMap, plSel) : "");
  return h;
}
function lgSetPlanTemplate(k) { var e = langGet(langCur()); e.plan.template = k; if (!e.plan.days[today()]) e.plan.days[today()] = LG_PLAN_TEMPLATES[k].tasks.map(function (t) { return { t: t, done: false }; }); DB.save(); render(); }
function lgSetPlanDaily(n) { var e = langGet(langCur()); e.plan.daily = n; DB.save(); render(); }
function lgPlanToggle(i) {
  var cur = langCur();
  var e = langGet(cur);
  if (!e.plan.days[today()]) e.plan.days[today()] = LG_PLAN_TEMPLATES[e.plan.template].tasks.map(function (t) { return { t: t, done: false }; });
  var list = e.plan.days[today()];
  if (list[i]) list[i].done = !list[i].done;
  if (list.every(function (t) { return t.done; })) lgAddStudy(cur, 5 * 60);
  DB.save(); render();
}
function lgDeferToday() {
  var cur = langCur();
  var e = langGet(cur);
  var tom = lgAddDays(today(), 1);
  var undone = (e.plan.days[today()] || []).filter(function (t) { return !t.done; });
  if (!undone.length) { showToast("今天没有未完成任务 🎉", "success"); return; }
  if (!e.plan.days[tom]) e.plan.days[tom] = [];
  undone.forEach(function (t) { e.plan.days[tom].push({ t: t.t, done: false }); });
  e.plan.days[today()] = e.plan.days[today()].map(function (t) { return { t: t.t, done: true }; });
  DB.save(); render();
  showToast("已顺延 " + undone.length + " 项到明天", "success");
}

/* =============================================================
 * 模块八：数据可视化复盘面板
 * ============================================================= */
function lgRenderStats(cur) {
  var m = LG_META[cur];
  var e = langGet(cur);
  var dist = lgLevelDist(cur);
  var total = dist[0] + dist[1] + dist[2];
  var mastery = total ? Math.round(dist[2] / total * 100) : 0;
  var days = Object.keys(e.stats.studyLog);
  var totalSec = 0; days.forEach(function (d) { totalSec += (e.stats.studyLog[d].seconds || 0); });
  var wts = Object.keys(e.stats.wrongTypes || {});
  var h = '<div class="lg-card"><div class="lg-card-h">📊 数据复盘 <span class="lg-sub">' + m.name + ' · 贴合你的数据分析习惯</span>' + lgHistoryBtn("st") + '</div>' +
    '<div class="lg-stat-row">' +
      '<div class="lg-stat"><div class="lg-stat-v">' + Math.round(totalSec / 60) + 'm</div><div class="lg-stat-l">累计时长</div></div>' +
      '<div class="lg-stat"><div class="lg-stat-v">' + days.length + '</div><div class="lg-stat-l">学习天数</div></div>' +
      '<div class="lg-stat"><div class="lg-stat-v">' + total + '</div><div class="lg-stat-l">生词总数</div></div>' +
      '<div class="lg-stat"><div class="lg-stat-v">' + mastery + '%</div><div class="lg-stat-l">掌握率</div></div>' +
    '</div></div>' +
    '<div class="lg-card"><div class="lg-card-h">📈 近 ' + lgStatsDays + ' 天学习时长（分钟）</div><div class="lg-bar-chart" id="lg-bar-chart"></div></div>' +
    '<div class="lg-card"><div class="lg-card-h">🎯 熟练度分布</div><div class="lg-donut-row">' +
      '<svg class="lg-donut" viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#e5e7eb" stroke-width="6"></circle>' +
      '<circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#3b82f6" stroke-width="6" stroke-dasharray="' + (dist[2] / Math.max(1, total) * 100) + ' 100" stroke-dashoffset="25"></circle></svg>' +
      '<div class="lg-legend">' +
        '<div class="lg-leg"><span class="lg-dot" style="background:#3b82f6"></span>熟悉 ' + dist[2] + '</div>' +
        '<div class="lg-leg"><span class="lg-dot" style="background:#f59e0b"></span>模糊 ' + dist[1] + '</div>' +
        '<div class="lg-leg"><span class="lg-dot" style="background:#ef4444"></span>不会 ' + dist[0] + '</div>' +
      '</div></div></div>' +
    '<div class="lg-card"><div class="lg-card-h">⚠️ 高频错误类型</div>' +
      (wts.length ? '<div class="lg-wt-list">' + wts.sort(function (a, b) { return e.stats.wrongTypes[b] - e.stats.wrongTypes[a]; }).map(function (t) {
        var max = e.stats.wrongTypes[wts[0]];
        var pct = Math.round(e.stats.wrongTypes[t] / max * 100);
        return '<div class="lg-wt-row"><span class="lg-wt-name">' + escapeHtml(t) + '</span><div class="lg-wt-bar"><div style="width:' + pct + '%"></div></div><span class="lg-wt-num">' + e.stats.wrongTypes[t] + '</span></div>';
      }).join("") + '</div>' : '<div class="lg-hint">还没有错误记录，练习后这里会出现薄弱项分析。</div>') +
    '</div>' +
    (wts.length ? '<div class="lg-card"><div class="lg-card-h">🧠 薄弱项定向推送</div><div class="lg-weak">最近「' + escapeHtml(wts[0]) + '」是最大薄弱点，点击前往针对性练习：</div>' +
      '<div class="lg-quick-grid">' +
        '<div class="lg-quick" onclick="lgSetTab(\'listening\')">🎧 练听力</div>' +
        '<div class="lg-quick" onclick="lgSetTab(\'speaking\')">🗣 练口语</div>' +
        '<div class="lg-quick" onclick="lgSetTab(\'words\')">📖 复习生词</div>' +
      '</div></div>' : '') +
    '';
  // 学习历史日历：有学习记录的日期（点击查看当日时长）
  var stMap = {}; Object.keys(e.stats.studyLog || {}).forEach(function (d) { stMap[d] = 1; });
  var stSel = "";
  if (lgHist === "st") {
    var ss = lgCalState["st"] || {};
    var sel = ss.sel || today();
    var rec = e.stats.studyLog[sel] || {};
    var sec = rec.seconds || 0;
    stSel = '<div class="aihot-archive-day"><div class="aihot-archive-day-h">📅 ' + sel + ' 学习记录</div>' +
      (sec > 0
        ? '<div class="lg-stat-row"><div class="lg-stat"><div class="lg-stat-v">' + Math.round(sec / 60) + 'm</div><div class="lg-stat-l">当日学习时长</div></div>' +
          '<div class="lg-stat"><div class="lg-stat-v">' + (rec.learnedCount || 0) + '</div><div class="lg-stat-l">掌握单词</div></div>' +
          '<div class="lg-stat"><div class="lg-stat-v">' + (rec.reviewCount || 0) + '</div><div class="lg-stat-l">复习单词</div></div></div>'
        : '<div class="brief-empty" style="margin:0">该日期没有学习记录</div>') + '</div>';
  }
  h += (lgHist === "st" ? lgCalHtml("st", stMap, stSel) : "");
  return h;
}
function lgRenderStatsCharts(cur) {
  var e = langGet(cur);
  var N = lgStatsDays;
  var days = [];
  for (var i = N - 1; i >= 0; i--) {
    var d = lgAddDays(today(), -i);
    var s = e.stats.studyLog[d];
    days.push({ d: d, m: s ? Math.round((s.seconds || 0) / 60) : 0 });
  }
  var max = 1; days.forEach(function (x) { if (x.m > max) max = x.m; });
  var el = document.getElementById("lg-bar-chart");
  if (!el) return;
  var w = Math.min(420, Math.max(180, (el.clientWidth || 300) - 10));
  var bw = w / N;
  el.innerHTML = '<div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding:4px 0">' +
    days.map(function (x) {
      var hgt = Math.round(x.m / max * 100);
      var label = x.d.slice(5).replace("-", "/");
      return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px">' +
        '<div style="width:70%;height:' + hgt + 'px;background:' + (x.m > 0 ? "var(--accent,#3b82f6)" : "rgba(150,150,150,0.25)") + ';border-radius:3px 3px 0 0" title="' + label + ': ' + x.m + ' 分钟"></div>' +
        '<div style="font-size:9px;color:var(--text-tertiary)">' + label + '</div></div>';
    }).join("") + '</div>';
}


/* =============================================================
 * 模块十：🎬 视频课（B站课程跟学 · 没学会一键重学 · 评论 · 横竖屏）
 * ============================================================= */
var lgVideoView = "list";          // list | play
var lgVideoCur = null;             // { bvid, p }
var lgVideoOrient = "landscape";   // landscape | portrait
var lgVideoOpen = {};              // bvid -> 展开分集列表
var LG_VIDEO_JSON = "./data/lang_videos.json";

function lgVidKey(bvid, p) { return bvid + "_" + p; }

function lgVidCourse(e, bvid) {
  for (var i = 0; i < e.videoCourses.length; i++) {
    if (e.videoCourses[i].bvid === bvid) return e.videoCourses[i];
  }
  return null;
}

function lgVidEp(course, p) {
  if (!course) return null;
  for (var i = 0; i < course.episodes.length; i++) {
    if (course.episodes[i].p === p) return course.episodes[i];
  }
  return null;
}

function lgVidStatus(e, bvid, p) {
  var r = e.videoProgress[lgVidKey(bvid, p)];
  return r ? r.status : null;
}

function lgFmtSec(s) {
  s = Math.round(s || 0);
  var m = Math.floor(s / 60), ss = s % 60;
  return m + ":" + (ss < 10 ? "0" : "") + ss;
}

/* 全部待重学的集（跨课程） */
function lgVidRelearnList(e) {
  var out = [];
  Object.keys(e.videoProgress).forEach(function (k) {
    var r = e.videoProgress[k];
    if (!r || r.status !== "unclear") return;
    var i = k.lastIndexOf("_");
    var bvid = k.slice(0, i), p = parseInt(k.slice(i + 1), 10);
    var c = lgVidCourse(e, bvid);
    var ep = lgVidEp(c, p);
    if (c && ep) out.push({ bvid: bvid, p: p, course: c, ep: ep, at: r.at || "" });
  });
  out.sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); });
  return out;
}

function lgVidStats(e) {
  var total = 0, done = 0, unclear = 0;
  e.videoCourses.forEach(function (c) { total += c.episodes.length; });
  Object.keys(e.videoProgress).forEach(function (k) {
    var s = e.videoProgress[k] && e.videoProgress[k].status;
    if (s === "done") done++; else if (s === "unclear") unclear++;
  });
  return { total: total, done: done, unclear: unclear };
}

/* ---------------- 渲染入口 ---------------- */
function lgRenderVideo(cur) {
  var e = langGet(cur);
  if (lgVideoView === "play" && lgVideoCur) return lgRenderVideoPlayer(cur, e);
  return lgRenderVideoList(cur, e);
}

/* 首次进入视频课 Tab 时，自动从预设 JSON 导入课程（无需手动点导入） */
function lgVidAutoSeed(cur, e) {
  if (e.videoSeeded || window.__lgVidSeeding) return;
  window.__lgVidSeeding = true;
  fetch(LG_VIDEO_JSON + "?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var e2 = langGet(cur);
      var added = 0;
      (j.courses || []).forEach(function (c) {
        if ((c.lang || "en") !== cur) return;
        if (lgVidCourse(e2, c.bvid)) return;
        e2.videoCourses.push({
          bvid: c.bvid, title: c.title, up: c.up || "", cover: c.cover || "",
          tag: c.tag || "", totalSec: c.totalSec || 0,
          orientation: c.orientation || "landscape",
          episodes: (c.episodes || []).slice(),
          addedAt: new Date().toISOString()
        });
        added++;
      });
      e2.videoSeeded = true;
      DB.save();
      window.__lgVidSeeding = false;
      if (added) render();
    })
    .catch(function () { window.__lgVidSeeding = false; });
}

function lgRenderVideoList(cur, e) {
  if (!e.videoSeeded) lgVidAutoSeed(cur, e);
  var st = lgVidStats(e);
  var relearn = lgVidRelearnList(e);

  var html = '<div class="stats-grid">' +
    '<div class="stat-card"><div class="stat-icon">🎬</div><div class="stat-value">' + e.videoCourses.length + '</div><div class="stat-label">课程数</div></div>' +
    '<div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">' + st.done + '/' + st.total + '</div><div class="stat-label">已学会</div></div>' +
    '<div class="stat-card"><div class="stat-icon">🔁</div><div class="stat-value ' + (st.unclear ? "down" : "") + '">' + st.unclear + '</div><div class="stat-label">待重学</div></div>' +
    '</div>';

  html += '<div class="lg-vid-toolbar">' +
    '<div class="lg-vid-hint">哪里没学会点「🔁 没学会」，会自动收进待重学，下次直接点开重看。</div>' +
    '<button class="btn btn-primary btn-mini" onclick="lgVidImportModal()">➕ 导入B站视频</button>' +
    '</div>';

  /* 待重学置顶 */
  if (relearn.length) {
    html += '<div class="card lg-vid-relearn"><div class="card-h">🔁 待重学 · ' + relearn.length + ' 集</div>';
    relearn.forEach(function (r) {
      html += '<div class="lg-vid-relearn-row" onclick="lgVidPlay(\'' + r.bvid + '\',' + r.p + ')">' +
        '<span class="lg-vid-relearn-p">P' + r.p + '</span>' +
        '<span class="lg-vid-relearn-t">' + escapeHtml(r.ep.title) + '</span>' +
        '<span class="lg-vid-relearn-go">重新学 ▶</span>' +
        '</div>';
    });
    html += '</div>';
  }

  /* 课程列表 */
  if (!e.videoCourses.length) {
    html += '<div class="empty-state" style="padding:22px"><div class="empty-text" style="font-size:13px">还没有导入视频课<br>点「➕ 导入B站视频」输入 BV 号即可</div></div>';
    return html;
  }

  e.videoCourses.forEach(function (c) {
    var doneN = 0, unclearN = 0;
    c.episodes.forEach(function (ep) {
      var s = lgVidStatus(e, c.bvid, ep.p);
      if (s === "done") doneN++; else if (s === "unclear") unclearN++;
    });
    var pct = c.episodes.length ? Math.round(doneN / c.episodes.length * 100) : 0;
    var opened = !!lgVideoOpen[c.bvid];

    html += '<div class="card lg-vid-course">' +
      '<div class="lg-vid-course-h" onclick="lgVidToggle(\'' + c.bvid + '\')">' +
      (c.cover ? '<img class="lg-vid-cover" src="' + escapeHtml(c.cover) + '" alt="" loading="lazy">' : '') +
      '<div class="lg-vid-course-info">' +
      '<div class="lg-vid-course-t">' + escapeHtml(c.title) + '</div>' +
      '<div class="lg-vid-course-m">' + escapeHtml(c.up || "") + ' · ' + c.episodes.length + '集 · ' + Math.round((c.totalSec || 0) / 60) + '分钟' +
      (c.orientation === "portrait" ? ' · 📱竖屏' : ' · 🖥横屏') + '</div>' +
      '<div class="lg-vid-bar"><div class="lg-vid-bar-in" style="width:' + pct + '%"></div></div>' +
      '<div class="lg-vid-course-m">已学 ' + doneN + '/' + c.episodes.length + ' · ' + pct + '%' + (unclearN ? ' · 🔁 ' + unclearN + ' 待重学' : '') + '</div>' +
      '</div>' +
      '<div class="lg-vid-caret">' + (opened ? "▲" : "▼") + '</div>' +
      '</div>';

    if (opened) {
      html += '<div class="lg-vid-eplist">';
      c.episodes.forEach(function (ep) {
        var s = lgVidStatus(e, c.bvid, ep.p);
        var icon = s === "done" ? "✅" : (s === "unclear" ? "🔁" : "▫️");
        var nN = (e.videoNotes[lgVidKey(c.bvid, ep.p)] || []).length;
        html += '<div class="lg-vid-ep ' + (s || "") + '" onclick="lgVidPlay(\'' + c.bvid + '\',' + ep.p + ')">' +
          '<span class="lg-vid-ep-i">' + icon + '</span>' +
          '<span class="lg-vid-ep-p">P' + ep.p + '</span>' +
          '<span class="lg-vid-ep-t">' + escapeHtml(ep.title) + '</span>' +
          (nN ? '<span class="lg-vid-ep-n">💬' + nN + '</span>' : '') +
          '<span class="lg-vid-ep-d">' + lgFmtSec(ep.sec) + '</span>' +
          '</div>';
      });
      html += '</div>';
      html += '<div class="btn-row" style="padding:8px 10px 10px">' +
        '<button class="btn btn-secondary btn-mini" style="flex:1" onclick="lgVidDeleteCourse(\'' + c.bvid + '\')">🗑 移除课程</button>' +
        '<button class="btn btn-secondary btn-mini" style="flex:1" onclick="window.open(\'https://www.bilibili.com/video/' + c.bvid + '\',\'_blank\')">↗ B站打开</button>' +
        '</div>';
    }
    html += '</div>';
  });

  return html;
}

/* ---------------- 播放页 ---------------- */
function lgRenderVideoPlayer(cur, e) {
  var c = lgVidCourse(e, lgVideoCur.bvid);
  var ep = lgVidEp(c, lgVideoCur.p);
  if (!c || !ep) { lgVideoView = "list"; return lgRenderVideoList(cur, e); }

  var key = lgVidKey(c.bvid, ep.p);
  var status = lgVidStatus(e, c.bvid, ep.p);
  var notes = e.videoNotes[key] || [];
  var idx = c.episodes.indexOf(ep);
  var prev = idx > 0 ? c.episodes[idx - 1] : null;
  var next = idx < c.episodes.length - 1 ? c.episodes[idx + 1] : null;

  var src = "https://player.bilibili.com/player.html?bvid=" + c.bvid + "&p=" + ep.p +
    "&high_quality=1&danmaku=0&autoplay=0";

  var html = '<div class="lg-vid-playhead">' +
    '<button class="btn btn-secondary btn-mini" onclick="lgVidBack()">← 返回列表</button>' +
    '<div class="lg-vid-playtitle">P' + ep.p + ' · ' + escapeHtml(ep.title) + '</div>' +
    '</div>';

  /* 播放器 */
  html += '<div class="lg-vid-stage ' + lgVideoOrient + '" id="lg-vid-stage">' +
    '<iframe id="lg-vid-frame" src="' + src + '" frameborder="0" scrolling="no" ' +
    'allowfullscreen="true" allow="autoplay; fullscreen; encrypted-media"></iframe>' +
    '</div>';

  /* 屏幕方向 + 全屏 + 换集 */
  html += '<div class="lg-vid-ctrl">' +
    '<div class="lg-vid-seg">' +
    '<button class="lg-vid-segbtn' + (lgVideoOrient === "landscape" ? " on" : "") + '" onclick="lgVidOrient(\'landscape\')">🖥 横屏</button>' +
    '<button class="lg-vid-segbtn' + (lgVideoOrient === "portrait" ? " on" : "") + '" onclick="lgVidOrient(\'portrait\')">📱 竖屏</button>' +
    '</div>' +
    '<button class="btn btn-secondary btn-mini" onclick="lgVidFullscreen()">⛶ 全屏</button>' +
    '</div>';

  html += '<div class="lg-vid-nav">' +
    (prev ? '<button class="btn btn-secondary btn-mini" onclick="lgVidPlay(\'' + c.bvid + '\',' + prev.p + ')">◀ 上一集</button>' : '<span></span>') +
    '<span class="lg-vid-navpos">' + (idx + 1) + ' / ' + c.episodes.length + '</span>' +
    (next ? '<button class="btn btn-secondary btn-mini" onclick="lgVidPlay(\'' + c.bvid + '\',' + next.p + ')">下一集 ▶</button>' : '<span></span>') +
    '</div>';

  /* 学习状态 */
  html += '<div class="card"><div class="card-h">这集学会了吗？</div>' +
    '<div class="lg-vid-judge">' +
    '<button class="lg-vid-jbtn done' + (status === "done" ? " on" : "") + '" onclick="lgVidMark(\'' + c.bvid + '\',' + ep.p + ',\'done\')">✅ 学会了</button>' +
    '<button class="lg-vid-jbtn unclear' + (status === "unclear" ? " on" : "") + '" onclick="lgVidMark(\'' + c.bvid + '\',' + ep.p + ',\'unclear\')">🔁 没学会</button>' +
    '</div>' +
    '<div class="lg-vid-judge-tip">' +
    (status === "unclear" ? '已加入待重学，返回列表顶部可一键重看。' :
      (status === "done" ? '已标记学会 ✓' : '标记「没学会」后会收进待重学清单，不用再自己找。')) +
    '</div></div>';

  /* 评论 / 笔记 */
  html += '<div class="card"><div class="card-h">💬 我的评论 · ' + notes.length + ' 条</div>';
  html += '<div class="lg-vid-noteadd">' +
    '<input class="form-input lg-vid-nt" id="lg-vid-note-time" placeholder="时间点 如 2:35（可空）">' +
    '<input class="form-input" id="lg-vid-note-text" placeholder="写点什么…哪里没听懂、学到的词" onkeydown="if(event.key===\'Enter\')lgVidAddNote()">' +
    '<button class="btn btn-primary btn-mini" onclick="lgVidAddNote()">发布</button>' +
    '</div>';
  if (!notes.length) {
    html += '<div class="lg-vid-nonote">还没有评论，看到有感觉的地方随手记一句。</div>';
  } else {
    notes.slice().reverse().forEach(function (n) {
      html += '<div class="lg-vid-note">' +
        '<div class="lg-vid-note-h">' +
        (n.time ? '<span class="lg-vid-note-time">⏱ ' + escapeHtml(n.time) + '</span>' : '') +
        '<span class="lg-vid-note-at">' + escapeHtml(n.at || "") + '</span>' +
        '<button class="lg-vid-note-del" onclick="lgVidDelNote(\'' + n.id + '\')">✕</button>' +
        '</div>' +
        '<div class="lg-vid-note-b">' + escapeHtml(n.text) + '</div>' +
        '</div>';
    });
  }
  html += '</div>';

  return html;
}

/* ---------------- 交互 ---------------- */
function lgVidToggle(bvid) { lgVideoOpen[bvid] = !lgVideoOpen[bvid]; render(); }

function lgVidPlay(bvid, p) {
  lgVideoCur = { bvid: bvid, p: p };
  lgVideoView = "play";
  var e = langGet(langCur());
  var c = lgVidCourse(e, bvid);
  if (c) lgVideoOrient = c.orientation === "portrait" ? "portrait" : "landscape";
  // 记录一次观看
  var key = lgVidKey(bvid, p);
  var r = e.videoProgress[key] || { status: null, replays: 0 };
  r.replays = (r.replays || 0) + 1;
  r.lastAt = new Date().toLocaleString("zh-CN");
  e.videoProgress[key] = r;
  DB.save();
  render();
  window.scrollTo(0, 0);
}

function lgVidBack() { lgVideoView = "list"; lgVideoCur = null; render(); }

function lgVidOrient(o) { lgVideoOrient = o; render(); }

function lgVidFullscreen() {
  var el = document.getElementById("lg-vid-stage");
  if (!el) return;
  var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen || el.msRequestFullscreen;
  if (fn) { try { fn.call(el); } catch (err) { if (typeof showToast === "function") showToast("请用播放器右下角全屏按钮", "warn"); } }
  else if (typeof showToast === "function") showToast("请用播放器右下角全屏按钮", "warn");
}

function lgVidMark(bvid, p, status) {
  var e = langGet(langCur());
  var key = lgVidKey(bvid, p);
  var r = e.videoProgress[key] || { replays: 0 };
  r.status = (r.status === status) ? null : status;   // 再点一次取消
  r.at = new Date().toLocaleString("zh-CN");
  e.videoProgress[key] = r;
  DB.save();
  if (typeof lgAddStudy === "function" && r.status === "done") lgAddStudy(langCur(), 60);
  render();
  if (typeof showToast === "function") {
    showToast(r.status === "done" ? "已标记学会 ✅" : (r.status === "unclear" ? "已加入待重学 🔁" : "已取消标记"), "success");
  }
}

function lgVidAddNote() {
  if (!lgVideoCur) return;
  var ti = document.getElementById("lg-vid-note-text");
  var tm = document.getElementById("lg-vid-note-time");
  var text = ti ? ti.value.trim() : "";
  if (!text) { if (typeof showToast === "function") showToast("先写点内容", "warn"); return; }
  var e = langGet(langCur());
  var key = lgVidKey(lgVideoCur.bvid, lgVideoCur.p);
  if (!e.videoNotes[key]) e.videoNotes[key] = [];
  e.videoNotes[key].push({
    id: lgUid(),
    text: text,
    time: tm ? tm.value.trim() : "",
    at: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  });
  DB.save();
  render();
  if (typeof showToast === "function") showToast("已发布 💬", "success");
}

function lgVidDelNote(id) {
  if (!lgVideoCur) return;
  var e = langGet(langCur());
  var key = lgVidKey(lgVideoCur.bvid, lgVideoCur.p);
  e.videoNotes[key] = (e.videoNotes[key] || []).filter(function (n) { return n.id !== id; });
  DB.save();
  render();
}

function lgVidDeleteCourse(bvid) {
  if (!confirm("移除这个课程？（学习记录和评论会一并清除）")) return;
  var e = langGet(langCur());
  e.videoCourses = e.videoCourses.filter(function (c) { return c.bvid !== bvid; });
  Object.keys(e.videoProgress).forEach(function (k) { if (k.indexOf(bvid + "_") === 0) delete e.videoProgress[k]; });
  Object.keys(e.videoNotes).forEach(function (k) { if (k.indexOf(bvid + "_") === 0) delete e.videoNotes[k]; });
  DB.save();
  render();
  if (typeof showToast === "function") showToast("已移除", "success");
}

/* ---------------- 导入 ---------------- */
function lgVidImportModal() {
  var html = '<div class="modal-title">➕ 导入B站视频课</div>' +
    '<label class="form-label">BV 号 / 视频链接</label>' +
    '<input class="form-input" id="lg-vid-bv" placeholder="BV1DkKBzfEQH 或粘贴B站链接">' +
    '<div class="lg-vid-imp-tip">支持多集合集，会自动拉取全部分P做成课程。<br>已收录的课程可秒导；未收录的会尝试实时拉取。</div>' +
    '<div class="lg-vid-imp-quick">推荐：<a onclick="document.getElementById(\'lg-vid-bv\').value=\'BV1DkKBzfEQH\'">BBC英文启蒙动画（59集）</a></div>' +
    '<div class="btn-row" style="margin-top:14px">' +
    '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" style="flex:1" onclick="lgVidImportGo()">导入</button>' +
    '</div>';
  showModal(html);
}

function lgVidParseBv(s) {
  var m = String(s || "").match(/BV[0-9A-Za-z]{10}/);
  return m ? m[0] : "";
}

function lgVidImportGo() {
  var inp = document.getElementById("lg-vid-bv");
  var bvid = lgVidParseBv(inp ? inp.value : "");
  if (!bvid) { if (typeof showToast === "function") showToast("没识别到 BV 号", "warn"); return; }
  var e = langGet(langCur());
  if (lgVidCourse(e, bvid)) { if (typeof showToast === "function") showToast("这个课程已经导入过了", "warn"); closeModal(); return; }
  if (typeof showToast === "function") showToast("正在拉取课程…", "info");

  fetch(LG_VIDEO_JSON + "?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var hit = (j.courses || []).filter(function (c) { return c.bvid === bvid; })[0];
      if (hit) { lgVidAddCourse(hit); return; }
      return lgVidFetchLive(bvid);
    })
    .catch(function () { return lgVidFetchLive(bvid); });
}

/* 实时拉B站接口（可能被 CORS 拦） */
function lgVidFetchLive(bvid) {
  return fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid)
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j.data) throw new Error("no data");
      var v = j.data, pages = v.pages || [];
      var vert = pages.filter(function (p) { return p.dimension && p.dimension.height > p.dimension.width; }).length;
      lgVidAddCourse({
        bvid: v.bvid, title: v.title, up: v.owner ? v.owner.name : "",
        cover: (v.pic || "").replace(/^http:/, "https:"),
        totalSec: v.duration || 0,
        orientation: vert > pages.length / 2 ? "portrait" : "landscape",
        episodes: pages.map(function (p) { return { p: p.page, title: p.part || ("P" + p.page), sec: p.duration || 0 }; })
      });
    })
    .catch(function () {
      closeModal();
      if (typeof showToast === "function") showToast("拉取失败：该视频未收录，且浏览器无法直连B站接口", "error");
    });
}

function lgVidAddCourse(c) {
  var e = langGet(langCur());
  if (lgVidCourse(e, c.bvid)) { closeModal(); return; }
  e.videoCourses.push({
    bvid: c.bvid, title: c.title, up: c.up || "", cover: c.cover || "",
    tag: c.tag || "", totalSec: c.totalSec || 0,
    orientation: c.orientation || "landscape",
    episodes: (c.episodes || []).slice(),
    addedAt: new Date().toISOString()
  });
  lgVideoOpen[c.bvid] = true;
  DB.save();
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已导入《" + c.title.slice(0, 14) + "》· " + (c.episodes || []).length + " 集", "success");
}
