export const NARRATIVE_BUCKETS = {
  ai: ["FET", "AGIX", "TAO", "RNDR", "RENDER", "WLD", "ARKM", "VIRTUAL", "AIXBT"],
  meme: ["DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI", "BOME", "POPCAT", "BRETT", "MOG"],
  defi: ["UNI", "AAVE", "MKR", "LDO", "CRV", "SNX", "COMP", "PENDLE", "JUP", "ENA", "SUSHI", "DYDX", "RUNE"],
  layer1: ["SOL", "AVAX", "ADA", "SUI", "APT", "NEAR", "ATOM", "SEI", "TIA", "INJ", "ALGO"],
  gaming: ["IMX", "GALA", "AXS", "RON", "SAND", "MANA", "BEAMX", "SUPER", "PYR"],
  rwa: ["ONDO", "LINK", "XDC", "POLYX", "CFG", "OM", "TRAC", "RSR"],
} as const;

export type NarrativeKey = keyof typeof NARRATIVE_BUCKETS;

export function narrativeDisplay(key: NarrativeKey) {
  switch (key) {
    case "ai":
      return "AI";
    case "meme":
      return "Memes";
    case "defi":
      return "DeFi";
    case "layer1":
      return "Layer 1";
    case "gaming":
      return "Gaming";
    case "rwa":
      return "RWA";
    default:
      return "Theme";
  }
}

export function narrativeLabel(key: NarrativeKey) {
  switch (key) {
    case "ai":
      return "AI leading";
    case "meme":
      return "Memes hot";
    case "defi":
      return "DeFi leading";
    case "layer1":
      return "Layer 1 leading";
    case "gaming":
      return "Gaming firming";
    case "rwa":
      return "RWA firming";
    default:
      return "Leadership broadening";
  }
}
