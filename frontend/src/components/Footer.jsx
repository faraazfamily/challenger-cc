export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <img src="/crest-sm.webp" alt="" width="44" height="44" loading="lazy" />
          <div>
            <strong>The Challengers</strong>
            <span>Play Hard. Play Fair. Challenge Everything.</span>
          </div>
        </div>
      </div>
      <div className="footer-copy">The Challengers Cricket Club &copy; {new Date().getFullYear()}</div>
    </footer>
  );
}
