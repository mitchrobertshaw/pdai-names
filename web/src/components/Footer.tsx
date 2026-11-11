import { Brand } from "./Brand";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Brand href="#top" label="HexNS: back to the top" tagline={false} />
          <p>HEX Name Service: names for Hexicans, on PulseChain and Ethereum.</p>
        </div>
        <nav className="footer__links" aria-label="Footer">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
      </div>
      <div className="container footer__small">
        <p>.hex names never end in .eth.</p>
        <p>An independent community project. Not run by, or affiliated with, HEX, PulseChain or ENS.</p>
      </div>
    </footer>
  );
}
