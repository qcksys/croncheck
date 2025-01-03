import { add, subtract } from "@qcksys/croncheck";
import { describe } from "vitest";

describe("add", () => {
	it("adds 1 + 2 to equal 3", () => {
		expect(add(1, 2)).toBe(3);
	});
});

describe("subtract", () => {
	it("subtract 3 - 2 to equal 1", () => {
		expect(subtract(3, 2)).toBe(1);
	});
});
