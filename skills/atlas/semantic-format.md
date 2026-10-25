# `.atlas/semantic.json`

The meaning layer of an Atlas map. `atlas build` checks it field by field and names the field it can't use, so a mistake shows up as an error to fix, not a broken page.

Every id it mentions must exist in `.atlas/out/skeleton.json`. Module ids look like `web/api/orders` (`<source>/<area>/<module>`). External systems declared in `atlas.config.json` are `ext:<id>`, such as `ext:stripe`.

Every key is optional, but a useful map has `system`, `caps`, a `desc` for every module, and a few `flows`.

```json
{
  "system": {
    "biz": "Acme sells furniture online and bills business customers monthly.",
    "tech": "A Next.js storefront (web) talks to a billing service (billing) over HTTP."
  },
  "caps": [
    {
      "id": "checkout",
      "name": "Checkout",
      "biz": "Turning a cart into a paid order.",
      "rules": ["^web/api/(cart|orders)$", "^billing/core/"]
    }
  ],
  "desc": {
    "ext:stripe": {
      "biz": "Charges the customer's card.",
      "tech": "Payment intents through the stripe SDK, created by web/api/orders."
    },
    "web/api/orders": {
      "biz": "Takes the order once the customer pays.",
      "tech": "Validates the cart, reserves stock, and asks billing for an invoice.",
      "confidence": "verified",
      "anchors": [{ "path": "web/src/app/api/orders/route.ts", "line": 12, "note": "POST handler" }]
    }
  },
  "flows": [
    {
      "id": "place-order",
      "name": "Place an order",
      "biz": "From the pay button to an invoice.",
      "confidence": "verified",
      "steps": [
        {
          "unit": "web/api/orders",
          "text": "Receives the cart and checks stock.",
          "anchor": "web/src/app/api/orders/route.ts:12"
        },
        {
          "unit": "billing/core/invoices",
          "text": "Creates the invoice.",
          "anchor": "billing/lib/invoices.ts:30"
        }
      ]
    }
  ],
  "invariants": [
    {
      "id": "one-invoice-per-order",
      "name": "An order is invoiced once",
      "biz": "Retries must not bill twice.",
      "guard": "test",
      "guardPath": "billing/lib/invoices.test.ts",
      "scope": ["billing/core/invoices"]
    }
  ],
  "decisions": [
    {
      "id": "billing-separate",
      "name": "Billing is its own service",
      "note": "So finance can deploy on its own schedule.",
      "path": "billing/docs/adr/001-separate-service.md",
      "units": ["billing/core/invoices"]
    }
  ]
}
```

## Fields

- **`system`** is a description of the whole project: `biz`, `tech`.
- **`caps`** are capabilities, the first level a reader sees. Each has `id`, `name`, optional `biz` and `tech`, and `rules`, regexes over module ids. A module belongs to the first capability whose rule matches it, and `atlas build` lists the modules none of them claims.
- **`desc`** maps a node id, usually a module or an `ext:` system, to its description:
  - `biz` and `tech` hold the text;
  - `confidence` is `verified`, `inferred` or `generated`;
  - `anchors` are `{ path, line, note }` items, with paths relative to the project folder.

  `atlas build` adds a `describedHash` to each entry. That is how the map knows a description is out of date when its code changes. Leave the field alone, or delete it after rewriting an entry by hand.

- **`flows`** are named paths through existing code. Each has `id`, `name`, optional `biz`, a `confidence`, and `steps`. A step is `{ unit, text, anchor }`, where `unit` is a module id or an `ext:` system and `anchor` is `"path:line"` or `null`.
- **`invariants`** are rules that must not break. Each has `id`, `name`, optional `biz`, a `guard`, a `guardPath` and a `scope`:
  - `guard` says what enforces the rule: `test`, `type`, `partial` or `none`;
  - `guardPath` is the file that does it, or `""`;
  - `scope` lists the module ids the rule covers.

  An invariant may also name a `decision` id.

- **`decisions`** are choices with written evidence. Each has `id`, `name`, an optional `note`, a `path` to the evidence, and `units`, the module ids it shapes.
- **`concepts`** are domain entities. Each has `id`, `name`, `biz`, optional `store` and `confidence`, and `owner`, `writes` and `reads`, which are lists of module ids.
- **`legacy`** and **`legacyStatus`** mark code that is being retired:
  - `legacy` maps a status id to `{ label, note }`;
  - `legacyStatus` maps a module id to a status id.

## Two languages

Any text field (`name`, `biz`, `tech`, `text`, `note`, `label`) can have an English twin with an `_en` suffix, such as `biz_en`. When the project's `language` is `pt`, write Portuguese in the base field and English in the twin. The viewer switches between them.
