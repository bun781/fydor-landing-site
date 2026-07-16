import { InstallGuide } from "@/components/install-guide";
import { SiteFooter, SiteNav } from "@/components/site-nav";

export const metadata = { title: "Install Fydor" };

export default function InstallPage() {
  return (
    <>
      <SiteNav />
      <main><InstallGuide /></main>
      <SiteFooter />
    </>
  );
}
