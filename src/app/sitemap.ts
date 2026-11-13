import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/tools", "/tools/year-end-statement", "/tools/invoice", "/tools/receipt", "/tools/attendance-sheet"];
  return paths.map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: "monthly",
    priority: p === "/tools/year-end-statement" ? 1 : p === "" ? 0.9 : 0.8,
  }));
}
