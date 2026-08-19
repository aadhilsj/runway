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
      account_balance_snapshots: {
        Row: {
          account_id: string
          balance_minor: number
          created_at: string
          id: string
          notes: string | null
          observed_at: string
          reconciliation_transaction_id: string | null
          source: Database["public"]["Enums"]["runway_snapshot_source"]
          user_id: string
        }
        Insert: {
          account_id: string
          balance_minor: number
          created_at?: string
          id?: string
          notes?: string | null
          observed_at: string
          reconciliation_transaction_id?: string | null
          source: Database["public"]["Enums"]["runway_snapshot_source"]
          user_id: string
        }
        Update: {
          account_id?: string
          balance_minor?: number
          created_at?: string
          id?: string
          notes?: string | null
          observed_at?: string
          reconciliation_transaction_id?: string | null
          source?: Database["public"]["Enums"]["runway_snapshot_source"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_snapshots_account_owner_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "account_snapshots_account_owner_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "account_snapshots_transaction_owner_fkey"
            columns: ["reconciliation_transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      accounts: {
        Row: {
          archived_at: string | null
          class: Database["public"]["Enums"]["runway_account_class"]
          created_at: string
          creation_idempotency_key: string | null
          creation_payload: Json | null
          currency: string
          id: string
          include_in_net_worth: boolean
          is_system: boolean
          liquidity_class: Database["public"]["Enums"]["runway_liquidity_class"]
          name: string
          opened_on: string | null
          subtype: Database["public"]["Enums"]["runway_account_subtype"]
          system_key:
            | Database["public"]["Enums"]["runway_system_account_key"]
            | null
          updated_at: string
          user_id: string
          valuation_mode: Database["public"]["Enums"]["runway_valuation_mode"]
        }
        Insert: {
          archived_at?: string | null
          class: Database["public"]["Enums"]["runway_account_class"]
          created_at?: string
          creation_idempotency_key?: string | null
          creation_payload?: Json | null
          currency: string
          id?: string
          include_in_net_worth?: boolean
          is_system?: boolean
          liquidity_class: Database["public"]["Enums"]["runway_liquidity_class"]
          name: string
          opened_on?: string | null
          subtype: Database["public"]["Enums"]["runway_account_subtype"]
          system_key?:
            | Database["public"]["Enums"]["runway_system_account_key"]
            | null
          updated_at?: string
          user_id: string
          valuation_mode?: Database["public"]["Enums"]["runway_valuation_mode"]
        }
        Update: {
          archived_at?: string | null
          class?: Database["public"]["Enums"]["runway_account_class"]
          created_at?: string
          creation_idempotency_key?: string | null
          creation_payload?: Json | null
          currency?: string
          id?: string
          include_in_net_worth?: boolean
          is_system?: boolean
          liquidity_class?: Database["public"]["Enums"]["runway_liquidity_class"]
          name?: string
          opened_on?: string | null
          subtype?: Database["public"]["Enums"]["runway_account_subtype"]
          system_key?:
            | Database["public"]["Enums"]["runway_system_account_key"]
            | null
          updated_at?: string
          user_id?: string
          valuation_mode?: Database["public"]["Enums"]["runway_valuation_mode"]
        }
        Relationships: []
      }
      categories: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          is_system: boolean
          kind: Database["public"]["Enums"]["runway_category_kind"]
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          kind: Database["public"]["Enums"]["runway_category_kind"]
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          kind?: Database["public"]["Enums"]["runway_category_kind"]
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_owner_fkey"
            columns: ["parent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      forecast_items: {
        Row: {
          amount_minor: number
          category_id: string | null
          confidence: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at: string
          default_sort_order: number | null
          destination_account_id: string | null
          expected_date: string
          expected_amount_minor_snapshot: number | null
          expected_date_snapshot: string | null
          id: string
          kind: Database["public"]["Enums"]["runway_planned_kind"]
          label: string
          legacy_source_id: string | null
          matched_transaction_id: string | null
          notes: string | null
          original_signed_amount: number | null
          scenario_id: string | null
          source_account_id: string | null
          status: Database["public"]["Enums"]["runway_planned_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_minor: number
          category_id?: string | null
          confidence?: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at?: string
          default_sort_order?: number | null
          destination_account_id?: string | null
          expected_date: string
          expected_amount_minor_snapshot?: number | null
          expected_date_snapshot?: string | null
          id?: string
          kind: Database["public"]["Enums"]["runway_planned_kind"]
          label: string
          legacy_source_id?: string | null
          matched_transaction_id?: string | null
          notes?: string | null
          original_signed_amount?: number | null
          scenario_id?: string | null
          source_account_id?: string | null
          status?: Database["public"]["Enums"]["runway_planned_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_minor?: number
          category_id?: string | null
          confidence?: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at?: string
          default_sort_order?: number | null
          destination_account_id?: string | null
          expected_date?: string
          expected_amount_minor_snapshot?: number | null
          expected_date_snapshot?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["runway_planned_kind"]
          label?: string
          legacy_source_id?: string | null
          matched_transaction_id?: string | null
          notes?: string | null
          original_signed_amount?: number | null
          scenario_id?: string | null
          source_account_id?: string | null
          status?: Database["public"]["Enums"]["runway_planned_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_items_category_owner_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "forecast_items_destination_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "forecast_items_destination_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "forecast_items_scenario_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "forecast_items_source_account_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "forecast_items_source_account_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      legacy_budget_history: {
        Row: {
          bucket_name: string
          budget_month: string
          budgeted_minor: number
          created_at: string
          id: string
          spend_minor: number
          user_id: string
          variance_minor: number | null
          was_active: boolean | null
        }
        Insert: {
          bucket_name: string
          budget_month: string
          budgeted_minor: number
          created_at?: string
          id?: string
          spend_minor: number
          user_id: string
          variance_minor?: number | null
          was_active?: boolean | null
        }
        Update: {
          bucket_name?: string
          budget_month?: string
          budgeted_minor?: number
          created_at?: string
          id?: string
          spend_minor?: number
          user_id?: string
          variance_minor?: number | null
          was_active?: boolean | null
        }
        Relationships: []
      }
      legacy_history_items: {
        Row: {
          actual_amount_minor: number | null
          category_name: string | null
          classification: string
          created_at: string
          id: string
          label: string
          legacy_source_id: string | null
          metadata: Json
          occurred_on: string | null
          planned_amount_minor: number | null
          source_path: string
          source_type: string
          user_id: string
        }
        Insert: {
          actual_amount_minor?: number | null
          category_name?: string | null
          classification: string
          created_at?: string
          id?: string
          label: string
          legacy_source_id?: string | null
          metadata?: Json
          occurred_on?: string | null
          planned_amount_minor?: number | null
          source_path: string
          source_type: string
          user_id: string
        }
        Update: {
          actual_amount_minor?: number | null
          category_name?: string | null
          classification?: string
          created_at?: string
          id?: string
          label?: string
          legacy_source_id?: string | null
          metadata?: Json
          occurred_on?: string | null
          planned_amount_minor?: number | null
          source_path?: string
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          base_currency: string
          created_at: string
          display_name: string | null
          forecast_horizon_months: number | null
          operating_floor_minor: number | null
          safety_window_days: number | null
          schema_version: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          display_name?: string | null
          forecast_horizon_months?: number | null
          operating_floor_minor?: number | null
          safety_window_days?: number | null
          schema_version?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          display_name?: string | null
          forecast_horizon_months?: number | null
          operating_floor_minor?: number | null
          safety_window_days?: number | null
          schema_version?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      runway_state: {
        Row: {
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_occurrences: {
        Row: {
          created_at: string
          expected_amount_minor_snapshot: number | null
          expected_date_snapshot: string | null
          id: string
          matched_transaction_id: string | null
          occurrence_date: string
          override_amount_minor: number | null
          override_date: string | null
          recurring_rule_id: string
          status: Database["public"]["Enums"]["runway_occurrence_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_amount_minor_snapshot?: number | null
          expected_date_snapshot?: string | null
          id?: string
          matched_transaction_id?: string | null
          occurrence_date: string
          override_amount_minor?: number | null
          override_date?: string | null
          recurring_rule_id: string
          status: Database["public"]["Enums"]["runway_occurrence_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          expected_amount_minor_snapshot?: number | null
          expected_date_snapshot?: string | null
          matched_transaction_id?: string | null
          occurrence_date?: string
          override_amount_minor?: number | null
          override_date?: string | null
          status?: Database["public"]["Enums"]["runway_occurrence_status"]
          updated_at?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          active: boolean
          amount_minor: number
          archived_at: string | null
          category_id: string | null
          confidence: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          default_sort_order: number | null
          destination_account_id: string | null
          end_on: string | null
          frequency: Database["public"]["Enums"]["runway_recurrence_frequency"]
          id: string
          interval_count: number
          is_reliable_income: boolean
          kind: Database["public"]["Enums"]["runway_planned_kind"]
          label: string
          legacy_source_id: string | null
          notes: string | null
          scenario_id: string | null
          source_account_id: string | null
          start_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount_minor: number
          archived_at?: string | null
          category_id?: string | null
          confidence?: Database["public"]["Enums"]["runway_planned_confidence"]
          day_of_month?: number | null
          day_of_week?: number | null
          default_sort_order?: number | null
          destination_account_id?: string | null
          end_on?: string | null
          frequency: Database["public"]["Enums"]["runway_recurrence_frequency"]
          id?: string
          interval_count?: number
          is_reliable_income?: boolean
          kind: Database["public"]["Enums"]["runway_planned_kind"]
          label: string
          legacy_source_id?: string | null
          notes?: string | null
          scenario_id?: string | null
          source_account_id?: string | null
          start_on: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount_minor?: number
          archived_at?: string | null
          category_id?: string | null
          confidence?: Database["public"]["Enums"]["runway_planned_confidence"]
          day_of_month?: number | null
          day_of_week?: number | null
          default_sort_order?: number | null
          destination_account_id?: string | null
          end_on?: string | null
          frequency?: Database["public"]["Enums"]["runway_recurrence_frequency"]
          interval_count?: number
          is_reliable_income?: boolean
          kind?: Database["public"]["Enums"]["runway_planned_kind"]
          label?: string
          notes?: string | null
          scenario_id?: string | null
          source_account_id?: string | null
          start_on?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          legacy_source_id: string | null
          migration_metadata: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          legacy_source_id?: string | null
          migration_metadata?: Json
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          legacy_source_id?: string | null
          migration_metadata?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_entries: {
        Row: {
          account_id: string
          amount_minor: number
          category_id: string | null
          created_at: string
          id: string
          memo: string | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount_minor: number
          category_id?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          transaction_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount_minor?: number
          category_id?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_entries_account_owner_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "transaction_entries_account_owner_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transaction_entries_category_owner_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transaction_entries_transaction_owner_fkey"
            columns: ["transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string
          currency: string
          data_quality: Database["public"]["Enums"]["runway_data_quality"]
          description: string
          id: string
          idempotency_key: string | null
          idempotency_payload: Json | null
          kind: Database["public"]["Enums"]["runway_transaction_kind"]
          legacy_source_id: string | null
          merchant_or_source: string | null
          notes: string | null
          occurred_at: string
          posted_at: string | null
          reverses_transaction_id: string | null
          status: Database["public"]["Enums"]["runway_transaction_status"]
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          currency: string
          data_quality?: Database["public"]["Enums"]["runway_data_quality"]
          description: string
          id?: string
          idempotency_key?: string | null
          idempotency_payload?: Json | null
          kind: Database["public"]["Enums"]["runway_transaction_kind"]
          legacy_source_id?: string | null
          merchant_or_source?: string | null
          notes?: string | null
          occurred_at: string
          posted_at?: string | null
          reverses_transaction_id?: string | null
          status?: Database["public"]["Enums"]["runway_transaction_status"]
          updated_at?: string
          user_id: string
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          data_quality?: Database["public"]["Enums"]["runway_data_quality"]
          description?: string
          id?: string
          idempotency_key?: string | null
          idempotency_payload?: Json | null
          kind?: Database["public"]["Enums"]["runway_transaction_kind"]
          legacy_source_id?: string | null
          merchant_or_source?: string | null
          notes?: string | null
          occurred_at?: string
          posted_at?: string | null
          reverses_transaction_id?: string | null
          status?: Database["public"]["Enums"]["runway_transaction_status"]
          updated_at?: string
          user_id?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_reversal_owner_fkey"
            columns: ["reverses_transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          class: Database["public"]["Enums"]["runway_account_class"] | null
          currency: string | null
          display_balance_minor: number | null
          ledger_balance_minor: number | null
          user_id: string | null
        }
        Relationships: []
      }
      current_net_worth: {
        Row: {
          currency: string | null
          net_worth_minor: number | null
          total_assets_minor: number | null
          total_liabilities_minor: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      match_forecast_item: {
        Args: { p_forecast_item_id: string; p_transaction_id: string }
        Returns: undefined
      }
      match_recurring_occurrence: {
        Args: { p_occurrence_date: string; p_recurring_rule_id: string; p_transaction_id: string }
        Returns: undefined
      }
      create_account: {
        Args: {
          p_class: Database["public"]["Enums"]["runway_account_class"]
          p_currency: string
          p_idempotency_key: string
          p_include_in_net_worth: boolean
          p_liquidity_class: Database["public"]["Enums"]["runway_liquidity_class"]
          p_name: string
          p_opened_on: string
          p_opening_balance_minor: number
          p_opening_description: string
          p_opening_occurred_at: string
          p_subtype: Database["public"]["Enums"]["runway_account_subtype"]
          p_valuation_mode: Database["public"]["Enums"]["runway_valuation_mode"]
        }
        Returns: string
      }
      post_debt_payment: {
        Args: {
          p_description: string
          p_idempotency_key: string
          p_liability_account_id: string
          p_notes: string
          p_occurred_at: string
          p_principal_minor: number
          p_source_account_id: string
        }
        Returns: string
      }
      post_expense: {
        Args: {
          p_amount_minor: number
          p_category_id: string
          p_description: string
          p_idempotency_key: string
          p_merchant_or_source: string
          p_notes: string
          p_occurred_at: string
          p_source_account_id: string
        }
        Returns: string
      }
      post_income: {
        Args: {
          p_amount_minor: number
          p_category_id: string
          p_description: string
          p_destination_account_id: string
          p_idempotency_key: string
          p_merchant_or_source: string
          p_notes: string
          p_occurred_at: string
        }
        Returns: string
      }
      post_opening_balance: {
        Args: {
          p_account_id: string
          p_balance_minor: number
          p_description: string
          p_idempotency_key: string
          p_notes: string
          p_occurred_at: string
        }
        Returns: string
      }
      post_transaction: {
        Args: {
          p_currency: string
          p_data_quality: Database["public"]["Enums"]["runway_data_quality"]
          p_description: string
          p_entries: Json
          p_idempotency_key: string
          p_kind: Database["public"]["Enums"]["runway_transaction_kind"]
          p_merchant_or_source: string
          p_notes: string
          p_occurred_at: string
        }
        Returns: string
      }
      post_transfer: {
        Args: {
          p_amount_minor: number
          p_description: string
          p_destination_account_id: string
          p_idempotency_key: string
          p_notes: string
          p_occurred_at: string
          p_source_account_id: string
        }
        Returns: string
      }
      reconcile_account: {
        Args: {
          p_account_id: string
          p_create_adjustment: boolean
          p_idempotency_key: string
          p_notes: string
          p_observed_at: string
          p_observed_balance_minor: number
        }
        Returns: Json
      }
      reverse_transaction: {
        Args: {
          p_idempotency_key: string
          p_notes: string
          p_occurred_at: string
          p_transaction_id: string
        }
        Returns: string
      }
      unmatch_forecast_item: {
        Args: { p_forecast_item_id: string }
        Returns: undefined
      }
    }
    Enums: {
      runway_account_class:
        | "asset"
        | "liability"
        | "income"
        | "expense"
        | "equity"
      runway_account_subtype:
        | "checking"
        | "savings"
        | "cash"
        | "investment"
        | "credit_card"
        | "loan"
        | "system"
      runway_category_kind: "income" | "expense"
      runway_data_quality:
        | "verified"
        | "imported_actual"
        | "planned_as_actual"
        | "inferred"
      runway_occurrence_status: "expected" | "skipped" | "overridden" | "matched"
      runway_planned_confidence: "committed" | "expected" | "tentative"
      runway_planned_kind: "income" | "expense" | "transfer"
      runway_planned_status: "expected" | "skipped" | "canceled" | "matched"
      runway_recurrence_frequency: "weekly" | "monthly" | "yearly"
      runway_liquidity_class:
        | "operating"
        | "liquid"
        | "invested"
        | "liability"
        | "non_liquid"
      runway_snapshot_source: "manual" | "statement" | "migration"
      runway_system_account_key:
        | "income"
        | "expense"
        | "opening_equity"
        | "adjustments"
      runway_transaction_kind:
        | "income"
        | "expense"
        | "transfer"
        | "refund"
        | "reimbursement"
        | "debt_payment"
        | "opening_balance"
        | "adjustment"
      runway_transaction_status: "draft" | "posted" | "void"
      runway_valuation_mode: "ledger" | "manual_market_value"
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      runway_account_class: [
        "asset",
        "liability",
        "income",
        "expense",
        "equity",
      ],
      runway_account_subtype: [
        "checking",
        "savings",
        "cash",
        "investment",
        "credit_card",
        "loan",
        "system",
      ],
      runway_category_kind: ["income", "expense"],
      runway_data_quality: [
        "verified",
        "imported_actual",
        "planned_as_actual",
        "inferred",
      ],
      runway_occurrence_status: ["expected", "skipped", "overridden", "matched"],
      runway_planned_confidence: ["committed", "expected", "tentative"],
      runway_planned_kind: ["income", "expense", "transfer"],
      runway_planned_status: ["expected", "skipped", "canceled", "matched"],
      runway_recurrence_frequency: ["weekly", "monthly", "yearly"],
      runway_liquidity_class: [
        "operating",
        "liquid",
        "invested",
        "liability",
        "non_liquid",
      ],
      runway_snapshot_source: ["manual", "statement", "migration"],
      runway_system_account_key: [
        "income",
        "expense",
        "opening_equity",
        "adjustments",
      ],
      runway_transaction_kind: [
        "income",
        "expense",
        "transfer",
        "refund",
        "reimbursement",
        "debt_payment",
        "opening_balance",
        "adjustment",
      ],
      runway_transaction_status: ["draft", "posted", "void"],
      runway_valuation_mode: ["ledger", "manual_market_value"],
    },
  },
} as const
