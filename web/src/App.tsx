import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { Messages } from "./components/Messages";
import { Nav } from "./components/Nav";
import { Ownership } from "./components/Ownership";
import { BothChains, Cta, Faq, Features, HowItWorks, Pricing } from "./components/Sections";

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <BothChains />
        <Messages />
        <Features />
        <HowItWorks />
        <Ownership />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
