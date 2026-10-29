-- Anonymous visitor counts. Number 042.
-- 041 inserted the public-node lesson. This file creates two tables.
-- It stores a daily page-view count and a daily unique count.
-- The unique key is a salted hash. The raw address and browser are not columns.

CREATE TABLE IF NOT EXISTS visitor_days (
  day date PRIMARY KEY,
  page_views integer NOT NULL DEFAULT 0,
  unique_visitors integer NOT NULL DEFAULT 0,
  CONSTRAINT visitor_days_views_chk CHECK (page_views >= 0),
  CONSTRAINT visitor_days_uniques_chk CHECK (unique_visitors >= 0)
);

CREATE TABLE IF NOT EXISTS visitor_seen (
  day date NOT NULL,
  visitor_hash text NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);
