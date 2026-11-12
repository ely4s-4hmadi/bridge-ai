import { money, poundsToMinor, day } from "./money";

test("formats pence exactly", () => {
  expect(money(3000)).toBe("£30");
  expect(money(-8500)).toBe("−£85");
  expect(money(1550)).toBe("£15.50");
  expect(money(-11500)).toBe("−£115");
  expect(money(null)).toBe("—");
});

test("parses pounds to integer pence without float maths", () => {
  expect(poundsToMinor("100")).toBe(10000);
  expect(poundsToMinor("£0.1")).toBe(10);
  expect(poundsToMinor("12.34")).toBe(1234);
  expect(poundsToMinor("abc")).toBeNull();
  expect(poundsToMinor("-5")).toBeNull();
});

test("formats dates in en-GB", () => {
  expect(day("2026-12-01")).toBe("1 December");
});
