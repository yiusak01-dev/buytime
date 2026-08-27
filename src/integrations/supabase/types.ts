export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          note: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision: string | null
          admin_note: string | null
          buyer_evidence_url: string | null
          created_at: string
          description: string | null
          evidence_deadline_at: string | null
          evidence_urls: string[] | null
          id: string
          reason: string
          reported_by: string | null
          resolution: string | null
          seller_evidence_url: string | null
          status: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_decision?: string | null
          admin_note?: string | null
          buyer_evidence_url?: string | null
          created_at?: string
          description?: string | null
          evidence_deadline_at?: string | null
          evidence_urls?: string[] | null
          id?: string
          reason: string
          reported_by?: string | null
          resolution?: string | null
          seller_evidence_url?: string | null
          status?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_decision?: string | null
          admin_note?: string | null
          buyer_evidence_url?: string | null
          created_at?: string
          description?: string | null
          evidence_deadline_at?: string | null
          evidence_urls?: string[] | null
          id?: string
          reason?: string
          reported_by?: string | null
          resolution?: string | null
          seller_evidence_url?: string | null
          status?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      mall_reports: {
        Row: {
          created_at: string
          evidence_url: string | null
          id: string
          mall_id: string
          new_value: string | null
          old_value: string | null
          report_type: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          evidence_url?: string | null
          id?: string
          mall_id: string
          new_value?: string | null
          old_value?: string | null
          report_type: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          evidence_url?: string | null
          id?: string
          mall_id?: string
          new_value?: string | null
          old_value?: string | null
          report_type?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      malls: {
        Row: {
          address: string | null
          counter_floor: string | null
          counter_hours: string | null
          counter_location: string | null
          created_at: string
          entry_time_end: string | null
          entry_time_start: string | null
          hourly_rate: number | null
          hourly_rate_weekday: number
          hourly_rate_weekend: number
          icon_emoji: string
          id: string
          last_verified_at: string
          lat: number | null
          lng: number | null
          mall_category: string
          max_parking_hours: number | null
          min_spend_per_hour: number | null
          name: string
          notes: string | null
          promotion_end_time: string | null
          promotion_start_time: string | null
          spending_tiers: Json
          validation_method: string
        }
        Insert: {
          address?: string | null
          counter_floor?: string | null
          counter_hours?: string | null
          counter_location?: string | null
          created_at?: string
          entry_time_end?: string | null
          entry_time_start?: string | null
          hourly_rate?: number | null
          hourly_rate_weekday: number
          hourly_rate_weekend: number
          icon_emoji?: string
          id?: string
          last_verified_at?: string
          lat?: number | null
          lng?: number | null
          mall_category?: string
          max_parking_hours?: number | null
          min_spend_per_hour?: number | null
          name: string
          notes?: string | null
          promotion_end_time?: string | null
          promotion_start_time?: string | null
          spending_tiers?: Json
          validation_method?: string
        }
        Update: {
          address?: string | null
          counter_floor?: string | null
          counter_hours?: string | null
          counter_location?: string | null
          created_at?: string
          entry_time_end?: string | null
          entry_time_start?: string | null
          hourly_rate?: number | null
          hourly_rate_weekday?: number
          hourly_rate_weekend?: number
          icon_emoji?: string
          id?: string
          last_verified_at?: string
          lat?: number | null
          lng?: number | null
          mall_category?: string
          max_parking_hours?: number | null
          min_spend_per_hour?: number | null
          name?: string
          notes?: string | null
          promotion_end_time?: string | null
          promotion_start_time?: string | null
          spending_tiers?: Json
          validation_method?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message_type: string
          offer_amount: number | null
          offer_status: string | null
          sender_id: string | null
          sender_name: string | null
          transaction_id: string
          type: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_type?: string
          offer_amount?: number | null
          offer_status?: string | null
          sender_id?: string | null
          sender_name?: string | null
          transaction_id: string
          type?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_type?: string
          offer_amount?: number | null
          offer_status?: string | null
          sender_id?: string | null
          sender_name?: string | null
          transaction_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          mall_id: number
          max_price: number
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          mall_id: number
          max_price?: number
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          mall_id?: number
          max_price?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_initial: string
          created_at: string
          deals_count: number
          dispute_count: number
          id: string
          name: string
          phone: string | null
          rating: number
          trust_score: number
          wallet_balance: number
        }
        Insert: {
          avatar_initial?: string
          created_at?: string
          deals_count?: number
          dispute_count?: number
          id: string
          name?: string
          phone?: string | null
          rating?: number
          trust_score?: number
          wallet_balance?: number
        }
        Update: {
          avatar_initial?: string
          created_at?: string
          deals_count?: number
          dispute_count?: number
          id?: string
          name?: string
          phone?: string | null
          rating?: number
          trust_score?: number
          wallet_balance?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          id: string
          subscription: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subscription: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subscription?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          bad_reason: string | null
          comment: string | null
          created_at: string
          id: string
          ratee_id: string
          rater_id: string
          rating: number
          revealed_at: string | null
          submitted_at: string
          transaction_id: string
        }
        Insert: {
          bad_reason?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id: string
          rater_id: string
          rating: number
          revealed_at?: string | null
          submitted_at?: string
          transaction_id: string
        }
        Update: {
          bad_reason?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id?: string
          rater_id?: string
          rating?: number
          revealed_at?: string | null
          submitted_at?: string
          transaction_id?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number
          back_image_url: string | null
          created_at: string
          expiry_time: string
          free_hours: number
          front_image_url: string | null
          id: string
          listing_price: number
          mall_id: string
          seller_id: string | null
          serial_number: string
          shop_name: string
          status: string
        }
        Insert: {
          amount: number
          back_image_url?: string | null
          created_at?: string
          expiry_time: string
          free_hours: number
          front_image_url?: string | null
          id?: string
          listing_price: number
          mall_id: string
          seller_id?: string | null
          serial_number: string
          shop_name: string
          status?: string
        }
        Update: {
          amount?: number
          back_image_url?: string | null
          created_at?: string
          expiry_time?: string
          free_hours?: number
          front_image_url?: string | null
          id?: string
          listing_price?: number
          mall_id?: string
          seller_id?: string | null
          serial_number?: string
          shop_name?: string
          status?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number | null
          auto_release_at: string | null
          buyer_confirmed_at: string | null
          buyer_fee_pct: number
          buyer_id: string | null
          buyer_total: number
          completed_at: string | null
          created_at: string
          delivery_confirmed_at: string | null
          delivery_photo_url: string | null
          escrow_status: string
          exchange_deadline: string
          hidden_by_buyer: boolean | null
          hidden_by_seller: boolean | null
          id: string
          listing_id: string | null
          listing_price: number
          mall_name: string | null
          platform_fee: number
          receipt_id: string
          sale_price: number | null
          seller_fee_pct: number
          seller_id: string | null
          seller_payout: number
          seller_payout_amount: number | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          auto_release_at?: string | null
          buyer_confirmed_at?: string | null
          buyer_fee_pct: number
          buyer_id?: string | null
          buyer_total: number
          completed_at?: string | null
          created_at?: string
          delivery_confirmed_at?: string | null
          delivery_photo_url?: string | null
          escrow_status?: string
          exchange_deadline: string
          hidden_by_buyer?: boolean | null
          hidden_by_seller?: boolean | null
          id?: string
          listing_id?: string | null
          listing_price: number
          mall_name?: string | null
          platform_fee: number
          receipt_id: string
          sale_price?: number | null
          seller_fee_pct: number
          seller_id?: string | null
          seller_payout: number
          seller_payout_amount?: number | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          auto_release_at?: string | null
          buyer_confirmed_at?: string | null
          buyer_fee_pct?: number
          buyer_id?: string | null
          buyer_total?: number
          completed_at?: string | null
          created_at?: string
          delivery_confirmed_at?: string | null
          delivery_photo_url?: string | null
          escrow_status?: string
          exchange_deadline?: string
          hidden_by_buyer?: boolean | null
          hidden_by_seller?: boolean | null
          id?: string
          listing_id?: string | null
          listing_price?: number
          mall_name?: string | null
          platform_fee?: number
          receipt_id?: string
          sale_price?: number | null
          seller_fee_pct?: number
          seller_id?: string | null
          seller_payout?: number
          seller_payout_amount?: number | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_favourite_malls: {
        Row: {
          created_at: string
          id: string
          mall_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mall_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mall_id?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_text: string | null
          buy_count: number | null
          created_at: string | null
          deals_count: number | null
          discount_txns_remaining: number | null
          display_name: string | null
          email: string | null
          id: string
          is_verified: boolean | null
          phone: string | null
          rating: number | null
          sell_count: number | null
          stripe_customer_id: string | null
          updated_at: string | null
          wallet_balance: number | null
        }
        Insert: {
          avatar_text?: string | null
          buy_count?: number | null
          created_at?: string | null
          deals_count?: number | null
          discount_txns_remaining?: number | null
          display_name?: string | null
          email?: string | null
          id: string
          is_verified?: boolean | null
          phone?: string | null
          rating?: number | null
          sell_count?: number | null
          stripe_customer_id?: string | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Update: {
          avatar_text?: string | null
          buy_count?: number | null
          created_at?: string | null
          deals_count?: number | null
          discount_txns_remaining?: number | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean | null
          phone?: string | null
          rating?: number | null
          sell_count?: number | null
          stripe_customer_id?: string | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          id: string
          mall_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mall_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mall_id?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_active_listings: {
        Row: {
          amount: number | null
          back_image_url: string | null
          created_at: string | null
          expiry_time: string | null
          free_hours: number | null
          front_image_url: string | null
          id: string | null
          listing_price: number | null
          mall__counter_floor: string | null
          mall__counter_hours: string | null
          mall__counter_location: string | null
          mall__hourly_rate_weekday: number | null
          mall__hourly_rate_weekend: number | null
          mall__icon_emoji: string | null
          mall__id: string | null
          mall__last_verified_at: string | null
          mall__name: string | null
          mall__notes: string | null
          mall__promotion_end_time: string | null
          mall__promotion_start_time: string | null
          mall__spending_tiers: Json | null
          mall__validation_method: string | null
          mall_id: string | null
          seller_deals: number | null
          seller_id: string | null
          seller_initial: string | null
          seller_name: string | null
          seller_rating: number | null
          serial_number: string | null
          shop_name: string | null
          status: string | null
        }
        Relationships: []
      }
      v_public_listings: {
        Row: {
          amount: number | null
          created_at: string | null
          expiry_time: string | null
          free_hours: number | null
          id: string | null
          listing_price: number | null
          mall_address: string | null
          mall_counter_floor: string | null
          mall_counter_hours: string | null
          mall_counter_location: string | null
          mall_entry_time_end: string | null
          mall_entry_time_start: string | null
          mall_hourly_rate: number | null
          mall_hourly_rate_weekday: number | null
          mall_hourly_rate_weekend: number | null
          mall_icon_emoji: string | null
          mall_id: string | null
          mall_last_verified_at: string | null
          mall_lat: number | null
          mall_lng: number | null
          mall_mall_category: string | null
          mall_max_parking_hours: number | null
          mall_min_spend_per_hour: number | null
          mall_name: string | null
          mall_notes: string | null
          mall_promotion_end_time: string | null
          mall_promotion_start_time: string | null
          mall_spending_tiers: Json | null
          mall_validation_method: string | null
          photo_url: string | null
          seller_deals: number | null
          seller_id: string | null
          seller_initial: string | null
          seller_name: string | null
          seller_rating: number | null
          shop_name: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_get_report_context: {
        Args: { p_transaction_id: string }
        Returns: {
          content: string
          created_at: string
          msg_type: string
          sender_name: string
        }[]
      }
      admin_search_users: {
        Args: { search_query: string }
        Returns: {
          deals_count: number
          dispute_count: number
          email: string
          id: string
          name: string
          rating: number
        }[]
      }
      get_listing_alert_recipients: {
        Args: { p_asking_price: number; p_mall_id: number; p_seller_id: string }
        Returns: { user_id: string }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_transaction_participant: {
        Args: { _transaction_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "admin" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin", "super_admin"],
    },
  },
} as const
