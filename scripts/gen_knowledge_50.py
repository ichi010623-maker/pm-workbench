# -*- coding: utf-8 -*-
import json, sys, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "knowledge.json")
TODAY = "2026-08-20"

WHITELIST = {"llm","token","prompt","context","embedding","rag","agent","multimodal",
             "compound","dca","pe","inflation","diversify","rule72","nav","bond",
             "think-compound","second-curve","systems","pareto","feedback"}

NEW = [
 # ---------- AI (ai-047..ai-056) ----------
 {"cat":"ai","id":"ai-047","title":"混合专家 MoE：大模型分身术","tag":"AI 架构","question":"一个大模型为何要分多个专家？",
  "content":"MoE 把模型拆成多个专精子网络（专家），每次只激活最相关的几个，既涨能力又控算力，像公司按事派专人。",
  "points":["拆成多个专精子网络","每次只激活相关专家","能力涨算力却可控"],"tip":"看模型参数先问是不是 MoE。","diagram":"llm","source":"自编通俗版"},
 {"cat":"ai","id":"ai-048","title":"上下文学习：不训练也会学","tag":"AI 技巧","question":"没改参数，它怎么学会新任务？",
  "content":"给几个例子塞进提示，模型当场照着做，无需重新训练。这种“看着例子学”的能力，是大模型最神奇的天赋之一。",
  "points":["例子塞进提示即可用","无需改动参数","零样本也能泛化"],"tip":"新任务先给两三个范例。","diagram":"prompt","source":"自编通俗版"},
 {"cat":"ai","id":"ai-049","title":"向量数据库：语义的仓库","tag":"AI 基建","question":"几百万条文档怎么秒搜？",
  "content":"它专门存 Embedding 向量，按相似度而非关键词检索，是 RAG 知识库的发动机，让“找意思相近”变得飞快。",
  "points":["存向量按相似度查","RAG 的检索底座","语义搜索飞快"],"tip":"做知识库先选好向量库。","diagram":"embedding","source":"自编通俗版"},
 {"cat":"ai","id":"ai-050","title":"世界模型：让 AI 懂物理","tag":"AI 前沿","question":"AI 能预想下一步吗？",
  "content":"世界模型让 AI 在脑内模拟“如果我这么做，世界会怎样”，常用于机器人与自动驾驶，先想后动、少试错。",
  "points":["内部模拟未来","机器人驾驶常用","先想后动少试错"],"tip":"具身智能靠它规划。","diagram":"multimodal","source":"自编通俗版"},
 {"cat":"ai","id":"ai-051","title":"模型水印：给 AI 内容留痕","tag":"AI 安全","question":"怎么分辨是人写还是 AI 写？",
  "content":"在生成内容里嵌入人眼难察、机器可检的统计痕迹，用来溯源与防伪，是应对深伪与版权争议的关键手段。",
  "points":["嵌入隐形统计痕","机器可检测溯源","应对深伪与版权"],"tip":"发布前考虑加水印。","diagram":"llm","source":"自编通俗版"},
 {"cat":"ai","id":"ai-052","title":"投机解码：让生成快一倍","tag":"AI 工程","question":"回答慢能加速吗？",
  "content":"用小模型先草拟几字、大模型一次校验，像秘书打草稿老板过目，大幅提速且结果完全一致，是推理加速利器。",
  "points":["小模型先草稿","大模型一次校验","提速且结果不变"],"tip":"高并发部署可上投机解码。","diagram":"token","source":"自编通俗版"},
 {"cat":"ai","id":"ai-053","title":"强化学习：从奖惩中自学","tag":"AI 训练","question":"没人教，AI 怎么变强？",
  "content":"智能体在环境里试错，做对给奖励、做错给惩罚，自己摸索出最优策略。下棋、玩游戏、机器人控制都靠它，与 RLHF 不同在奖励来自环境。",
  "points":["试错换奖励信号","环境给奖惩","RLHF 之外的基础"],"tip":"和 RLHF 区分：奖励来源不同。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"ai","id":"ai-054","title":"数据标注：喂养模型的粮","tag":"AI 数据","question":"模型吃的“教材”谁做的？",
  "content":"把原始图文标上答案（如框出猫、标好情绪），高质量标注直接决定模型上限。脏数据喂出笨模型，标注是隐形的护城河。",
  "points":["标答案喂模型","质量决定上限","隐性护城河"],"tip":"标注规范比数量更关键。","diagram":"llm","source":"自编通俗版"},
 {"cat":"ai","id":"ai-055","title":"欧盟 AI 法案：给 AI 立规矩","tag":"AI 合规","question":"AI 也要分风险等级？",
  "content":"全球首部全面 AI 监管法，按风险把应用分四级，越高风险要求越严（如透明、人工监督），出海产品必须提前对账。",
  "points":["按风险分四级","越高越严管","出海要对账"],"tip":"做欧洲市场先读法案。","diagram":"systems","source":"自编通俗版"},
 {"cat":"ai","id":"ai-056","title":"线性注意力：挑战 Transformer","tag":"AI 架构","question":"长文为什么这么贵？",
  "content":"传统注意力随长度平方涨价。Mamba 等线性模型用状态压缩记忆，长文本又快又省，是挑战 Transformer 的新架构。",
  "points":["注意力随长度平方涨","状态压缩更省","挑战 Transformer"],"tip":"长文本场景关注线性模型。","diagram":"llm","source":"自编通俗版"},

 # ---------- Finance (fin-046..fin-055) ----------
 {"cat":"finance","id":"fin-046","title":"现金流：企业的血液","tag":"基本面","question":"赚钱为啥还会倒闭？",
  "content":"利润是账面，现金是活命钱。很多公司盈利却因回款慢、断流而垮。看企业先看它能不能持续收到钱。",
  "points":["利润≠现金","断流即死亡","看回款能力"],"tip":"投资先看现金流别只看利润。","diagram":"compound","source":"自编通俗版"},
 {"cat":"finance","id":"fin-047","title":"市销率 PS：看营收贵不贵","tag":"估值","question":"还没盈利怎么估？",
  "content":"PS=市值÷营业收入，适合尚未盈利的高成长公司，比 PE 更稳。但营收质量差，低 PS 也可能是陷阱。",
  "points":["市值除营收","适合未盈利","看营收质量"],"tip":"成长股可看 PS 辅助。","diagram":"pe","source":"自编通俗版"},
 {"cat":"finance","id":"fin-048","title":"自由现金流：真能分的钱","tag":"基本面","question":"赚的钱都能拿走？",
  "content":"自由现金流是扣非完必要开支后真正剩下的可自由支配现金，比净利润更难粉饰，是价值投资的硬核指标。",
  "points":["剩的可支配现金","难粉饰","价值投资硬指标"],"tip":"长期看 FCF 更靠谱。","diagram":"compound","source":"自编通俗版"},
 {"cat":"finance","id":"fin-049","title":"存款准备金率：央行的闸门","tag":"宏观","question":"降准为啥是利好？",
  "content":"银行必须把一部分存款交央行保管。降准释放更多可贷资金、市场钱变多，常提振股市与预期，是重要货币工具。",
  "points":["交央行的押金","降准放流动性","提振预期"],"tip":"降准宽松利好风险资产。","diagram":"inflation","source":"自编通俗版"},
 {"cat":"finance","id":"fin-050","title":"庞氏骗局：拆东墙游戏","tag":"防坑","question":"高息为何突然断了？",
  "content":"用后来者的钱付前面人的利息，没有真实盈利，盘子够大就崩。承诺稳赚、拉人头、不透明，是三大红旗。",
  "points":["后来钱付前息","无真实盈利","拉人头是红旗"],"tip":"稳赚不赔先打问号。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"finance","id":"fin-051","title":"汇率：钱与钱的换算价","tag":"宏观","question":"人民币升值意味着啥？",
  "content":"汇率是一国钱换另一国钱的价格。本币升值利好进口、压制出口，也影响海外资产与留学成本，是全球配置的隐藏变量。",
  "points":["钱换钱的价格","升值利进口","影响全球配置"],"tip":"跨境投资先看汇率。","diagram":"inflation","source":"自编通俗版"},
 {"cat":"finance","id":"fin-052","title":"公募私募：两种买基路","tag":"基金","question":"散户该买哪种？",
  "content":"公募面向大众、门槛低、透明规范；私募对合格投资者开放、门槛高、策略灵活但信息少。普通人从公募起步更稳。",
  "points":["公募低门槛透明","私募高门槛灵活","散户从公募起"],"tip":"新手优先选公募。","diagram":"diversify","source":"自编通俗版"},
 {"cat":"finance","id":"fin-053","title":"风险平价：按波动配权重","tag":"配置","question":"各资产该配多少？",
  "content":"不分金额而按风险贡献平分，低波动多配、高波动少配，让组合在各环境都稳，桥水全天候策略即源自此。",
  "points":["按风险贡献配","低波多高波少","环境皆稳"],"tip":"想要稳可参考风险平价。","diagram":"diversify","source":"自编通俗版"},
 {"cat":"finance","id":"fin-054","title":"滞胀：涨又穷的组合拳","tag":"宏观","question":"通胀加衰退咋办？",
  "content":"经济停滞伴物价上涨，央行左右为难：加息抑通胀会伤增长，放水稳经济又推物价。黄金与实物资产常受青睐。",
  "points":["停滞加通胀","政策两难","黄金受青睐"],"tip":"滞胀期少赌单边。","diagram":"inflation","source":"自编通俗版"},
 {"cat":"finance","id":"fin-055","title":"因子投资：赚规律的钱","tag":"策略","question":"为啥小盘常跑赢？",
  "content":"把长期有效的超额收益归因成因子（如价值、小盘、质量），按因子构建组合，赚的是市场结构里的稳定规律。",
  "points":["超额收益归因","价值小盘质量","赚结构规律"],"tip":"量化选股多看因子。","diagram":"pe","source":"自编通俗版"},

 # ---------- Think (think-041..think-050) ----------
 {"cat":"think","id":"think-041","title":"霍桑效应：被看就变好","tag":"心理","question":"为啥一被观察就努力？",
  "content":"人一旦知道自己被关注，行为就会改善，与改动本身无关。管理上多给正向关注，团队表现常自然提升。",
  "points":["被关注就改善","无关改动本身","正向关注提效"],"tip":"多看见团队的努力。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"think","id":"think-042","title":"皮格马利翁：期望成真","tag":"心理","question":"你信他能行他就行？",
  "content":"他人高期望会让人不自觉朝该方向努力，最终真变好。老师信学生、主管信下属，期待本身就有生产力。",
  "points":["高期望促努力","期待有生产力","信他能行才行"],"tip":"对人对己都给高期待。","diagram":"second-curve","source":"自编通俗版"},
 {"cat":"think","id":"think-043","title":"后见之明：马后炮错觉","tag":"偏差","question":"事后为啥觉得早知道？",
  "content":"事发生后人易夸大自己早能预见的程度，导致过度责人或盲目自信。复盘要还原当时信息，别用结果倒推。",
  "points":["夸大早能预见","过度责人自信","还原当时信息"],"tip":"复盘别用结果倒推。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"think","id":"think-044","title":"规划谬误：乐观的工期","tag":"偏差","question":"为啥项目总延期？",
  "content":"人习惯按理想情况估时间，忽略意外与依赖，结果普遍偏短。用历史相似任务做基准，比拍脑袋准得多。",
  "points":["按理想估时间","普遍偏短","用历史做基准"],"tip":"排期参考过去同类。","diagram":"systems","source":"自编通俗版"},
 {"cat":"think","id":"think-045","title":"达克效应：不懂的最自信","tag":"偏差","question":"菜鸟为啥敢乱说？",
  "content":"能力不足者既做不对也认不出错，反而最自信；真行家因知边界而谦逊。越学越觉得不懂，是成长的常态。",
  "points":["无能又不自知","反而最自信","专家因知边界谦"],"tip":"遇杠精先想达克效应。","diagram":"pareto","source":"自编通俗版"},
 {"cat":"think","id":"think-046","title":"聚光灯效应：以为都看我","tag":"心理","question":"出丑真有人记住？",
  "content":"人高估自己在他人眼中的显眼程度，以为失误被围观，其实别人并没那么在意。放下包袱，多数尴尬转头就忘。",
  "points":["高估被关注","别人没在意","尴尬转头忘"],"tip":"别放大自己的失误。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"think","id":"think-047","title":"蔡格尼克：未完最惦记","tag":"心理","question":"为啥没做完总惦记？",
  "content":"人对未完成的事记忆更深、更惦记，做完的反而易忘。利用它做清单、留钩子，能吊住注意力与行动欲。",
  "points":["未完成记得深","做完易忘","留钩子吊注意"],"tip":"待办清单正合此理。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"think","id":"think-048","title":"巴纳姆效应：星座套路","tag":"偏差","question":"为啥星座说得准？",
  "content":"人倾向把模糊、普遍适用的描述当成专属于自己的精准判断，星座算命正钻这空子。具体证据胜过漂亮套话。",
  "points":["模糊描述当专属","星座钻空子","要具体证据"],"tip":"别被漂亮套话骗。","diagram":"pareto","source":"自编通俗版"},
 {"cat":"think","id":"think-049","title":"认知失调：自己说服自己","tag":"心理","question":"为啥买了还夸贵货？",
  "content":"当行为与观念冲突，人会不适并自动改写认知来自洽，比如买贵了反而更夸它好。理解它，少被决策绑架。",
  "points":["言行冲突不适","自动改写认知","自洽保心理"],"tip":"觉察自己的自我说服。","diagram":"systems","source":"自编通俗版"},
 {"cat":"think","id":"think-050","title":"决策疲劳：选多反而差","tag":"自律","question":"为啥晚上易破功？",
  "content":"意志力像电池，全天决策耗尽后，人会偷懒选易项或妥协。重要决定放上午，琐事靠习惯与默认项省电。",
  "points":["意志像电池","耗尽选易项","重要事放上午"],"tip":"把大事排在最前面。","diagram":"second-curve","source":"自编通俗版"},

 # ---------- hwpm (hwpm-031..hwpm-040) ----------
 {"cat":"hwpm","id":"hwpm-031","title":"KANO 模型：需求分五类","tag":"需求","question":"功能越多越好？",
  "content":"把需求分基本/期望/兴奋/无差异/反向五类。基本型不做会骂，兴奋型做了会惊；资源优先砸兴奋与基本。",
  "points":["基本期望兴奋等","基本不做会骂","资源砸兴奋型"],"tip":"先做惊喜点再补基础。","diagram":"pareto","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-032","title":"设计系统：一套规范复用","tag":"设计","question":"多端一致咋保证？",
  "content":"把颜色、字体、组件、交互沉淀成统一规范库，全员按同一套搭界面，省返工、保一致，是规模化产品的地基。",
  "points":["规范组件库","全端一致","省返工"],"tip":"早期建设计系统最值。","diagram":"systems","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-033","title":"用户访谈：听真实的人","tag":"用户","question":"数据看不出啥办？",
  "content":"找目标用户深聊使用场景与痛点，弥补数据盲区。少问观点多问行为，听他们怎么做而非怎么说。",
  "points":["深聊场景痛点","补数据盲区","问行为非观点"],"tip":"问行为别问观点。","diagram":"context","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-034","title":"A/B 测试：对照见真相","tag":"验证","question":"两个方案选哪个？",
  "content":"同一时间把流量随机分两组，各看一版，用真实数据比转化而非拍脑袋。小改动也值得测，避免集体错觉。",
  "points":["随机分流对照","数据比转化","小改也值得测"],"tip":"别拍脑袋，用数据选。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-035","title":"数据埋点：行为留痕迹","tag":"数据","question":"用户咋用的看不见？",
  "content":"在关键操作埋下统计点，记录点击、停留、路径，把模糊的“体验”变成可量化漏斗，是迭代决策的真相源。",
  "points":["关键处记行为","体验变漏斗","迭代靠真相"],"tip":"上线前先规划埋点。","diagram":"context","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-036","title":"技术债务：早还别拖","tag":"工程","question":"赶工埋的雷迟早爆？",
  "content":"为提速写的凑合代码，后期要加倍利息偿还：改不动、易出 bug。定期还债，别等债台高筑拖垮迭代。",
  "points":["凑合代码欠债","后期加倍利息","定期还债"],"tip":"每版本留还债额度。","diagram":"compound","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-037","title":"防呆设计：错也装不对","tag":"设计","question":"为啥插错孔装不上？",
  "content":"Poka-Yoke 用结构或提示让错误在操作前就被挡下，比如不对称的接口、必填校验，从源头减少人为失误。",
  "points":["结构挡下错误","不对称接口","源头减失误"],"tip":"让错的操作根本做不了。","diagram":"systems","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-038","title":"可维修性：坏了好拆修","tag":"设计","question":"一体封死咋维修？",
  "content":"DFS 在设计阶段就考虑易拆易换：模块化、标件、留维修通道，既降售后成本也迎合“维修权”监管趋势。",
  "points":["易拆易换","模块化标件","降售后成本"],"tip":"维修权已成合规趋势。","diagram":"systems","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-039","title":"设计评审：上线前过堂","tag":"评审","question":"方案谁拍板才稳？",
  "content":"多角色（研发、质量、供应链）在量产前集中挑刺，把分歧与隐患提前摆平，比上线后救火便宜十倍。",
  "points":["多角色挑刺","隐患提前摆平","比救火便宜"],"tip":"评审要请反对者。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"hwpm","id":"hwpm-040","title":"产品组合：别只押一款","tag":"战略","question":"一条产品线够吗？",
  "content":"用矩阵（如明星现金牛）管理多产品线，让成熟款养创新款、用组合节奏对冲单品波动，避免把命系于一款。",
  "points":["矩阵管多线","成熟养创新","对冲单品波动"],"tip":"用组合平滑风险。","diagram":"pareto","source":"自编通俗版"},

 # ---------- mkt (mkt-031..mkt-040) ----------
 {"cat":"mkt","id":"mkt-031","title":"4C 营销：从用户出发","tag":"框架","question":"4P 之外的视角？",
  "content":"4C 把视角翻到用户：顾客需求、成本、便利、沟通，对应 4P 的产品价格渠道促销，更贴当下以用户为中心。",
  "points":["需求成本便利沟通","对应4P翻转","用户为中心"],"tip":"想用户先想 4C。","diagram":"systems","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-032","title":"蓝海战略：避开血海","tag":"战略","question":"为啥要跟人内卷？",
  "content":"不在现有红海拼价格，而是开创新需求、无人竞争的空间，用价值创新同时降本又提质，跳出零和。",
  "points":["开创新需求","无人竞争","价值创新"],"tip":"找没人卷的新空间。","diagram":"second-curve","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-033","title":"长尾理论：小众也赚钱","tag":"洞察","question":"冷门为啥能聚量？",
  "content":"互联网让海量冷门商品的尾巴加起来，总量可媲美头部爆款。电商靠长尾 SKU 盈利，别只盯少数爆品。",
  "points":["冷门聚成量","可敌头部","长尾SKU盈利"],"tip":"别只押爆款。","diagram":"pareto","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-034","title":"搜索营销：被搜到才赢","tag":"获客","question":"用户怎么找到你？",
  "content":"SEO 靠优化内容在自然搜索排前，免费但慢；SEM 买关键词广告即时曝光。两者互补，抓住主动搜索的高意图流量。",
  "points":["SEO自然排前","SEM买词即时","抓高意图流量"],"tip":"高意图流量最值钱。","diagram":"context","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-035","title":"品牌人格：拟人化才亲","tag":"品牌","question":"品牌为啥像个人？",
  "content":"给品牌设定性格（如可靠、酷、温柔），统一语气与视觉，让用户像交朋友般记住你，区别于冷冰冰的参数表。",
  "points":["设定性格","统一语气视觉","像交朋友"],"tip":"调性一致才像人。","diagram":"context","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-036","title":"病毒营销：自发扩散","tag":"增长","question":"为啥有人帮转？",
  "content":"设计自带传播力的机制（有趣、有用、有身份感），让用户自愿转发，像病毒一样低成本的几何级扩散。",
  "points":["自带传播力","用户自愿转","几何级扩散"],"tip":"给转发一个理由。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-037","title":"品牌延伸：老牌推新品","tag":"品牌","question":"名气能借给新品？",
  "content":"把强势品牌的信任迁移到相关新品，省去从零认知。但跨度太大易稀释母品牌，相关性是成败关键。",
  "points":["信任迁移新品","省认知成本","相关性定成败"],"tip":"延伸别跨太远。","diagram":"second-curve","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-038","title":"归因模型：功劳归谁","tag":"度量","question":"成交到底靠哪次？",
  "content":"用户转化前会经多次触达，归因模型把成交的功劳分给各渠道（首触、末触、线性），避免预算错配。",
  "points":["多次触达","功劳分渠道","避预算错配"],"tip":"别只奖最后一次点击。","diagram":"feedback","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-039","title":"关系营销：做长期朋友","tag":"运营","question":"一次买卖够吗？",
  "content":"不只盯单次转化，而经营长期信任与互动，靠持续价值把顾客变伙伴，复购与转介绍自然来，成本低过拉新。",
  "points":["经营长期信任","顾客变伙伴","复购自然来"],"tip":"留客比拉新更省。","diagram":"systems","source":"自编通俗版"},
 {"cat":"mkt","id":"mkt-040","title":"体验营销：让用户沉浸","tag":"触达","question":"为啥线下店要好玩？",
  "content":"用五感与场景营造沉浸式体验，让用户在参与中记住品牌，比看广告更深刻，愿为感受支付溢价。",
  "points":["五感场景沉浸","参与中记住","愿付溢价"],"tip":"体验即记忆锚点。","diagram":"context","source":"自编通俗版"},
]

