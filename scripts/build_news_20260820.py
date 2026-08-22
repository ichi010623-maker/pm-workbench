# -*- coding: utf-8 -*-
import json, os

BASE = "/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench"
OLD = os.path.join(BASE, "data/news.json")
GEN = "2026-08-20T13:04:53+08:00"

OWN = ["official", "hardware", "ai", "tech"]

# ---- read old, carry non-own categories ----
with open(OLD, encoding="utf-8") as f:
    old = json.load(f)
carried = [it for it in old["items"] if it["category"] not in OWN]
old_cats = old["categories"]

# ---- fresh items ----
fresh = [
 # official (12)
 {"category":"official","priority":5,"title":"恒大集团恒大地产许家印等案一审宣判","summary":"深圳市中级人民法院一审公开宣判恒大集团、恒大地产及许家印案，许家印被判无期徒刑，多名责任人员获刑并处罚金。","source":"新华网","url":"https://www.news.cn/legal/20260820/737dfb54ab564fb8a549ba392af9fb0a/c.html","pubTime":"2026-08-20","tags":["恒大","司法审判","经济案件"]},
 {"category":"official","priority":5,"title":"网络数据安全风险评估办法今起施行","summary":"《网络数据安全风险评估办法》自8月20日起施行，明确重要数据处理者须定期开展风险评估并申请认证，企业数据合规门槛提升。","source":"新华网","url":"https://www.news.cn/politics/20260820/c6b5e53ccc554d1c8fbc2bb820e756ab/c.html","pubTime":"2026-08-20","tags":["数据安全","政策","合规"]},
 {"category":"official","priority":4,"title":"我国首次实现火箭陆地回收 太空多“雄安星”","summary":"朱雀三号遥二发射并成功实现火箭陆地回收，我国商业航天复用技术实现关键突破，多颗“雄安星”成功入轨。","source":"人民网","url":"http://finance.people.com.cn/n1/2026/0820/c1004-40782697.html","pubTime":"2026-08-20","tags":["航天","火箭回收","科技突破"]},
 {"category":"official","priority":3,"title":"前7月高技术产业投资同比增5% 电子电路增57.7%","summary":"前7个月高技术产业投资同比增长5%，其中电子电路制造投资增长57.7%，高端制造与电子链条扩产动能强劲。","source":"人民网","url":"http://finance.people.com.cn/n1/2026/0820/c1004-40782819.html","pubTime":"2026-08-20","tags":["高技术投资","电子电路","经济数据"]},
 {"category":"official","priority":4,"title":"上海发布优化房地产政策 5方面8项措施","summary":"上海六部门联合印发通知，从限购、信贷、公积金等5方面推出8项优化措施，满足刚性与改善性住房需求。","source":"央视新闻","url":"https://jingji.cctv.com/2026/08/20/ARTIsdrgZYplSJkfxweMTbW4260820.shtml","pubTime":"2026-08-20","tags":["房地产","上海","政策"]},
 {"category":"official","priority":4,"title":"从“大市场”到“强磁场” 外资加速拥抱中国新机遇","summary":"中国欧盟商会调查显示75%受访企业认可中国生产效率、94%将中国视为重要供应链采购地，外资看好创新与效率红利。","source":"央视新闻","url":"https://news.cctv.com/2026/08/20/ARTINYEej5u6874uiV8MNTwG260820.shtml","pubTime":"2026-08-20","tags":["外资","供应链","开放经济"]},
 {"category":"official","priority":4,"title":"2026世界机器人大会在北京开幕","summary":"2026世界机器人大会在北京亦庄开幕，聚焦具身智能与产业落地，百余家企业展示人形、协作与服务机器人新品。","source":"光明网","url":"https://economy.gmw.cn/2026-08/20/content_38952808.htm","pubTime":"2026-08-20","tags":["机器人","会展","科技产业"]},
 {"category":"official","priority":3,"title":"中宣部卫健委联合发布“最美医生”先进事迹","summary":"中央宣传部、国家卫健委联合发布“最美医生”先进事迹，弘扬医疗卫生战线爱岗敬业、护佑生命的职业精神。","source":"光明网","url":"https://news.gmw.cn/2026-08/20/content_38952198.htm","pubTime":"2026-08-20","tags":["医疗卫生","最美医生","政策发布"]},
 {"category":"official","priority":5,"title":"秦皇岛一底商火灾致8人死亡","summary":"河北秦皇岛海港区一底商发生火灾，造成8人死亡，事故暴露基层消防安全隐患，相关处置与调查已启动。","source":"中国新闻网","url":"https://www.chinanews.com.cn/sh/2026/08-20/10680818.shtml","pubTime":"2026-08-20 10:26","tags":["火灾","秦皇岛","民生安全"]},
 {"category":"official","priority":4,"title":"最高法发布著作权民事纠纷司法解释修改","summary":"最高人民法院发布著作权民事纠纷司法解释修改决定，细化网络侵权、AI生成内容等新型案件裁判规则。","source":"中国新闻网","url":"https://www.chinanews.com.cn/fz/2026/08-20/10680840.shtml","pubTime":"2026-08-20 11:03","tags":["最高法","著作权","司法"]},
 {"category":"official","priority":4,"title":"240小时过境免签“朋友圈”扩至57国","summary":"自8月20日起吉尔吉斯斯坦、越南适用240小时过境免签，适用国家增至57国，海南入境免签扩至61国。","source":"央广网","url":"https://www.cnr.cn/lvyou/dj/20260820/t20260820_527783654.shtml","pubTime":"2026-08-20","tags":["出入境政策","免签扩容","旅游便利化"]},
 {"category":"official","priority":4,"title":"国产“深海空间站”80米海底成功换刀","summary":"国产深海装备在80米海底完成盾构机换刀作业，验证自主研发深海作业能力，支撑深海空间站建设。","source":"央广网","url":"https://www.cnr.cn/tech/gstj/20260820/t20260820_527783489.shtml","pubTime":"2026-08-20","tags":["深海装备","科技突破","自主研发"]},
 # hardware (7)
 {"category":"hardware","priority":3,"title":"宇树推出仿生7轴灵巧机械臂 9900元起","summary":"宇树科技发布仿生7轴灵巧机械臂，售价9900元起，面向科研与轻量工业场景，补齐全栈机器人硬件矩阵。","source":"IT之家","url":"https://www.ithome.com/0/992/067.htm","pubTime":"2026-08-20 12:13","tags":["宇树","机械臂","机器人"]},
 {"category":"hardware","priority":3,"title":"谷歌Pixel 11系列上线自定义振动功能","summary":"谷歌Pixel 11系列新增自定义振动模式，用户可为不同通知设置专属振动触感，强化安卓可穿戴交互体验。","source":"IT之家","url":"https://www.ithome.com/0/992/069.htm","pubTime":"2026-08-20 12:33","tags":["Pixel","安卓","手机"]},
 {"category":"hardware","priority":3,"title":"比亚迪方程豹方程S/S GT开启预订","summary":"比亚迪方程豹方程S/S GT开启预订，预订价23至28万元，主打智能越野与高性能电驱，丰富硬派新能源矩阵。","source":"IT之家","url":"https://www.ithome.com/0/991/999.htm","pubTime":"2026-08-20 11:00","tags":["比亚迪","智能汽车","新能源"]},
 {"category":"hardware","priority":3,"title":"泰坦军团推QD Mini LED曲面显示器M34E7S","summary":"泰坦军团发布M34E7S曲面显示器，34英寸QD Mini LED、240Hz刷新，面向电竞与创作的高刷专业显示市场。","source":"IT之家","url":"https://www.ithome.com/0/992/040.htm","pubTime":"2026-08-20 11:58","tags":["显示器","Mini LED","电脑硬件"]},
 {"category":"hardware","priority":2,"title":"七工匠MF 75mm F1.4全画幅镜头发布","summary":"七工匠发布MF 75mm F1.4全画幅镜头，首发价569元起，延续高性价比手动镜头路线，面向人像摄影用户。","source":"IT之家","url":"https://www.ithome.com/0/992/072.htm","pubTime":"2026-08-20 13:03","tags":["镜头","摄影","数码硬件"]},
 {"category":"hardware","priority":2,"title":"长安第四代CS55PLUS混动上市 7.99万起","summary":"长安第四代CS55PLUS混动版上市，限时权益价7.99万元起，主打经济家用SUV市场，强化插混产品竞争力。","source":"IT之家","url":"https://www.ithome.com/0/991/997.htm","pubTime":"2026-08-20 10:59","tags":["长安","混动","汽车"]},
 {"category":"hardware","priority":2,"title":"手机充电为什么越来越快？","summary":"科普解读手机快充技术演进，从电荷泵到氮化镓与多电芯方案，充电功率十年跃升背后是材料与架构升级。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/20/content_566771.html","pubTime":"2026-08-20 10:31","tags":["快充","充电技术","消费电子"]},
 # ai (6)
 {"category":"ai","priority":4,"title":"DeepSeek Harness新版本：14项更新多模态拉满","summary":"DeepSeek Harness发布新版本，带来14项更新，多模态能力显著增强，并扩容Claude Code、Codex子代理体系。","source":"36氪","url":"https://36kr.com/p/3947115501845891","pubTime":"2026-08-20","tags":["DeepSeek","大模型","多模态"]},
 {"category":"ai","priority":3,"title":"Sora退场 国产AI视频崛起迎拐点","summary":"OpenAI停止Sora后，国产AI视频生成加速落地变现，2026年被视为AI视频从demo走向商业拐点的关键年份。","source":"36氪","url":"https://36kr.com/p/3946498550922372","pubTime":"2026-08-20","tags":["AI视频","大模型","生成式AI"]},
 {"category":"ai","priority":3,"title":"小米展出新一代人形机器人 工厂实训4个月","summary":"小米在WRC展出新一代人形机器人，经汽车工厂4个月实训迭代，雷军称未来5年将有大批量人形机器人进厂。","source":"36氪","url":"https://36kr.com/p/3947315943472512","pubTime":"2026-08-20","tags":["小米","人形机器人","具身智能"]},
 {"category":"ai","priority":3,"title":"灵巧手狂卷WRC2026 从配件到行业C位","summary":"2026世界机器人大会上灵巧手成为核心焦点，从附属配件跃升为具身智能落地关键部件，攻坚战才刚开始。","source":"36氪","url":"https://36kr.com/p/3946516682970761","pubTime":"2026-08-20","tags":["灵巧手","机器人","具身智能"]},
 {"category":"ai","priority":3,"title":"清华中科院具身大脑企业融资10亿","summary":"清华、中科院背景的具身大脑企业完成10亿元融资，首创超少样本具身操作大模型，已获数亿元海外订单。","source":"36氪","url":"https://36kr.com/p/3947288204770693","pubTime":"2026-08-20","tags":["具身智能","融资","大模型"]},
 {"category":"ai","priority":3,"title":"宇树主导四足机器人 维他动力拿下6%","summary":"宇树科技主导国内四足机器人市场，维他动力在四足卖出近亿元后悄然切入人形赛道，已拿下约6%份额。","source":"36氪","url":"https://36kr.com/p/3946500551327111","pubTime":"2026-08-20","tags":["宇树","四足机器人","市场"]},
 # tech (5)
 {"category":"tech","priority":4,"title":"中外科学家实现真空涨落增强超导效应","summary":"中外联合团队在实验中观测到真空涨落对超导的增强效应，为非常规超导机理与量子材料研究提供新证据。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/20/content_566595.html","pubTime":"2026-08-20","tags":["超导","量子材料","科研"]},
 {"category":"tech","priority":3,"title":"热带暖池“遥控”致南极冰盖罕见增重","summary":"研究发现热带暖池远程“遥控”导致南极冰盖质量增加约6950亿吨，为近20年重力卫星观测期最大增幅。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/20/content_566632.html","pubTime":"2026-08-20 09:59","tags":["南极","气候","科研"]},
 {"category":"tech","priority":3,"title":"“科技+”解锁文旅消费新场景","summary":"活力中国调研行显示，燕尾檐下逐长空等“科技+文旅”融合项目激活研学、文博消费，点亮夏日市场。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/20/content_566633.html","pubTime":"2026-08-20 09:59","tags":["科技应用","文旅","消费"]},
 {"category":"tech","priority":3,"title":"Stripe超80亿美元收购OpenRouter","summary":"支付巨头Stripe以超80亿美元收购AI模型分发平台OpenRouter，全球千万开发者的模型调用入口一夜易主。","source":"36氪","url":"https://36kr.com/p/3947211193154952","pubTime":"2026-08-20","tags":["AI基建","OpenRouter","并购"]},
 {"category":"tech","priority":4,"title":"中性原子量子公司具备超千比特整机交付","summary":"中性原子量子企业一年完成四轮近10亿元融资，实现最高2310个无缺陷物理比特阵列，具备超千比特整机交付能力。","source":"36氪","url":"https://36kr.com/p/3946560900185480","pubTime":"2026-08-20","tags":["量子计算","融资","前沿科技"]},
]

# merge + renumber
items = fresh + carried
for i, it in enumerate(items, 1):
    it["id"] = f"n{i}"

out = {"generatedAt": GEN, "categories": old_cats, "items": items}

# ---- validate ----
errs = []
field_set = {"category","priority","title","summary","source","url","pubTime","tags","id"}
for it in fresh:
    if set(it.keys()) != field_set:
        errs.append(("field", it["title"]))
    if len(it["tags"]) != 3:
        errs.append(("tags", it["title"], len(it["tags"])))
    if len(it["title"]) > 40:
        errs.append(("title>40", it["title"]))
    if len(it["summary"]) > 100:
        errs.append(("summary>100", it["title"], len(it["summary"])))
    if not (1 <= it["priority"] <= 5):
        errs.append(("priority", it["title"]))
    if not (it["url"].startswith("http")):
        errs.append(("url", it["title"]))
ids = [it["id"] for it in items]
if len(ids) != len(set(ids)):
    errs.append(("dup id",))

from collections import Counter
own_counts = Counter(it["category"] for it in fresh)
print("fresh counts:", dict(own_counts))
print("carried:", len(carried), "total:", len(items))
print("errors:", errs)

with open(OLD, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print("written:", OLD)
