// Loads src/private/rates.local.json when it exists and applies it over the
// placeholder reference data, in place, before any screen reads it. The file
// is gitignored, so only a build made on a machine that has it carries the
// confidential figures. See src/private/README.md.
import { bandings, credit_rates, elite_tiers, products, type BandingCode, type CreditMetric, type EliteTier } from "../mock/data";

interface RatesFile {
  bandings?: Partial<Record<BandingCode, number>>;
  products?: Record<string, Partial<{ name: string; comm_rate: number; typical_premium: number; elite_rate: number; mdrt_premium: number; mdrt_commission: number; wape: number }>>;
  elite_tiers?: EliteTier[];
}

const files = import.meta.glob("../private/rates.local.json", { eager: true, import: "default" }) as Record<string, RatesFile>;
const file = Object.values(files)[0];

/** True when the confidential file was present at build time. */
export const PRIVATE_RATES_LOADED = file !== undefined;

if (file) {
  for (const [code, rate] of Object.entries(file.bandings ?? {})) {
    const b = bandings.find((x) => x.code === code);
    if (b && typeof rate === "number") b.commission_rate = rate;
  }
  for (const [id, p] of Object.entries(file.products ?? {})) {
    const product = products.find((x) => x.id === id);
    if (!product) continue;
    if (typeof p.name === "string") product.name = p.name;
    if (typeof p.comm_rate === "number") product.comm_rate = p.comm_rate;
    if (typeof p.typical_premium === "number") product.typical_premium = p.typical_premium;
    if (typeof p.elite_rate === "number") product.elite_rate = p.elite_rate;
    for (const metric of ["mdrt_premium", "mdrt_commission", "wape"] as CreditMetric[]) {
      const rate = p[metric];
      if (typeof rate !== "number") continue;
      const row = credit_rates.find((r) => r.product_id === id && r.metric === metric);
      if (row) row.rate = rate;
      else credit_rates.push({ product_id: id, metric, rate });
    }
  }
  if (Array.isArray(file.elite_tiers) && file.elite_tiers.length > 0) elite_tiers.splice(0, elite_tiers.length, ...file.elite_tiers);
}
