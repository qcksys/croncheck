import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		globals: true,
		exclude: [...configDefaults.exclude],
		coverage: {
			enabled: true,
			provider: "v8",
			reportsDirectory: "./coverage/raw/default",
			reporter: ["json", "text", "html"],
			exclude: [
				...(configDefaults.coverage.exclude ?? []),
				"benchmarks",
				"runtime-tests",
				"build/build.ts",
				"src/test-utils",
				"perf-measures",

				// types are compile-time only, so their coverage cannot be measured
				"src/**/types.ts",
				"src/jsx/intrinsic-elements.ts",
				"src/utils/http-status.ts",
			],
		},
		pool: "forks",
	},
});
