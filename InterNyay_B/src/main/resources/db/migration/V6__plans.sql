-- V6: InterNyay plans with monthly and yearly pricing (reference data).
-- Rows are matched on the unique `code`, so this also works on a table that already has plans.
-- Needs MySQL 8.0.19 or newer: it uses a row alias in the upsert instead of the deprecated VALUES() function, so there is no warning 1287.
-- Not for MySQL 5.7 or MariaDB, which do not support the row alias.
-- Yearly price = monthly x 10 (about 2 months free). Edit the numbers, or change them later in Admin -> Plans.
-- Leave price_yearly NULL for a plan with no yearly option. discount_price* must be lower than the price it discounts.

-- audience: ADVOCATE plans are shown to advocates and on the landing page; BUSINESS plans are only for business accounts
--           (hidden from advocates and from the admin's advocate Plan list); BOTH plans are shown to advocates and business accounts.
-- most_popular: 1 shows the "Most popular" badge; keep it on one plan per audience (the Admin -> Plans screen enforces this).

INSERT INTO plans
  (code, name, tagline, price_monthly, discount_price, price_yearly, discount_price_yearly,
   coming_soon, audience, most_popular, associate_limit, features, feature_keys, sort_order)
VALUES
  ('FREE', 'Free', 'Try InterNyay', 0, NULL, NULL, NULL,
   0, 'ADVOCATE', 0, 1,
   'Cases, clients and hearings\nTo-do list and calendar\nCourt fee calculator\nQuick access directory',
   'court_fee_calculator', 1),

  ('BASIC', 'Basic', 'For solo advocates', 299, NULL, 2990, NULL,
   0, 'ADVOCATE', 0, 2,
   'Everything in Free\nDocument storage\nFee & expense tracking\nEmail support',
   'court_fee_calculator,documents,office_expenses,transactions', 2),

  ('PROFESSIONAL', 'Professional', 'For busy practices', 699, NULL, 6990, 5990,
   0, 'ADVOCATE', 1, 5,
   'Everything in Basic\nWhatsApp hearing reminders\nLegal forms library\nAI chat assistant\nPriority support',
   'court_fee_calculator,documents,office_expenses,transactions,whatsapp_reminders,legal_forms,chat_assistant', 3),

  ('BUSINESS', 'Business', 'For firms', 1499, NULL, 14990, NULL,
   0, 'BUSINESS', 0, 15,
   'Everything in Professional\nMore associate seats\nDedicated onboarding',
   'documents,office_expenses,transactions,legal_forms,court_fee_calculator,whatsapp_reminders,chat_assistant', 4) AS new_plan
ON DUPLICATE KEY UPDATE
  name                  = new_plan.name,
  tagline               = new_plan.tagline,
  price_monthly         = new_plan.price_monthly,
  discount_price        = new_plan.discount_price,
  price_yearly          = new_plan.price_yearly,
  discount_price_yearly = new_plan.discount_price_yearly,
  coming_soon           = new_plan.coming_soon,
  audience              = new_plan.audience,
  most_popular          = new_plan.most_popular,
  associate_limit       = new_plan.associate_limit,
  features              = new_plan.features,
  feature_keys          = new_plan.feature_keys,
  sort_order            = new_plan.sort_order;