def err(m): print("VALIDATION FAIL:", m); sys.exit(1)

with open(DATA, "r", encoding="utf-8") as f:
    obj = json.load(f)

pool = obj["pool"]
existing_ids = {c["id"] for c in pool}
# length checks
for c in NEW:
    if len(c["title"]) > 20: err("title too long: "+c["id"]+" ("+str(len(c["title"]))+")")
    if len(c["tag"]) > 6: err("tag too long: "+c["id"])
    if len(c["question"]) > 30: err("question too long: "+c["id"]+" ("+str(len(c["question"]))+")")
    if len(c["content"]) > 80: err("content too long: "+c["id"]+" ("+str(len(c["content"]))+")")
    if len(c["points"]) != 3: err("points!=3: "+c["id"])
    if len(c["tip"]) > 30: err("tip too long: "+c["id"]+" ("+str(len(c["tip"]))+")")
    if c["diagram"] not in WHITELIST: err("diagram not in whitelist: "+c["id"]+" "+c["diagram"])
    if len(c["source"]) > 25: err("source too long: "+c["id"])
    if c["id"] in existing_ids: err("dup id: "+c["id"])
    for p in c["points"]:
        if not p: err("empty point in "+c["id"])

# id sequential per prefix
def prefix_max(pr):
    nums = [int(c["id"].split("-")[1]) for c in pool if c["id"].startswith(pr+"-")]
    return max(nums) if nums else 0
for pr in ["ai","fin","think","hwpm","mkt"]:
    mx = prefix_max(pr)
    ids = sorted(int(c["id"].split("-")[1]) for c in NEW if c["id"].startswith(pr+"-"))
    if ids != list(range(mx+1, mx+11)):
        err("id sequence broken for "+pr+" expected "+str(list(range(mx+1,mx+11)))+" got "+str(ids))

# append
pool.extend(NEW)
obj["pool"] = pool
obj["updatedAt"] = TODAY
obj["dailyCount"] = 50

# history: today entry
hist = obj.get("history", [])
found = False
for h in hist:
    if h["date"] == TODAY:
        h["itemIds"] = [c["id"] for c in NEW]
        found = True
        break
if not found:
    hist.append({"date": TODAY, "itemIds": [c["id"] for c in NEW]})
obj["history"] = hist

with open(DATA, "w", encoding="utf-8") as f:
    json.dump(obj, f, ensure_ascii=False, indent=2)
    f.write("\n")

# final counts
from collections import Counter
cnt = Counter(c["cat"] for c in pool)
print("OK pool=%d cats=%s" % (len(pool), dict(cnt)))
print("today history ids=%d" % len([c for c in NEW]))
