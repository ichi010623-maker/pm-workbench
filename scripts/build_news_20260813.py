# -*- coding: utf-8 -*-
import json, os

BASE = "/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench"
OLD = os.path.join(BASE, "data", "news.json")
OUT = OLD

with open(OLD, encoding="utf-8") as f:
    old = json.load(f)

# 沿用其它管线供数的频道（不覆盖）
carried = [it for it in old["items"] if it["category"] not in ("official", "hardware", "ai", "tech")]
print("carried:", len(carried), "categories:", sorted({it["category"] for it in carried}))

GEN = "2026-08-13T18:42:44+08:00"

fresh = [
  # ===== official 12 =====
  {"category":"official","priority":5,"title":"李强签署国务院令 公布行政法规修改废止决定","summary":"国务院总理李强签署国务院令，公布修改和废止部分行政法规的决定，为全面有效贯彻生态环境法典清理相关法规。","source":"新华网","url":"https://www.news.cn/politics/20260813/5d1adf2593f046b0a6cf349cc62d6885/c.html","pubTime":"2026-08-13","tags":["国务院令","行政法规","政策"]},
  {"category":"official","priority":4,"title":"三峡枢纽2026年通过量已达1亿吨","summary":"经济与交通枢纽数据显示，三峡枢纽年内通过量突破1亿吨，彰显内河航运活力与长江经济带物流韧性。","source":"新华网","url":"https://www.news.cn/fortune/20260813/99051cb5a7ce4bc7abf7361ac9fc7422/c.html","pubTime":"2026-08-13","tags":["三峡","航运","经济"]},
  {"category":"official","priority":4,"title":"新能源汽车月度新车销量占比首超60%","summary":"中汽协数据前7月新能源车产销近900万辆同比增近10%，7月月度新车销量占比首次突破60%。","source":"人民网","url":"http://finance.people.com.cn/n1/2026/0813/c1004-40778444.html","pubTime":"2026-08-13","tags":["新能源汽车","渗透率","汽车"]},
  {"category":"official","priority":4,"title":"安全应急装备产业“十五五”规划发布","summary":"安全应急装备产业发展“十五五”规划发布，为产业顶层设计提供指引，培育安全应急装备新增长点。","source":"人民网","url":"http://finance.people.com.cn/n1/2026/0813/c1004-40779166.html","pubTime":"2026-08-13","tags":["安全应急","十五五","装备"]},
  {"category":"official","priority":4,"title":"我国汽车出口延续强劲增长态势","summary":"7月汽车出口104.3万辆同比增81.3%，其中新能源车出口55.3万辆增145.5%，连续两月破百万辆。","source":"央视新闻","url":"https://news.cctv.com/2026/08/13/ARTIYv81QYIQxsmtxSpULH5G260813.shtml","pubTime":"2026-08-13","tags":["汽车出口","新能源车","外贸"]},
  {"category":"official","priority":4,"title":"整治食品添加剂滥用 查处2.3万余件","summary":"食安办等六部门综合治理食品添加剂滥用，各地查处超范围超限量使用案件2.3万余件，成效显著。","source":"央视新闻","url":"https://news.cctv.com/2026/08/13/ARTItwQHb7k8pG67hGvx7c4O260813.shtml","pubTime":"2026-08-13","tags":["食品安全","添加剂","监管"]},
  {"category":"official","priority":4,"title":"织密“六张网”支撑高质量发展","summary":"聚焦水网、电网、算力网、通信网等“六张网”建设，从用上电到用绿电、算力像用电一样方便。","source":"光明网","url":"https://news.gmw.cn/2026-08/13/content_38940388.htm","pubTime":"2026-08-13","tags":["基础设施","算力网","高质量发展"]},
  {"category":"official","priority":4,"title":"生态环境法典的原创性意义与世界贡献","summary":"生态环境法典今年3月通过、8月15日施行，系世界首部以“生态环境”命名的法典，筑牢美丽中国法治基石。","source":"光明网","url":"https://theory.gmw.cn/2026-08/13/content_38940893.htm","pubTime":"2026-08-13","tags":["生态环境","法典","生态文明"]},
  {"category":"official","priority":4,"title":"华中首例全侵入式脑机接口手术完成","summary":"华中地区首例全侵入式脑机接口手术在武汉同济医院完成，标志国内脑机接口临床技术取得突破性进展。","source":"中国新闻网","url":"https://www.chinanews.com.cn/shipin/cns-d/2026/08-13/news1065299.shtml","pubTime":"2026-08-13","tags":["脑机接口","医疗","科技突破"]},
  {"category":"official","priority":3,"title":"带薪休假为何很多人不敢休不能休","summary":"聚焦国内带薪休假制度落实难点，探讨劳动者“不敢休、不能休”的现实困境，引发广泛职场共鸣。","source":"中国新闻网","url":"https://www.chinanews.com.cn/gn/2026/08-13/10677093.shtml","pubTime":"2026-08-13","tags":["带薪休假","民生","职场"]},
  {"category":"official","priority":4,"title":"央行谋划出台增量政策 加大逆周期调节","summary":"央行表态将谋划出台增量政策、加大逆周期调节力度，稳增长信号明确，为实体经济与资本市场提供支撑。","source":"央广网","url":"https://www.cnr.cn/news/20260813/t20260813_527760423.shtml","pubTime":"2026-08-13","tags":["央行","货币政策","稳增长"]},
  {"category":"official","priority":4,"title":"我国牵头制定智慧城市数据利用国际标准","summary":"中国牵头制定的智慧城市数据利用顶层框架国际标准发布，体现我国在智慧城市领域的科技与标准话语权。","source":"央广网","url":"https://www.cnr.cn/news/20260813/t20260813_527760435.shtml","pubTime":"2026-08-13","tags":["智慧城市","国际标准","数据"]},
  # ===== hardware 7 (IT之家) =====
  {"category":"hardware","priority":4,"title":"iPhone 18 Pro 今秋发布 标准版推迟","summary":"和硕间接确认iPhone 18 Pro今秋发布，标准版推迟至明年；Ultra下月8日发布不与Pro同步，产品节奏生变。","source":"IT之家","url":"https://www.ithome.com/0/989/008.htm","pubTime":"2026-08-13 07:03","tags":["苹果","iPhone","发布"]},
  {"category":"hardware","priority":3,"title":"小米澎湃 OS 4 Beta 首批机型招募","summary":"卢伟冰称不开发布会，小米17、REDMI K90等首批Beta机型开启招募，明日推送柔光玻璃等系统升级。","source":"IT之家","url":"https://www.ithome.com/0/989/039.htm","pubTime":"2026-08-13 09:07","tags":["小米","澎湃OS","系统"]},
  {"category":"hardware","priority":3,"title":"小米神秘阔折叠手机现身系统 Beta","summary":"一款小米神秘阔折叠手机现身澎湃OS 4 Beta介绍页，有望为MIX Fold 5，折叠屏手机动态引发关注。","source":"IT之家","url":"https://www.ithome.com/0/989/199.htm","pubTime":"2026-08-13 14:14","tags":["小米","折叠屏","新品"]},
  {"category":"hardware","priority":3,"title":"佳明首款智能戒指 CIRQA 曝光","summary":"佳明首款智能戒指CIRQA曝光，正式进军可穿戴戒指市场，延续其在健康运动穿戴领域的产品纵深。","source":"IT之家","url":"https://www.ithome.com/0/989/248.htm","pubTime":"2026-08-13 15:29","tags":["佳明","智能戒指","可穿戴"]},
  {"category":"hardware","priority":3,"title":"索泰 20 周年 RTX 5080 钛金显卡上线","summary":"索泰20周年纪念款GeForce RTX 5080 SOLID CORE OC钛金色版上线官网，主打高端个性化显卡市场。","source":"IT之家","url":"https://www.ithome.com/0/989/250.htm","pubTime":"2026-08-13 15:36","tags":["索泰","显卡","RTX"]},
  {"category":"hardware","priority":3,"title":"联想来酷 Air 14 2026 新增版本","summary":"联想来酷Air 14 2026笔记本新增酷睿3-304/5-320处理器版本，3999元起，拓展轻薄本入门选择。","source":"IT之家","url":"https://www.ithome.com/0/989/026.htm","pubTime":"2026-08-13 08:26","tags":["联想","笔记本","轻薄本"]},
  {"category":"hardware","priority":3,"title":"REDMI K100 Pro/Max 手机发布","summary":"REDMI K100 Pro/Max发布，国补价3199元起，最高9070mAh电池、Bose联合调音，覆盖大电池性能机型。","source":"IT之家","url":"https://www.ithome.com/0/988/472.htm","pubTime":"2026-08-13","tags":["REDMI","手机","大电池"]},
  # ===== ai 6 =====
  {"category":"ai","priority":4,"title":"DeepSeek V4 Pro 正式版 API 上线","summary":"深夜上线V4 Pro正式版API，多项测试性能接近Fable 5，国产大模型迭代加速，开发者可即时调用。","source":"IT之家","url":"https://www.ithome.com/0/989/000.htm","pubTime":"2026-08-13 00:05","tags":["DeepSeek","大模型","API"]},
  {"category":"ai","priority":3,"title":"面壁智能启动 IPO 清华系背景","summary":"面壁智能启动IPO，以清华“导师制”培养体系著称，又一手带出亿级财富学生，制度红利受资本关注。","source":"36氪","url":"https://36kr.com/p/3937662757951104","pubTime":"2026-08-13","tags":["面壁智能","IPO","大模型"]},
  {"category":"ai","priority":3,"title":"字节 AI 数据部门“升咖”","summary":"字节AI数据部门地位提升，蒸馏与否本质是是否拒绝更强模型知识，组织调整折射大模型竞争焦点。","source":"36氪","url":"https://36kr.com/p/3937679604914057","pubTime":"2026-08-13","tags":["字节","AI数据","组织"]},
  {"category":"ai","priority":3,"title":"从开放模型到开放生态 AI 开源下半场","summary":"近期AI开源圈发生多起标志性事件，从“开放模型”走向“开放生态”，开源进入以生态竞争为的下半场。","source":"36氪","url":"https://36kr.com/p/3937582881815945","pubTime":"2026-08-13","tags":["开源","AI生态","大模型"]},
  {"category":"ai","priority":3,"title":"AI 把数码硬件都变贵了","summary":"AI同时改变上游存储需求、终端配置与新品结构，数码产品定价逻辑多出一条成本链，终端普遍涨价。","source":"36氪","url":"https://36kr.com/p/3937609467182211","pubTime":"2026-08-13","tags":["AI","硬件涨价","存储"]},
  {"category":"ai","priority":4,"title":"Ilya 首个模型曝光 SSI 持续学习","summary":"SSI首个模型曝光，Ilya方向指向持续学习，这家以安全超级智能为目标的公司交出第一份成果答卷。","source":"36氪","url":"https://36kr.com/p/3937647639116936","pubTime":"2026-08-13","tags":["Ilya","SSI","大模型"]},
  # ===== tech 5 (stdaily) =====
  {"category":"tech","priority":4,"title":"我国实现单铜氧层高温超导体制备","summary":"我国科学家团队成功实现单铜氧层高温超导体制备，为高温超导机理研究与新材料体系提供关键突破。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/13/content_563423.html","pubTime":"2026-08-13 16:17","tags":["高温超导","材料","科研"]},
  {"category":"tech","priority":4,"title":"量子存储器纠缠距离提升至420公里","summary":"我国科学家将量子存储器间纠缠距离提升至420公里，为远距离量子通信与量子网络实用化奠基。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/13/content_563373.html","pubTime":"2026-08-13 14:48","tags":["量子","通信","科研"]},
  {"category":"tech","priority":3,"title":"第二届世界人形机器人运动会 16 国参赛","summary":"全球16国将参加第二届世界人形机器人运动会，参赛规模同比增长138%，人形机器人产业热度攀升。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/13/content_563400.html","pubTime":"2026-08-13 15:19","tags":["人形机器人","赛事","产业"]},
  {"category":"tech","priority":3,"title":"全国碳市场累计成交量破 9 亿吨","summary":"全国碳排放权交易市场累计成交量突破9亿吨，碳价发现与减排激励功能持续增强，绿色转型提速。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/13/content_563398.html","pubTime":"2026-08-13 15:19","tags":["碳市场","双碳","绿色"]},
  {"category":"tech","priority":3,"title":"2026 未来科学大奖揭晓","summary":"2026未来科学大奖揭晓，表彰在生命科学、物质科学及数学与计算机科学领域的杰出华裔科学家贡献。","source":"中国科技网","url":"https://www.stdaily.com/web/gdxw/2026-08/13/content_563314.html","pubTime":"2026-08-13 11:39","tags":["未来科学大奖","科研","奖项"]},
]

