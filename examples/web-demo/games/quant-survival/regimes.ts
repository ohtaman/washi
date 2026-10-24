import { pickLang, type GameLang } from "../i18n.js";
import type { AssetSpec, MarketShockSpec, QuarterRegime } from "./types.js";

function buildCovariance(vols: number[], corr: number[][]): number[][] {
  const n = vols.length;
  const cov: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const val = vols[i] * vols[j] * corr[i][j];
      row.push(i === j ? val + 1e-6 : val);
    }
    cov.push(row);
  }
  return cov;
}

const BASE_ASSETS: Record<string, AssetSpec> = {
  tech: {
    id: "tech",
    ticker: "TECH",
    color: "#38bdf8",
    expectedReturn: 0.16,
    volatility: 0.24,
    name: {
      ja: "AI・半導体グロース",
      en: "AI & Semiconductor Growth",
      zh: "AI与半导体成长股",
    },
    roleDesc: {
      ja: "高リターンだが金利急騰や景気後退で大きく売られる主力株",
      en: "High expected return, but vulnerable to rate hikes and demand shocks",
      zh: "高预期回报，但在加息与需求冲击下波动剧烈",
    },
  },
  defense: {
    id: "defense",
    ticker: "DFNS",
    color: "#a78bfa",
    expectedReturn: 0.11,
    volatility: 0.15,
    name: {
      ja: "防衛・重電インフラ",
      en: "Defense & Grid Infra",
      zh: "防卫与重电基建",
    },
    roleDesc: {
      ja: "地政学リスクや供給網寸断に強く、テック株と逆相関になりやすい",
      en: "Resilient during geopolitical and supply shocks; offsets tech drawdowns",
      zh: "在地缘风险与供应链冲击下表现稳健，与科技股呈负相关",
    },
  },
  gold: {
    id: "gold",
    ticker: "GOLD",
    color: "#facc15",
    expectedReturn: 0.08,
    volatility: 0.12,
    name: {
      ja: "ゴールド・危機ヘッジ",
      en: "Gold Safe-Haven Hedge",
      zh: "黄金避险资产",
    },
    roleDesc: {
      ja: "株式急落時に買われる強力な逆相関ヘッジ資産",
      en: "Strong negative correlation with equities during market panics",
      zh: "在股市暴跌时上涨的强力负相关避险资产",
    },
  },
  bond: {
    id: "bond",
    ticker: "BOND",
    color: "#94a3b8",
    expectedReturn: 0.045,
    volatility: 0.045,
    name: {
      ja: "短期ソブリン国債",
      en: "Short Sovereign Bond",
      zh: "短期主权国债",
    },
    roleDesc: {
      ja: "変動が極めて小さい安全資産。入れすぎると目標リターンに届かない",
      en: "Ultra-low volatility anchor, though too low-yield alone",
      zh: "波动极低的安全资产，但单独持有难以达到目标收益",
    },
  },
  energy: {
    id: "energy",
    ticker: "NRGY",
    color: "#fb923c",
    expectedReturn: 0.135,
    volatility: 0.21,
    name: {
      ja: "資源・エネルギー先物",
      en: "Energy & Commodities",
      zh: "能源与大宗商品",
    },
    roleDesc: {
      ja: "インフレ・資源高騰局面で急騰し、コスト増で苦しむハイテク株をヘッジ",
      en: "Surges during inflation spikes, hedging rate-sensitive growth stocks",
      zh: "在通胀与资源紧缺时飙升，可对冲受成本挤压的成长股",
    },
  },
  frontier: {
    id: "frontier",
    ticker: "QNTX",
    color: "#f43f5e",
    expectedReturn: 0.22,
    volatility: 0.34,
    name: {
      ja: "量子・フロンティア資産",
      en: "Quantum Frontier Alpha",
      zh: "量子前沿高波资产",
    },
    roleDesc: {
      ja: "爆発的な期待リターンを持つが、単体保有は破綻リスクが極めて高い",
      en: "Explosive upside potential, but extreme standalone ruin probability",
      zh: "具备爆发性预期收益，但重仓持有极易触发爆仓线",
    },
  },
};

function cloneAssetWithMods(
  base: AssetSpec,
  expectedReturn: number,
  volatility: number
): AssetSpec {
  return {
    ...base,
    expectedReturn,
    volatility,
  };
}

