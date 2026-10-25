import { pickLang, type GameLang } from "../i18n.js";
import type {
  AssetCategory,
  AssetSpec,
  LevelSpec,
  MarketShockSpec,
  QuarterRegime,
} from "./types.js";

function buildCovariance(vols: number[], corr: number[][]): number[][] {
  const n = vols.length;
  const cov: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const val = vols[i] * vols[j] * corr[i][j];
      row.push(i === j ? val + 1e-5 : val);
    }
    cov.push(row);
  }
  return cov;
}

export const CORE_ASSETS: Record<string, AssetSpec> = {
  sp500: {
    id: "sp500",
    ticker: "SP500",
    color: "#38bdf8",
    category: "broad",
    unlockedAtLevel: 1,
    expectedReturn: 0.1,
    volatility: 0.16,
    name: {
      ja: "米国株全体 (S&P500)",
      en: "US Broad Market (S&P500)",
      zh: "美股大盘 (标普500)",
    },
    roleDesc: {
      ja: "米国市場の成長を反映する王道コア資産。中程度のリスク・リターン",
      en: "Core equity index reflecting overall US growth. Balanced risk-reward",
      zh: "代表美股整体成长的基石资产，中等风险收益",
    },
  },
  bond: {
    id: "bond",
    ticker: "BOND",
    color: "#94a3b8",
    category: "broad",
    unlockedAtLevel: 1,
    expectedReturn: 0.045,
    volatility: 0.04,
    name: {
      ja: "米国短期国債 (守りの盾)",
      en: "Short US Treasury (Safety Shield)",
      zh: "短期美债 (防御之盾)",
    },
    roleDesc: {
      ja: "変動が極めて小さい安全資産。暴落時に資産を守る盾となる",
      en: "Ultra-low volatility anchor protecting capital during equity pullbacks",
      zh: "极低波动的安全资产，在股市回撤时充当防御护盾",
    },
  },
  gold: {
    id: "gold",
    ticker: "GOLD",
    color: "#facc15",
    category: "commodity",
    unlockedAtLevel: 1,
    expectedReturn: 0.085,
    volatility: 0.12,
    name: {
      ja: "ゴールド (金ヘッジ)",
      en: "Gold Safe-Haven (Hedge)",
      zh: "黄金避险 (对冲)",
    },
    roleDesc: {
      ja: "有事の金。株式が急落した時に逃避資金が流入して値上がりする",
      en: "Classic flight-to-safety asset that tends to rise when equities drop",
      zh: "经典避险资产，当股市暴跌时往往吸引避险资金上涨",
    },
  },
  tech: {
    id: "tech",
    ticker: "TECH",
    color: "#60a5fa",
    category: "sector",
    unlockedAtLevel: 2,
    expectedReturn: 0.16,
    volatility: 0.22,
    name: {
      ja: "情報技術セクターETF",
      en: "Tech Sector ETF",
      zh: "信息技术行业ETF",
    },
    roleDesc: {
      ja: "高成長を牽引する攻めの主力セクター。好況期に強いが金利急騰に弱い",
      en: "Leading growth sector. Surges in expansions but sensitive to rate hikes",
      zh: "引领成长的主力进攻板块，牛市领涨但对利率敏感",
    },
  },
  pharma: {
    id: "pharma",
    ticker: "PHARMA",
    color: "#34d399",
    category: "sector",
    unlockedAtLevel: 2,
    expectedReturn: 0.105,
    volatility: 0.13,
    name: {
      ja: "ヘルスケア・製薬ETF",
      en: "Healthcare & Pharma ETF",
      zh: "医疗保健与制药ETF",
    },
    roleDesc: {
      ja: "不況時でも需要が落ちないディフェンシブセクター。手堅い収益源",
      en: "Recession-resilient defensive sector with steady non-cyclical cash flows",
      zh: "经济下行期需求稳固的防御板块，现金流充沛稳健",
    },
  },
  "nv-ai": {
    id: "nv-ai",
    ticker: "NV-AI",
    color: "#ec4899",
    category: "stock",
    unlockedAtLevel: 3,
    expectedReturn: 0.22,
    volatility: 0.3,
    name: {
      ja: "AI半導体株 (NV-AI)",
      en: "AI Semiconductor Stock",
      zh: "AI半导体龙头股",
    },
    roleDesc: {
      ja: "爆発的な成長力を持つ大砲個別株。ただし決算ショックや急落の猛毒も",
      en: "Explosive growth engine stock. Carries steep standalone drawdown risk",
      zh: "具备爆发性成长潜力的大牛股，但也伴随剧烈回调风险",
    },
  },
  cloud: {
    id: "cloud",
    ticker: "CLOUD",
    color: "#818cf8",
    category: "stock",
    unlockedAtLevel: 3,
    expectedReturn: 0.155,
    volatility: 0.19,
    name: {
      ja: "巨大クラウド株 (CLOUD)",
      en: "Mega Cloud Titan",
      zh: "云计算巨头股",
    },
    roleDesc: {
      ja: "世界中のITインフラを握る巨大個別株。堅実な複利成長が見込める",
      en: "Dominant enterprise infrastructure giant with consistent cash flow",
      zh: "掌握全球企业IT基建的科技巨头，长期复利成长稳健",
    },
  },
  defense: {
    id: "defense",
    ticker: "DFNS",
    color: "#a78bfa",
    category: "stock",
    unlockedAtLevel: 3,
    expectedReturn: 0.12,
    volatility: 0.15,
    name: {
      ja: "防衛・重電株 (DFNS)",
      en: "Defense & Heavy Grid",
      zh: "防务与重工军工股",
    },
    roleDesc: {
      ja: "地政学リスクや予算拡大で買われ、ハイテク株と逆の動きをしやすい",
      en: "Beneficiary of geopolitical tensions and sovereign infrastructure budgets",
      zh: "受益于地缘政治预算增加，常与科技股呈负相关走势",
    },
  },
  energy: {
    id: "energy",
    ticker: "NRGY",
    color: "#fb923c",
    category: "stock",
    unlockedAtLevel: 4,
    expectedReturn: 0.145,
    volatility: 0.22,
    name: {
      ja: "石油・エネルギー株 (NRGY)",
      en: "Energy & Petroleum",
      zh: "石油与能源巨头",
    },
    roleDesc: {
      ja: "資源高騰・インフレ局面で急騰し、コスト増で苦しむグロース株をヘッジ",
      en: "Surges during inflation and commodity spikes, hedging input costs",
      zh: "在通胀与大宗商品上涨时爆发，对冲成长股的成本压力",
    },
  },
  bank: {
    id: "bank",
    ticker: "BANK",
    color: "#f59e0b",
    category: "stock",
    unlockedAtLevel: 4,
    expectedReturn: 0.115,
    volatility: 0.17,
    name: {
      ja: "大手メガバンク株 (BANK)",
      en: "Global Mega Bank",
      zh: "全球大型商业银行",
    },
    roleDesc: {
      ja: "金利上昇局面で利ざやが拡大して利益が増える金融の主力株",
      en: "Profits from widening net interest margins when interest rates climb",
      zh: "在加息周期利差扩大利润丰厚的金融主力股",
    },
  },
  qntx: {
    id: "qntx",
    ticker: "QNTX",
    color: "#f43f5e",
    category: "stock",
    unlockedAtLevel: 5,
    expectedReturn: 0.26,
    volatility: 0.36,
    name: {
      ja: "量子新興ディープテック (QNTX)",
      en: "Quantum Deep-Tech Frontier",
      zh: "量子前沿硬科技新星",
    },
    roleDesc: {
      ja: "未来の覇権を握る超ハイリスク株。単体保有は危険だが分散に混ぜると爆発力",
      en: "High-octane deep-tech alpha. Devastating if unhedged, powerful in blend",
      zh: "未来颠覆性硬科技高波资产，单独重仓极易爆仓，分散搭配收益极高",
    },
  },
  reit: {
    id: "reit",
    ticker: "REIT",
    color: "#2dd4bf",
    category: "alt",
    unlockedAtLevel: 5,
    expectedReturn: 0.095,
    volatility: 0.15,
    name: {
      ja: "グローバル不動産投信 (REIT)",
      en: "Global Real Estate REIT",
      zh: "全球不动产信托REIT",
    },
    roleDesc: {
      ja: "商業ビルやデータセンターからの賃料収入。株式とは異なる値動きで安定寄与",
      en: "Steady cash flows from prime data centers and commercial properties",
      zh: "来自优质数据中心与商用地产的稳定租金收入，走势独立于普通股市",
    },
  },
};

