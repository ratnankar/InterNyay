-- released_judges has been unused since V9 (a judge without a court is a judge profile with no listing), and its rows were
-- copied into judge_profiles there. Nothing in the application reads or writes it any more.
DROP TABLE IF EXISTS released_judges;