const REGIME_TEMPLATES: Array<{
  title: { ja: string; en: string; zh: string };
  forecast: { ja: string; en: string; zh: string };
  rivalPersona: { ja: string; en: string; zh: string };
  assetKeys: Array<keyof typeof BASE_ASSETS>;
  returns: number[];
  vols: number[];
  corr: number[][];
  targetReturn: number;
  liquidationFloor: number;
  maxWeightPerAsset: number;
  shocks: MarketShockSpec[];
}> = [
  // Q1: 4 assets — Classic Tech vs Gold/Defense negative correlation intro
  {
    title: {
      ja: "金利警戒とAI選別相場",
      en: "Rate Watch & AI Rotation",
      zh: "利率警戒与AI轮动行情",
    },
    forecast: {
      ja: "TECHは高利回りだが変動が激しい。逆相関のGOLDやDFNSを組み合わせ、破綻確率を抑えて運用せよ。",
      en: "TECH offers high upside with steep volatility. Blend negatively correlated GOLD and DFNS to compress ruin risk.",
      zh: "TECH收益高但波动剧烈。搭配负相关的GOLD与DFNS以压低爆仓概率。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // 最小分散エンジン v1",
      en: "WaSHI-QP // Min-Variance Engine v1",
      zh: "WaSHI-QP // 最小方差引擎 v1",
    },
    assetKeys: ["tech", "defense", "gold", "bond"],
    returns: [0.16, 0.115, 0.085, 0.045],
    vols: [0.24, 0.15, 0.12, 0.04],
    corr: [
      [1.0, -0.35, -0.62, -0.15],
      [-0.35, 1.0, 0.1, 0.05],
      [-0.62, 0.1, 1.0, 0.2],
      [-0.15, 0.05, 0.2, 1.0],
    ],
    targetReturn: 0.105,
    liquidationFloor: -0.055,
    maxWeightPerAsset: 1.0,
    shocks: [
      {
        id: "q1-rate-scare",
        day: 22,
        headline: {
          ja: "中央銀行がタカ派発言：ハイテク株に売り、ゴールドと防衛株に逃避資金",
          en: "Hawkish central bank signal sparks tech sell-off and safe-haven inflow",
          zh: "央行释放鹰派信号：科技股承压，资金涌入黄金与防卫板块",
        },
        reversedHeadline: {
          ja: "中央銀行がハト派に転換：ハイテク株が買われ、ゴールドと防衛株から資金流出",
          en: "Dovish central bank pivot lifts tech as money leaves safe havens",
          zh: "央行转向鸽派：科技股走强，资金撤离黄金与防卫板块",
        },
        assetImpulses: [-0.055, 0.03, 0.042, 0.006],
      },
      {
        id: "q1-ai-rally",
        day: 44,
        headline: {
          ja: "次世代AIチップ受注が予想超え：半導体セクターが急反発",
          en: "Next-gen AI chip orders beat estimates; semiconductor sector rebounds",
          zh: "下一代AI芯片订单超预期：半导体板块强劲反弹",
        },
        reversedHeadline: {
          ja: "次世代AIチップ受注が予想割れ：半導体セクターが急落し、ゴールドに資金",
          en: "Next-gen AI chip orders miss estimates; semiconductors slide as gold firms",
          zh: "下一代AI芯片订单不及预期：半导体板块下挫，黄金走强",
        },
        assetImpulses: [0.062, 0.01, -0.022, 0.002],
      },
    ],
  },
  // Q2: 5 assets — Energy Supply Shock & Inflation Hedge
  {
    title: {
      ja: "資源インフレと供給網ショック",
      en: "Commodity Inflation & Supply Shock",
      zh: "资源通胀与供应链冲击",
    },
    forecast: {
      ja: "原油・資源価格が乱高下中。NRGYとTECHの強い逆相関（-0.55）を活かしてインフレ波を乗り切れ。",
      en: "Energy prices are whipsawing. Exploit the strong negative correlation (-0.55) between NRGY and TECH.",
      zh: "能源价格剧烈震荡。利用NRGY与TECH的强负相关（-0.55）对冲通胀冲击。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // インフレヘッジ最適化",
      en: "WaSHI-QP // Inflation-Hedge Optimizer",
      zh: "WaSHI-QP // 通胀对冲优化器",
    },
    assetKeys: ["tech", "energy", "defense", "gold", "bond"],
    returns: [0.165, 0.145, 0.115, 0.085, 0.045],
    vols: [0.25, 0.22, 0.15, 0.125, 0.045],
    corr: [
      [1.0, -0.55, -0.3, -0.5, -0.2],
      [-0.55, 1.0, 0.25, 0.3, -0.15],
      [-0.3, 0.25, 1.0, 0.1, 0.05],
      [-0.5, 0.3, 0.1, 1.0, 0.15],
      [-0.2, -0.15, 0.05, 0.15, 1.0],
    ],
    targetReturn: 0.115,
    liquidationFloor: -0.055,
    maxWeightPerAsset: 0.75,
    shocks: [
      {
        id: "q2-strait-blockade",
        day: 19,
        headline: {
          ja: "海峡輸送ルートが停滞：エネルギー先物が急騰しハイテク株が下落",
          en: "Maritime chokepoint disruption sends energy surging while tech slides",
          zh: "海峡航运受阻：能源期货飙升，科技股回落",
        },
        reversedHeadline: {
          ja: "海峡輸送ルートが早期復旧：エネルギー先物が急落しハイテク株が反発",
          en: "Maritime chokepoint reopens early; energy futures tumble and tech rebounds",
          zh: "海峡航运提前恢复：能源期货大跌，科技股反弹",
        },
        assetImpulses: [-0.052, 0.068, 0.032, 0.028, -0.005],
      },
      {
        id: "q2-inventory-release",
        day: 41,
        headline: {
          ja: "戦略備蓄の協調放出が決定：資源高が一服しグロース株が買い戻される",
          en: "Coordinated strategic reserve release cools oil and lifts growth stocks",
          zh: "多国联合释放战略储备：资源价格回落，成长股迎来买盘",
        },
        reversedHeadline: {
          ja: "戦略備蓄の協調放出が見送り：資源高が再燃しグロース株が売られる",
          en: "Strategic reserve release shelved; oil rallies again and growth stocks sell off",
          zh: "多国联合释放战略储备计划搁置：资源价格再度走高，成长股遭抛售",
        },
        assetImpulses: [0.058, -0.038, 0.008, -0.015, 0.008],
      },
    ],
  },
  // Q3: 5 assets — Tighter Concentration Cap & Geopolitical Volatility
  {
    title: {
      ja: "地政学緊張とセクター集中規制",
      en: "Geopolitical Tension & Concentration Cap",
      zh: "地缘紧张与持仓上限监管",
    },
    forecast: {
      ja: "リスク管理委員会により1銘柄あたり最大55%の上限が発動。3銘柄以上の多角化が必須となる。",
      en: "Risk committee enforces a 55% single-asset cap. Multi-asset diversification is mandatory.",
      zh: "风控委员会启用单资产55%持仓上限，必须构建多资产对冲组合。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // 制約付きマーコウィッツ",
      en: "WaSHI-QP // Constrained Markowitz",
      zh: "WaSHI-QP // 约束马科维茨引擎",
    },
    assetKeys: ["tech", "defense", "energy", "gold", "bond"],
    returns: [0.175, 0.14, 0.135, 0.09, 0.045],
    vols: [0.27, 0.17, 0.21, 0.13, 0.045],
    corr: [
      [1.0, -0.48, -0.42, -0.58, -0.1],
      [-0.48, 1.0, 0.2, 0.22, 0.05],
      [-0.42, 0.2, 1.0, 0.25, -0.1],
      [-0.58, 0.22, 0.25, 1.0, 0.2],
      [-0.1, 0.05, -0.1, 0.2, 1.0],
    ],
    targetReturn: 0.12,
    liquidationFloor: -0.052,
    maxWeightPerAsset: 0.55,
    shocks: [
      {
        id: "q3-cyber-grid",
        day: 24,
        headline: {
          ja: "重要インフラ防衛予算が倍増：DFNSとGOLDが買われ、TECHは利益確定売り",
          en: "Defense grid spending doubles; DFNS and GOLD rally as TECH pulls back",
          zh: "关键基建防卫预算翻倍：DFNS与GOLD走强，TECH遭遇获利了结",
        },
        reversedHeadline: {
          ja: "重要インフラ防衛予算が削減：DFNSとGOLDが売られ、TECHに資金が回帰",
          en: "Defense grid budget cut; DFNS and GOLD slip as money rotates back into TECH",
          zh: "关键基建防卫预算削减：DFNS与GOLD走弱，资金回流TECH",
        },
        assetImpulses: [-0.048, 0.058, 0.025, 0.038, 0.005],
      },
      {
        id: "q3-cloud-boom",
        day: 46,
        headline: {
          ja: "ソブリンクラウド大型契約が成立：TECHとDFNSが同時上昇",
          en: "Sovereign cloud mega-contract signed; TECH and DFNS advance together",
          zh: "主权云大型合同落地：TECH与DFNS携手上涨",
        },
        reversedHeadline: {
          ja: "ソブリンクラウド大型契約が白紙撤回：TECHとDFNSが同時下落",
          en: "Sovereign cloud mega-contract cancelled; TECH and DFNS fall together",
          zh: "主权云大型合同被撤销：TECH与DFNS同步下跌",
        },
        assetImpulses: [0.055, 0.032, -0.015, -0.018, 0.004],
      },
    ],
  },
  // Q4: 6 assets — Quantum Frontier Alpha unlocked
  {
    title: {
      ja: "量子フロンティア解禁と乱高下相場",
      en: "Quantum Frontier Boom & Whiplash",
      zh: "量子前沿解禁与剧烈震荡期",
    },
    forecast: {
      ja: "超高リターン銘柄QNTX（+22%）が市場に登場。ただし単体ボラティリティは34%。GOLD・DFNSで厳重にヘッジせよ。",
      en: "High-octane QNTX (+22% expected return, 34% volatility) enters the market. Hedge its tail risk carefully.",
      zh: "高回报资产QNTX（预期+22%，波动率34%）上市。务必用避险资产严格对冲尾部风险。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // テールリスク抑制モデル",
      en: "WaSHI-QP // Tail-Risk Suppressor",
      zh: "WaSHI-QP // 尾部风险抑制模型",
    },
    assetKeys: ["frontier", "tech", "energy", "defense", "gold", "bond"],
    returns: [0.22, 0.165, 0.14, 0.125, 0.095, 0.048],
    vols: [0.34, 0.25, 0.21, 0.16, 0.135, 0.045],
    corr: [
      [1.0, 0.55, -0.35, -0.42, -0.65, -0.15],
      [0.55, 1.0, -0.45, -0.35, -0.55, -0.1],
      [-0.35, -0.45, 1.0, 0.2, 0.25, -0.1],
      [-0.42, -0.35, 0.2, 1.0, 0.2, 0.05],
      [-0.65, -0.55, 0.25, 0.2, 1.0, 0.2],
      [-0.15, -0.1, -0.1, 0.05, 0.2, 1.0],
    ],
    targetReturn: 0.135,
    liquidationFloor: -0.05,
    maxWeightPerAsset: 0.5,
    shocks: [
      {
        id: "q4-quantum-flash",
        day: 18,
        headline: {
          ja: "アルゴリズム取引の連鎖売りでQNTX・TECHが急落、GOLDが急騰",
          en: "Quant flash deleveraging hits QNTX and TECH while GOLD spikes",
          zh: "算法交易连锁去杠杆冲击QNTX与TECH，GOLD逆势大涨",
        },
        reversedHeadline: {
          ja: "アルゴリズム取引の連鎖買い戻しでQNTX・TECHが急騰、GOLDが急落",
          en: "Quant short-covering cascade lifts QNTX and TECH while GOLD drops",
          zh: "算法交易连锁回补推升QNTX与TECH，GOLD大跌",
        },
        assetImpulses: [-0.078, -0.045, 0.028, 0.035, 0.058, 0.008],
      },
      {
        id: "q4-breakthrough",
        day: 40,
        headline: {
          ja: "量子暗号通信の実用化に成功：QNTXがストップ高水準へ急伸",
          en: "Quantum encryption milestone achieved; QNTX surges on institutional buying",
          zh: "量子加密通信实现商用突破：机构大举买入推动QNTX飙升",
        },
        reversedHeadline: {
          ja: "量子暗号通信の実証試験が失敗：機関投資家の売りでQNTXが急落",
          en: "Quantum encryption trial fails; QNTX slumps on institutional selling",
          zh: "量子加密通信验证失败：机构抛售致QNTX大跌",
        },
        assetImpulses: [0.095, 0.048, -0.015, 0.012, -0.025, 0.002],
      },
    ],
  },
  // Q5: Liquidity Crunch
  {
    title: {
      ja: "流動性逼迫とボラティリティ・ストーム",
      en: "Liquidity Crunch & Volatility Storm",
      zh: "流动性紧缩与波动率风暴",
    },
    forecast: {
      ja: "全市場の変動幅が拡大し、1銘柄上限は45%に制限。相関行列のマイナス要素を総動員して生き残れ。",
      en: "Market-wide volatility widens and single-asset cap tightens to 45%. Use every negative correlation pair to survive.",
      zh: "全市场波动率扩大，单资产上限收紧至45%。充分利用负相关资产对冲求生。",
    },
    rivalPersona: {
      ja: "WaSHI-QP // クオンツ・マスター v5",
      en: "WaSHI-QP // Quant Master v5",
      zh: "WaSHI-QP // 量化大师 v5",
    },
    assetKeys: ["frontier", "tech", "energy", "defense", "gold", "bond"],
    returns: [0.235, 0.175, 0.15, 0.135, 0.10, 0.05],
    vols: [0.36, 0.27, 0.23, 0.17, 0.14, 0.045],
    corr: [
      [1.0, 0.5, -0.4, -0.45, -0.66, -0.15],
      [0.5, 1.0, -0.48, -0.38, -0.58, -0.1],
      [-0.4, -0.48, 1.0, 0.22, 0.28, -0.1],
      [-0.45, -0.38, 0.22, 1.0, 0.22, 0.05],
      [-0.66, -0.58, 0.28, 0.22, 1.0, 0.22],
      [-0.15, -0.1, -0.1, 0.05, 0.22, 1.0],
    ],
    targetReturn: 0.142,
    liquidationFloor: -0.048,
    maxWeightPerAsset: 0.45,
    shocks: [
      {
        id: "q5-credit-squeeze",
        day: 21,
        headline: {
          ja: "短期金融市場で信用収縮：高ベータ株が急落しGOLD・DFNSが全面高",
          en: "Short-term credit squeeze hammers high-beta assets as GOLD and DFNS rally",
          zh: "短期信贷市场紧缩：高贝塔资产急挫，GOLD与DFNS全面走高",
        },
        reversedHeadline: {
          ja: "短期金融市場の信用不安が後退：高ベータ株が急反発しGOLD・DFNSが反落",
          en: "Short-term credit fears ease; high-beta assets rebound as GOLD and DFNS retreat",
          zh: "短期信贷担忧缓解：高贝塔资产反弹，GOLD与DFNS回落",
        },
        assetImpulses: [-0.082, -0.055, 0.032, 0.045, 0.062, 0.01],
      },
      {
        id: "q5-global-stimulus",
        day: 43,
        headline: {
          ja: "緊急流動性供給オペが発動：リスク資産が急速に切り返す",
          en: "Emergency liquidity facility announced; risk assets stage a sharp rebound",
          zh: "紧急流动性注入启动：风险资产强势V型反弹",
        },
        reversedHeadline: {
          ja: "緊急流動性供給オペが見送り：リスク資産が一段安",
          en: "Emergency liquidity facility withheld; risk assets slide further",
          zh: "紧急流动性注入计划落空：风险资产进一步下跌",
        },
        assetImpulses: [0.092, 0.06, 0.025, 0.015, -0.02, 0.004],
      },
    ],
  },
];

