# Architecture decisions

- Keep verified product reviews in dedicated `product_reviews` and `review_reports` tables; purchase eligibility is enforced in the database to prevent forged verified badges.
- Store review image paths in the private `reviews` bucket and render only short-lived signed URLs; customer photos must not become permanently public assets.
- Preserve protected deep links in session storage before login; shared product URLs must return to the intended product after authentication.- Price negotiations live in `price_offers` and are only created/answered/paid through security-definer RPCs; negotiated prices never touch the public product price.
- New orders start with `vendor_acceptance = 'en_attente'`; invoices are served only by `get_order_invoice`, which refuses unaccepted orders and non-parties.
- "Sur commande" orders get their advance/protected split from the `orders_apply_fulfillment` insert trigger, and all money moves only through security-definer RPCs (`vendor_decide_order`, `confirm_delivery`, `_refund_order`, `admin_resolve_order_dispute`); direct client/vendor writes to order money/status columns are blocked by `orders_guard_direct_update`, so every payment path stays atomic and single-release.
- Database payment scenarios live in `tests/db/*.sql` as DO blocks that always end with an exception (full rollback); run them with the SQL tool and read the PASS/FAIL list from the error message.
