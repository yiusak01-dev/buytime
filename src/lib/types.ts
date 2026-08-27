export type SpendingTier = { min_spend: number; hours: number };

export type Mall = {
  id: string;
  name: string;
  icon_emoji: string;
  hourly_rate_weekday: number;
  hourly_rate_weekend: number;
  spending_tiers: SpendingTier[];
  promotion_start_time: string | null;
  promotion_end_time: string | null;
  counter_floor: string | null;
  counter_location: string | null;
  counter_hours: string | null;
  validation_method: string;
  notes: string | null;
  last_verified_at: string;
  entry_time_start: string | null;
  entry_time_end: string | null;
  /** 每小時泊車所需最低消費 */
  min_spend_per_hour: number;
  /** 商場時租 */
  hourly_rate: number;
  /** 可換取泊車時數上限 */
  max_parking_hours: number;
  /** 地區（用於搜尋） */
  district: string | null;
  /** 商場分類：A/B = 免費泊車優惠，C = 領展「優惠泊」$5/hr */
  mall_category?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type Receipt = {
  id: string;
  mall_id: string;
  seller_id: string | null;
  shop_name: string;
  amount: number;
  free_hours: number;
  listing_price: number;
  serial_number: string;
  expiry_time: string;
  status: string;
  created_at: string;
  photo_url: string | null;
  /** 付款方式（例如：信用卡 / 八達通） */
  payment_method: string | null;
};

export type SellerInfo = {
  name: string;
  initial: string;
  rating: number;
  deals: number;
};

export type ReceiptWithMall = Receipt & { mall: Mall; seller: SellerInfo };

export type TxStatus = 'active' | 'pending_exchange' | 'validating' | 'completed' | 'disputed' | 'cancelled';
