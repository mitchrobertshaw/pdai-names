import { appUrl } from "../site";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

export function Nav() {
  return (
    <header className="nav">
      <div className="container nav__inner">
        <Brand href="#top" label="pDAI Names, pDAI Name Service: back to the top" />
        <nav className="nav__links" aria-label="Sections">
          <a href="#pulsechain">PulseChain</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav__actions">
          <ThemeToggle />
          <a className="button button--primary button--small" href={appUrl()}>
            Launch app
          </a>
        </div>
      </div>
    </header>
  );
}
