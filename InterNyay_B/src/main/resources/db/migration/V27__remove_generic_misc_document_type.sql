-- Misc. applications have their own page now (applications, orders and additional documents are saved under the
-- application). The generic "Misc. Application (Type Manually)" document type made files that belong to no application,
-- so it is removed from the document types. Documents already saved with it keep their type text
DELETE FROM option_items WHERE list_key = 'DOCUMENT_TYPE' AND value = 'Misc. Application (Type Manually)';