export const CORE_CORRELATION_MATRIX: Record<string, Record<string, number>> = {
  sp500: {
    sp500: 1.0, bond: -0.18, gold: -0.25, tech: 0.88, pharma: 0.55,
    "nv-ai": 0.76, cloud: 0.82, defense: 0.28, energy: 0.35, bank: 0.65, qntx: 0.68, reit: 0.52,
  },
  bond: {
    sp500: -0.18, bond: 1.0, gold: 0.22, tech: -0.22, pharma: 0.12,
    "nv-ai": -0.28, cloud: -0.18, defense: 0.05, energy: -0.25, bank: -0.1, qntx: -0.3, reit: 0.25,
  },
  gold: {
    sp500: -0.25, bond: 0.22, gold: 1.0, tech: -0.38, pharma: 0.08,
    "nv-ai": -0.45, cloud: -0.32, defense: 0.22, energy: 0.32, bank: -0.05, qntx: -0.5, reit: 0.18,
  },
  tech: {
    sp500: 0.88, bond: -0.22, gold: -0.38, tech: 1.0, pharma: 0.32,
    "nv-ai": 0.86, cloud: 0.9, defense: 0.12, energy: 0.15, bank: 0.45, qntx: 0.78, reit: 0.38,
  },
  pharma: {
    sp500: 0.55, bond: 0.12, gold: 0.08, tech: 0.32, pharma: 1.0,
    "nv-ai": 0.22, cloud: 0.35, defense: 0.3, energy: 0.1, bank: 0.38, qntx: 0.15, reit: 0.42,
  },
  "nv-ai": {
    sp500: 0.76, bond: -0.28, gold: -0.45, tech: 0.86, pharma: 0.22,
    "nv-ai": 1.0, cloud: 0.8, defense: -0.05, energy: 0.08, bank: 0.35, qntx: 0.82, reit: 0.25,
  },
  cloud: {
    sp500: 0.82, bond: -0.18, gold: -0.32, tech: 0.9, pharma: 0.35,
    "nv-ai": 0.8, cloud: 1.0, defense: 0.15, energy: 0.18, bank: 0.48, qntx: 0.72, reit: 0.35,
  },
  defense: {
    sp500: 0.28, bond: 0.05, gold: 0.22, tech: 0.12, pharma: 0.3,
    "nv-ai": -0.05, cloud: 0.15, defense: 1.0, energy: 0.35, bank: 0.42, qntx: -0.1, reit: 0.28,
  },
  energy: {
    sp500: 0.35, bond: -0.25, gold: 0.32, tech: 0.15, pharma: 0.1,
    "nv-ai": 0.08, cloud: 0.18, defense: 0.35, energy: 1.0, bank: 0.52, qntx: 0.05, reit: 0.2,
  },
  bank: {
    sp500: 0.65, bond: -0.1, gold: -0.05, tech: 0.45, pharma: 0.38,
    "nv-ai": 0.35, cloud: 0.48, defense: 0.42, energy: 0.52, bank: 1.0, qntx: 0.3, reit: 0.45,
  },
  qntx: {
    sp500: 0.68, bond: -0.3, gold: -0.5, tech: 0.78, pharma: 0.15,
    "nv-ai": 0.82, cloud: 0.72, defense: -0.1, energy: 0.05, bank: 0.3, qntx: 1.0, reit: 0.18,
  },
  reit: {
    sp500: 0.52, bond: 0.25, gold: 0.18, tech: 0.38, pharma: 0.42,
    "nv-ai": 0.25, cloud: 0.35, defense: 0.28, energy: 0.2, bank: 0.45, qntx: 0.18, reit: 1.0,
  },
};

