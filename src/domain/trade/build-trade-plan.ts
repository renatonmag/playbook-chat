import { tradePlanSchemaV1, type TradePlan } from "~/schemas/trade-plan.schema";

export function buildTradePlan(input: TradePlan): TradePlan {
  return tradePlanSchemaV1.parse(input);
}
