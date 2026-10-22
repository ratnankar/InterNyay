-- The Juvenile Justice Board mark (V36) is now set on a whole court (every row of the court), not on a single court no.
-- Marks made on single court numbers with the first version are cleared so they do not turn a whole court into a board;
-- mark the court again under Admin > Courts
UPDATE courts SET juvenile_justice_board = FALSE;