/**
 * Procedural asset templates for endless Level 6 and beyond
 */
interface ProceduralTemplate {
  ticker: string;
  category: AssetCategory;
  name: { ja: string; en: string; zh: string };
  roleDesc: { ja: string; en: string; zh: string };
  color: string;
  expectedReturn: number;
  volatility: number;
  baseFactor: number; // Factor loading onto broad market (SP500)
}

const PROCEDURAL_CATALOG: ProceduralTemplate[] = [
  {
    ticker: "SPACE",
    category: "stock",
    color: "#c084fc",
    expectedReturn: 0.24,
    volatility: 0.33,
    baseFactor: 0.7,
    name: { ja: "民間宇宙開発 (SPACE)", en: "Commercial Space Exploration", zh: "商业航天探索股" },
    roleDesc: {
      ja: "衛星網と軌道輸送の開拓者。超ハイリスクだが莫大な潜在アップサイド",
      en: "Orbital launch & satellite networks. High risk with tremendous upside",
      zh: "卫星网络与商业发射领航者，风险极高但潜在收益巨大",
    },
  },
  {
    ticker: "CYBER",
    category: "stock",
    color: "#38bdf8",
    expectedReturn: 0.17,
    volatility: 0.21,
    baseFactor: 0.65,
    name: { ja: "サイバーセキュリティ (CYBER)", en: "Cyber Defense Infrastructure", zh: "网络安全基础设施" },
    roleDesc: {
      ja: "クラウド侵入や国家支援ハッキング対策。不況時でも削られないIT予算",
      en: "Mission-critical security spending resilient across economic cycles",
      zh: "抵御网络攻击的刚需安全支出，经济下行期预算依然坚挺",
    },
  },
  {
    ticker: "FUSION",
    category: "stock",
    color: "#4ade80",
    expectedReturn: 0.21,
    volatility: 0.29,
    baseFactor: 0.55,
    name: { ja: "核融合クリーン電力 (FUSION)", en: "Clean Fusion Energy", zh: "受控核聚变清洁能源" },
    roleDesc: {
      ja: "次世代脱炭素ベースロード電力。実験成功ニュースで急伸する未来株",
      en: "Next-gen zero-carbon baseload energy pioneer with breakthrough upside",
      zh: "下一代零碳基荷能源先驱，突破性试验驱动高弹性收益",
    },
  },
  {
    ticker: "BIO-G",
    category: "stock",
    color: "#f472b6",
    expectedReturn: 0.27,
    volatility: 0.38,
    baseFactor: 0.35,
    name: { ja: "遺伝子編集バイオ (BIO-G)", en: "Gene-Editing Bio Alpha", zh: "基因编辑生物科技" },
    roleDesc: {
      ja: "希少疾患治療薬の臨床試験で株価が乱高下する超高ベータ個別株",
      en: "Clinical trial catalyst driver with immense volatility and low equity beta",
      zh: "临床试验结果驱动的超高波生物医药，与传统大盘相关度较低",
    },
  },
  {
    ticker: "RARE",
    category: "commodity",
    color: "#fbbf24",
    expectedReturn: 0.15,
    volatility: 0.24,
    baseFactor: 0.4,
    name: { ja: "レアアース・重要鉱物 (RARE)", en: "Critical Rare Earth Metals", zh: "稀土与关键战略矿物" },
    roleDesc: {
      ja: "EVと防衛産業に必須の戦略資源。供給網デカップリングで価格高騰",
      en: "Strategic minerals powering EVs and defense. Rallies on supply choke points",
      zh: "新能源与军工关键战略金属，在地缘封锁与断供时大涨",
    },
  },
  {
    ticker: "EM-BND",
    category: "alt",
    color: "#a3e635",
    expectedReturn: 0.088,
    volatility: 0.11,
    baseFactor: 0.1,
    name: { ja: "高利回り新興国債 (EM-BND)", en: "Emerging Sovereign Bond", zh: "新兴市场高收益主权债" },
    roleDesc: {
      ja: "米ドル建て高利回り債券。分散効果が高く、着実なインカムゲインを提供",
      en: "High-yielding USD-denominated sovereign paper providing steady coupons",
      zh: "美元计价新兴市场高息主权债，具备良好分散效应和票息收益",
    },
  },
  {
    ticker: "AUTO-EV",
    category: "stock",
    color: "#22d3ee",
    expectedReturn: 0.19,
    volatility: 0.26,
    baseFactor: 0.6,
    name: { ja: "自動運転ロボタクシー (AUTO-EV)", en: "Autonomous Mobility AI", zh: "自动驾驶移动出行" },
    roleDesc: {
      ja: "都市交通の自動化を担う新世代モビリティ。ハイテクと消費の中間特性",
      en: "Autonomous fleet operator blending deep-learning AI with consumer mobility",
      zh: "将AI与出行深度结合的下一代运营商，兼具科技与消费属性",
    },
  },
];

