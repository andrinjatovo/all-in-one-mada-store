# Architecture decisions

- Keep verified product reviews in dedicated `product_reviews` and `review_reports` tables; purchase eligibility is enforced in the database to prevent forged verified badges.
- Store review image paths in the private `reviews` bucket and render only short-lived signed URLs; customer photos must not become permanently public assets.
- Preserve protected deep links in session storage before login; shared product URLs must return to the intended product after authentication.- Price negotiations live in `price_offers` and are only created/answered/paid through security-definer RPCs; negotiated prices never touch the public product price.
- New orders start with `vendor_acceptance = 'en_attente'`; invoices are served only by `get_order_invoice`, which refuses unaccepted orders and non-parties.
