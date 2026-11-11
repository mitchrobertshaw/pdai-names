import { Brand } from "./Brand";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Brand href="#top" label="pDAI Names: back to the top" tagline={false} />
          <p>pDAI Name Service: names for the pDAI community, on PulseChain.</p>
        </div>
        <nav className="footer__links" aria-label="Footer">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
      </div>
      <div className="container footer__small">
        <p>.pdai names never end in .eth.</p>
        <p>
          An independent community project. Not run by, or affiliated with, PulseChain, MakerDAO (now Sky), which made
          the original DAI, or ENS.
        </p>
      </div>
    </footer>
  );
}