export function getProceduralAsset(level: number, subIndex: number): AssetSpec {
  const seed = (level - 6) * 2 + subIndex;
  const tpl = PROCEDURAL_CATALOG[seed % PROCEDURAL_CATALOG.length];
  const cycle = Math.floor(seed / PROCEDURAL_CATALOG.length);
  const suffix = cycle > 0 ? `-${cycle + 1}` : "";
  const id = `${tpl.ticker.toLowerCase()}${suffix.toLowerCase()}`;

  const returnMod = Math.min(0.04, cycle * 0.008);
  const volMod = 1 + Math.min(0.25, cycle * 0.05);

  return {
    id,
    ticker: `${tpl.ticker}${suffix}`,
    color: tpl.color,
    category: tpl.category,
    unlockedAtLevel: level,
    expectedReturn: Number((tpl.expectedReturn + returnMod).toFixed(4)),
    volatility: Number((tpl.volatility * volMod).toFixed(4)),
    name: {
      ja: `${tpl.name.ja}${suffix}`,
      en: `${tpl.name.en}${suffix}`,
      zh: `${tpl.name.zh}${suffix}`,
    },
    roleDesc: tpl.roleDesc,
  };
}

const LEVEL_TEMPLATES: Array<{
  maxPicks: number;
  newAssetKeys: string[];
  title: { ja: string; en: string; zh: string };
  forecast: { ja: string; en: string; zh: string };
  rivalPersona: { ja: string; en: string; zh: string };
  targetReturn: number;
  liquidationFloor: number;
  maxWeightPerAsset: number;
  shocks: MarketShockSpec[];
}> = [
  // Level 1: 3 assets (SP500, BOND, GOLD) — Pick up to 2
  {
    maxPicks: 2,
    newAssetKeys: ["sp500", "bond", "gold"],
    title: {
      ja: "Level 1: 投資の基本と守りの盾",
      en: "Level 1: Investment Foundations & Shield",
      zh: "第1关：投资基础与防御之盾",
    },
    forecast: {
      ja: "株と国債・金の王道バランス。株式単体だと急落で破綻する。国債や金と組み合わせて生き残れ。",
      en: "The classic equity, bond, and gold balance. Pure equities risk liquidation on drawdowns. Blend to survive.",
      zh: "股票、国债与黄金的经典平衡。全仓股票易遭遇强平，搭配国债或黄金稳健求生。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // 基礎アロケーター",
      en: "WaSHI-QP // Foundation Allocator",
      zh: "WaSHI-QP // 基础资产配置模型",
    },
    targetReturn: 0.08,
    liquidationFloor: -0.055,
    maxWeightPerAsset: 0.9,
    shocks: [
      {
        id: "l1-pullback",
        day: 24,
        headline: {
          ja: "利益確定売りで株式市場が反落：国債とゴールドに逃避資金が流入",
          en: "Equity profit-taking pullback sparks safe-haven bid in Bonds and Gold",
          zh: "股市获利了结回踩：避险资金涌入国债与黄金",
        },
        assetImpulses: { sp500: -0.05, bond: 0.015, gold: 0.035 },
      },
      {
        id: "l1-rally",
        day: 45,
        headline: {
          ja: "景気指標が予想を上回り堅調：株式市場が買い戻される",
          en: "Economic indicators beat estimates; equity markets rebound strongly",
          zh: "经济数据超预期向好：股票市场迎来强劲反弹",
        },
        assetImpulses: { sp500: 0.045, bond: -0.005, gold: -0.015 },
      },
    ],
  },
  // Level 2: +TECH, +PHARMA — Pick up to 3
  {
    maxPicks: 3,
    newAssetKeys: ["tech", "pharma"],
    title: {
      ja: "Level 2: セクター分散（攻めと守り）",
      en: "Level 2: Sector Rotation (Offense & Defense)",
      zh: "第2关：行业轮动（进攻与防御）",
    },
    forecast: {
      ja: "ハイテクETF（攻め）と製薬ETF（守り）がアンロック! 業界ごとの性格を見極めて3銘柄を選定せよ。",
      en: "Tech (growth offense) and Pharma (defensive anchor) unlocked! Pick up to 3 sectors.",
      zh: "科技行业ETF（进攻）与制药行业ETF（防御）解锁! 选出最多3只资产构建组合。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // セクター・バランサー",
      en: "WaSHI-QP // Sector Balancer",
      zh: "WaSHI-QP // 行业平衡引擎",
    },
    targetReturn: 0.105,
    liquidationFloor: -0.055,
    maxWeightPerAsset: 0.75,
    shocks: [
      {
        id: "l2-rate-fear",
        day: 20,
        headline: {
          ja: "長期金利の上昇懸念：ハイテク株が下落するも製薬と金がポートフォリオを下支え",
          en: "Rising rate fears hit Tech while Pharma and Gold hold steady",
          zh: "长期利率攀升担忧拖累科技板块，制药与黄金发挥护盘作用",
        },
        assetImpulses: { tech: -0.065, sp500: -0.035, pharma: 0.015, gold: 0.025, bond: -0.005 },
      },
      {
        id: "l2-innovation",
        day: 42,
        headline: {
          ja: "革新的な新薬承認とAIクラウド需要急増：ハイテクと製薬が揃って上昇",
          en: "Breakthrough drug approvals and AI demand lift Tech and Pharma together",
          zh: "突破性新药获批叠加AI算力需求旺盛：科技与制药板块携手走高",
        },
        assetImpulses: { tech: 0.06, pharma: 0.04, sp500: 0.035, gold: -0.02, bond: 0.0 },
      },
    ],
  },
  // Level 3: +NV-AI, +CLOUD, +DEFENSE — Pick up to 4
  {
    maxPicks: 4,
    newAssetKeys: ["nv-ai", "cloud", "defense"],
    title: {
      ja: "Level 3: 個別株解禁! ハイリターンの誘惑",
      en: "Level 3: Single Stocks Unlocked! High Alpha",
      zh: "第3关：个股解锁! 高超额收益的诱惑",
    },
    forecast: {
      ja: "AI半導体株(NV-AI)など尖った個別株が登場。爆発的リターンだが、防衛株や債券でヘッジしないと即死する。",
      en: "High-octane single stocks like NV-AI enter the arena. Immense upside, but needs defense to avoid ruin.",
      zh: "AI半导体等高弹性个股重磅上线。预期回报极高，但务必搭配防务或债券对冲尾部风险。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // 個別株共分散オプティマイザ",
      en: "WaSHI-QP // Single-Stock Covariance Solver",
      zh: "WaSHI-QP // 个股协方差优化器",
    },
    targetReturn: 0.125,
    liquidationFloor: -0.052,
    maxWeightPerAsset: 0.6,
    shocks: [
      {
        id: "l3-geopolitical",
        day: 22,
        headline: {
          ja: "地政学リスクの突発：NV-AIとTECHが急落、防衛株(DFNS)とGOLDが急騰",
          en: "Geopolitical flashpoint: NV-AI and Tech stumble as Defense (DFNS) and Gold soar",
          zh: "突发地缘政治局势紧张：NV-AI与科技股回调，防务股(DFNS)与黄金逆市飙升",
        },
        assetImpulses: {
          "nv-ai": -0.08, tech: -0.055, cloud: -0.045, defense: 0.07, gold: 0.045, bond: 0.01,
          sp500: -0.035, pharma: 0.01,
        },
      },
      {
        id: "l3-datacenter",
        day: 44,
        headline: {
          ja: "ハイパースケーラーの設備投資倍増：AI半導体とクラウド株が急伸",
          en: "Hyperscaler capex boom fuels massive rallies in NV-AI and Cloud titans",
          zh: "超大规模云厂商资本开支翻倍：AI半导体与云计算巨头狂飙",
        },
        assetImpulses: {
          "nv-ai": 0.095, cloud: 0.065, tech: 0.05, defense: 0.005, gold: -0.025, bond: -0.005,
          sp500: 0.04, pharma: -0.01,
        },
      },
    ],
  },
  // Level 4: +ENERGY, +BANK — Pick up to 5
  {
    maxPicks: 5,
    newAssetKeys: ["energy", "bank"],
    title: {
      ja: "Level 4: インフレ＆金利ショック対抗",
      en: "Level 4: Inflation & Interest Rate Shock",
      zh: "第4关：通胀与利率冲击对决",
    },
    forecast: {
      ja: "原油急騰と金利高止まり。エネルギー株と銀行株を組み入れ、マクロ環境の激変を制覇せよ。",
      en: "Surging oil and sticky rates. Integrate Energy and Banks to navigate macro turbulence.",
      zh: "原油价格大涨与高利率长期化。纳入能源与银行股，化解宏观激变冲击。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // マクロレジーム・ヘッジャー",
      en: "WaSHI-QP // Macro Regime Hedger",
      zh: "WaSHI-QP // 宏观周期对冲模型",
    },
    targetReturn: 0.125,
    liquidationFloor: -0.05,
    maxWeightPerAsset: 0.5,
    shocks: [
      {
        id: "l4-supply-shock",
        day: 19,
        headline: {
          ja: "産油国の減産合意とサプライチェーン混乱：エネルギー(NRGY)が急騰、グロース株に逆風",
          en: "OPEC supply cuts & freight bottlenecks: Energy (NRGY) surges, growth tech pulls back",
          zh: "主要产油国减产与供应链受阻：能源股(NRGY)暴涨，高估值成长股承压",
        },
        assetImpulses: {
          energy: 0.085, bank: 0.03, gold: 0.03, "nv-ai": -0.06, tech: -0.045, cloud: -0.035,
          sp500: -0.02, bond: -0.01, defense: 0.02, pharma: 0.005,
        },
      },
      {
        id: "l4-soft-landing",
        day: 41,
        headline: {
          ja: "インフレ沈静化とソフトランディング期待：全セクターで広範な買い戻し",
          en: "Cooling inflation prints ignite broad-based soft landing rally across all sectors",
          zh: "通胀数据超预期降温推升软着陆预期：全市场各行业迎来普涨买盘",
        },
        assetImpulses: {
          sp500: 0.045, "nv-ai": 0.07, cloud: 0.05, tech: 0.05, bank: 0.035, energy: -0.02,
          defense: 0.01, pharma: 0.02, gold: -0.015, bond: 0.01,
        },
      },
    ],
  },
  // Level 5: +QNTX, +REIT — Pick up to 6
  {
    maxPicks: 6,
    newAssetKeys: ["qntx", "reit"],
    title: {
      ja: "Level 5: クオンツ・マスター（全12銘柄）",
      en: "Level 5: Quant Master (Full 12-Asset Universe)",
      zh: "第5关：量化大师（全12只标的资产）",
    },
    forecast: {
      ja: "量子新興ディープテック(QNTX)とREITが解禁。12銘柄のプールから厳選した6社で究極のポートフォリオを構築せよ。",
      en: "Quantum Deep-Tech (QNTX) and REITs unlocked. Build an all-weather masterpiece from 12 assets.",
      zh: "量子前沿硬科技(QNTX)与不动产信托REIT解锁。从12只资产池中精选6只打造无懈可击的全天候组合。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // クオンツ・グランドマスター",
      en: "WaSHI-QP // Quant Grandmaster",
      zh: "WaSHI-QP // 量化特级大师",
    },
    targetReturn: 0.145,
    liquidationFloor: -0.048,
    maxWeightPerAsset: 0.45,
    shocks: [
      {
        id: "l5-quantum-flash",
        day: 21,
        headline: {
          ja: "アルゴリズム連鎖急落：高ベータ株(QNTX/NV-AI)が急落し、REIT・GOLD・国債が強靭に防衛",
          en: "Cascading algo sell-off: High-beta QNTX and NV-AI slide; REIT, Gold and Bonds shield the fund",
          zh: "算法连环去杠杆冲击：高贝塔QNTX与NV-AI下挫，REIT、黄金与国债筑牢防线",
        },
        assetImpulses: {
          qntx: -0.09, "nv-ai": -0.075, tech: -0.05, cloud: -0.04, sp500: -0.03,
          reit: 0.03, gold: 0.05, bond: 0.015, defense: 0.035, pharma: 0.02, energy: 0.01, bank: -0.01,
        },
      },
      {
        id: "l5-breakthrough",
        day: 43,
        headline: {
          ja: "量子商用化と全セクター協調高：QNTXがストップ高水準、リスク資産が爆発的反発",
          en: "Commercial quantum milestone sparks euphoric rally across technology and risk assets",
          zh: "量子商用重大突破引爆市场狂欢：QNTX飙升带动整体风险资产强劲收官",
        },
        assetImpulses: {
          qntx: 0.12, "nv-ai": 0.08, cloud: 0.06, tech: 0.055, sp500: 0.04,
          bank: 0.025, energy: 0.015, defense: 0.01, pharma: 0.015, reit: 0.02, gold: -0.02, bond: -0.005,
        },
      },
    ],
  },
];

