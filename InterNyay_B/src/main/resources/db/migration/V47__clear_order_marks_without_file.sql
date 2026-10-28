UPDATE hearings
SET ecourts_order_file = NULL
WHERE order_doc_id IS NULL
  AND ecourts_order_file IS NOT NULL;
