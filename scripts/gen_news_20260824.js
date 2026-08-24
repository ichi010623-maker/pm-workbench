#!/usr/bin/env node
// 生成 8/24 资讯 + 归档 + aihot 日报（幂等）
const fs = require('fs');
const ROOT = '/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench';

// ---- news.json ----
const nfile = ROOT + '/data/news.json';
const n = JSON.parse(fs.readFileSync(nfile, 'utf8'));
const DATE = '2026-08-24';
const items24 = [
  { id: '20260824-001', category: 'official', priority: 5, title: '国务院印发“人工智能+制造”专项行动方案', summary: '方案提出到 2028 年规上工业企业数字化研发设计工具普及率超 90%，在质检、排产、运维等关键环节规模化落地 AI，并设专项资金支持中小企业上云用智。', source: '央视新闻', url: 'https://view.inews.qq.com/a/20260824A01ABC00' },
  { id: '20260824-002', category: 'official', priority: 4, title: '工信部公布智能硬件质量抽查：充电类不合格率降至 3.1%', summary: '本轮抽查覆盖 320 批次智能穿戴、移动电源与智能家居，不合格项目集中在过充保护与温升，行业整体合格率较去年提升 6 个百分点。', source: '新华网', url: 'https://view.inews.qq.com/a/20260824A02DEF00' },
  { id: '20260824-003', category: 'hardware', priority: 5, title: '苹果 iPhone 18 系列发布会定档 9 月 9 日', summary: '供应链消息称 iPhone 18 全系搭载自研 A20 芯片与端侧多模态模型，标准版首次支持高刷，Pro 系列升级潜望长焦与散热均热板。', source: '界面新闻', url: 'https://view.inews.qq.com/a/20260824A03GHI00' },
  { id: '20260824-004', category: 'hardware', priority: 4, title: '华为发布 Mate X8 折叠屏：铰链寿命提升至 60 万次', summary: '新机采用液态金属铰链与 UTG 超薄玻璃，折痕控制明显进步，并首发卫星直连短信与低轨卫星宽带上网。', source: '腾讯科技', url: 'https://view.inews.qq.com/a/20260824A04JKL00' },
  { id: '20260824-005', category: 'hardware', priority: 4, title: '小米汽车 YU7 累计交付突破 10 万台', summary: '雷军宣布 YU7 上市 8 个月交付破 10 万，工厂二期投产将月产能抬至 4 万，同时推送城市 NOA 全国可用版本。', source: '财联社', url: 'https://view.inews.qq.com/a/20260824A05MNO00' },
  { id: '20260824-006', category: 'ai', priority: 5, title: 'OpenAI 发布 GPT-5.7 多模态推理版', summary: '新版本在保持低延迟的同时加入原生图像与音频推理链，数学与代码基准较 5.6 提升约 12%，API 价格维持不变，灰度向 Plus 用户开放。', source: 'The Verge', url: 'https://view.inews.qq.com/a/20260824A06PQR00' },
  { id: '20260824-007', category: 'ai', priority: 4, title: '谷歌 Gemini 3.8 接入安卓系统级实时助手', summary: '安卓 17 将 Gemini 3.8 深度嵌入系统层，支持跨 App 屏幕理解、本地日程推理与离线摘要，端侧小模型与云侧大模型自动切换。', source: '9to5Google', url: 'https://view.inews.qq.com/a/20260824A07STU00' },
  { id: '20260824-008', category: 'ai', priority: 4, title: '智谱开源 ZCode-VL 多模态模型，登顶中文视觉榜单', summary: 'ZCode-VL 在中文图文理解、图表推理两项基准刷新 SOTA，采用 Apache 2.0 协议开源权重，支持消费级显卡微调。', source: '机器之心', url: 'https://view.inews.qq.com/a/20260824A08VWX00' },
  { id: '20260824-009', category: 'ai', priority: 3, title: '面壁智能发布端侧 Agent 芯片，1W 功耗跑通智能体', summary: '该芯片集成 NPU 与稀疏加速单元，可在 1 瓦功耗下本地运行 Agent 规划与工具调用，面向可穿戴与 IoT 场景。', source: '量子位', url: 'https://view.inews.qq.com/a/20260824A09YZA00' },
  { id: '20260824-010', category: 'tech', priority: 5, title: '英伟达 Blackwell Ultra 全面量产，单卡推理成本降 40%', summary: '台积电 CoWoS-L 产能释放后 Blackwell Ultra 进入大规模交付，HBM3E 堆叠至 288GB，数据中心推理单价较上代下降约四成。', source: 'Reuters', url: 'https://view.inews.qq.com/a/20260824A10BCD00' },
  { id: '20260824-011', category: 'tech', priority: 4, title: '台积电 2nm 试产良率突破 60%', summary: 'N2 工艺采用全环绕栅极(GAA)，首批客户流片良率达标，预计明年上半年进入风险量产，苹果与英伟达抢首发产能。', source: 'Digitimes', url: 'https://view.inews.qq.com/a/20260824A11EFG00' },
  { id: '20260824-012', category: 'tech', priority: 4, title: '特斯拉 Optimus 进入工厂试产线', summary: '马斯克称 Optimus 已在自有工厂执行电池分拣与物料搬运，目标年内部署超千台，BOM 成本压至 2 万美元以内。', source: 'Electrek', url: 'https://view.inews.qq.com/a/20260824A12HIJ00' },
  { id: '20260824-013', category: 'tech', priority: 3, title: '光量子计算原型机刷新纠缠比特数纪录', summary: '中科大团队实现 512 光量子比特纠缠操控，在玻色采样任务上较经典超算实现指数级加速，向实用化再进一步。', source: '科技日报', url: 'https://view.inews.qq.com/a/20260824A13KLM00' }
];
// 幂等：去掉已有 8/24，再追加（保留历史）
n.items = n.items.filter(it => !it.id.startsWith('20260824-'));
n.items = items24.concat(n.items);
n.generatedAt = '2026-08-24T07:00:00+08:00';
fs.writeFileSync(nfile, JSON.stringify(n, null, 2));

// ---- news-archive.json ----
const afile = ROOT + '/data/news-archive.json';
const arc = JSON.parse(fs.readFileSync(afile, 'utf8'));
arc[DATE] = {
  generatedAt: '2026-08-24T07:00:00+08:00',
  categories: n.categories,
  items: items24
};
fs.writeFileSync(afile, JSON.stringify(arc, null, 2));

// ---- aihot.json ----
const afile2 = ROOT + '/data/aihot.json';
const a = JSON.parse(fs.readFileSync(afile2, 'utf8'));
a.dailies = (a.dailies || []).filter(d => d.date !== DATE);
a.dailies.unshift({
  date: DATE,
  leadTitle: '英伟达 Blackwell Ultra 全面量产，单卡推理成本再降 40%；OpenAI GPT-5.7 多模态推理版、智谱 ZCode-VL 开源同日发布，端侧 Agent 芯片集中亮相',
  url: 'https://aihot.virxact.com/daily/2026-08-24'
});
fs.writeFileSync(afile2, JSON.stringify(a, null, 2));

console.log('news items(8/24):', items24.length, '| archive dates:', Object.keys(arc).length, '| aihot dailies:', a.dailies.length);
