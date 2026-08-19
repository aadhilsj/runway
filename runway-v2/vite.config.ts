import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: { tsconfigPaths: true },
  define: {
    __RUNWAY_BUILD_SHA__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.RUNWAY_BUILD_SHA ||
        "development",
    ),
  },
});
