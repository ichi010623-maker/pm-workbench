#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识卡批量生成：8/24 一批 50 张新卡合并进 knowledge.json（幂等）。
用法：python3 scripts/gen_knowledge_50_20260824.py
"""
import json, os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KFILE = os.path.join(BASE, 'data', 'knowledge.json')

d = json.load(open(KFILE))
pool = d['pool']
existing = set()
for c in pool:
    existing.add(c['title'])
    existing.add((c['cat'], c['id']))

WHITELIST = {'llm','token','prompt','context','embedding','rag','agent','multimodal',
             'compound','dca','pe','inflation','diversify','rule72','nav','bond',
             'think-compound','second-curve','systems','pareto','feedback'}

def check(newcards, day):
    ids = set()
    for c in newcards:
        assert c['id'] not in ids, f"id重复 {c['id']}"
        ids.add(c['id'])
        assert (c['cat'], c['id']) not in existing, f"已存在 {(c['cat'],c['id'])}"
        assert c['title'] not in existing, f"title重复 {c['title']}"
        assert len(c['points']) == 3, f"points非3条 {c['id']}"
        assert c['diagram'] in WHITELIST, f"diagram非法 {c['id']}:{c['diagram']}"
    print(f"{day}: {len(newcards)} 张校验通过")

c24 = [
# ---------- AI (ai-127 ~ ai-136) ----------
{"cat":"ai","id":"ai-127","title":"模型微调：旧模型换新本事","tag":"训练","question":"大模型怎么学会我的专属任务？","content":"微调是用自己的数据继续训练预训练模型，让它适配特定任务。参数高效微调(PEFT)只调少量参数，成本低见效快。","points":["自有数据再训练","适配特定任务","PEFT省成本"],"tip":"小数据量优先用 LoRA 类微调。","diagram":"llm","source":"自编通俗版"},
{"cat":"ai","id":"ai-128","title":"少样本提示：给例子就懂","tag":"技巧","question":"没数据怎么让 AI 学会新格式？","content":"少样本(few-shot)是在提示里放几个示例，模型照着格式和套路输出，无需训练。零样本则什么都不给直接问，考验模型泛化。","points":["放示例教格式","零样本靠泛化","示例质量定上限"],"tip":"示例挑最典型的几个，别凑数。","diagram":"prompt","source":"自编通俗版"},
{"cat":"ai","id":"ai-129","title":"注意力机制：谁和谁相关","tag":"原理","question":"模型怎么知道句子里谁修饰谁？","content":"注意力让模型计算词与词之间的相关权重，长句里也能抓住重点关系。这是 Transformer 的核心，没有它就没有现代大模型。","points":["词间算相关权重","抓长句重点关系","Transformer核心"],"tip":"多头注意力=多个角度同时看关系。","diagram":"llm","source":"自编通俗版"},
{"cat":"ai","id":"ai-130","title":"推理模型：想清楚再答","tag":"能力","question":"为什么有的模型解题前先列步骤？","content":"推理模型(o1/R1类)在回答前做多步思考，把难题拆开逐步推导，数学和代码更准，但更慢更贵。简单问题不必开推理。","points":["先思考再作答","难题更准","慢且贵"],"tip":"数学代码开推理，闲聊别开。","diagram":"llm","source":"自编通俗版"},
{"cat":"ai","id":"ai-131","title":"向量数据库：按意思找内容","tag":"工程","question":"怎么用一句话搜到相关资料？","content":"把文本转成向量存库，查询时也转向量，按语义相似度召回，比关键词匹配更懂意图。RAG 的检索底座就是它。","points":["文本转向量存储","语义相似召回","RAG检索底座"],"tip":"向量库要定期更新，别存过期知识。","diagram":"embedding","source":"自编通俗版"},
{"cat":"ai","id":"ai-132","title":"函数调用：让 AI 会动手","tag":"Agent","question":"AI 怎么查天气、下订单？","content":"函数调用让模型输出结构化参数去触发真实接口(查库、调API、发消息)，把语言变成动作。是 Agent 连接外部世界的关键。","points":["输出参数触发接口","语言变动作","连接外部世界"],"tip":"给模型的工具描述要写清何时用。","diagram":"agent","source":"自编通俗版"},
{"cat":"ai","id":"ai-133","title":"提示词注入：防外人下指令","tag":"安全","question":"为什么别把 AI 接在不安全的地方？","content":"提示词注入是攻击者把恶意指令混进用户输入或网页，劫持 AI 去泄密或干坏事。对策：隔离系统提示、校验输出、限制权限。","points":["恶意指令劫持AI","可泄密或作恶","隔离+校验+限权"],"tip":"AI 接外部内容前先清洗再喂。","diagram":"agent","source":"自编通俗版"},
{"cat":"ai","id":"ai-134","title":"模型量化：瘦身也能跑","tag":"优化","question":"手机怎么跑得动大模型？","content":"量化把模型权重从高精度(32位)降到低精度(8/4位)，体积和算力需求大降，精度略损但端侧可跑。是端侧部署的标配。","points":["高精度降低精度","体积算力大降","端侧可跑"],"tip":"量化到 4 位要测精度，别过度。","diagram":"llm","source":"自编通俗版"},
{"cat":"ai","id":"ai-135","title":"多模态生成：文字变图变声","tag":"多模态","question":"AI 怎么把一句话变成一张图？","content":"扩散模型从噪点逐步去噪生成图像，配合文本编码器对齐语义，让文字指挥画面。文生图、文生视频都靠这套思路。","points":["扩散去噪生成","文本对齐语义","文生图/视频"],"tip":"提示词越具体，出图越贴近想法。","diagram":"multimodal","source":"自编通俗版"},
{"cat":"ai","id":"ai-136","title":"评测基准：统一尺子量模型","tag":"评估","question":"各家模型谁强谁弱怎么比？","content":"用公开基准(MMLU等)统一测模型的知识与推理，分数便于横向比较。但基准会饱和、被刷分，真实场景还要看实测。","points":["公开题统一测","便于横向比","会饱和被刷"],"tip":"榜单第一不代表你场景第一。","diagram":"rag","source":"自编通俗版"},

# ---------- 金融 (finance-126 ~ finance-135) ----------
{"cat":"finance","id":"finance-126","title":"夏普比率：每冒风险赚多少","tag":"指标","question":"怎么比两只基金的性价比？","content":"夏普比率=超额收益/波动，衡量每承担一单位风险换来的回报。越高越划算，是看风险调整后收益的核心指标。","points":["收益除以波动","风险调整后性价比","越高越划算"],"tip":"比基金先看夏普，别只看收益率。","diagram":"nav","source":"自编通俗版"},
{"cat":"finance","id":"finance-127","title":"最大回撤：最惨亏多少","tag":"风险","question":"买之前怎么知道会亏多惨？","content":"最大回撤是期内从最高点到最低点的最大跌幅，代表最糟糕时能亏多少。回撤越大越考验持有心态，控回撤就是控睡眠。","points":["最高点最低点跌幅","最惨亏损幅度","控回撤控心态"],"tip":"能接受的回撤决定你买什么。","diagram":"nav","source":"自编通俗版"},
{"cat":"finance","id":"finance-128","title":"资产配置：不把蛋放一篮","tag":"配置","question":"为什么全仓一种资产很危险？","content":"资产配置是把钱分到股、债、商品、现金等低相关资产，分散单一风险。经典结论：长期收益大部分来自配置而非择时。","points":["跨资产分散","降低单一风险","收益靠配置"],"tip":"先定股债比，再选具体标的。","diagram":"diversify","source":"自编通俗版"},
{"cat":"finance","id":"finance-129","title":"组合再平衡：涨多了就卖","tag":"策略","question":"为什么赚钱了反而要卖？","content":"再平衡是定期把偏离目标的仓位拉回原比例：股票涨多了卖一点、跌多了补一点，被动实现高抛低吸，防止某一资产占比失控。","points":["拉回目标比例","被动高抛低吸","防单一失控"],"tip":"半年或一年再平衡一次足够。","diagram":"dca","source":"自编通俗版"},
{"cat":"finance","id":"finance-130","title":"收益率曲线：经济的温度计","tag":"宏观","question":"为什么长短期利率倒挂吓人？","content":"收益率曲线是不同期限国债利率的连线。正常向上(长高短低)，倒挂(短高长低)常预示衰退，是市场最关注的宏观信号之一。","points":["期限利率连线","正常向上","倒挂预示衰退"],"tip":"看 2年与10年利差判衰退。","diagram":"bond","source":"自编通俗版"},
{"cat":"finance","id":"finance-131","title":"动量策略：跟着趋势走","tag":"策略","question":"涨的还会继续涨吗？","content":"动量假设近期涨的资产短期继续涨、跌的继续跌。趋势跟踪、追涨杀跌都属动量。有效但有回撤，需配合止损和分散。","points":["追近期强势","趋势会延续","需止损分散"],"tip":"动量在单边市有效，震荡市吃亏。","diagram":"feedback","source":"自编通俗版"},
{"cat":"finance","id":"finance-132","title":"价值投资：便宜是好货","tag":"理念","question":"为什么有人专挑冷门股？","content":"价值投资买价格低于内在价值的资产，等市场纠错。核心是安全边际：留足折扣再下手，靠时间换空间，不追热点。","points":["低估值等纠错","安全边际留折扣","时间换空间"],"tip":"好公司也要好价格才值得买。","diagram":"pe","source":"自编通俗版"},
{"cat":"finance","id":"finance-133","title":"期权：给持仓买保险","tag":"工具","question":"怎么给股票下跌上保险？","content":"买入认沽期权类似给持仓买跌保险：付少量权利金，股价大跌时期权增值对冲损失。代价是权利金会随时间损耗。","points":["认沽如跌保险","权利金换保护","时间损耗成本"],"tip":"大额持仓可用期权做尾部防护。","diagram":"bond","source":"自编通俗版"},
{"cat":"finance","id":"finance-134","title":"黄金：乱世避险资产","tag":"配置","question":"为什么一有危机就买黄金？","content":"黄金不生息，但在通胀、地缘冲突、货币贬值时往往走强，与传统资产低相关，是组合里的避险压舱石。配置 5-10% 即可。","points":["不升息但避险","与股债低相关","组合压舱石"],"tip":"黄金是保险不是主菜，少配。","diagram":"inflation","source":"自编通俗版"},
{"cat":"finance","id":"finance-135","title":"通胀保值 TIPS：抗通胀债券","tag":"工具","question":"怕通胀吃掉利息怎么办？","content":"TIPS 是本金随 CPI 上浮的通胀保值国债，通胀越高本金越大、利息越多，实际购买力被保护。适合怕通胀侵蚀的固定收益配置。","points":["本金随CPI上浮","通胀越高越赚","保护购买力"],"tip":"想抗通胀又求稳，TIPS 可配。","diagram":"inflation","source":"自编通俗版"},

# ---------- 认知思维 (think-121 ~ think-130) ----------
{"cat":"think","id":"think-121","title":"沉没成本：过去的别纠结","tag":"认知","question":"为什么赔了钱还舍不得走？","content":"沉没成本是已经花掉收不回的钱/时间。决策只看未来收益，不为已损失纠结。继续烂项目只是让损失更大。","points":["已花掉收不回","决策看未来","别为损失加注"],"tip":"项目该砍就砍，别算已投入。","diagram":"feedback","source":"自编通俗版"},
{"cat":"think","id":"think-122","title":"确认偏误：只看想看的","tag":"认知","question":"为什么人总能为观点找证据？","content":"确认偏误让人只关注支持自己看法的信息，忽略反例，越看越自信。想客观就主动找反面资料和唱反调的人。","points":["只信支持信息","忽略反例","主动找反面"],"tip":"每下结论先问：反对证据呢？","diagram":"feedback","source":"自编通俗版"},
{"cat":"think","id":"think-123","title":"幸存者偏差：看不见的失败","tag":"认知","question":"为什么学成功学常踩坑？","content":"我们只看到活下来的成功者，看不到大量沉默的失败者，于是高估成功率。评估机会要看全员样本，别被幸存者带偏。","points":["只见成功者","忽略失败样本","看全员才客观"],"tip":"问清失败率，比看成功案例重要。","diagram":"pareto","source":"自编通俗版"},
{"cat":"think","id":"think-124","title":"锚定效应：第一印象定价","tag":"认知","question":"为什么先看的数字影响判断？","content":"人对后续判断会被最先接触的数字锚住，如先见高价再砍价觉得划算。谈判中谁先出价、出什么价，往往定下整场基调。","points":["首数字定基调","影响后续判断","谈判先手有优势"],"tip":"做决策前清空脑中先入数字。","diagram":"pareto","source":"自编通俗版"},
{"cat":"think","id":"think-125","title":"损失厌恶：亏钱比赚钱痛","tag":"认知","question":"为什么同样100块亏比赚更揪心？","content":"人对损失的痛苦感约是同等收益快乐的两倍，导致该止损不止、该持有却卖。理解它才能克服怕亏乱操作。","points":["损失痛苦加倍","导致不止损","克服怕亏乱动"],"tip":"按规则交易，别被痛感带节奏。","diagram":"feedback","source":"自编通俗版"},
{"cat":"think","id":"think-126","title":"框架效应：说法改变选择","tag":"认知","question":"为什么同样的手术说法让人选不同？","content":"同一事实换个表述(存活率90% vs 死亡率10%)，人的选择就变。营销和谈判善用框架引导。识破框架才能做自主决定。","points":["表述改变选择","营销善用框架","识破才自主"],"tip":"把话翻成反面再想一次。","diagram":"systems","source":"自编通俗版"},
{"cat":"think","id":"think-127","title":"邓宁-克鲁格效应：越菜越自信","tag":"认知","question":"为什么新手常觉得自己行？","content":"能力不足的人既做不对也意识不到自己不对，处于愚昧之巅盲目自信；真专家反而知道自己不懂的多。保持谦逊靠持续学习。","points":["无能者不自知","新手最自信","专家知不足"],"tip":"遇到什么都懂的人要警惕。","diagram":"feedback","source":"自编通俗版"},
{"cat":"think","id":"think-128","title":"峰终定律：记忆看高潮结尾","tag":"体验","question":"为什么烂过程好结尾仍被记住好？","content":"人对体验的记忆由高峰(最强烈)和结尾决定，过程长短不重要。设计服务要在关键瞬间和收尾制造惊喜。","points":["记忆看高峰结尾","过程长短无所谓","收尾造惊喜"],"tip":"用户旅程的结束页要设计好。","diagram":"systems","source":"自编通俗版"},
{"cat":"think","id":"think-129","title":"蔡格尼克效应：没做完更惦记","tag":"心理","question":"为什么追剧停不下来？","content":"人对未完成的事记忆更深刻、更惦记，完成的事反而很快放下。产品用进度条、连续奖励利用这点提升留存。","points":["未完事更惦记","完事易放下","进度条促留存"],"tip":"把大任务拆成欲罢不能的小步。","diagram":"feedback","source":"自编通俗版"},
{"cat":"think","id":"think-130","title":"自我效能：信自己能成","tag":"成长","question":"为什么有人遇到困难越战越勇？","content":"自我效能是相信自己能达成目标的信念，高的人更愿挑战、遇挫更坚持。它靠小胜积累，每次做成一件难事就涨一点。","points":["信自己能达成","遇挫更坚持","小胜积累而成"],"tip":"用可完成的小目标喂养信心。","diagram":"second-curve","source":"自编通俗版"},

# ---------- 硬件PM (hwpm-111 ~ hwpm-120) ----------
{"cat":"hwpm","id":"hwpm-111","title":"看板管理：任务上墙看得见","tag":"协作","question":"团队进度怎么一眼看清？","content":"看板把任务分成待办/进行中/完成几列，卡片流动可视化，瓶颈卡在哪列一眼可见。是硬件项目跟进的轻量利器。","points":["任务分列流动","瓶颈可视化","轻量跟进度"],"tip":"限制在制品数，别让进行中堆太多。","diagram":"systems","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-112","title":"设计评审：上线前集体挑刺","tag":"评审","question":"怎么避免设计漏大问题？","content":"设计评审拉相关方(硬/软/测试/制造)集中过方案，提前挑刺比量产后返工便宜百倍。评审要留记录，结论落到责任人。","points":["多方集中挑刺","早于返工省钱","留记录定责任人"],"tip":"评审清单化，别靠临场发挥。","diagram":"feedback","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-113","title":"FMEA 实战：风险这样排","tag":"质量","question":"列了一堆失效先改哪个？","content":"失效模式与影响分析(FMEA)逐条评估严重度、发生频度、可探测度，三者相乘得风险优先数(RPN)，按 RPN 从高到低先改最危险的。是汽车行业标配质量工具。","points":["评严重频度探测","乘得风险优先数","按RPN先改危险"],"tip":"严重度高的失效必须有关键控制。","diagram":"pareto","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-114","title":"可靠性 MTBF：平均多久坏一次","tag":"可靠性","question":"怎么估产品能用多久？","content":"MTBF(平均无故障时间)是两次故障间隔的均值，衡量硬件稳定性。越高越可靠，但要看测试条件和样本量，别被漂亮数字骗。","points":["故障间隔均值","越高越稳","看测试条件"],"tip":"MTBF 要结合加速老化试验看。","diagram":"feedback","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-115","title":"物料编码 PN：一物一码","tag":"数据","question":"为什么 BOM 里不能重名料？","content":"物料编码(PN)给每个料唯一身份证，避免同名不同料或同料多名导致买错、用错。编码规则要含品类、规格、版本信息。","points":["每料唯一码","防买错用错","规则含品类规格"],"tip":"建料号前先查重，别重复建码。","diagram":"systems","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-116","title":"公差设计：松紧有度","tag":"设计","question":"零件为什么不能都卡死尺寸？","content":"公差是允许的制造误差范围。太紧难做贵、太松装不上或松旷。按功能要求定关键尺寸紧公差，非关键放宽省成本。","points":["允许制造误差","紧贵松坏","关键才收紧"],"tip":"公差表里标 RCC(关键控制尺寸)。","diagram":"pareto","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-117","title":"防静电 ESD：看不见的杀手","tag":"制造","question":"为什么摸芯片要戴手环？","content":"静电放电(ESD)瞬间高压能击穿精密器件，肉眼看不见却致良率下降。产线要接地手环、防静电桌垫、湿度控制。","points":["静电击穿器件","良率隐形杀手","接地控湿防护"],"tip":"敏感料存放用防静电包装。","diagram":"feedback","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-118","title":"OTA 升级：远程修bug","tag":"软件","question":"硬件出厂后还能改功能吗？","content":"OTA(空中升级)让设备联网后远程更新固件，补漏洞、加功能、调体验，省去召回。前提是升级要可回滚、不断电、校验签名。","points":["远程更固件","免召回补洞","可回滚校验"],"tip":"OTA 包必须签名，防被刷恶意固件。","diagram":"agent","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-119","title":"用户研究：别自己猜需求","tag":"需求","question":"怎么知道用户真想要什么？","content":"用户研究用访谈、观察、问卷还原真实场景和痛点，比拍脑袋准。注意别问用户要什么，而看他们实际怎么做。","points":["访谈观察问卷","还原真实痛点","看行为非说辞"],"tip":"可用性测试找 5 人就能发现多数问题。","diagram":"systems","source":"自编通俗版"},
{"cat":"hwpm","id":"hwpm-120","title":"竞品拆解 Teardown：对手底裤看穿","tag":"竞争","question":"怎么快速学对手的长处？","content":"拆解竞品从结构、BOM、用料、工艺、成本逐层分析，看清对方怎么实现、花多少。是硬件立项最有价值的情报来源。","points":["结构BOM工艺成本","看清实现方式","立项情报源"],"tip":"拆解要算到单件成本才值钱。","diagram":"pareto","source":"自编通俗版"},

# ---------- 市场营销 (mkt-111 ~ mkt-120) ----------
{"cat":"mkt","id":"mkt-111","title":"私域流量：把用户圈起来","tag":"运营","question":"为什么大促还要养自己的用户池？","content":"私域是把用户沉淀到微信/社群/App等可控渠道，反复触达不花广告费。核心是提供价值而非硬广，否则用户秒退群。","points":["沉淀可控渠道","反复免费触达","价值非硬广"],"tip":"私域先给利他内容，再谈转化。","diagram":"compound","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-112","title":"飞轮效应：自循环增长","tag":"增长","question":"为什么好产品能自己长用户？","content":"增长飞轮是用户价值→口碑→新用户→更多价值的自循环，一旦转动，获客成本递减、增长加速。贝索斯的飞轮是经典范例，关键在找到第一推动力。","points":["价值口碑自循环","获客成本递减","越转越快"],"tip":"找到你的飞轮第一推，先转起来。","diagram":"feedback","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-113","title":"A/B 测试：用数据拍板","tag":"实验","question":"两个方案到底用哪个？","content":"A/B 测试把流量随机分两组看不同版本的效果(点击/转化)，用数据而非直觉决策。关键是一次只变一个变量，样本够大才显著。","points":["随机分组比效果","数据替直觉","单变量才准"],"tip":"别一次测多个改动，归因会乱。","diagram":"dca","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-114","title":"净推荐值 NPS：愿不愿推荐","tag":"指标","question":"怎么简单衡量用户忠诚度？","content":"NPS 只问一句：多大可能推荐给我们？0-6 贬损者、7-8 中立、9-10 推荐者，推荐减贬损即得分。比满意度更贴近增长。","points":["一问定忠诚","推荐减贬损得分","更贴近增长"],"tip":"NPS 低先查产品和售后根因。","diagram":"feedback","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-115","title":"客户旅程：全程别掉链子","tag":"体验","question":"为什么各环节好却总丢单？","content":"客户旅程把认知→考虑→购买→使用→复购全链路画出，找每个断点和爽点。优化旅程比单点优化更能提升整体转化。","points":["全链路画出来","找断点与爽点","整体优化转化"],"tip":"旅程地图要标出情绪高低点。","diagram":"systems","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-116","title":"内容营销：用价值换注意","tag":"内容","question":"不打广告怎么被人看见？","content":"内容营销靠持续产出有用/有趣内容(文章、视频、白皮书)吸引目标用户，建立信任后再转化。慢但便宜且持久。","points":["有用内容吸用户","建信任再转化","慢但持久"],"tip":"内容要解决问题，不是自嗨宣传。","diagram":"compound","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-117","title":"网红投放 KOL：借别人的信任","tag":"投放","question":"为什么找博主带货比硬广灵？","content":"KOL 自带粉丝信任，借其背书降低用户决策门槛。选号看粉丝画像匹配度和互动率，别只盯粉丝量，水号坑人。","points":["借博主信任","降低决策门槛","看匹配非体量"],"tip":"小垂类 KOC 转化常胜大体量号。","diagram":"diversify","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-118","title":"数据埋点：用户行为留痕","tag":"数据","question":"怎么知道用户在哪步跑了？","content":"埋点在关键按钮/页面埋监测，记录点击、停留、转化，还原用户行为漏斗。没埋点等于盲运营，改版无据可依。","points":["关键处留监测","还原行为漏斗","无埋点即盲运营"],"tip":"上线前先列埋点需求清单。","diagram":"diversify","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-119","title":"转化漏斗：逐层漏多少","tag":"转化","question":"为什么 100 访客只成 1 单？","content":"漏斗把访问→浏览→加购→下单→支付逐层拆开，看每层流失率，最大的漏点就是最该优化的地方。优化一层胜过多处微调。","points":["逐层拆流失","找最大漏点","单点突破"],"tip":"先看哪层掉最多，再决定改什么。","diagram":"pareto","source":"自编通俗版"},
{"cat":"mkt","id":"mkt-120","title":"品牌资产：看不见的复利","tag":"品牌","question":"为什么同样产品大牌贵一倍？","content":"品牌资产是名称、符号、口碑积累的无形价值，让用户愿付溢价、优先选择、更易信任。它像复利，长期投入才显现。","points":["名称符号口碑","带来溢价信任","长期复利显现"],"tip":"品牌资产靠日积月累，别想速成。","diagram":"compound","source":"自编通俗版"},
]

check(c24, "8/24")
pool.extend(c24)
hist = [h for h in d['history'] if h['date'] != '2026-08-24']
hist.append({"date": "2026-08-24", "itemIds": [c['id'] for c in c24]})
d['history'] = sorted(hist, key=lambda x: x['date'])
d['dailyCount'] = 50
json.dump(d, open(KFILE, 'w'), ensure_ascii=False, indent=1)
print(f"合并完成: pool={len(d['pool'])}, history尾3={[h['date'] for h in d['history']][-3:]}")