# 校验本任务 4 类字段
errs = []
FRESH_CATS = {"official","hardware","ai","tech"}
for it in fresh:
    assert it["category"] in FRESH_CATS
    if len(it["title"]) > 40: errs.append(("title>40", it["title"]))
    if len(it["summary"]) > 100: errs.append(("summary>100", it["title"], len(it["summary"])))
    if len(it["tags"]) != 3: errs.append(("tags!=3", it["title"], len(it["tags"])))
    if not (1 <= it["priority"] <= 5): errs.append(("priority", it["title"]))
    if not it["url"].startswith("http"): errs.append(("url", it["title"]))
print("fresh count:", len(fresh), "field errors:", errs)

# 汇总并重新编号 id
items = fresh + carried
for i, it in enumerate(items, start=1):
    it["id"] = f"n{i}"

doc = {
    "generatedAt": GEN,
    "categories": old["categories"],  # 沿用 8 元素 categories
    "items": items,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

# 读回校验
with open(OUT, encoding="utf-8") as f:
    chk = json.load(f)
cat_count = {}
for it in chk["items"]:
    cat_count[it["category"]] = cat_count.get(it["category"], 0) + 1
print("TOTAL items:", len(chk["items"]))
print("by category:", cat_count)
print("ids unique:", len({it["id"] for it in chk["items"]}) == len(chk["items"]))
print("generatedAt:", chk["generatedAt"])
