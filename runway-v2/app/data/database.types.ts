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
    PostgrestVersion: "14.17"
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
            foreignKeyName: "account_snapshots_account_owner_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
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
          hidden_from_accounts: boolean
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
          hidden_from_accounts?: boolean
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
          hidden_from_accounts?: boolean
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
      allocation_plan_items: {
        Row: {
          activation_source_item_id: string | null
          active: boolean
          amount_minor: number
          created_at: string
          destination_account_id: string | null
          destination_fund_id: string | null
          destination_type: string
          ends_on: string | null
          id: string
          label: string
          mode: string
          plan_id: string
          priority: number
          starts_on: string | null
          stop_basis: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activation_source_item_id?: string | null
          active?: boolean
          amount_minor: number
          created_at?: string
          destination_account_id?: string | null
          destination_fund_id?: string | null
          destination_type: string
          ends_on?: string | null
          id?: string
          label: string
          mode?: string
          plan_id: string
          priority: number
          starts_on?: string | null
          stop_basis?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activation_source_item_id?: string | null
          active?: boolean
          amount_minor?: number
          created_at?: string
          destination_account_id?: string | null
          destination_fund_id?: string | null
          destination_type?: string
          ends_on?: string | null
          id?: string
          label?: string
          mode?: string
          plan_id?: string
          priority?: number
          starts_on?: string | null
          stop_basis?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_items_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "allocation_items_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "allocation_items_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "allocation_items_activation_owner_fkey"
            columns: ["activation_source_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "allocation_plan_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "allocation_items_fund_owner_fkey"
            columns: ["destination_fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id", "user_id"]
          },
          {
            foreignKeyName: "allocation_items_fund_owner_fkey"
            columns: ["destination_fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "allocation_items_plan_owner_fkey"
            columns: ["plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "allocation_plans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      allocation_plans: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
          source_account_id: string
          trigger_kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          source_account_id: string
          trigger_kind?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          source_account_id?: string
          trigger_kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_plans_source_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "allocation_plans_source_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "allocation_plans_source_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
      }
      budget_group_categories: {
        Row: {
          category_id: string
          created_at: string
          group_id: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          group_id: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_group_categories_category_owner_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "budget_group_categories_group_owner_fkey"
            columns: ["group_id", "user_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      budget_groups: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_lines: {
        Row: {
          budget_period_id: string
          budgeted_minor: number
          category_id: string | null
          created_at: string
          group_id: string | null
          id: string
          notes: string | null
          rollover: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_period_id: string
          budgeted_minor: number
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          notes?: string | null
          rollover?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_period_id?: string
          budgeted_minor?: number
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          notes?: string | null
          rollover?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_category_owner_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "budget_lines_group_owner_fkey"
            columns: ["group_id", "user_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "budget_lines_period_owner_fkey"
            columns: ["budget_period_id", "user_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          created_at: string
          currency: string
          id: string
          month_start: string
          notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          month_start: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          month_start?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
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
      forecast_group_aliases: {
        Row: {
          created_at: string
          group_key: string
          id: string
          kind: Database["public"]["Enums"]["runway_planned_kind"]
          label_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_key: string
          id?: string
          kind: Database["public"]["Enums"]["runway_planned_kind"]
          label_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_key?: string
          id?: string
          kind?: Database["public"]["Enums"]["runway_planned_kind"]
          label_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      forecast_group_names: {
        Row: {
          created_at: string
          display_name: string
          group_key: string
          id: string
          kind: Database["public"]["Enums"]["runway_planned_kind"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          group_key: string
          id?: string
          kind: Database["public"]["Enums"]["runway_planned_kind"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          group_key?: string
          id?: string
          kind?: Database["public"]["Enums"]["runway_planned_kind"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      forecast_items: {
        Row: {
          amount_minor: number
          applied_scenario_change_id: string | null
          category_id: string | null
          confidence: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at: string
          default_sort_order: number | null
          destination_account_id: string | null
          expected_amount_minor_snapshot: number | null
          expected_date: string
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
          applied_scenario_change_id?: string | null
          category_id?: string | null
          confidence?: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at?: string
          default_sort_order?: number | null
          destination_account_id?: string | null
          expected_amount_minor_snapshot?: number | null
          expected_date: string
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
          applied_scenario_change_id?: string | null
          category_id?: string | null
          confidence?: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at?: string
          default_sort_order?: number | null
          destination_account_id?: string | null
          expected_amount_minor_snapshot?: number | null
          expected_date?: string
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
            foreignKeyName: "forecast_items_applied_change_owner_fkey"
            columns: ["applied_scenario_change_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenario_changes"
            referencedColumns: ["id", "user_id"]
          },
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
            foreignKeyName: "forecast_items_destination_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "forecast_items_matched_transaction_owner_fkey"
            columns: ["matched_transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
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
          {
            foreignKeyName: "forecast_items_source_account_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
      }
      fund_movements: {
        Row: {
          amount_minor: number
          created_at: string
          description: string
          fund_id: string
          id: string
          idempotency_key: string | null
          kind: string
          metadata: Json
          occurred_at: string
          payday_execution_item_id: string | null
          related_fund_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          description: string
          fund_id: string
          id?: string
          idempotency_key?: string | null
          kind: string
          metadata?: Json
          occurred_at?: string
          payday_execution_item_id?: string | null
          related_fund_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          description?: string
          fund_id?: string
          id?: string
          idempotency_key?: string | null
          kind?: string
          metadata?: Json
          occurred_at?: string
          payday_execution_item_id?: string | null
          related_fund_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_movements_fund_owner_fkey"
            columns: ["fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id", "user_id"]
          },
          {
            foreignKeyName: "fund_movements_fund_owner_fkey"
            columns: ["fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "fund_movements_payday_item_owner_fkey"
            columns: ["payday_execution_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "payday_execution_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "fund_movements_related_owner_fkey"
            columns: ["related_fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id", "user_id"]
          },
          {
            foreignKeyName: "fund_movements_related_owner_fkey"
            columns: ["related_fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "fund_movements_transaction_owner_fkey"
            columns: ["transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      funds: {
        Row: {
          active: boolean
          backing_account_id: string
          color: string | null
          created_at: string
          currency: string
          icon: string | null
          id: string
          name: string
          purpose_key: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          backing_account_id: string
          color?: string | null
          created_at?: string
          currency: string
          icon?: string | null
          id?: string
          name: string
          purpose_key?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          backing_account_id?: string
          color?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          name?: string
          purpose_key?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_backing_owner_fkey"
            columns: ["backing_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "funds_backing_owner_fkey"
            columns: ["backing_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "funds_backing_owner_fkey"
            columns: ["backing_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
      }
      goals: {
        Row: {
          cap_minor: number | null
          created_at: string
          floor_minor: number | null
          fund_id: string
          id: string
          is_primary: boolean
          name: string
          preferred_balance_minor: number | null
          preferred_contribution_minor: number | null
          status: string
          target_date: string | null
          target_minor: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cap_minor?: number | null
          created_at?: string
          floor_minor?: number | null
          fund_id: string
          id?: string
          is_primary?: boolean
          name: string
          preferred_balance_minor?: number | null
          preferred_contribution_minor?: number | null
          status?: string
          target_date?: string | null
          target_minor?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cap_minor?: number | null
          created_at?: string
          floor_minor?: number | null
          fund_id?: string
          id?: string
          is_primary?: boolean
          name?: string
          preferred_balance_minor?: number | null
          preferred_contribution_minor?: number | null
          status?: string
          target_date?: string | null
          target_minor?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_fund_owner_fkey"
            columns: ["fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id", "user_id"]
          },
          {
            foreignKeyName: "goals_fund_owner_fkey"
            columns: ["fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "funds"
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
      payday_execution_items: {
        Row: {
          approved_minor: number
          created_at: string
          executed_minor: number
          execution_id: string
          explanation: string | null
          id: string
          plan_item_id: string
          recommended_minor: number
          status: string
          user_id: string
        }
        Insert: {
          approved_minor: number
          created_at?: string
          executed_minor: number
          execution_id: string
          explanation?: string | null
          id?: string
          plan_item_id: string
          recommended_minor: number
          status: string
          user_id: string
        }
        Update: {
          approved_minor?: number
          created_at?: string
          executed_minor?: number
          execution_id?: string
          explanation?: string | null
          id?: string
          plan_item_id?: string
          recommended_minor?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payday_items_execution_owner_fkey"
            columns: ["execution_id", "user_id"]
            isOneToOne: false
            referencedRelation: "payday_executions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "payday_items_plan_item_owner_fkey"
            columns: ["plan_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "allocation_plan_items"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      payday_executions: {
        Row: {
          executed_at: string
          executed_total_minor: number
          id: string
          idempotency_key: string
          plan_id: string
          recommended_total_minor: number
          snapshot: Json
          status: string
          trigger_transaction_id: string | null
          user_id: string
        }
        Insert: {
          executed_at?: string
          executed_total_minor: number
          id?: string
          idempotency_key: string
          plan_id: string
          recommended_total_minor: number
          snapshot: Json
          status: string
          trigger_transaction_id?: string | null
          user_id: string
        }
        Update: {
          executed_at?: string
          executed_total_minor?: number
          id?: string
          idempotency_key?: string
          plan_id?: string
          recommended_total_minor?: number
          snapshot?: Json
          status?: string
          trigger_transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payday_executions_plan_owner_fkey"
            columns: ["plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "allocation_plans"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "payday_executions_trigger_owner_fkey"
            columns: ["trigger_transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      portfolio_value_snapshots: {
        Row: {
          account_id: string
          created_at: string
          id: string
          notes: string | null
          source: Database["public"]["Enums"]["runway_portfolio_value_source"]
          updated_at: string
          user_id: string
          value_minor: number
          valued_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          notes?: string | null
          source?: Database["public"]["Enums"]["runway_portfolio_value_source"]
          updated_at?: string
          user_id: string
          value_minor: number
          valued_at: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          source?: Database["public"]["Enums"]["runway_portfolio_value_source"]
          updated_at?: string
          user_id?: string
          value_minor?: number
          valued_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_value_snapshots_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "portfolio_value_snapshots_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "portfolio_value_snapshots_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
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
          created_at?: string
          expected_amount_minor_snapshot?: number | null
          expected_date_snapshot?: string | null
          id?: string
          matched_transaction_id?: string | null
          occurrence_date?: string
          override_amount_minor?: number | null
          override_date?: string | null
          recurring_rule_id?: string
          status?: Database["public"]["Enums"]["runway_occurrence_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_occurrences_rule_owner_fkey"
            columns: ["recurring_rule_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_occurrences_transaction_owner_fkey"
            columns: ["matched_transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      recurring_rules: {
        Row: {
          active: boolean
          amount_minor: number
          applied_scenario_change_id: string | null
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
          applied_scenario_change_id?: string | null
          archived_at?: string | null
          category_id?: string | null
          confidence?: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at?: string
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
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount_minor?: number
          applied_scenario_change_id?: string | null
          archived_at?: string | null
          category_id?: string | null
          confidence?: Database["public"]["Enums"]["runway_planned_confidence"]
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          default_sort_order?: number | null
          destination_account_id?: string | null
          end_on?: string | null
          frequency?: Database["public"]["Enums"]["runway_recurrence_frequency"]
          id?: string
          interval_count?: number
          is_reliable_income?: boolean
          kind?: Database["public"]["Enums"]["runway_planned_kind"]
          label?: string
          legacy_source_id?: string | null
          notes?: string | null
          scenario_id?: string | null
          source_account_id?: string | null
          start_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_applied_change_owner_fkey"
            columns: ["applied_scenario_change_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenario_changes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_rules_category_owner_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_rules_destination_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "recurring_rules_destination_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_rules_destination_account_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "recurring_rules_scenario_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_rules_source_account_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "recurring_rules_source_account_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_rules_source_account_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
      }
      reimbursement_entries: {
        Row: {
          created_at: string
          delta_minor: number
          description: string
          entry_kind: string
          id: string
          occurred_at: string
          pool_id: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta_minor: number
          description: string
          entry_kind: string
          id?: string
          occurred_at: string
          pool_id: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta_minor?: number
          description?: string
          entry_kind?: string
          id?: string
          occurred_at?: string
          pool_id?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_entries_pool_id_user_id_fkey"
            columns: ["pool_id", "user_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_pools"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "reimbursement_entries_transaction_id_user_id_fkey"
            columns: ["transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      reimbursement_pools: {
        Row: {
          created_at: string
          destination_account_id: string
          expected_date: string
          forecast_item_id: string | null
          id: string
          name: string
          receivable_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination_account_id: string
          expected_date: string
          forecast_item_id?: string | null
          id?: string
          name: string
          receivable_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination_account_id?: string
          expected_date?: string
          forecast_item_id?: string | null
          id?: string
          name?: string
          receivable_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_pools_destination_account_id_user_id_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "reimbursement_pools_destination_account_id_user_id_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "reimbursement_pools_destination_account_id_user_id_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "reimbursement_pools_forecast_item_id_user_id_fkey"
            columns: ["forecast_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "forecast_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "reimbursement_pools_receivable_account_id_user_id_fkey"
            columns: ["receivable_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "reimbursement_pools_receivable_account_id_user_id_fkey"
            columns: ["receivable_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "reimbursement_pools_receivable_account_id_user_id_fkey"
            columns: ["receivable_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
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
      scenario_applications: {
        Row: {
          applied_at: string
          change_count: number
          confirmation_token: string
          id: string
          scenario_id: string
          summary: Json
          user_id: string
        }
        Insert: {
          applied_at?: string
          change_count: number
          confirmation_token: string
          id?: string
          scenario_id: string
          summary: Json
          user_id: string
        }
        Update: {
          applied_at?: string
          change_count?: number
          confirmation_token?: string
          id?: string
          scenario_id?: string
          summary?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_applications_scenario_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      scenario_changes: {
        Row: {
          amount_minor: number | null
          boolean_value: boolean | null
          category_id: string | null
          change_type: string
          confidence:
            | Database["public"]["Enums"]["runway_planned_confidence"]
            | null
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          destination_account_id: string | null
          effective_on: string | null
          effective_until: string | null
          frequency:
            | Database["public"]["Enums"]["runway_recurrence_frequency"]
            | null
          fund_id: string | null
          id: string
          interval_count: number | null
          label: string | null
          payload_json: Json
          scenario_id: string
          sort_order: number
          source_account_id: string | null
          target_allocation_item_id: string | null
          target_field: string | null
          target_forecast_item_id: string | null
          target_goal_id: string | null
          target_recurring_rule_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_minor?: number | null
          boolean_value?: boolean | null
          category_id?: string | null
          change_type: string
          confidence?:
            | Database["public"]["Enums"]["runway_planned_confidence"]
            | null
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          destination_account_id?: string | null
          effective_on?: string | null
          effective_until?: string | null
          frequency?:
            | Database["public"]["Enums"]["runway_recurrence_frequency"]
            | null
          fund_id?: string | null
          id?: string
          interval_count?: number | null
          label?: string | null
          payload_json?: Json
          scenario_id: string
          sort_order?: number
          source_account_id?: string | null
          target_allocation_item_id?: string | null
          target_field?: string | null
          target_forecast_item_id?: string | null
          target_goal_id?: string | null
          target_recurring_rule_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_minor?: number | null
          boolean_value?: boolean | null
          category_id?: string | null
          change_type?: string
          confidence?:
            | Database["public"]["Enums"]["runway_planned_confidence"]
            | null
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          destination_account_id?: string | null
          effective_on?: string | null
          effective_until?: string | null
          frequency?:
            | Database["public"]["Enums"]["runway_recurrence_frequency"]
            | null
          fund_id?: string | null
          id?: string
          interval_count?: number | null
          label?: string | null
          payload_json?: Json
          scenario_id?: string
          sort_order?: number
          source_account_id?: string | null
          target_allocation_item_id?: string | null
          target_field?: string | null
          target_forecast_item_id?: string | null
          target_goal_id?: string | null
          target_recurring_rule_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_changes_allocation_owner_fkey"
            columns: ["target_allocation_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "allocation_plan_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_category_owner_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_destination_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_destination_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_destination_owner_fkey"
            columns: ["destination_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_forecast_owner_fkey"
            columns: ["target_forecast_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "forecast_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_fund_owner_fkey"
            columns: ["fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_fund_owner_fkey"
            columns: ["fund_id", "user_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_goal_owner_fkey"
            columns: ["target_goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_rule_owner_fkey"
            columns: ["target_recurring_rule_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_scenario_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_source_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_source_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scenario_changes_source_owner_fkey"
            columns: ["source_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
      }
      scenarios: {
        Row: {
          applied_at: string | null
          archived_at: string | null
          comparison_enabled: boolean
          created_at: string
          description: string | null
          end_on: string | null
          id: string
          legacy_source_id: string | null
          migration_metadata: Json
          name: string
          start_on: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          archived_at?: string | null
          comparison_enabled?: boolean
          created_at?: string
          description?: string | null
          end_on?: string | null
          id?: string
          legacy_source_id?: string | null
          migration_metadata?: Json
          name: string
          start_on?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          archived_at?: string | null
          comparison_enabled?: boolean
          created_at?: string
          description?: string | null
          end_on?: string | null
          id?: string
          legacy_source_id?: string | null
          migration_metadata?: Json
          name?: string
          start_on?: string | null
          status?: string
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
            foreignKeyName: "transaction_entries_account_owner_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
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
      budget_actuals: {
        Row: {
          actual_minor: number | null
          category_id: string | null
          month_start: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_entries_category_owner_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      budget_commitments: {
        Row: {
          category_id: string | null
          committed_minor: number | null
          month_start: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_items_category_owner_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
      fund_backing_summary: {
        Row: {
          account_balance_minor: number | null
          account_id: string | null
          account_name: string | null
          allocated_minor: number | null
          backing_valid: boolean | null
          unallocated_minor: number | null
          user_id: string | null
        }
        Relationships: []
      }
      fund_balances: {
        Row: {
          backing_account_id: string | null
          balance_minor: number | null
          currency: string | null
          fund_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funds_backing_owner_fkey"
            columns: ["backing_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "funds_backing_owner_fkey"
            columns: ["backing_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "funds_backing_owner_fkey"
            columns: ["backing_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fund_backing_summary"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
      }
    }
    Functions: {
      adjust_reimbursement_pool: {
        Args: {
          p_description: string
          p_expected_date: string
          p_idempotency_key: string
          p_pool_id: string
          p_total_minor: number
        }
        Returns: string
      }
      allocate_to_fund: {
        Args: {
          p_amount_minor: number
          p_description: string
          p_fund_id: string
          p_idempotency_key: string
          p_occurred_at: string
        }
        Returns: string
      }
      apply_plan_to_base: {
        Args: { p_confirmation_token: string; p_scenario_id: string }
        Returns: Json
      }
      convert_forecast_item_to_reimbursement_pool: {
        Args: { p_forecast_item_id: string }
        Returns: string
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
      delete_plan: { Args: { p_scenario_id: string }; Returns: undefined }
      execute_payday_allocation: {
        Args: {
          p_idempotency_key: string
          p_items: Json
          p_plan_id: string
          p_trigger_transaction_id: string
        }
        Returns: string
      }
      match_forecast_item: {
        Args: { p_forecast_item_id: string; p_transaction_id: string }
        Returns: undefined
      }
      match_recurring_occurrence: {
        Args: {
          p_occurrence_date: string
          p_recurring_rule_id: string
          p_transaction_id: string
        }
        Returns: undefined
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
      post_fund_spend: {
        Args: {
          p_amount_minor: number
          p_category_id: string
          p_description: string
          p_fund_id: string
          p_idempotency_key: string
          p_merchant_or_source: string
          p_notes: string
          p_occurred_at: string
          p_source_account_id: string
        }
        Returns: Json
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
      post_split_expense: {
        Args: {
          p_amount_minor: number
          p_category_id: string
          p_description: string
          p_idempotency_key: string
          p_notes: string
          p_occurred_at: string
          p_pool_id: string
          p_reimbursable_minor: number
          p_source_account_id: string
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
      preview_plan_application: {
        Args: { p_scenario_id: string }
        Returns: Json
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
      record_reimbursement: {
        Args: {
          p_amount_minor: number
          p_destination_account_id: string
          p_idempotency_key: string
          p_notes: string
          p_occurred_at: string
          p_pool_id: string
        }
        Returns: string
      }
      release_from_fund: {
        Args: {
          p_amount_minor: number
          p_description: string
          p_fund_id: string
          p_idempotency_key: string
          p_occurred_at: string
        }
        Returns: string
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
      settle_forecast_item: {
        Args: {
          p_actual_amount_minor: number
          p_category_id: string
          p_destination_account_id: string
          p_forecast_item_id: string
          p_idempotency_key: string
          p_notes: string
          p_occurred_at: string
          p_source_account_id: string
        }
        Returns: string
      }
      settle_plan_item: {
        Args: {
          p_actual_amount_minor: number
          p_category_id: string
          p_destination_account_id: string
          p_forecast_item_id: string
          p_idempotency_key: string
          p_notes: string
          p_occurred_at: string
          p_scenario_change_id: string
          p_source_account_id: string
        }
        Returns: string
      }
      settle_recurring_occurrence: {
        Args: {
          p_actual_amount_minor: number
          p_category_id: string
          p_destination_account_id: string
          p_idempotency_key: string
          p_notes: string
          p_occurred_at: string
          p_occurrence_date: string
          p_recurring_rule_id: string
          p_source_account_id: string
        }
        Returns: string
      }
      transfer_between_funds: {
        Args: {
          p_amount_minor: number
          p_description: string
          p_destination_fund_id: string
          p_idempotency_key: string
          p_occurred_at: string
          p_source_fund_id: string
        }
        Returns: Json
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
      runway_liquidity_class:
        | "operating"
        | "liquid"
        | "invested"
        | "liability"
        | "non_liquid"
      runway_occurrence_status:
        | "expected"
        | "skipped"
        | "overridden"
        | "matched"
      runway_planned_confidence: "committed" | "expected" | "tentative"
      runway_planned_kind: "income" | "expense" | "transfer"
      runway_planned_status: "expected" | "skipped" | "canceled" | "matched"
      runway_portfolio_value_source: "manual" | "imported" | "broker"
      runway_recurrence_frequency: "weekly" | "monthly" | "yearly"
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
      runway_liquidity_class: [
        "operating",
        "liquid",
        "invested",
        "liability",
        "non_liquid",
      ],
      runway_occurrence_status: [
        "expected",
        "skipped",
        "overridden",
        "matched",
      ],
      runway_planned_confidence: ["committed", "expected", "tentative"],
      runway_planned_kind: ["income", "expense", "transfer"],
      runway_planned_status: ["expected", "skipped", "canceled", "matched"],
      runway_portfolio_value_source: ["manual", "imported", "broker"],
      runway_recurrence_frequency: ["weekly", "monthly", "yearly"],
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