export function getLevelSpec(level: number): LevelSpec {
  const lvl = Math.max(1, Math.floor(level));
  if (lvl <= 5) {
    const tpl = LEVEL_TEMPLATES[lvl - 1];
    const unlockedAssetIds: string[] = [];
    for (let i = 0; i < lvl; i++) {
      unlockedAssetIds.push(...LEVEL_TEMPLATES[i].newAssetKeys);
    }
    return {
      level: lvl,
      title: tpl.title,
      forecast: tpl.forecast,
      rivalPersona: tpl.rivalPersona,
      maxPicks: tpl.maxPicks,
      targetReturn: tpl.targetReturn,
      liquidationFloor: tpl.liquidationFloor,
      maxWeightPerAsset: tpl.maxWeightPerAsset,
      newAssetIds: tpl.newAssetKeys,
      unlockedAssetIds,
      candidateShocks: tpl.shocks,
    };
  }

  // Level 6+: Procedural Endless Scaling
  const cycle = lvl - 5;
  const maxPicks = Math.min(8, 6 + Math.floor(cycle * 0.5));
  const newAssetA = getProceduralAsset(lvl, 0);
  const newAssetB = getProceduralAsset(lvl, 1);
  const newAssetIds = [newAssetA.id, newAssetB.id];

  // Accumulate all previous assets up to level 5 plus all procedural assets up to this level
  const unlockedAssetIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    unlockedAssetIds.push(...LEVEL_TEMPLATES[i].newAssetKeys);
  }
  for (let l = 6; l <= lvl; l++) {
    unlockedAssetIds.push(getProceduralAsset(l, 0).id, getProceduralAsset(l, 1).id);
  }

  const retBonus = Math.min(0.03, cycle * 0.006);
  const targetReturn = Number((0.145 + retBonus).toFixed(4));
  const liquidationFloor = Number(Math.min(-0.04, -0.048 + cycle * 0.001).toFixed(4));
  const maxWeightPerAsset = 0.4;

  const tShockA = getProceduralAsset(lvl, 0);
  const tShockB = getProceduralAsset(lvl, 1);

  return {
    level: lvl,
    title: {
      ja: `Level ${lvl}: 無限フロンティア (新銘柄: ${newAssetA.ticker}, ${newAssetB.ticker})`,
      en: `Level ${lvl}: Infinite Frontier (New: ${newAssetA.ticker}, ${newAssetB.ticker})`,
      zh: `第${lvl}关：无尽前沿 (新增: ${newAssetA.ticker}, ${newAssetB.ticker})`,
    },
    forecast: {
      ja: `全${unlockedAssetIds.length}銘柄から精鋭${maxPicks}銘柄を選別せよ。多様化が進む市場でライバルAIを圧倒する配分を導き出せ。`,
      en: `Select up to ${maxPicks} gems from ${unlockedAssetIds.length} available assets. Master diversification to outpace rival AI.`,
      zh: `从全部${unlockedAssetIds.length}只资产中精选${maxPicks}只最强标的。在高度分散的市场中战胜量化AI。`,
    },
    rivalPersona: {
      ja: `WaSHI-QP // クオンツ・インフィニティ (Lv.${lvl})`,
      en: `WaSHI-QP // Quant Infinity (Lv.${lvl})`,
      zh: `WaSHI-QP // 量化无尽引擎 (第${lvl}代)`,
    },
    maxPicks,
    targetReturn,
    liquidationFloor,
    maxWeightPerAsset,
    newAssetIds,
    unlockedAssetIds,
    candidateShocks: [
      {
        id: `l${lvl}-macro-whipsaw`,
        day: 20,
        headline: {
          ja: `グローバル資本フロー急変：${tShockA.ticker}に投機的資金が殺到し、伝統的資産が一時調整`,
          en: `Global capital flow rotation: ${tShockA.ticker} rallies as traditional assets consolidate`,
          zh: `全球资金流向轮动：资金大举建仓${tShockA.ticker}，传统资产窄幅震荡`,
        },
        assetImpulses: {
          [newAssetA.id]: 0.08,
          [newAssetB.id]: -0.04,
          sp500: -0.02,
          bond: 0.01,
          gold: 0.025,
        },
      },
      {
        id: `l${lvl}-sector-breakthrough`,
        day: 42,
        headline: {
          ja: `産業エコシステムの技術革新：${tShockB.ticker}が急伸し市場全体のリスク選好が回復`,
          en: `Industrial ecosystem innovation: ${tShockB.ticker} surges, lifting broad market sentiment`,
          zh: `产业链技术革新落地：${tShockB.ticker}强势领涨，全市场风险偏好显著回暖`,
        },
        assetImpulses: {
          [newAssetA.id]: 0.03,
          [newAssetB.id]: 0.09,
          sp500: 0.035,
          gold: -0.015,
        },
      },
    ],
  };
}

