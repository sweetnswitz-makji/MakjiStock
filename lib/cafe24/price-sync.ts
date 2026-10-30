import demoShop from "@/config/cafe24-product-map.json";
import { CAFE24_OPTION_PRICES } from "@/config/cafe24-option-prices";
import { cafe24Request } from "@/lib/cafe24/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  assertCompleteVariantPricePlan,
  buildVariantPricePlan,
  variantUpdateRequestBody,
  type Cafe24Variant,
} from "@/lib/pricing/variant-pricing";

type DemoMap = Record<string, { productNo: number; sampleName: string }>;

function isDemoProduct(productId: string, productNo: number): boolean {
  const config = demoShop as { _mallId?: string; map?: DemoMap };
  if (process.env.CAFE24_MALL_ID !== config._mallId) return false;
  const map = config.map ?? {};
  return map[productId]?.productNo === productNo;
}

/* 어드민 "몰 가격 반영" 스위치. 꺼져 있으면 가격은 계산·저장하되 몰 판매가는 바꾸지 않는다.
   따로 테이블을 두지 않고 변경 기록(admin_audit_log)의 마지막 켜짐/꺼짐 행을 상태로 쓴다 —
   누가 언제 바꿨는지가 함께 남는다. 기록이 없거나 못 읽으면 꺼짐으로 본다.
   ponytail: 운영 스위치가 더 생기면 settings 테이블로 옮긴다. */
export const PRICE_SYNC_TARGET = "Cafe24 가격 반영";

export async function priceSyncEnabled(): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("admin_audit_log")
    .select("change")
    .eq("kind", "product")
    .eq("target", PRICE_SYNC_TARGET)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[price-sync] 스위치를 읽지 못해 꺼짐으로 봅니다", error.message);
    return false;
  }
  return data?.change === "켜짐";
}

export type Cafe24PriceSyncResult = {
  variantsUpdated: number;
  optionPrices: string[];
  optionsSkippedReason?: string;
};

/** 대표 판매가와 모든 옵션 추가금을 한 번의 가격 묶음으로 맞춘다. */
export async function syncCafe24ProductPrice({
  productId,
  productNo,
  productSalePriceWon,
  discountPct,
  shopNo,
  roundingWon = 10,
}: {
  productId: string;
  productNo: number;
  productSalePriceWon: number;
  discountPct: number;
  shopNo: number;
  roundingWon?: number;
}): Promise<Cafe24PriceSyncResult> {
  const definitions = CAFE24_OPTION_PRICES[productId] ?? [];
  let updates = [] as ReturnType<typeof buildVariantPricePlan>["updates"];
  let optionsSkippedReason: string | undefined;

  /* 현재 데모몰의 샘플 상품은 실제 옵션 구성이 없다. 옵션이 없는 동안에는 대표가만
     갱신한다. 데모몰에도 실제와 같은 옵션을 만들면 그때부터 동일한 검증과 PUT을 탄다. */
  const demoProduct = isDemoProduct(productId, productNo);
  if (definitions.length > 0) {
    const path =
      `/api/v2/admin/products/${productNo}/variants` +
      `?shop_no=${shopNo}&fields=variant_code,options,additional_amount`;
    const response = await cafe24Request<{ variants?: Cafe24Variant[] }>(path);
    const plan = buildVariantPricePlan({
      variants: response.variants ?? [],
      definitions,
      productSalePriceWon,
      discountPct,
      roundingWon,
    });
    const remoteHasOptions = (response.variants ?? []).some(
      (variant) => (variant.options ?? []).length > 0,
    );
    if (demoProduct && !remoteHasOptions && definitions.length > 1) {
      optionsSkippedReason = "데모 상품에 옵션 없음 — 대표 판매가만 반영";
    } else {
      // 대표가를 바꾸기 전에 검증해 옵션 일부만 누락된 가격이 공개되는 일을 막는다.
      assertCompleteVariantPricePlan(plan);
      updates = plan.updates;
    }
  }

  /* Cafe24는 POST·PUT의 shop_no를 쿼리가 아니라 body로 받는다. */
  await cafe24Request(`/api/v2/admin/products/${productNo}`, {
    method: "PUT",
    body: JSON.stringify({
      shop_no: shopNo,
      request: { price: String(productSalePriceWon) },
    }),
  });

  if (updates.length > 0) {
    await cafe24Request(`/api/v2/admin/products/${productNo}/variants`, {
      method: "PUT",
      body: JSON.stringify(variantUpdateRequestBody(shopNo, updates)),
    });
  }

  return {
    variantsUpdated: updates.length,
    optionPrices: updates.map(
      (update) => `${update.optionValue}:${update.salePriceWon}원(+${update.additionalAmountWon}원)`,
    ),
    ...(optionsSkippedReason ? { optionsSkippedReason } : {}),
  };
}
