import Link from "next/link";
import { SiteNav } from "@/components/site-nav";

export default function ForbiddenPage() {
  return <><SiteNav /><main><section className="workspace-card"><span className="eyebrow">Forbidden</span><h1>Administrator access required</h1><p>This account does not have permission to open the administration area.</p><Link className="button secondary" href="/">Return home</Link></section></main></>;
}