export function getQuarterRegime(quarter: number): QuarterRegime {
  const q = Math.max(1, Math.floor(quarter));
  const idx = (q - 1) % REGIME_TEMPLATES.length;
  const cycle = Math.floor((q - 1) / REGIME_TEMPLATES.length);
  const tpl = REGIME_TEMPLATES[idx];

  // Progressive endless scaling for cycles beyond Q5
  const returnBoost = Math.min(0.04, cycle * 0.008);
  const volBoost = 1 + Math.min(0.35, cycle * 0.06);
  const assets = tpl.assetKeys.map((key, i) =>
    cloneAssetWithMods(
      BASE_ASSETS[key],
      Number((tpl.returns[i] + returnBoost).toFixed(4)),
      Number((tpl.vols[i] * volBoost).toFixed(4))
    )
  );

  const vols = assets.map((a) => a.volatility);
  const covariance = buildCovariance(vols, tpl.corr);
  const targetReturn = Number((tpl.targetReturn + returnBoost * 0.75).toFixed(4));
  const liquidationFloor = Number(
    Math.min(-0.038, tpl.liquidationFloor + cycle * 0.002).toFixed(4)
  );
  const maxWeightPerAsset =
    cycle === 0 ? tpl.maxWeightPerAsset : Math.max(0.4, tpl.maxWeightPerAsset - cycle * 0.05);

  const suffixJa = cycle > 0 ? ` (Cycle ${cycle + 1})` : "";
  const suffixEn = cycle > 0 ? ` (Cycle ${cycle + 1})` : "";
  const suffixZh = cycle > 0 ? ` (第${cycle + 1}周期)` : "";

  return {
    id: `quarter-${q}`,
    quarter: q,
    title: {
      ja: `Q${q}: ${tpl.title.ja}${suffixJa}`,
      en: `Q${q}: ${tpl.title.en}${suffixEn}`,
      zh: `Q${q}: ${tpl.title.zh}${suffixZh}`,
    },
    forecast: tpl.forecast,
    rivalPersona: tpl.rivalPersona,
    assets,
    correlation: tpl.corr.map((r) => r.slice()),
    covariance,
    targetReturn,
    liquidationFloor,
    maxWeightPerAsset,
    candidateShocks: tpl.shocks,
  };
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
