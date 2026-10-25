-- 外鍵加索引：配對、對話、興趣同積分查詢會快啲（資料多咗之後尤其明顯）
create index if not exists aah_appeals_report_id_idx on public.aah_appeals (report_id);
create index if not exists aah_appeals_user_id_idx on public.aah_appeals (user_id);
create index if not exists aah_interest_messages_interest_id_idx on public.aah_interest_messages (interest_id);
create index if not exists aah_interest_messages_from_id_idx on public.aah_interest_messages (from_id);
create index if not exists aah_interests_user_id_idx on public.aah_interests (user_id);
create index if not exists aah_match_participants_user_id_idx on public.aah_match_participants (user_id);
create index if not exists aah_matches_author_id_idx on public.aah_matches (author_id);
create index if not exists aah_matches_post_id_idx on public.aah_matches (post_id);
create index if not exists aah_messages_from_id_idx on public.aah_messages (from_id);
create index if not exists aah_pins_post_id_idx on public.aah_pins (post_id);
create index if not exists aah_pins_user_started_idx on public.aah_pins (user_id, started_at);
create index if not exists aah_point_ledger_match_id_idx on public.aah_point_ledger (match_id);
create index if not exists aah_point_ledger_user_id_idx on public.aah_point_ledger (user_id, created_at);
create index if not exists aah_reports_accused_id_idx on public.aah_reports (accused_id);
create index if not exists aah_reports_match_id_idx on public.aah_reports (match_id);
create index if not exists aah_reports_reporter_id_idx on public.aah_reports (reporter_id);
create index if not exists aah_voucher_requests_user_id_idx on public.aah_voucher_requests (user_id);
