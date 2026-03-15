import type { AltBreadthConfidence, AltBreadthLabel, PulseLabel, RiskLabel } from "@/src/entities/market-pulse";

export function formatFearGreedLabel(label: string) {
  switch (label) {
    case "extreme-fear":
      return "Extreme Fear";
    case "fear":
      return "Fear";
    case "neutral":
      return "Neutral";
    case "greed":
      return "Greed";
    case "extreme-greed":
      return "Extreme Greed";
    default:
      return "Neutral";
  }
}

export function formatSignedPct(value: number) {
  if (!Number.isFinite(value)) return "0.00%";
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(2)}%`;
}

export function formatSignedPctOrNa(value: number, isAvailable = true) {
  if (!isAvailable || !Number.isFinite(value)) return "N/A";
  return formatSignedPct(value);
}

export function formatCompactPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "N/A";
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${value.toFixed(4)}`;
}

export function formatSentimentLabel(label: PulseLabel) {
  if (label === "positive") return "Positive";
  if (label === "negative") return "Negative";
  return "Neutral";
}

export function formatSentimentLabelOrNa(label: PulseLabel, isAvailable = true) {
  return isAvailable ? formatSentimentLabel(label) : "No data";
}

export function formatRiskLabel(label: RiskLabel) {
  if (label === "risk-on") return "Risk On";
  if (label === "risk-off") return "Risk Off";
  return "Mixed";
}

export function formatRiskLabelOrNa(label: RiskLabel, isAvailable = true) {
  return isAvailable ? formatRiskLabel(label) : "No data";
}

export function formatAltBreadthLabel(label: AltBreadthLabel) {
  switch (label) {
    case "extreme-selling":
      return "Extreme Selling";
    case "selling-pressure":
      return "Selling Pressure";
    case "buying-pressure":
      return "Buying Pressure";
    case "extreme-buying":
      return "Extreme Buying";
    default:
      return "Neutral";
  }
}

export function formatAltBreadthLabelOrNa(label: AltBreadthLabel, isAvailable = true) {
  return isAvailable ? formatAltBreadthLabel(label) : "No data";
}

export function formatConfidence(confidence: AltBreadthConfidence) {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  if (confidence === "low") return "Low";
  return "Unavailable";
}

export function formatRelativeUpdatedAt(updatedAt: number) {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return "now";
  const diffSec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (diffSec < 15) return "now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}