export function getAssetSpecById(id: string, maxLevel = 100): AssetSpec {
  if (CORE_ASSETS[id]) {
    return CORE_ASSETS[id];
  }
  // Search in procedural assets up to maxLevel
  for (let lvl = 6; lvl <= maxLevel; lvl++) {
    const a0 = getProceduralAsset(lvl, 0);
    if (a0.id === id) return a0;
    const a1 = getProceduralAsset(lvl, 1);
    if (a1.id === id) return a1;
  }
  // Fallback generic stock
  return {
    id,
    ticker: id.toUpperCase(),
    color: "#64748b",
    category: "stock",
    unlockedAtLevel: 1,
    expectedReturn: 0.12,
    volatility: 0.2,
    name: { ja: id, en: id, zh: id },
    roleDesc: { ja: "投資対象銘柄", en: "Investable Asset", zh: "投资标的资产" },
  };
}

/**
 * Computes pairwise correlation between any two asset IDs
 * Positive definiteness is mathematically guaranteed via single-factor model projection.
 */
export function getPairwiseCorrelation(idA: string, idB: string): number {
  if (idA === idB) return 1.0;
  if (CORE_CORRELATION_MATRIX[idA] && CORE_CORRELATION_MATRIX[idA][idB] !== undefined) {
    return CORE_CORRELATION_MATRIX[idA][idB];
  }
  if (CORE_CORRELATION_MATRIX[idB] && CORE_CORRELATION_MATRIX[idB][idA] !== undefined) {
    return CORE_CORRELATION_MATRIX[idB][idA];
  }

  // Factor loading model for procedural assets: r_ij = beta_i * beta_j
  const specA = getAssetSpecById(idA);
  const specB = getAssetSpecById(idB);
  const factorA = specA.category === "broad" ? 0.8 : specA.category === "commodity" ? -0.2 : 0.65;
  const factorB = specB.category === "broad" ? 0.8 : specB.category === "commodity" ? -0.2 : 0.65;
  const baseCorr = factorA * factorB;
  return Number(Math.max(-0.65, Math.min(0.85, baseCorr)).toFixed(3));
}

