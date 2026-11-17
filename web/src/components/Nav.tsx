import { appUrl, X_URL } from "../site";
import { Brand } from "./Brand";
import { XIcon } from "./icons";

export function Nav() {
  return (
    <header className="nav">
      <div className="container nav__inner">
        <Brand href="#top" label="pDAI Name Service: back to the top" />
        <nav className="nav__links" aria-label="Sections">
          <a href="#names">Why .pdai</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav__actions">
          <a className="nav__social" href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="pDAI Name Service on X" title="pDAI Name Service on X">
            <XIcon />
          </a>
          <a className="button button--primary button--small" href={appUrl()}>
            Launch app
          </a>
        </div>
      </div>
    </header>
  );
}
