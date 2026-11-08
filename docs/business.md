# Business

The goal is to earn money. The direction is a 3D-twin builder and paid services around it. The audience is Home Assistant owners, not smart-home installation clients: we do not mention installation in publications.

## Free and paid

2026-11-08: the direction is D-052 (the core is open and free; people pay for the service, the cloud and content); this is not an approved price list and not a description of a released package. The standalone editor works; the integration, the card and Pro are not shipped yet. Current readiness is in [status.md](status.md).

| Direction | Contents and open points |
|---|---|
| Free HA package — open, in the catalog (D-052) | Plan and placement editor, card, devices, statistics — everything that already exists. The funnel. License — GPL-3.0 (O-004) |
| Turnkey home model — the main income now | A service from a plan and photo; the Fiverr offer is described below |
| Cloud — credits or subscription | AI plan draft from a photo (O-007) on our own server, renders later. Server and prices undecided |
| Paid content | Packs of quality furniture and models, custom furniture from a photo — from our server by key, outside the open code |
| “Support” key | Optional: early access, priority in replies; no locks on the free part. The former “Pro — a key to features” (D-001) is replaced |

Climate on walls is already implemented in the editor (D-033/D-034). Its earlier mention in the Pro column does not determine whether the future package is paid. Static curtains, an air conditioner and a robot in the catalog do not mean these devices are ready to control.

## Stages

Per D-016 we first finish the standalone editor, then build the package for HA. The sequence and criteria are in the [release plan](free-version.md); current tasks are in [status.md](status.md). Once the free scope is defined, we can plan Pro, a sales page and payment.

The 2026-11-03 estimate of “1.5–2.5 months to the first sale of a Pro key” predates this order and is not used as the current schedule. A new schedule has not been estimated.

## Marketplaces: information as of 2026-11-03

Publication statuses, prices and terms below are kept from the November 3 entry; they were not re-checked during the November 7 documentation review.

### Home Assistant forum
- Article “From a paper plan to a live 3D twin of my flat in Home Assistant”, Dashboards & Frontend section, topic 1032059.
- We do not reveal the whole recipe: the path is described at the level of steps, without details that would let someone replicate the product.

### Facebook, Home Assistant group
- A post with a 60 s video (cursor and captions) and a demand question at the end: “if you want this for your home, write in the comments”. As of 2026-11-03 it is awaiting administrator approval.

### Fiverr
- Gig “I will build a live 3d twin of your home for home assistant”, active. Category Programming & Tech › Electronics Engineering › Embedded Systems & IoT.
- Packages: $125 / 7 days, $295 / 14 days, $595 / 21 days. Fiverr commission 20%. Prices are multiples of $5.
- The portfolio project is filled in (5 images 1600×1200 and a video), published by the owner.
- Withdrawing money to Moldova has not been checked.
- **Scammers.** On 2026-11-03, the launch day, two fake “orders” arrived (new accounts, “I've placed an order”, an `.html` attachment). Inside is a fake Fiverr page that after 7 seconds redirects to `final-payments.com` for “account verification”. Rule: a real order is always visible in Manage Orders; do not open `.html` attachments, send a Report.

### Price competitors
- Seller hired4ucom on Fiverr: $0.10 per sq ft for design, $0.20 with code.

## Payment (O-003)
Before developing payment, check the availability of payment services for the owner in Moldova, the connection terms and the withdrawal of money. The original O-003 discussion considered Lemon Squeezy, Paddle and Gumroad; no service has been chosen yet. The terms of marketplaces and intermediaries need a separate up-to-date check.