/**
 * Builds an active QuarterRegime containing ONLY the selected subset of assets
 * Covariance matrix is symmetric and strictly positive-definite.
 */
export function buildSubsetRegime(
  level: number,
  selectedAssetIds: string[]
): QuarterRegime {
  const lvlSpec = getLevelSpec(level);
  const validIds = selectedAssetIds.length > 0 ? selectedAssetIds : lvlSpec.unlockedAssetIds.slice(0, lvlSpec.maxPicks);
  const assets = validIds.map((id) => getAssetSpecById(id, Math.max(level + 1, 10)));
  const n = assets.length;

  const correlation: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      row.push(getPairwiseCorrelation(assets[i].id, assets[j].id));
    }
    correlation.push(row);
  }

  const vols = assets.map((a) => a.volatility);
  const covariance = buildCovariance(vols, correlation);

  // Adapt candidate shocks to the subset asset impulse map
  const adaptedShocks: MarketShockSpec[] = lvlSpec.candidateShocks.map((s) => ({
    id: s.id,
    day: s.day,
    headline: s.headline,
    assetImpulses: { ...s.assetImpulses },
  }));

  return {
    id: `level-${level}`,
    quarter: level,
    level,
    title: lvlSpec.title,
    forecast: lvlSpec.forecast,
    rivalPersona: lvlSpec.rivalPersona,
    assets,
    correlation,
    covariance,
    targetReturn: lvlSpec.targetReturn,
    liquidationFloor: lvlSpec.liquidationFloor,
    maxWeightPerAsset: lvlSpec.maxWeightPerAsset,
    candidateShocks: adaptedShocks,
    selectedAssetIds: validIds,
  };
}

