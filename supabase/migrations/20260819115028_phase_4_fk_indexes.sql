create index forecast_items_source_account_owner_idx
  on public.forecast_items (source_account_id, user_id)
  where source_account_id is not null;

create index forecast_items_destination_account_owner_idx
  on public.forecast_items (destination_account_id, user_id)
  where destination_account_id is not null;

create index forecast_items_category_owner_idx
  on public.forecast_items (category_id, user_id)
  where category_id is not null;

create index forecast_items_scenario_owner_idx
  on public.forecast_items (scenario_id, user_id)
  where scenario_id is not null;

create index application_records_account_owner_idx
  on runway_migration.application_records (operating_account_id, user_id);

create index application_records_transaction_owner_idx
  on runway_migration.application_records (opening_transaction_id, user_id);
