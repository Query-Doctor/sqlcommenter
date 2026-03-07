import path from "node:path";
import type { PrismaConfig } from "prisma";

export default {
  earlyAccess: true,
  schema: path.join(import.meta.dirname, "schema.prisma"),
  migrate: {
    async development() {
      return {
        url: process.env.DATABASE_URL!,
      };
    },
  },
} satisfies PrismaConfig;