/**
 * Backward compatibility alias: getQuarterRegime(quarter)
 */
export function getQuarterRegime(quarter: number): QuarterRegime {
  const spec = getLevelSpec(quarter);
  // Sort available assets by expectedReturn descending to provide a rich feasible frontier
  const allAssets = spec.unlockedAssetIds.map((id) => getAssetSpecById(id, quarter + 1));
  allAssets.sort((a, b) => b.expectedReturn - a.expectedReturn);

  // Take top growth assets and at least one defensive anchor (bond or gold or defensive stock)
  const defensive =
    allAssets.find((a) => a.id === "bond") ||
    allAssets.find((a) => a.id === "gold") ||
    allAssets[allAssets.length - 1];

  const top = allAssets.slice(0, spec.maxPicks - 1);
  const picks = top.map((a) => a.id);
  if (defensive && !picks.includes(defensive.id)) {
    picks.push(defensive.id);
  } else if (allAssets[spec.maxPicks - 1]) {
    picks.push(allAssets[spec.maxPicks - 1].id);
  }

  return buildSubsetRegime(quarter, picks);
}

export function getLocalizedRegimeText(
  regime: QuarterRegime,
  lang: GameLang
): { title: string; forecast: string; rivalPersona: string } {
  return {
    title: pickLang(lang, regime.title),
    forecast: pickLang(lang, regime.forecast),
    rivalPersona: pickLang(lang, regime.rivalPersona),
  };
}

export function getLocalizedAsset(
  asset: AssetSpec,
  lang: GameLang
): { name: string; roleDesc: string } {
  return {
    name: pickLang(lang, asset.name),
    roleDesc: pickLang(lang, asset.roleDesc),
  };
}
