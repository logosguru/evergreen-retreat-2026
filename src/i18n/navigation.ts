import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// 로케일을 인지하는 네비게이션 API (Link, redirect, usePathname, useRouter)
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
