import { expect, it } from "vitest";

import { storeOrderCreateErrors } from "@/lib/store-order-create-errors";

it("assigns unavailable product IDs and existing nested field errors to their draft lines", () => {
  const problem = Object.assign(new Error("store_product_changed"), {
    status: 400,
    payload: {
      errors: [
        {
          context: { product_ids: ["carrot", "basil", "removed", null] },
          fields: { lines: [{ quantity: ["invalid"] }, {}, { unit_price_vnd: ["invalid"] }] },
        },
      ],
    },
  });
  const issues = storeOrderCreateErrors(
    problem,
    ["basil", "mint", "carrot"],
    "Invalid",
    "Invalid quantity",
    "Invalid price",
    "Unavailable product",
    "Stock changed",
  );
  expect(issues.lines).toEqual({
    basil: { quantity: "Invalid quantity", product: "Unavailable product" },
    carrot: { unitPrice: "Invalid price", product: "Unavailable product" },
  });
});
