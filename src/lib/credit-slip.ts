// 信用卡底單（credit card slip）提示邏輯

export const CREDIT_CARD_LABEL = "信用卡";

export function isCreditCardPayment(paymentMethod?: string | null, serial?: string | null): boolean {
  const text = `${paymentMethod ?? ""} ${serial ?? ""}`;
  return text.includes(CREDIT_CARD_LABEL);
}

export const SLIP_HINT_SELL = "💳 信用卡付款須連同底單（credit card slip）一併交俾買家，請保留底單。";
export const SLIP_HINT_DETAIL = "📋 此收據為信用卡付款，面交時包含底單";
export const SLIP_HINT_CARD = "含底單";
export const SLIP_HINT_CHAT = "💳 提示：賣家請記得連同信用卡底單一併交收";
